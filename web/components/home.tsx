"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CategoryChips, Highlights, PeriodPicker, ViewTabs } from "@/components/controls";
import { EventCard, EventRow } from "@/components/event-card";
import { StoryCard } from "@/components/story-card";
import {
  composeDays,
  composeHighlights,
  datesInRange,
  defaultView,
  monthsInRange,
  monthsToDays,
  rangeRules,
  selectStories,
  type ComposedDay,
  type Range,
  type RangedStory,
} from "@/lib/compose";
import { getDays, getMeta, getMonths, getStory, getStoryIndexes } from "@/lib/data";
import { daysInclusive, formatDate, formatRange } from "@/lib/dates";
import { buildHref, parseViewState, storyHref, type ViewState } from "@/lib/query";
import type { Meta } from "@/lib/types";
import { useAsync } from "@/lib/use-async";
import { ErrorBox, Skeleton } from "./status";

export function Home() {
  const meta = useAsync("meta", getMeta);
  if (meta.status === "loading") return <Skeleton />;
  if (meta.status === "error") return <ErrorBox error={meta.error} />;
  return <HomeWithMeta meta={meta.data} />;
}

interface Composed {
  days: ComposedDay[];
  stories: RangedStory[];
}

async function loadRange(meta: Meta, range: Range, categories: ViewState["categories"]): Promise<Composed> {
  // 규칙 1: 15일 이상은 날짜 파일 수백 개 대신 월별 주요 사건 파일을 읽는다
  const { source } = rangeRules(daysInclusive(range.from, range.to));
  const [days, indexes] = await Promise.all([
    source === "days"
      ? getDays(meta, datesInRange(range))
      : getMonths(meta, monthsInRange(range)).then(monthsToDays),
    getStoryIndexes(meta, monthsInRange(range)),
  ]);
  return { days: composeDays(days, range, categories), stories: selectStories(indexes, range, categories) };
}

function HomeWithMeta({ meta }: { meta: Meta }) {
  const params = useSearchParams();
  const state = parseViewState(Object.fromEntries(params), meta);
  const range = { from: state.from, to: state.to };
  const key = `${meta.generated_at}|${range.from}|${range.to}|${state.categories.join(",")}`;
  const data = useAsync(key, () => loadRange(meta, range, state.categories));
  const recommended = defaultView(range);
  const view = state.view ?? recommended;
  const toStory = (id: string) => storyHref(id, state);
  const rangeLength = daysInclusive(range.from, range.to);

  return (
    // 모바일: 한 줄 세로 흐름. lg 이상: 왼쪽 고정 사이드바(기간·카테고리·기간 핵심) + 오른쪽 본문
    <div className="space-y-5 lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start lg:gap-8 lg:space-y-0 xl:grid-cols-[19rem_minmax(0,1fr)] xl:gap-10">
      <aside className="space-y-5 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto lg:pb-4 lg:[scrollbar-width:thin]">
        <div>
          <PeriodPicker state={state} meta={meta} />
          <CategoryChips state={state} />
        </div>
        {data.status === "ok" ? (
          <Highlights items={composeHighlights(data.data.stories, data.data.days)} storyHref={toStory} />
        ) : (
          data.status === "loading" && <div className="h-40 animate-pulse rounded-2xl bg-surface-2" aria-hidden />
        )}
      </aside>

      <div className="min-w-0 space-y-5">
        <div className="lg:max-w-sm">
          <ViewTabs
            state={state}
            current={view}
            recommended={recommended}
            storyCount={data.status === "ok" ? data.data.stories.length : 0}
          />
        </div>
        {data.status === "loading" && <Skeleton cardsOnly />}
        {data.status === "error" && <ErrorBox error={data.error} />}
        {data.status === "ok" &&
          (view === "daily" ? (
            <DailyView days={data.data.days} state={state} long={rangeRules(rangeLength).source === "months"} />
          ) : (
            <StoryView stories={data.data.stories} range={range} state={state} />
          ))}
      </div>
    </div>
  );
}

/** 이 중요도 이상은 카드로, 미만은 "그 밖의 소식" 목록으로 */
const CARD_MIN_IMPORTANCE = 4;

