import os
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = Path(os.environ.get("NEWSBOT_DATA_DIR", ROOT / "data"))
DB_PATH = DATA_DIR / "newsbot.db"
FEEDS_PATH = ROOT / "feeds.yaml"

KST = ZoneInfo("Asia/Seoul")

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
LLM_MODEL = os.environ.get("NEWSBOT_LLM_MODEL", "openai/gpt-6-luna")
EMBED_MODEL = os.environ.get("NEWSBOT_EMBED_MODEL", "baai/bge-m3")
EMBED_DIM = 1024
# 예/아니오 판정 모델(OpenRouter Decisions API)과 참으로 볼 확률 기준값. 앞에서부터 시도한다.
# 버전이 바뀌면 확률 분포도 바뀌므로 날짜가 붙은 버전으로 고정하고, 바꿀 때 기준값을 다시 맞춘다.
DECISION_MODELS = [
    ("typesafe/jev-1.14-20261014", 0.5),
    ("openai/gpt-6-luna-decisions-20261006", 0.7),
]

# 같은 사건으로 바로 묶는 기준. 정규화 문장 임베딩끼리, 새 기사와 사건 안 가장 가까운 기사의 코사인 유사도.
CLUSTER_THRESHOLD = float(os.environ.get("NEWSBOT_CLUSTER_THRESHOLD", "0.65"))
# 이 구간(이상, CLUSTER_THRESHOLD 미만)은 판정 모델이 같은 사건인지 확인한 뒤 합친다.
CLUSTER_VERIFY_THRESHOLD = 0.55
# 이 시간 안에 기사가 추가된 사건만 새 기사와 비교한다.
CLUSTER_WINDOW_HOURS = 48
# 이슈 연결 후보로 볼 기간과 최소 유사도
STORY_WINDOW_DAYS = 7
STORY_CANDIDATE_SIM = 0.5
# 이 기간이 지난 기사 임베딩은 지운다(이슈 연결 기간 + 여유)
EMBEDDING_RETENTION_DAYS = STORY_WINDOW_DAYS + 1
# 이슈 연결을 시도할 최소 중요도
STORY_MIN_IMPORTANCE = 3

CATEGORIES = {
    "politics": "정치",
    "economy": "경제",
    "society": "사회",
    "world": "국제",
    "tech": "IT·과학",
    "culture": "문화·생활",
    "sports": "스포츠",
}


def api_key() -> str:
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        raise RuntimeError("OPENROUTER_API_KEY 환경 변수가 필요합니다")
    return key
