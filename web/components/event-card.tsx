import Link from "next/link";
import { formatTime } from "@/lib/dates";
import type { Event } from "@/lib/types";
import { CategoryBadge, Importance, RegionBadge } from "./badges";

export function EventCard({ event, storyHref }: { event: Event; storyHref?: string }) {
  return (
    <article
      id={event.id}
      className={`flex min-w-0 flex-col rounded-2xl border bg-surface p-4 ${event.importance >= 5 ? "border-hot/40" : "border-line"}`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <CategoryBadge category={event.category} />
        <RegionBadge region={event.region} />
        <span className="ml-auto">
          <Importance value={event.importance} />
        </span>
      </div>

      <h3 className="mt-2.5 text-[17px] font-bold leading-snug text-text">{event.title_ko}</h3>
      <p className="mt-1.5 text-[15px] leading-relaxed text-text-2">{event.summary_ko}</p>

      <details className="group mt-3 lg:mt-auto lg:pt-3">
        <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-text-3 [&::-webkit-details-marker]:hidden">
          <span className="shrink-0">매체 {event.outlet_count}곳</span>
          <span className="min-w-0 truncate">· {event.sources.map((s) => s.outlet).join(", ")}</span>
          <span className="ml-0.5 transition-transform group-open:rotate-180" aria-hidden>
            ▾
          </span>
        </summary>
        <ul className="mt-2 space-y-1.5">
          {event.sources.map((s) => (
            <li key={s.url}>
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                lang={s.lang}
                className="flex items-baseline gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2"
              >
                <span className="shrink-0 font-semibold text-text-2">{s.outlet}</span>
                <span className="min-w-0 flex-1 truncate text-text-3">{s.title}</span>
                <span className="shrink-0 text-xs tabular-nums text-text-3">{formatTime(s.published_at)} ↗</span>
              </a>
            </li>
          ))}
        </ul>
      </details>

      {storyHref && (
        <Link
          href={storyHref}
          className="mt-3 inline-flex items-center gap-1 self-start rounded-full bg-accent-soft px-3 py-1.5 text-sm font-semibold text-accent hover:opacity-90"
        >
          이슈 따라가기 <span aria-hidden>→</span>
        </Link>
      )}
    </article>
  );
}

/** 덜 중요한 사건용 한 줄형. 카드 테두리 없이 목록 안에서 쓴다 */
export function EventRow({ event, storyHref }: { event: Event; storyHref?: string }) {
  return (
    <article id={event.id} className="py-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <CategoryBadge category={event.category} />
        <RegionBadge region={event.region} />
        <h3 className="min-w-0 basis-full text-[15px] font-bold leading-snug text-text sm:basis-auto sm:flex-1">
          {event.title_ko}
        </h3>
      </div>
      <p className="mt-1 text-sm leading-relaxed text-text-2">{event.summary_ko}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {event.sources.slice(0, 3).map((s) => (
          <a
            key={s.url}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            title={s.title}
            className="font-medium text-text-3 hover:text-text hover:underline"
          >
            {s.outlet} ↗
          </a>
        ))}
        {event.outlet_count > Math.min(3, event.sources.length) && (
          <span className="text-text-3">외 {event.outlet_count - Math.min(3, event.sources.length)}곳</span>
        )}
        {storyHref && (
          <Link href={storyHref} className="ml-auto font-semibold text-accent hover:underline">
            이슈 따라가기 →
          </Link>
        )}
      </div>
    </article>
  );
}
