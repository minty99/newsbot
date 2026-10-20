"""임베딩과 사건 클러스터링.

기사를 LLM으로 사건 문장 하나로 정규화해 임베딩하고,
새 기사를 최근 CLUSTER_WINDOW_HOURS 안의 기사들과 비교해, 가장 비슷한 기사가
CLUSTER_THRESHOLD 이상이면 그 기사의 사건에 넣고 아니면 새 사건을 만든다. 사건은 같은 날짜(KST) 안에서만 묶는다.
CLUSTER_VERIFY_THRESHOLD 이상인 경계 구간은 판정 모델이 같은 사건인지 확인한 뒤 병합한다.
전체를 다시 묶지 않고 증분으로만 처리한다.
"""

import json
import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta

import numpy as np

from . import config, db, decisions, openrouter

log = logging.getLogger(__name__)


NORMALIZE_SYSTEM = """각 기사가 보도하는 핵심 사건을 한국어 한 문장으로 쓴다. 형식: [누가/어디서] [무엇을 했다/무슨 일이 있었다] [핵심 수치·대상].
제목의 과장, 감탄, 따옴표 인용, 기자 이름, 매체 이름은 빼고 사실만 쓴다. 해설·칼럼이면 다루는 사건을 쓴다."""

NORMALIZE_SCHEMA = openrouter.obj({
    "items": {"type": "array", "items": openrouter.obj({"i": {"type": "integer"}, "event": {"type": "string"}})}
})


def _normalize_batch(rows) -> dict[int, str]:
    user = "\n".join(
        json.dumps({"i": r["id"], "title": r["title"], "desc": r["description"][:600]}, ensure_ascii=False)
        for r in rows
    )
    try:
        result = openrouter.chat_json(NORMALIZE_SYSTEM, user, NORMALIZE_SCHEMA, "event_sentences")
    except Exception:
        log.exception("정규화 실패 (기사 %d건), 다음 실행에서 재시도", len(rows))
        return {}
    ids = {r["id"] for r in rows}
    return {x["i"]: x["event"] for x in result["items"] if x["i"] in ids and x["event"].strip()}


def normalize_pending(conn, batch_size: int = 25) -> int:
    """기사마다 제목·설명을 사건 문장으로 정규화한다. 낚시성 표현과 언어 차이를 없애 임베딩 구분력을 높인다
    (판정 모델로 라벨링한 400쌍에서 AUC: 제목만 0.85, 제목+설명 0.90, 정규화 문장 0.98)."""
    # 계속 실패하는 기사를 매번 다시 시도하지 않도록 보존 기간 안의 기사만 처리한다
    rows = conn.execute(
        "SELECT id, title, description FROM articles WHERE event_text IS NULL AND event_id IS NULL AND published_at >= ?",
        (_retention_cutoff(),),
    ).fetchall()
    if not rows:
        return 0
    batches = [rows[i : i + batch_size] for i in range(0, len(rows), batch_size)]
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = {k: v for d in pool.map(_normalize_batch, batches) for k, v in d.items()}
    conn.executemany("UPDATE articles SET event_text = ? WHERE id = ?", [(v, k) for k, v in results.items()])
    conn.commit()
    log.info("정규화: %d/%d건", len(results), len(rows))
    return len(results)


def embed_pending(conn) -> int:
    rows = conn.execute(
        # 사건에 배정된 기사는 다시 임베딩하지 않는다(보존 기간이 지나 지운 임베딩 포함)
        "SELECT id, event_text FROM articles WHERE embedding IS NULL AND event_text IS NOT NULL AND event_id IS NULL"
    ).fetchall()
    if not rows:
        return 0
    vecs = openrouter.embed([r["event_text"] for r in rows])
    conn.executemany(
        "UPDATE articles SET embedding = ? WHERE id = ?",
        [(db.to_blob(v), r["id"]) for r, v in zip(rows, vecs)],
    )
    conn.commit()
    log.info("임베딩: %d건", len(rows))
    return len(rows)


def _retention_cutoff() -> str:
    return (datetime.now(config.KST) - timedelta(days=config.EMBEDDING_RETENTION_DAYS)).isoformat()


def prune_old(conn) -> int:
    """사건 묶기(48시간)와 이슈 연결(7일)에 필요한 기간이 지난 기사에서 임베딩·설명·정규화 문장을 지워
    DB를 작게 유지한다. 내보내기에는 매체, 링크, 제목, 시각만 쓰인다."""
    cur = conn.execute(
        """UPDATE articles SET embedding = NULL, description = '', event_text = NULL
           WHERE published_at < ? AND (embedding IS NOT NULL OR description != '' OR event_text IS NOT NULL)""",
        (_retention_cutoff(),),
    )
    conn.commit()
    return cur.rowcount


