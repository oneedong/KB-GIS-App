# KB GIS 운영 안내

GitHub Pages(main 브랜치)로 배포되는 PWA입니다. 데이터는 GitHub Actions가 자동으로 갱신해 main에 커밋합니다.

## 자동 작업

| 작업 | 워크플로 | 예약(KST) | 하는 일 |
|---|---|---|---|
| 기사 수집 | `collect-news.yml` | 시간마다 깨움(시간별로 예약 줄을 따로 둠) → 마지막 수집 후 2시간 40분 지났을 때만 수집. 구글 뉴스가 막으면 저장 없이 끝내고 다른 서버에서 재실행(최대 2회) | 기사·본문·번역·투자내역·펀드레이징·인사이트, 앱용 경량 피드(`feed/`) |
| 데일리 시황 | `daily-brief.yml` | 새벽 02:33~04:03 · 06:23 · 07:13 · 08:03 에 깨움 → 06시 이후 첫 회차가 만들고, 오전 중 90분 뒤 회차가 최신 시세로 다시 덮음. 수집이 깨어날 때도 오늘 것이 없으면 실행 | 전일 마감 기준 시황(`market.json`, `briefs/`) |
| 주간 시장현황 | `weekly-market.yml` | 월 05:23 · 08:43 · 12:13, 화 07:13 | 지난주 월~일 보고서(월요일 05:00 이후에만 생성) |
| 국내 LP 배분 | `lp-refresh.yml` | 매주 월 07:23 | 기관별 대체투자 비중·운용자산(보도 기준) |
| 배포 전 점검 | `app-check.yml` | 매일 07:37 · 코드 변경 시 | 빌드 비교 + 화면 스모크 테스트 |

GitHub 예약 실행은 늦거나 빠지는 일이 잦습니다(2026-10~11 실측: 예약마다 3~4시간 늦게 실행되고, 같은 예약 식의 밀린 회차는 하나로 합쳐져 '30분마다' 한 줄은 하루 4~5번만 실행).
그래서 각 작업은 "언제 깨어나도 맞게" 만들어져 있습니다(수집 간격 게이트, 주간 보고 시각 판단).

## 비밀값 (Settings → Secrets and variables → Actions)

- `GEMINI_API_KEY` — 번역·시장현황 요약(무료 등급). 한도 초과 시 무료 구글 번역으로 대체됩니다.
- `ANTHROPIC_API_KEY` — 선택. 있으면 Claude를 먼저 씁니다.
- 변수 `EXTRA_HOLIDAYS` — 선택. 공휴일 추가(예: `2026-12-31,2027-01-02`).

## 외부 예약으로 정시 실행 (선택)

수집을 정확히 3시간마다 돌리고 싶으면, 무료 외부 크론 서비스가 GitHub API로 수집 워크플로를 깨우게 할 수 있습니다.

1. GitHub → Settings → Developer settings → Fine-grained personal access tokens → 새 토큰
   - Repository access: `oneedong/KB-GIS-App` 하나만
   - Permissions: **Actions — Read and write** (그 외 없음)
2. 외부 크론(예: cron-job.org)에서 작업 추가
   - URL: `https://api.github.com/repos/oneedong/KB-GIS-App/actions/workflows/collect-news.yml/dispatches`
   - Method: `POST`
   - Headers: `Authorization: Bearer <토큰>`, `Accept: application/vnd.github+json`
   - Body: `{"ref":"main"}`
   - 일정: 3시간마다
3. 수동·외부 실행(workflow_dispatch)은 게이트를 건너뛰고 바로 수집합니다.

토큰은 이 저장소의 Actions 실행 권한만 가지므로, 유출돼도 코드·데이터를 바꿀 수는 없습니다(워크플로 실행만 가능).

## 수동 실행

Actions 탭 → 워크플로 선택 → Run workflow.

- 주간 시장현황 특정 주 재생성: `date`에 보고일(예: `2026-10-30`), `force` 체크
- 국내 LP 배분 미리보기: `dry` 체크(저장하지 않고 찾은 값과 근거 문장만 출력)

## 로컬 점검

```bash
npm run build                          # src/*.tsx → js/*.js
node scripts/collect-news.mjs --selftest
node scripts/collect-news.mjs --feeds  # 수집 없이 앱용 경량 피드만 다시 만들기
node scripts/lp-refresh.mjs --selftest
node tests/smoke.mjs                   # Playwright 화면 점검
```
