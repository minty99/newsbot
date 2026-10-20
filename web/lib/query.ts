import { CATEGORY_KEYS, isCategory } from "./categories";
import { clampRange, presetRange as composePreset, type View } from "./compose";
import { daysInclusive, isDateString } from "./dates";
import type { Category, Meta } from "./types";

// 메인 화면의 상태는 모두 URL 쿼리에 둔다(공유·새로고침 가능, 클라이언트 상태 없음).
//   ?p=3d                       프리셋
//   ?from=YYYY-MM-DD&to=...     직접 선택
//   &cat=economy,world          카테고리 (없으면 전체)
//   &view=daily|story           보기 방식 (없으면 기간 길이로 정한 기본값)

export type PresetKey = "1d" | "3d" | "1w" | "2w";
export type { View };

export const PRESETS: { key: PresetKey; label: string; days: number }[] = [
  { key: "1d", label: "어제", days: 1 },
  { key: "3d", label: "최근 3일", days: 3 },
  { key: "1w", label: "최근 1주", days: 7 },
  { key: "2w", label: "최근 2주", days: 14 },
];

export const DEFAULT_PRESET: PresetKey = "3d";

export interface ViewState {
  preset: PresetKey | null; // null = 직접 선택
  from: string;
  to: string;
  categories: Category[];
  view: View | null;
  /** 요청한 기간이 데이터 제공 범위를 벗어나 잘렸는지 */
  clamped: boolean;
}

type RawParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** 계약 규칙 6: "어제" = last_complete_date, "최근 N일" = available_to에서 거꾸로 N일 */
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
  const preset = PRESETS.some((p) => p.key === presetParam) ? (presetParam as PresetKey) : DEFAULT_PRESET;
  return { preset, ...presetRange(preset, meta), categories: uniqueCategories, view, clamped: false };
}

/** 현재 상태에서 일부만 바꾼 메인 화면 URL */
export function buildHref(state: ViewState, patch: Partial<Pick<ViewState, "preset" | "from" | "to" | "categories" | "view">> = {}) {
  const next = { ...state, ...patch };
  const params = new URLSearchParams();
  if (next.preset) {
    if (next.preset !== DEFAULT_PRESET) params.set("p", next.preset);
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
