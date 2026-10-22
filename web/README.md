# newsbot web

바빠서 뉴스를 못 본 사람이 기간을 골라 그동안의 일을 따라잡는 **정적 사이트**(Next.js App Router, `output: "export"`).
서버·API 없이 pipeline이 만든 JSON(`public/data/`)을 브라우저에서 `/data/...`로 읽고, 기간 조합은 브라우저에서 한다.
데이터 형식과 조합 규칙은 [`../docs/data-contract.md`](../docs/data-contract.md)(v2)를 따른다.

## 실행

```bash
npm install
npm run dev          # http://localhost:3000 (public/data/ 필요)
npm run build        # 정적 결과물 → out/  (GitHub Pages 커스텀 도메인 루트에 그대로 배포)
```

- `public/data/`는 pipeline의 `newsbot export web/public/data`가 채운다(.gitignore 대상).
- 로컬에서 정적 결과 확인: `cd out && python3 -m http.server 8080`

## 구조

- `lib/types.ts` — 계약 v2 타입
- `lib/data.ts` — `/data/*.json` 클라이언트 fetch + 메모리 캐시 (meta.days / months / story_months에 있는 파일만 요청)
- `lib/compose.ts` — 계약의 조합 규칙(사건 목록, 기간 안 이슈, 이슈 카드, 기간 핵심, 보기 모드, 프리셋)을 순수 함수로 구현
- `lib/query.ts` — 화면 상태는 URL 쿼리(`p`, `from`/`to`, `cat`, `view`)
- `app/page.tsx` → `components/home.tsx` — 메인(기간 선택, 카테고리, 기간 핵심, 날짜별/이슈별)
- `app/story/page.tsx` → `components/story-detail.tsx` — 이슈 상세 `/story/?id=…` (정적 export라 동적 경로 대신 쿼리)

## 기간 프리셋

오늘 · 2주 · 1개월 · 2개월 · 6개월(계약 규칙 6). 주소에 기간이 없을 때 기본값은 **오늘**이고,
오늘 날짜 파일(`meta.days`)이 아직 없으면(자정 직후 첫 export 전) **2주**로 연다. 이 서비스는 "놓친 것 따라잡기"가
목적이라 빈 화면으로 시작하지 않게 하려는 것이다. "오늘"을 직접 골랐는데 아직 비어 있으면 2주 보기로 가는 링크를 보여준다.
데이터가 프리셋보다 짧으면 `available_from`까지로 잘리고, 그 사실을 기간 아래에 안내한다.

15일 이상 기간은 `months/` 파일을 읽고(규칙 1), 날짜별 보기를 월 단위로 묶어 한 줄형으로 보여준다(가장 최근 달만 펼침).

계약에 없어서 web이 정한 것: 카테고리는 먼저 거른 뒤 하루 개수를 자른다. 카테고리를 고르면 이슈도 `categories`가 겹치는 것만 보인다.

## 반응형 레이아웃

- 모바일(~1023px): 세로 한 줄 흐름. 프리셋·카테고리 칩은 가로 스크롤.
- `lg`(1024px~): 왼쪽 고정 사이드바(기간·카테고리·기간 핵심) + 오른쪽 본문. 이슈 상세는 왼쪽(상황·흐름 고정) / 오른쪽(관련 사건) 2단.
- `xl`(1280px~): 사건 카드·이슈 카드 2열 그리드.
- 날짜별 보기(14일 이하): 중요도 4 이상은 카드, 3 이하는 "그 밖의 소식" 목록으로 압축. 15일 이상은 월별 접기 + 한 줄형.
