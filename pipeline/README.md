# newsbot pipeline

RSS 수집 → 사건 문장 정규화 → 임베딩 → 사건 묶기 → 요약·분류 → 이슈 연결·갱신 → 정적 JSON 내보내기.
LLM은 이 파이프라인(cron)에서만 호출한다. 모두 OpenRouter를 쓴다. 내보내는 형식은 [`../docs/data-contract.md`](../docs/data-contract.md)를 따른다.

## 실행

```bash
export OPENROUTER_API_KEY=...
uv run newsbot run                          # 새 기사 처리 (처음 실행 시 약 5분, 약 $0.15)
uv run newsbot export ../web/public/data    # 웹이 읽는 JSON 생성
```

운영에서는 GitHub Actions가 매시간 둘을 실행하고 웹을 빌드해 배포한다(`../.github/workflows/update.yml`).
작업용 DB(`data/newsbot.db`)는 히스토리 없는 `state` 브랜치에 파일 하나로 저장된다.

## 모델

| 용도 | 모델 | 설정 |
|---|---|---|
| 사건 문장 정규화, 사건 요약, 이슈 한 줄·상태 | `openai/gpt-6-luna` | `LLM_MODEL` |
| 임베딩 | `baai/bge-m3` | `EMBED_MODEL` |
| 같은 사건인지, 같은 이슈인지 (예/아니오 확률) | `typesafe/jev-1.14`, 실패 시 `openai/gpt-6-luna-decisions` | `DECISION_MODELS` |

판정 모델은 OpenRouter Decisions API를 쓰고 모델마다 기준값이 다르다. 모델을 바꾸면 기준값도 다시 맞춘다.

## 구조 (`src/newsbot/`)

| 파일 | 역할 |
|---|---|
| `ingest.py` | `feeds.yaml`의 피드 수집. 제목, RSS 설명(최대 1,000자), URL만 저장(본문 저장 안 함). 날짜는 KST |
| `cluster.py` | 기사마다 LLM으로 "누가 무엇을" 사건 문장을 만들어 임베딩. 같은 날짜 안에서 유사도 0.65 이상은 바로 묶고 0.55~0.65는 판정 모델로 확인. 8일 지난 기사는 임베딩·설명·정규화 문장을 지움 |
| `summarize.py` | 사건별 한국어 제목·요약, 카테고리, 국내/해외, 중요도(0~5, 0은 사설·칼럼 등). 매체 4곳 이상이면 +1 |
| `stories.py` | 중요도 3 이상 사건을 최근 7일의 이슈·사건과 비교해 판정 모델로 연결. 새 사건마다 그날의 한 줄(고정)과 그날 기준 상태(스냅샷)만 새로 씀 |
| `decisions.py` | 판정 모델 호출과 대체 모델 처리 |
| `export.py` | 날짜별 사건, 월별 이슈 목록, 이슈 상세(스냅샷 포함) JSON 생성 |

설정값(모델, 기준값)은 `config.py`.
