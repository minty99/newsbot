"""사건 요약과 분류: dirty 사건마다 한국어 제목·요약, 카테고리, 지역, 중요도를 만든다."""

import json
import logging
from concurrent.futures import ThreadPoolExecutor

from . import config, openrouter

log = logging.getLogger(__name__)

SYSTEM = """너는 바빠서 뉴스를 못 보는 한국인 독자를 위한 뉴스 편집자다.
각 사건은 같은 일을 다룬 기사들의 제목과 RSS 설명 묶음이다. 제목이 과장되거나 설명과 다르면 설명에 적힌 사실을 따른다. 사건마다 다음을 만든다.

- title_ko: 30자 내외 한국어 헤드라인. 핵심 사실을 담고 낚시성 표현, 따옴표 남용, [속보] 같은 말머리는 쓰지 않는다.
- summary_ko: 한두 문장(최대 120자)의 한국어 요약. 기사에 있는 사실만 쓰고 추측이나 평가를 더하지 않는다.
  숫자, 이름, 날짜는 기사에 나온 그대로 쓴다. 외국 인물·지명은 통용되는 한국어 표기를 쓴다.
- category: politics(정치·북한·외교), economy(경제·산업·금융·부동산), society(사건사고·노동·교육·환경·보건), world(해외 정세·국제), tech(IT·과학), culture(문화·연예·생활·여행), sports(스포츠) 중 하나.
  해외에서 일어난 일이라도 경제, 기술, 스포츠 사건이면 해당 분야를 고른다. world는 해외 정치·외교·분쟁·재난 등에 쓴다.
- region: 한국(한국 정부, 기업, 국민, 한반도)과 직접 관련되면 kr, 아니면 global.
- importance: 한국 독자가 놓치면 아쉬울 정도.
  5 = 나라 전체나 세계에 큰 파장(대통령·정부의 중대 결정, 기준금리 결정, 전쟁·대형 참사, 시장 급변)
  4 = 주요 정책·외교·선거·대기업·국제 정세의 의미 있는 진전
  3 = 알아두면 좋은 뉴스
  2 = 일반 뉴스, 지역·개별 사건, 단발성 기업 소식
  1 = 사소하거나 홍보성인 소식
  0 = 뉴스가 아님(사설, 칼럼, 기고, 인터뷰 연재, 만평, 퀴즈, 광고성 행사 안내, 운세, 단순 날씨)
"""

SCHEMA = openrouter.obj({
    "events": {"type": "array", "items": openrouter.obj({
        "id": {"type": "integer"},
        "title_ko": {"type": "string"},
        "summary_ko": {"type": "string"},
        "category": {"type": "string", "enum": list(config.CATEGORIES)},
        "region": {"type": "string", "enum": ["kr", "global"]},
        "importance": {"type": "integer", "enum": [0, 1, 2, 3, 4, 5]},
    })}
})

MAX_ARTICLES = 6


def _event_payload(conn, event_id: int) -> dict:
    rows = conn.execute(
        "SELECT outlet, title, description, category_hint FROM articles WHERE event_id = ? ORDER BY published_at",
        (event_id,),
    ).fetchall()
    # 매체가 겹치지 않게 앞에서부터 고른다
    picked, seen = [], set()
    for r in rows:
        if r["outlet"] not in seen:
            picked.append(r)
            seen.add(r["outlet"])
    for r in rows:
        if len(picked) >= MAX_ARTICLES:
            break
        if r not in picked:
            picked.append(r)
    return {
        "id": event_id,
        "outlets": len(seen),
        "hints": sorted({r["category_hint"] for r in rows if r["category_hint"]}),
        "articles": [
            {"outlet": r["outlet"], "title": r["title"], "desc": r["description"]} for r in picked[:MAX_ARTICLES]
        ],
    }


def final_importance(llm_importance: int, outlets: int) -> int:
    """LLM 판단에 여러 매체가 다뤘다는 객관적 신호를 더한다."""
    if llm_importance == 0:
        return 0
    boost = 1 if outlets >= 4 else 0
    return min(5, llm_importance + boost)


def _summarize_batch(payloads: list[dict]) -> list[dict]:
    user = "\n".join(
        json.dumps({"id": p["id"], "feed_hints": p["hints"], "articles": p["articles"]}, ensure_ascii=False)
        for p in payloads
    )
    try:
        result = openrouter.chat_json(SYSTEM, user, SCHEMA, "event_summaries")
    except Exception:
        log.exception("요약 실패 (사건 %d개), 다음 실행에서 재시도", len(payloads))
        return []
    return result["events"]


def run(conn, batch_size: int = 10) -> int:
    ids = [r["id"] for r in conn.execute("SELECT id FROM events WHERE dirty = 1 ORDER BY id")]
    if not ids:
        return 0
    payloads = [_event_payload(conn, i) for i in ids]
    by_id = {p["id"]: p for p in payloads}
    batches = [payloads[i : i + batch_size] for i in range(0, len(payloads), batch_size)]
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = [e for batch in pool.map(_summarize_batch, batches) for e in batch]

    done = 0
    for e in results:
        p = by_id.get(e["id"])
        if not p:
            continue
        conn.execute(
            """UPDATE events SET title_ko = ?, summary_ko = ?, category = ?, region = ?, importance = ?,
                 outlet_count = ?, dirty = 0 WHERE id = ?""",
            (e["title_ko"], e["summary_ko"], e["category"], e["region"],
             final_importance(e["importance"], p["outlets"]), p["outlets"], e["id"]),
        )
        done += 1
    conn.commit()
    log.info("요약: %d/%d개 사건", done, len(ids))
    return done
