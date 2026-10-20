// 계약 v2 "web이 하는 조합" 규칙을 그대로 옮긴 순수 함수들. 네트워크·React에 의존하지 않는다.

import { addDays, daysInclusive } from "./dates";
import type { Category, Day, Event, Importance, Meta, Snapshot, StoryBrief, TimelineItem } from "./types";

export interface Range {
  from: string;
  to: string;
}

export type View = "daily" | "story";

export const MAX_RANGE_DAYS = 31;
export const MAX_STORIES = 20;
export const HIGHLIGHT_COUNT = 5;

/** 규칙 1: 기간 길이 → 최소 중요도, 하루 표시 개수 */
export function rangeRules(days: number): { minImportance: Importance; perDay: number } {
  if (days <= 3) return { minImportance: 2, perDay: 30 };
  if (days <= 7) return { minImportance: 3, perDay: 12 };
  return { minImportance: 4, perDay: 12 };
}

/** 규칙 5: 3일 이하는 날짜별, 그보다 길면 이슈별 */
export function defaultView(range: Range): View {
  return daysInclusive(range.from, range.to) <= 3 ? "daily" : "story";
}

/** from~to 날짜 목록(오름차순) */
export function datesInRange({ from, to }: Range): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** 범위에 걸친 "YYYY-MM" 목록(오름차순) */
export function monthsInRange({ from, to }: Range): string[] {
  const out: string[] = [];
  for (let m = from.slice(0, 7); m <= to.slice(0, 7); ) {
    out.push(m);
    const [y, mm] = m.split("-").map(Number);
    m = mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, "0")}`;
  }
  return out;
}

/** 데이터 범위 안으로 자르고 최대 31일로 제한(끝 날짜 기준) */
export function clampRange({ from, to }: Range, meta: Pick<Meta, "available_from" | "available_to">): Range {
  if (from > to) [from, to] = [to, from];
  to = to > meta.available_to ? meta.available_to : to < meta.available_from ? meta.available_from : to;
  from = from < meta.available_from ? meta.available_from : from > to ? to : from;
  const earliest = addDays(to, -(MAX_RANGE_DAYS - 1));
  if (from < earliest) from = earliest;
  return { from, to };
}

/**
 * 규칙 6: "오늘" = generated_at의 KST 날짜(진행 중), "어제" = last_complete_date,
 * "최근 N일" = available_to에서 거꾸로 N일. days 0은 오늘.
 */
export function presetRange(days: number, meta: Meta): Range {
  if (days === 0) {
    // generated_at은 +09:00 ISO 문자열이라 앞 10자가 KST 날짜다
    const today = meta.generated_at.slice(0, 10);
    return { from: today, to: today };
  }
  if (days === 1) return { from: meta.last_complete_date, to: meta.last_complete_date };
  return clampRange({ from: addDays(meta.available_to, -(days - 1)), to: meta.available_to }, meta);
}

const inCategories = (selected: Category[]) => (c: Category) => selected.length === 0 || selected.includes(c);

// ── 규칙 1: 사건 목록 ───────────────────────────────────────────

export interface ComposedDay {
  date: string;
  events: Event[];
}

/**
 * 기간 안 날짜의 사건을 고른다. 카테고리를 먼저 거른 뒤 하루 개수를 자른다
 * (자른 뒤 거르면 긴 기간에서 작은 카테고리가 거의 비게 된다).
 * 결과는 날짜 내림차순, 하루 안에서는 importance → 매체 수 내림차순.
 */
export function composeDays(days: Day[], range: Range, categories: Category[] = []): ComposedDay[] {
  const { minImportance, perDay } = rangeRules(daysInclusive(range.from, range.to));
  const match = inCategories(categories);
  return days
    .filter((d) => d.date >= range.from && d.date <= range.to)
    .map((d) => ({
      date: d.date,
      events: d.events
        .filter((e) => e.importance >= minImportance && match(e.category))
        .sort(byEventRank)
        .slice(0, perDay),
    }))
    .filter((d) => d.events.length > 0)
    .sort((a, b) => b.date.localeCompare(a.date));
}

function byEventRank(a: Event, b: Event) {
  return b.importance - a.importance || b.outlet_count - a.outlet_count;
}

// ── 규칙 2: 기간 안 이슈 ────────────────────────────────────────

export interface RangedStory {
  story: StoryBrief;
  /** 기간 안 타임라인 항목(날짜 오름차순) */
  inRange: TimelineItem[];
  maxImportance: number;
}

function inRangeItems(story: StoryBrief, range: Range) {
  return story.timeline.filter((t) => t.date >= range.from && t.date <= range.to);
}

/**
 * 월별 인덱스를 id로 합친 뒤 기간 안 항목이 있는 이슈만 고른다.
 * 카테고리를 고르면 이슈의 categories와 겹치는 것만(계약에 없는 부분, web 판단).
 */
export function selectStories(indexes: StoryBrief[][], range: Range, categories: Category[] = []): RangedStory[] {
  const merged = new Map<string, StoryBrief>();
  // 같은 이슈가 여러 달 인덱스에 있으면 timeline이 더 긴(=최신) 쪽을 쓴다
  for (const s of indexes.flat()) {
    const prev = merged.get(s.id);
    if (!prev || s.timeline.length >= prev.timeline.length) merged.set(s.id, s);
  }
  const match = inCategories(categories);
  const ranged: RangedStory[] = [];
  for (const story of merged.values()) {
    if (categories.length && !story.categories.some(match)) continue;
    const inRange = inRangeItems(story, range);
    if (inRange.length === 0) continue;
    ranged.push({ story, inRange, maxImportance: Math.max(...inRange.map((t) => t.importance)) });
  }
  return ranged
    .sort((a, b) => b.maxImportance - a.maxImportance || b.inRange.length - a.inRange.length)
    .slice(0, MAX_STORIES);
}

// ── 규칙 3: 이슈 카드 ───────────────────────────────────────────

export interface StoryCardModel {
  /** date ≤ to인 마지막 스냅샷. 없으면 null */
  status: Snapshot | null;
  /** 기간 안 항목, 최신순 */
  inRange: TimelineItem[];
  /** from 이전 항목(접어서 "이전 흐름 N건"), 날짜 오름차순 */
  before: TimelineItem[];
  /** to 이후 항목("이후 진행 N건") */
  after: TimelineItem[];
  /** after가 있을 때 보여줄 최신 상태(마지막 스냅샷) */
  latest: Snapshot | null;
}

export function storyCardModel(
  story: Pick<StoryBrief, "timeline"> & { snapshots?: Snapshot[] },
  range: Range,
): StoryCardModel {
  const snapshots = story.snapshots ?? [];
  const status = snapshots.filter((s) => s.date <= range.to).at(-1) ?? null;
  const after = story.timeline.filter((t) => t.date > range.to);
  const last = snapshots.at(-1) ?? null;
  return {
    status,
    inRange: inRangeItems(story as StoryBrief, range).reverse(),
    before: story.timeline.filter((t) => t.date < range.from),
    after,
    latest: after.length > 0 && last && last !== status ? last : null,
  };
}

// ── 규칙 4: 기간 핵심 ───────────────────────────────────────────

export type Highlight =
  | { kind: "story"; id: string; text: string; importance: number }
  | { kind: "event"; id: string; text: string; importance: number };

/**
 * 이슈(selectStories 결과)와 이슈에 속하지 않은 사건(composeDays 결과)을 섞어
 * importance 내림차순 → (이슈면 기간 안 항목 수) 내림차순으로 5개.
 * 사건은 항목 수를 1로 보고, 동점이면 매체 수가 많은 쪽.
 */
export function composeHighlights(stories: RangedStory[], days: ComposedDay[], count = HIGHLIGHT_COUNT): Highlight[] {
  type Candidate = Highlight & { weight: number; outlets: number };
  const candidates: Candidate[] = [
    ...stories.map((s) => ({
      kind: "story" as const,
      id: s.story.id,
      text: `${s.story.title_ko} — ${s.inRange.at(-1)!.one_line_ko}`,
      importance: s.maxImportance,
      weight: s.inRange.length,
      outlets: Infinity,
    })),
    ...days
      .flatMap((d) => d.events)
      .filter((e) => e.story_id === null)
      .map((e) => ({
        kind: "event" as const,
        id: e.id,
        text: e.title_ko,
        importance: e.importance,
        weight: 1,
        outlets: e.outlet_count,
      })),
  ];
  return candidates
    .sort((a, b) => b.importance - a.importance || b.weight - a.weight || b.outlets - a.outlets)
    .slice(0, count)
    .map(({ kind, id, text, importance }) => ({ kind, id, text, importance }));
}
