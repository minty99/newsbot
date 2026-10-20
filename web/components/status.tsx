"use client";

export function Skeleton({ cardsOnly = false }: { cardsOnly?: boolean }) {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="불러오는 중">
      {!cardsOnly && (
        <>
          <div className="flex gap-2">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-8 w-20 rounded-full bg-surface-2" />
            ))}
          </div>
          <div className="h-6 w-2/3 rounded bg-surface-2" />
          <div className="h-28 rounded-2xl bg-surface-2" />
        </>
      )}
      <div className="h-40 rounded-2xl bg-surface-2" />
      <div className="h-40 rounded-2xl bg-surface-2" />
    </div>
  );
}

export function ErrorBox({ error }: { error: Error }) {
  return (
    <div className="py-16 text-center">
      <p className="text-lg font-bold">뉴스를 불러오지 못했어요</p>
      <p className="mt-2 text-sm text-text-3">잠시 후 다시 시도해 주세요.</p>
      <p className="mt-2 break-all text-xs text-text-3">{error.message}</p>
      <button
        type="button"
        onClick={() => location.reload()}
        className="mt-6 rounded-full bg-text px-4 py-2 text-sm font-semibold text-bg"
      >
        다시 시도
      </button>
    </div>
  );
}
