import { Suspense } from "react";
import { Home } from "@/components/home";
import { Skeleton } from "@/components/status";

// 정적 셸. 기간·카테고리는 URL 쿼리라 브라우저에서 읽고 데이터도 브라우저에서 /data/를 받는다.
export default function Page() {
  return (
    <Suspense fallback={<Skeleton />}>
      <Home />
    </Suspense>
  );
}
