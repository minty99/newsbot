import Link from "next/link";
import { CATEGORY_KEYS, CATEGORY_LABELS } from "@/lib/categories";
import { formatDate, formatRange } from "@/lib/dates";
import type { Highlight } from "@/lib/compose";
import { buildHref, PRESETS, rangeLength, type View, type ViewState } from "@/lib/query";
import type { Meta } from "@/lib/types";

function Pill({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "true" : undefined}
      className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors lg:px-0 lg:text-center lg:text-[13px] ${
        active
          ? "border-text bg-text text-bg"
          : "border-line bg-surface text-text-2 hover:border-text-3 hover:text-text"
      }`}
    >
      {children}
    </Link>
  );
}

/** 기간 선택: 프리셋 링크 + 직접 선택(JS 없이 GET 폼) */
export function PeriodPicker({ state, meta }: { state: ViewState; meta: Meta }) {
  const custom = state.preset === null;
  return (
    <section aria-label="기간 선택">
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:grid lg:grid-cols-5 lg:gap-1 lg:overflow-visible lg:px-0">
        {PRESETS.map((p) => (
          <Pill key={p.key} href={buildHref(state, { preset: p.key, view: null })} active={state.preset === p.key}>
            {p.label}
          </Pill>
        ))}
      </div>

      <details className="group mt-2" open={custom || undefined}>
        <summary
          className={`inline-flex cursor-pointer list-none items-center gap-1 text-sm font-medium [&::-webkit-details-marker]:hidden ${
            custom ? "text-text" : "text-text-3"
          }`}
        >
          직접 선택
          <span className="transition-transform group-open:rotate-180" aria-hidden>
            ▾
          </span>
        </summary>
        <form action="/" className="mt-2 flex flex-wrap items-end gap-2 rounded-xl border border-line bg-surface p-3">
          <label className="flex flex-col gap-1 text-xs text-text-3">
            시작
            <input
              type="date"
              name="from"
              required
              defaultValue={state.from}
              min={meta.available_from}
              max={meta.available_to}
              className="rounded-lg border border-line bg-bg px-2 py-1.5 text-sm text-text"
            />
          </label>
          <span className="pb-2 text-text-3">~</span>
          <label className="flex flex-col gap-1 text-xs text-text-3">
            끝
            <input
              type="date"
              name="to"
              required
              defaultValue={state.to}
              min={meta.available_from}
              max={meta.available_to}
              className="rounded-lg border border-line bg-bg px-2 py-1.5 text-sm text-text"
            />
          </label>
          {state.categories.length > 0 && <input type="hidden" name="cat" value={state.categories.join(",")} />}
          <button
            type="submit"
            className="rounded-lg bg-text px-4 py-1.5 text-sm font-semibold text-bg hover:opacity-90"
          >
            보기
          </button>
          <p className="w-full text-xs text-text-3">
            {formatRange(meta.available_from, meta.available_to)} 뉴스를 최대 6개월씩 볼 수 있어요.
          </p>
        </form>
      </details>

      <p className="mt-3 text-sm text-text-2">
        <strong className="font-bold text-text">{formatRange(state.from, state.to)}</strong>
        <span className="text-text-3"> · {rangeLength(state)}일</span>
      </p>
      {state.clamped && (
        <p className="mt-1 text-xs leading-relaxed text-text-3">
          {state.preset
            ? `아직 ${formatDate(meta.available_from, false)}부터의 뉴스만 있어서 그 이후를 보여드려요.`
            : `볼 수 있는 범위(${formatRange(meta.available_from, meta.available_to)}, 최대 6개월)에 맞춰 기간을 조정했어요.`}
        </p>
      )}
    </section>
  );
}

/** 카테고리 칩(복수 선택). 아무것도 고르지 않으면 전체 */
export function CategoryChips({ state }: { state: ViewState }) {
  const toggle = (key: (typeof CATEGORY_KEYS)[number]) =>
    state.categories.includes(key) ? state.categories.filter((c) => c !== key) : [...state.categories, key];
  return (
    <nav aria-label="카테고리" className="no-scrollbar -mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">
      <Chip href={buildHref(state, { categories: [] })} active={state.categories.length === 0}>
        전체
      </Chip>
      {CATEGORY_KEYS.map((key) => (
        <Chip key={key} href={buildHref(state, { categories: toggle(key) })} active={state.categories.includes(key)}>
          {CATEGORY_LABELS[key]}
        </Chip>
      ))}
    </nav>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-pressed={active}
      className={`shrink-0 rounded-lg px-3 py-1 text-sm transition-colors ${
        active ? "bg-accent-soft font-semibold text-accent" : "text-text-3 hover:bg-surface-2 hover:text-text"
      }`}
    >
      {children}
    </Link>
  );
}

export function ViewTabs({
  state,
  current,
  recommended,
  storyCount,
}: {
  state: ViewState;
  current: View;
  recommended: View;
  storyCount: number;
}) {
  const tabs: { key: View; label: string; extra?: string }[] = [
    { key: "daily", label: "날짜별" },
    { key: "story", label: "이슈별", extra: storyCount ? String(storyCount) : undefined },
  ];
  return (
    <div role="tablist" aria-label="보기 방식" className="grid grid-cols-2 rounded-xl bg-surface-2 p-1">
      {tabs.map((t) => {
        const active = current === t.key;
        return (
          <Link
            key={t.key}
            role="tab"
            aria-selected={active}
            scroll={false}
            href={buildHref(state, { view: t.key === recommended ? null : t.key })}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition-colors ${
              active ? "bg-surface text-text shadow-sm" : "text-text-3 hover:text-text"
            }`}
          >
            {t.label}
            {t.extra && <span className="text-xs tabular-nums text-text-3">{t.extra}</span>}
            {t.key === recommended && <span className="text-[10px] font-medium text-accent">추천</span>}
          </Link>
        );
      })}
    </div>
  );
}

/** 기간 핵심(계약 규칙 4). 이슈 항목은 이슈 상세로 연결 */
export function Highlights({ items, storyHref }: { items: Highlight[]; storyHref: (id: string) => string }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="highlights" className="rounded-2xl bg-accent-soft/70 p-4">
      <h2 id="highlights" className="text-sm font-bold text-accent">
        기간 핵심
      </h2>
      <ul className="mt-2 space-y-2">
        {items.map((h) => (
          <li key={`${h.kind}-${h.id}`} className="flex gap-2.5 text-[15px] leading-relaxed text-text">
            <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
            {h.kind === "story" ? (
              <Link href={storyHref(h.id)} className="hover:underline">
                {h.text}
                <span className="ml-1 text-xs font-semibold text-accent">이슈</span>
              </Link>
            ) : (
              <span>{h.text}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
