"""OpenRouter 클라이언트: JSON 스키마 응답 채팅과 임베딩."""

import json
import logging
import time

import httpx
import numpy as np

from . import config

log = logging.getLogger(__name__)

_client: httpx.Client | None = None
usage = {"llm_calls": 0, "embed_calls": 0, "decision_calls": 0, "cost_usd": 0.0}


def _http() -> httpx.Client:
    global _client
    if _client is None:
        _client = httpx.Client(
            base_url=config.OPENROUTER_BASE_URL,
            headers={
                "Authorization": f"Bearer {config.api_key()}",
                "X-Title": "newsbot",
            },
            timeout=httpx.Timeout(120, connect=15),
        )
    return _client


def _post(path: str, payload: dict, attempts: int = 4) -> dict:
    for attempt in range(attempts):
        try:
            res = _http().post(path, json=payload)
            if res.status_code in (429, 500, 502, 503, 504):
                raise httpx.HTTPStatusError(res.text[:200], request=res.request, response=res)
            res.raise_for_status()
            data = res.json()
            if "error" in data:
                raise RuntimeError(f"OpenRouter error: {data['error']}")
            usage["cost_usd"] += (data.get("usage") or {}).get("cost") or 0
            return data
        except (httpx.HTTPError, RuntimeError, json.JSONDecodeError) as e:
            if attempt == attempts - 1:
                raise
            wait = 2**attempt * 2
            log.warning("OpenRouter %s 실패(%s), %ss 후 재시도", path, e, wait)
            time.sleep(wait)
    raise AssertionError("unreachable")


def chat_json(system: str, user: str, schema: dict, name: str) -> dict:
    """strict JSON 스키마로 응답을 받아 dict로 반환한다."""
    payload = {
        "model": config.LLM_MODEL,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "response_format": {
            "type": "json_schema",
            "json_schema": {"name": name, "strict": True, "schema": schema},
        },
        "reasoning": {"effort": "low"},
    }
    for attempt in range(3):
        data = _post("/chat/completions", payload)
        usage["llm_calls"] += 1
        content = data["choices"][0]["message"].get("content") or ""
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            log.warning("JSON 파싱 실패, 재시도 (%d)", attempt + 1)
    raise RuntimeError(f"{name}: LLM이 올바른 JSON을 반환하지 않음")


def embed(texts: list[str], batch_size: int = 64) -> np.ndarray:
    """정규화된 임베딩 행렬(len(texts) x dim)을 반환한다."""
    out = []
    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        data = _post("/embeddings", {"model": config.EMBED_MODEL, "input": batch})
        usage["embed_calls"] += 1
        rows = sorted(data["data"], key=lambda d: d["index"])
        out.extend(r["embedding"] for r in rows)
    mat = np.asarray(out, dtype=np.float32)
    norms = np.linalg.norm(mat, axis=1, keepdims=True)
    return mat / np.clip(norms, 1e-9, None)


def obj(properties: dict, required: list[str] | None = None) -> dict:
    """strict 모드용 object 스키마 헬퍼."""
    return {
        "type": "object",
        "properties": properties,
        "required": required or list(properties),
        "additionalProperties": False,
    }
