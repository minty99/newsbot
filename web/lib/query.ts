import { CATEGORY_KEYS, isCategory } from "./categories";
import { clampRange, presetRange as composePreset, type View } from "./compose";
import { daysInclusive, isDateString } from "./dates";
import type { Category, Meta } from "./types";

// 메인 화면의 상태는 모두 URL 쿼리에 둔다(공유·새로고침 가능, 클라이언트 상태 없음).
//   ?p=today|2w|1m|2m|6m        프리셋 (없으면 defaultPreset)
//   ?from=YYYY-MM-DD&to=...     직접 선택
//   &cat=economy,world          카테고리 (없으면 전체)
//   &view=daily|story           보기 방식 (없으면 기간 길이로 정한 기본값)

export type PresetKey = "today" | "2w" | "1m" | "2m" | "6m";
export type { View };

// 계약 규칙 6. days 0 = 오늘
export const PRESETS: { key: PresetKey; label: string; days: number }[] = [
  { key: "today", label: "오늘", days: 0 },
  { key: "2w", label: "2주", days: 14 },
  { key: "1m", label: "1개월", days: 30 },
  { key: "2m", label: "2개월", days: 60 },
  { key: "6m", label: "6개월", days: 180 },
];

/**
 * 주소에 기간이 없을 때의 기본 프리셋. 오늘 날짜 파일이 있으면 "오늘",
 * 없으면(자정 직후 첫 export 전 등) "2주". README 참고.
 */
export function defaultPreset(meta: Meta): PresetKey {
  return meta.days.includes(presetRange("today", meta).from) ? "today" : "2w";
}

export interface ViewState {
  preset: PresetKey | null; // null = 직접 선택
  from: string;
  to: string;
  categories: Category[];
  view: View | null;
  /** 요청한 기간이 데이터 제공 범위(또는 최대 186일)에 맞춰 잘렸는지 */
  clamped: boolean;
}

type RawParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** 계약 규칙 6: "오늘" = generated_at의 날짜, 나머지는 available_to에서 거꾸로 N일(available_from까지) */
export function presetRange(key: PresetKey, meta: Meta) {
  return composePreset(PRESETS.find((p) => p.key === key)!.days, meta);
}

export function parseViewState(params: RawParams, meta: Meta): ViewState {
  const categories = (first(params.cat) ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(isCategory);
  const viewParam = first(params.view);
  const view: View | null = viewParam === "daily" || viewParam === "story" ? viewParam : null;
  const uniqueCategories = CATEGORY_KEYS.filter((c) => categories.includes(c));

  const from = first(params.from);
  const to = first(params.to);
  if (isDateString(from) && isDateString(to)) {
    const requested = from > to ? { from: to, to: from } : { from, to };
    const range = clampRange(requested, meta);
    return {
      preset: null,
      ...range,
      categories: uniqueCategories,
      view,
      clamped: range.from !== requested.from || range.to !== requested.to,
    };
  }

  const presetParam = first(params.p);
  const preset = PRESETS.some((p) => p.key === presetParam) ? (presetParam as PresetKey) : defaultPreset(meta);
  const range = presetRange(preset, meta);
  const wanted = PRESETS.find((p) => p.key === preset)!.days;
  return { preset, ...range, categories: uniqueCategories, view, clamped: wanted > 0 && daysInclusive(range.from, range.to) < wanted };
}

/** 현재 상태에서 일부만 바꾼 메인 화면 URL */
export function buildHref(state: ViewState, patch: Partial<Pick<ViewState, "preset" | "from" | "to" | "categories" | "view">> = {}) {
  const next = { ...state, ...patch };
  const params = new URLSearchParams();
  if (next.preset) {
    // 기본 프리셋이 데이터에 따라 바뀌므로 프리셋은 항상 주소에 적는다
    params.set("p", next.preset);
  } else {
    params.set("from", next.from);
    params.set("to", next.to);
  }
  if (next.categories.length) params.set("cat", next.categories.join(","));
  if (next.view) params.set("view", next.view);
  const qs = params.toString();
  return qs ? `/?${qs}` : "/";
}

/** 이슈 상세. 정적 export라 동적 경로 대신 쿼리(/story/?id=)를 쓰고, 메인 쿼리를 같이 넘겨 "목록으로"에 쓴다 */
export function storyHref(id: string, state?: ViewState) {
  const params = new URLSearchParams(state ? buildHref(state).replace(/^\/\??/, "") : "");
  params.set("id", id);
  return `/story/?${params}`;
}

export function rangeLength(state: Pick<ViewState, "from" | "to">) {
  return daysInclusive(state.from, state.to);
}
