import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-16 text-center">
      <p className="text-lg font-bold">찾는 내용이 없어요</p>
      <p className="mt-2 text-sm text-text-3">이슈가 정리되었거나 주소가 잘못되었을 수 있습니다.</p>
      <Link href="/" className="mt-6 inline-block rounded-full bg-text px-4 py-2 text-sm font-semibold text-bg">
        최근 뉴스 보기
      </Link>
    </div>
  );
}
