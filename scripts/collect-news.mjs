/*
 * KB GIS — 무료 뉴스 자동 수집기 (zero-dependency)
 *
 * Google 뉴스 RSS(무료, API키 불필요)에서 해외대체투자 관련 기사를 모아
 * 앱이 읽는 news.json 으로 저장합니다. GitHub Actions 스케줄러가 주기적으로
 * 실행합니다 (.github/workflows/collect-news.yml).
 *
 *   node scripts/collect-news.mjs            # 수집 후 news.json 갱신
 *   node scripts/collect-news.mjs --selftest # 네트워크 없이 파서/분류 테스트
 */
import { readFile, writeFile, mkdir, readdir, unlink } from 'fs/promises';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
// 본문 정제 규칙은 앱과 같은 파일을 쓴다(article-clean.js) — 기준이 어긋나지 않게.
const AC = require('../article-clean.js');
// 본문 추출 엔진: Mozilla Readability + linkedom (package.json). 설치돼 있지 않으면
// (예: 로컬 셀프테스트) 기존 정규식 추출로 자동 폴백한다.
let Readability = null, parseHTML = null;
try { ({ Readability } = require('@mozilla/readability')); ({ parseHTML } = require('linkedom')); } catch { /* 폴백 */ }

// 검색어: placement agent 관점의 해외 alternative investment fund 중심.
// (1) 글로벌 펀드레이징/자산군  (2) 글로벌 GP  (3) 국내 LP의 해외 출자.
const QUERIES = [
  // (1) 글로벌 펀드레이징 · 자산군 (영어)
  'private equity fund final close billion',
  'private credit fund close billion',
  'infrastructure fund final close billion',
  'real estate fund close billion',
  'aviation OR aircraft leasing fund close',
  'secondaries fund final close',
  'alternative investment fund launch',
  'private fund fundraising final close',
  'placement agent private capital',
  // (2) 글로벌 GP (OR 그룹)
  'Blackstone OR Apollo OR KKR OR Carlyle OR Ares fund',
  'BlackRock OR Brookfield OR EQT OR CVC OR TPG fund',
  '"Bain Capital" OR Advent OR Permira OR "Warburg Pincus" fund',
  'Oaktree OR "Blue Owl" OR HPS OR "Sixth Street" credit fund',
  '"Partners Group" OR Ardian OR "Hamilton Lane" OR StepStone',
  '"Global Infrastructure Partners" OR Stonepeak OR "I Squared" OR Macquarie infrastructure',
  // (3) 국내 LP 의 해외 대체투자 (한국어 · 해외 맥락)
  '국민연금 해외 (사모 OR 인프라 OR 부동산 OR 사모대출)',
  '한국투자공사 해외 (사모 OR 인프라 OR 부동산)',
  '교직원공제회 해외 (대체투자 OR 사모 OR 출자)',
  '행정공제회 해외 (대체투자 OR 인프라 OR 부동산)',
  '군인공제회 해외 (대체투자 OR 사모 OR 출자)',
  '과학기술인공제회 해외 (대체투자 OR 출자)',
  '국내 기관 해외 대체투자 출자 약정',
  '연기금 공제회 해외 사모펀드 출자',
  '보험사 해외 (사모대출 OR 대체투자)',
  '한국 LP 해외 사모펀드 OR PEF 출자',
  // (4) CIO·조직/인사 (기관별 운용 사령탑) — insights.json 자동 갱신용
  '국민연금 (기금이사 OR CIO OR 기금운용본부장) (선임 OR 공모 OR 내정)',
  '(교직원공제회 OR 행정공제회 OR 군인공제회 OR 사학연금) CIO (선임 OR 내정 OR 공모)',
  '연기금 OR 공제회 CIO (선임 OR 인선 OR 영입)',
  // 인사 강화 — 공제회·중앙회 전반의 CIO·운용임원·조직 인사 (예: 경찰공제회 신임 CIO)
  '(경찰공제회 OR 대한소방공제회 OR 건설근로자공제회 OR 과학기술인공제회 OR 노란우산) (CIO OR 자금운용 OR 본부장 OR 이사) (선임 OR 임명 OR 공모 OR 내정)',
  '(공제회 OR 중앙회 OR 연기금) (CIO OR 기금이사 OR 자금운용본부장 OR 운용본부장) (선임 OR 임명 OR 내정 OR 영입 OR 공모 OR 인선) when:30d',
  '(국민연금 OR 한국투자공사 OR 새마을금고 OR 농협 OR 수협) (CIO OR 자금운용 OR 운용역) (인사 OR 선임 OR 조직개편)',
  // (5) 자산군별 수익률 — insights.json 자동 갱신용
  '국민연금 (대체투자 OR 사모투자 OR 부동산 OR 인프라) 수익률',
  '연기금 공제회 대체투자 수익률',
  // (6) 최신성 강화 — Google 뉴스 when: 연산자로 최근 3일 기사 우선 수집.
  // (RSS 기본 검색은 날짜순이 아니어서 오늘 기사가 묻히는 문제를 보완)
  'private equity OR private credit OR infrastructure fund (close OR raise) billion when:3d',
  '(국민연금 OR 교직원공제회 OR 행정공제회 OR 군인공제회 OR 사학연금) (대체투자 OR 사모 OR 인프라 OR 부동산 OR 출자) when:3d',
  '연기금 OR 공제회 (해외 대체투자 OR 사모펀드 OR 사모대출 OR 출자) when:3d',
  '(Blackstone OR KKR OR Apollo OR Ares OR Carlyle OR Brookfield) fund (close OR raise) when:3d',
  // (7) 관련 마켓 뉴스 — 딜·시장 동향·전망 (펀드 결성 외 대체투자 시장 뉴스)
  'private equity OR private credit OR infrastructure market (outlook OR trend OR deal) when:7d',
  'private equity OR private credit OR private markets (deal OR M&A OR acquisition) billion when:7d',
  '글로벌 (사모펀드 OR 사모대출 OR 인프라 OR 부동산) 시장 (전망 OR 동향)',
  '해외 대체투자 (시장 OR 동향 OR 전망 OR 딜)',
  'private markets OR alternative assets (fundraising OR dry powder OR outlook) when:7d',
  // (8) 글로벌 GP 딜·동향 강화 — GP News 폭넓게 수집 (펀드 결성 외 인수·매각·투자)
  '(Blackstone OR KKR OR Apollo OR Carlyle OR Ares OR Brookfield) (acquires OR buys OR invests OR deal OR billion) when:7d',
  '(EQT OR CVC OR TPG OR "Bain Capital" OR Permira OR Advent OR "Warburg Pincus") (deal OR acquire OR fund OR billion) when:7d',
  '(BlackRock OR "Blue Owl" OR Oaktree OR HPS OR "Sixth Street" OR "Partners Group") (private OR credit OR fund OR deal) when:7d',
  'private equity firm (acquire OR take private OR buyout OR billion) deal when:7d',
  'global private equity OR private credit OR infrastructure (fund OR deal OR raise OR acquisition) when:3d',
  '블랙스톤 OR KKR OR 아폴로 OR 칼라일 OR 브룩필드 OR 블랙록 (인수 OR 투자 OR 펀드 OR 매각)',
  // (9) 업권별 국내 LP 확대 — 연기금·국민연금 쏠림을 완화하고 공제회·중앙회·
  //     은행·보험·운용/증권의 해외 대체투자 출자·투자 뉴스를 폭넓게 수집.
  // 공제회
  '(경찰공제회 OR 대한소방공제회 OR 과학기술인공제회 OR 노란우산 OR 건설공제조합 OR 전문건설공제조합 OR 한국지방재정공제회) (대체투자 OR 사모 OR 사모대출 OR 인프라 OR 부동산 OR 출자 OR 투자)',
  '공제회 (해외 OR 글로벌) (대체투자 OR 사모펀드 OR 사모대출 OR 인프라 OR 부동산 OR 출자 OR 코인베스트)',
  // 중앙회
  '(새마을금고 OR 농협 OR 수협 OR 신협 OR 산림조합 OR 중소기업중앙회) (대체투자 OR 사모 OR 사모대출 OR 인프라 OR 부동산 OR 출자 OR PEF)',
  '새마을금고중앙회 OR 농협중앙회 (해외 OR 글로벌) (대체투자 OR 사모 OR 인프라 OR 부동산 OR 출자)',
  // 은행
  '(산업은행 OR 기업은행 OR 수출입은행 OR 국민은행 OR 신한은행 OR 하나은행 OR 우리은행 OR 농협은행) (해외 대체투자 OR 인프라 금융 OR 사모대출 OR 셀다운 OR PF)',
  // 보험
  '(삼성생명 OR 한화생명 OR 교보생명 OR 삼성화재 OR 현대해상 OR DB손해보험 OR 미래에셋생명) (해외 대체투자 OR 사모대출 OR 인프라 OR 부동산 OR 사모펀드 OR 출자)',
  '보험사 (해외 OR 글로벌) (사모대출 OR 대체투자 OR 인프라 OR 부동산) (투자 OR 출자)',
  // 운용·증권 (셀다운·GP·자기계정 투자)
  '(미래에셋 OR 삼성 OR KB OR 한국투자 OR NH OR 신한 OR 하나 OR 메리츠) (증권 OR 자산운용) (해외 부동산 OR 인프라 OR 사모대출 OR 셀다운 OR 대체투자)',
  '(이지스자산운용 OR 마스턴투자운용 OR 코람코 OR 하나대체투자 OR 삼성SRA) (해외 OR 글로벌) (부동산 OR 인프라 OR 펀드 OR 인수)',
  // 연기금(국민연금 외)
  '(사학연금 OR 공무원연금 OR 우정사업본부 OR 노동부 기금) (해외 대체투자 OR 사모 OR 인프라 OR 부동산 OR 출자)',
  // 국내 기관 일반 (LP 출자·앵커 뉴스)
  '국내 (연기금 OR 공제회 OR 보험사 OR 기관투자자) (해외 사모펀드 OR PEF OR 사모대출 OR 인프라 OR 부동산) (출자 OR 앵커 OR 커밋 OR 약정) when:30d',
  '(LP OR 기관투자자) 해외 (블라인드펀드 OR PEF OR 사모대출) 출자 when:30d',
  // (10) 추적 기관의 자본확충 — 유상증자·증자·발행어음·IMA (투자여력 확대 신호)
  '(KB증권 OR 미래에셋증권 OR 한국투자증권 OR NH투자증권 OR 신한투자증권 OR 삼성증권 OR 메리츠증권 OR 키움증권 OR 하나증권) (유상증자 OR 자본확충 OR 발행어음 OR IMA)',
  '(증권사 OR 보험사 OR 캐피탈 OR 공제회) (유상증자 OR 자본확충) when:30d',
  // (11) 자산군별 플래그십·GP 펀드 뉴스 — 사모 대체투자 펀드 전반 (마켓뉴스 확충)
  'flagship fund (private equity OR private credit OR infrastructure OR real estate) (launch OR close OR raise) when:14d',
  '(secondaries OR continuation) fund (close OR raise OR launch) when:14d',
  'private real estate fund OR real estate debt fund (close OR raise) when:14d',
  '(사모펀드 OR 사모대출펀드 OR 인프라펀드 OR 부동산펀드 OR 세컨더리펀드) (결성 OR 조성 OR 클로징 OR 자금 모집) when:14d',
  // (13) 국민연금 광역 — '해외' 키워드 없는 국내외 총괄 기사도 수집
  //      (예: "[단독] 248조로 불어난 국민연금 대체 투자" 유형의 단독 기사)
  '국민연금 (대체투자 OR 기금운용 OR 사모 OR 인프라 OR 부동산) when:7d',
  // (14) 지방이전 이슈 — 공제회·국책은행·연기금의 본사/기금운용본부 지방이전.
  //      운용인력 이탈·조직 재편으로 이어져 LP 커버리지에 직접 영향을 준다.
  '(공제회 OR 연기금 OR 국책은행 OR 정책금융기관) (지방이전 OR 본사 이전) when:30d',
  '(산업은행 OR 수출입은행 OR 기업은행 OR 신용보증기금 OR 기술보증기금) (부산 이전 OR 지방이전 OR 본점 이전) when:30d',
  '(국민연금 OR 기금운용본부) (전주 OR 전북 OR 서울사무소) (이전 OR 인력 OR 이탈 OR 논란) when:30d',
  '(교직원공제회 OR 행정공제회 OR 군인공제회 OR 과학기술인공제회 OR 노란우산 OR 중소기업중앙회 OR 새마을금고중앙회) (본사 이전 OR 지방 이전 OR 사옥 이전)',
  '2차 공공기관 (이전 OR 이전지) (금융 OR 기금 OR 공제회 OR 연기금) when:30d',
  '(혁신도시 OR 제2금융중심지 OR 금융중심지) (금융공기업 OR 기금 OR 공제회 OR 이전) when:30d',
  '(공제회 OR 연기금 OR 국책은행) 이전 (운용인력 OR 인력 이탈 OR 반발 OR 노조) when:30d',
  // (15) 대체투자 운용조직 실무 인사 — CIO 외 본부장·실장·팀장급까지 추적.
  '(연기금 OR 공제회 OR 보험사 OR 중앙회) (대체투자본부장 OR 대체투자실장 OR 대체투자팀장 OR 해외투자팀장 OR 인프라팀장) (선임 OR 임명 OR 영입 OR 승진)',
  '(국민연금 OR 한국투자공사 OR 교직원공제회 OR 행정공제회 OR 군인공제회 OR 새마을금고중앙회 OR 사학연금) (본부장 OR 실장 OR 팀장) (인사 OR 선임 OR 임명 OR 승진 OR 영입) when:30d',
  '대체투자 (운용역 OR 심사역 OR 본부장 OR 실장 OR 팀장) (선임 OR 영입 OR 이동 OR 이직) when:30d',
  '(증권사 OR 자산운용사) 대체투자 (본부장 OR 부문대표 OR 팀장) (영입 OR 선임) when:30d',
  // (16) AUM·운용규모 스크리닝 — 기관 운용자산을 기사에서 자동 최신화.
  '(국민연금 OR 한국투자공사 OR 교직원공제회 OR 행정공제회 OR 군인공제회 OR 과학기술인공제회 OR 경찰공제회 OR 새마을금고중앙회 OR 사학연금) (운용자산 OR 자산 규모 OR 기금 규모 OR AUM) (조원 OR 돌파 OR 증가)',
  '(연기금 OR 공제회 OR 중앙회) 운용자산 조원 when:30d',
  '(Blackstone OR KKR OR Apollo OR Carlyle OR Brookfield OR Ares OR "Blue Owl" OR EQT OR TPG) "assets under management" billion when:30d',
  // (17) 커버리지 GP — 방한·미팅 예정 운용사 뉴스 상시 추적
  '("TwentyFour Asset Management" OR Vontobel) (ABS OR "asset backed" OR credit OR fund) when:30d',
  'European ABS OR "asset backed finance" fund (launch OR close OR raise) when:14d',
  // (12) Aviation — 항공기 리스·항공기금융 펀드/딜 (BBAM 등)
  '(BBAM OR Castlelake OR "Carlyle Aviation" OR "DAE Capital" OR Avolon OR AerCap OR "Air Lease") (fund OR aircraft OR leasing OR order) when:14d',
  'aircraft leasing fund OR aviation fund (close OR raise OR invest) when:14d',
  '항공기 (리스 OR 금융 OR 펀드) (투자 OR 조성 OR 출자 OR 결성)',
  // ── 해외대체투자 확대 (영문 검색어는 미국판 구글 뉴스로 조회 — fetchQuery 참고) ──
  // (18) 글로벌 펀드레이징 — 클로징·하드캡·신규 비히클
  '"final close" (private equity OR infrastructure OR credit OR "real estate" OR secondaries) fund when:7d',
  '("first close" OR "hard cap") fund (private equity OR infrastructure OR "private credit") when:14d',
  '("interim close" OR "second close") fund when:30d',
  '(fund OR vehicle) (targeting OR "launches fundraising" OR "begins fundraising" OR "in market") (private equity OR infrastructure OR "private credit" OR "real estate") when:14d',
  '(sixth OR seventh OR eighth OR ninth OR tenth OR flagship) fund (closes OR raises) billion when:14d',
  '(블라인드펀드 OR PEF) (1차 클로징 OR 최종 결성 OR 펀드레이징) when:30d',
  '"private credit" fund (raises OR closes OR launches) billion when:7d',
  '("direct lending" OR "asset-based finance" OR "asset-backed finance" OR "specialty finance") fund (closes OR raises OR launches) when:14d',
  'infrastructure fund (closes OR raises OR launches) (billion OR million) when:14d',
  '"real estate" (debt OR credit OR opportunistic OR "value-add") fund (closes OR raises) when:14d',
  '(secondaries OR "continuation fund" OR "continuation vehicle" OR "GP-led") (closes OR raises OR deal) when:14d',
  '("NAV loan" OR "NAV lending" OR "NAV financing" OR "fund finance") private equity when:30d',
  '("GP stakes" OR "GP stake" OR "minority stake") (asset manager OR private equity firm) when:30d',
  '"co-investment" (fund OR program OR vehicle) private equity (closes OR raises) when:30d',
  '(evergreen OR semi-liquid OR "interval fund" OR "private wealth") ("private credit" OR "private equity" OR infrastructure) fund when:14d',
  // (19) 글로벌 LP 출자 동향 — 연기금·국부펀드·한국 기관의 해외 약정
  'pension (commits OR commitment OR allocates) ("private equity" OR "private credit" OR infrastructure OR "real estate") fund when:7d',
  '(CalPERS OR CalSTRS OR "Ontario Teachers" OR CPP OR GIC OR ADIA OR "Future Fund" OR APG OR PGGM) (private OR infrastructure OR credit) (commit OR invest OR allocation) when:14d',
  '(Korea OR Korean) ("National Pension Service" OR "Korea Investment Corporation" OR pension OR insurer OR "Teachers\' Credit Union") (fund OR "private equity" OR infrastructure OR "real estate" OR credit) when:30d',
  '"sovereign wealth fund" (invests OR commits OR backs) (infrastructure OR "private equity" OR "private credit") when:14d',
  // (20) 해외 딜 — 인수·매각·자산 거래
  '"private equity" (acquires OR "agreed to acquire" OR "take-private" OR "take private") billion when:3d',
  '("data center" OR "data centre") (private equity OR infrastructure fund OR investor) (acquire OR invest OR stake) when:7d',
  '("energy transition" OR renewables OR "battery storage") infrastructure (fund OR investor) (acquire OR invest) when:7d',
  '(logistics OR multifamily OR "student housing" OR hotel OR office) portfolio ("real estate fund" OR "private equity") (acquires OR sells OR buys) when:7d',
  '(aircraft OR aviation) (lessor OR leasing) (acquire OR portfolio OR fund OR financing) when:14d',
  // (21) 글로벌 GP 확대
  '(Hg OR Cinven OR "Thoma Bravo" OR "Vista Equity" OR "Hellman & Friedman" OR "Silver Lake" OR "General Atlantic") (fund OR deal OR acquire) when:14d',
  '(Macquarie OR Stonepeak OR "Global Infrastructure Partners" OR "I Squared" OR "Copenhagen Infrastructure" OR DigitalBridge) (fund OR acquire OR invest) when:14d',
  '(Golub OR Antares OR "HPS Investment" OR "Blue Owl" OR "Sixth Street" OR "Oak Hill" OR Churchill OR Ares) ("direct lending" OR "private credit") when:14d',
  '(Starwood OR "Blackstone Real Estate" OR "Brookfield Asset" OR PGIM OR Nuveen OR LaSalle OR Hines) "real estate" (fund OR acquire OR sells) when:14d',
  '("Goldman Sachs Alternatives" OR "Morgan Stanley Investment Management" OR "J.P. Morgan Asset" OR "Neuberger Berman" OR "Hamilton Lane" OR StepStone OR Coller OR Lexington) (fund OR close OR secondaries) when:14d',
  '(Vontobel OR TwentyFour OR Pemberton OR Arcmont OR "Park Square" OR Tikehau OR Hayfin) (credit OR ABS OR fund) when:30d',
  // (22) 국내 기관의 해외 딜·출자 (한글)
  '(국민연금 OR 한국투자공사 OR KIC) (해외 OR 미국 OR 유럽 OR 호주) (인수 OR 투자 OR 출자 OR 공동투자) when:14d',
  '해외 부동산 (인수 OR 매입 OR 투자 OR 매각) (공제회 OR 연기금 OR 보험사 OR 증권사 OR 자산운용) when:14d',
  '해외 인프라 (투자 OR 인수 OR 출자) (공제회 OR 연기금 OR 보험사 OR 국내 기관) when:14d',
  '위탁운용사 (선정 OR 모집 OR 공고) (해외 OR 글로벌) (사모 OR 인프라 OR 부동산 OR 사모대출 OR 세컨더리) when:30d',
  '(해외 OR 글로벌) (세컨더리 OR 코인베스트 OR 공동투자 OR NAV) (연기금 OR 공제회 OR 보험사) when:30d',
  '(해외 OR 글로벌) 사모대출 (펀드 OR 투자) (출자 OR 약정 OR 선정) when:14d',
  '(미국 OR 유럽 OR 영국 OR 독일 OR 호주 OR 일본) (오피스 OR 물류센터 OR 데이터센터 OR 호텔) (국내 투자자 OR 국내 기관 OR 한국 투자자) when:30d',
];

// ── (선택) 무료 LLM 요약: Google Gemini ──────────────────
// 저장소 Secrets 에 GEMINI_API_KEY 가 있으면 "기사 본문"을 근거로 진짜 요약을
// 만듭니다. 모델명은 시간이 지나며 폐기되므로 후보를 순서대로 시도하고, 처음
// 성공한 모델을 이후에 재사용합니다(GEMINI_MODEL 로 직접 지정 가능).
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
// 번역은 모델별 무료 한도가 따로 잡히므로, 한 모델이 한도(429)에 걸리면 다음 모델로 넘어간다.
// '-latest' 별칭은 구글이 현행 모델로 계속 연결해 주므로 모델 폐기(404)에 강하다.
const MODEL_CANDIDATES = [process.env.GEMINI_MODEL, 'gemini-flash-lite-latest', 'gemini-flash-latest', 'gemini-2.5-flash-lite', 'gemini-2.5-flash'].filter(Boolean);
const EXHAUSTED = new Set();
let WORKING_MODEL = '';
// 번역 예산(회차당) — 무료 한도(분당·일일 요청 수)를 넘지 않게 제목은 묶어서, 본문은 기사당 1회.
const TR_DAYS = 3;
const TITLE_BATCH = 30, TITLE_CALLS = 8, BODY_CALLS = 20, LLM_GAP_MS = 6500;
let LLM_BLOCKED = false;
const claudeOn = () => !!ANTHROPIC_API_KEY && !CLAUDE_BLOCKED;
const llmDone = () => !claudeOn() && (LLM_BLOCKED || !GEMINI_API_KEY);                         // 429(한도 초과)를 받으면 이번 회차는 번역 중단

// ── Claude(Anthropic API) — 저장소 Secrets 에 ANTHROPIC_API_KEY 가 있으면 번역·펀드명 추출에 먼저 쓴다 ──
// 모델은 저장소 변수 ANTHROPIC_MODEL 로 바꿀 수 있다(기본 claude-opus-5). 실패·한도 초과 시 Gemini 로 넘어간다.
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5';
let claudeClient = null, CLAUDE_BLOCKED = false;
async function claudeRaw(prompt, maxTok) {
  if (!ANTHROPIC_API_KEY || CLAUDE_BLOCKED) return null;
  try {
    if (!claudeClient) { const { default: Anthropic } = await import('@anthropic-ai/sdk'); claudeClient = new Anthropic({ apiKey: ANTHROPIC_API_KEY }); claudeRaw.A = Anthropic; }
    const res = await claudeClient.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: Math.max(maxTok, 2048) * 2,
      output_config: { effort: 'low' },                 // 번역·추출은 깊은 추론이 필요 없는 작업
      messages: [{ role: 'user', content: prompt }],
    });
    if (res.stop_reason === 'refusal') return null;
    const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    return text || null;
  } catch (e) {
    const A = claudeRaw.A;
    if (A && (e instanceof A.RateLimitError || e instanceof A.AuthenticationError || e instanceof A.PermissionDeniedError)) {
      console.warn(`claude ${CLAUDE_MODEL}: ${e.status} — 이번 회차는 Gemini 로`); CLAUDE_BLOCKED = true;
    } else console.warn(`claude ${CLAUDE_MODEL} error: ${e.status || ''} ${String(e.message || e).slice(0, 120)}`);
    return null;
  }
}

