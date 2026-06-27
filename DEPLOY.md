# KB GIS — 배포 · 자동 뉴스 수집 · 휴대폰 설치 가이드

해외대체투자 뉴스 앱(KB GIS)을 **무료로 공개**하고, **매일 자동으로 뉴스가 수집**되게 하고,
**휴대폰에 설치 + 동료 공유**까지 하는 방법입니다.

이 앱은 설치형 웹앱(PWA)이라 앱스토어 없이 링크만으로 홈 화면에 설치됩니다.
뉴스는 **GitHub Actions(무료 스케줄러)** 가 Google 뉴스에서 자동 수집해 `news.json`에 쌓고,
앱은 그걸 읽어 **기사를 계속 누적**합니다. (서버를 24시간 켜둘 필요 없음 → 무료)

---

## 1단계 · GitHub에 올리기 (무료 공개 + 자동 수집)

> 가장 쉬운 무료 조합입니다. 브라우저만으로 가능하고 별도 프로그램 설치가 필요 없습니다.

1. **github.com** 가입 → 우측 상단 **＋ → New repository**
2. 저장소 이름 입력 (예: `kbgis`) → **Public** → **Create repository**
3. 생성된 페이지에서 **uploading an existing file** 클릭
4. 압축 푼 폴더 안의 **모든 파일/폴더를 드래그**해서 업로드 → **Commit changes**
   (`index.html`, `app.js`, `sw.js`, `news.json`, `manifest.webmanifest`,
    `icons/`, `vendor/`, `scripts/`, `.github/` 전부 — 숨김폴더 `.github`도 꼭 포함)

### 공개 URL 켜기 (GitHub Pages)
5. 저장소 **Settings → Pages**
6. **Source: Deploy from a branch** → **Branch: main / (root)** → **Save**
7. 1~2분 뒤 `https://아이디.github.io/kbgis/` 주소가 표시됩니다 → 이게 **공유 링크**

### 자동 뉴스 수집 켜기 (GitHub Actions)
8. 저장소 **Actions** 탭 → (처음이면) 워크플로우 사용 동의
9. 좌측 **Collect news** 선택 → **Run workflow** 버튼으로 첫 수집 실행
10. 이후 **3시간마다 자동**으로 새 뉴스를 모아 `news.json`에 누적합니다
    (주기를 바꾸려면 `.github/workflows/collect-news.yml`의 `cron` 수정)

---

## 2단계 · 휴대폰 홈 화면에 설치

위 공개 링크를 휴대폰 브라우저로 엽니다.

- **아이폰(Safari)**: 공유 버튼(↑) → **"홈 화면에 추가"**
- **안드로이드(Chrome)**: ⋮ 메뉴 → **"앱 설치"** 또는 **"홈 화면에 추가"**

설치하면 전체화면·아이콘·오프라인까지 일반 앱처럼 동작합니다.
(상단 시간·배터리는 휴대폰이 표시하므로 앱에서는 뺐습니다.)

## 동료 공유

- 공개 링크 하나만 단톡방/메일로 보내면 됩니다. 각자 "홈 화면에 추가"하면 끝.
- 앱 안 기사 화면의 **공유 버튼**을 누르면 휴대폰 기본 공유시트(카카오톡·메일 등)가 열립니다.

---

## 작동 방식 (참고)

- **뉴스 출처**: Google 뉴스 RSS(무료, 키 불필요). 한경·더벨·Bloomberg·PERE 등 여러 매체를 한 번에 모읍니다.
- **분류**: 기관(연기금·공제회·운용·증권·보험·해외 GP)·자산군(부동산/사모대출/사모펀드/인프라)·지역·LP/GP/인사를 키워드로 자동 분류.
- **누적**: 새로 수집된 기사는 기존 아카이브에 합쳐지고(최대 400건), 휴대폰에도 따로 저장돼 **검색**됩니다. 기사가 사라지지 않습니다.
- **관심**: 기사의 ▢ 아이콘을 누르면 **북마크 탭**에 모이고, 앱을 꺼도 유지됩니다.

### (선택) 진짜 AI 3줄 요약 — 무료 Gemini 키 연결
기본은 기사 요약문에서 문장을 자동 추출합니다. **무료 Gemini 키**를 넣으면
매일 새 기사에 진짜 한국어 3줄 요약이 붙습니다 (키 없으면 자동으로 추출식 유지).

1. **https://aistudio.google.com/apikey** 접속 → 구글 로그인 → **Create API key** (무료, 카드 불필요)
2. 저장소 **Settings → Secrets and variables → Actions → New repository secret**
3. 이름 `GEMINI_API_KEY`, 값에 발급받은 키 붙여넣기 → 저장
4. **Actions → Collect news → Run workflow** 다시 실행하면 요약이 적용됩니다

> 무료 한도 보호를 위해 한 번 실행당 최대 40건만 요약합니다(`scripts/collect-news.mjs`의 `LLM_BUDGET`).

---

## 개발자용 메모

코드(JSX)는 `src/app.tsx`에 있고, 브라우저용 `app.js`로 변환합니다:
```bash
tsc src/app.tsx --jsx react --target es2019 --outDir . --skipLibCheck
```
아이콘 재생성: `node scripts/gen-icons.mjs`
뉴스 수집 로컬 테스트(네트워크 필요): `node scripts/collect-news.mjs`
수집기 파서/분류 검증(네트워크 불필요): `node scripts/collect-news.mjs --selftest`
