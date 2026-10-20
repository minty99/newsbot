import Link from "next/link";
import { CATEGORY_LABELS } from "@/lib/categories";
import { storyCardModel, type Range, type RangedStory } from "@/lib/compose";
import { formatMonthDay, formatRange } from "@/lib/dates";
import type { Importance as ImportanceValue, Story } from "@/lib/types";
import { Importance, RegionBadge } from "./badges";
import { Timeline } from "./timeline";

/** 기간 화면의 이슈 카드(계약 규칙 3). detail(스냅샷)은 늦게 도착할 수 있다 */
export function StoryCard({
  ranged,
  detail,
  range,
  href,
}: {
  ranged: RangedStory;
  detail?: Story | null;
  range: Range;
  href: string;
}) {
  const { story } = ranged;
  const model = storyCardModel({ timeline: story.timeline, snapshots: detail?.snapshots }, range);
  const newest = model.inRange[0];

  return (
    <article className="flex min-w-0 flex-col rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-text-3">
        <RegionBadge region={story.region} />
        <span>{story.categories.map((c) => CATEGORY_LABELS[c]).join(" · ")}</span>
        <span className="ml-auto">
          <Importance value={ranged.maxImportance as ImportanceValue} />
        </span>
      </div>
      <h3 className="mt-2.5 text-lg font-bold leading-snug">
        <Link href={href} className="hover:underline">
          {story.title_ko}
        </Link>
      </h3>
      <p className="mt-0.5 text-xs tabular-nums text-text-3">
        {formatRange(story.first_date, story.last_date)} · 이 기간 {model.inRange.length}건 / 전체 {story.timeline.length}건
      </p>

      {detail === undefined ? (
        <div className="mt-3 h-16 animate-pulse rounded-xl bg-surface-2" aria-hidden />
      ) : (
        model.status && (
          <div className="mt-3 rounded-xl bg-surface-2 p-3">
            <p className="text-xs font-semibold text-accent">{formatMonthDay(model.status.date)} 기준</p>
            <p className="mt-1 text-[15px] leading-relaxed text-text-2">{model.status.status_ko}</p>
          </div>
        )
      )}

      <div className="mt-4 flex-1 space-y-3">
        <Timeline items={model.inRange} emphasize={newest?.event_id} />
        {model.before.length > 0 && (
          <details className="group">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-text-3 [&::-webkit-details-marker]:hidden">
              이전 흐름 {model.before.length}건
              <span className="transition-transform group-open:rotate-180" aria-hidden>
                ▾
              </span>
            </summary>
            <div className="mt-2">
              <Timeline items={[...model.before].reverse()} muted />
            </div>
          </details>
        )}
      </div>

      {model.after.length > 0 && (
        <Link
          href={href}
          className="mt-4 block rounded-xl border border-accent/30 bg-accent-soft/60 p-3 hover:bg-accent-soft"
        >
          <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-surface">
            이후 진행 {model.after.length}건
          </span>
          <span className="mt-1.5 block text-sm leading-relaxed text-text">
            {model.latest ? (
              <>
                <span className="font-semibold text-accent">{formatMonthDay(model.latest.date)} 기준 </span>
                {model.latest.status_ko}
              </>
            ) : (
              <>
                <span className="font-semibold text-accent">{formatMonthDay(model.after.at(-1)!.date)} </span>
                {model.after.at(-1)!.one_line_ko}
              </>
            )}
          </span>
        </Link>
      )}

      <Link
        href={href}
        className="mt-4 flex items-center justify-center gap-1 rounded-xl border border-line py-2 text-sm font-semibold text-accent hover:bg-surface-2"
      >
        이슈 자세히 보기 <span aria-hidden>→</span>
      </Link>
    </article>
  );
}
