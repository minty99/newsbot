"""이슈(여러 날에 걸친 사건 흐름) 연결과 갱신.

중요도 STORY_MIN_IMPORTANCE 이상인 새 사건마다 최근 STORY_WINDOW_DAYS일 안의
이슈와 아직 이슈가 없는 이전 날짜의 사건 중 비슷한 것을 후보로 뽑고,
판정 모델이 그 흐름을 잇는다고 본 후보에 연결한다. 날짜 순서대로 처리한다.

이슈 갱신은 같은 일이 언제 봐도 같은 문장이 되도록 증분으로 한다. 새 사건마다
그날의 한 줄(이후 고정)과 그날 기준 상태(스냅샷)만 새로 쓰고, 이슈 이름은 처음 한 번만 정한다.
"""

import json
import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from itertools import groupby

import numpy as np

from . import cluster, config, decisions, openrouter

log = logging.getLogger(__name__)

UPDATE_SYSTEM = """너는 바빠서 뉴스를 못 보는 한국인 독자를 위한 뉴스 편집자다.
하나의 이슈에 새 사건이 더해졌다. 지금까지의 흐름(고정된 한 줄들)과 직전 상태, 새 사건이 주어진다.
- one_line_ko: 새 사건에 그날 무엇이 있었는지 25자 내외 한 줄. 앞의 한 줄들과 겹치지 않게 새로 생긴 일만 쓴다.
- status_ko: 새 사건까지 반영한 as_of 날짜 기준 상태를 2~3문장(최대 200자)으로. 주어진 사실만 쓴다.
  as_of 이후의 일은 알 수 없으므로 예측하거나 단정하지 않는다. 문장 앞에 연·월·일을 붙이지 않는다.
- title_ko: story_title이 비어 있을 때만 채운다(20자 내외, 특정 날의 결과가 아니라 사안 자체의 이름.
  예: "한국은행 금리 인하 행보", "가자지구 휴전 협상"). story_title이 있으면 빈 문자열."""

UPDATE_SCHEMA = openrouter.obj({
    "one_line_ko": {"type": "string"},
    "status_ko": {"type": "string"},
    "title_ko": {"type": "string"},
})

MAX_CANDIDATES = 5


def _describe_event(row) -> str:
    return f"({row['date']}) {row['title_ko']} — {row['summary_ko']}"


def _story_label(conn, story_id: int) -> str:
    story = conn.execute("SELECT title_ko FROM stories WHERE id = ?", (story_id,)).fetchone()
    events = conn.execute(
        "SELECT date, title_ko FROM events WHERE story_id = ? ORDER BY date DESC LIMIT 3", (story_id,)
    ).fetchall()
    recent = " / ".join(f"{e['date']} {e['title_ko']}" for e in events)
    return f"[이슈] {story['title_ko'] or ''} — 최근: {recent}"


def same_issue(earlier: str, later: str) -> bool | None:
    return decisions.noul(
        {"earlier": earlier, "later_event": later},
        "Is later_event a development of the same specific matter as earlier (for example the next stage of the "
        "same negotiation, the investigation of the same incident, the processing of the same bill, or a decision "
        "following the same statement)?",
        true="Both belong to one concrete matter unfolding over time.",
        false="They are different matters that only share a field, topic, country, or person.",
    )


def _first_match(q: dict) -> int | None:
    """후보는 유사도 순이므로 같은 이슈로 판정된 첫 후보를 고른다."""
    for ci, label in enumerate(q["labels"]):
        if same_issue(label, q["text"]):
            return ci
    return None


def link_events(conn) -> int:
    new_events = conn.execute(
        """SELECT * FROM events WHERE story_checked = 0 AND dirty = 0 AND importance >= ?
           ORDER BY date, id""",
        (config.STORY_MIN_IMPORTANCE,),
    ).fetchall()
    linked = 0
    for day, group in groupby(new_events, key=lambda r: r["date"]):
        group = list(group)
        since = (date.fromisoformat(day) - timedelta(days=config.STORY_WINDOW_DAYS)).isoformat()
        # 후보: 이전 날짜의 중요한 사건(이슈가 있으면 이슈 단위로)
        pool = conn.execute(
            """SELECT id, story_id FROM events
               WHERE date >= ? AND date < ? AND importance >= ? AND dirty = 0""",
            (since, day, config.STORY_MIN_IMPORTANCE),
        ).fetchall()
        if not pool:
            conn.executemany("UPDATE events SET story_checked = 1 WHERE id = ?", [(e["id"],) for e in group])
            continue
        centroids = cluster.event_centroids(conn, [r["id"] for r in pool] + [e["id"] for e in group])
        # 임베딩이 지워진 오래된 사건은 후보에서 뺀다
        pool = [r for r in pool if r["id"] in centroids]
        group_with_vec = [e for e in group if e["id"] in centroids]
        # 후보 키: ("story", id) 또는 ("event", id)
        keys, vecs = [], []
        story_members: dict[int, list[np.ndarray]] = {}
        for r in pool:
            if r["story_id"]:
                story_members.setdefault(r["story_id"], []).append(centroids[r["id"]])
            else:
                keys.append(("event", r["id"]))
                vecs.append(centroids[r["id"]])
        for sid, members in story_members.items():
            c = np.mean(members, axis=0)
            keys.append(("story", sid))
            vecs.append(c / max(np.linalg.norm(c), 1e-9))
        questions = []
        mat = np.stack(vecs) if vecs else np.zeros((0, config.EMBED_DIM), dtype=np.float32)
        for e in group_with_vec:
            sims = mat @ centroids[e["id"]]
            top = [i for i in np.argsort(-sims)[:MAX_CANDIDATES] if sims[i] >= config.STORY_CANDIDATE_SIM]
            if not top:
                continue
            labels = []
            for i in top:
                kind, kid = keys[i]
                if kind == "story":
                    labels.append(_story_label(conn, kid))
                else:
                    row = conn.execute("SELECT * FROM events WHERE id = ?", (kid,)).fetchone()
                    labels.append(_describe_event(row))
            questions.append({"event": e, "text": _describe_event(e), "labels": labels, "keys": [keys[i] for i in top]})

        with ThreadPoolExecutor(max_workers=8) as ex:
            answers = list(ex.map(_first_match, questions))

        for q, match in zip(questions, answers):
            if match is None:
                continue
            kind, kid = q["keys"][match]
            if kind == "story":
                story_id = kid
            else:
                # 같은 날 다른 사건이 먼저 이 사건으로 이슈를 만들었을 수 있다
                existing = conn.execute("SELECT story_id FROM events WHERE id = ?", (kid,)).fetchone()["story_id"]
                story_id = existing or conn.execute("INSERT INTO stories DEFAULT VALUES").lastrowid
                _attach(conn, kid, story_id)
            _attach(conn, q["event"]["id"], story_id)
            linked += 1
        conn.executemany("UPDATE events SET story_checked = 1 WHERE id = ?", [(e["id"],) for e in group])
        conn.commit()
    conn.commit()
    log.info("이슈 연결: 사건 %d개 검사, %d개 연결", len(new_events), linked)
    return linked