// LLM 호출 → 응답 텍스트. Claude(키가 있으면) → Gemini(모델 폴백) 순. 실패 시 null.
async function llmRaw(prompt, maxTok) {
  const viaClaude = await claudeRaw(prompt, maxTok);
  if (viaClaude) return viaClaude;
  return geminiRaw(prompt, maxTok);
}
async function geminiRaw(prompt, maxTok) {
  if (!GEMINI_API_KEY || LLM_BLOCKED) return null;
  const models = [WORKING_MODEL, ...MODEL_CANDIDATES].filter((m, i, a) => m && a.indexOf(m) === i && !EXHAUSTED.has(m));
  if (!models.length) { LLM_BLOCKED = true; return null; }
  for (const model of models) {
    try {
      const gen = { temperature: 0.2, maxOutputTokens: maxTok };
      if (/flash/.test(model)) gen.thinkingConfig = { thinkingBudget: 0 };   // 추론 토큰 없이 번역만
      const call = (g) => fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: g }) }
      );
      let res = await call(gen);
      if (res.status === 400 && gen.thinkingConfig) { delete gen.thinkingConfig; res = await call(gen); }   // 추론 끄기를 지원하지 않는 모델
      if (res.status === 404 || res.status === 400) { console.warn(`gemini model ${model} unavailable (${res.status}), trying next`); EXHAUSTED.add(model); if (MODEL_CANDIDATES.every((m) => EXHAUSTED.has(m))) { LLM_BLOCKED = true; return null; } continue; }
      if (res.status === 429) {
        console.warn(`gemini ${model} 429 — 다음 모델로`);
        EXHAUSTED.add(model); if (WORKING_MODEL === model) WORKING_MODEL = '';
        if (MODEL_CANDIDATES.every((m) => EXHAUSTED.has(m))) { LLM_BLOCKED = true; return null; }
        continue;
      }
      if (!res.ok) { console.warn(`gemini ${model} HTTP ${res.status}`); return null; }
      const j = await res.json();
      const text = (((j.candidates || [])[0] || {}).content || {}).parts?.[0]?.text || '';
      if (text) { WORKING_MODEL = model; return text; }
      return null;
    } catch (e) { console.warn(`gemini ${model} error: ${e.message}`); }
  }
  return null;
}
const TR_RULES = '해외대체투자(사모펀드·사모대출·인프라·부동산·항공기금융) 전문 기자처럼 자연스러운 한국어로 옮긴다. 사실·숫자·통화 단위는 그대로 두고 금액은 "$5bn → 50억 달러"처럼 한국식으로 쓴다. 사람·회사·운용사·기관·펀드·상품 이름은 한글로 음역하지 말고 원문의 영문 표기를 그대로 쓴다(예: Blackstone, KKR, Apollo, Stephen Schwarzman, CalPERS, Blackstone Real Estate Partners X — "블랙스톤"처럼 쓰지 않는다). 단, 한국 기관·한국 기업·한국인은 한글 공식 명칭을 쓴다(예: National Pension Service → 국민연금, Korea Investment Corp → 한국투자공사, Lee Kyu-hong → 이규홍). 국가·도시 등 지명은 한글로 쓴다. 업계 용어는 국내 통용 표현(LP·GP, 펀드레이징, 캐피탈콜, 세컨더리, 사모대출 등)을 쓴다. 뜻을 더하거나 빼지 않는다.';
const parseJsonArr = (text) => { const m = String(text || '').match(/\[[\s\S]*\]/); try { const v = JSON.parse(m ? m[0] : text); return Array.isArray(v) ? v : null; } catch { return null; } };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
// 영문 제목 여러 개 → 한국어 제목 배열(같은 순서)
async function translateTitles(titles) {
  const prompt = `${TR_RULES}\n다음 영문 뉴스 제목들을 한국어 기사 제목으로 번역하라. 입력과 같은 순서·같은 개수의 JSON 문자열 배열만 출력하라(설명·마크다운 금지).\n${JSON.stringify(titles)}`;
  const out = parseJsonArr(await llmRaw(prompt, 4096));
  return out && out.length === titles.length ? out.map((x) => String(x || '').trim()) : null;
}
// 영문 본문 문단 배열 → 한국어 문단 배열(문단 수 동일 — 앱에서 한 문단씩 짝지어 보여 준다)
async function translateParas(title, paras) {
  const prompt = `${TR_RULES}\n다음은 기사 "${title}"의 본문 문단 배열이다. 각 문단을 한국어로 번역해 입력과 같은 순서·같은 개수의 JSON 문자열 배열만 출력하라(문단을 합치거나 나누지 말 것, 설명·마크다운 금지).\n${JSON.stringify(paras)}`;
  const out = parseJsonArr(await llmRaw(prompt, 8192));
  if (!out || out.length !== paras.length) return null;
  const res = out.map((x) => String(x || '').trim());
  // 번역되지 않고 영문 그대로 돌아온 문단이 절반을 넘으면 실패로 본다(다음 회차에 다시)
  const untranslated = res.filter((x, i) => !/[가-힣]/.test(x) && /[A-Za-z]{3}/.test(paras[i])).length;
  return untranslated > res.length / 2 ? null : res;
}
// 본문이 바뀌면 번역을 다시 하도록 원문 문단의 짧은 지문을 함께 저장한다.
// TV(번역 규칙 버전)가 바뀌면 최근 기사의 제목·본문 번역을 새 규칙으로 다시 한다.
const TV = 2;                                  // 2: 해외 인명·기관명은 영문 유지
function parasHash(paras) {
  let h = 0; const s = paras.join('\n');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return 'v' + TV + ':' + (h >>> 0).toString(36) + ':' + paras.length;
}
export function enParas(body) {
  return String(body || '').split(/\n+/).map((x) => x.trim()).filter(Boolean);
}
// ── 펀드레이징 기사 → 정확한 펀드명·단계·금액·일자 (본문 근거) ──────────
// 제목만으로는 "블랙록 인프라 펀드"처럼 뭉뚱그려지므로, 본문에서 공식 펀드명과 해당 단계가
// 실제로 일어난 날짜(기사에 적혀 있으면)를 뽑는다. 본문에 없는 값은 지어내지 않고 비운다.
const FRX_BUDGET = 40;
async function extractFundLLM(a) {
  const body = String(a.body || '').slice(0, 3500);
  const prompt = `You extract private-markets fundraising facts from a news article. Use ONLY facts stated in the text; leave a field "" if not stated. Output ONLY JSON:
{"fund":"official fund name in English (Latin script) exactly as the fund is officially called; if the article is in Korean and gives only a Korean name, keep it as written; never translate an English name into Korean (e.g. \"Blackstone Real Estate Partners X\", \"KKR Global Infrastructure Investors V\"); \"\" if no specific fund is named","manager":"the firm that manages and is raising THIS fund (not other firms merely mentioned, e.g. the manager of a fund being bought in a tender offer)","stage":"one of: launch, first_close, interim_close, final_close, close, none (use none if the article is not about raising capital for a fund, e.g. tender offers, secondary share purchases, deals, earnings)","amount":"amount raised at this stage as written (e.g. $5.2bn)","target":"fundraising target as written","hardcap":"hard cap as written","date":"YYYY-MM-DD date the close/launch happened if the text states it, else \"\"","strategy":"one of: Private Equity, Infrastructure, Real Estate, Private Credit, Secondaries, Venture Capital, Aviation, Other"}
Article date: ${a.ts ? a.ts.slice(0, 10) : ''}
TITLE: ${a.ko}
TEXT: ${body}`;
  const text = await llmRaw(prompt, 600);
  if (!text) return null;
  const m = text.match(/\{[\s\S]*\}/);
  try {
    const o = JSON.parse(m ? m[0] : text);
    if (!o || typeof o !== 'object') return null;
    const str = (v) => (typeof v === 'string' ? v.trim() : '');
    let date = /^\d{4}-\d{2}-\d{2}$/.test(str(o.date)) ? str(o.date) : '';
    if (date && a.ts && date > a.ts.slice(0, 10)) date = '';            // 기사보다 미래 날짜는 버림
    return { v: 1, fund: str(o.fund).slice(0, 120), manager: str(o.manager).slice(0, 80), stage: str(o.stage), amount: str(o.amount), target: str(o.target), hardcap: str(o.hardcap), date, strategy: str(o.strategy) };
  } catch { return null; }
}
async function fundPass(list) {
  if (!GEMINI_API_KEY && !ANTHROPIC_API_KEY) return 0;
  const cand = list.filter((a) => !a.frx && extractFundraising(a)).sort((x, y) => (x.ts < y.ts ? 1 : -1));
  let n = 0;
  for (const a of cand) {
    if (n >= FRX_BUDGET || llmDone()) break;
    const r = await extractFundLLM(a);
    n++;
    if (r) a.frx = r;
    await pause(claudeOn() ? 300 : LLM_GAP_MS);
  }
  return list.filter((a) => a.frx).length;
}

// 영문 기사 번역 패스 — 제목(묶음) → 본문(최신 기사부터). 결과: a.tko(한글 제목), a.bodyKo = { h, p: [...] }
async function translatePass(list) {
  if (!GEMINI_API_KEY && !ANTHROPIC_API_KEY) return { titles: 0, bodies: 0 };
  // 번역은 최근 3일 기사만 — 그보다 오래된 기사는 새로 따라잡지 않는다(이미 된 번역은 유지)
  const cut = new Date(Date.now() - TR_DAYS * 86400000).toISOString();
  const en = list.filter((a) => a.lang === 'en' && (a.ts || '') >= cut).sort((x, y) => (x.ts < y.ts ? 1 : -1));
  let titles = 0, bodies = 0, calls = 0;
  const needT = en.filter((a) => !a.tko || a.tv !== TV);
  for (let i = 0; i < needT.length && calls < TITLE_CALLS * (claudeOn() ? 4 : 1) && !llmDone(); i += TITLE_BATCH) {
    const chunk = needT.slice(i, i + TITLE_BATCH);
    const out = await translateTitles(chunk.map((a) => a.ko));
    calls++;
    if (out) chunk.forEach((a, k) => { if (out[k] && /[가-힣]/.test(out[k])) { a.tko = AC.enNames(out[k]); a.tv = TV; titles++; } });
    await pause(claudeOn() ? 300 : LLM_GAP_MS);
  }
  let bcalls = 0;
  for (const a of en) {
    if (bcalls >= BODY_CALLS * (claudeOn() ? 3 : 1) || llmDone()) break;
    if (!a.body || String(a.body).length < 300) continue;
    let paras = enParas(a.body);
    // 너무 긴 기사는 앞부분 9,000자까지만(한 번에 번역 가능한 분량)
    let acc = 0; paras = paras.filter((p) => (acc += p.length) <= 9000);
    if (!paras.length) continue;
    const h = parasHash(paras);
    if (a.bodyKo && a.bodyKo.h === h) continue;
    const out = await translateParas(a.tko || a.ko, paras);
    bcalls++;
    if (out) { a.bodyKo = { h, n: paras.length, p: out.map((x) => AC.enNames(x.replace(/[\u4e00-\u9fff]+\(([^()]{1,30})\)/g, '$1'))) }; bodies++; }   // "伦敦(런던)" 같은 한자 섞임 정리
    await pause(claudeOn() ? 300 : LLM_GAP_MS);
  }
  return { titles, bodies };
}

