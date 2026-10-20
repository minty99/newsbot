# newsbot 데이터 계약 v2 (pipeline → 정적 JSON → web)

서버도 API도 없다. pipeline의 `newsbot export <dir>`가 정적 JSON을 만들고, web은 정적 사이트(Next.js `output: "export"`)로 빌드되어 이 파일들을 브라우저에서 `fetch`한다.
배포 시 export 위치는 `web/public/data/`이고, 브라우저에서는 `/data/...`로 읽는다.

## 원칙
- LLM은 cron(pipeline)에서만 호출한다. web은 받은 문장을 고르고 배치만 한다(LLM 호출 없음).
- 같은 사건은 어느 기간에서 보든 같은 문장으로 보인다. 사건 요약과 이슈 타임라인의 한 줄은 고정이다.
- 기사 본문은 저장하거나 제공하지 않는다. 원문 제목과 링크만 보여준다.
- 날짜는 KST `YYYY-MM-DD`, 시각은 ISO 8601(+09:00) 문자열.

## 카테고리 (고정)
politics 정치 · economy 경제 · society 사회 · world 국제 · tech IT·과학 · culture 문화·생활 · sports 스포츠

## 파일

### `/data/meta.json`
```ts
interface Meta {
  generated_at: string;        // 마지막 export 시각
  available_from: string;      // 데이터가 있는 첫 날짜
  available_to: string;        // 데이터가 있는 마지막 날짜(오늘, 진행 중일 수 있음)
  last_complete_date: string;  // 하루가 끝난 마지막 날짜(보통 어제). 프리셋 "어제"의 기준
  categories: { key: Category; label: string }[];
  days: string[];              // days/ 파일이 있는 날짜 목록, 오름차순
  story_months: string[];      // stories/index-YYYY-MM.json이 있는 월 목록, 오름차순
}
```

### `/data/days/YYYY-MM-DD.json`
그날의 사건. importance 2 이상, importance 내림차순 → 매체 수 내림차순, 하루 최대 40개.
```ts
interface Day { date: string; events: Event[] }

interface Event {
  id: string;
  date: string;
  title_ko: string;          // 30자 내외 헤드라인
  summary_ko: string;        // 한두 문장
  category: Category;
  region: "kr" | "global";
  importance: 1 | 2 | 3 | 4 | 5;
  outlet_count: number;      // 다룬 매체 수
  story_id: string | null;
  sources: { outlet: string; url: string; title: string; lang: "ko" | "en"; published_at: string }[]; // 최대 8개
}
```

### `/data/stories/index-YYYY-MM.json`
그 달에 타임라인 항목이 하나라도 있는 이슈 목록(가벼운 형태). 기간 화면에서 이슈를 고를 때 쓴다.
범위가 두 달에 걸치면 두 파일을 받아 id로 합친다.
```ts
interface StoryBrief {
  id: string;
  title_ko: string;          // 이슈 이름(처음 만들 때 정해지고 바뀌지 않음)
  categories: Category[];    // 중요도 높은 사건 순
  region: "kr" | "global";
  first_date: string;
  last_date: string;
  timeline: TimelineItem[];  // 이슈 전체 타임라인, 날짜 오름차순
}

interface TimelineItem {
  date: string;
  event_id: string;
  one_line_ko: string;       // 고정 한 줄
  importance: 1 | 2 | 3 | 4 | 5;
}
```

### `/data/stories/{id}.json`
이슈 상세. 기간 화면의 이슈 카드도 상태 요약을 위해 이 파일을 받는다.
```ts
interface Story extends StoryBrief {
  snapshots: { date: string; status_ko: string }[];  // 날짜 오름차순. 그날 기준 상태 요약
  events: Event[];                                     // 타임라인의 사건들, 날짜 오름차순
}
```

## web이 하는 조합 (LLM 없음)

기간 `[from, to]`(최대 31일)에 대해:

1. **사건 목록:** `days/`에서 기간 안 파일을 받는다. 기간 길이로 최소 중요도와 하루 표시 개수를 정한다.
   - 1~3일: importance ≥ 2, 하루 30개 / 4~7일: ≥ 3, 하루 12개 / 8일 이상: ≥ 4, 하루 12개
   - 사용자가 카테고리를 고르면 그 카테고리만. 카테고리로 먼저 거른 뒤 하루 개수를 자른다.
2. **기간 안 이슈:** 범위에 걸친 월의 `stories/index-*.json`에서 `timeline`에 기간 안 항목이 있는 이슈.
   정렬: 기간 안 항목의 최대 importance 내림차순 → 기간 안 항목 수 내림차순. 최대 20개.
   카테고리를 고르면 `categories`가 하나라도 겹치는 이슈만.
3. **이슈 카드:**
   - 상태: `snapshots` 중 `date ≤ to`인 마지막 것. 그 날짜를 "M/D 기준"으로 표시.
   - 기간 안 타임라인 항목을 최신순으로 보여주고, `from` 이전 항목은 "이전 흐름 N건"으로 접는다.
   - `to` 이후 항목이 있으면 "이후 진행 N건" 배지로 최신 상태(마지막 스냅샷)를 보여준다.
4. **기간 핵심(3~5줄):** 이슈(2의 상위)와 이슈에 속하지 않은 사건(1에서 `story_id`가 null)을 섞어
   importance 내림차순 → (이슈면 기간 안 항목 수) 내림차순으로 5개.
   - 이슈: `"{title_ko} — {기간 안 최신 one_line_ko}"`, 사건: `title_ko`
5. **보기 모드:** 기간 3일 이하는 날짜별, 그보다 길면 이슈별이 기본.
6. **프리셋:** "오늘" = `generated_at`의 KST 날짜(진행 중, 매시간 갱신), "어제" = `last_complete_date`, "최근 N일" = `available_to`에서 거꾸로 N일.