def _attach(conn, event_id: int, story_id: int) -> None:
    """사건을 이슈에 붙이고 한 줄을 쓸 차례로 표시한다(one_line_ko NULL). 이미 붙어 있으면 그대로 둔다."""
    conn.execute("UPDATE events SET story_id = ? WHERE id = ?", (story_id, event_id))
    conn.execute("INSERT OR IGNORE INTO story_timeline (event_id, story_id) VALUES (?, ?)", (event_id, story_id))


def _load(conn, story_id: int) -> dict:
    title = conn.execute("SELECT title_ko FROM stories WHERE id = ?", (story_id,)).fetchone()["title_ko"]
    rows = conn.execute(
        """SELECT e.id, e.date, e.title_ko, e.summary_ko, t.one_line_ko FROM story_timeline t
           JOIN events e ON e.id = t.event_id WHERE t.story_id = ? ORDER BY e.date, e.id""",
        (story_id,),
    ).fetchall()
    snaps = conn.execute(
        "SELECT date, status_ko FROM story_snapshots WHERE story_id = ? ORDER BY date", (story_id,)
    ).fetchall()
    return {
        "id": story_id,
        "title": title,
        "lines": [{"date": r["date"], "line": r["one_line_ko"]} for r in rows if r["one_line_ko"]],
        "pending": [dict(r) for r in rows if not r["one_line_ko"]],
        "snapshots": {r["date"]: r["status_ko"] for r in snaps},
    }


def _update_story(story: dict) -> list[dict]:
    """대기 중인 사건을 날짜순으로 하나씩 반영한다. 각 결과는 그 사건의 한 줄과 그날 기준 상태."""
    results = []
    lines, snapshots, title = list(story["lines"]), dict(story["snapshots"]), story["title"]
    for ev in story["pending"]:
        before = [d for d in snapshots if d <= ev["date"]]
        payload = {
            "story_title": title or "",
            "as_of": ev["date"],
            # 그날 이후의 흐름은 보여주지 않는다
            "timeline": [x for x in lines if x["date"] <= ev["date"]],
            "previous_status": snapshots[max(before)] if before else "",
            "new_event": {"title": ev["title_ko"], "summary": ev["summary_ko"]},
        }
        try:
            out = openrouter.chat_json(
                UPDATE_SYSTEM, json.dumps(payload, ensure_ascii=False), UPDATE_SCHEMA, "story_update"
            )
        except Exception:
            log.exception("이슈 %d 갱신 실패, 다음 실행에서 재시도", story["id"])
            break
        title = title or out["title_ko"].strip() or ev["title_ko"]
        lines = sorted(lines + [{"date": ev["date"], "line": out["one_line_ko"]}], key=lambda x: x["date"])
        snapshots[ev["date"]] = out["status_ko"]
        results.append({"event_id": ev["id"], "date": ev["date"], "title": title, **out})
    return results


def update_pending(conn) -> int:
    ids = [r["story_id"] for r in conn.execute(
        "SELECT DISTINCT story_id FROM story_timeline WHERE one_line_ko IS NULL"
    )]
    # DB 읽기는 메인 스레드에서 끝내고 LLM 호출만 병렬로 한다(이슈 안에서는 순서대로)
    stories = [_load(conn, sid) for sid in ids]
    with ThreadPoolExecutor(max_workers=8) as ex:
        all_results = list(ex.map(_update_story, stories))
    done = 0
    for story, results in zip(stories, all_results):
        for r in results:
            conn.execute("UPDATE stories SET title_ko = coalesce(title_ko, ?) WHERE id = ?", (r["title"], story["id"]))
            conn.execute("UPDATE story_timeline SET one_line_ko = ? WHERE event_id = ?", (r["one_line_ko"], r["event_id"]))
            conn.execute(
                "INSERT OR REPLACE INTO story_snapshots (story_id, date, status_ko) VALUES (?, ?, ?)",
                (story["id"], r["date"], r["status_ko"]),
            )
            done += 1
    conn.commit()
    log.info("이슈 갱신: 이슈 %d개, 사건 %d개 반영", len(ids), done)
    return done


def run(conn) -> None:
    link_events(conn)
    update_pending(conn)
