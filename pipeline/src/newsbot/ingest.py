"""RSS 수집: 피드를 받아 제목, 설명, URL만 articles에 저장한다."""

import html
import logging
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import feedparser
import httpx
import yaml

from . import config

log = logging.getLogger(__name__)

# 사건으로 볼 수 없는 공지성 기사
NOISE_TITLE = re.compile(r"^\s*[\[【(<]\s*(인사|부고|게시판|포토|사진|그래픽|표|알림|오늘의 날씨|날씨|운세|오늘의 운세|모멘트|영상)\s*[\]】)>]")
TAG = re.compile(r"<[^>]+>")
SPACE = re.compile(r"\s+")
# 일부 피드에 섞여 오는 일본어 번역판 기사(가나 문자)
FOREIGN_SCRIPT = re.compile(r"[\u3040-\u30ff]")
# RSS 설명은 피드가 주는 만큼 저장한다. 본문 전체를 넣는 피드도 있어 상한을 둔다.
DESCRIPTION_LIMIT = 1000
# 너무 오래된 기사는 RSS에 남아 있어도 받지 않는다
MAX_AGE = timedelta(days=3)


def load_feeds() -> list[dict]:
    with open(config.FEEDS_PATH, encoding="utf-8") as f:
        return yaml.safe_load(f)["feeds"]


def clean(text: str | None, limit: int) -> str:
    text = SPACE.sub(" ", html.unescape(TAG.sub(" ", text or ""))).strip()
    return text[:limit]


def description(entry) -> str:
    """RSS 설명(summary). 비어 있으면 content로 대신한다(조선일보처럼 설명을 content에 넣는 피드)."""
    text = clean(entry.get("summary"), DESCRIPTION_LIMIT)
    if not text and entry.get("content"):
        text = clean(entry["content"][0].get("value"), DESCRIPTION_LIMIT)
    return text


def published_kst(entry) -> datetime | None:
    parsed = entry.get("published_parsed") or entry.get("updated_parsed")
    if not parsed:
        return None
    # feedparser는 struct_time을 UTC로 정규화해 준다
    return datetime(*parsed[:6], tzinfo=timezone.utc).astimezone(config.KST)


def fetch(feed: dict) -> list[dict]:
    try:
        res = httpx.get(feed["url"], timeout=20, follow_redirects=True, headers={"User-Agent": "Mozilla/5.0 (newsbot)"})
        res.raise_for_status()
    except httpx.HTTPError as e:
        log.warning("피드 실패 %s: %s", feed["url"], e)
        return []
    parsed = feedparser.parse(res.content)
    now = datetime.now(config.KST)
    items = []
    for entry in parsed.entries:
        url, title = entry.get("link"), clean(entry.get("title"), 300)
        published = published_kst(entry)
        if not url or not title or not published or NOISE_TITLE.search(title) or FOREIGN_SCRIPT.search(title):
            continue
        if published > now + timedelta(hours=1) or now - published > MAX_AGE:
            continue
        items.append({
            "url": url.strip(),
            "outlet": feed["outlet"],
            "lang": feed["lang"],
            "title": title,
            "description": description(entry),
            "category_hint": feed.get("category_hint"),
            "published_at": published.isoformat(timespec="seconds"),
            "date": published.date().isoformat(),
        })
    return items


def run(conn) -> int:
    feeds = load_feeds()
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(fetch, feeds))
    inserted = 0
    for items in results:
        for item in items:
            cur = conn.execute(
                """INSERT OR IGNORE INTO articles
                   (url, outlet, lang, title, description, category_hint, published_at, date)
                   VALUES (:url, :outlet, :lang, :title, :description, :category_hint, :published_at, :date)""",
                item,
            )
            inserted += cur.rowcount
    conn.commit()
    log.info("수집: 피드 %d개, 새 기사 %d건", len(feeds), inserted)
    return inserted
