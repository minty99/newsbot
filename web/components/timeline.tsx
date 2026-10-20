import { formatDate } from "@/lib/dates";
import type { TimelineItem } from "@/lib/types";

/**
 * 세로 타임라인. items는 보여줄 순서대로 넘긴다.
 * emphasize: 강조할 항목(보통 가장 최근)의 event_id
 */
export function Timeline({
  items,
  emphasize,
  linkToEvents = false,
  muted = false,
}: {
  items: TimelineItem[];
  emphasize?: string;
  linkToEvents?: boolean;
  muted?: boolean;
}) {
  return (
    <ol className={`relative ml-1.5 border-l-2 border-line ${muted ? "opacity-70" : ""}`}>
      {items.map((item) => {
        const strong = item.event_id === emphasize;
        const body = (
          <>
            <time dateTime={item.date} className="block text-xs font-semibold tabular-nums text-text-3">
              {formatDate(item.date)}
            </time>
            <span className={`mt-0.5 block text-[15px] leading-snug ${strong ? "font-semibold text-text" : "text-text-2"}`}>
              {item.one_line_ko}
            </span>
          </>
        );
        return (
          <li key={item.event_id} className="relative pb-4 pl-5 last:pb-0">
            <span
              aria-hidden
              className={`absolute -left-[7px] top-1 h-3 w-3 rounded-full border-2 border-surface ${
                strong ? "bg-accent" : item.importance >= 4 ? "bg-text-2" : "bg-text-3/60"
              }`}
            />
            {linkToEvents ? (
              <a href={`#${item.event_id}`} className="block hover:underline">
                {body}
              </a>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ol>
  );
}
