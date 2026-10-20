import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "newsbot · 놓친 뉴스 따라잡기",
  description: "바빠서 못 본 뉴스를 기간별로 한두 줄씩 따라잡으세요.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f6f3" },
    { media: "(prefers-color-scheme: dark)", color: "#111214" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <head>
        <link
          rel="stylesheet"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="flex min-h-full flex-col">
        <header className="border-b border-line bg-surface/80 backdrop-blur supports-[backdrop-filter]:bg-surface/70">
          <div className="mx-auto flex max-w-2xl lg:max-w-6xl xl:max-w-7xl lg:px-8 items-baseline gap-2 px-4 py-3">
            <Link href="/" className="text-lg font-extrabold tracking-tight text-text">
              newsbot
            </Link>
            <span className="truncate text-sm text-text-3">바빠서 놓친 뉴스, 한 번에 따라잡기</span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-2xl lg:max-w-6xl xl:max-w-7xl lg:px-8 flex-1 px-4 pb-16 pt-4">{children}</main>
        <footer className="mx-auto w-full max-w-2xl lg:max-w-6xl xl:max-w-7xl lg:px-8 px-4 pb-8 text-xs leading-relaxed text-text-3">
          요약은 AI가 여러 매체의 기사 제목·설명을 바탕으로 만든 것으로, 부정확할 수 있습니다. 자세한 내용은 원문 링크에서
          확인하세요.
        </footer>
      </body>
    </html>
  );
}