def assign_events(conn) -> tuple[int, int]:
    pending = conn.execute(
        """SELECT id, title, published_at, date, embedding FROM articles
           WHERE event_id IS NULL AND embedding IS NOT NULL ORDER BY published_at"""
    ).fetchall()
    if not pending:
        return 0, 0

    window_start = (
        datetime.fromisoformat(pending[0]["published_at"]) - timedelta(hours=config.CLUSTER_WINDOW_HOURS)
    ).isoformat(timespec="seconds")
    # 비교 대상: 창 안에 활동이 있었던 사건에 속한 기사들
    pool = conn.execute(
        """SELECT a.event_id, a.embedding, e.last_published_at, e.date FROM articles a
           JOIN events e ON e.id = a.event_id WHERE e.last_published_at >= ?""",
        (window_start,),
    ).fetchall()
    pool_events = [r["event_id"] for r in pool]
    pool_vecs = [db.from_blob(r["embedding"]) for r in pool]
    last_seen = {r["event_id"]: r["last_published_at"] for r in pool}
    event_date = {r["event_id"]: r["date"] for r in pool}

    created = joined = 0
    borderline: list[tuple[int, list[int]]] = []  # (새로 만든 사건, 확인할 후보 사건들)
    for art in pending:
        vec = db.from_blob(art["embedding"])
        published = art["published_at"]
        horizon = (datetime.fromisoformat(published) - timedelta(hours=config.CLUSTER_WINDOW_HOURS)).isoformat()
        event_id, candidates = None, []
        if pool_vecs:
            sims = np.stack(pool_vecs) @ vec
            for idx in np.argsort(-sims):
                if sims[idx] < config.CLUSTER_VERIFY_THRESHOLD or len(candidates) >= 3:
                    break
                eid = pool_events[idx]
                # 사건은 같은 날짜 안에서만 묶는다. 다음 날의 후속 보도는 새 사건이 되고 이슈가 흐름을 잇는다.
                if event_date[eid] != art["date"] or last_seen[eid] < horizon or eid in candidates:
                    continue
                if sims[idx] >= config.CLUSTER_THRESHOLD:
                    event_id = eid
                    break
                candidates.append(eid)
        if event_id is None:
            cur = conn.execute(
                "INSERT INTO events (date, last_published_at) VALUES (?, ?)", (art["date"], published)
            )
            event_id = cur.lastrowid
            created += 1
            if candidates:
                borderline.append((event_id, candidates))
        else:
            conn.execute(
                """UPDATE events SET dirty = 1,
                     date = min(date, ?), last_published_at = max(last_published_at, ?) WHERE id = ?""",
                (art["date"], published, event_id),
            )
            joined += 1
        conn.execute("UPDATE articles SET event_id = ? WHERE id = ?", (event_id, art["id"]))
        pool_events.append(event_id)
        pool_vecs.append(vec)
        event_date.setdefault(event_id, art["date"])
        last_seen[event_id] = max(last_seen.get(event_id, published), published)
    conn.commit()
    merged = verify_borderline(conn, borderline)
    log.info("클러스터링: 새 사건 %d개, 바로 합류 %d건, 판정 후 병합 %d건", created - merged, joined, merged)
    return created - merged, joined + merged


def _titles(conn, event_id: int, limit: int = 3) -> list[str]:
    rows = conn.execute(
        "SELECT title FROM articles WHERE event_id = ? ORDER BY published_at LIMIT ?", (event_id, limit)
    ).fetchall()
    return [r["title"] for r in rows]


def same_event(new_title: str, event_titles: list[str]) -> bool | None:
    return decisions.noul(
        {"new_article_title": new_title, "existing_event_titles": event_titles},
        "Does new_article_title report the same specific news event as existing_event_titles "
        "(the same announcement, incident, game, decision, or statement, or a direct follow-up report on it)?",
        true="They describe the same concrete happening.",
        false="They describe different happenings, even if the topic, person, or organization is the same.",
    )


def verify_borderline(conn, borderline: list[tuple[int, list[int]]]) -> int:
    """경계 구간 기사를 판정 모델로 확인해 같은 사건이면 후보 사건에 병합한다. 병합 수를 반환한다."""
    if not borderline:
        return 0
    asks = [
        (bi, ci, _titles(conn, new_id, 1)[0], _titles(conn, cand))
        for bi, (new_id, cands) in enumerate(borderline)
        for ci, cand in enumerate(cands)
    ]
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda a: same_event(a[2], a[3]), asks))
    # 후보는 유사도 순이므로 같은 사건으로 판정된 첫 후보를 고른다
    answers: list[int | None] = [None] * len(borderline)
    for (bi, ci, _, _), ok in zip(asks, results):
        if ok and (answers[bi] is None or ci < answers[bi]):
            answers[bi] = ci

    # 병합 대상이 이미 다른 곳에 병합됐을 수 있으므로 최종 목적지를 따라간다
    redirect: dict[int, int] = {}

    def resolve(eid: int) -> int:
        while eid in redirect:
            eid = redirect[eid]
        return eid

    merged = 0
    for (new_id, cands), match in zip(borderline, answers):
        if match is None:
            continue
        target = resolve(cands[match])
        if target == new_id:
            continue
        conn.execute("UPDATE articles SET event_id = ? WHERE event_id = ?", (target, new_id))
        conn.execute(
            """UPDATE events SET dirty = 1,
                 date = min(date, (SELECT date FROM events WHERE id = ?)),
                 last_published_at = max(last_published_at, (SELECT last_published_at FROM events WHERE id = ?))
               WHERE id = ?""",
            (new_id, new_id, target),
        )
        conn.execute("DELETE FROM events WHERE id = ?", (new_id,))
        redirect[new_id] = target
        merged += 1
    conn.commit()
    return merged


def event_centroids(conn, event_ids: list[int]) -> dict[int, np.ndarray]:
    if not event_ids:
        return {}
    marks = ",".join("?" * len(event_ids))
    rows = conn.execute(
        f"SELECT event_id, embedding FROM articles WHERE event_id IN ({marks}) AND embedding IS NOT NULL", event_ids
    ).fetchall()
    groups: dict[int, list[np.ndarray]] = {}
    for r in rows:
        groups.setdefault(r["event_id"], []).append(db.from_blob(r["embedding"]))
    out = {}
    for eid, vecs in groups.items():
        c = np.mean(vecs, axis=0)
        out[eid] = c / max(np.linalg.norm(c), 1e-9)
    return out
