#!/usr/bin/env node
/*
 * KB GIS — 주간 시장현황 (자산군별)
 *
 * 매주 마지막 영업일(한국 기준, 공휴일이면 그 전 영업일)에 한 번, 지난 보고일 다음날부터
 * 이번 보고일까지 수집된 기사·딜·펀드레이징 기록으로 다섯 자산군의 주간 현황을 정리한다.
 *   Private Equity · Private Credit · Real Estate · Infrastructure · Aviation
 * 자산군마다 반드시 들어가는 항목
 *   1) 운용사별 이슈      — 운용사 · 이번 주 이슈 · 근거 기사
 *   2) 시장 현황          — 수치(보도·딜·펀드 결성) + 한국 투자자 선호 자산군·전략·현황
 *   3) 트렌드와 그 이유   — 트렌드 · 이유 분석 · 근거 기사
 *
 * 분석 문장은 LLM(Claude → Gemini 순)이 '이번 주 수집 자료'만 근거로 쓴다. 자료에 없는 숫자가
 * 들어간 문장, 근거 기사가 없는 이슈·트렌드는 자동으로 뺀다. LLM 을 쓸 수 없으면 수치 집계와
 * 기사 제목만으로 만든 '자동 집계' 판을 낸다(추정·해석 문장 없음).
 *
 * 사용: node scripts/weekly-market.mjs [--date YYYY-MM-DD] [--force] [--dump ctx.json] [--answer ans.json]
 *   --date   보고일 지정(기본: 오늘, KST)   --force  마지막 영업일이 아니어도 생성
 *   --dump   LLM 에 줄 자료를 파일로 저장   --answer 준비된 분석 JSON 을 LLM 응답 대신 사용
 * 결과: weekly/YYYYMMDD.json, weekly/index.json
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';
const AC = createRequire(import.meta.url)('../article-clean.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'weekly');
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : ''; };
const has = (k) => process.argv.includes(k);

// ── 영업일 ────────────────────────────────────────────────
// 한국 공휴일·금융시장 휴장일(대체공휴일 포함). 해마다 확인해 보태야 한다 — 목록에 없는 해는
// 주말만 빼고 계산한다. 저장소 변수 EXTRA_HOLIDAYS(쉼표 구분 YYYY-MM-DD)로 임시 휴일을 더할 수 있다.
const KR_HOLIDAYS = new Set([
  // 2026
  '2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18', '2026-03-02', '2026-05-01', '2026-05-05', '2026-05-25',
  '2026-06-03', '2026-08-17', '2026-09-24', '2026-09-25', '2026-10-05', '2026-10-09', '2026-12-25', '2026-12-31',
  // 2027
  '2027-01-01', '2027-02-08', '2027-02-09', '2027-03-01', '2027-05-05', '2027-05-13', '2027-08-16', '2027-09-14',
  '2027-09-15', '2027-09-16', '2027-10-04', '2027-10-11', '2027-12-27', '2027-12-31',
  ...String(process.env.EXTRA_HOLIDAYS || '').split(',').map((s) => s.trim()).filter(Boolean),
]);
const DAY = 86400000;
const ymd = (d) => d.toISOString().slice(0, 10);
const kstToday = () => ymd(new Date(Date.now() + 9 * 3600 * 1000));
const dateOf = (s) => new Date(s + 'T00:00:00Z');
const isBiz = (s) => { const w = dateOf(s).getUTCDay(); return w !== 0 && w !== 6 && !KR_HOLIDAYS.has(s); };
const addDays = (s, n) => ymd(new Date(dateOf(s).getTime() + n * DAY));
// 그 주(월~일)의 마지막 영업일. 영업일이 하나도 없으면 ''.
function lastBizOfWeek(s) {
  const w = dateOf(s).getUTCDay();
  const mon = addDays(s, -((w + 6) % 7));
  for (let i = 4; i >= 0; i--) { const d = addDays(mon, i); if (isBiz(d)) return d; }
  return '';
}
// 직전 보고일 — 앞선 주들 중 영업일이 있는 가장 가까운 주의 마지막 영업일
function prevReportDay(s) {
  let d = addDays(s, -((dateOf(s).getUTCDay() + 6) % 7) - 1);   // 지난주 일요일
  for (let k = 0; k < 6; k++) { const r = lastBizOfWeek(d); if (r) return r; d = addDays(d, -7); }
  return addDays(s, -7);
}
const kstMs = (s, end) => Date.parse(`${s}T${end ? '23:59:59' : '00:00:00'}+09:00`);

// ── 자산군 판별 ────────────────────────────────────────────
const ASSETS = [
  ['PE', 'Private Equity'], ['PC', 'Private Credit'], ['RE', 'Real Estate'], ['IN', 'Infrastructure'], ['AV', 'Aviation'],
];
const ASSET_KW = {
  AV: /항공기|aircraft|aviation|항공\s?금융|aircraft leas|항공기\s?리스|aircraft finance|lessor|엔진\s?리스|engine leas/i,
  IN: /인프라\s?(?:펀드|투자|자산|운용|크레딧|대출|딜|사업|PEF)|사회기반시설|infrastructure|재생에너지|renewable|태양광|solar|풍력|wind farm|발전소|power plant|data\s?cent|데이터센터|통신탑|tower|fiber|광케이블|toll road|공항|airport|항만|\bport\b|utility|utilities|전력망|grid|energy transition|에너지 전환|LNG|pipeline/i,
  PC: /사모대출|private credit|direct lending|다이렉트 렌딩|메자닌|mezzanine|private debt|사모채권|선순위 대출|unitranche|유니트랜치|\bBDC\b|NAV (?:loan|financing|대출)|asset-based finance|\bABF\b|senior secured|credit fund|크레딧 펀드|대출 펀드/i,
  RE: /부동산|real estate|오피스|\boffice|물류센터|logistics|warehouse|호텔|hotel|리테일|retail park|멀티패밀리|multifamily|임대주택|rental housing|student housing|\bREITs?\b|리츠|property/i,
  PE: /사모펀드|사모투자|private equity|바이아웃|buyout|세컨더리|secondar|\bPEF\b|growth equity|그로스|경영권|take-private|상장폐지|carve-out|카브아웃|continuation (?:fund|vehicle)|GP[- ]stakes?|venture|벤처/i,
};
const assetsOf = (a) => {
  const t = `${a.ko || ''} ${a.tko || ''} ${String(a.body || '').slice(0, 600)}`;
  const out = new Set(Object.keys(ASSET_KW).filter((k) => ASSET_KW[k].test(t)));
  // 수집기 판정은 단서가 없으면 PE 로 두고, 국문 기사는 '인프라 협력' 같은 일반어에도 걸리므로 영문 기사의 PE 외 판정만 믿는다
  if (a.asset && a.asset !== 'PE' && a.lang !== 'ko') out.add(a.asset);
  // 다른 자산군 단서가 없는 해외 GP 의 딜·펀드 기사(바이아웃·그로스 등)는 PE 로 본다
  if (!out.size && (a.instType === '해외 GP' || a.role === 'GP')) out.add('PE');
  return out;
};

// 자산군별로 챙겨 볼 전략·테마 — 이번 주와 지난주 보도 건수를 비교해 트렌드 신호로 쓴다
const THEMES = {
  PE: [['세컨더리', /세컨더리|secondar/i], ['컨티뉴에이션 펀드', /컨티뉴에이션|continuation (?:fund|vehicle)|GP-led/i], ['GP 지분투자', /GP[- ]stakes?|GP 지분/i],
    ['상장사 인수(테이크프라이빗)', /take[- ]private|테이크\s?프라이빗|상장폐지|공개매수|tender offer/i], ['공동투자', /co-?invest|공동투자|코인베스트/i],
    ['엑시트·IPO', /\bIPO\b|상장|exit|엑시트|매각 완료/i], ['AI·테크', /\bAI\b|인공지능|artificial intelligence|software|소프트웨어/i],
    ['개인투자자(에버그린)', /evergreen|semi-liquid|private wealth|wealth channel|retail investors?|개인투자자|에버그린/i], ['카브아웃', /carve-?out|카브아웃|사업부 인수/i]],
  PC: [['다이렉트 렌딩', /direct lending|다이렉트 렌딩/i], ['NAV 대출', /NAV (?:loan|lending|financing|facility)|NAV 대출/i], ['자산담보금융(ABF)', /asset-based|\bABF\b|자산담보/i],
    ['인프라 크레딧', /infrastructure (?:credit|debt)|인프라 (?:크레딧|대출)/i], ['부동산 대출', /real estate (?:debt|credit|lending)|CRE (?:loan|lending)|부동산 대출/i],
    ['BDC', /\bBDCs?\b/i], ['부실·디폴트', /default|디폴트|부실|distress|non-accrual|PIK/i], ['보험사 자금', /insurer|insurance|보험/i],
    ['은행 제휴', /bank partnership|은행과|with (?:[A-Z][\w&]+ )?bank|forward flow/i], ['에버그린·개인투자자', /evergreen|semi-liquid|private wealth|retail investors?|개인투자자/i]],
  RE: [['데이터센터', /data\s?cent|데이터센터/i], ['물류', /logistics|warehouse|industrial|물류/i], ['오피스', /\boffice|오피스/i], ['주거(멀티패밀리·임대)', /multifamily|residential|rental housing|student housing|주거|임대주택|멀티패밀리/i],
    ['호텔·리테일', /hotel|hospitality|retail|호텔|리테일/i], ['부동산 크레딧', /real estate (?:debt|credit|lending)|부동산 (?:대출|크레딧)/i], ['리츠', /\bREITs?\b|리츠/i],
    ['아시아(일본·호주 등)', /japan|일본|australia|호주|asia|아시아/i], ['유럽', /europe|유럽|\bUK\b|영국|germany|독일/i]],
  IN: [['데이터센터·디지털', /data\s?cent|데이터센터|digital infrastructure|fiber|광케이블|tower|통신/i], ['전력·유틸리티', /\bpower\b|전력|grid|utility|utilities|발전/i],
    ['재생에너지·전환', /renewable|solar|wind|재생에너지|태양광|풍력|energy transition|에너지 전환|battery|배터리|저장/i], ['LNG·가스·미드스트림', /\bLNG\b|gas|가스|midstream|pipeline/i],
    ['교통(공항·항만·도로)', /airport|port|toll|rail|공항|항만|도로|철도/i], ['인프라 크레딧', /infrastructure (?:credit|debt)|인프라 (?:크레딧|대출)/i], ['원전', /nuclear|원전|원자력/i], ['AI 수요', /\bAI\b|인공지능/i]],
  AV: [['항공기 리스', /leas|리스/i], ['엔진', /engine|엔진/i], ['항공기 금융·ABS', /aircraft (?:finance|financing|ABS)|항공기 금융|\bABS\b/i], ['항공사', /airline|항공사/i],
    ['신규 주문·인도', /order|deliver|주문|인도/i], ['세일앤리스백', /sale[- ]and[- ]leaseback|sale-leaseback|세일앤리스백/i], ['공급 부족', /shortage|backlog|supply|공급/i]],
};

const KR_LP_TYPES = new Set(['연기금', '공제회', '중앙회', '은행', '보험사', '증권사', '자산운용사', '캐피탈']);
const DEAL_TYPE = (k) => (/출자/.test(k) ? '출자' : /결성/.test(k) ? '결성' : /인수/.test(k) ? '인수' : /매각/.test(k) ? '매각' : /대출/.test(k) ? '대출' : /투자/.test(k) ? '투자' : /세컨더리/.test(k) ? '세컨더리' : '기타');
const FR_ASSET = { 'Private Equity': 'PE', Infrastructure: 'IN', 'Real Estate': 'RE', 'Private Credit': 'PC', Aviation: 'AV', Secondaries: 'PE', 'Venture Capital': 'PE' };

async function readJson(p, dflt) { try { return JSON.parse(await readFile(p, 'utf8')); } catch { return dflt; } }
const inRange = (ms, a, b) => ms >= a && ms <= b;
const tsMs = (x) => { const t = Date.parse(x && (x.pubTs || x.ts)); return isNaN(t) ? 0 : t; };
const titleOf = (a) => (a.lang === 'en' && a.tko ? a.tko : a.ko) || a.ko || '';

// ── 이번 주 자료 모으기 ─────────────────────────────────────
async function gather(reportDay) {
  const prevDay = prevReportDay(reportDay);
  const from = addDays(prevDay, 1);
  const win = [kstMs(from, false), kstMs(reportDay, true)];
  const prevFrom = addDays(prevReportDay(prevDay), 1);
  const pwin = [kstMs(prevFrom, false), kstMs(prevDay, true)];

  const news = await readJson(path.join(ROOT, 'news.json'), []);
  const inv = (await readJson(path.join(ROOT, 'investments.json'), { items: [] })).items || [];
  const fr = await readJson(path.join(ROOT, 'fundraising.json'), { funds: [] });

  const live = (a) => !a.stale && !AC.staleTitle(a.ko, a.ts);
  const wk = news.filter((a) => inRange(tsMs(a), ...win) && live(a));
  const pw = news.filter((a) => inRange(tsMs(a), ...pwin) && live(a));
  const wkDeals = inv.filter((e) => inRange(tsMs(e), ...win));
  const stageEvents = [];
  for (const f of fr.funds || []) for (const s of f.stages || []) if (inRange(tsMs(s), ...win)) stageEvents.push({ f, s });

  const refs = {};   // 보고서에 남길 근거 기사 사본(아카이브에서 밀려나도 링크가 살도록)
  const ref = (a) => { refs[a.id] = { t: titleOf(a), o: a.lang === 'en' ? a.ko : '', s: a.source, u: a.url, d: String(a.ts || '').slice(0, 10) }; return a.id; };

  const perAsset = {};
  for (const [k, label] of ASSETS) {
    const arts = wk.filter((a) => assetsOf(a).has(k));
    const prevArts = pw.filter((a) => assetsOf(a).has(k));
    const deals = wkDeals.filter((e) => assetsOf({ ko: e.title, asset: e.asset, role: e.role, instType: e.instType }).has(k));
    const dealTypes = {};
    deals.forEach((e) => { const t = DEAL_TYPE(e.kind); dealTypes[t] = (dealTypes[t] || 0) + 1; });
    const frs = stageEvents.filter(({ f }) => (FR_ASSET[f.strategy] || f.asset) === k);
    const finals = frs.filter(({ s }) => s.stage === '파이널 클로즈').map(({ f, s }) => ({ gp: f.gp, fund: f.fund || '', size: s.size || f.finalSize || '', id: s.id }));
    const launches = frs.filter(({ s }) => s.stage === '모집 중').map(({ f, s }) => ({ gp: f.gp, fund: f.fund || '', size: s.size || f.target || '', id: s.id }));
    const closes = frs.filter(({ s }) => /1차|중간|^클로즈$/.test(s.stage)).map(({ f, s }) => ({ gp: f.gp, fund: f.fund || '', stage: s.stage, size: s.size || '', id: s.id }));
    // 운용사 언급 순위
    const gpCount = {};
    arts.filter((a) => a.instType === '해외 GP' && a.inst).forEach((a) => { (gpCount[a.inst] = gpCount[a.inst] || []).push(a); });
    const gps = Object.entries(gpCount).sort((x, y) => y[1].length - x[1].length).slice(0, 8)
      .map(([gp, list]) => ({ gp, n: list.length, items: list.slice(0, 4).map((a) => ({ id: ref(a), t: titleOf(a) })) }));
    // 한국 투자자
    const krArts = arts.filter((a) => KR_LP_TYPES.has(a.instType) || a.lang === 'ko');
    const krDeals = deals.filter((e) => e.role === 'LP').map((e) => ({ inst: e.inst, kind: e.kind, amount: e.amount || '', cp: e.counterpart || '', overseas: !!e.overseas, t: e.title, id: e.id }));
    // 테마 신호
    const themes = (THEMES[k] || []).map(([name, re]) => {
      const cur = arts.filter((a) => re.test(`${a.ko} ${a.tko || ''} ${String(a.body || '').slice(0, 400)}`));
      const prev = prevArts.filter((a) => re.test(`${a.ko} ${a.tko || ''} ${String(a.body || '').slice(0, 400)}`)).length;
      return { name, n: cur.length, prev, kr: cur.filter((a) => a.lang === 'ko' || KR_LP_TYPES.has(a.instType)).length, ids: cur.slice(0, 3).map(ref) };
    }).filter((t) => t.n || t.prev).sort((x, y) => y.n - x.n);
    // LLM 에 보여 줄 기사(중요도: 금액·딜·펀드·한국 LP → 최신순)
    const score = (a) => (a.metric ? 2 : 0) + (deals.some((e) => e.id === a.id) ? 2 : 0) + (frs.some(({ s }) => s.id === a.id) ? 2 : 0) + (KR_LP_TYPES.has(a.instType) ? 1.5 : 0) + (a.instType === '해외 GP' ? 1 : 0)
      + (a.lang === 'ko' && a.body && String(a.body).length > 120 ? 1 : 0) + (/한국|국내|Korea/i.test(`${a.ko} ${a.tko || ''}`) ? 1 : 0);
    // 같은 소식의 중복 보도는 한 건만 보여 준다(제목 앞부분이 같으면 같은 소식)
    const seenT = new Set();
    const uniq = arts.slice().sort((x, y) => score(y) - score(x) || tsMs(y) - tsMs(x))
      .filter((a) => { const key = titleOf(a).replace(/[^0-9A-Za-z가-힣]/g, '').slice(0, 18).toLowerCase(); if (seenT.has(key)) return false; seenT.add(key); return true; });
    const top = uniq.slice(0, 70);
    perAsset[k] = {
      label,
      stats: { articles: arts.length, prevArticles: prevArts.length, deals: deals.length, dealTypes, finals: finals.length, launches: launches.length, otherCloses: closes.length, krArticles: krArts.length },
      finals, launches, closes, gps, krDeals, themes,
      items: top.map((a) => ({ id: ref(a), t: titleOf(a), o: a.lang === 'en' ? a.ko : '', inst: a.inst, src: a.source, d: String(a.ts || '').slice(5, 10), lead: AC.cleanText(String(a.body || ''), { title: a.ko }).replace(/\s+/g, ' ').slice(0, 280) })),
    };
    for (const x of [...finals, ...launches, ...closes, ...krDeals]) { const a = news.find((n) => n.id === x.id); if (a) ref(a); }
  }
  // 한국 투자자 관심도: 자산군별 한국어 보도·국내 LP 딜 비중
  const krShare = ASSETS.map(([k, label]) => ({ k, label, articles: perAsset[k].stats.krArticles, deals: perAsset[k].krDeals.length }));
  return { reportDay, from, prevDay, window: [from, reportDay], perAsset, krShare, refs, totals: { articles: wk.length, prevArticles: pw.length, deals: wkDeals.length } };
}

// ── LLM 분석 ───────────────────────────────────────────────
const SYSTEM = `당신은 한국 기관투자자(연기금·공제회·보험·증권사)의 해외대체투자 담당자에게 주간 시장 브리핑을 쓰는 애널리스트입니다.
반드시 지킬 것:
- 아래 '이번 주 수집 자료'에 있는 사실만 씁니다. 자료에 없는 사건·수치·전망을 지어내지 않습니다.
- 금액·비율 같은 숫자는 자료에 적힌 표기 그대로 씁니다(예: "$2.3bn", "1,550억원"). 환산하거나 새로 계산하지 않습니다. 건수는 제공된 집계 수치만 씁니다.
- 운용사 이슈와 트렌드마다 근거 기사 id(refs)를 1개 이상 붙입니다. 목록에 있는 id만 씁니다.
- '이유 분석'은 자료에서 읽히는 원인(예: 금리, 규제, 수요, 공급, 엑시트 환경, 자금 흐름)을 근거와 함께 설명하되, 자료로 뒷받침되지 않으면 "보도만으로는 원인을 단정하기 어렵다"고 씁니다.
- 한국 투자자 관련 내용은 국내 기관 기사·국내 LP 딜 목록에서만 뽑습니다. 해당 자료가 없으면 "이번 주 국내 투자자 관련 보도 없음"이라고 씁니다.
- 운용사·펀드·해외 기관 이름은 영문 표기 그대로(예: Blackstone, KKR), 한국 기관은 한글 공식 명칭을 씁니다.
- 문체는 간결한 보고서체(~함, ~임)로 씁니다.
출력은 JSON 하나만 냅니다(설명 문장·코드 블록 없이).`;

function buildPrompt(ctx) {
  const lines = [];
  lines.push(`보고 기간: ${ctx.window[0]} ~ ${ctx.window[1]} (보고일 ${ctx.reportDay}, 직전 보고일 ${ctx.prevDay})`);
  lines.push(`전체 보도 ${ctx.totals.articles}건(직전 주 ${ctx.totals.prevArticles}건), 딜 ${ctx.totals.deals}건`);
  lines.push(`자산군별 국내 투자자 관련 보도·국내 LP 딜: ${ctx.krShare.map((x) => `${x.label} ${x.articles}건/${x.deals}건`).join(', ')}`);
  for (const [k, label] of ASSETS) {
    const A = ctx.perAsset[k];
    lines.push(`\n## ${k} (${label})`);
    lines.push(`집계: 보도 ${A.stats.articles}건(직전 주 ${A.stats.prevArticles}건) · 딜 ${A.stats.deals}건 ${JSON.stringify(A.stats.dealTypes)} · 파이널 클로즈 ${A.stats.finals}건 · 모집 개시 ${A.stats.launches}건 · 기타 클로즈 ${A.stats.otherCloses}건 · 국내 투자자 관련 보도 ${A.stats.krArticles}건`);
    if (A.finals.length) lines.push('파이널 클로즈: ' + A.finals.map((x) => `[${x.id}] ${x.gp} ${x.fund} ${x.size}`).join(' / '));
    if (A.launches.length) lines.push('모집 개시: ' + A.launches.map((x) => `[${x.id}] ${x.gp} ${x.fund} ${x.size}`).join(' / '));
    if (A.closes.length) lines.push('1차·중간 클로즈: ' + A.closes.map((x) => `[${x.id}] ${x.gp} ${x.fund} ${x.stage} ${x.size}`).join(' / '));
    if (A.krDeals.length) lines.push('국내 LP 딜: ' + A.krDeals.map((x) => `[${x.id}] ${x.inst} ${x.kind} ${x.amount} ${x.cp ? '← ' + x.cp : ''} ${x.overseas ? '(해외)' : '(국내)'} (${x.t})`).join(' / '));
    if (A.themes.length) lines.push('테마 보도 건수(이번 주/직전 주/국내): ' + A.themes.map((t) => `${t.name} ${t.n}/${t.prev}/${t.kr}`).join(', '));
    if (A.gps.length) {
      lines.push('운용사 언급: ' + A.gps.map((g) => `${g.gp} ${g.n}건`).join(', '));
      for (const g of A.gps) lines.push(`  · ${g.gp}: ` + g.items.map((x) => `[${x.id}] ${x.t}`).join(' / '));
    }
    lines.push('기사:');
    for (const it of A.items) lines.push(`- [${it.id}] ${it.d} ${it.t}${it.o ? ` (원문: ${it.o})` : ''} — ${it.src}${it.lead ? ` | ${it.lead}` : ''}`);
  }
  const schema = `{
  "headline": "이번 주 해외대체투자 시장 한 줄 총평",
  "korea": "한국 투자자 전반: 이번 주 선호 자산군·전략과 현황(2~4문장)",
  "assets": {
    "PE": {
      "summary": "이번 주 요약 2~3문장",
      "status": "시장 현황: 딜·펀드레이징·가격/금리 환경 등 2~4문장",
      "korea": "한국 투자자 선호 전략과 현황 1~3문장",
      "strategies": ["국내 투자자가 주목하는 전략/섹터 2~4개(짧은 명사구)"],
      "gpIssues": [{"gp": "운용사명", "issue": "이번 주 이슈 1~2문장", "refs": ["기사id"]}],
      "trends": [{"trend": "트렌드(짧은 문장)", "why": "그 이유 분석 1~3문장", "refs": ["기사id"]}]
    },
    "PC": {…}, "RE": {…}, "IN": {…}, "AV": {…}
  }
}
운용사 이슈는 자산군마다 3~6개, 트렌드는 2~4개. 자료가 부족한 자산군은 있는 만큼만 쓰고 부족하다고 밝힙니다.`;
  return `${lines.join('\n')}\n\n위 자료로 아래 형식의 JSON 을 작성하세요.\n${schema}`;
}

async function callClaude(prompt) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic();
  const model = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';
  const req = {
    model, max_tokens: 32000, system: SYSTEM, output_config: { effort: 'high' },
    messages: [{ role: 'user', content: prompt }],
  };
  try {
    // 안전 분류기가 거절하면 서버가 다른 모델로 이어서 답하게 한다
    let msg;
    try {
      msg = await client.beta.messages.stream({ ...req, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }).finalMessage();
    } catch (e) {
      if (e instanceof Anthropic.BadRequestError) msg = await client.messages.stream(req).finalMessage();
      else throw e;
    }
    if (msg.stop_reason === 'refusal') return null;
    return { text: msg.content.filter((b) => b.type === 'text').map((b) => b.text).join(''), via: `claude:${msg.model || model}` };
  } catch (e) {
    console.warn(`claude error: ${e.status || ''} ${String(e.message || e).slice(0, 160)}`);
    return null;
  }
}
async function callGemini(prompt) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  for (const model of [process.env.GEMINI_MODEL, 'gemini-flash-latest', 'gemini-2.5-flash', 'gemini-flash-lite-latest'].filter(Boolean)) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 16000, responseMimeType: 'application/json' } }),
        signal: AbortSignal.timeout(180000),
      });
      if (!res.ok) { console.warn(`gemini ${model} HTTP ${res.status}`); continue; }
      const j = await res.json();
      const text = (((j.candidates || [])[0] || {}).content || {}).parts?.map((p) => p.text || '').join('') || '';
      if (text) return { text, via: `gemini:${model}` };
    } catch (e) { console.warn(`gemini ${model} error: ${e.message}`); }
  }
  return null;
}
const parseObj = (t) => { const m = String(t || '').match(/\{[\s\S]*\}/); try { return JSON.parse(m ? m[0] : t); } catch { return null; } };

// ── 검증: 자료에 없는 숫자·근거 없는 항목 빼기 ─────────────────
function numberBag(text) {
  const bag = new Set();
  for (const m of String(text).matchAll(/\d+(?:[.,]\d+)*/g)) {
    const raw = m[0].replace(/,/g, '');
    const v = parseFloat(raw);
    if (isNaN(v)) continue;
    // 표기 차이(1.50 ↔ 1.5)와 단위 환산(bn↔억, m↔억·만) 정도는 같은 숫자로 본다
    for (const x of [v, v * 10, v / 10, v * 100, v / 100, v * 1000, v / 1000]) bag.add(String(+x.toFixed(4)));
  }
  return bag;
}
function numbersOk(sentence, bag) {
  for (const m of String(sentence).matchAll(/\d+(?:[.,]\d+)*/g)) {
    const v = parseFloat(m[0].replace(/,/g, ''));
    if (isNaN(v) || v <= 12 || (v >= 2000 && v <= 2035 && Number.isInteger(v))) continue;   // 작은 수·연도는 통과
    if (!bag.has(String(+v.toFixed(4)))) return false;
  }
  return true;
}
const splitSent = (s) => String(s || '').split(/(?<=[.!?。]|[다음함임됨])\s+/).filter(Boolean);
function cleanText(s, bag, dropped) {
  const keep = splitSent(s).filter((x) => { const ok = numbersOk(x, bag); if (!ok) dropped.push(x); return ok; });
  return keep.join(' ').trim();
}
function validate(ans, ctx, sourceText) {
  const bag = numberBag(sourceText);
  const ids = new Set(Object.keys(ctx.refs));
  const dropped = [];
  const out = { headline: cleanText(ans.headline, bag, dropped), korea: cleanText(ans.korea, bag, dropped), assets: {} };
  for (const [k] of ASSETS) {
    const a = (ans.assets || {})[k] || {};
    const refsOk = (r) => (Array.isArray(r) ? r : []).map(String).filter((x) => ids.has(x));
    out.assets[k] = {
      summary: cleanText(a.summary, bag, dropped),
      status: cleanText(a.status, bag, dropped),
      korea: cleanText(a.korea, bag, dropped),
      strategies: (Array.isArray(a.strategies) ? a.strategies : []).map(String).filter((x) => x && numbersOk(x, bag)).slice(0, 5),
      gpIssues: (Array.isArray(a.gpIssues) ? a.gpIssues : []).map((g) => ({ gp: String(g.gp || '').trim(), issue: cleanText(g.issue, bag, dropped), refs: refsOk(g.refs) }))
        .filter((g) => g.gp && g.issue && g.refs.length).slice(0, 8),
      trends: (Array.isArray(a.trends) ? a.trends : []).map((t) => ({ trend: cleanText(t.trend, bag, dropped), why: cleanText(t.why, bag, dropped), refs: refsOk(t.refs) }))
        .filter((t) => t.trend && t.refs.length).slice(0, 6),
    };
  }
  return { out, dropped };
}

