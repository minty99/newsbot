"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { Importance, RegionBadge } from "@/components/badges";
import { EventCard } from "@/components/event-card";
import { Timeline } from "@/components/timeline";
import { CATEGORY_LABELS } from "@/lib/categories";
import { getStory } from "@/lib/data";
import { formatDate, formatMonthDay, formatRange } from "@/lib/dates";
import type { Event, Importance as ImportanceValue } from "@/lib/types";
import { useAsync } from "@/lib/use-async";
import { ErrorBox, Skeleton } from "./status";

export function StoryDetail() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const result = useAsync(`story|${id}`, () => (id ? getStory(id) : Promise.resolve(null)));

  // 메인에서 넘어온 쿼리(기간·카테고리)를 그대로 돌려줘 원래 화면으로 돌아가게 한다
  const back = new URLSearchParams(params);
  back.delete("id");
  const backHref = back.size ? `/?${back}` : "/";

  const story = result.status === "ok" ? result.data : null;
  useEffect(() => {
    if (story) document.title = `${story.title_ko} · newsbot`;
  }, [story]);

  if (result.status === "loading") return <Skeleton />;
  if (result.status === "error") return <ErrorBox error={result.error} />;
  if (!story) {
    return (
      <div className="py-16 text-center">
        <p className="text-lg font-bold">이슈를 찾을 수 없어요</p>
        <p className="mt-2 text-sm text-text-3">정리되었거나 주소가 잘못되었을 수 있습니다.</p>
        <Link href={backHref} className="mt-6 inline-block rounded-full bg-text px-4 py-2 text-sm font-semibold text-bg">
          목록으로
        </Link>
      </div>
    );
  }

  const latest = story.snapshots.at(-1);
  const newest = story.timeline.at(-1);
  const maxImportance = Math.max(1, ...story.timeline.map((t) => t.importance)) as ImportanceValue;
  const eventsByDate = new Map<string, Event[]>();
  for (const e of [...story.events].sort(
    (a, b) => b.date.localeCompare(a.date) || b.importance - a.importance || b.outlet_count - a.outlet_count,
  )) {
    eventsByDate.set(e.date, [...(eventsByDate.get(e.date) ?? []), e]);
  }

  return (
    <article>
      <Link href={backHref} className="inline-flex items-center gap-1 text-sm font-medium text-text-3 hover:text-text">
        <span aria-hidden>←</span> 목록으로
      </Link>

      {/* 모바일: 세로 한 줄. lg 이상: 왼쪽(개요·흐름 고정) + 오른쪽(관련 사건) 2단 */}
      <div className="mt-6 space-y-6 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-8 lg:space-y-0 xl:gap-12">
        <div className="space-y-6 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto lg:pb-4 lg:[scrollbar-width:thin]">
          <header>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-text-3">
              <RegionBadge region={story.region} />
              <span>{story.categories.map((c) => CATEGORY_LABELS[c]).join(" · ")}</span>
              <span className="ml-auto">
                <Importance value={maxImportance} />
              </span>
            </div>
            <h1 className="mt-3 text-2xl font-extrabold leading-tight tracking-tight lg:text-[28px]">{story.title_ko}</h1>
            <p className="mt-1 text-sm tabular-nums text-text-3">
              {formatRange(story.first_date, story.last_date)} · 사건 {story.timeline.length}건
            </p>
          </header>

          {latest && (
            <section className="rounded-2xl bg-accent-soft/70 p-4">
              <h2 className="text-sm font-bold text-accent">{formatMonthDay(latest.date)} 기준 상황</h2>
              <p className="mt-1.5 text-[15px] leading-relaxed text-text">{latest.status_ko}</p>
            </section>
          )}

          <section aria-labelledby="flow" className="rounded-2xl border border-line bg-surface p-4">
            <h2 id="flow" className="mb-3 text-sm font-bold text-text-2">
              흐름 <span className="font-medium text-text-3">오래된 순</span>
            </h2>
            <Timeline items={story.timeline} emphasize={newest?.event_id} linkToEvents />
          </section>
        </div>

        {story.events.length > 0 && (
          <section aria-labelledby="events" className="min-w-0 space-y-6">
            <h2 id="events" className="text-base font-extrabold">
              관련 사건 <span className="text-sm font-medium text-text-3">최신순</span>
            </h2>
            {[...eventsByDate].map(([date, events]) => (
              <div key={date}>
                <h3 className="mb-2 text-sm font-bold text-text-2">{formatDate(date)}</h3>
                <div className="space-y-3">
                  {events.map((e) => (
                    <EventCard key={e.id} event={e} />
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}
      </div>
    </article>
  );
}
