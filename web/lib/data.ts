"use client";

import type { Day, Meta, Story, StoryBrief } from "./types";

// 정적 JSON(/data/...)을 브라우저에서 읽는다. 같은 파일은 한 번만 받는다.
// meta.json이 매시간 바뀌므로 브라우저 HTTP 캐시는 쓰지 않고(no-cache: 재검증) 메모리에만 둔다.

const cache = new Map<string, Promise<unknown>>();

export class DataNotFoundError extends Error {}

function load<T>(path: string): Promise<T> {
  let p = cache.get(path) as Promise<T> | undefined;
  if (!p) {
    p = fetch(`/data/${path}`, { cache: "no-cache" }).then(async (res) => {
      if (res.status === 404) throw new DataNotFoundError(path);
      if (!res.ok) throw new Error(`데이터를 받지 못했습니다 (${res.status} ${path})`);
      return (await res.json()) as T;
    });
    // 실패한 요청은 다음에 다시 시도할 수 있게 캐시에서 뺀다
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return p;
}

export const getMeta = () => load<Meta>("meta.json");

/** meta.days에 있는 날짜만 요청한다 */
export async function getDays(meta: Meta, dates: string[]): Promise<Day[]> {
  const available = new Set(meta.days);
  return Promise.all(dates.filter((d) => available.has(d)).map((d) => load<Day>(`days/${d}.json`)));
}

/** meta.story_months에 있는 월만 요청한다 */
export async function getStoryIndexes(meta: Meta, months: string[]): Promise<StoryBrief[][]> {
  const available = new Set(meta.story_months);
  return Promise.all(
    months
      .filter((m) => available.has(m))
      .map(async (m) => {
        // 계약상 배열이지만 { stories: [...] }로 감싸 와도 받아준다
        const data = await load<StoryBrief[] | { stories: StoryBrief[] }>(`stories/index-${m}.json`);
        return Array.isArray(data) ? data : (data.stories ?? []);
      }),
  );
}

/** 없으면 null */
export async function getStory(id: string): Promise<Story | null> {
  try {
    return await load<Story>(`stories/${encodeURIComponent(id)}.json`);
  } catch (err) {
    if (err instanceof DataNotFoundError) return null;
    throw err;
  }
}