// ── LLM 없이: 집계·제목만으로 만드는 자동 판 ─────────────────
function autoReport(ctx) {
  const assets = {};
  for (const [k, label] of ASSETS) {
    const A = ctx.perAsset[k], S = A.stats;
    const dt = Object.entries(S.dealTypes).map(([t, n]) => `${t} ${n}`).join('·');
    assets[k] = {
      summary: S.articles ? `${label} 관련 보도 ${S.articles}건(직전 주 ${S.prevArticles}건), 딜 ${S.deals}건${dt ? `(${dt})` : ''}, 파이널 클로즈 ${S.finals}건·모집 개시 ${S.launches}건이 집계됨.` : '이번 주 수집된 관련 보도 없음.',
      status: A.finals.length ? `파이널 클로즈: ${A.finals.map((x) => `${x.gp}${x.size ? ` ${x.size}` : ''}`).join(', ')}.` : '',
      korea: A.krDeals.length ? `국내 LP 딜: ${A.krDeals.map((x) => `${x.inst} ${x.kind}${x.amount ? ` ${x.amount}` : ''}`).join(', ')}.` : (S.krArticles ? `국내 투자자 관련 보도 ${S.krArticles}건.` : '이번 주 국내 투자자 관련 보도 없음.'),
      strategies: A.themes.filter((t) => t.kr).slice(0, 4).map((t) => t.name),
      gpIssues: A.gps.slice(0, 5).map((g) => ({ gp: g.gp, issue: g.items[0].t, refs: g.items.map((x) => x.id).slice(0, 3) })),
      trends: A.themes.filter((t) => t.n >= 2).slice(0, 4).map((t) => ({ trend: `${t.name} 관련 보도 ${t.n}건(직전 주 ${t.prev}건)`, why: '', refs: t.ids })),
    };
  }
  const top = ctx.krShare.slice().sort((x, y) => (y.articles + y.deals * 3) - (x.articles + x.deals * 3));
  return {
    headline: `이번 주 보도 ${ctx.totals.articles}건(직전 주 ${ctx.totals.prevArticles}건), 딜 ${ctx.totals.deals}건 집계.`,
    korea: `국내 투자자 관련 보도는 ${top.filter((x) => x.articles).map((x) => `${x.label} ${x.articles}건`).join(', ') || '없음'}.`,
    assets,
  };
}