function DailyView({ days, state, long }: { days: ComposedDay[]; state: ViewState; long: boolean }) {
  if (days.length === 0) return <Empty state={state} />;
  if (long) return <MonthGroupedView days={days} state={state} />;
  return (
    <div className="space-y-8">
      {days.map((day) => {
        const major = day.events.filter((e) => e.importance >= CARD_MIN_IMPORTANCE);
        const minor = day.events.filter((e) => e.importance < CARD_MIN_IMPORTANCE);
        const href = (e: (typeof day.events)[number]) => (e.story_id ? storyHref(e.story_id, state) : undefined);
        return (
          <section key={day.date} aria-labelledby={`d-${day.date}`}>
            <h2
              id={`d-${day.date}`}
              className="sticky top-0 z-10 -mx-4 mb-3 flex items-baseline gap-2 bg-bg/90 px-4 py-2 backdrop-blur"
            >
              <span className="text-base font-extrabold">{formatDate(day.date)}</span>
              <span className="text-xs text-text-3">{day.events.length}건</span>
            </h2>
            {major.length > 0 && (
              <div className="grid gap-3 xl:grid-cols-2">
                {major.map((e) => (
                  <EventCard key={e.id} event={e} storyHref={href(e)} />
                ))}
              </div>
            )}
            {minor.length > 0 && (
              <div className={major.length > 0 ? "mt-5" : ""}>
                {major.length > 0 && (
                  <h3 className="mb-1 text-sm font-bold text-text-2">
                    그 밖의 소식 <span className="font-medium text-text-3">{minor.length}</span>
                  </h3>
                )}
                <div className="rounded-2xl border border-line bg-surface px-4 xl:grid xl:grid-cols-2 xl:gap-x-8">
                  {minor.map((e) => (
                    <div
                      key={e.id}
                      className="border-b border-line last:border-b-0 xl:[&:nth-last-child(2):nth-child(odd)]:border-b-0"
                    >
                      <EventRow event={e} storyHref={href(e)} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

/**
 * 긴 기간(15일 이상) 날짜별 보기. 하루 3~5건 × 최대 180일이라 카드 대신 한 줄형으로,
 * 월 단위로 묶고 가장 최근 달만 펼친다.
 */
function MonthGroupedView({ days, state }: { days: ComposedDay[]; state: ViewState }) {
  const months = new Map<string, ComposedDay[]>();
  for (const d of days) months.set(d.date.slice(0, 7), [...(months.get(d.date.slice(0, 7)) ?? []), d]);
  return (
    <div className="space-y-4">
      <p className="text-sm text-text-3">기간이 길어 날마다 가장 중요한 소식만 모았어요.</p>
      {[...months].map(([month, mdays], i) => {
        const count = mdays.reduce((n, d) => n + d.events.length, 0);
        const [y, m] = month.split("-").map(Number);
        return (
          <details key={month} open={i === 0} className="group rounded-2xl border border-line bg-surface">
            <summary className="flex cursor-pointer list-none items-baseline gap-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
              <span className="text-base font-extrabold">
                {y}년 {m}월
              </span>
              <span className="text-xs text-text-3">
                {mdays.length}일 · {count}건
              </span>
              <span className="ml-auto text-text-3 transition-transform group-open:rotate-180" aria-hidden>
                ▾
              </span>
            </summary>
            <div className="border-t border-line px-4 xl:grid xl:grid-cols-2 xl:gap-x-8">
              {mdays.map((day) => (
                <section
                  key={day.date}
                  aria-label={formatDate(day.date)}
                  className="border-b border-line py-3 last:border-b-0 xl:[&:nth-last-child(2):nth-child(odd)]:border-b-0"
                >
                  <h3 className="text-sm font-bold text-text-2">{formatDate(day.date)}</h3>
                  <div className="divide-y divide-line/70">
                    {day.events.map((e) => (
                      <EventRow key={e.id} event={e} storyHref={e.story_id ? storyHref(e.story_id, state) : undefined} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}

function StoryView({ stories, range, state }: { stories: RangedStory[]; range: Range; state: ViewState }) {
  // 카드의 상태 요약(스냅샷)은 이슈 상세 파일에 있어 따로 받는다
  const details = useAsync(`stories|${stories.map((s) => s.story.id).join(",")}`, () =>
    Promise.all(stories.map((s) => getStory(s.story.id))),
  );
  if (stories.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-text-3">
        이 기간에 이어지는 이슈가 없어요.
        <br />
        날짜별 보기에서 개별 사건을 확인하세요.
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-text-3">이 기간에 이어진 이슈를 중요한 순서로 모았어요.</p>
      <div className="grid gap-4 xl:grid-cols-2">
        {stories.map((s, i) => (
          <StoryCard
            key={s.story.id}
            ranged={s}
            detail={details.status === "ok" ? details.data[i] : details.status === "error" ? null : undefined}
            range={range}
            href={storyHref(s.story.id, state)}
          />
        ))}
      </div>
    </div>
  );
}

function Empty({ state }: { state: ViewState }) {
  if (state.preset === "today" && state.categories.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line p-6 text-center text-sm leading-relaxed text-text-3">
        오늘 소식은 아직 모이는 중이에요. 매시간 새로 정리돼요.
        <br />
        <Link
          href={buildHref(state, { preset: "2w", view: null })}
          className="mt-3 inline-block font-semibold text-accent hover:underline"
        >
          최근 2주 보기 →
        </Link>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-dashed border-line p-6 text-center text-sm leading-relaxed text-text-3">
      {formatRange(state.from, state.to)}에 해당하는 뉴스가 없어요.
      {state.categories.length > 0 && (
        <>
          <br />
          카테고리를 &lsquo;전체&rsquo;로 바꿔 보세요.
        </>
      )}
    </div>
  );
}
