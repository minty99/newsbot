"""newsbot 명령줄.

  newsbot run            수집 → 정규화·임베딩 → 사건 묶기 → 요약 → 이슈 연결·갱신 (한 번)
  newsbot export <dir>   웹이 읽는 정적 JSON 내보내기 (docs/data-contract.md)
"""

import argparse
import logging
import time
from pathlib import Path

from . import cluster, db, export, ingest, openrouter, stories, summarize


def run_once() -> None:
    started = time.monotonic()
    conn = db.connect()
    ingest.run(conn)
    cluster.normalize_pending(conn)
    cluster.embed_pending(conn)
    cluster.assign_events(conn)
    summarize.run(conn)
    stories.run(conn)
    pruned = cluster.prune_old(conn)
    conn.execute("VACUUM")
    logging.info(
        "완료 %.0fs, LLM 호출 %d회, 판정 호출 %d회, 임베딩 호출 %d회, 정리한 오래된 기사 %d건, 비용 $%.4f",
        time.monotonic() - started,
        openrouter.usage["llm_calls"],
        openrouter.usage["decision_calls"],
        openrouter.usage["embed_calls"],
        pruned,
        openrouter.usage["cost_usd"],
    )


def main() -> None:
    parser = argparse.ArgumentParser(prog="newsbot")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("run")
    exp = sub.add_parser("export")
    exp.add_argument("out_dir", type=Path)
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)

    if args.cmd == "run":
        run_once()
    elif args.cmd == "export":
        export.run(db.connect(), args.out_dir)
