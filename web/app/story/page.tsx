import { Suspense } from "react";
import { StoryDetail } from "@/components/story-detail";
import { Skeleton } from "@/components/status";

// 이슈 상세: /story/?id=123. 정적 export에서 빌드 때 id 목록에 의존하지 않도록 쿼리 방식을 쓴다.
export default function Page() {
  return (
    <Suspense fallback={<Skeleton />}>
      <StoryDetail />
    </Suspense>
  );
}
