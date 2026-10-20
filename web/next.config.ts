import type { NextConfig } from "next";

// 서버 없는 정적 사이트. `npm run build` → out/ (GitHub Pages, 커스텀 도메인 루트라 basePath 없음)
// 데이터는 pipeline이 public/data/에 넣은 JSON을 브라우저에서 fetch한다.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
