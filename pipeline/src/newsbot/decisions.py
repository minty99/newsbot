"""OpenRouter Decisions API(/api/alpha/decisions)로 예/아니오 확률을 받는다.

config.DECISION_MODELS를 순서대로 시도하고, 앞 모델이 실패하면 다음 모델을 쓴다.
모델마다 확률 분포가 달라서 기준값도 모델별로 둔다.
"""

import logging
import time

import httpx

from . import config, openrouter

log = logging.getLogger(__name__)

URL = "https://openrouter.ai/api/alpha/decisions"
_client: httpx.Client | None = None


def _http() -> httpx.Client:
    global _client
    if _client is None:
        _client = httpx.Client(headers={"Authorization": f"Bearer {config.api_key()}"}, timeout=60)
    return _client


def _ask(model: str, state: dict, question: dict, attempts: int = 2) -> float:
    for attempt in range(attempts):
        try:
            res = _http().post(URL, json={"model": model, "state": state, "questions": {"q": question}})
            res.raise_for_status()
            data = res.json()
            answer = data["answers"]["q"]
            if answer.get("type") != "noul":
                raise ValueError(f"예상하지 못한 응답 형식: {answer.get('type')}")
            openrouter.usage["decision_calls"] += 1
            openrouter.usage["cost_usd"] += (data.get("usage") or {}).get("cost") or 0
            return float(answer["noul"])
        except (httpx.HTTPError, KeyError, ValueError) as e:
            if attempt == attempts - 1:
                raise
            log.warning("%s 판정 실패(%s), 재시도", model, e)
            time.sleep(2)
    raise AssertionError("unreachable")


def noul(state: dict, instructions: str, true: str, false: str) -> bool | None:
    """조건이 참이면 True, 거짓이면 False, 모든 모델이 실패하면 None."""
    question = {"type": "noul", "instructions": instructions, "criteria": {"true": true, "false": false}}
    for model, threshold in config.DECISION_MODELS:
        try:
            return _ask(model, state, question) >= threshold
        except Exception as e:
            log.warning("%s 사용 불가(%s), 다음 모델로", model, e)
    return None