// ── 분류 사전 ────────────────────────────────────────────
// 국내 LP 기관 (업권별) — 첨부 엑셀 기반 자동 생성. 긴 이름이 먼저 매칭됩니다.
const KOREAN_LPS = [
  [/사립학교교직원연금공단|사학연금|Korea Teachers Pension/i, '사립학교교직원연금공단', '연기금'],
  [/수산업협동조합중앙회|National Federation of Fisheries Cooperatives/i, '수산업협동조합중앙회', '중앙회'],
  [/파인스트리트자산운용|Pine Street Asset Management/i, '파인스트리트자산운용', '자산운용사'],
  [/하나대체투자자산운용|Hana Alternative Asset Management/i, '하나대체투자자산운용', '자산운용사'],
  [/기계설비건설공제조합|Korea Mechanical Construction Financial Cooperative/i, '기계설비건설공제조합', '기타'],
  [/한국성장금융투자운용|Korea Growth Investment Corp\./i, '한국성장금융투자운용', '기타'],
  [/대한지방행정공제회|행정공제회|\bPOBA\b|Public Officials Benefit Association/i, '대한지방행정공제회', '공제회'],
  [/엔지니어링공제조합|Korea Engineering Financial Cooperative/i, '엔지니어링공제조합', '공제회'],
  [/한국지방재정공제회|Korea Local Finance Association/i, '한국지방재정공제회', '공제회'],
  [/iM라이프생명보험|iM라이프생명|iM Life Insurance/i, 'iM라이프생명보험', '보험사'],
  [/신한라이프생명보험|신한라이프생명|Shinhan Life Insurance/i, '신한라이프생명보험', '보험사'],
  [/메리츠화재해상보험|메리츠화재해상|Meritz Fire & Marine Insurance/i, '메리츠화재해상보험', '보험사'],
  [/KB라이프생명보험|KB라이프생명|KB Life Insurance/i, 'KB라이프생명보험', '보험사'],
  [/메트라이프생명보험|메트라이프생명|MetLife Insurance/i, '메트라이프생명보험', '보험사'],
  [/처브라이프생명보험|처브라이프생명|Chubb Life Insurance/i, '처브라이프생명보험', '보험사'],
  [/농업협동조합중앙회|National Agricultural Cooperative Federation/i, '농업협동조합중앙회', '중앙회'],
  [/신용협동조합중앙회|National Credit Union Federation of Korea/i, '신용협동조합중앙회', '중앙회'],
  [/삼성SRA자산운용|Samsung SRA Asset Management/i, '삼성SRA자산운용', '자산운용사'],
  [/NH아문디자산운용|NH-Amundi Asset Management/i, 'NH아문디자산운용', '자산운용사'],
  [/\bCompany H\b(?! ?[a-z])/, 'Company H', '기타'],
  [/한국교직원공제회|교직원공제회|Korea Teachers' Credit Union/i, '한국교직원공제회', '공제회'],
  [/전문건설공제조합|Korea Specialty Contractors Financial Cooperative/i, '전문건설공제조합', '공제회'],
  [/건설근로자공제회|Construction Workers Mutual Aid Association/i, '건설근로자공제회', '공제회'],
  [/과학기술인공제회|Korea Scientists and Engineers Mutual-aid Association/i, '과학기술인공제회', '공제회'],
  [/전기공사공제조합|Korea Electrical Contractors Financial Cooperative/i, '전기공사공제조합', '공제회'],
  [/NH농협생명보험|NH농협생명|NH Life Insurance/i, 'NH농협생명보험', '보험사'],
  [/미래에셋생명보험|미래에셋생명|Mirae Asset Life Insurance/i, '미래에셋생명보험', '보험사'],
  [/푸본현대생명보험|푸본현대생명|Fubon Hyundai Life Insurance/i, '푸본현대생명보험', '보험사'],
  [/NH농협손해보험|NH농협손해/i, 'NH농협손해보험', '보험사'],
  [/삼성화재해상보험|삼성화재해상|Samsung Fire & Marine Insurance/i, '삼성화재해상보험', '보험사'],
  [/흥국화재해상보험|흥국화재해상|Heungkuk Fire & Marine Insurance/i, '흥국화재해상보험', '보험사'],
  [/현대해상화재보험|현대해상화재|Hyundai Marine & Fire Insurance/i, '현대해상화재보험', '보험사'],
  [/새마을금고중앙회|Korean Federation of Community Credit Cooperatives/i, '새마을금고중앙회', '중앙회'],
  [/미래에셋자산운용|Mirae Asset Global Investments/i, '미래에셋자산운용', '자산운용사'],
  [/키움투자자산운용|Kiwoom Asset Management/i, '키움투자자산운용', '자산운용사'],
  [/새마을금고복지회|MG Welfare Foundation/i, '새마을금고복지회', '기타'],
  [/공무원연금공단|공무원연금|Government Employees Pension Service/i, '공무원연금공단', '연기금'],
  [/대한소방공제회|Korea Fire Officials Mutual Aid Association/i, '대한소방공제회', '공제회'],
  [/SGI서울보증|Seoul Guarantee Insurance Company/i, 'SGI서울보증', '보험사'],
  [/라이나생명보험|라이나생명|Lina Life Insurance/i, '라이나생명보험', '보험사'],
  [/KDB생명보험|KDB생명|KDB Life Insurance/i, 'KDB생명보험', '보험사'],
  [/코리안리재보험|코리안리재|Korean Reinsurance Company/i, '코리안리재보험', '보험사'],
  [/AIA생명보험|AIA생명|AIA Life Insurance/i, 'AIA생명보험', '보험사'],
  [/ABL생명보험|ABL생명|ABL Life Insurance/i, 'ABL생명보험', '보험사'],
  [/중소기업중앙회|Korea Federation of SMEs/i, '중소기업중앙회', '중앙회'],
  [/산림조합중앙회|National Forestry Cooperative Federation/i, '산림조합중앙회', '중앙회'],
  [/저축은행중앙회|Korea Federation of Savings Banks/i, '저축은행중앙회', '중앙회'],
  [/MG새마을금고|\bKFCC\b/i, 'MG새마을금고', '은행'],
  [/한국수출입은행|수출입은행|The Export-Import Bank of Korea/i, '한국수출입은행', '은행'],
  [/IBK투자증권|IBK Investment & Securities/i, 'IBK투자증권', '증권사'],
  [/이지스자산운용|IGIS Asset Management/i, '이지스자산운용', '자산운용사'],
  [/마스턴투자운용|Mastern Investment Management/i, '마스턴투자운용', '자산운용사'],
  [/코람코자산신탁|KORAMCO/i, '코람코자산신탁', '자산운용사'],
  [/제이알투자운용|JR Investment Management/i, '제이알투자운용', '자산운용사'],
  [/NH농협캐피탈|NH Capital/i, 'NH농협캐피탈', '캐피탈'],
  [/우리금융캐피탈|Woori Financial Capital/i, '우리금융캐피탈', '캐피탈'],
  [/한국투자공사|\bKIC\b|Korea Investment Corporation/i, '한국투자공사', '연기금'],
  [/우정사업본부|Korea Post/i, '우정사업본부', '연기금'],
  [/건설공제조합|Construction Guarantee/i, '건설공제조합', '공제회'],
  [/교보생명보험|교보생명|Kyobo Life Insurance/i, '교보생명보험', '보험사'],
  [/하나생명보험|하나생명|Hana Life Insurance/i, '하나생명보험', '보험사'],
  [/(?<![A-Z])DB생명보험|(?<![A-Z])DB생명|(?<![A-Z])DB Life Insurance/i, 'DB생명보험', '보험사'],
  [/한화생명보험|한화생명|Hanwha Life Insurance/i, '한화생명보험', '보험사'],
  [/삼성생명보험|삼성생명|Samsung Life Insurance/i, '삼성생명보험', '보험사'],
  [/동양생명보험|동양생명|Tongyang Life Insurance/i, '동양생명보험', '보험사'],
  [/흥국생명보험|흥국생명|Heungkuk Life Insurance/i, '흥국생명보험', '보험사'],
  [/한화손해보험|한화손해|Hanwha General Insurance/i, '한화손해보험', '보험사'],
  [/MG손해보험|MG손해|MG Non-Life Insurance/i, 'MG손해보험', '보험사'],
  [/(?<![A-Z])DB손해보험|(?<![A-Z])DB손해|(?<![A-Z])DB Insurance/i, 'DB손해보험', '보험사'],
  [/농협손해보험|농협손해/i, '농협손해보험', '보험사'],
  [/롯데손해보험|롯데손해|Lotte Non-Life Insurance/i, '롯데손해보험', '보험사'],
  [/KB손해보험|KB손해|KB Insurance/i, 'KB손해보험', '보험사'],
  [/하나손해보험|하나손해|Hana Non-Life Insurance/i, '하나손해보험', '보험사'],
  [/중소기업은행|기업은행|IBK기업은행|Industrial Bank of Korea/i, '중소기업은행', '은행'],
  [/KB국민은행|Kookmin Bank/i, 'KB국민은행', '은행'],
  [/NH농협은행|NongHyup Bank/i, 'NH농협은행', '은행'],
  [/한국산업은행|산업은행|KDB산업은행|Korea Development Bank/i, '한국산업은행', '은행'],
  [/SC제일은행|Standard Chartered Bank Korea/i, 'SC제일은행', '은행'],
  [/한국씨티은행|Citibank Korea/i, '한국씨티은행', '은행'],
  [/NH투자증권|NH Investment & Securities/i, 'NH투자증권', '증권사'],
  [/신한투자증권|Shinhan Securities/i, '신한투자증권', '증권사'],
  [/미래에셋증권|Mirae Asset Securities/i, '미래에셋증권', '증권사'],
  [/한국투자증권|Korea Investment & Securities/i, '한국투자증권', '증권사'],
  [/한화투자증권|Hanwha Investment & Securities/i, '한화투자증권', '증권사'],
  [/DB금융투자|DB Financial Investment/i, 'DB금융투자', '증권사'],
  [/다올투자증권|DAOL Investment & Securities/i, '다올투자증권', '증권사'],
  [/유진투자증권|Eugene Investment & Securities/i, '유진투자증권', '증권사'],
  [/삼성자산운용|Samsung Asset Management/i, '삼성자산운용', '자산운용사'],
  [/신한자산운용|Shinhan Asset Management/i, '신한자산운용', '자산운용사'],
  [/KB자산운용|KB Asset Management/i, 'KB자산운용', '자산운용사'],
  [/DB자산운용|DB Asset Management/i, 'DB자산운용', '자산운용사'],
  [/현대자산운용|Hyundai Asset Management/i, '현대자산운용', '자산운용사'],
  [/한화자산운용|Hanwha Asset Management/i, '한화자산운용', '자산운용사'],
  [/IBK캐피탈|IBK Capital/i, 'IBK캐피탈', '캐피탈'],
  [/메리츠캐피탈|Meritz Capital/i, '메리츠캐피탈', '캐피탈'],
  [/BNK캐피탈|BNK Capital/i, 'BNK캐피탈', '캐피탈'],
  [/한국벤처투자|Korea Venture Investment Corp\./i, '한국벤처투자', '기타'],
  [/포스텍 재단|POSTECH Foundation/i, '포스텍 재단', '기타'],
  [/교원인베스트|Kyowon Invest/i, '교원인베스트', '기타'],
  [/근로복지공단|Korea Workers' Compensation & Welfare Service/i, '근로복지공단', '기타'],
  [/경찰공제회|Korea Police Mutual Aid Association/i, '경찰공제회', '공제회'],
  [/군인공제회|Military Mutual Aid Association/i, '군인공제회', '공제회'],
  [/메리츠증권|Meritz Securities/i, '메리츠증권', '증권사'],
  [/현대차증권|Hyundai Motor Securities/i, '현대차증권', '증권사'],
  [/신한캐피탈|Shinhan Capital/i, '신한캐피탈', '캐피탈'],
  [/현대커머셜|Hyundai Commercial/i, '현대커머셜', '캐피탈'],
  [/KB캐피탈|KB Capital/i, 'KB캐피탈', '캐피탈'],
  [/하나캐피탈|Hana Capital/i, '하나캐피탈', '캐피탈'],
  [/국민연금|\bNPS\b|국민연금공단|National Pension Service/i, '국민연금', '연기금'],
  [/우리은행|Woori Bank/i, '우리은행', '은행'],
  [/하나은행|Hana Bank/i, '하나은행', '은행'],
  [/신한은행|Shinhan Bank/i, '신한은행', '은행'],
  [/iM뱅크|\biM\s?Bank\b/i, 'iM뱅크', '은행'],
  [/수협은행|Suhyup Bank/i, '수협은행', '은행'],
  [/부산은행|Busan Bank/i, '부산은행', '은행'],
  [/경남은행|Kyongnam Bank/i, '경남은행', '은행'],
  [/광주은행|Kwangju Bank/i, '광주은행', '은행'],
  [/전북은행|Jeonbuk Bank/i, '전북은행', '은행'],
  [/삼성증권|Samsung Securities/i, '삼성증권', '증권사'],
  [/하나증권|Hana Securities/i, '하나증권', '증권사'],
  [/KB증권|KB Securities/i, 'KB증권', '증권사'],
  [/키움증권|Kiwoom Securities/i, '키움증권', '증권사'],
  [/대신증권|Daishin Securities/i, '대신증권', '증권사'],
  [/교보증권|Kyobo Securities/i, '교보증권', '증권사'],
  [/신영증권|Shinyoung Securities/i, '신영증권', '증권사'],
  [/(?<![A-Za-z가-힣])M\s?캐피탈|(?<![A-Za-z])M Capital\b/, 'M캐피탈', '캐피탈'],
  [/성담개발|Sungdam Development/i, '성담개발', '기타'],
  [/KT&G|KT&G Corporation/i, 'KT&G', '기타'],
  [/\bTCK\b/, 'TCK', '기타'],
];
// 해외 GP (운용사)
// 해외 글로벌 운용사(Global GP). 약칭 충돌을 피하려고 짧은 이름엔 \b 경계 사용.
const FOREIGN_GPS = [
  [/blackstone|블랙스톤/i, 'Blackstone', '해외 GP'],
  [/goldman sachs (?:alternatives|asset management)|goldman sachs|골드만\s?삭스/i, 'Goldman Sachs', '해외 GP'],
  [/\bKKR\b/i, 'KKR', '해외 GP'],
  [/apollo (?:global|management)|아폴로/i, 'Apollo', '해외 GP'],
  [/carlyle|칼라일/i, 'Carlyle', '해외 GP'],
  [/\bares\b|ares management|에어리스/i, 'Ares', '해외 GP'],
  [/brookfield|브룩필드/i, 'Brookfield', '해외 GP'],
  [/blackrock|블랙록/i, 'BlackRock', '해외 GP'],
  [/bain capital|베인캐피탈|베인 캐피탈/i, 'Bain Capital', '해외 GP'],
  [/\bTPG\b/i, 'TPG', '해외 GP'],
  [/\bCVC\b|cvc capital/i, 'CVC', '해외 GP'],
  [/\bEQT\b/i, 'EQT', '해외 GP'],
  [/advent international|어드벤트/i, 'Advent', '해외 GP'],
  [/permira|퍼미라/i, 'Permira', '해외 GP'],
  [/warburg pincus|워버그 ?핀커스/i, 'Warburg Pincus', '해외 GP'],
  [/vista equity|비스타 ?에쿼티/i, 'Vista Equity', '해외 GP'],
  [/silver lake|실버레이크/i, 'Silver Lake', '해외 GP'],
  [/thoma bravo|토마 ?브라보/i, 'Thoma Bravo', '해외 GP'],
  [/general atlantic|제너럴 ?애틀랜틱/i, 'General Atlantic', '해외 GP'],
  [/hellman ?& ?friedman|\bH&F\b/i, 'Hellman & Friedman', '해외 GP'],
  [/cinven|신벤/i, 'Cinven', '해외 GP'],
  [/CD&R|clayton.+dubilier/i, 'CD&R', '해외 GP'],
  [/oaktree|오크트리/i, 'Oaktree', '해외 GP'],
  [/\bHPS\b|hps investment/i, 'HPS', '해외 GP'],
  [/sixth street|식스스트리트/i, 'Sixth Street', '해외 GP'],
  [/blue owl|블루 ?아울/i, 'Blue Owl', '해외 GP'],
  [/golub capital|골럽/i, 'Golub Capital', '해외 GP'],
  [/intermediate capital|\bICG\b/i, 'ICG', '해외 GP'],
  [/tikehau|티케하우/i, 'Tikehau', '해외 GP'],
  [/pimco|핌코/i, 'PIMCO', '해외 GP'],
  [/\bPGIM\b/i, 'PGIM', '해외 GP'],
  [/global infrastructure partners|\bGIP\b/i, 'GIP', '해외 GP'],
  [/stonepeak|스톤피크/i, 'Stonepeak', '해외 GP'],
  [/i squared|isquared|\bISQ\b/i, 'I Squared', '해외 GP'],
  [/digitalbridge|디지털브리지/i, 'DigitalBridge', '해외 GP'],
  [/(?<!port )macquarie(?! (?:university|island|street|park|dictionary))|맥쿼리/i, 'Macquarie', '해외 GP'],
  [/\bactis\b|액티스/i, 'Actis', '해외 GP'],
  [/starwood capital|스타우드/i, 'Starwood', '해외 GP'],
  [/\bhines\b|하인즈/i, 'Hines', '해외 GP'],
  [/greystar/i, 'Greystar', '해외 GP'],
  [/patrizia/i, 'PATRIZIA', '해외 GP'],
  [/nuveen|누빈/i, 'Nuveen', '해외 GP'],
  [/\bardian\b|아르?디안/i, 'Ardian', '해외 GP'],
  [/partners group|파트너스 ?그룹/i, 'Partners Group', '해외 GP'],
  [/hamilton lane|해밀턴 ?레인/i, 'Hamilton Lane', '해외 GP'],
  [/stepstone|스텝스톤/i, 'StepStone', '해외 GP'],
  [/coller capital|콜러/i, 'Coller Capital', '해외 GP'],
  [/lexington partners/i, 'Lexington', '해외 GP'],
  [/pantheon(?!\s*macro)|판테온/i, 'Pantheon', '해외 GP'],
  [/neuberger berman|뉴버거 ?버먼/i, 'Neuberger Berman', '해외 GP'],
  [/fortress investment|포트리스/i, 'Fortress', '해외 GP'],
  [/cerberus|서버러스/i, 'Cerberus', '해외 GP'],
  [/centerbridge|센터브리지/i, 'Centerbridge', '해외 GP'],
  [/lone star funds|론스타/i, 'Lone Star', '해외 GP'],
  [/angelo gordon/i, 'Angelo Gordon', '해외 GP'],
  [/davidson kempner/i, 'Davidson Kempner', '해외 GP'],
  [/\bBBAM\b|비비에이엠/i, 'BBAM', '해외 GP'],
  [/\bPJT\b|park\s?hill|파크힐/i, 'PJT Park Hill', '해외 GP'],
  [/campbell\s?lutyens|캠벨\s?루티언스/i, 'Campbell Lutyens', '해외 GP'],
  [/evercore(?!\s*isi)|에버코어/i, 'Evercore', '해외 GP'],
  [/\bapax\b|아팍스/i, 'Apax', '해외 GP'],
  [/clearlake|클리어레이크/i, 'Clearlake', '해외 GP'],
  [/francisco partners|프란시스코\s?파트너스|프랜시스코\s?파트너스/i, 'Francisco Partners', '해외 GP'],
  [/insight partners|인사이트\s?파트너스/i, 'Insight Partners', '해외 GP'],
  [/platinum equity|플래티넘\s?에쿼티/i, 'Platinum Equity', '해외 GP'],
  [/l\s?catterton|엘\s?캐터튼/i, 'L Catterton', '해외 GP'],
  [/bridgepoint|브리지포인트/i, 'Bridgepoint', '해외 GP'],
  [/\bPAG\b/, 'PAG', '해외 GP'],
  [/\bMBK\b|엠비케이/i, 'MBK Partners', '해외 GP'],
  [/hillhouse|힐하우스/i, 'Hillhouse', '해외 GP'],
  [/affinity equity|어피니티|어피너티/i, 'Affinity Equity Partners', '해외 GP'],
  // TwentyFour 를 Vontobel 보다 먼저 둔다 — 두 이름이 함께 나오는 기사에서
  // 운용 주체(TwentyFour)로 귀속되도록 하기 위함.
  [/twentyfour asset|twenty ?four\s?(?:am|asset)|트웬티포|24 ?asset management/i, 'TwentyFour Asset Management', '해외 GP'],
  [/vontobel|본토벨|폰토벨/i, 'Vontobel', '해외 GP'],
];
const INSTS = [...KOREAN_LPS, ...FOREIGN_GPS];

const ASSETS = [
  ['AV', /항공기|aircraft|aviation|항공\s?금융|aircraft leasing|항공기\s?리스|aircraft finance/i],
  ['IN', /인프라|infrastructure|재생에너지|renewable|태양광|풍력|발전소|data\s?cent|데이터센터|통신탑|toll road|공항|항만/i],
  ['PC', /사모대출|private credit|direct lending|다이렉트 렌딩|메자닌|mezzanine|private debt|사모채권|선순위 대출/i],
  ['RE', /부동산|real estate|오피스|office|물류|logistics|호텔|hotel|리테일|retail|멀티패밀리|multifamily|임대주택|데이터센터 부동산/i],
  ['PE', /사모펀드|private equity|바이아웃|buyout|세컨더리|secondaries|\bPE\b|growth equity|벤처/i],
];
const REGIONS = [
  ['US', /미국|u\.?s\.?\b|뉴욕|new york|북미|north america/i],
  ['EU', /유럽|europe|영국|\bUK\b|런던|london|독일|german|프랑스|france|\bEU\b/i],
  ['AP', /아시아|asia|일본|japan|중국|china|인도|india|싱가포르|singapore|호주|australia/i],
];
const PEOPLE_RE = /인사|\bCIO\b|선임|영입|퇴임|사임|승진|내정|appoint|\bnames?\b|hire|steps? down/i;
// 조직 개편·신설 등 "조직 변경" 신호 (인사 카테고리로 함께 분류)
const ORG_RE = /조직\s?개편|조직\s?변경|직제\s?개편|조직\s?재편|본부\s?신설|실\s?신설|과\s?신설|팀\s?신설|기금운용과|운용역\s?증원|reorganiz|restructur/i;
// 지방이전 이슈 — 공제회·국책은행·연기금의 본사/기금운용본부 이전.
// '그 이전(before)' 오탐을 피하려고 '이전'은 반드시 이전 주체·행위어와 붙여서만 매칭.
const MOVE_RE = /지방\s?이전|본사\s?이전|본점\s?이전|사옥\s?이전|청사\s?이전|이전\s?(?:추진|계획|확정|무산|백지화|철회|대상|기관|공공기관|논란|검토|압박|요구)|공공기관\s?(?:2차\s?)?(?:지방\s?)?이전|이전\s?공공기관|혁신도시\s?(?:이전|시즌2)|제2\s?금융중심지|(?:부산|전북|전주|대구|광주|울산|경북|경남|충북|충남|강원|제주)\s?(?:로\s?)?이전/;

// ── 관련성 필터 (placement agent · 해외 대체투자 펀드 중심) ──
// 통과 조건: (1) 대체투자 자산군 신호 ALT_RE  (2) 펀드·출자 맥락 FUND_RE
// (3) 해외/글로벌 맥락 GLOBAL_RE 또는 글로벌 GP/국내 LP  (4) 잡음 EXCLUDE_RE 아님.
// → 상장사 주식·실적 등 public equity / 국내 리테일 뉴스를 걸러냅니다.
const ALT_RE = /대체투자|사모펀드|사모대출|private equity|private credit|private debt|infrastructure|인프라|real estate|부동산\s?펀드|바이아웃|buyout|메자닌|mezzanine|세컨더리|secondar|코인베스트|co-?invest|direct lending|다이렉트 렌딩|항공기|aircraft|aviation|블라인드\s?펀드|alternative (?:investment|asset)|venture capital|벤처캐피탈|\bPEF\b/i;
// 펀드·운용·출자 등 "투자기구/자금모집" 맥락 — 운영회사 일반 뉴스를 배제.
const FUND_RE = /펀드|\bfund\b|출자|약정|커밋|commit|결성|클로징|클로즈|final close|fund close|fundrais|펀드레이징|capital raise|raises?\b|mandate|블라인드|코인베스트|co-?invest|세컨더리|secondar|메자닌|mezzanine|다이렉트 렌딩|direct lending|바이아웃|buyout|사모펀드|사모대출|private equity|private credit|private debt|운용사|자산운용|\bGP\b|\bLP\b|sponsor|배정|배분|allocat|벤처캐피탈|venture capital/i;
const GLOBAL_RE = /해외|글로벌|global|overseas|cross-?border|international|offshore|미국|u\.?s\.?\b|유럽|europe|영국|london|런던|뉴욕|new york|북미|north america|아시아|asia|중국|일본|인도|싱가포르|중동|독일|프랑스/i;
// 국내 리테일·시황·상장사(공모주식)·일반 기업 뉴스 잡음
const EXCLUDE_RE = /분양|청약|아파트|재건축|재개발|전세|월세|입주|기준금리|코스피|코스닥|공모주|상장폐지|상장사|증시|주가|목표주가|시황|환율|예금|적금|카드론|주택담보|보험료|실손|자동차보험|채용|부고|유상증자|무상증자|자사주|영업이익|영업손실|당기순|순이익|매출액|어닝|컨센서스|배당금|기업공개|\bIPO\b|스팩|\bSPAC\b/i;
// 대체투자 "시장·딜·동향" 맥락 — 펀드 결성/출자 외에 관련 마켓 뉴스도 포함.
// (FUND_RE 와 OR 로 묶여, 자산군 신호 ALT_RE + 해외/GP/LP 맥락이 있을 때만 통과)
const MARKET_RE = /시장|업황|전망|동향|트렌드|trend|outlook|규모|성장|확대|위축|회복|호황|불황|딜|deal|거래|인수|매각|acquisition|투자|자금\s?조달|드라이\s?파우더|dry powder|밸류에이션|valuation|투자\s?심리|모집\s?환경|운용\s?규모|\bAUM\b|금리|수익률|벤치마크/i;

// ── 유틸 ────────────────────────────────────────────────
function decodeEntities(s = '') {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&nbsp;/g, ' ').replace(/&middot;/g, '·').replace(/&hellip;/g, '…')
    .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–')
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"').replace(/&#39;|&apos;|&rsquo;|&lsquo;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&amp;/g, '&');
}
function stripTags(s = '') {
  let t = decodeEntities(s);        // 인코딩된 태그(&lt;a&gt;)를 실제 태그로
  t = t.replace(/<[^>]+>/g, ' ');   // 태그 제거
  t = decodeEntities(t);            // 태그 제거 후 남은 엔티티 정리 (이중 인코딩 대응)
  return t.replace(/\s+/g, ' ').trim();
}
function tag(block, name) { const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i')); return m ? m[1].trim() : ''; }
function hasHangul(s = '') { return /[가-힣]/.test(s); }
function hashId(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return 'g' + (h >>> 0).toString(36); }
function pick(pairs, text, def) { for (const [key, re] of pairs) if (re.test(text)) return key; return def; }
function pickInst(text) { for (const [re, name, type] of INSTS) if (re.test(text)) return { inst: name, instType: type }; return null; }
// 기사의 "주체" 기관을 고른다: 제목에서 가장 먼저 등장하는 기관(예: 인사
// 기사의 채용 주체)을 우선하고, 제목에 없으면 본문에서 가장 먼저 등장하는
// 기관을 쓴다. (예: "경찰공제회, 새 CIO에 강승오 전 신한證 본부장" → 경찰공제회)
function pickInstOrdered(title = '', desc = '') {
  const earliest = (s) => {
    let best = null, bi = Infinity;
    for (const [re, name, type] of INSTS) {
      const m = s.match(re);
      if (m && m.index < bi) { bi = m.index; best = { inst: name, instType: type }; }
    }
    return best;
  };
  return earliest(title) || earliest(desc) || null;
}
function pickKoreanLpFirst(text) {
  let best = null, bestIdx = Infinity;
  for (const [re, name, type] of KOREAN_LPS) { const m = text.match(re); if (m && m.index < bestIdx) { bestIdx = m.index; best = { inst: name, instType: type }; } }
  return best;
}
// 텍스트에서 마지막으로 등장하는 국내 LP 기관(직함 바로 앞 기관)을 찾습니다.
function pickKoreanLpLast(text) {
  let best = null, bestIdx = -1;
  for (const [re, name, type] of KOREAN_LPS) {
    const m = text.match(re);
    if (m && m.index >= bestIdx) { bestIdx = m.index; best = { inst: name, instType: type }; }
  }
  return best;
}

// ── CIO·인사 / 자산군별 수익률 자동 추출 (insights.json) ──────
const CIO_TITLE = /기금이사|\bCIO\b|최고투자책임자|투자운용본부장|운용본부장|자금운용본부장/;
const CIO_APPOINT = /선임|임명|내정|취임|영입|발탁/;
const CIO_RECRUIT = /공모|모집|후보|압축|인선|공석|선정/;
// 공모가 무산·백지화된 상황 — '진행 중'보다 우선해 상태를 정확히 반영.
const CIO_SCRAP = /무산|백지화|없던\s*일로|원점으로|재공모/;
const CIO_WORD_BLOCK = /^(?:공개|민간|외부|내부|전문가|공모가|이번|이후|이날|이에|이를|이미|이어|이와|이는|정부|정책|강화|조직|조성|한편|한국|신임|신규|전임|전년|최근|최대|최초|장기|장관|기존|주요|주식|안정|유력|유일|고위|공석|공모|문제|방안|남은|오는|지난|올해|내년|하반기|상반기|임명|임기|선임|권한|노조|성과|원장|위원|구조|조정|장관|이사|주목|국장|전문)$/;
const NAME_BLOCK = /국민|연금|공제|기금|운용|투자|대체|사모|신임|차기|올해|내년|최고|책임|본부|이사|대표|부문|해외|국내|글로벌|수익|자산|증원|복지|행정|교직|군인|과학|우정|연기|수협|중앙/;
// CIO/운용 사령탑 인사 추출 → { inst, status, person, background } | null
// 같은 기관의 CIO 소식 두 건 중 무엇을 보일지 — 선임(이름 확인) 소식은 그 뒤 60일 안의
// '공모·인선' 언급(회고·후속 기사)보다 우선한다. 그 밖에는 최신 소식.
export function preferCio(cur, n) {
  const days = (x, y) => (Date.parse(x || 0) - Date.parse(y || 0)) / 86400000;
  const sel = (x) => x.status === '선임' && x.person;
  if (sel(n) && !sel(cur)) return days(cur.ts, n.ts) < 60;           // cur(공모)가 n(선임)보다 60일 이상 뒤면 새 공모 국면
  if (!sel(n) && sel(cur)) return days(n.ts, cur.ts) >= 60;
  return (n.ts || '') > (cur.ts || '');
}
export function extractCio(text) {
  if (!CIO_TITLE.test(text)) return null;
  const tIdx = text.search(CIO_TITLE);
  let target = pickKoreanLpLast(text.slice(0, tIdx + 8)) || pickKoreanLpLast(text);
  // "국민연금 … 이규홍 전 사학연금 CIO" — 직함 바로 앞 기관이 '전(前)' 직장이면 제목 첫 기관이 대상
  if (target) {
    const re = KOREAN_LPS.find(([, name]) => name === target.inst)[0];
    let pos = -1;
    for (const m of text.slice(0, tIdx + 8).matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))) pos = m.index;
    if (pos > 0 && /(?:^|\s)(?:전|前)\s*$/.test(text.slice(Math.max(0, pos - 4), pos))) {
      const first = pickKoreanLpFirst(text.slice(0, 80));
      if (first && first.inst !== target.inst) target = first;
    }
  }
  let person = '';
  // 이름 후보는 사람 이름 모양(흔한 성씨 + 2~3자)이고 흔한 낱말이 아니어야 한다 — '게는'·'임명되면'·'낙점됐다' 차단
  const okName = (n) => n && looksLikeName(n) && !NAME_BLOCK.test(n) && !CIO_WORD_BLOCK.test(n) && !(n.length === 3 && /[가는를을은도에의와과로한된할던인적]$/.test(n));
  const pats = [
    /(?:기금이사|CIO|최고투자책임자|투자운용본부장|운용본부장|사령탑|수장)\s*(?:신임\s*)?(?:에|로|으로)\s*(?:[가-힣]{0,6}\s)?([가-힣]{2,3})(?=\s|씨|,|$|…|을|를|이|가|\(|·)/g,   // "CIO에 이규홍", "사령탑에 이규홍"
    /(?:기금이사|CIO|최고투자책임자|운용본부장)\s+([가-힣]{2,3})(?=씨|\s*(?:선임|임명|내정|취임))/g,                                  // "CIO 이규홍씨", "CIO 이규홍 선임"
  ];
  // 제목(앞부분)에서 먼저 찾고, 없으면 본문 전체에서
  for (const part of [text.slice(0, 160), text]) {
    for (const re of pats) { for (const m of part.matchAll(re)) { if (okName(m[1])) { person = m[1]; break; } } if (person) break; }
    if (person) break;
  }
  if (!person && CIO_APPOINT.test(text)) {   // "이규홍 (신임) CIO 선임" (이름 먼저) — 선임 동반 시에만
    for (const m of text.matchAll(/(?<![가-힣])([가-힣]{2,3})\s*(?:신임\s*)?(?:기금이사|CIO|최고투자책임자|운용본부장)/g)) if (okName(m[1])) { person = m[1]; break; }
  }
  const status = person ? '선임'
    : (CIO_SCRAP.test(text) ? '공모 무산·재공모 수순'
    : (CIO_RECRUIT.test(text) ? '공모·인선 진행' : null));
  if (!person && !status) return null;
  let background = (text.match(/([가-힣A-Za-z·]{2,18})\s*출신/) || [])[1] || '';
  if (background && NAME_BLOCK.test(background) && background.length <= 3) background = '';
  return { inst: target ? target.inst : '', instType: target ? target.instType : '', status, person, background };
}
// 자산군별 수익률 추출 → { asset, value } | null  (수익률 맥락 + 자산군 + 합리적 %)
export function extractReturn(text) {
  if (!/수익률|운용수익|평가익|벌어들/.test(text)) return null;
  const pm = text.match(/(-?\d{1,2}(?:\.\d{1,2})?)\s*%/);
  if (!pm) return null;
  const v = parseFloat(pm[1]);
  if (v < -50 || v > 60) return null;
  for (const [code, re] of ASSETS) if (re.test(text)) return { asset: code, value: v };
  if (/대체투자/.test(text)) return { asset: 'ALT', value: v };
  return null;
}
// ── 대체투자 운용조직 실무 인사 (CIO 아래 본부장·실장·팀장급) ──────
// CIO 는 기관당 1명이라 별도 트랙(cios)으로 관리하고, 여기서는 실제 출자·심사를
// 집행하는 본부장/실장/팀장 라인을 추적한다(placement agent 의 실무 카운터파트).
const EXEC_TITLE = /(?:대체투자|해외투자|해외대체|기금운용|투자운용|운용전략|사모투자|인프라(?:투자)?|부동산(?:투자)?|증권운용|글로벌투자)\s?(?:본부장|부문장|실장|단장|팀장|부장)/;
const EXEC_ACTION = /선임|임명|내정|취임|영입|승진|발탁|합류|이동|이직|사임|퇴임/;
// 사람 이름 자리에 흔히 끼어드는 조직·업무 어휘(부서명 조각) — 이름으로 뽑지 않는다.
const EXEC_NAME_BLOCK = /건설|전략|금융|기획|총괄|사업|정책|경영|관리|위원|센터|지원|담당|채권|주식|연금|기업|시장|리스크|^(?:대한|한국|신임|전임|현직|당시|이번|새로|직접|신규|해외|국내|글로벌|대체|투자|운용|본부|부문|그룹|최초|첫|역대|초대|차기|후임)$/;
// 한국 사람 이름 모양 — 흔한 성씨로 시작하는 2~3자(4자는 복성만). '유명해진'·'낙점됐다'·'현대해상'
// 같은 수식어·회사명이 이름 자리에 잡히는 것을 막는다.
const SURNAME_RE = /^[김이박최정강조윤장임한오서신권황안송류유전홍고문양손배백허남심노하곽성차주우구민나진지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국어은편용예경봉사부가복태목형피두감음빈동온호좌]/;
const looksLikeName = (n) => SURNAME_RE.test(n) && (n.length <= 3 || /^(?:남궁|황보|제갈|선우|독고|사공|서문)/.test(n));
const badExecName = (n) => NAME_BLOCK.test(n) || EXEC_NAME_BLOCK.test(n) || !looksLikeName(n);
// 실무 인사 추출 → { inst, person, title, action } | null
export function extractExec(text) {
  const tm = text.match(EXEC_TITLE);
  if (!tm) return null;
  if (!EXEC_ACTION.test(text)) return null;
  const title = tm[0].replace(/\s+/g, '');
  const head = text.slice(0, tm.index + tm[0].length + 12);
  const target = pickKoreanLpLast(head) || pickKoreanLpLast(text);
  if (!target || target.instType === '해외 GP') return null;
  let person = '';
  // (a) "…본부장에 홍길동" (직함 뒤 이름)
  let m = text.match(new RegExp(EXEC_TITLE.source + '\\s*(?:신임\\s*)?(?:에|로|으로)\\s*([가-힣]{2,4})'));
  if (m && !badExecName(m[1])) person = m[1];
  // (b) "홍길동 대체투자본부장" (이름 먼저) — 반드시 공백으로 끊겨야 한다.
  //     공백을 허용하지 않으면 '건설인프라본부장' 같은 합성 부서명의 앞부분을
  //     사람 이름으로 잘못 뽑는다.
  if (!person) {
    const m2 = text.match(new RegExp('(?:^|[\\s,·"\'\\(])([가-힣]{2,4})\\s+(?:신임\\s*)?' + EXEC_TITLE.source));
    if (m2 && !badExecName(m2[1])) person = m2[1];
  }
  const action = (text.match(EXEC_ACTION) || [])[0] || '인사';
  if (!person) return null;                      // 이름이 없으면 인사 카드로서 가치가 없음
  return { inst: target.inst, instType: target.instType, person, title, action };
}

// ── AUM 자동 최신화 ─────────────────────────────────────
// 기사 본문에서 "운용자산 000조원 / assets under management $000bn" 를 뽑아
// 기관별 최신 AUM 으로 유지한다. 프로필의 정적 AUM 은 그대로 두고, 앱에서
// "뉴스 기준" 값으로 함께 보여준다(출처·날짜 링크 포함 — 근거 없는 수치 금지).
// 강한 단서만 인정 — '총자산·자산총액'은 재무제표 수치(자기자본·총자산)와 섞여
// AUM 오인이 잦아 제외한다.
const AUM_CUE = /운용자산|운용\s?규모|기금\s?규모|자산\s?규모|적립금|\bAUM\b|assets under management/i;
// 미래 전망치·목표치는 현재 AUM 이 아니므로 배제 (예: "2049년 1849조원 전망").
const AUM_PROJECTION = /전망|예상|추정|목표|계획|불어날|늘어날|줄어들|projected|expected|forecast/i;
// 다른 주체의 금액(투자금·순이익·거래대금 등)을 AUM 으로 오인하지 않도록,
// "기관명 + AUM 단서 + 수치"가 한 문장 안에 모두 있을 때만 값으로 인정한다.
// 국내 기관은 조/억원 → 억원으로 정규화하고, 해외 GP 는 $bn/$tn 표기를 그대로 쓴다.
export function extractAum(text, gpNames = []) {
  const KO_NUM = '(\\d{1,4}(?:[.,]\\d+)?)\\s?조\\s?(\\d{1,5})?\\s?억?\\s?원';
  const EN_NUM = '\\$\\s?([\\d.,]+)\\s?(trillion|billion|bn|tn)\\b';
  const CUE = '(?:운용자산|운용\\s?규모|기금\\s?규모|자산\\s?규모|적립금|AUM|assets under management)';
  // 단서와 수치가 실제로 한 구(句) 안에서 짝지어질 때만 인정한다.
  //  (a) "운용자산은 345조원"  (b) "1849조원에 달하는 적립금"
  const pairs = (num) => [
    new RegExp(CUE + '[^\\d$]{0,12}' + num, 'i'),
    new RegExp(num + '[^\\d]{0,12}?' + CUE, 'i'),
  ];
  const run = (num, build) => {
    for (const re of pairs(num)) {
      const m = text.match(re);
      if (!m) continue;
      const win = text.slice(Math.max(0, m.index - 40), m.index + m[0].length + 10);
      if (AUM_PROJECTION.test(win)) continue;                 // 전망·목표치는 제외
      const v = build(m);
      if (!v) continue;
      const lp = pickKoreanLpLast(win);                       // 수치와 같은 구절의 기관
      const gp = gpNames.find((n) => win.includes(n)) || '';
      const inst = lp ? lp.inst : gp;
      if (!inst) continue;                                    // 귀속 기관이 불분명하면 버린다
      return { ...v, inst, instType: lp ? lp.instType : '해외 GP' };
    }
    return null;
  };
  const ko = run(KO_NUM, (m) => {
    const jo = parseFloat(m[1].replace(/,/g, ''));
    const eok = m[2] ? parseInt(m[2], 10) : 0;
    const amount = Math.round(jo * 10000 + eok);              // 억원
    if (!(amount >= 10000 && amount <= 30000000)) return null;
    return { amount, display: `${jo}조${eok ? ` ${eok}억` : ''}원`, unit: 'KRW' };
  });
  if (ko) return ko;
  return run(EN_NUM, (m) => {
    const v = parseFloat(m[1].replace(/,/g, ''));
    const tn = /^t/i.test(m[2]);
    if (!(v > 0 && v < 1000)) return null;
    return { amount: null, display: `$${v}${tn ? 'T' : 'B'}`, unit: 'USD' };
  });
}

// 수집 기사에서 insights(CIO·수익률) 빌드 — 기관별 최신 1건 유지.
export function buildInsights(articles, refAum = null) {
  const ASSET_LABEL = { AV: '항공기금융', IN: '인프라', PC: 'Private Credit', RE: '부동산', PE: 'Private Equity', ALT: '대체투자 전체' };
  const cioByInst = new Map();
  const cioVotes = new Map();
  const retByAsset = new Map();
  const execByKey = new Map();
  const aumByInst = new Map();
  const moveByInst = new Map();
  const sorted = articles.slice().sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0)); // 최신 우선
  for (const a of sorted) {
    const text = `${a.ko || ''} ${a.body || ''}`;
    const c = extractCio(text);
    if (c && c.inst && c.instType !== '해외 GP') {
      if (c.status === '선임' && c.person) { const k = `${c.inst}|${c.person}`; cioVotes.set(k, (cioVotes.get(k) || 0) + 1); }
      const cur = cioByInst.get(c.inst);
      // 같은 기관 선임 보도가 여럿이면 가장 많이 보도된 인물(다른 기관 인사를 함께 다룬 기사에 흔들리지 않게)
      const votesOf = (x) => (x && x.status === '선임' ? cioVotes.get(`${x.inst}|${x.person}`) || 0 : 0);
      if (!cur || (cur.status === '선임' && c.status === '선임' && cur.person !== c.person ? votesOf(c) > votesOf(cur) : preferCio(cur, { ...c, ts: a.ts }))) {
        const note = c.status === '선임'
          ? `신임 CIO ${c.person}${c.background ? ` (${c.background} 출신)` : ''}`
          : c.status === '공모 무산·재공모 수순'
            ? 'CIO 공모 무산 — 재공모 수순 전망'
            : 'CIO 공모·인선 진행 중';
        cioByInst.set(c.inst, { inst: c.inst, group: grpName(c.instType), status: c.status, person: c.person, background: c.background, note, source: a.source, url: a.url, date: a.date, ts: a.ts });
      }
    }
    const r = extractReturn(text);
    if (r && !retByAsset.has(r.asset)) {
      retByAsset.set(r.asset, { asset: r.asset, label: ASSET_LABEL[r.asset] || r.asset, value: r.value, inst: a.instType !== '해외 GP' ? a.inst : '', source: a.source, url: a.url, date: a.date, ts: a.ts });
    }
    // 실무 인사(본부장·실장·팀장) — 같은 인물+직함은 최신 1건만.
    const ex = extractExec(text);
    if (ex) {
      const key = `${ex.inst}|${ex.person}|${ex.title}`;
      if (!execByKey.has(key)) {
        execByKey.set(key, { key, inst: ex.inst, group: grpName(ex.instType), person: ex.person, title: ex.title, action: ex.action, source: a.source, url: a.url, date: a.date, ts: a.ts });
      }
    }
    // AUM — 기관별 최신 1건 (귀속 기관은 수치와 같은 문장에서 직접 판별)
    const au = extractAum(text, a.instType === '해외 GP' && a.inst ? [a.inst] : []);
    if (au && !aumByInst.has(au.inst)) {
      const krw = au.unit === 'KRW';
      // 프로필에 검증된 AUM 이 있으면 자릿수 대조 — 크게 벗어난 수치(다른 주체의
      // 금액·전망치)는 버린다. 프로필 값이 없으면 그대로 '기사 인용'으로 남긴다.
      const ref = krw && refAum ? refAum.get(au.inst) : null;
      const sane = aumSane(au.amount, ref);
      if (sane && krw === (au.instType !== '해외 GP')) {   // 원화=국내 LP, 달러=해외 GP
        aumByInst.set(au.inst, {
          inst: au.inst,
          group: au.instType === '해외 GP' ? 'Global GP' : grpName(au.instType),
          amount: au.amount,                                  // 억원 (해외 GP 는 null)
          jo: krw ? Math.round(au.amount / 1000) / 10 : null,  // 조원 — 앱 표기 단위
          ref: ref || null,                                   // 대조에 쓴 공시 AUM(억원)
          display: au.display, unit: au.unit,
          source: a.source, url: a.url, gurl: a.gurl, date: a.date, ts: a.ts, title: a.ko,
        });
      }
    }
    // 지방이전 이슈 — 기관별 최신 1건 (운용인력·조직 영향 신호)
    if (a.cat === '이전' && a.inst && a.instType !== '해외 GP' && !moveByInst.has(a.inst)) {
      moveByInst.set(a.inst, { inst: a.inst, group: grpName(a.instType), stage: moveStage(`${a.ko || ''} ${(a.body || '').slice(0, 200)}`), title: a.ko, source: a.source, url: a.url, gurl: a.gurl, id: a.id, date: a.date, ts: a.ts });
    }
  }
  const { date } = kstParts();
  return {
    updatedAt: date,
    cios: [...cioByInst.values()],
    assetReturns: [...retByAsset.values()],
    execs: [...execByKey.values()].slice(0, 40),
    aums: [...aumByInst.values()],
    relocations: [...moveByInst.values()].slice(0, 30),
  };
}
// 기사 AUM 이 공시 AUM 과 자릿수·규모가 맞는지 — 기금 전체 규모는 몇 달 새 25% 넘게
// 줄지 않으므로, 그보다 작은 수치는 해외투자·대체투자 등 하위 포트폴리오 금액으로 본다.
function aumSane(amount, ref) {
  if (!ref) return true;
  return amount >= ref * 0.75 && amount <= ref * 1.6;
}
// 지방이전 진행 단계 — 기사 표현 그대로 요약한다(단정 금지).
// 판정은 제목 + 본문 앞부분만 본다. 본문 전체를 보면 무관한 단락의 '결정·의결'
// 같은 단어가 섞여 "반대 결의" 기사를 '이전 확정'으로 뒤집는 오판이 난다.
function moveStage(text) {
  if (/무산|백지화|철회|보류|중단|없던\s*일/.test(text)) return '무산·보류';
  if (/반대|반발|저지|결사|노조|집회|갈등|이탈|우려|논란/.test(text)) return '반발·논란';
  if (/이전\s*(?:확정|의결|결정|고시)|이전지\s*확정|이전\s*기관\s*(?:지정|선정)/.test(text)) return '이전 확정';
  if (/추진|검토|요구|압박|촉구|유치|법안|공약|앞장|속도/.test(text)) return '이전 추진';
  return '관련 동향';
}
// instType → 업권 그룹(앱 표시용)
function grpName(t) {
  if (['연기금', '공제회', '중앙회', '은행'].includes(t)) return t;
  if (['자산운용사', '증권사'].includes(t)) return '운용·증권';
  if (['보험사', '캐피탈'].includes(t)) return '보험·캐피탈';
  return '기타';
}