async function main() {
  const reportDay = arg('--date') || kstToday();
  const target = lastBizOfWeek(reportDay);
  if (!has('--force') && target !== reportDay) { console.log(`${reportDay}: 이번 주 마지막 영업일(${target || '없음'})이 아니므로 건너뜀`); return; }
  const ctx = await gather(reportDay);
  const prompt = buildPrompt(ctx);
  if (arg('--dump')) { await writeFile(arg('--dump'), JSON.stringify({ system: SYSTEM, prompt, ids: Object.keys(ctx.refs) }, null, 1)); console.log('dumped', arg('--dump'), prompt.length, 'chars'); }

  let via = 'auto', body = null, dropped = [];
  const ans = arg('--answer') ? { text: await readFile(arg('--answer'), 'utf8'), via: arg('--via') || 'claude' } : (await callClaude(prompt)) || (await callGemini(prompt));
  const parsed = ans && parseObj(ans.text);
  if (parsed && parsed.assets) {
    ({ out: body, dropped } = validate(parsed, ctx, prompt));
    via = ans.via;
  } else {
    if (ans) console.warn('LLM 응답을 읽지 못해 자동 집계 판으로 냄');
    body = autoReport(ctx);
  }
  // 수치 표는 LLM 과 무관하게 집계값으로 붙인다
  for (const [k] of ASSETS) {
    const A = ctx.perAsset[k];
    Object.assign(body.assets[k], { label: A.label, stats: A.stats, finals: A.finals, launches: A.launches, closes: A.closes, krDeals: A.krDeals, themes: A.themes.map(({ name, n, prev, kr }) => ({ name, n, prev, kr })) });
  }
  // 실제로 인용된 근거만 남긴다
  const used = new Set();
  const collect = (x) => { if (Array.isArray(x)) x.forEach(collect); else if (x && typeof x === 'object') { for (const [kk, v] of Object.entries(x)) { if (kk === 'refs' || kk === 'ids') (v || []).forEach((id) => used.add(id)); else if (kk === 'id' && typeof v === 'string') used.add(v); else collect(v); } } };
  collect(body);
  const refs = Object.fromEntries(Object.entries(ctx.refs).filter(([id]) => used.has(id)));
  const report = {
    date: ctx.reportDay, from: ctx.window[0], to: ctx.window[1], prevDate: ctx.prevDay,
    generatedAt: new Date().toISOString(), via, droppedSentences: dropped.length,
    totals: ctx.totals, krShare: ctx.krShare, ...body, refs,
  };
  await mkdir(OUT_DIR, { recursive: true });
  const key = ctx.reportDay.replace(/-/g, '');
  await writeFile(path.join(OUT_DIR, `${key}.json`), JSON.stringify(report));
  const idxPath = path.join(OUT_DIR, 'index.json');
  const idx = (await readJson(idxPath, [])).filter((x) => x.date !== ctx.reportDay);
  idx.push({ date: ctx.reportDay, key, from: ctx.window[0], to: ctx.window[1], via, headline: report.headline });
  idx.sort((a, b) => (a.date < b.date ? 1 : -1));
  await writeFile(idxPath, JSON.stringify(idx.slice(0, 104)));
  console.log(`weekly ${ctx.reportDay} (${ctx.window.join('~')}) via=${via} dropped=${dropped.length} refs=${Object.keys(refs).length}`);
  if (dropped.length) console.log('숫자 검증으로 뺀 문장:\n - ' + dropped.join('\n - '));
}

if (process.argv[1] && process.argv[1].endsWith('weekly-market.mjs')) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
export { lastBizOfWeek, prevReportDay, isBiz, gather, validate, autoReport };
