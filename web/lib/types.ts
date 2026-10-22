// docs/data-contract.md (v2) 의 타입을 그대로 옮긴 것. 계약이 바뀌면 여기도 같이 바꾼다.

export type Category = "politics" | "economy" | "society" | "world" | "tech" | "culture" | "sports";
export type Importance = 1 | 2 | 3 | 4 | 5;

// /data/meta.json
export interface Meta {
  generated_at: string; // 마지막 export 시각
  available_from: string; // 데이터가 있는 첫 날짜
  available_to: string; // 데이터가 있는 마지막 날짜(오늘, 진행 중일 수 있음)
  last_complete_date: string; // 하루가 끝난 마지막 날짜(보통 어제). 프리셋 "어제"의 기준
  categories: { key: Category; label: string }[];
  days: string[]; // days/ 파일이 있는 날짜 목록, 오름차순
  months: string[]; // months/YYYY-MM.json이 있는 월 목록, 오름차순
  story_months: string[]; // stories/index-YYYY-MM.json이 있는 월 목록, 오름차순
}

export interface Source {
  outlet: string;
  url: string;
  title: string; // 원문 제목 (원어 그대로)
  lang: "ko" | "en";
  published_at: string; // ISO 8601
}

export interface Event {
  id: string;
  date: string;
  title_ko: string; // 30자 내외 헤드라인
  summary_ko: string; // 한두 문장
  category: Category;
  region: "kr" | "global";
  importance: Importance;
  outlet_count: number; // 다룬 매체 수
  story_id: string | null;
  sources: Source[]; // 최대 8개
}

// /data/days/YYYY-MM-DD.json
export interface Day {
  date: string;
  events: Event[]; // importance 내림차순 → 매체 수 내림차순, 최대 40개
}

// /data/months/YYYY-MM.json — 긴 기간(15일 이상)용. importance 4 이상, 날짜마다 최대 5개, sources 최대 3개
export interface Month {
  month: string;
  events: Event[]; // 날짜 오름차순, 하루 안에서는 importance → 매체 수 내림차순
}

export interface TimelineItem {
  date: string;
  event_id: string;
  one_line_ko: string; // 고정 한 줄
  importance: Importance;
}

// /data/stories/index-YYYY-MM.json 의 원소
export interface StoryBrief {
  id: string;
  title_ko: string;
  categories: Category[]; // 중요도 높은 사건 순
  region: "kr" | "global";
  first_date: string;
  last_date: string;
  timeline: TimelineItem[]; // 이슈 전체 타임라인, 날짜 오름차순
}

export interface Snapshot {
  date: string;
  status_ko: string;
}

// /data/stories/{id}.json
export interface Story extends StoryBrief {
  snapshots: Snapshot[]; // 날짜 오름차순. 그날 기준 상태 요약
  events: Event[]; // 타임라인의 사건들, 날짜 오름차순
}