// ── 투자내역 트래커: 기관별 '어디에 투자했나' 누적 DB (investments.json) ──────
// 기사 제목(+리드)에서 투자 주체·행위·상대방·금액·해외 여부를 뽑는다. 제목에
// 행위어가 명시된 기사만 쓰며(추측 금지), 판단 근거인 기사 링크를 항상 함께 남긴다.
// 순서가 중요 — 구체적인 행위(위탁운용사 선정·공동투자·세컨더리)를 먼저 본다.
const DEAL_KINDS = [
  ['출자사업', /출자\s*사업|위탁\s*운용사\s*(?:모집|공고|선정\s*계획)|제안서\s*(?:접수|마감)|\bRFP\b|경쟁률|출사표/i],
  ['위탁운용사 선정', /위탁\s*(?:운용)?사(?:로)?\s*(?:\d+\s*곳\s*)?(?:선정|선발|최종|확정)|운용사\s*(?:\d+\s*곳\s*)?(?:선정|선발)|\bGP\s*선정|숏리스트|mandate/i],
  // 운용사가 펀드 모집을 마감·돌파한 소식 (LP 기사면 아래에서 '펀드 출자'로 바꾼다)
  ['펀드 결성', /\b(?:closes?|closed|closing|raises?|raised|hits?|surpass(?:es|ed)?|tops?|exceeds?|launch(?:es|ed)?)\b(?:[^.]|\.(?=\d)){0,50}(?<!pension |wealth |hedge )\b(?:fund|funds|vehicle|programme|program)\b(?!\s+(?:management|manager))|\bfund(?:raise|raising)?\b(?:[^.]|\.(?=\d)){0,30}\b(?:final close|first close|hard cap|hits? target|surpass)|펀드\s*(?:결성|조성|클로징|모집\s*(?:완료|마감))|(?:1차|최종|파이널|퍼스트)\s*클로(?:징|즈)|결성\s*(?:완료|마무리)/i],
  ['공동투자', /코인베스트|공동\s*투자|co-?invest/i],
  // 세컨더리 '거래'만 — "세컨더리 운용사 인수"처럼 수식어로만 쓰인 경우는 인수로 본다
  ['세컨더리', /continuation (?:fund|vehicle)|컨티뉴에이션|\bGP-led\b|\bLP-led\b|tender offer|세컨더리\s*(?:거래|매각|매입|딜|인수|투자|펀드에)|secondar(?:y|ies)\s+(?:deal|sale|transaction|stake|purchase|buy)/i],
  ['펀드 출자', /출자|약정|커밋|\bcommit(?:s|ted|ment)?\b|\banchor|앵커|투자\s*확약/i],
  ['매각', /\b(?:exits?|exited|sells?|sold|divests?|offloads?)\b[^.]{0,25}\bstake\b|지분\s*(?:전량\s*)?(?:매각|처분)/i],   // "exits stake in …"는 인수가 아니라 매각
  ['인수', /인수|매입|사들(?:여|였|인|이)|\bacquir(?:e|es|ed|ing)\b|\bbuys?\b|\bbought\b|take[- ]private|\bstake in\b/i],
  ['매각', /매각|엑시트|\bexit(?:s|ed)?\b|\bsells?\b|\bsold\b|divest/i],
  ['대출·크레딧', /대출|리파이낸싱|브릿지\s*론|메자닌|\bfinancing\b|\bloans?\b|\blending\b|refinanc/i],
  ['투자', /투자(?:한다|했다|키로|하기로|해\s|를\s|에\s*나선|\s*단행|\s*집행|\s*(?:결정|확정|완료|유치|추진|착수|개시|시동))|(?:억|조|달러|유로|파운드|원)\s*(?:규모\s*)?투자|에\s*투자|\binvest(?:s|ed|ing)?\s+(?:in|\$)|\bbacks?\b|\bbacked by\b/i],
];
// 진행 단계 — 검토·추진 단계와 확정(완료)을 구분해 오해를 막는다.
const DEAL_PENDING_RE = /검토|추진|나선다|나서|계획|예정|저울질|협상|우협|우선협상|MOU|논의|타진|물색|유력|가닥|착수|in talks|consider|weigh|plans? to|nears?\b|explor|\beyes?\b|\bmulls?\b|poised|\bseeks?\b|\bbids?\b|bidding|\baims?\b|set to|exclusive talks|advanced talks/i;
const OVERSEAS_RE = new RegExp([
  '해외|글로벌|미국|美|유럽|영국|英|독일|獨|프랑스|佛|일본|日|호주|싱가포르|인도|중국|中|북미|남미|아시아|중동|캐나다|멕시코|브라질|베트남|인도네시아|태국|필리핀|대만|홍콩|스페인|이탈리아|네덜란드|스웨덴|덴마크|노르웨이|핀란드|폴란드|아일랜드|스위스|벨기에|오스트리아|포르투갈|사우디|UAE|이스라엘|뉴질랜드',
  '도쿄|오사카|뉴욕|런던|파리|베를린|프랑크푸르트|뮌헨|암스테르담|더블린|마드리드|밀라노|스톡홀름|코펜하겐|시드니|멜버른|로스앤젤레스|샌프란시스코|시카고|보스턴|워싱턴|댈러스|휴스턴|마이애미|애틀랜타|시애틀|토론토|밴쿠버|두바이|아부다비|리야드|뭄바이|호치민|하노이|자카르타|방콕|마닐라|상하이|베이징|타이베이',
  'global|overseas|cross-border|international|U\\.S\\.|\\bUS\\b|\\bUK\\b|Europe|European|America|American|British|London|New York|Tokyo|Osaka|Paris|Berlin|Frankfurt|Munich|Amsterdam|Dublin|Madrid|Milan|Stockholm|Copenhagen|Singapore|Hong Kong|Sydney|Melbourne|Los Angeles|San Francisco|Chicago|Boston|Dallas|Houston|Miami|Toronto|Dubai|Abu Dhabi|Riyadh|Mumbai|Japan|Germany|France|Spain|Italy|Netherlands|Nordic|Sweden|Denmark|Norway|Finland|Poland|Ireland|Switzerland|Canada|Mexico|Brazil|India|China|Australia|Vietnam|Indonesia|Thailand|Philippines|Taiwan|Saudi|Israel|California|Texas|Florida',
].join('|'), 'i');
// 투자 '이벤트'가 아닌 기사 — 분석·전망·시리즈물, 무산·거부된 딜, 상장주식 매매·주가 반응,
// 행사·개관 소식, 임원 거취·승진, 신용등급 조정, 시장 논평, 사무소 개설. 이런 제목은 투자내역 DB 에 넣지 않는다.
const NON_EVENT_RE = new RegExp([
  '미지수|불투명|우려|전망|어디로|\\?|분석|점검|결산|지도\\]|기획|시리즈|[①②③④⑤]|무산|철회|결렬|거부|중단|차질|지연|답보|못한|못해|실패|환매|유동성|경고등|대기발령|기회\\s*제시|주목|강조|조언|인터뷰|웨비나|세미나|포럼|강연|기념|그랜드\\s*(?:오프닝|오픈)|개관|출자\\s*회사|주식.{0,20}(?:매각|매수|매도|처분)|어치|주당|최고가|최저가|주가|급등|급락|사무소\\s*(?:개설|개소|오픈)|지사\\s*(?:설립|개설)',
  'insider|shares? (?:sold|bought)|price target|\\bstock\\b|rejects?|scraps?|abandon|calls? off|outlook|webinar',
  // 임원 거취 ("PE chief … in talks to exit", "executive prepares exit")
  '\\b(?:chief|executive|head|ceo|cio|cfo|coo|partner|president|chair(?:man|woman)?|founder|managing director)\\b[^.]{0,50}\\b(?:exit|exits|leave|leaves|leaving|depart(?:s|ure)?|step(?:s|ping)? down|retire(?:s|ment)?|resign(?:s|ation)?)\\b',
  // 인물 이름 + Exit("… With Baratta Exit", "Dealmakers") — 사람의 퇴장이지 자산 매각이 아니다
  '\\bdealmakers?\\b|\\b[A-Z][a-z]+(?:’s|\'s)?\\s+(?:exit|departure)\\b(?![^.]{0,20}\\b(?:from|of|stake|deal|sale)\\b)',
  '\\bpromot(?:es|ed|ion|ions)\\b|\\bappoint(?:s|ed|ment)\\b|\\bhires?\\b|\\bhired\\b|\\bnames?\\b[^.]{0,40}\\b(?:head|chief|ceo|cio|partner|president)\\b',
  // 신용등급·시장 논평·주식 리서치
  '\\b(?:fitch|moody\'?s|kbra|dbrs|s&p global ratings)\\b|\\b(?:upgrade[sd]?|downgrade[sd]?|affirm(?:s|ed)?)\\b',
  '\\bsees\\b|\\bsays\\b|\\bwarns?\\b|\\bpredicts?\\b|\\bsurvey\\b|\\branking\\b|\\bpodcast\\b|\\bsummit\\b|\\bconference\\b',
  ';\\s*(?:hold|buy|sell|strong buy)\\b|\\b(?:overweight|underweight)\\b|\\bequities\\b|\\bdividend\\b|\\bdiscount to nav\\b|\\bearnings\\b|\\bquarterly results\\b',
  '\\bopens?\\b[^.]{0,30}\\boffice\\b|\\bnew office\\b|\\boffice in\\b',
  // 환매 러시·투자의견 글("Why I'm Downgrading")·추측성 제목("~맞추나", "~할까")
  '\\bmanagement changes?\\b|\\bleadership changes?\\b|\\bredemptions?\\b|\\bwithdrawals?\\b|rush for (?:the )?exits|\\b(?:upgrading|downgrading)\\b|\\bwhy (?:i|we)\\b',
  '(?:할까|될까|설까|을까|일까|맞추나|인가|는가)(?=\\s|$|[\'"”’…])',
].join('|'), 'i');
// 딜 금액 — 통화·단위가 붙은 금액만 인정(주당 가격·운용자산(AUM)·면적 수치 제외).
export function dealAmount(text) {
  const t = String(text || '');
  const pats = [
    /(?:US\$|A\$|C\$|S\$|HK\$|\$|€|£|¥|₩)\s?[\d.,]+\s?(?:trillion|billion|million|tn|bn|mn|T|B|M)\b/i,
    /(?:USD|EUR|GBP|JPY|KRW|AUD|CAD|SGD)\s?[\d.,]+\s?(?:trillion|billion|million|tn|bn|mn)\b/i,
    /[\d.,]+\s?(?:trillion|billion|million)\s+(?:dollars|euros|pounds|won|yen)\b/i,
    /[\d,.]+\s?조\s?(?:[\d,]+\s?억)?\s?(?:원|달러|유로|파운드|엔)?/,
    /[\d,.]+\s?억\s?(?:[\d,]+\s?만)?\s?(?:원|달러|유로|파운드|엔)/,
    /[\d,.]+\s?억(?=\s|\.|,|…|$)/,
  ];
  for (const re of pats) {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    let m;
    while ((m = g.exec(t))) {
      const before = t.slice(Math.max(0, m.index - 30), m.index);
      const after = t.slice(m.index + m[0].length, m.index + m[0].length + 24);
      const skip = /주당|per share/i.test(before.slice(-6) + after.slice(0, 6))                   // 주가
        || /^\s*(?:굴리|운용|규모의\s*기금|적립)/.test(after)                                        // 운용자산(AUM)
        || /(?:운용\s*자산|운용\s*규모|\bAUM\b|assets under management)[^\d$€£¥₩]{0,20}$/i.test(before)
        || /(?:manag(?:es|ing)|oversee(?:s|ing)?|with|AUM of|assets of)\s+(?:about |around |roughly |nearly |over |more than |some )?$/i.test(before)
        || /^\s*(?:in\s+)?(?:assets|AUM|of assets)\b/i.test(after);
      if (!skip) return m[0].replace(/\s+/g, ' ').trim();
    }
  }
  return '';
}
// 제목을 절(…·...·|·–)로 나눈다 — 한 제목에 두 사건이 섞인 경우 운용사가 등장한 절만 본다.
function titleClauses(title) {
  const out = [];
  const re = /\s*(?:…|⋯|\.{2,}|\s[-–—|]\s)\s*/g;
  let last = 0, m;
  while ((m = re.exec(title))) {
    out.push({ text: title.slice(last, m.index), start: last });
    last = m.index + m[0].length;
  }
  out.push({ text: title.slice(last), start: last });
  return out.filter((c) => c.text.trim());
}
const lpsIn = (text) => {
  const hits = [];
  for (const [re, name, type] of KOREAN_LPS) {
    const m = text.match(re);
    if (m && !hits.some((h) => h.inst === name)) hits.push({ inst: name, instType: type, idx: m.index });
  }
  return hits.sort((a, b) => a.idx - b.idx);
};
const gpsIn = (text) => {
  const hits = [];
  for (const [re, name] of FOREIGN_GPS) {
    const m = text.match(re);
    if (m && !hits.some((h) => h.inst === name)) hits.push({ inst: name, idx: m.index, len: m[0].length });
  }
  return hits.sort((a, b) => a.idx - b.idx);
};
// 제목 속 운용사의 역할 판정 → { kind } | null(단순 언급이면 null)
//   주어("블랙스톤, …인수")           → 그대로
//   "…으로부터/from …"                → 운용사가 투자·대출한 쪽(인수 기사면 운용사가 매도자)
//   "…에/to …매각", "…와 …매각 논의"   → 운용사가 인수자
//   "…펀드에 …약정"                    → 운용사 펀드가 출자를 받은 것
export function gpRoleInTitle(title, g, kind) {
  const t = String(title);
  const len = g.len || 2;                               // 운용사 이름 자체의 길이(뒤 조사는 제외)
  const before = t.slice(Math.max(0, g.idx - 12), g.idx);
  const after = t.slice(g.idx + len, g.idx + len + 30);
  if (/^\s*(?:과|와|하고|이랑|랑)\s/.test(after)) return null;   // "KKR과 M&A 물색" — 함께 언급된 상대일 뿐
  if (g.idx <= 2 && !/^\s*(?:으로부터|로부터|에게|에\s)/.test(after)) return { kind };
  if (/^\s*(?:으로부터|로부터|에게서)/.test(after) || /\bfrom\s*$/i.test(before)) {
    if (kind === '인수') return { kind: '매각' };
    if (kind === '투자' || kind === '대출·크레딧') return { kind };
    return null;
  }
  if (/\bbacked by\s*$|\bby\s*$/i.test(before)) return { kind: kind === '매각' ? '인수' : kind };
  if (kind === '펀드 출자' && /^[^,…]{0,24}펀드/.test(after)) return { kind: '출자 유치' };
  if (kind === '매각' && (/^\s*(?:등\s*)?(?:컨소시엄|에|에게|와|과)/.test(after) || /\bto\s*$/i.test(before))) return { kind: '인수' };
  if (kind === '투자' && /^[^,…]{0,6}(?:의|가|이)\s/.test(after)) return { kind };
  return null;
}
export function extractDeals(a) {
  if (!a || !a.ko || a.cat === '인사' || a.cat === '이전') return [];
  const title = String(a.en && a.lang === 'en' && !a.translated ? a.en || a.ko : a.ko).replace(/^\s*[\[【][^\]】]{0,20}[\]】]\s*/, '');
  const lead = String(a.body || '').slice(0, 320);
  if (NON_EVENT_RE.test(title)) return [];              // 분석·전망·무산·주식매매 등은 이벤트 아님
  const kindHit = DEAL_KINDS.find(([, re]) => re.test(title));
  if (!kindHit) return [];                              // 제목에 행위어가 없으면 이벤트로 보지 않는다
  const kind = kindHit[0];
  const text = `${title} ${lead}`;
  const status = DEAL_PENDING_RE.test(title) ? '추진·검토' : '확정';
  const amount = dealAmount(title) || dealAmount(lead) || '';
  const lps = lpsIn(title).slice(0, 3);
  const gps = gpsIn(title);
  const gpsLead = gps.length ? gps : gpsIn(lead);
  const base = {
    kind, status, amount,
    asset: a.asset, region: a.region,
    title, id: a.id, url: a.url, gurl: a.gurl, date: a.date, ts: a.ts, source: a.source, lang: a.lang,
  };
  const out = [];
  if (lps.length) {
    if (kind === '투자' && /투자\s*유치/.test(title)) return [];   // 자금을 '받는' 기사
    // 국내 LP 가 제목에 있으면 LP 가 투자 주체. 상대방은 제목(없으면 리드)의 해외 GP.
    const cp = gpsLead[0] ? gpsLead[0].inst : '';
    const overseas = !!cp || OVERSEAS_RE.test(text);
    for (const lp of lps) {
      // 운용사(자산운용사·증권사)가 아닌 LP 의 '펀드 결성' 기사는 그 펀드에 출자했다는 뜻
      const k = kind === '펀드 결성' && !['자산운용사', '증권사'].includes(lp.instType) && /출자|약정|커밋|commit|anchor|앵커/i.test(title) ? '펀드 출자' : kind;
      out.push({ ...base, kind: k, inst: lp.inst, instType: lp.instType, role: 'LP', counterpart: cp, overseas });
    }
  } else if (gps.length && a.instType === '해외 GP') {
    // 해외 GP 딜 — 운용사가 제목의 '주어'가 아니면 문맥으로 역할을 정한다.
    // 운용사가 나온 절만 떼어 역할·행위·금액을 판정한다
    //   "원오크, 브라조스 자산 44억 달러에 인수… 아폴로로부터 90억 달러 투자 유치" → 아폴로: 투자 90억 달러
    const g = gps[0];
    const cl = titleClauses(title).find((c) => g.idx >= c.start && g.idx < c.start + c.text.length) || { text: title, start: 0 };
    const clHit = DEAL_KINDS.find(([, re]) => re.test(cl.text));
    // 운용사가 나온 절에 행위어가 없고 '후보·거론'이면 매각 기사 속 인수 후보다 ("…매각 검토…BlackRock 지원 AIP·IFM 후보 거론")
    const candidate = /후보|거론|유력|인수전|숏리스트|우협|우선협상|bidders?|suitors?|front-?runner/i.test(cl.text);
    const clKind = clHit ? clHit[0] : (candidate && kind === '매각' ? '인수' : kind);
    const role = gpRoleInTitle(cl.text, { ...g, idx: g.idx - cl.start }, clKind);
    if (role) {
      const cpLp = lpsIn(lead)[0];
      const clAmount = cl.text !== title ? dealAmount(cl.text) : '';
      out.push({ ...base, kind: role.kind, amount: clAmount || amount, inst: g.inst, instType: '해외 GP', role: 'GP', counterpart: cpLp ? cpLp.inst : '', overseas: true });
    }
  }
  for (const e of out) e.key = `${e.inst}|${String(e.title).replace(/[^0-9A-Za-z가-힣]/g, '').slice(0, 28)}`;   // 한글 제목도 구분되게
  return out;
}
// 이번 아카이브의 이벤트를 이전 누적분과 합친다 — 92일 창 밖으로 밀려난 기사의
// 투자내역도 계속 남도록(기관별 투자 이력이 시간이 갈수록 쌓인다).
export function buildInvestments(articles, prevItems = []) {
  const prevKeys = new Set((prevItems || []).map((e) => e.key));
  const inArchive = new Set(articles.map((a) => a.id));
  const map = new Map();
  for (const a of articles) {
    for (const e of extractDeals(a)) map.set(e.key, { ...e });
  }
  // 아카이브에서 밀려난 예전 기사의 이벤트는 저장된 제목으로 현재 기준에 맞춰 다시 검증한다
  // (판정 규칙이 정교해지면 과거에 잘못 들어간 항목도 함께 정리되도록). 아카이브에 아직 있는
  // 기사인데 이번 판정에서 빠졌다면 규칙상 이벤트가 아니므로 버린다.
  for (const p of prevItems || []) {
    if (map.has(p.key) || inArchive.has(p.id)) continue;
    const again = extractDeals({
      id: p.id, ko: p.title, en: p.lang === 'en' ? p.title : '', lang: p.lang,
      cat: p.role === 'GP' ? 'GP' : 'LP', instType: p.instType, inst: p.inst,
      asset: p.asset, region: p.region, body: '', date: p.date, ts: p.ts, source: p.source, url: p.url, gurl: p.gurl,
    }).find((e) => e.inst === p.inst);
    if (again && !map.has(again.key)) map.set(again.key, { ...p, key: again.key, kind: again.kind, status: again.status, amount: again.amount || p.amount, overseas: p.overseas || again.overseas });
  }
  const items = [...map.values()].sort((x, y) => (x.ts < y.ts ? 1 : x.ts > y.ts ? -1 : 0)).slice(0, 3000);
  const prevIds = new Set((prevItems || []).map((e) => `${e.inst}|${e.id}`));
  const added = items.filter((e) => !prevKeys.has(e.key) && !prevIds.has(`${e.inst}|${e.id}`)).length;
  const { date } = kstParts();
  return { updatedAt: date, count: items.length, added, items };
}

