# newsbot (가칭)

바빠서 뉴스를 못 본 사람이 기간을 골라 그동안 국내외에서 생긴 일을 따라잡는 서비스.
기사를 사건으로 묶어 한두 줄로 요약하고, 여러 날에 걸친 사건은 이슈로 이어서 보여준다.

```
GitHub Actions (매시간)
  pipeline/  RSS 수집 → 정규화·임베딩 → 사건 묶기 → 요약 → 이슈 연결·갱신 → 정적 JSON
  web/       Next.js 정적 빌드 → GitHub Pages (news.muhwan.dev)
```

- LLM은 pipeline(cron)에서만 호출한다. 웹은 서버 없는 정적 사이트다.
- 데이터 형식: [docs/data-contract.md](docs/data-contract.md)
- 실행 방법: [pipeline/README.md](pipeline/README.md), [web/README.md](web/README.md)
- 배포: [.github/workflows/update.yml](.github/workflows/update.yml)
