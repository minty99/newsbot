import sqlite3

import numpy as np

from . import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY,
    url TEXT NOT NULL UNIQUE,
    outlet TEXT NOT NULL,
    lang TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',   -- RSS 설명만. 기사 본문은 저장하지 않는다.
    category_hint TEXT,
    published_at TEXT NOT NULL,             -- ISO 8601, KST
    date TEXT NOT NULL,                     -- KST YYYY-MM-DD
    event_text TEXT,                        -- LLM이 정규화한 사건 문장. 임베딩 입력
    embedding BLOB,                         -- float16. 오래된 것은 지운다
    event_id INTEGER REFERENCES events(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_articles_event ON articles(event_id);
CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published_at);

CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY,
    date TEXT NOT NULL,
    last_published_at TEXT NOT NULL,
    title_ko TEXT,
    summary_ko TEXT,
    category TEXT,
    region TEXT,
    importance INTEGER,
    story_id INTEGER REFERENCES stories(id),
    story_checked INTEGER NOT NULL DEFAULT 0,
    outlet_count INTEGER NOT NULL DEFAULT 1,
    -- 기사 묶음이 바뀌어 다시 요약해야 하면 1
    dirty INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
CREATE INDEX IF NOT EXISTS idx_events_last ON events(last_published_at);

CREATE TABLE IF NOT EXISTS stories (
    id INTEGER PRIMARY KEY,
    title_ko TEXT                           -- 처음 갱신할 때 정하고 바꾸지 않는다
);

-- 이슈에 붙은 사건과 그날의 한 줄. one_line_ko가 NULL이면 아직 갱신 전이다. 한 번 쓰면 고정.
CREATE TABLE IF NOT EXISTS story_timeline (
    event_id INTEGER PRIMARY KEY REFERENCES events(id),
    story_id INTEGER NOT NULL REFERENCES stories(id),
    one_line_ko TEXT
);

-- 그날 기준 이슈 상태 요약. 같은 날 사건이 더 붙으면 그날 것을 덮어쓴다.
CREATE TABLE IF NOT EXISTS story_snapshots (
    story_id INTEGER NOT NULL REFERENCES stories(id),
    date TEXT NOT NULL,
    status_ko TEXT NOT NULL,
    PRIMARY KEY (story_id, date)
);
"""


def connect() -> sqlite3.Connection:
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(config.DB_PATH, timeout=30, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    # DB 파일 하나만 state 브랜치에 저장하므로 WAL 대신 기본 저널 모드를 쓴다
    conn.execute("PRAGMA journal_mode=DELETE")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript(SCHEMA)
    return conn


# DB 파일을 작게 유지하려고 float16으로 저장한다(코사인 유사도에는 충분한 정밀도)
def to_blob(vec: np.ndarray) -> bytes:
    return np.asarray(vec, dtype=np.float16).tobytes()


def from_blob(blob: bytes) -> np.ndarray:
    return np.frombuffer(blob, dtype=np.float16).astype(np.float32)