// ── 펀드레이징 트래커: 운용사·펀드별 모집 단계와 단계별 일자 (fundraising.json, 누적) ──
// 단계 판별 순서가 중요 — 구체적 표현(파이널/중간/1차)을 일반 표현보다 먼저 본다.
// 일자는 해당 단계를 보도한 기사의 날짜다(운용사 공시일과 하루 이틀 다를 수 있음).
export const FR_ORDER = ['모집 중', '1차 클로즈', '중간 클로즈', '클로즈', '파이널 클로즈'];
const FR_STAGES = [
  ['파이널 클로즈', /파이널\s*클로(?:즈|징)|최종\s*클로(?:즈|징)|최종\s*결성|결성\s*(?:완료|마무리)|final\s*clos|hard[- ]?cap|하드캡/i],
  ['중간 클로즈', /(?:중간|2차|3차|두\s*번째)\s*클로(?:즈|징)|interim\s*clos|second\s*clos|third\s*clos|\bsurpass(?:es|ed)?\b(?!.{0,40}\bfinal)/i],
  ['1차 클로즈', /1차\s*클로(?:즈|징)|퍼스트\s*클로(?:즈|징)|첫\s*클로(?:즈|징)|first\s*clos/i],
  ['클로즈', /클로(?:즈|징)|결성(?:했|을|식|한)|\bclose[sd]?\b|\bclosing\b|\braised\b|\btops?\b.{0,20}\btarget\b|\bhits?\b.{0,20}\btarget\b/i],
  ['모집 중', /모집|조성(?:\s*중|한다|에\s*나서|\s*추진)|목표(?:로|액)|타깃|\btarget(?:ing|s)?\b|\braising\b|\blaunch(?:es|ed)?\b|\bseeks?\b|출범|\bmarket(?:ing|s)?\b.{0,15}\bfund\b/i],
];
const FR_EXCLUDE = /환매|redemption|상장폐지|withdrawal|\bETF\b|mutual fund|pension fund|sovereign wealth fund|hedge fund|index fund|\bmuni|closed-end|\blisted\b|dividend|distribution (?:declar|rate)|\bNAV\b|share class|\bprofit\b|\breports?\b|위탁사로\s*선정|위탁운용사|딜\s*클로징|출자\s*사업|tender offer|공개\s*매수|share (?:sale|buyback)|stock|commentary|\breview\b|\bQ[1-4]\s*20\d\d/i;
// 펀드 이름 — 영문 "…Partners IX / Fund XI / Fund 5", 국문 "…3호"
const ORDINALS = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12 };
const ROMAN = { I: 1, V: 5, X: 10, L: 50 };
const roman = (r) => { let n = 0; for (let i = 0; i < r.length; i++) { const v = ROMAN[r[i]], w = ROMAN[r[i + 1]] || 0; n += v < w ? -v : v; } return n; };
export function fundNameOf(title, gp) {
  const t = String(title || '');
  let m = t.match(/\b((?:[A-Z][\w&'’.-]*\s+){0,5}(?:Fund|Partners|Opportunities|Programme|Program|Strategies|Infrastructure|Credit|Capital|Ventures|Equity|Secondaries)\s+(?:[IVXL]{1,5}|\d{1,2}))\b(?![\w])/);
  if (m) {
    const name = m[1].replace(/\s+/g, ' ').trim()
      .replace(/^(?:.*?\b(?:Billion|Million|Bn|Mn|Closes?|Raises?|Hits?|Launch(?:es)?|For|On|At|Of|To|With|Its|Their)\s+)+/i, '');   // 금액·동사 조각 제거
    if (/^(?:Fund|Partners|Capital|Equity|Credit|Ventures)\s/i.test(name) && gp) return `${gp} ${name}`;
    if (name && !/^(?:The|A|An)\s/.test(name) && name.split(' ').length >= 2) return name;
  }
  m = t.match(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|\d{1,2}(?:st|nd|rd|th))\s+(?:flagship\s+|debut\s+|new\s+)?((?:(?:secondaries|secondary|buyout|growth|infrastructure|infra|credit|debt|lending|real estate|property|venture|opportunities|opportunity|energy|climate|impact|european|europe|asia|asian|global|core|value-add|logistics|special situations|pe|private equity)\s+){0,3})fund\b/i);
  if (m && gp) {
    const n = ORDINALS[m[1].toLowerCase()] || parseInt(m[1], 10);
    // 서수만 알 때는 공식명처럼 지어내지 않고 'N호 펀드'로 표기한다
    return `${gp} ${n}호 펀드`;
  }
  m = t.match(/([가-힣A-Za-z0-9·]{2,20}(?:\s?[가-힣A-Za-z0-9·]{1,12}){0,2}\s?\d{1,2}호)/);
  if (m) return m[1].replace(/\s+/g, ' ').trim();
  return '';
}
// 운용사 — 추적 GP 가 아니면 영문 제목 맨 앞 주어("Connect Ventures hits…")를 운용사로 본다
// 운용사(펀드를 모집하는 주체) — 제목의 '주어'만 인정한다. 제목 어딘가에 언급된 GP 를 붙이면
// "Cox Capital, 블랙스톤 펀드 지분 공개매수"처럼 대상 펀드의 운용사로 잘못 귀속된다.
function canonGp(name) {
  const g = gpsIn(String(name || ''))[0];
  return g ? g.inst : String(name || '').replace(/,?\s+(?:Inc\.?|LLC|L\.P\.|LP|Ltd\.?|plc|AG|SA|GmbH)$/i, '').trim();
}
function sponsorOf(a) {
  const title = String(a.ko || '');
  const g = gpsIn(title)[0];
  if (g && g.idx <= 2) return g.inst;                                   // 제목 맨 앞의 추적 GP = 주어
  const lp = lpsIn(title)[0];                                           // 국내 운용사가 조성하는 펀드("신한자산운용, 1조 사모펀드 조성")
  if (lp && lp.idx <= 1 && ['자산운용사', '증권사'].includes(lp.instType)) return lp.inst;
  const m = title.match(/^((?:[^\s]+\s+){1,5}?)(?:closes|closed|raises|raised|hits|holds|reaches|surpasses|tops|launches|launched|to launch|targets|seeks|eyes|nears|wraps|completes|announces|expands|unveils)\b/i);
  if (m) {
    const words = m[1].trim().replace(/(?:'s|’s)$/, '').split(/\s+/).filter((w) => !/^(?:GmbH|Ltd|LLC|Inc\.?|AG|SA|plc)$/i.test(w));
    while (words.length > 1 && /[’']$/.test(words[0])) words.shift();          // "Dallas’ Crow Holdings" → Crow Holdings
    if (words.length && words.every((w) => /^[A-Z0-9&]/.test(w))) return canonGp(words.join(' '));
  }
  const ko = title.match(/^([^,…·\s][^,…]{1,24}),\s/);                  // "운용사명, …" 형식의 국문 제목
  if (ko) { const gk = gpsIn(ko[1])[0]; if (gk) return gk.inst; }
  return '';
}
const FR_AMT = /(?:US\$|A\$|\$|€|£|¥|₩)\s?[\d.,]+\s?(?:trillion|billion|million|tn|bn|mn|T|B|M)\b|[\d,.]+\s?조\s?(?:[\d,]+\s?억)?\s?원?|[\d,.]+\s?억\s?(?:원|달러|유로|엔)?/i;
export function extractFundraising(a) {
  const title = String(a.ko || '');
  const txt = `${title} ${(a.body || '').slice(0, 260)}`;
  if (!/펀드|\bfunds?\b|블라인드|비히클|vehicle|programme|\bclose\b/i.test(title)) return null;   // 제목에 펀드 맥락 필수
  if (FR_EXCLUDE.test(title)) return null;
  const hit = FR_STAGES.find(([, re]) => re.test(title)) || FR_STAGES.find(([, re]) => re.test(txt));
  if (!hit) return null;
  const tm = txt.match(new RegExp(`(?:target(?:ing|ed)?(?:\\s+of)?|목표(?:액|\\s*규모)?(?:는|은|로)?)\\s*(?:about\\s*|약\\s*)?(${FR_AMT.source})`, 'i'));
  const target = tm ? tm[1].replace(/\s+/g, ' ').trim() : '';
  let size = dealAmount(title) || (a.metric && a.metric !== '뉴스' ? a.metric : '') || '';
  if (size && target && size === target && hit[0] === '모집 중') size = '';
  return { stage: hit[0], size, target };
}
const title0 = (a) => String(a.ko || '');
const FRX_STAGE = { launch: '모집 중', first_close: '1차 클로즈', interim_close: '중간 클로즈', final_close: '파이널 클로즈', close: '클로즈' };
const STRAT_ASSET = { 'Private Equity': 'PE', Infrastructure: 'IN', 'Real Estate': 'RE', 'Private Credit': 'PC', Aviation: 'AV' };
const ROMAN_N = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12, xiii: 13, xiv: 14, xv: 15, xvi: 16, xvii: 17, xviii: 18, xix: 19, xx: 20 };
// 펀드명 핵심부 — 운용사 이름·일반어(fund/partners/capital/L.P.)를 빼고 로마 숫자·'N호'를 숫자로 통일
// 국문 음역 펀드명("웨스트 스트리트 캐피털 파트너스 9호")을 영문 펀드명과 맞대기 위한 낱말표
const KO_FUND_WORDS = [[/웨스트/g, 'west'], [/이스트/g, 'east'], [/스트리트/g, 'street'], [/캐피[털탈]/g, 'capital'], [/파트너스/g, 'partners'], [/아시아/g, 'asia'],
  [/에[쿼퀴]티/g, 'equity'], [/인프라스트럭처|인프라/g, 'infrastructure'], [/리얼\s?에스테이트/g, 'real estate'], [/크레디?트|크레딧/g, 'credit'], [/오퍼튜니티즈?/g, 'opportunities'],
  [/글로벌/g, 'global'], [/세컨더리즈?/g, 'secondaries'], [/그로스/g, 'growth'], [/벤처스/g, 'ventures'], [/인컴/g, 'income'], [/인베스터스/g, 'investors'], [/펀드/g, 'fund'], [/스트래티직/g, 'strategic']];
function fundCore(f, gp) {
  let t = AC.enNames(String(f || '')).replace(/\([^)]*\)/g, ' ');            // "(WSCP IX)"·"(CRECH)" 같은 괄호 약칭 제외
  for (const [re, w] of KO_FUND_WORDS) t = t.replace(re, ' ' + w + ' ');
  t = t.toLowerCase().replace(/(\d+)\s*호/g, ' $1 ');
  for (const w of AC.enNames(String(gp || '')).toLowerCase().split(/\s+/)) if (w.length > 1) t = t.replace(new RegExp(`\\b${w.replace(/[^a-z0-9]/g, '')}\\b`, 'g'), ' ');
  t = t.replace(/\b(?:fund|funds|partners|capital|ventures|management|investments|investors|group|l\.?p\.?|scsp|the|and|of)\b/g, ' ');
  t = t.replace(/\b([ivxl]{1,5})\b/g, (m) => (ROMAN_N[m] != null ? String(ROMAN_N[m]) : m));
  return t.replace(/[^0-9a-z가-힣]/g, '');
}
const normFund = (f) => fundCore(f, '');
const normAmt = (x) => String(x || '').toLowerCase().replace(/\s+/g, '').replace(/us\$/, '$').replace(/billion/, 'bn').replace(/million/, 'm');
// 본문에서 펀드명 찾기(LLM 결과가 없을 때): 운용사 이름이 나온 문장 안의 "…Fund IV / Partners X"
function fundNameFromBody(body, gp) {
  if (!body) return '';
  const sents = String(body).slice(0, 4000).split(/(?<=[.!?다])\s+/);
  for (const snt of sents) {
    if (gp && !snt.toLowerCase().includes(gp.toLowerCase().split(' ')[0])) continue;
    const f = fundNameOf(snt, gp);
    if (f) return f;
  }
  return '';
}
// 금액 문자열 → 미화 백만 달러(대략). 서로 다른 통화·표기('¥612bn' vs '$4B', '117억달러' vs '$11.7B')를 비교하기 위함
const FX_USD = { '$': 1, usd: 1, 'us$': 1, 'a$': 0.66, aud: 0.66, 'c$': 0.73, cad: 0.73, '€': 1.08, eur: 1.08, '유로': 1.08, '£': 1.27, gbp: 1.27, '파운드': 1.27, '¥': 0.0067, jpy: 0.0067, '엔': 0.0067, '₩': 0.00072, krw: 0.00072, '원': 0.00072, '₹': 0.012, rs: 0.012, inr: 0.012, '루피': 0.012, r: 0.055, zar: 0.055, '₦': 0.00065, n: 0.00065, ngn: 0.00065, '나이라': 0.00065, '달러': 1 };
export function usdMn(str) {
  const t = String(str || '').replace(/,/g, '').trim();
  if (!t) return 0;
  let m = t.match(/([\d.]+)\s*조\s*(?:([\d.]+)\s*억)?\s*(원|달러|유로|엔)?/);
  if (m) { const v = (+m[1] * 1e12 + (m[2] ? +m[2] * 1e8 : 0)); return v * (FX_USD[m[3] || '원'] || FX_USD['원']) / 1e6; }
  m = t.match(/([\d.]+)\s*억\s*(원|달러|유로|엔|파운드|루피)?/);
  if (m) return +m[1] * 1e8 * (FX_USD[m[2] || '원'] || FX_USD['원']) / 1e6;
  m = t.match(/(us\$|a\$|c\$|\$|€|£|¥|₩|₹|₦|\brs\.?|\busd|\beur|\bgbp|\bjpy|\binr|\bngn|\bzar|\bR(?=\d)|\bN(?=\d))?\s*([\d.]+)\s*(trillion|tn|billion|bn|b|million|mn|m|crore|cr|lakh)?\b/i);
  if (!m || !m[2]) return 0;
  const cur = (m[1] || '$').toLowerCase().replace('.', '');
  const unit = (m[3] || '').toLowerCase();
  const mult = /^(?:trillion|tn)$/.test(unit) ? 1e12 : /^(?:billion|bn|b)$/.test(unit) ? 1e9 : /^(?:million|mn|m)$/.test(unit) ? 1e6 : /^(?:crore|cr)$/.test(unit) ? 1e7 : unit === 'lakh' ? 1e5 : 1;
  const fx = FX_USD[cur] != null ? FX_USD[cur] : 1;
  return +m[2] * mult * fx / 1e6;
}
// 국문 금액 '96억달러' → '$9.6bn' (펀드 금액 표기를 영문 기사와 맞춘다)
function fmtFundAmt(s) {
  const t = String(s || '').replace(/\s+/g, '');
  const m = t.match(/^(?:약)?([\d,.]+)억(달러|유로)(?:이상)?$/);
  if (!m) return String(s || '').trim();
  const v = parseFloat(m[1].replace(/,/g, '')) / 10;           // 억 → bn
  const sym = m[2] === '달러' ? '$' : '€';
  return v >= 1 ? `${sym}${+v.toFixed(2)}bn` : `${sym}${Math.round(v * 1000)}m`;
}
// 단계별 금액 투표 — 같은 사건을 여러 매체가 다른 숫자(펀드 단독 96억 달러 vs 관련 비히클 합계 117억 달러)로
// 쓰면, 본문에서 펀드명과 함께 읽은 금액을 우선하고 그다음 많이 보도된 금액을 고른다
function addVote(votes, size, llm) {
  if (!size) return votes;
  const key = String(Math.round(usdMn(size)) || size);
  const v = votes[key];
  votes[key] = v ? { ...v, n: v.n + 1, llm: v.llm || !!llm } : { size, n: 1, llm: !!llm };
  return votes;
}
function pickVote(votes) {
  const list = Object.values(votes || {});
  if (!list.length) return '';
  list.sort((x, y) => (y.llm - x.llm) || (y.n - x.n));
  return list[0].size;
}
// 펀드명 분해 — 호수(IX = 9호 = Ninth), 고유어(운용사명·일반어 제외), 머리글자
const ORD_WORDS = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth', 'twentieth'];
const ROMANS = ['', 'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii', 'xiii', 'xiv', 'xv', 'xvi', 'xvii', 'xviii', 'xix', 'xx'];
const koFundText = (t) => { let x = AC.enNames(String(t || '')); for (const [re, w] of KO_FUND_WORDS) x = x.replace(re, ' ' + w + ' '); return x; };
function fundPartsOf(f, gp) {
  let t = koFundText(String(f || '').replace(/\([^)]*\)/g, ' '));
  t = t.toLowerCase().replace(/(\d+)\s*호/g, ' $1 ').replace(/\b([ivxl]{1,5})\b/g, (m) => (ROMAN_N[m] != null ? String(ROMAN_N[m]) : m));
  const num = (t.match(/\b(\d{1,2})\b/) || [])[1] || '';
  const gpw = new Set(AC.enNames(String(gp || '')).toLowerCase().split(/\s+/));
  const words = t.replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w && !/^\d+$/.test(w) && !gpw.has(w) && !/^(?:fund|funds|l|p|lp|the|and|of)$/.test(w));
  const core = words.filter((w) => !/^(?:partners|capital|ventures|management|investments|investors|group|scsp|private|equity)$/.test(w));
  return { num, words, letters: core.join(''), core, acro: words.map((w) => w[0]).join('') };
}
// LLM 이 뽑은 펀드명이 기사(제목·본문)에 실제로 근거가 있는지 — 본문 없이 제목만 보고 호수를 지어낸
// 경우("Permira Holds €9.4 Billion First Close" → "Permira VIII")를 걸러낸다
function fundInText(a, fund, gp) {
  const raw = `${a.ko || ''} ${a.body || ''}`;
  const t = koFundText(raw).toLowerCase();
  if (t.includes(String(fund).toLowerCase())) return true;
  const p = fundPartsOf(fund, gp);
  if (p.num) {
    const n = +p.num;
    const re = new RegExp(`\\b(?:${ROMANS[n] || '#'}|${n}|${ORD_WORDS[n] || '#'}|${n}(?:st|nd|rd|th))\\b|${n}\\s*호`, 'i');
    if (!re.test(koFundText(raw))) return false;
  }
  const distinct = p.core.filter((w) => w.length >= 3);
  if (!distinct.length) return !!p.num;
  return distinct.some((w) => t.includes(w)) || (!!p.acro && p.acro.length >= 3 && t.includes(p.acro));
}
// 운용사 판정 보조: LP가 앵커·출자한 기사("Hashed anchors … fund")의 주어는 운용사가 아니다
const ANCHOR_RE = /\b(?:anchors?|anchored|backs|backed|commits?\s+(?:to|\$|€|£)|invests?\s+(?:\$[\d.]+\w*\s+)?in)\b/i;
function managedBy(body) {
  const m = String(body || '').match(/\b(?:managed|run|operated|sponsored|advised)\s+by\s+((?:[A-Z][\w&.'’-]*\s?){1,5})/);
  return m ? m[1].trim().replace(/\s+(?:and|The|which|who|in|a)$/i, '').replace(/[.,]$/, '') : '';
}
// 파이널 클로즈 '임박'(nears/on the cusp/…)은 아직 모집 중
const NEAR_RE = /\bnears?\b|\bnearing\b|approach(?:es|ing)\b|on the cusp|clos(?:es|ing) in on|poised to|set to (?:close|hold)|임박|앞두/i;
// 펀드명(LLM·본문 추출)이 그 운용사와 같은 문맥에 나오는지 — 다른 회사 펀드를 잘못 붙이는 것을 막는다
function fundNearGp(a, fund, gp) {
  if (!fund || !gp) return true;
  const f = fund.toLowerCase();
  if (String(a.ko || '').toLowerCase().includes(f)) return true;
  const body = AC.enNames(String(a.body || ''));
  const i = body.toLowerCase().indexOf(f);
  if (i < 0) return true;                                                      // 표기가 달라 본문에서 못 찾으면 판단 보류
  const g = AC.enNames(gp).toLowerCase().split(/\s+/)[0];
  const win = body.slice(Math.max(0, i - 350), i + f.length + 350).toLowerCase();
  return f.includes(g) || win.includes(g);
}
// 제목 기반 전략(LLM 결과가 없을 때)
function stratFromTitle(t) {
  t = String(t || '');
  if (/secondar|세컨더리|continuation|컨티뉴에이션|GP-led/i.test(t)) return 'Secondaries';
  if (/infra|인프라|energy|transition|digital infrastructure|data cent/i.test(t)) return 'Infrastructure';
  if (/real estate|property|logistics|부동산|물류|office/i.test(t)) return 'Real Estate';
  if (/credit|debt|lending|loan|대출|크레딧/i.test(t)) return 'Private Credit';
  if (/venture|벤처|seed|series [a-d]\b/i.test(t)) return 'Venture Capital';
  if (/buyout|private equity|사모펀드|바이아웃|growth/i.test(t)) return 'Private Equity';
  return '';
}
export function buildFundraising(articles, prevItems = []) {
  const map = new Map();
  const inArchive = new Set(articles.map((a) => a.id));
  const mk = (a) => {
    if (a.cat === '인사' || a.cat === '이전') return null;
    const fr = extractFundraising(a);
    if (!fr) return null;
    const x = a.bodyMismatch ? null : (a.frx || null);                        // 제목과 무관한 본문에서 뽑은 값은 믿지 않는다
    if (x && x.stage === 'none') return null;                                  // 본문상 모집·클로즈 소식이 아님
    // 운용사: 본문을 읽고 뽑은 운용사(LLM) > 제목의 주어. 펀드명이 다른 운용사 이름으로 시작하면 그 운용사로 바로잡는다.
    let gp = (x && x.manager ? canonGp(x.manager) : '') || sponsorOf(a) || '';
    const mb = managedBy(a.body);
    if (ANCHOR_RE.test(title0(a))) gp = mb ? canonGp(mb) : '';               // 앵커 LP ≠ 운용사 → 본문의 "managed by …"
    else if (!gp && mb) gp = canonGp(mb);
    let fund = (x && x.fund && fundInText(a, x.fund, gp) ? x.fund : '') || fundNameOf(a.ko, gp) || fundNameFromBody(a.body, gp);
    if (fund && !fundNearGp(a, fund, gp)) fund = '';                          // 다른 회사 펀드명을 붙이지 않는다
    if (fund && /^(?:Fund|Partners|Strategic\s+Fund)\b/i.test(fund.trim())) fund = `${(x && x.manager && !/[가-힣]/.test(x.manager) ? x.manager : gp)} ${fund.trim()}`;   // "Fund XI" → "Bain Capital Ventures Fund XI"
    if (fund && (/^series\s+\w+$/i.test(fund.trim()) || fundCore(fund, gp).length < 1)) fund = '';   // "Series 12"(트랜치)·운용사명뿐인 이름
    if (fund) {
      const inFund = gpsIn(fund)[0];
      if (inFund && inFund.idx === 0 && inFund.inst !== gp) gp = inFund.inst;   // 펀드명이 다른 추적 GP 이름으로 시작
    }
    // 운용사 자리에 펀드 이름이 들어간 경우(“Maple Fund”, “BXPM Fund”) → 제목의 추적 GP 로
    if ((!gp || /\bfund\b|펀드$/i.test(gp)) && gpsIn(a.ko || '')[0]) gp = gpsIn(a.ko || '')[0].inst;
    const tHit = FR_STAGES.find(([, re]) => re.test(title0(a)));
    let stage = (x && FRX_STAGE[x.stage]) || fr.stage;
    if (stage === '모집 중' && tHit && tHit[0] !== '모집 중' && !/target|seek|launch|목표|모집/i.test(title0(a))) stage = tHit[0];   // 제목이 '모았다'인데 LLM이 launch로 본 경우
    let size = fmtFundAmt((x && x.amount) || fr.size);
    let target = fmtFundAmt((x && x.target) || fr.target);
    if (stage !== '모집 중' && NEAR_RE.test(title0(a))) { target = target || size; size = ''; stage = '모집 중'; }   // 클로즈 '임박'
    const usd = usdMn(size || target);
    if (usd && usd < 20) return null;                                           // 소형(2,000만 달러 미만) 펀드는 제외
    const asset = (x && STRAT_ASSET[x.strategy]) || a.asset;
    const strategy = (x && x.strategy && x.strategy !== 'Other') ? x.strategy : stratFromTitle(title0(a));
    // 일자: 본문에 적힌 실제 일자 > 기사 날짜
    const evTs = x && x.date ? `${x.date}T00:00:00.000Z` : a.ts;
    const base = gp || '?';
    // 공식 펀드명이 충분히 고유하면 운용사 표기 차이(Goldman Sachs / Goldman Sachs Alternatives)와 무관하게 한 펀드로 본다.
    // 이름 없는 보도는 단계·금액이 같을 때만 묶는다.
    const core = fund ? fundCore(fund, gp) : '';
    const fundKey = core.length >= 12 ? `F|${core}` : base + '|' + (core || `~${asset}|${stage}|${normAmt(size)}`);
    const key = fundKey + '|' + stage + '|' + String(a.ko).replace(/[^0-9A-Za-z가-힣]/g, '').slice(0, 24);
    return { key, fundKey, gp, fund, asset, strategy, stage, size, sizeLlm: !!(x && x.amount && x.fund && fund), target, hardcap: (x && x.hardcap) || '', dated: !!(x && x.date), title: a.ko, tko: a.tko || '', id: a.id, url: a.url, gurl: a.gurl, date: a.date, ts: evTs, pubTs: a.ts, source: a.source, lang: a.lang };
  };
  for (const a of articles) { const e = mk(a); if (e) map.set(e.key, e); }
  for (const p of prevItems || []) {
    if (!p.key || map.has(p.key) || inArchive.has(p.id)) continue;
    map.set(p.key, p);                                                          // 아카이브 밖으로 밀려난 보도는 그대로 누적 보존
  }
  const items = [...map.values()].sort((x, y) => ((x.pubTs || x.ts) < (y.pubTs || y.ts) ? 1 : -1)).slice(0, 2000);
  // 이름을 못 뽑은 보도는 같은 운용사의 이름 있는 펀드와 금액이 같으면 그 펀드로 합친다
  const named = new Map();
  for (const e of items) if (e.gp && e.fund && e.size) named.set(`${e.gp}|${normAmt(e.size)}`, e.fundKey);
  for (const e of items) {
    if (e.gp && !e.fund && e.size) { const k = named.get(`${e.gp}|${normAmt(e.size)}`); if (k) e.fundKey = k; }
  }
  const funds = new Map();
  for (const e of items.slice().reverse()) {
    if (!e.gp) continue;
    const f = funds.get(e.fundKey) || { fundKey: e.fundKey, gp: e.gp, fund: e.fund, asset: e.asset, strategy: '', target: '', hardcap: '', stages: {}, dropped: [], lastTs: '' };
    if (e.fund && (!f.fund || (/[가-힣]/.test(f.fund) && !/[가-힣]/.test(e.fund)) || (!/[가-힣]/.test(e.fund) && e.fund.length > f.fund.length && e.fund.includes(f.fund.split(' ').pop())))) f.fund = e.fund;   // 영문 공식명·더 온전한 이름 우선
    if (e.gp && e.gp.length < f.gp.length && f.gp.startsWith(e.gp)) f.gp = e.gp;
    if (!f.strategy && e.strategy) f.strategy = e.strategy;
    if (!f.target && e.target) f.target = e.target;
    if (!f.hardcap && e.hardcap) f.hardcap = e.hardcap;
    const st = f.stages[e.stage];
    const rec = { stage: e.stage, ts: e.ts, dated: e.dated, size: e.size, sizeLlm: e.sizeLlm, votes: addVote({}, e.size, e.sizeLlm), id: e.id, url: e.url, gurl: e.gurl, title: e.title, tko: e.tko, source: e.source, reports: 1 };
    if (!st) f.stages[e.stage] = rec;
    else {
      st.reports++;
      addVote(st.votes = st.votes || {}, e.size, e.sizeLlm);
      if ((!st.size && e.size) || (e.sizeLlm && !st.sizeLlm && e.size)) { st.size = e.size; st.sizeLlm = e.sizeLlm; }   // 펀드명과 함께 본문에서 읽은 금액 우선
      // 실제 일자가 적힌 보도가 있으면 그 날짜를 우선, 아니면 가장 이른 보도일
      if ((e.dated && !st.dated) || (e.dated === st.dated && e.ts < st.ts)) Object.assign(st, { ts: e.ts, dated: e.dated, id: e.id, url: e.url, gurl: e.gurl, title: e.title, tko: e.tko, source: e.source });
    }
    if ((e.pubTs || e.ts) > f.lastTs) f.lastTs = e.pubTs || e.ts;
    funds.set(e.fundKey, f);
  }
  // a 의 보도를 b 로 합치고 a 를 지운다
  const alias = {};                                                             // 합쳐진 펀드 키 → 남은 펀드 키
  const mergeFund = (a, b) => {
    alias[a.fundKey] = b.fundKey;
    for (const [k, st] of Object.entries(a.stages)) {
      const cur = b.stages[k];
      if (cur) { const v = { ...(cur.votes || {}) }; for (const [key, x] of Object.entries(st.votes || {})) { const y = v[key]; v[key] = y ? { ...y, n: y.n + x.n, llm: y.llm || x.llm } : x; } st.votes = v; cur.votes = v; }
      if (!cur || (st.dated && !cur.dated) || (st.dated === cur.dated && st.ts < cur.ts)) b.stages[k] = { ...st, size: (cur && cur.sizeLlm && !st.sizeLlm ? cur.size : st.size) || (cur && cur.size) || '', reports: (st.reports || 1) + (cur ? cur.reports : 0) };
      else { cur.reports += st.reports || 1; if ((!cur.size && st.size) || (st.sizeLlm && !cur.sizeLlm && st.size)) { cur.size = st.size; cur.sizeLlm = st.sizeLlm; } }
    }
    if (a.fund && (!b.fund || (/[가-힣]/.test(b.fund) && !/[가-힣]/.test(a.fund)))) b.fund = a.fund;
    b.target = b.target || a.target; b.hardcap = b.hardcap || a.hardcap; b.strategy = b.strategy || a.strategy;
    if (a.lastTs > b.lastTs) b.lastTs = a.lastTs;
    funds.delete(a.fundKey);
  };
  // 이름 변형 병합: 같은 운용사에서 한 펀드명 핵심부가 다른 것에 포함되면(숫자 없는 쪽만) 같은 펀드로 본다
  //   "BXPM Fund" ⊂ "BXPM – Blackstone Private Markets Fund", "Seahawk Maritime Credit Fund" ⊂ "… Fund I"
  const fl = [...funds.values()].filter((f) => f.fund);
  for (const a of fl) {
    const ca = fundCore(a.fund, a.gp);
    if (!ca || /\d/.test(ca) || !funds.has(a.fundKey)) continue;
    const b = fl.find((o) => o !== a && o.gp === a.gp && funds.has(o.fundKey) && fundCore(o.fund, o.gp).includes(ca));
    if (!b) continue;
    mergeFund(a, b);
    if (a.fund.length > b.fund.length && !/[가-힣]/.test(a.fund)) b.fund = a.fund;
  }
  // 약칭·국문 표기 병합: 같은 운용사·같은 호수(IX = 9호)이고 이름이 같거나 한쪽이 다른 쪽의 머리글자면 같은 펀드
  //   "West Street Capital Partners IX" = "WSCP 9호" = "웨스트스트리트 캐피털파트너스(WSCP) 9호"
  for (const a of [...funds.values()]) {
    if (!a.fund || !funds.has(a.fundKey)) continue;
    const pa = fundPartsOf(a.fund, a.gp);
    if (!pa.num || !pa.letters) continue;
    const b = [...funds.values()].find((o) => o !== a && o.fund && o.gp === a.gp && funds.has(o.fundKey) && (() => {
      const pb = fundPartsOf(o.fund, o.gp);
      return pb.num === pa.num && pb.letters && (pb.letters === pa.letters || pa.acro === pb.letters || pb.acro === pa.letters
        || (pa.letters.length >= 5 && pb.letters.includes(pa.letters)) || (pb.letters.length >= 5 && pa.letters.includes(pb.letters)));
    })());
    if (b) mergeFund(a, b);
  }
  // 운용사 자리에 펀드 이름이 들어간 경우("Nigeria Infrastructure Debt Fund" 가 GP) → 그 이름의 펀드를 가진 운용사로
  for (const f of [...funds.values()]) {
    if (!funds.has(f.fundKey) || !/\bfund\b|펀드$/i.test(f.gp)) continue;
    const o = [...funds.values()].find((o) => o !== f && o.fund && o.gp !== f.gp && normFund(o.fund) === normFund(f.gp));
    if (o) mergeFund(f, o);
  }
  // 펀드명 없는 보도 합치기 — 같은 운용사에서 2주 안에 나온 이름 있는 펀드가 하나뿐이면 그 펀드의 보도로 본다.
  // 이름 없는 보도끼리는 자산군이 같고 금액이 (통화 환산 후) 10% 안이거나 한쪽이 비어 있으면 같은 펀드로 본다.
  const near = (x, y, d = 14) => Math.abs(Date.parse(x) - Date.parse(y)) <= d * 86400000;
  const tsOf = (f) => Object.values(f.stages).map((st) => st.ts);
  const within = (x, y) => tsOf(x).some((a) => tsOf(y).some((b) => near(a, b)));
  const amtOf = (f) => { const v = Object.values(f.stages).map((st) => usdMn(st.size)).filter(Boolean); return v.length ? Math.max(...v) : 0; };
  for (const u of [...funds.values()]) {
    if (u.fund || !funds.has(u.fundKey)) continue;
    const named = [...funds.values()].filter((o) => o !== u && o.fund && o.gp === u.gp && within(u, o));
    if (named.length === 1) { mergeFund(u, named[0]); continue; }
    if (named.length) continue;
    const ua = amtOf(u);
    const twin = [...funds.values()].find((o) => o !== u && !o.fund && o.gp === u.gp && o.asset === u.asset && within(u, o)
      && (!ua || !amtOf(o) || Math.abs(ua - amtOf(o)) / Math.max(ua, amtOf(o)) <= 0.1));
    if (twin) mergeFund(u, twin);
  }
  // 시간 순서 검증: 뒤 단계보다 늦게 보도된 앞 단계(예: 클로즈 뒤의 '모집 개시')는 같은 펀드의
  // 사건일 수 없으므로(재탕 기사·다른 빈티지) 타임라인에서 빼고 따로 표시한다.
  const fundList = [...funds.values()].map((f) => {
    // 파이널 클로즈 전후 1주 안의 일반 '클로즈' 보도는 같은 사건 → 파이널 클로즈에 합친다
    const fin = f.stages['파이널 클로즈'], gen = f.stages['클로즈'];
    if (fin && gen && near(fin.ts, gen.ts, 7)) { fin.reports += gen.reports || 1; if (!fin.size && gen.size) fin.size = gen.size; delete f.stages['클로즈']; }
    for (const st of Object.values(f.stages)) { const v = pickVote(st.votes); if (v) st.size = v; delete st.votes; }
    let stages = FR_ORDER.filter((k) => f.stages[k]).map((k) => f.stages[k]);
    const kept = [];
    for (let i = stages.length - 1; i >= 0; i--) {
      const s = stages[i];
      const later = kept[0];
      // 뒤 단계보다 늦은 앞 단계는 모순. '모집 중'은 클로즈와 같은 날이어도(마감 보도를 '조성'으로 쓴 기사) 뺀다
      const bad = later && (s.ts.slice(0, 10) > later.ts.slice(0, 10) || (s.stage === '모집 중' && s.ts.slice(0, 10) >= later.ts.slice(0, 10)));
      if (bad) { f.dropped.push({ stage: s.stage, ts: s.ts, title: s.title, source: s.source }); continue; }
      kept.unshift(s);
    }
    stages = kept;
    const status = stages.length ? stages[stages.length - 1].stage : '모집 중';
    const final = stages.find((s) => s.stage === '파이널 클로즈');
    return { ...f, stages, status, finalSize: final ? final.size : '', finalTs: final ? final.ts : '' };
  }).sort((x, y) => (x.lastTs < y.lastTs ? 1 : -1));
  // 보도 목록도 최종 펀드의 운용사·펀드명으로 맞추고, 운용사를 못 정한 보도는 뺀다
  const resolve = (k) => { let n = 0; while (alias[k] && n++ < 20) k = alias[k]; return k; };
  const outItems = items.map((e) => { const f = funds.get(resolve(e.fundKey)); return f ? { ...e, fundKey: f.fundKey, gp: f.gp, fund: f.fund || e.fund } : e; }).filter((e) => e.gp);
  const { date } = kstParts();
  return { updatedAt: date, count: outItems.length, fundCount: fundList.length, namedCount: fundList.filter((f) => f.fund).length, items: outItems, funds: fundList };
}

function extractMetric(text) {
  const pats = [
    /[+\-]?\$[\d.,]+\s?(?:billion|million|bn|m|B|M)?/i,
    /€[\d.,]+\s?(?:billion|million|bn|m|B|M)?/i,
    /£[\d.,]+\s?(?:billion|million|bn|m|B|M)?/i,
    /₩?[\d,]+\s?(?:조|억)\s?원?/,
  ];
  for (const p of pats) { const m = text.match(p); if (m) return m[0].replace(/\s+/g, ' ').trim(); }
  return '';
}
function kstParts(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return { date: `${p(k.getUTCMonth() + 1)}.${p(k.getUTCDate())}`, time: `${p(k.getUTCHours())}:${p(k.getUTCMinutes())}`, iso: d.toISOString() };
}

// ── 원문 URL 해석 + 본문 추출 ────────────────────────────
// Google 뉴스 RSS 링크(news.google.com/rss/articles/CBMi...)에는 실제 기사
// 주소가 base64(protobuf)로 들어있는 경우가 많습니다. 디코딩해 진짜 URL을
// 뽑아내면 "기사 전문 보기"가 구글 인터스티셜을 거치지 않고 바로 원문으로
// 이동하고, 본문 크롤링도 가능해집니다. 실패하면 원래 링크를 그대로 둡니다.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export function resolveGoogleNewsUrl(link) {
  try {
    const m = String(link).match(/news\.google\.com\/(?:rss\/)?articles\/([^?/]+)/);
    if (!m) return link;
    let b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const s = Buffer.from(b64, 'base64').toString('latin1');
    const um = s.match(/https?:\/\/[^\x00-\x1f"'<>\\ ]+/);
    if (um) {
      const url = um[0].replace(/[\x00-\x1f].*$/, '');
      if (!/google\.com/.test(url)) return url;
    }
  } catch {}
  return link;
}

// 새 Google 뉴스 URL 형식(CBMi…)은 실제 주소를 담지 않아 위 디코딩이 실패합니다.
// 이 경우 Google 의 batchexecute RPC(garturlreq)로 실제 기사 주소를 받아옵니다.
// (googlenewsdecoder 가 쓰는 표준 방식) — 1) 기사 페이지에서 서명·타임스탬프를
// 얻고 2) batchexecute 로 원문 URL 을 조회. 실패하면 원래 링크를 그대로 둡니다.
export async function resolveGoogleNewsUrlAsync(link) {
  const sync = resolveGoogleNewsUrl(link);
  if (sync && !/news\.google\.com/.test(sync)) return sync;     // 구형식: 즉시 해석됨
  const m = String(link).match(/news\.google\.com\/(?:rss\/)?articles\/([^?/]+)/);
  if (!m) return link;
  const id = m[1];
  try {
    const r0 = await fetch(`https://news.google.com/rss/articles/${id}`, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(12000) });
    // (a) 단순 리다이렉트로 실제 기사에 도달하면 그 URL 사용
    if (r0.url && !/news\.google\.com|google\.com\/sorry|consent\.google/.test(r0.url)) return r0.url;
    const html = await r0.text();
    const sg = html.match(/data-n-a-sg="([^"]+)"/);
    const ts = html.match(/data-n-a-ts="([^"]+)"/);
    if (!sg || !ts) return link;
    // (b) batchexecute(garturlreq)로 원문 URL 조회
    const inner = JSON.stringify(['garturlreq', [['X', 'X', ['X', 'X'], null, null, 1, 1, 'US:en', null, 1, null, null, null, null, null, 0, 1], 'X', 'X', 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0], id, Number(ts[1]), sg[1]]);
    const body = 'f.req=' + encodeURIComponent(JSON.stringify([[['Fbv4je', inner, null, 'generic']]]));
    const r2 = await fetch('https://news.google.com/_/DotsSplashUi/data/batchexecute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'User-Agent': UA },
      body, signal: AbortSignal.timeout(12000),
    });
    const t = await r2.text();
    const cleaned = t.replace(/\\u003d/g, '=').replace(/\\u0026/g, '&').replace(/\\\//g, '/').replace(/\\"/g, '"');
    const urls = cleaned.match(/https?:\/\/[^"\\\s]+/g) || [];
    let real = urls.find(u => !/(^|\.)google\.com|gstatic|googleusercontent|schema\.org|w3\.org/.test(u));
    if (real) {
      // URL 꼬리 오염 정리 — 이스케이프 잔여물·괄호가 붙으면 일부 사이트가
      // "정상적인 접근이 아닙니다"류로 거부한다. idxno= 형(국내 CMS)은 숫자
      // 뒤를 잘라 정규화한다.
      real = real.replace(/[)\]"'\\,;]+$/, '');
      const m2 = real.match(/^(.*?[?&]idxno=\d+)/);
      if (m2) real = m2[1];
      return real;
    }
  } catch {}
  return link;
}

function metaContent(html, key) {
  const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']+)["']`, 'i');
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${key}["']`, 'i');
  const m = html.match(re1) || html.match(re2);
  return m ? decodeEntities(m[1]) : '';
}

const BOILER_RE = /구독|로그인|회원가입|저작권|무단전재|재배포 금지|all rights reserved|cookie|쿠키|광고|subscribe|sign in|newsletter|관련 기사|기자\s*$/i;
// 사이트 공통 소개문(og:description 이 기사 요약이 아니라 매체 소개일 때) 판별.
const SITE_BOILER_RE = /No\.?1\s*종합|종합\s*경제지|빠르고,?\s*정확하게|정확하게\s*전달|대한민국\s*(대표|No\.?1)|경제신문|일간지|newspaper|leading (economic|daily)/i;
// 기사 본문이 아니라 '많이 본 뉴스' 같은 헤드라인 나열로 보이는지 판별.
export function looksJunky(s) {
  if (!s) return false;
  const t = String(s);
  if (SITE_BOILER_RE.test(t.slice(0, 140))) return true;               // 매체 소개문으로 시작
  const ell = (t.match(/…|\.\.\./g) || []).length;
  if (ell >= 4 && t.length < 3500) return true;                        // 말줄임표 다수 = 헤드라인 나열
  return false;
}
// NewsArticle JSON-LD 의 articleBody (가장 정확한 기사 본문).
function extractJsonLdBody(html) {
  const blocks = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const b of blocks) {
    const jsonText = b.replace(/^[\s\S]*?>/, '').replace(/<\/script>\s*$/i, '').trim();
    let data; try { data = JSON.parse(jsonText); } catch { continue; }
    const nodes = [];
    const push = (x) => { if (Array.isArray(x)) x.forEach(push); else if (x && typeof x === 'object') nodes.push(x); };
    push(Array.isArray(data) ? data : (data['@graph'] || data));
    for (const n of nodes) {
      if (n.articleBody && String(n.articleBody).trim().length > 120) {
        return decodeEntities(String(n.articleBody)).replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
      }
    }
  }
  return '';
}
// 기사 끝에 붙는 신문사 등록정보/발행인/보도원칙 등 '푸터 꼬리' 제거.
// (예: "…전망 등록번호 : 서울,아54780 / 발행인·편집인 : ○○○ / 고충처리인 …")
const FOOTER_RE = /저작권법?|무단\s*(?:사용|전재|복사|배포)|재배포\s*금지|등록번호|사업자등록번호|등록일자|발행일자|발행인|편집인|정보보호\s*책임자|청소년\s*보호책임자|고충처리인|대표전화|보도원칙|반론이나\s*정정|추후보도/;
// 기사 뒤에 딸려오는 '관련기사·많이 본 뉴스' 등 추천 위젯 헤드라인 나열.
const RELATED_RE = /관련\s*기사|많이\s*본\s*뉴스|인기\s*기사|추천\s*기사|함께\s*본\s*기사|핫\s*클릭|실시간\s*뉴스|이\s*시각\s*(?:추천|인기|주요)|화제의\s*뉴스|기자\s*구독|댓글\s*정책/;
// 포털(다음 등) 위젯 안내문 — TTS(음성듣기)·글자크기 조절·포털 홍보문·언어 목록.
const TTS_RE = /음성으로\s*듣기|음성\s*재생|데이터\s*요금이\s*발생|글자\s*수\s*[\d,]+\s*자?\s*초과|본문\s*듣기|텍스트\s*음성\s*변환|글씨\s*크기\s*조절|글자\s*크기\s*설정|글자크기가\s*변경|파란\s*원을\s*좌우로|다음뉴스를\s*만나보세요|쌍방향\s*소통이\s*숨쉬는|뉴스를\s*입체적으로\s*전달|\(예시\)\s*가장\s*빠른\s*뉴스/;
const LANG_TOKEN_RE = /English|日本語|简体中文|Nederlands|Deutsch|Русский|Español|Italiano|Türkçe|tiếng\s*Việt|bahasa|ภาษาไทย|벵골어|아랍어|네델란드어/g;
const isLangList = (s) => ((String(s).match(LANG_TOKEN_RE) || []).length >= 3);
export function stripSiteFooter(t) {
  if (!t) return '';
  let s = String(t);
  // 본문 중간에 끼어든 포털 위젯 안내문 제거(문장 중간 접합 케이스 포함)
  s = s.replace(/음성으로\s*듣기[^\n]{0,200}?있습니다\./g, ' ')
       .replace(/글자\s*수\s*[\d,]+\s*자?\s*초과[^\n]{0,80}?제공합니다\./g, ' ')
       .replace(/음성\s*재생\s*설정[^\n]{0,120}?있습니다\./g, ' ')
       .replace(/글씨\s*크기\s*조절하기[^\n]{0,140}?변경\s*됩니다\./g, ' ')
       .replace(/\(예시\)[^\n]{0,260}?(?:전달하고\s*있습니다|만나보세요)\./g, ' ')
       .replace(/가장\s*빠른\s*뉴스가\s*있고[^\n]{0,260}?(?:전달하고\s*있습니다|만나보세요)\./g, ' ');
  // 본문에 이어 붙은 꼬리는 첫 등록정보 표기부터 끝까지 절단
  const i = s.search(/(?:등록번호|제호|발행인)\s*[:：]/);
  if (i > 80) s = s.slice(0, i);
  // '관련기사/많이 본 뉴스' 위젯이 이어 붙었으면 그 지점부터 절단
  const j = s.search(RELATED_RE);
  if (j > 80) s = s.slice(0, j);
  // 푸터/위젯/언어목록 문단 제거 + 앞 문단과 사실상 같은 반복 문단(포털이
  // 리드를 재삽입하는 패턴) 제거.
  const norms = [];
  s = s.split(/\n{1,}/).map(x => x.trim())
    .filter(x => {
      if (!x || FOOTER_RE.test(x) || RELATED_RE.test(x.slice(0, 24)) || TTS_RE.test(x) || isLangList(x) || isNavBlob(x) || isHeadlineRun(x)) return false;
      const n = x.replace(/[\s\W]/g, '').slice(0, 200);
      const head = n.slice(0, 40);
      if (head && norms.some(p => p.includes(head))) return false;   // 중복 문단 제거
      norms.push(n);
      return true;
    })
    .join('\n\n');
  return s.replace(/[ \t]{2,}/g, ' ').trim();
}
// '문장형' 문단인지 — 헤드라인 나열·내비 메뉴 뭉치를 걸러낸다. 종결어미/마침표로
// 끝나면 통과. 긴 문단이라도 문장부호가 전혀 없으면(메뉴·헤드라인 뭉치) 탈락.
export function isSentencey(s) {
  const t = String(s).trim();
  if (/(?:다|요)\.["'”’]?\s*$|[.!?]["'”’]?\s*$/.test(t)) return true;
  return t.length > 160 && /(?:다|요)\.|[.!?]/.test(t);
}
// 사이트 내비게이션/카테고리 메뉴 뭉치 — 공백이 거의 없는 긴 한글 덩어리.
export function isNavBlob(s) {
  const t = String(s).trim();
  if (t.length < 120) return false;
  const spaces = (t.match(/\s/g) || []).length;
  const enders = (t.match(/다\.|요\.|[.!?]/g) || []).length;
  return spaces / t.length < 0.06 || (enders === 0 && t.length > 200);
}
// 다른 기사 헤드라인 나열 — 말줄임(…) 2개 이상인데 문장 종결이 전혀 없음.
export function isHeadlineRun(s) {
  const t = String(s).trim();
  const ell = (t.match(/…|\.\.\./g) || []).length;
  return ell >= 2 && !/(?:다|요)\.|[.!?]/.test(t.replace(/\.\.\./g, ''));
}
export function extractReadable(html) {
  if (!html) return '';
  // 1) JSON-LD articleBody 우선 — 매체 소개문/인기기사 위젯 오염을 피한다.
  const ld = stripSiteFooter(extractJsonLdBody(html));
  if (ld && ld.length > 120) return ld.slice(0, 8000);
  let lead = metaContent(html, 'og:description') || metaContent(html, 'description');
  if (SITE_BOILER_RE.test(lead)) lead = '';                            // 매체 소개문이면 버림
  const h = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  // 기사 컨테이너(article/본문 class) 안의 <p> 를 우선 시도 — 페이지 전체 <p>를
  // 긁으면 사이드바 '다른 뉴스' 헤드라인이 섞이므로 전역 추출은 최후 수단.
  const pFilter = (s) => s.length > 30 && !BOILER_RE.test(s) && !RELATED_RE.test(s.slice(0, 24)) && /[가-힣a-zA-Z]{5,}/.test(s) && isSentencey(s);
  let ps = [];
  const cm = h.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i) ||
             h.match(/class=["'][^"']*(?:article[_\-](?:txt|body|content|text|view)|view[_\-]content|news[_\-](?:view|content|body)|cont_article)[^"']*["'][^>]*>([\s\S]{100,}?)(?=<\/div>|<\/section>)/i);
  if (cm) {
    ps = [...(cm[1] || cm[2] || '').matchAll(/<(?:p|div)\b[^>]*>([\s\S]*?)<\/(?:p|div)>/gi)]
      .map(m => stripTags(m[1]))
      .filter(pFilter);
  }
  if (ps.length < 2) {
    ps = [...h.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
      .map(m => stripTags(m[1]))
      .filter(pFilter);
  }

  const seen = new Set();
  const unique = ps.filter(s => {
    const t = s.replace(/\s+/g, ' ').trim();
    if (!t || seen.has(t)) return false; seen.add(t); return true;
  }).map(s => s.replace(/\s+/g, ' ').trim());
  // 문단은 개행 두 번(\n\n)으로 구분해 저장 → 앱에서 문단별로 띄워 보여줄 수 있게.
  // 선두의 og:description(lead)이 첫 문단과 겹치면 중복 제거.
  const leadT = (lead || '').replace(/\s+/g, ' ').trim();
  const paras = (leadT && !unique.some(u => u.includes(leadT.slice(0, 40))) ? [leadT] : []).concat(unique);
  const out = stripSiteFooter(paras.join('\n\n')).slice(0, 8000);
  // 매체 소개문/인기기사 나열로 오염된 결과는 버린다(가짜 본문 저장 방지).
  if (looksJunky(out)) return '';
  return out;
}

// '소프트 404' — 200 응답이지만 "존재하지 않는 링크/기사" 안내만 있는 페이지.
// (예: todaymild.com 이 alert 로 '존재하지 않는 링크 입니다'를 띄우는 경우)
const DEAD_PAGE_RE = /존재하지\s*않는\s*(?:링크|기사|페이지)|삭제된\s*기사|삭제\s*되었거나|기사를\s*찾을\s*수\s*없|페이지를\s*찾을\s*수\s*없|요청하신\s*페이지|page\s*not\s*found|404\s*not\s*found/i;

// 기사 본문 추출 — 세 가지 후보를 만들어 정제(article-clean.js) 후 가장 충실한 것을 쓴다.
//   1) JSON-LD articleBody  : 매체가 직접 넣어 둔 본문 (가장 깨끗한 경우가 많음)
//   2) Readability          : 문단 구조를 살린 본문 컨테이너 추출 (광고·위젯 블록 배제)
//   3) 정규식 추출          : 위 둘이 모두 실패할 때의 최후 수단
// 정제 단계에서 바이라인·사진설명·관련기사·저작권 꼬리 등이 걸러진다.
export function extractArticle(html, title = '') {
  const cands = [];
  const ld = extractJsonLdBody(html);
  if (ld) cands.push(['jsonld', AC.clean(ld.split(/\n+/), { title })]);
  if (Readability && parseHTML) {
    try {
      const { document } = parseHTML(html);
      const art = new Readability(document, { charThreshold: 200, keepClasses: false }).parse();
      if (art && art.content) {
        const { document: d2 } = parseHTML(`<html><body><div id="kbgis-root">${art.content}</div></body></html>`);
        const root = d2.getElementById('kbgis-root') || d2.body;
        cands.push(['readability', AC.clean(AC.paragraphsFromNode(root), { title })]);
      }
    } catch { /* 파싱 실패 페이지는 다른 후보로 */ }
  }
  const rx = extractReadable(html);
  if (rx) cands.push(['regex', AC.clean(rx.split(/\n+/), { title })]);
  let best = null;
  for (const [via, r] of cands) {
    const len = r.paragraphs.join('').length;
    // 길이 + 문단 구조 가점(문단이 살아 있으면 앱에서 읽기 좋다)
    const score = len + Math.min(r.paragraphs.length, 10) * 40;
    if (!best || score > best.score) best = { via, r, score, len };
  }
  const paywalled = cands.some(([, r]) => r.paywalled);
  if (!best || best.len < 60) return { text: '', paywalled };
  const text = best.r.paragraphs.join('\n\n').slice(0, 12000);
  if (looksJunky(text)) return { text: '', paywalled };
  return { text, paywalled, via: best.via };
}

// 페이지 인코딩 감지 후 디코딩 — 국내 언론사 상당수가 아직 EUC-KR 이라 무조건
// UTF-8 로 읽으면 본문이 통째로 깨진다(� 투성이). 헤더 → <meta charset> 순으로 본다.
export function decodeHtml(bytes, contentType = '') {
  let cs = (String(contentType).match(/charset=["']?([\w-]+)/i) || [])[1] || '';
  if (!cs) {
    const head = new TextDecoder('latin1').decode(bytes.slice(0, 4096));
    cs = (head.match(/<meta[^>]+charset=["']?([\w-]+)/i) || [])[1] || '';
  }
  cs = cs.toLowerCase();
  if (/^(?:euc-?kr|ks_c_5601-1987|cp949|x-windows-949|ms949)$/.test(cs)) cs = 'euc-kr';
  try { return new TextDecoder(cs || 'utf-8').decode(bytes); }
  catch { return new TextDecoder('utf-8').decode(bytes); }
}
async function fetchArticleText(url, title = '') {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko,en;q=0.8' }, redirect: 'follow', signal: AbortSignal.timeout(12000) });
    // 404/410 = 기사가 삭제됐거나 존재하지 않는 링크 → 호출부가 피드에서 제외한다.
    if (res.status === 404 || res.status === 410) return { text: '', dead: true };
    if (!res.ok) return { text: '' };
    const ct = res.headers.get('content-type') || '';
    if (!/text|html/i.test(ct)) return { text: '', ok: true };
    const html = decodeHtml(new Uint8Array(await res.arrayBuffer()), ct);
    let { text, paywalled, via } = extractArticle(html, title);
    // 본문이 사실상 없고 '존재하지 않는 기사' 안내가 있으면 소프트 404 로 판정.
    if ((!text || text.length < 200) && DEAD_PAGE_RE.test(html.slice(0, 8000))) return { text: '', dead: true };
    // 본문이 짧으면 언론사가 공개로 제공하는 AMP 판(<link rel="amphtml">)으로 한 번 더 시도한다.
    if ((!text || text.length < 400) && !paywalled) {
      const amp = (html.match(/<link[^>]+rel=["']amphtml["'][^>]*href=["']([^"']+)["']/i) || html.match(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["']amphtml["']/i) || [])[1];
      if (amp) {
        try {
          const ampUrl = new URL(decodeEntities(amp), res.url || url).href;
          const r2 = await fetch(ampUrl, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko,en;q=0.8' }, redirect: 'follow', signal: AbortSignal.timeout(12000) });
          if (r2.ok) {
            const h2 = decodeHtml(new Uint8Array(await r2.arrayBuffer()), r2.headers.get('content-type') || '');
            const e2 = extractArticle(h2, title);
            if (e2.text && e2.text.length > (text || '').length + 100) { text = e2.text; via = 'amp'; paywalled = e2.paywalled; }
          }
        } catch { /* 원래 결과 사용 */ }
      }
    }
    return { text, ok: true, paywalled, via };
  } catch { return { text: '' }; }
}

// r.jina.ai 리더 폴백 — 직접 크롤링이 리드 한두 줄밖에 못 얻는 사이트(봇차단·
// 특수 마크업)에서 기사 전문 텍스트를 확보한다. 출력(마크다운)을 문단으로 정리.
function parseReaderTextSrv(t) {
  if (!t) return '';
  let s = String(t)
    .replace(/^(Title|URL Source|Published Time|Warning):.*$/gm, '')
    .replace(/^Markdown Content:\s*$/m, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  const paras = s.split(/\n{2,}/)
    .map(x => x.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(x => x.length > 30 && !/^[#>*\-|=]/.test(x) && !FOOTER_RE.test(x) && !RELATED_RE.test(x.slice(0, 24)) && /[가-힣a-zA-Z]{5,}/.test(x) && isSentencey(x));
  const out = AC.clean(stripSiteFooter(paras.join('\n\n')).split(/\n+/)).paragraphs.join('\n\n').slice(0, 12000);
  return looksJunky(out) ? '' : out;
}
async function fetchViaReader(url) {
  try {
    const r = await fetch('https://r.jina.ai/' + url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(18000) });
    if (!r.ok) return '';
    return parseReaderTextSrv(await r.text());
  } catch { return ''; }
}

function extractiveSummary(text) {
  const all = stripSiteFooter(text || '')
    .split(/(?<=[.!?。])\s+|(?<=다\.)\s*/)
    .map(x => x.trim())
    .filter(x => x.length > 12 && !FOOTER_RE.test(x) && !RELATED_RE.test(x.slice(0, 24)));
  // 종결어미가 있는 '온전한 문장'을 우선 채택하고, 부족하면 나머지로 채운다.
  const good = all.filter(isSentencey);
  const s = (good.length >= 3 ? good : good.concat(all.filter(x => !good.includes(x)))).slice(0, 3);
  // 한 줄이 지나치게 길면(문장 분리 실패한 덩어리) 잘라서 요약답게 만든다.
  return s.map(x => x.length > 180 ? x.slice(0, 178).trimEnd() + '…' : x);
}

// ── RSS 파싱 + 기사 객체화 ───────────────────────────────
export function parseFeed(xml) {
  const items = [];
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];
  for (const b of blocks) {
    let title = stripTags(tag(b, 'title'));
    const link = stripTags(tag(b, 'link'));
    const pub = stripTags(tag(b, 'pubDate'));
    const desc = stripTags(tag(b, 'description'));
    const srcM = b.match(/<source[^>]*>([\s\S]*?)<\/source>/i);
    let source = srcM ? stripTags(srcM[1]) : '';
    const dash = title.lastIndexOf(' - ');
    if (dash > 0 && !source) source = title.slice(dash + 3).trim();
    if (dash > 0) title = title.slice(0, dash).trim();
    if (!title || !link) continue;
    items.push({ title, link, pub, desc, source: source || '출처 미상' });
  }
  return items;
}

const isForeignGP = (text) => FOREIGN_GPS.some(([re]) => re.test(text));
const isKoreanLP  = (text) => KOREAN_LPS.some(([re]) => re.test(text));
// 기사 링크가 상시 깨져 있는(존재하지 않는 링크 안내) 저품질 매체 차단 목록.
const SOURCE_BLOCK_RE = /마일드경제|todaymild|marketbeat|kalkine|indexbox|tickerreport|etfdailynews|americanbankingnews|defenseworld/i;   // 깨진 링크·자동 생성 주식 기사 매체
// 대체투자 맥락과 무관하게 항상 잡음인 제목 — 증권 공시(Form 4·13D)·주식 매매/보유 변동·밸류에이션 지표 페이지,
// 뮤추얼펀드 분기 코멘터리·분배금 공시, 집단소송 광고, 회사 소개 페이지, 시장조사 보고서, 애널리스트 의견
const HARD_NOISE_RE = new RegExp([
  '\\bform (?:3|4|5|8-?k|10-?[kq]|13[dfg](?:\\/a)?|sc 13[dg]|n-?port|424b\\d?|d)\\b',
  '[\\d,]{4,} shares\\b|\\bshares (?:in|of) .{0,80}\\b(?:acquired|purchased|sold|bought|trimmed|boosted|raised|cut) by\\b|\\b(?:sells?|buys?|acquires?|purchases?|trims?|boosts?) (?:[\\d,]+ )?shares of\\b',
  '\\bshort interest\\b|stock price, news, quote|share price, .{0,20}stock news|\\b(?:enterprise value|price) to (?:revenue|ebitda|ebit|book|earnings|sales)\\b|\\bsees (?:large|unusual) (?:volume|options)|52-week (?:low|high)',
  '\\b(?:q[1-4]|quarterly|annual|monthly)(?: 20\\d\\d)? (?:commentary|distributions?|distribution schedule)\\b|\\bdeclares? (?:\\w+ ){0,3}distributions?\\b|\\bdistribution schedule\\b',
  '\\bclass action\\b|securities (?:fraud|litigation)|investor counsel|encourages? .{0,40}investors? to (?:inquire|contact)',
  '^[^:]{2,60}: [\\w .,-]{0,30}(?:private equity|venture capital|investment|growth equity) firm (?:backing|investing|focused|specializing)',
  '\\bmarket (?:size|share|forecast|report)\\b.{0,40}\\b20[3-4]\\d\\b|\\bmuseum\\b|\\bchurch\\b|\\bcharity\\b',
  '\\b(?:price target|analyst rating|(?:upgrades?|downgrades?|reiterates?) (?:\\w+ )?(?:rating|to (?:buy|sell|hold|overweight|underweight)))\\b',
  // 국문: 주식 투자자 대상 해설·애널리스트 의견·시장조사 전망
  '(?:주식|주가)\\s*투자자|투자자들(?:이|에게)\\s*.{0,20}(?:조치|영향)|투자의견|목표\\s*주가|주식\\s*등급|(?:등급|의견)을?\\s*(?:상향|하향)\\s*조정|20[3-4]\\d년까지\\s*(?:성장|연평균)|시장\\s*규모\\s*전망',
].join('|'), 'i');
// 추적 기관의 자본확충(유상증자 등) — 투자여력 확대라는 placement agent 핵심
// 신호이므로, EXCLUDE_RE(상장사 잡음 제거)에 걸려도 예외로 수집한다.
const CAPITAL_RE = /유상\s*증자|자본\s*확충|자본금\s*(?:확대|증액)|출자\s*전환/;
// 영문 상장시장 잡음 — 주가·실적·ETF·애널리스트 의견 기사(운용사 이름이 나와도 대체투자와 무관).
const EN_NOISE_RE = /\b(?:shares? (?:rose|fell|jumped|slid|climbed|dropped|gained|tumbled)|stock (?:price|rose|fell|jumped|surged)|price target|(?:quarterly|q[1-4]) (?:earnings|profit|results)|earnings (?:call|beat|miss|per share)|dividend (?:hike|increase)|analyst (?:upgrade|downgrade|rating)|ETFs?\b|exchange-traded|iShares|bitcoin ETF|options activity|short interest|insider (?:buying|selling))/i;
const EN_ALT_CONTEXT_RE = /private (?:equity|credit|markets?|debt|capital)|infrastructure|real estate|fund(?:raising)?\b|close[sd]?\b|raise[sd]?\b|commit|acqui|take-private|buyout|secondar|direct lending/i;
// 국내 증권사·은행의 리테일 상품·이벤트·전산 소식 — 추적 기관(LP) 이름이 나와도 대체투자와 무관
const RETAIL_NOISE_RE = /발행어음|특판|완판|조기\s*판매|\bMTS\b|\bHTS\b|접속\s*장애|출시\s*알림|이벤트|경품|캐시백|카드\s*(?:출시|혜택|기념)|연금저축|\bIRP\b|\bISA\b|\bETF\b|\bETN\b|\bELS\b|\bDLS\b|해외\s*주식\s*(?:거래|이벤트|수수료|서비스)|수수료\s*(?:무료|인하|면제)|고객\s*감사|사은품|앱\s*(?:개편|출시)|선정산|소상공인|핀테크/i;
// 명백한 잡음(제목 기준) — 보관 기사 재검사에 쓴다.
export function isNoise(raw) {
  const t = raw.title || '';
  if (raw.source && SOURCE_BLOCK_RE.test(raw.source)) return true;
  if (HARD_NOISE_RE.test(t)) return true;
  if (/[가-힣]/.test(t)) {
    if (RETAIL_NOISE_RE.test(t) && !RETAIL_KEEP_RE.test(t) && !CIO_TITLE.test(t) && !EXEC_TITLE.test(t)) return true;
  } else if (EN_NOISE_RE.test(t) && !EN_ALT_CONTEXT_RE.test(t.replace(EN_NOISE_RE, ''))) return true;
  const text = `${t} ${raw.desc || ''}`;
  const keep = (isForeignGP(text) || isKoreanLP(text)) && (CAPITAL_RE.test(text) || MOVE_RE.test(text) || CIO_TITLE.test(text) || EXEC_TITLE.test(text));
  return EXCLUDE_RE.test(t) && !keep;
}
// 같은 제목에 실제 딜(매입·출자 등)이 함께 나오면 잡음으로 보지 않는다("…포트폴리오 매입… 회원 감사이벤트")
const RETAIL_KEEP_RE = /매입|인수|매각|출자|약정|대체투자|사모펀드|블라인드|위탁운용|인프라\s*펀드|부동산\s*펀드/;
export function isRelevant(raw) {
  if (raw.source && SOURCE_BLOCK_RE.test(raw.source)) return false;   // 깨진 링크 매체 제외
  if (HARD_NOISE_RE.test(raw.title || '')) return false;             // 공시·주식 데이터·코멘터리 등
  if (/[가-힣]/.test(raw.title) && RETAIL_NOISE_RE.test(raw.title) && !RETAIL_KEEP_RE.test(raw.title) && !CIO_TITLE.test(raw.title) && !EXEC_TITLE.test(raw.title)) return false;
  const text = `${raw.title} ${raw.desc}`;
  // 영문 주가·실적·ETF 기사는 대체투자 맥락(펀드·딜)이 제목에 없으면 제외
  if (!/[가-힣]/.test(raw.title) && EN_NOISE_RE.test(raw.title) && !EN_ALT_CONTEXT_RE.test(raw.title.replace(EN_NOISE_RE, ''))) return false;
  const gp = isForeignGP(text), lp = isKoreanLP(text);
  // 잡음 제거 — 단, 추적 GP/LP 의 유상증자·자본확충 뉴스는 예외 통과.
  // 잡음 예외: 추적 기관의 자본확충·지방이전·운용 사령탑/실무 인사 기사는
  // EXCLUDE_RE(채용·실적 등 일반 잡음 키워드)에 스쳐도 통과시킨다.
  const keep = (gp || lp) && (CAPITAL_RE.test(text) || MOVE_RE.test(text) || CIO_TITLE.test(text) || EXEC_TITLE.test(text));
  if (EXCLUDE_RE.test(text) && !keep) return false;
  // 알려진 글로벌 GP·국내 LP 가 등장하면 — 이들은 본질적으로 대체투자 주체이므로
  // 자산군 키워드(ALT_RE)가 없어도 펀드·출자·시장·딜 맥락이면 해외대체투자 뉴스로
  // 폭넓게 수집한다(GP/LP 기사 누락 방지).
  if (gp || lp) {
    // 펀드·출자·시장·딜·자산군 + (중요) CIO·임원·조직 인사 맥락까지 포함한다.
    // 추적 대상 기관의 CIO 선임·임원 인사·조직개편 기사는 placement agent 핵심
    // 정보이므로 자산군 키워드가 없어도 수집한다(예: 경찰공제회 신임 CIO 선임).
    return FUND_RE.test(text) || MARKET_RE.test(text) || ALT_RE.test(text)
        || PEOPLE_RE.test(text) || ORG_RE.test(text) || CIO_TITLE.test(text)
        || EXEC_TITLE.test(text) || MOVE_RE.test(text) || AUM_CUE.test(text)
        || CAPITAL_RE.test(text);
  }
  // 기관 미식별 일반 뉴스는 엄격 기준: 대체투자 자산군 + 해외 맥락 + 펀드/시장 맥락.
  // 영문 기사는 지역 키워드가 없어도 해외 뉴스이므로 글로벌 맥락으로 간주한다
  // (예: "Castlelake closes $2B aviation fund" — 자산군·펀드 신호만으로 통과).
  const isEnglish = !/[가-힣]/.test(raw.title);
  if (!ALT_RE.test(text)) return false;               // 대체투자 자산군 신호
  if (!(GLOBAL_RE.test(text) || isEnglish)) return false;   // 해외/글로벌 맥락
  return FUND_RE.test(text) || MARKET_RE.test(text);
}

export function enrich(raw) {
  const text = `${raw.title} ${raw.desc}`;
  const lang = hasHangul(raw.title) ? 'ko' : 'en';
  const instHit = pickInstOrdered(raw.title, raw.desc);
  const inst = instHit ? instHit.inst : raw.source;
  const instType = instHit ? instHit.instType : '기타';
  const asset = pick(ASSETS, text, 'PE');
  const region = pick(REGIONS, text, 'GL');
  // 기관(국내 LP·해외 GP) 미식별 = 기관과 무관한 일반 대체투자 '마켓 뉴스'.
  let cat = instHit ? (instType === '해외 GP' ? 'GP' : 'LP') : '마켓';
  const catText = lang === 'en' ? raw.title : text;               // 영문 요약문의 restructuring·names 등은 인사와 무관한 경우가 많다
  if (PEOPLE_RE.test(catText) || ORG_RE.test(catText)) cat = '인사';   // 조직/인사 변경
  // 지방이전은 인사·조직보다 상위로 분류 — 국내 기관(LP) 기사에 한해 적용한다.
  if (instHit && instType !== '해외 GP' && MOVE_RE.test(text)) cat = '이전';
  const { date, time, iso } = kstParts(raw.pub);
  const sentences = extractiveSummary(raw.desc || raw.title);
  return {
    id: hashId(raw.link),
    cat, inst, instType, asset, region,
    date, time, ts: iso, source: raw.source, lang,
    ko: raw.title,
    en: lang === 'en' ? raw.title : '',
    metric: extractMetric(text) || '뉴스',
    metricLabel: '핵심 지표',
    ai: sentences.length ? sentences : [raw.title],
    body: raw.desc || raw.title,
    fetched: false,
    url: resolveGoogleNewsUrl(raw.link),
    // 구글 뉴스 원본 링크 — '기사 전문 보기'는 이 경유 링크로 연다. 구글
    // 리다이렉트를 거치면 리퍼러 검사("정상적인 접근이 아닙니다")가 있는
    // 사이트도 정상 통과하고, 해석 URL 이 변형된 경우의 안전망이 된다.
    gurl: /news\.google\.com/.test(raw.link) ? raw.link : undefined,
  };
}

// 동시에 n개씩 비동기 작업을 돌리는 간단한 풀.
async function pool(items, n, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const it = items[i++]; try { await fn(it); } catch { /* 개별 실패는 무시 */ } }
  });
  await Promise.all(workers);
}

// ── 전문 분리 저장: news.json(목록·리드) + bodies/<id>.json(전문) ──
// 목록 파일이 기사 수에 비례해 수 MB 로 불어나지 않게, 긴 본문은 기사별 파일로
// 떼어 두고 앱은 기사를 열 때 그 파일만 받는다.
const BODY_DIR = new URL('../bodies/', import.meta.url);
const LEAD_MAX = 420;
const bodyFile = (id) => new URL(`${id}.json`, BODY_DIR);
export function leadOf(body) {
  const paras = String(body || '').split(/\n+/).map((x) => x.trim()).filter(Boolean);
  let out = '';
  for (const p of paras) {
    if (!out) out = p; else if (out.length < 180) out += '\n\n' + p; else break;
    if (out.length >= LEAD_MAX) break;
  }
  return out.length > LEAD_MAX ? out.slice(0, LEAD_MAX - 1).trimEnd() + '…' : out;
}
async function restoreBodies(list) {
  await pool(list.filter((a) => a.b), 16, async (a) => {
    try {
      const j = JSON.parse(await readFile(bodyFile(a.id), 'utf8'));
      if (j && j.body) a.body = j.body;
      if (j && j.ko) a.bodyKo = j.ko;
    } catch { /* 파일이 없으면 리드만으로 계속 */ }
  });
}
// 긴 본문은 파일로 쓰고(내용이 같으면 건너뜀) 목록용 사본에는 리드만 남긴다.
async function splitBodies(list) {
  await mkdir(BODY_DIR, { recursive: true });
  const keep = new Set();
  let written = 0;
  const out = [];
  for (const a of list) {
    const body = a.body || '';
    // 앱이 쓰지 않는 필드(추출 요약 ai·고정 문구 metricLabel·제목과 같은 en)는 목록 파일에서 빼서 첫 로딩을 가볍게 한다
    const { fetchedLen, bodyKo, b: _b, bl: _bl, tr: _tr, ai: _ai, metricLabel: _ml, ...rest } = a;
    if (rest.en && rest.en === rest.ko) delete rest.en;
    if (body.length > LEAD_MAX + 80 || bodyKo) {
      keep.add(`${a.id}.json`);
      const json = JSON.stringify(bodyKo ? { id: a.id, body, ko: bodyKo } : { id: a.id, body });
      let same = false;
      try { same = (await readFile(bodyFile(a.id), 'utf8')) === json; } catch {}
      if (!same) { await writeFile(bodyFile(a.id), json); written++; }
      out.push({ ...rest, body: leadOf(body), b: 1, bl: body.length, ...(bodyKo ? { tr: 1 } : {}) });
    } else {
      out.push(rest);
    }
  }
  // 아카이브에서 빠진 기사의 본문 파일 정리
  let removed = 0;
  try {
    for (const f of await readdir(BODY_DIR)) {
      if (f.endsWith('.json') && !keep.has(f)) { await unlink(new URL(f, BODY_DIR)); removed++; }
    }
  } catch {}
  console.log(`bodies: ${keep.size} files (${written} written, ${removed} removed)`);
  return out;
}

function dedupe(list) {
  const seen = new Set(), out = [];
  for (const a of list) {
    const key = a.ko.slice(0, 50);
    if (seen.has(a.id) || seen.has(key)) continue;
    seen.add(a.id); seen.add(key); out.push(a);
  }
  return out;
}

// 영문 검색어는 미국판 구글 뉴스(en-US)로 조회한다 — 한국판(ko-KR)으로 영문을
// 검색하면 글로벌 매체(Bloomberg·Reuters·PEI·PE Hub 등) 기사가 거의 나오지 않는다.
// 영문은 결과가 많아 최신순 상위 N건만 쓰고, 503/429 는 물러났다가 재시도한다.
const EN_PER_QUERY = 30;
async function fetchQuery(q) {
  const en = !/[가-힣]/.test(q);
  const loc = en ? 'hl=en-US&gl=US&ceid=US:en' : 'hl=ko&gl=KR&ceid=KR:ko';
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&${loc}`;
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 KBGIS-collector' }, signal: AbortSignal.timeout(20000) });
      if (res.ok) {
        const items = parseFeed(await res.text());
        if (!en) return items;
        return items.sort((a, b) => (Date.parse(b.pub) || 0) - (Date.parse(a.pub) || 0)).slice(0, EN_PER_QUERY);
      }
      lastErr = new Error(`HTTP ${res.status}`);
      if (![429, 500, 502, 503].includes(res.status)) break;
    } catch (e) { lastErr = e; }
    await new Promise((r) => setTimeout(r, 2500 * (i + 1)));
  }
  throw lastErr || new Error('fetch failed');
}

async function main() {
  if (process.argv.includes('--selftest')) return selftest();

  let all = [];
  for (const q of QUERIES) {
    try {
      const items = (await fetchQuery(q)).filter(isRelevant).map(enrich);
      all = all.concat(items);
    } catch (e) { console.warn('skip:', q, '-', e.message); }
  }
  all = dedupe(all);

  let prev = [];
  try { prev = JSON.parse(await readFile(new URL('../news.json', import.meta.url), 'utf8')); } catch {}
  // news.json 에는 리드만 두고 전문은 bodies/<id>.json 에 따로 둔다(목록 로딩을 가볍게).
  // 수집기 안에서는 예전처럼 전문을 들고 다니도록 파일에서 복원한다.
  await restoreBodies(prev);
  // 보관된 과거 기사도 강화된 관련성 기준으로 다시 거릅니다(상장주식·국내 잡음 제거).
  // 단, (1) 수동 고정(pinned) 기사와 (2) 추적 대상 기관의 조직/인사 변경 뉴스는
  // 펀드 키워드가 없어도 보존합니다(예: 국민연금 '기금운용과' 신설).
  // 기관 판정 정규식이 보정되면(예: 'company has' 를 'Company H' 로 오인하던 문제) 보관 기사의
  // 기관·분류도 다시 맞춘다 — 저장된 기관명이 제목·리드 어디에도 더는 맞지 않을 때만 재판정.
  const INST_RE = new Map([...KOREAN_LPS.map(([re, name]) => [name, re]), ...FOREIGN_GPS.map(([re, name]) => [name, re])]);
  let reclassed = 0;
  for (const p of prev) {
    const re = INST_RE.get(p.inst);
    if (!re || p.pinned) continue;
    if (re.test(`${p.ko || ''} ${(p.body || '').slice(0, 400)}`)) continue;
    const hit = pickInstOrdered(p.ko || '', (p.body || '').slice(0, 200));
    p.inst = hit ? hit.inst : (p.source || '출처 미상');
    p.instType = hit ? hit.instType : '기타';
    if (p.cat === 'LP' || p.cat === 'GP') p.cat = hit ? (hit.instType === '해외 GP' ? 'GP' : 'LP') : '마켓';
    reclassed++;
  }
  for (const p of prev) {                                         // 영문 기사 '인사' 분류는 제목 기준으로 다시 확인
    if (p.cat !== '인사' || p.lang !== 'en' || p.pinned || PEOPLE_RE.test(p.ko || '') || ORG_RE.test(p.ko || '')) continue;
    p.cat = p.instType === '해외 GP' ? 'GP' : (p.instType && p.instType !== '기타' ? 'LP' : '마켓');
    reclassed++;
  }
  if (reclassed) console.log(`archive reclassified: ${reclassed} articles`);
  const before = prev.length;
  prev = prev.filter(p => {
    const txt = `${p.ko || ''} ${p.body || ''}`;
    if (p.pinned) return true;
    if ((PEOPLE_RE.test(txt) || ORG_RE.test(txt) || MOVE_RE.test(txt)) && p.instType && p.instType !== '기타' && p.inst && p.inst !== '출처 미상') return true;
    // 이미 수집된 기사는 '잡음' 규칙(리테일 상품·상장주식·국내 잡음)에 새로 걸릴 때만 뺀다.
    // 수집 시점엔 RSS 요약까지 보고 통과했으므로, 제목+리드만으로 관련성을 다시 요구하면
    // 멀쩡한 기사가 다음 회차에 빠졌다가 다시 수집되기를 반복한다(목록 깜빡임).
    const title = p.ko || '';
    const raw = { title, desc: (p.body || '').slice(0, 200), source: p.source };
    if (isNoise(raw)) return false;
    if (isRelevant(raw)) return true;
    if (isForeignGP(title) || isKoreanLP(title)) return true;     // 추적 기관이 제목에 있으면 유지
    return FUND_RE.test(title);                                    // 기관 미식별 기사는 펀드 맥락이 제목에 있을 때만
  });
  if (before !== prev.length) console.log(`archive re-filtered: ${before} -> ${prev.length}`);
  const prevById = new Map(prev.map(p => [p.id, p]));

  // 본문 크롤링 + 요약 패스. 이전 실행에서 이미 본문/요약을 확보한 기사는
  // 재사용해 매 실행마다 다시 긁지 않습니다(Actions 시간 절약).
  // 최신 기사를 먼저 해석·크롤링합니다 — 피드 상단(사용자가 먼저 여는 기사)이
  // 실제 URL·본문을 갖도록 하여, 예산 안에서 우선순위를 둔다.
  all.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
  let fetchBudget = 260, fetched = 0, summarized = 0, resolved = 0, mismatched = 0;
  let readerBudget = 70, readerHits = 0;               // jina 리더 폴백 예산(회당)
  const toFetch = [];                                  // 이번 회차에 본문을 새로 받을 기사
  for (const a of all) {
    const old = prevById.get(a.id);
    if (old && old.tko) { a.tko = old.tko; if (old.tv) a.tv = old.tv; }   // 번역은 재수집돼도 유지
    if (old && old.bodyKo) a.bodyKo = old.bodyKo;
    if (old && old.frx) a.frx = old.frx;
    const oldReal = old && old.url && !/news\.google\.com/.test(old.url);
    if (oldReal) a.url = old.url;                       // 이전에 해석한 실제 URL 재사용
    if (old && old.linkOk) a.linkOk = true;             // 링크 검증 결과 승계
    // 본문 재사용은 '실제 URL로 확보'했고 '오염되지 않은' 경우만. 과거 구글
    // 인터스티셜/매체 소개문·관련기사 위젯으로 오염된 본문은 버리고 재크롤링한다.
    const oldClean = (old && old.fetched && oldReal && !looksJunky(old.body)) ? stripSiteFooter(old.body) : '';
    if (oldClean.length > 250) {                        // 전문급 본문만 재사용 — 리드 요약(짧은 본문)은 리더 폴백으로 재시도
      a.body = oldClean; a.fetched = true;
      const oldAi = (old.ai || []).map(l => stripSiteFooter(l)).filter(l => l && l.length > 12 && !RELATED_RE.test(l.slice(0, 24)))
        .map(l => l.length > 180 ? l.slice(0, 178).trimEnd() + '…' : l);
      a.ai = oldAi.length ? oldAi : a.ai;
      if (old.aiSource) a.aiSource = old.aiSource;
      continue;
    }
    if (fetchBudget <= 0) continue;
    fetchBudget--;
    toFetch.push(a);
  }
  // 본문 크롤링은 5개씩 병렬로 — 순차 처리 대비 수집 시간을 크게 줄인다.
  // 새 Google 뉴스 URL(CBMi…)은 실제 기사 주소로 해석한 뒤 크롤링하고, 해석에
  // 실패하면(여전히 google.com) 긁지 않는다 — 구글 인터스티셜 텍스트가 가짜 본문으로
  // 저장되는 것을 막는다(다음 회차에 재시도).
  await pool(toFetch, 5, async (a) => {
    let canFetch = true;
    if (/news\.google\.com/.test(a.url)) {
      const real = await resolveGoogleNewsUrlAsync(a.url);
      if (real && !/news\.google\.com/.test(real)) { a.url = real; resolved++; }
      else canFetch = false;
    }
    const fr = canFetch ? await fetchArticleText(a.url, a.ko) : { text: '' };
    if (fr.dead) { a.linkDead = true; return; }        // 존재하지 않는 기사(404/410) → 피드에서 제외
    if (fr.ok) a.linkOk = true;                        // 링크 생존 확인 → 검증 패스 재확인 생략
    if (fr.paywalled) a.paywalled = true;              // 유료 기사 — 앱에서 '리드만 제공' 표시
    let text = fr.text;
    // 직접 크롤링이 리드 요약(짧은 본문)만 얻으면 jina 리더로 전문 재시도 —
    // 봇차단·특수 마크업 사이트의 '문장 중간에 끊기는 본문'을 해소한다.
    if (canFetch && (!text || text.length < 250) && readerBudget > 0) {
      readerBudget--;
      const alt = await fetchViaReader(a.url);
      if (alt && alt.length > (text || '').length + 100) { text = alt; readerHits++; }
    }
    if (text && !AC.matchesTitle(a.ko, text)) { mismatched++; text = ''; }   // 다른 기사 본문이 딸려온 경우 버림
    if (text && text.length > 60) {                    // 진짜 본문 확보 (og:description 포함)
      a.body = text;
      a.ai = extractiveSummary(text);
      a.fetched = true;
      a.fetchedLen = text.length;
      fetched++;
    }
  });
  console.log(`urls resolved: ${resolved}, article bodies fetched: ${fetched} (reader fallback: ${readerHits}, title-mismatch dropped: ${mismatched})`);

  // ── 아카이브 링크 검증 패스 ────────────────────────────────
  // 이번 회차에 재수집되지 않은 보관분도 회당 40건씩(최신순) 링크 생존을
  // 확인한다 — 404/소프트404 는 linkDead 로 표시해 피드에서 제거되고,
  // 정상 링크는 linkOk 로 기록해 재확인하지 않는다(수일 내 전체 검증 완료).
  // 검증 중 본문을 확보하면 덤으로 저장한다(본문 커버리지 확대).
  const allIds = new Set(all.map(a => a.id));
  let deadArchived = 0, verifiedOk = 0, upgraded = 0;
  // (a) 아직 검증 안 된 링크 + (b) 본문이 리드 수준(짧음)인 보관 기사 — 새 추출
  //     엔진으로 다시 받아 전문으로 바꾼다. 회차당 예산 안에서 최신순으로 처리하므로
  //     몇 회차면 아카이브 전체가 전문으로 채워진다. 유료 기사는 반복 시도하지 않는다.
  const realUrl = (p) => p.url && /^https?:\/\//.test(p.url) && !/news\.google\.com/.test(p.url);
  // 구글 뉴스 주소가 아직 해석되지 않은 보관 기사도 회차마다 다시 해석해 원문을 받는다.
  let gResolved = 0;
  const gPending = prev.filter(p => !allIds.has(p.id) && !p.pinned && !p.linkDead && /news\.google\.com/.test(p.url || '') && (p.resolveTries || 0) < 4).slice(0, 70);
  await pool(gPending, 4, async (p) => {
    p.resolveTries = (p.resolveTries || 0) + 1;
    const real = await resolveGoogleNewsUrlAsync(p.url);
    if (real && !/news\.google\.com/.test(real)) { p.url = real; gResolved++; }
  });
  if (gPending.length) console.log(`archive google links resolved: ${gResolved}/${gPending.length}`);
  const recheck = prev
    .filter(p => !allIds.has(p.id) && !p.pinned && !p.linkDead && realUrl(p))
    .filter(p => !p.linkOk || (!p.paywalled && !p.bodyMismatch && (p.body || '').length < 400 && (p.upgradeTries || 0) < 3))
    .slice(0, 120);
  await pool(recheck, 5, async (p) => {
    const chk = await fetchArticleText(p.url, p.ko);
    if (chk.dead) { p.linkDead = true; deadArchived++; return; }
    if (!chk.ok) return;                               // 403·타임아웃 등은 다음 회차에 재시도
    if (!p.linkOk) { p.linkOk = true; verifiedOk++; }
    if (chk.paywalled) p.paywalled = true;
    p.upgradeTries = (p.upgradeTries || 0) + 1;
    if (chk.text && !AC.matchesTitle(p.ko, chk.text)) { p.bodyMismatch = true; return; }
    if (chk.text && chk.text.length > (p.body || '').length + 120) {   // 더 충실한 본문이면 교체
      p.body = chk.text; p.ai = extractiveSummary(chk.text); p.fetched = true; upgraded++;
    }
  });
  if (deadArchived || verifiedOk || upgraded) console.log(`archive re-check: ${verifiedOk} verified, ${upgraded} bodies upgraded, ${deadArchived} dead removed`);

  // 관련성 필터를 통과한 최근 3개월(92일) 기사를 모두 노출합니다. 본문 크롤링
  // 여부와 무관하게 기사를 유지합니다 — 본문은 예산(fetchBudget) 안에서 회차마다
  // 점진적으로 확보되고, 미확보분도 제목·요약으로 보여주며 앱이 브라우저에서
  // 직접 본문을 가져옵니다. (예전엔 '본문 확보분만' 남겨 기사 수가 급감했음)
  // RSS 검색이 간혹 수년 전 기사를 섞어 반환하므로 날짜 창으로 거릅니다.
  const WINDOW_MS = 92 * 24 * 3600 * 1000;
  const cutoff = Date.now() - WINDOW_MS;
  const inWindow = (a) => { if (a.pinned) return true; const t = Date.parse(a.ts); return !isNaN(t) && t >= cutoff; };
  const deadCount = all.filter(a => a.linkDead).length;
  const merged = dedupe([...all, ...prev])
    .filter(a => !a.linkDead)                          // 존재하지 않는 기사 링크(404/소프트404) 제외
    .filter(a => !SOURCE_BLOCK_RE.test(a.source || '') && !SOURCE_BLOCK_RE.test(a.url || ''))  // 깨진 링크 매체 제외(기존 보관분 포함)
    .filter(inWindow)
    .sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
  // 아카이브 상한 — 전체 1,000건, 영문은 450건까지(영문 결과가 많아 국내 LP 기사를
  // 밀어내지 않도록). 최신순으로 채운다.
  const ARCHIVE_MAX = 1000, EN_MAX = 450;
  { let en = 0; const kept = [];
    for (const a of merged) {
      if (kept.length >= ARCHIVE_MAX) break;
      if (a.lang === 'en' && !a.translated) { if (en >= EN_MAX) continue; en++; }
      kept.push(a);
    }
    merged.length = 0; merged.push(...kept); }
  // 저장 직전 전체 아카이브 위생 패스 — 이번 회차에 재수집되지 않은 보관분에도
  // 최신 위젯/푸터 필터를 소급 적용한다(필터가 개선될 때마다 과거분도 정화).
  let sanitized = 0, mismatchArchived = 0;
  for (const a of merged) {
    if (a.body && (a.body.match(/\uFFFD/g) || []).length > 20) {
      // 인코딩이 깨진 채 저장된 본문 — 버리고 다음 회차에 올바른 인코딩으로 재수집
      a.body = ''; a.fetched = false; a.upgradeTries = 0; sanitized++;
    }
    if (a.body) {
      // 앱과 같은 정제 규칙(article-clean.js)을 보관분에도 소급 적용
      const c = AC.clean(stripSiteFooter(a.body).split(/\n+/), { title: a.ko }).paragraphs.join('\n\n');
      if (c !== a.body) { a.body = c; sanitized++; }
      if (a.fetched && c.length < 120) a.fetched = false;   // 정리 후 본문이 사라지면 재크롤 대상
      // 제목과 무관한 본문(다른 기사가 딸려온 경우)은 버린다 — 잘못된 내용을 보여 주느니 원문 링크만
      if (a.body && !AC.matchesTitle(a.ko, a.body)) { a.body = ''; a.fetched = false; a.bodyMismatch = true; delete a.bodyKo; delete a.frx; sanitized++; mismatchArchived++; }   // 무관한 본문에서 뽑은 펀드 정보도 버림
    }
    if (Array.isArray(a.ai) && a.ai.length) {
      const cl = a.ai.map(l => stripSiteFooter(String(l)))
        .filter(l => l && l.length > 12 && !TTS_RE.test(l) && !isLangList(l))
        .map(l => l.length > 180 ? l.slice(0, 178).trimEnd() + '…' : l);
      a.ai = cl.length ? cl : [a.ko];
    }
  }
  if (sanitized) console.log(`archive sanitized: ${sanitized} bodies re-cleaned (title-mismatch removed: ${mismatchArchived})`);
  // 목록(news.json)은 리드만, 전문은 bodies/ 로 분리 저장. 이후 인사이트·투자내역
  // 추출은 전문이 담긴 merged 를 그대로 쓴다.
  // 예전 방식(본문을 한글로 덮어쓴 번역)은 영문 원문으로 되돌리고 한글은 별도 필드로
  for (const a of merged) {
    if (a.translated) {
      if (a.enBody) a.body = a.enBody;
      if (a.en && a.ko !== a.en) { a.tko = a.ko; a.ko = a.en; }
      delete a.enBody; delete a.translated;
    }
    delete a.aiSource;
  }
  const tr = await translatePass(merged);
  const frxN = await fundPass(merged);
  console.log(`fund details (본문 추출): ${frxN} articles`);
  console.log(`translation: ${tr.titles} titles, ${tr.bodies} bodies (${ANTHROPIC_API_KEY ? 'Claude ' + CLAUDE_MODEL : 'Gemini'})${llmDone() ? ' — 한도 도달로 중단' : ''}`);
  const listing = await splitBodies(merged);
  await writeFile(new URL('../news.json', import.meta.url), JSON.stringify(listing, null, 0));
  console.log(`collected ${all.length} relevant (dead links dropped: ${deadCount}), archive now ${merged.length} articles`);

  // CIO·자산군 수익률 인사이트 자동 갱신(insights.json). 기존 값은 새 추출이
  // 있을 때만 갱신해, 일시적으로 기사가 없어도 최근 정보가 사라지지 않게 합니다.
  let prevIns = { cios: [], assetReturns: [], execs: [], aums: [], relocations: [] };
  try { prevIns = JSON.parse(await readFile(new URL('../insights.json', import.meta.url), 'utf8')); } catch {}
  // 공시 기반 AUM(조원)을 억원으로 환산해 대조표를 만든다 — 기사에서 뽑은
  // 수치가 자릿수부터 어긋나면(다른 주체의 금액) 버리기 위한 안전장치.
  const refAum = new Map();
  try {
    const al = JSON.parse(await readFile(new URL('../allocations.json', import.meta.url), 'utf8'));
    for (const i of al.institutions || []) if (i.aum != null) refAum.set(i.name, i.aum * 10000);
  } catch {}
  try {
    const lp = JSON.parse(await readFile(new URL('../lp-profiles.json', import.meta.url), 'utf8'));
    for (const [name, pr] of Object.entries(lp.profiles || {})) {
      if (pr.aum != null && !refAum.has(name)) refAum.set(name, pr.aum * 10000);
    }
  } catch {}
  const fresh = buildInsights(merged, refAum);
  const mergeBy = (key, prevArr, newArr) => {
    const map = new Map((prevArr || []).map(x => [x[key], x]));
    for (const n of newArr) { const old = map.get(n[key]); if (!old || (n.ts || '') >= (old.ts || '')) map.set(n[key], n); }
    return [...map.values()].sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
  };
  const insights = {
    updatedAt: fresh.updatedAt,
    cios: (() => {                                                    // 이전 값도 새 기준(이름 모양·선임 우선)으로 다시 고른다
      const map = new Map();
      const freshSet = new Set(fresh.cios);
      for (const x of [...(prevIns.cios || []), ...fresh.cios]) {
        if (x.status === '선임' && !(x.person && looksLikeName(x.person) && !NAME_BLOCK.test(x.person) && !CIO_WORD_BLOCK.test(x.person))) continue;
        const cur = map.get(x.inst);
        // 이번 회차 결과(보도 수 투표)가 이전 회차의 다른 선임자보다 우선
        const override = cur && freshSet.has(x) && !freshSet.has(cur) && x.status === '선임' && cur.status === '선임';
        if (!cur || override || preferCio(cur, x)) map.set(x.inst, x);
      }
      return [...map.values()].sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
    })(),
    assetReturns: mergeBy('asset', prevIns.assetReturns, fresh.assetReturns),
    execs: mergeBy('key', prevIns.execs, fresh.execs).filter((e) => !badExecName(e.person)).slice(0, 40),
    // 이전 회차에 남은 값도 같은 기준으로 다시 거른다(기준 강화 전 수치 정리)
    aums: mergeBy('inst', prevIns.aums, fresh.aums).filter((x) => x.unit !== 'KRW' || aumSane(x.amount, refAum.get(x.inst))),
    relocations: mergeBy('inst', prevIns.relocations, fresh.relocations).slice(0, 30),
  };
  await writeFile(new URL('../insights.json', import.meta.url), JSON.stringify(insights, null, 0));
  console.log(`insights: ${insights.cios.length} CIO, ${insights.execs.length} 실무인사, ${insights.aums.length} AUM, ${insights.relocations.length} 지방이전, ${insights.assetReturns.length} asset-returns`);

  // 펀드레이징 트래커(fundraising.json) — 모집·클로징 이벤트 자동 추출.
  let prevFr = [];
  try { prevFr = (JSON.parse(await readFile(new URL('../fundraising.json', import.meta.url), 'utf8')).items) || []; } catch {}
  const fr = buildFundraising(merged, prevFr);
  await writeFile(new URL('../fundraising.json', import.meta.url), JSON.stringify(fr, null, 0));
  console.log(`fundraising: ${fr.count} events, ${fr.fundCount} funds (펀드명 확인 ${fr.namedCount})`);

  // 투자내역 트래커(investments.json) — 기관별 출자·인수·대출 등 누적 DB.
  let prevInv = [];
  try { prevInv = (JSON.parse(await readFile(new URL('../investments.json', import.meta.url), 'utf8')).items) || []; } catch {}
  const inv = buildInvestments(merged, prevInv);
  await writeFile(new URL('../investments.json', import.meta.url), JSON.stringify(inv, null, 0));
  console.log(`investments: ${inv.count} events (+${inv.added} new), overseas ${inv.items.filter(e => e.overseas).length}`);
}

function selftest() {
  const sample = `<rss><channel>
    <item><title>국민연금, 미국 멀티패밀리 메자닌 대출에 5억 달러($500M) 추가 배정 - 한국경제</title>
      <link>https://example.com/a1</link><pubDate>Fri, 26 Jun 2026 08:12:00 GMT</pubDate>
      <description>&lt;a href="https://news.google.com/x"&gt;국민연금, 메자닌 대출 5억 달러 배정&lt;/a&gt;&amp;nbsp;&amp;nbsp;&lt;font color="#6f6f6f"&gt;한국경제&lt;/font&gt;</description>
      <source url="https://hankyung.com">한국경제</source></item>
    <item><title>Blackstone closes $10B global private credit fund - Bloomberg</title>
      <link>https://example.com/a2</link><pubDate>Thu, 25 Jun 2026 13:00:00 GMT</pubDate>
      <description>Blackstone held a final close on a $10 billion private credit fund.</description><source>Bloomberg</source></item>
    <item><title>군인공제회, 글로벌 항공기 리스 펀드에 2,000억 원 출자 - 더벨</title>
      <link>https://example.com/a3</link><pubDate>Wed, 24 Jun 2026 09:00:00 GMT</pubDate>
      <description>군인공제회가 글로벌 항공기 금융 펀드에 출자했다.</description><source>더벨</source></item>
    <item><title>국내 데이터센터 분양 임박, 청약 시작 - IT조선</title>
      <link>https://example.com/a4</link><pubDate>Wed, 24 Jun 2026 16:00:00 GMT</pubDate>
      <description>국내 데이터센터 분양이 시작된다.</description><source>IT조선</source></item>
  </channel></rss>`;
  const parsed = parseFeed(sample);
  const kept = parsed.filter(isRelevant).map(enrich);
  for (const a of kept) {
    console.log(`- [${a.cat}] ${a.inst}(${a.instType}) ${a.asset}/${a.region} metric="${a.metric}"`);
    console.log(`    ko: ${a.ko}`);
  }
  const a1 = kept[0], a2 = kept[1], a3 = kept[2];
  const ok = parsed.length === 4 && kept.length === 3          // 국내 데이터센터 분양 기사는 제외(해외 맥락X + 분양 잡음)
    && a1.inst === '국민연금' && a1.asset === 'PC' && a1.region === 'US' && a1.metric === '$500M'
    && !/[<>]/.test(a1.body) && !/&nbsp;|&lt;/.test(a1.body)    // HTML/엔티티 완전 제거
    && a2.inst === 'Blackstone' && a2.cat === 'GP' && a2.instType === '해외 GP'  // 글로벌 GP는 지역어 없어도 통과
    && a3.inst === '군인공제회' && a3.asset === 'AV' && a3.instType === '공제회';

  // CIO·수익률 추출 자가 테스트
  const cio1 = extractCio('국민연금 기금이사에 홍길동 한국은행 출신 선임');   // 직함 앞 기관=국민연금, 이름=홍길동
  const cio2 = extractCio('국민연금, 차기 CIO 공개 모집…25일까지 후보 접수'); // 공모 진행
  const ret1 = extractReturn('국민연금 대체투자 수익률 12.3% 기록');          // 대체투자 12.3%
  const ok2 = cio1 && cio1.inst === '국민연금' && cio1.person === '홍길동' && cio1.background === '한국은행' && cio1.status === '선임'
    && cio2 && cio2.status === '공모·인선 진행'
    && ret1 && ret1.asset === 'ALT' && ret1.value === 12.3;

  // 관련성 필터: 마켓 뉴스 포함 + 잡음 배제
  const mkt = isRelevant({ title: '미국 사모대출 시장, 올해 1조 달러 돌파 전망', desc: '글로벌 사모대출 시장이 빠르게 성장하고 있다' }); // 펀드 결성 아님 → 마켓 뉴스로 통과
  const gpDeal = isRelevant({ title: 'Blackstone explores $5B infrastructure deal', desc: 'private markets dealmaking rebounds' }); // GP 마켓/딜 뉴스 통과
  const noise1 = isRelevant({ title: '코스피 2700 돌파…증시 강세', desc: '주가 상승' });          // 시황 잡음 → 배제
  const noise2 = isRelevant({ title: '서울 아파트 분양 청약 시작', desc: '부동산 청약' });        // 국내 분양 잡음 → 배제
  const ok3 = mkt === true && gpDeal === true && noise1 === false && noise2 === false;
  console.log(`relevance: market=${mkt} gpDeal=${gpDeal} noise1=${noise1} noise2=${noise2}`);

  // 마켓 뉴스 분류: 기관 미식별 대체투자 뉴스 → cat '마켓'
  const mktArt = enrich({ title: '글로벌 사모대출 시장, 사상 최대 규모로 성장', desc: 'private credit 시장이 확대되고 있다', link: 'http://x/1', pub: '', source: 'Bloomberg' });
  const lpArt = enrich({ title: '국민연금, 해외 인프라 펀드에 출자', desc: '국민연금 출자', link: 'http://x/2', pub: '', source: '더벨' });
  const ok4 = mktArt.cat === '마켓' && lpArt.cat === 'LP';
  console.log(`classify: market=${mktArt.cat} lp=${lpArt.cat}`);

  // 지방이전 분류 — 국내 기관 + 이전 이슈 → cat '이전'
  const mvArt = enrich({ title: '군인공제회 본사 이전 추진…운용인력 이탈 우려', desc: '공제회 지방이전 논의가 이어지고 있다', link: 'http://x/3', pub: '', source: '더벨' });
  const mvRel = isRelevant({ title: '산업은행 부산 이전 법안 재발의…노조 반발', desc: '국책은행 지방이전을 둘러싼 논란' });
  const noMove = MOVE_RE.test('이전에도 국민연금은 해외 인프라에 투자했다');   // '그 이전' 오탐 없어야 함
  const ok5 = mvArt.cat === '이전' && mvArt.inst === '군인공제회' && mvRel === true && noMove === false;
  console.log(`relocation: cat=${mvArt.cat} inst=${mvArt.inst} relevant=${mvRel} falsePositive=${noMove}`);

  // 실무 인사(본부장·실장·팀장) 추출
  const ex1 = extractExec('교직원공제회 대체투자본부장에 김철수 전 증권사 임원 선임');
  const ex2 = extractExec('국민연금 해외 인프라 투자 확대');                    // 직함 없음 → null
  const ex3 = extractExec('군인공제회, 건설인프라본부장 발탁 인사');              // 부서명 조각 → 이름 아님
  const ok6 = ex1 && ex1.inst === '한국교직원공제회' && ex1.person === '김철수' && ex1.title === '대체투자본부장' && ex1.action === '선임' && ex2 === null && ex3 === null;
  console.log(`exec: ${JSON.stringify(ex1)}`);

  // AUM 추출 — 국내(조원) / 해외 GP($bn), 단서 없는 숫자는 배제
  const au1 = extractAum('국민연금 운용자산 1200조원 돌파');
  const au2 = extractAum('Blackstone reported $1.2 trillion in assets under management', ['Blackstone']);
  const au3 = extractAum('국민연금이 미국 물류센터에 5조원을 투자했다');        // AUM 단서 없음 → null
  const au4 = extractAum("KDB생명서 발 뺀 삼성생명…'345조 굴릴' 해외 운용사 찾나");   // 단서 없는 금액 → null
  const ok7 = au1 && au1.amount === 12000000 && au1.unit === 'KRW' && au1.inst === '국민연금'
    && au2 && au2.display === '$1.2T' && au2.unit === 'USD' && au2.inst === 'Blackstone'
    && au3 === null && au4 === null;
  console.log(`aum: ${JSON.stringify(au1)} ${JSON.stringify(au2)} noCue=${au3}`);
  console.log(`extract: cio1=${JSON.stringify(cio1)} cio2.status=${cio2 && cio2.status} ret1=${JSON.stringify(ret1)}`);
  // 투자내역 추출 — 주체·행위·역할 판정 회귀 테스트
  const G = (t) => extractDeals({ id: 'x', ko: t, cat: 'GP', instType: '해외 GP', asset: 'PE', region: 'US', body: '', date: '09.27', ts: '2026-09-27' });
  const L = (t) => extractDeals({ id: 'x', ko: t, cat: 'LP', instType: '연기금', asset: 'RE', region: 'US', body: '', date: '09.27', ts: '2026-09-27' });
  const dealCases = [
    [L, '국민연금, 美 물류센터에 3억달러 투자', '국민연금:투자'],
    [L, '교직원공제회, 블랙스톤 인프라 펀드에 2억달러 출자', '한국교직원공제회:펀드 출자'],
    [L, '행정공제회·군인공제회, 유럽 부동산 대출펀드 3000억 약정', '대한지방행정공제회:펀드 출자,군인공제회:펀드 출자'],
    [L, '과학기술인공제회, 해외 세컨더리 위탁운용사 3곳 선정', '과학기술인공제회:위탁운용사 선정'],
    [L, '국민연금, 美 세컨더리 펀드 결성에 5억달러 출자', '국민연금:펀드 출자'],
    [G, "Blackstone's Private Equity Chief Joe Baratta in Talks to Exit", ''],
    [G, 'CVC Cordatus Loan Fund XXII notes upgraded by Fitch', ''],
    [G, 'Bain Capital Ventures Closes $1.6 Billion Fund XI To Back AI Startups', 'Bain Capital:펀드 결성'],
    [G, 'EQT, 콜러캐피탈 인수 완료…세컨더리 운용사 품고 투자 다각화', 'EQT:인수'],
    [G, '원오크, 브라조스 자산 44억 달러에 인수… 아폴로로부터 90억 달러 투자 유치', 'Apollo:투자'],
    [G, 'Partners Group Opens New Stockholm Office as It Increases Commitment to Nordics', ''],
    [L, '교직원공제회, 3000억 규모 블라인드 PEF 출자사업 공고', '한국교직원공제회:출자사업'],
    [L, '국민연금 1점에 움직이는 운용사들…‘전주 거점’ 경쟁 본격화', ''],
    [L, '달라진 국민연금 투자…인프라·사모대출에 몰렸다 [국민연금 대체투자 지도]①', ''],
    [G, '블랙스톤 이사 조셉 바라타, 1,238만 달러 상당 주식 매각', ''],
    [G, '원오크, 아폴로로부터 90억 달러 투자 유치 완료', 'Apollo:투자'],
    [G, '아다니, 테마섹·블랙록 등 컨소시엄에 공항 사업부 지분 매각키로', 'BlackRock:인수'],
    [G, '삼성SDS, AI·로봇·물류 10조 투자 시동…KKR과 M&A 물색', ''],
    [G, 'Company X sells logistics portfolio to Blackstone for $1.2 billion', 'Blackstone:인수'],
  ];
  const dealFails = dealCases.filter(([f, t, exp]) => f(t).map((e) => `${e.inst}:${e.kind}`).join(',') !== exp);
  const amt = [dealAmount('75조 굴리는 국민연금'), dealAmount('주당 A$2.50 인수'), dealAmount('KKR, 21억 달러 레버리지 론'),
    dealAmount('EQT acquires 2 million square foot logistics portfolio'), dealAmount('Ares, which manages $671B in assets, eyes stake'),
    dealAmount('Macquarie PE acquires Hwasung for ₩300 Billion')];
  const ok8 = dealFails.length === 0 && amt[0] === '' && amt[1] === '' && amt[2] === '21억 달러' && amt[3] === '' && amt[4] === '' && amt[5] === '₩300 Billion';
  if (!ok8) console.log('amounts:', JSON.stringify(amt));
  if (dealFails.length) console.log('deal FAIL:', dealFails.map((x) => x[1]).join(' | '));
  console.log(`deals: ${dealCases.length - dealFails.length}/${dealCases.length} ok`);

  // 본문 추출·정제 — JSON-LD 본문에서 바이라인·이메일·저작권 꼬리 제거, 리드 분리
  const html = '<html><head><script type="application/ld+json">{"@type":"NewsArticle","articleBody":"(서울=연합뉴스) 홍길동 기자 = 행정공제회가 유럽 부동산 대출 펀드에 2000억원을 약정했다.\\n행정공제회는 이번 약정으로 해외 부동산 대출 비중을 늘린다. 업계는 금리 하락기를 대비한 포석으로 본다.\\nhong@yna.co.kr\\nⓒ 연합뉴스 무단전재 금지"}</script></head><body><p>x</p></body></html>';
  const ex = extractArticle(html, '행정공제회, 유럽 부동산 대출펀드 2000억 약정');
  const lead = leadOf('가'.repeat(300) + '\n\n' + '나'.repeat(300));
  const ok9 = ex.text.startsWith('행정공제회가') && !/@|ⓒ|기자 =/.test(ex.text) && ex.text.split('\n\n').length === 2 && lead.length <= LEAD_MAX;
  console.log(`extract: via=${ex.via} paras=${ex.text.split('\n\n').length} readability=${!!Readability}`);

  const all7 = ok && ok2 && ok3 && ok4 && ok5 && ok6 && ok7 && ok8 && ok9;
  console.log(all7 ? '\nSELFTEST PASS' : `\nSELFTEST FAIL (ok=${ok} ok2=${ok2} ok3=${ok3} ok4=${ok4} ok5=${ok5} ok6=${ok6} ok7=${ok7} ok8=${ok8} ok9=${ok9})`);
  if (!all7) process.exit(1);
}

if (process.argv[1] && process.argv[1].endsWith('collect-news.mjs')) {
  main().catch(e => { console.error(e); process.exit(1); });
}
