"use client";

import { useEffect, useState } from "react";

export type AsyncState<T> = { status: "loading" } | { status: "error"; error: Error } | { status: "ok"; data: T };

/** key가 바뀔 때마다 load를 다시 실행한다. 늦게 끝난 이전 요청 결과는 버린다 */
export function useAsync<T>(key: string, load: () => Promise<T>): AsyncState<T> {
  const [state, setState] = useState<{ key: string; value: AsyncState<T> }>({ key, value: { status: "loading" } });

  useEffect(() => {
    let alive = true;
    load().then(
      (data) => alive && setState({ key, value: { status: "ok", data } }),
      (error: unknown) =>
        alive && setState({ key, value: { status: "error", error: error instanceof Error ? error : new Error(String(error)) } }),
    );
    return () => {
      alive = false;
    };
    // load는 key로 대표된다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state.key === key ? state.value : { status: "loading" };
}
