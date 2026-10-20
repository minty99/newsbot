import { CATEGORY_LABELS } from "@/lib/categories";
import type { Category } from "@/lib/types";

export function CategoryBadge({ category }: { category: Category }) {
  return (
    <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-xs font-medium text-text-2">
      {CATEGORY_LABELS[category]}
    </span>
  );
}

export function RegionBadge({ region }: { region: "kr" | "global" }) {
  return region === "kr" ? (
    <span className="rounded-md bg-kr-soft px-1.5 py-0.5 text-xs font-semibold text-kr">국내</span>
  ) : (
    <span className="rounded-md bg-global-soft px-1.5 py-0.5 text-xs font-semibold text-global">해외</span>
  );
}

const IMPORTANCE_TEXT = ["", "참고", "보통", "주목", "중요", "매우 중요"];

/** 5칸 막대로 중요도 표시. 4 이상은 강조색 */
export function Importance({ value }: { value: 1 | 2 | 3 | 4 | 5 }) {
  const hot = value >= 4;
  return (
    <span
      className="inline-flex items-center gap-1"
      role="img"
      aria-label={`중요도 ${value}/5 (${IMPORTANCE_TEXT[value]})`}
      title={`중요도 ${value}/5`}
    >
      <span className="flex items-end gap-[2px]" aria-hidden>
        {[1, 2, 3, 4, 5].map((n) => (
          <span
            key={n}
            className={`w-[3px] rounded-full ${n <= value ? (hot ? "bg-hot" : "bg-text-2") : "bg-line"}`}
            style={{ height: `${4 + n * 2}px` }}
          />
        ))}
      </span>
      {hot && <span className="text-xs font-semibold text-hot">{IMPORTANCE_TEXT[value]}</span>}
    </span>
  );
}
