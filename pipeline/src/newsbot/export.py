"""DB를 docs/data-contract.md(v2) 형식의 정적 JSON으로 내보낸다."""

import json
import logging
import shutil
from datetime import datetime, timedelta
from pathlib import Path

from . import config

log = logging.getLogger(__name__)

DAY_MIN_IMPORTANCE = 2
DAY_MAX_EVENTS = 40
MAX_SOURCES = 8
# 긴 기간용 월별 파일: 중요한 사건만, 날짜마다 몇 개씩
MONTH_MIN_IMPORTANCE = 4
MONTH_PER_DAY = 5
MONTH_MAX_SOURCES = 3


def _write(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def _event_json(conn, row, story_ids: set[int], max_sources: int = MAX_SOURCES) -> dict:
    sources = conn.execute(
        "SELECT outlet, url, title, lang, published_at FROM articles WHERE event_id = ? ORDER BY published_at LIMIT ?",
        (row["id"], max_sources),
    ).fetchall()
    return {
        "id": str(row["id"]),
        "date": row["date"],
        "title_ko": row["title_ko"],
        "summary_ko": row["summary_ko"],
        "category": row["category"],
        "region": row["region"],
        "importance": row["importance"],
        "outlet_count": row["outlet_count"],
        "story_id": str(row["story_id"]) if row["story_id"] in story_ids else None,
        "sources": [dict(s) for s in sources],
    }


def _stories(conn) -> dict[int, dict]:
    """한 줄이 2개 이상 쓰인 이슈만 내보낸다."""
    rows = conn.execute(
        """SELECT t.story_id, s.title_ko, e.id, e.date, e.category, e.region, e.importance, t.one_line_ko
           FROM story_timeline t JOIN events e ON e.id = t.event_id JOIN stories s ON s.id = t.story_id
           WHERE t.one_line_ko IS NOT NULL AND s.title_ko IS NOT NULL ORDER BY t.story_id, e.date, e.id"""
    ).fetchall()
    out: dict[int, dict] = {}
    for r in rows:
        s = out.setdefault(r["story_id"], {"title": r["title_ko"], "items": []})
        s["items"].append(r)
    return {sid: s for sid, s in out.items() if len(s["items"]) >= 2}


def _brief(sid: int, s: dict) -> dict:
    items = s["items"]
    categories = []
    for it in sorted(items, key=lambda it: -it["importance"]):
        if it["category"] not in categories:
            categories.append(it["category"])
    return {
        "id": str(sid),
        "title_ko": s["title"],
        "categories": categories,
        # 해외 이슈에 국내 대응 사건 하나가 섞여도 해외로 보이도록 과반으로 정한다
        "region": "kr" if sum(it["region"] == "kr" for it in items) * 2 > len(items) else "global",
        "first_date": items[0]["date"],
        "last_date": items[-1]["date"],
        "timeline": [
            {"date": it["date"], "event_id": str(it["id"]), "one_line_ko": it["one_line_ko"],
             "importance": it["importance"]}
            for it in items
        ],
    }


def run(conn, out_dir: Path) -> None:
    if out_dir.exists():
        shutil.rmtree(out_dir)
    stories = _stories(conn)
    story_ids = set(stories)

    days = [r["date"] for r in conn.execute(
        "SELECT DISTINCT date FROM events WHERE title_ko IS NOT NULL AND importance >= ? ORDER BY date",
        (DAY_MIN_IMPORTANCE,),
    )]
    for day in days:
        rows = conn.execute(
            """SELECT * FROM events WHERE date = ? AND title_ko IS NOT NULL AND importance >= ?
               ORDER BY importance DESC, outlet_count DESC, id LIMIT ?""",
            (day, DAY_MIN_IMPORTANCE, DAY_MAX_EVENTS),
        ).fetchall()
        _write(out_dir / "days" / f"{day}.json", {"date": day, "events": [_event_json(conn, r, story_ids) for r in rows]})

    month_events: dict[str, list[dict]] = {}
    for day in days:
        rows = conn.execute(
            """SELECT * FROM events WHERE date = ? AND title_ko IS NOT NULL AND importance >= ?
               ORDER BY importance DESC, outlet_count DESC, id LIMIT ?""",
            (day, MONTH_MIN_IMPORTANCE, MONTH_PER_DAY),
        ).fetchall()
        month_events.setdefault(day[:7], []).extend(
            _event_json(conn, r, story_ids, MONTH_MAX_SOURCES) for r in rows
        )
    for month, events in month_events.items():
        _write(out_dir / "months" / f"{month}.json", {"month": month, "events": events})

    months: dict[str, list[dict]] = {}
    for sid, s in stories.items():
        brief = _brief(sid, s)
        for month in sorted({it["date"][:7] for it in s["items"]}):
            months.setdefault(month, []).append(brief)
        snapshots = conn.execute(
            "SELECT date, status_ko FROM story_snapshots WHERE story_id = ? ORDER BY date", (sid,)
        ).fetchall()
        events = conn.execute(
            f"SELECT * FROM events WHERE id IN ({','.join('?' * len(s['items']))}) ORDER BY date, id",
            [it["id"] for it in s["items"]],
        ).fetchall()
        _write(out_dir / "stories" / f"{sid}.json", {
            **brief,
            "snapshots": [dict(r) for r in snapshots],
            "events": [_event_json(conn, e, story_ids) for e in events],
        })
    for month, briefs in months.items():
        _write(out_dir / "stories" / f"index-{month}.json", briefs)

    now = datetime.now(config.KST)
    _write(out_dir / "meta.json", {
        "generated_at": now.isoformat(timespec="seconds"),
        "available_from": days[0] if days else None,
        "available_to": days[-1] if days else None,
        "last_complete_date": (now.date() - timedelta(days=1)).isoformat(),
        "categories": [{"key": k, "label": v} for k, v in config.CATEGORIES.items()],
        "days": days,
        "months": sorted(month_events),
        "story_months": sorted(months),
    })
    log.info("내보내기: 날짜 %d개, 이슈 %d개 → %s", len(days), len(stories), out_dir)
