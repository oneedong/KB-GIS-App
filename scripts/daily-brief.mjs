/*
 * KB GIS — 데일리 시황 브리핑 (매일 아침 08:00 KST)
 *
 * 전일 시장을 국내증시·해외증시·주요이슈·환율·SOFR/SONIA·기준금리·관찰 포인트·
 * 한줄 요약으로 정리해 market.json 으로 저장합니다. 앱의 '시황' 탭이 읽습니다.
 *
 *   node scripts/daily-brief.mjs            # 수집 후 market.json 갱신
 *   node scripts/daily-brief.mjs --selftest # 네트워크 없이 포맷·문장 생성 테스트
 *
 * 원칙: 수치는 전부 실제 소스에서 받아온 값만 쓴다. 실패한 항목은 값을 만들지
 * 않고 '–' 로 비우고 errors 에 남긴다(추정치·기억에 의존한 수치 금지).
 */
import { writeFile, readFile, mkdir } from 'fs/promises';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const errors = [];

// ── 추적 지수·환율 ────────────────────────────────────────
// [야후 심볼, 표시명, stooq 폴백 심볼]
const KR_INDEX = [
  ['^KS11', '코스피', '^kospi'],
  ['^KQ11', '코스닥', '^kosdaq'],
];
const GL_INDEX = [
  ['^GSPC', 'S&P 500', '^spx'],
  ['^IXIC', '나스닥', '^ndq'],
  ['^DJI', '다우존스', '^dji'],
  ['^STOXX50E', '유로스톡스50', '^stx50'],
  ['^N225', '닛케이225', '^nkx'],
];
const FX = [
  ['KRW=X', '달러/원', 'usdkrw', '원'],
  ['EURKRW=X', '유로/원', 'eurkrw', '원'],
  ['EURUSD=X', '유로/달러', 'eurusd', ''],
  ['USDJPY=X', '달러/엔', 'usdjpy', '엔'],
  ['JPYKRW=X', '엔/원(100엔)', '', '원'],
  ['DX-Y.NYB', '달러인덱스', '', ''],
];
const UST = [['^TNX', '미 국채 10년', '']];
// 원자재 — 금·원유는 대체투자 심리와 인플레 경로를 같이 읽는 지표.
const COMMODITY = [
  ['GC=F', '금 (온스)', '', '$'],
  ['SI=F', '은 (온스)', '', '$'],
  ['CL=F', 'WTI 원유', '', '$'],
  ['BZ=F', '브렌트유', '', '$'],
];
// 크립토 — 달러 기준(USD)
const CRYPTO = [
  ['BTC-USD', '비트코인', '', '$'],
  ['ETH-USD', '이더리움', '', '$'],
];

// ── 유틸 ────────────────────────────────────────────────
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
export function fmtNum(v, digits = 2) {
  if (v == null) return '–';
  return v.toLocaleString('ko-KR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
export function fmtSigned(v, digits = 2, suffix = '') {
  if (v == null) return '–';
  const s = v > 0 ? '+' : v < 0 ? '−' : '';
  return `${s}${Math.abs(v).toLocaleString('ko-KR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}${suffix}`;
}
// KST 기준 날짜 조각
export function kst(d = new Date()) {
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return {
    ymd: `${k.getUTCFullYear()}.${p(k.getUTCMonth() + 1)}.${p(k.getUTCDate())}`,
    md: `${p(k.getUTCMonth() + 1)}.${p(k.getUTCDate())}`,
    hm: `${p(k.getUTCHours())}:${p(k.getUTCMinutes())}`,
    dow: ['일', '월', '화', '수', '목', '금', '토'][k.getUTCDay()],
    iso: d.toISOString(),
  };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 503/429 는 일시적 레이트리밋이므로 지수 백오프로 재시도한다.
// (구글 뉴스 RSS 는 수집기와 동시에 돌면 곧잘 503 을 돌려준다)
async function getText(url, timeout = 15000, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' }, signal: AbortSignal.timeout(timeout) });
      if (res.ok) return res.text();
      lastErr = new Error(`HTTP ${res.status}`);
      if (![429, 500, 502, 503, 504].includes(res.status)) break;   // 영구 오류는 재시도 무의미
    } catch (e) { lastErr = e; }
    if (i < tries - 1) await sleep(2000 * Math.pow(2, i));
  }
  throw lastErr || new Error('요청 실패');
}
async function getJson(url, timeout = 15000) { return JSON.parse(await getText(url, timeout)); }

// ── 시세: Yahoo Finance 차트 API → 실패 시 stooq CSV ──────
// 두 소스 모두 무료·키 불필요. 종가와 직전 종가를 받아 등락을 계산한다.
export function parseYahooChart(j) {
  const r = ((j || {}).chart || {}).result;
  if (!Array.isArray(r) || !r[0]) return null;
  const meta = r[0].meta || {};
  const closes = (((r[0].indicators || {}).quote || [])[0] || {}).close || [];
  const valid = closes.filter((c) => typeof c === 'number' && isFinite(c));
  // 일봉 종가 계열에서 마지막 값과 그 직전 값을 쓴다.
  // meta.chartPreviousClose 는 '요청 구간 시작 이전의 종가'라 구간을 10일로 잡으면
  // 10일치 등락이 하루 등락으로 둔갑한다 — 절대 쓰지 않는다.
  const last = valid.length ? valid[valid.length - 1] : num(meta.regularMarketPrice);
  let prev = valid.length >= 2 ? valid[valid.length - 2] : null;
  if (prev == null) prev = num(meta.previousClose);
  if (last == null || prev == null || prev === 0) return null;
  return { last, prev, chg: last - prev, chgPct: (last - prev) / prev * 100, src: 'Yahoo Finance' };
}
export function parseStooqCsv(csv) {
  const lines = String(csv).trim().split(/\r?\n/);
  if (lines.length < 2) return null;
  const head = lines[0].toLowerCase().split(',');
  const row = lines[1].split(',');
  const get = (k) => { const i = head.indexOf(k); return i < 0 ? null : parseFloat(row[i]); };
  const close = get('close'), open = get('open');
  if (!isFinite(close) || !isFinite(open)) return null;
  return { last: close, prev: open, chg: close - open, chgPct: (close - open) / open * 100, src: 'Stooq(당일 시가 대비)' };
}
async function quote(symbol, stooqSym) {
  try {
    const j = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1mo&interval=1d`);
    const q = parseYahooChart(j);
    if (q) return q;
    throw new Error('빈 응답');
  } catch (e1) {
    if (!stooqSym) { errors.push(`${symbol}: ${e1.message}`); return null; }
    try {
      return parseStooqCsv(await getText(`https://stooq.com/q/l/?s=${encodeURIComponent(stooqSym)}&f=sd2t2ohlcv&h&e=csv`));
    } catch (e2) { errors.push(`${symbol}: ${e1.message} / stooq ${e2.message}`); return null; }
  }
}
async function quoteList(defs) {
  const out = [];
  for (const [sym, name, fallback, unit] of defs) {
    const q = await quote(sym, fallback);
    // 엔/원은 시장 관행대로 100엔 기준으로 환산해 표기한다.
    const k = /JPYKRW/.test(sym) ? 100 : 1;
    out.push({
      name, symbol: sym, unit: unit || '',
      last: q ? q.last * k : null,
      chg: q ? q.chg * k : null,
      chgPct: q ? q.chgPct : null,
      src: q ? q.src : '',
    });
  }
  return out;
}

// ── SOFR (뉴욕 연준 공개 API) ─────────────────────────────
export function parseNyFed(j) {
  const r = ((j || {}).refRates || [])[0];
  if (!r || !isFinite(r.percentRate)) return null;
  return {
    rate: r.percentRate,
    asOf: r.effectiveDate || '',
    targetFrom: isFinite(r.targetRateFrom) ? r.targetRateFrom : null,
    targetTo: isFinite(r.targetRateTo) ? r.targetRateTo : null,
  };
}
async function nyFed(path, label) {
  try { return parseNyFed(await getJson(`https://markets.newyorkfed.org/api/rates/${path}/last/1.json`)); }
  catch (e) { errors.push(`${label}: ${e.message}`); return null; }
}

// ── SONIA (영란은행 통계 DB, CSV) ─────────────────────────
export function parseBoeCsv(csv) {
  const lines = String(csv).trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return null;
  const last = lines[lines.length - 1].split(',');
  const v = parseFloat(last[last.length - 1]);
  if (!isFinite(v)) return null;
  return { rate: v, asOf: (last[0] || '').replace(/"/g, '').trim() };
}
// BoE 통계 DB 범용 조회 (SONIA=IUDSOIA, 정책금리=IUDBEDR 등)
async function boeSeries(code, label) {
  const from = (() => { const d = new Date(Date.now() - 40 * 86400000); return `${String(d.getDate()).padStart(2, '0')}/${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]}/${d.getFullYear()}`; })();
  const url = `https://www.bankofengland.co.uk/boeapps/iadb/fromshowcolumns.asp?csv.x=yes&Datefrom=${from}&Dateto=now&SeriesCodes=${code}&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N`;
  try { return parseBoeCsv(await getText(url, 20000)); }
  catch (e) { errors.push(`${label}: ${e.message}`); return null; }
}
async function sonia() {
  const from = (() => { const d = new Date(Date.now() - 30 * 86400000); return `${String(d.getDate()).padStart(2, '0')}/${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]}/${d.getFullYear()}`; })();
  const url = `https://www.bankofengland.co.uk/boeapps/iadb/fromshowcolumns.asp?csv.x=yes&Datefrom=${from}&Dateto=now&SeriesCodes=IUDSOIA&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N`;
  try { return parseBoeCsv(await getText(url, 20000)); }
  catch (e) { errors.push(`SONIA: ${e.message}`); return null; }
}

// ── 한국은행 기준금리 (한은 공시 페이지) ──────────────────
// 표의 첫 행이 최근 변경일자·기준금리. 실패 시 값을 만들지 않고 비운다.
export function parseBokBaseRate(html, todayKey = null) {
  const text = String(html).replace(/<[^>]+>/g, '\n').replace(/&nbsp;/g, ' ');
  // 한은 표는 연·월·일·금리가 각각 다른 칸이라 태그를 벗기면 줄바꿈으로 흩어진다.
  // 구분자를 점·년월일뿐 아니라 공백/줄바꿈까지 허용하고, '기준금리' 문구 이후
  // 구간에서만 찾은 뒤 날짜가 가장 최근인 행을 고른다.
  const head = text.search(/기준금리/);
  const scope = head >= 0 ? text.slice(head) : text;
  const re = /(20\d{2})\s*[.년\-\/]?\s*(\d{1,2})\s*[.월\-\/]?\s*(\d{1,2})\s*일?\s*[^\d]{0,30}?(\d\.\d{2})(?!\d)/g;
  let best = null;
  for (const m of scope.matchAll(re)) {
    const [, y, mo, d, r] = m;
    const year = +y, month = +mo, day = +d, rate = parseFloat(r);
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    if (!(rate >= 0 && rate <= 10)) continue;
    const key = year * 10000 + month * 100 + day;
    if (key > 21001231) continue;                                  // 비정상 연도 방어
    // 페이지 상단의 조회일(오늘 날짜)이 변경일자로 잡히는 것을 막는다 —
    // 기준금리 변경일은 과거 날짜다(금통위 당일 변경분은 다음 회차에 반영).
    if (todayKey && key >= todayKey) continue;
    if (!best || key > best.key) best = { key, rate, asOf: `${year}.${String(month).padStart(2, '0')}.${String(day).padStart(2, '0')}` };
  }
  return best ? { rate: best.rate, asOf: best.asOf } : null;
}
const BOK_PAGES = [
  'https://www.bok.or.kr/portal/singl/baseRate/list.do?dataSeCd=01&menuNo=200643',
  'https://www.bok.or.kr/portal/singl/baseRate/progress.do?dataSeCd=01&menuNo=200656',
];
async function bokBaseRate() {
  for (const url of BOK_PAGES) {
    try {
      const html = await getText(url, 20000);
      const t = kst();
      const todayKey = parseInt(t.ymd.replace(/\./g, ''), 10);
      const r = parseBokBaseRate(html, todayKey);
      if (r) return { ...r, src: '한국은행' };
      errors.push(`한국 기준금리: 표를 찾지 못함 (${url.split('/').pop().split('?')[0]}, ${html.length}자)`);
    } catch (e) { errors.push(`한국 기준금리(${url.split('/').pop().split('?')[0]}): ${e.message}`); }
  }
  return null;
}
// 기준금리 전용 뉴스 조회 — 한국은행 페이지가 막혀도 보도 인용으로 채운다.
async function bokRateNews() {
  try {
    const items = parseRss(await getText('https://news.google.com/rss/search?q=' + encodeURIComponent('한국은행 기준금리 연 (동결 OR 인상 OR 인하) when:60d') + '&hl=ko&gl=KR&ceid=KR:ko'));
    return bokFromNews(items);
  } catch (e) { errors.push(`기준금리 보도 인용: ${e.message}`); return null; }
}
// 폴백 — 금통위·기준금리 보도에서 '연 X.XX%' 를 인용한다(출처 링크 포함).
// '3% 초읽기' 같은 정수 표기는 소수 둘째 자리 조건으로 걸러진다.
export function bokFromNews(items) {
  const sorted = (items || []).slice().sort((a, b) => ((a.ts || '') < (b.ts || '') ? 1 : -1));   // 최신 보도 우선
  for (const it of sorted) {
    const t = `${it.title || ''} ${it.desc || ''}`;
    if (!/한국은행|금통위|한은/.test(t)) continue;
    // '2.50%에서 2.75%로 인상' 같은 문장에서는 결과값(뒤의 값)을 써야 한다.
    const m = t.match(/기준금리[^%]{0,40}?(\d\.\d{2})\s*%\s*로/)
           || t.match(/(\d\.\d{2})\s*%\s*로\s*(?:인상|인하|조정|동결)/)
           || t.match(/기준금리[^\d%]{0,14}?(?:연\s*)?(\d\.\d{2})\s*%/);
    if (!m) continue;
    const rate = parseFloat(m[1]);
    if (!(rate >= 0 && rate <= 10)) continue;
    const d = it.ts ? kst(new Date(it.ts)).ymd : '';
    return { rate, asOf: d ? `${d} 보도` : '', src: `${it.source} 보도 인용`, url: it.url };
  }
  return null;
}

// ── SOFR 평균(30/90/180일) — 뉴욕 연준 SOFR Averages & Index ──
// 실무에서 기간물 지표로 쓰는 값이라 O/N 과 함께 보여준다.
export function parseSofrAverages(j) {
  const r = ((j || {}).refRates || [])[0];
  if (!r) return null;
  const pick = (...keys) => { for (const k of keys) if (isFinite(r[k])) return r[k]; return null; };
  const a30 = pick('average30day', 'average30Day', 'thirtyDayAverage');
  const a90 = pick('average90day', 'average90Day', 'ninetyDayAverage');
  const a180 = pick('average180day', 'average180Day', 'oneHundredEightyDayAverage');
  if (a30 == null && a90 == null && a180 == null) return null;
  return { asOf: r.effectiveDate || '', a30, a90, a180 };
}
async function sofrAverages() {
  try { return parseSofrAverages(await getJson('https://markets.newyorkfed.org/api/rates/secured/sofrai/last/1.json')); }
  catch (e) { errors.push(`SOFR 평균: ${e.message}`); return null; }
}

// ── ECB Data Portal (EURIBOR 테너별 · €STR) ────────────────
export function parseEcbCsv(csv) {
  const lines = String(csv).trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return null;
  const head = lines[0].split(',').map((h) => h.replace(/"/g, '').trim().toUpperCase());
  const vi = head.indexOf('OBS_VALUE'), ti = head.indexOf('TIME_PERIOD');
  const row = lines[lines.length - 1].split(',');
  const v = parseFloat((row[vi] || '').replace(/"/g, ''));
  if (!isFinite(v)) return null;
  return { rate: v, asOf: ti >= 0 ? (row[ti] || '').replace(/"/g, '').trim() : '' };
}
// EURIBOR 는 ECB API 에 일별 계열이 없다(월평균만 제공). 일별 공표 페이지를
// 우선 쓰고, 실패하면 ECB 월평균으로 대체하되 '월평균'임을 라벨에 남긴다.
const ECB_MONTHLY = [
  ['EURIBOR 1개월', 'FM/M.U2.EUR.RT.MM.EURIBOR1MD_.HSTA', '1M'],
  ['EURIBOR 3개월', 'FM/M.U2.EUR.RT.MM.EURIBOR3MD_.HSTA', '3M'],
  ['EURIBOR 6개월', 'FM/M.U2.EUR.RT.MM.EURIBOR6MD_.HSTA', '6M'],
  ['EURIBOR 12개월', 'FM/M.U2.EUR.RT.MM.EURIBOR1YD_.HSTA', '12M'],
];
const EURIBOR_TENORS = [
  [/1\s*week/i, '1W'], [/2\s*weeks?/i, '2W'],
  [/1\s*month/i, '1M'], [/3\s*months?/i, '3M'], [/6\s*months?/i, '6M'], [/12\s*months?/i, '12M'],
];
// 공표 페이지 텍스트에서 '테너 + 금리' 쌍만 뽑는다. 많이 쓰는 테너만 남긴다.
export function parseEuriborPage(html) {
  const text = String(html).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  const out = [];
  const re = /Euribor\s*(\d{1,2})\s*(week|weeks|month|months)[^%\d-]{0,40}(-?\d\.\d{2,3})\s*%/gi;
  for (const m of text.matchAll(re)) {
    const label = `${m[1]} ${m[2]}`;
    const hit = EURIBOR_TENORS.find(([re2]) => re2.test(label));
    if (!hit) continue;
    const rate = parseFloat(m[3]);
    if (!(rate > -2 && rate < 15)) continue;
    if (out.some((x) => x.tenor === hit[1])) continue;
    out.push({ tenor: hit[1], rate });
  }
  const order = ['1W', '1M', '3M', '6M', '12M'];
  return out.filter((x) => order.includes(x.tenor)).sort((a, b) => order.indexOf(a.tenor) - order.indexOf(b.tenor));
}
async function ecbSeries(path, label) {
  try {
    return parseEcbCsv(await getText(`https://data-api.ecb.europa.eu/service/data/${path}?lastNObservations=1&format=csvdata`, 20000));
  } catch (e) { errors.push(`${label}: ${e.message}`); return null; }
}
const EURIBOR_PAGES = [
  'https://www.euribor-rates.eu/en/current-euribor-rates/',
  'https://www.global-rates.com/en/interest-rates/euribor/',
];
async function euribor() {
  for (const url of EURIBOR_PAGES) {
    try {
      const rows = parseEuriborPage(await getText(url, 20000));
      if (rows.length) return rows.map((r) => ({ ...r, label: `EURIBOR ${r.tenor}`, asOf: kst().ymd, src: new URL(url).hostname }));
      errors.push(`EURIBOR(${new URL(url).hostname}): 표를 찾지 못함`);
    } catch (e) { errors.push(`EURIBOR(${new URL(url).hostname}): ${e.message}`); }
  }
  // 폴백 — ECB 월평균
  const out = [];
  for (const [label, path, tenor] of ECB_MONTHLY) {
    const r = await ecbSeries(path, label);
    if (r) out.push({ tenor: `${tenor} (월평균)`, label, rate: r.rate, asOf: r.asOf, src: 'ECB 월평균' });
    await sleep(300);
  }
  return out;
}

// ── TONA (일본 무담보 콜 익일물) — 일본은행 일별 공표 ──────
// 시계열 표(전 기간 수록)에서 '날짜 + 값' 쌍을 모아 가장 최근 날짜의 값을 고른다.
// 헤더 근처만 훑으면 표 정렬 방향에 따라 옛 값을 읽을 수 있어, 날짜로 판정한다.
export function parseTonaTable(html) {
  const text = String(html).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  const re = /(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})\s+(▲|-|−)?\s?(\d\.\d{2,3})(?!\d)/g;
  let best = null;
  for (const m of text.matchAll(re)) {
    const key = +m[1] * 10000 + +m[2] * 100 + +m[3];
    const v = parseFloat(m[5]) * (m[4] ? -1 : 1);
    if (!(v >= -1 && v <= 10)) continue;
    if (!best || key > best.key) best = { key, rate: v, asOf: `${m[1]}.${String(m[2]).padStart(2, '0')}.${String(m[3]).padStart(2, '0')}` };
  }
  return best ? { rate: best.rate, asOf: best.asOf } : null;
}
export function parseTona(html) {
  const text = String(html).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  // 일본은행 표기는 국문(無担保コールO/N物)과 영문(Uncollateralized Overnight)이 섞인다.
  const i = text.search(/無担保コール|uncollateralized\s+overnight|call rate.{0,20}overnight/i);
  if (i < 0) return null;
  const win = text.slice(i, i + 400);
  // 표 형태면 날짜와 함께 여러 값이 오므로 마지막(최신) 값을 쓴다.
  const nums = [...win.matchAll(/(▲|-|−)?\s?(\d\.\d{2,3})(?!\d)/g)]
    .map((m) => parseFloat(m[2]) * (m[1] ? -1 : 1))
    .filter((v) => v >= -1 && v <= 10);
  if (!nums.length) return null;
  return { rate: nums[nums.length - 1] };
}
// TONA(무담보 콜 익일물)는 일본은행이 매 영업일 공표한다.
// 1) 공표 인덱스에서 최신 데이터 파일 링크를 찾아 받고,
// 2) 실패하면 BOJ 시계열 통계(mtshtml)에서 콜금리 계열을 훑는다.
const TONA_INDEX = 'https://www.boj.or.jp/en/statistics/market/short/mutan/index.htm';
export function pickTonaLinks(html, base) {
  const out = [];
  for (const m of String(html).matchAll(/href\s*=\s*["']([^"']+\.(?:csv|htm|html))["']/gi)) {
    const href = m[1];
    if (!/mutan|call/i.test(href)) continue;
    if (/index\.htm/i.test(href)) continue;
    try { out.push(new URL(href, base).toString()); } catch {}
  }
  return [...new Set(out)].slice(0, 6);
}
export function parseTonaCsv(text) {
  // 공표 파일은 '일자, 평균金利, 최고, 최저 …' 형태. 마지막 데이터 행의 평균을 쓴다.
  const rows = String(text).trim().split(/\r?\n/).filter((l) => /\d{4}[\/-]\d{1,2}[\/-]\d{1,2}|\d{8}/.test(l));
  for (let i = rows.length - 1; i >= 0; i--) {
    const cells = rows[i].split(/[,\t]/).map((c) => c.replace(/"/g, '').trim());
    for (const c of cells.slice(1)) {
      const v = parseFloat(c);
      if (isFinite(v) && v >= -1 && v <= 10 && /\d\.\d{2,3}/.test(c)) return { rate: v, asOf: cells[0] };
    }
  }
  return null;
}
async function tona() {
  // (1) 공표 인덱스 → 최신 데이터 파일
  try {
    const idx = await getText(TONA_INDEX, 20000, 2);
    const links = pickTonaLinks(idx, TONA_INDEX);
    console.log(`  [TONA] 공표 파일 후보 ${links.length}건: ${links.join(' | ')}`);
    for (const link of links) {
      try {
        const body = await getText(link, 20000, 1);
        const r = /\.csv$/i.test(link) ? parseTonaCsv(body) : (parseTonaTable(body) || parseTona(body) || parseTonaCsv(body));
        if (r) return { rate: r.rate, asOf: r.asOf || kst().ymd, src: '일본은행' };
      } catch (e) { console.log(`  [TONA] ${link} 실패: ${e.message}`); }
    }
  } catch (e) { errors.push(`TONA 공표 인덱스: ${e.message}`); }

  // (2) BOJ 시계열 통계에서 콜금리 계열 탐색 (fm08 은 환율이었음 — 제목으로 판별)
  for (const code of ['fm01', 'fm02', 'fm03', 'fm04', 'fm05', 'fm06', 'fm07']) {
    const url = `https://www.stat-search.boj.or.jp/ssi/mtshtml/${code}_d_1_en.html`;
    try {
      const html = await getText(url, 20000, 1);
      const t = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      const isCall = /call rate|uncollateralized/i.test(t);
      console.log(`  [TONA] ${code}: ${isCall ? '콜금리 계열' : '아님'} — ${t.slice(80, 190)}`);
      if (!isCall) continue;
      const r = parseTonaTable(html) || parseTona(html);
      if (r) return { ...r, asOf: r.asOf || kst().ymd, src: '일본은행' };
    } catch (e) { console.log(`  [TONA] ${code} 실패: ${e.message}`); }
  }
  errors.push('TONA: 일본은행 공표에서 값을 찾지 못함');
  return null;
}

// ── 환헤지 비용 · 스왑포인트 ───────────────────────────────
// 금리평형(covered interest parity)으로 산출한다.
//   선물환율 = 현물환율 × (1 + i_KRW×d/360) / (1 + i_외화×d/360)
//   스왑포인트 = 선물환율 − 현물환율  ≈  현물 × (i_KRW − i_외화) × d/360
// KRW 금리가 외화 금리보다 낮으면 스왑포인트가 음(−)이고, 원화 투자자가 외화
// 자산을 환헤지할 때 그 차이만큼 연 단위 비용이 발생한다.
const HEDGE_TENORS = [['1M', 30], ['3M', 90], ['6M', 180], ['1Y', 360]];
export function buildHedgeLeg(ccy, spot, krwRate, foreignRate, baseLabel) {
  if (spot == null || krwRate == null || foreignRate == null) return null;
  const diff = krwRate - foreignRate;                       // %p (원화금리 − 외화금리)
  const points = HEDGE_TENORS.map(([tenor, days]) => {
    const fwd = spot * (1 + krwRate / 100 * days / 360) / (1 + foreignRate / 100 * days / 360);
    return { tenor, days, point: fwd - spot, forward: fwd };
  });
  return {
    ccy, spot, krwRate, foreignRate, baseLabel,
    diffPct: diff,
    annualPct: diff,                                        // 연환산 헤지 손익(+수취 / −비용)
    points,
  };
}

// ── 주요 이슈 (구글 뉴스 RSS) ─────────────────────────────
const ISSUE_QUERIES = [
  '코스피 마감 when:2d',
  '뉴욕증시 마감 when:2d',
  '원달러 환율 마감 when:2d',
  '(FOMC OR 금통위 OR 기준금리) when:3d',
  '(국채 금리 OR 채권시장) 마감 when:2d',
];
export function parseRss(xml) {
  const items = [];
  for (const b of String(xml).match(/<item>[\s\S]*?<\/item>/gi) || []) {
    const pick = (n) => { const m = b.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`, 'i')); return m ? m[1] : ''; };
    const strip = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
    let title = strip(pick('title'));
    const link = strip(pick('link'));
    const pub = strip(pick('pubDate'));
    const desc = strip(pick('description'));
    let source = strip((b.match(/<source[^>]*>([\s\S]*?)<\/source>/i) || [])[1] || '');
    const dash = title.lastIndexOf(' - ');
    if (dash > 0) { if (!source) source = title.slice(dash + 3).trim(); title = title.slice(0, dash).trim(); }
    if (title && link) items.push({ title, url: link, source: source || '출처 미상', desc, ts: pub ? new Date(pub).toISOString() : '' });
  }
  return items;
}
async function issues() {
  const out = [], seen = new Set();
  for (const q of ISSUE_QUERIES) {
    try {
      const items = parseRss(await getText(`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=ko&gl=KR&ceid=KR:ko`));
      for (const it of items.slice(0, 3)) {
        const key = it.title.replace(/[\s\W]/g, '').slice(0, 20);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(it);
      }
    } catch (e) { errors.push(`이슈(${q}): ${e.message}`); }
    await sleep(700);                       // 연속 호출 간 간격 — RSS 레이트리밋 회피
  }
  return out.sort((a, b) => (a.ts < b.ts ? 1 : -1)).slice(0, 8);
}

// ── 문장 생성 (음슴체) ────────────────────────────────────
// 모든 문장은 위에서 받아온 수치만 사용한다.
// 관찰 포인트 — 데이터가 실제로 만든 신호만 담는다(없으면 빈 배열).
export function buildWatch(d) {
  const w = [];
  const kospi = d.kr.find((x) => x.name === '코스피');
  const usdkrw = d.fx.find((x) => x.name === '달러/원');
  const spx = d.global.find((x) => x.name === 'S&P 500');
  if (kospi && kospi.chgPct != null && Math.abs(kospi.chgPct) >= 1.5) {
    w.push(`코스피가 하루 ${fmtSigned(kospi.chgPct, 2, '%')} 움직여 변동성이 확대됐음 — 국내 수급 방향 확인이 필요함`);
  }
  if (spx && kospi && spx.chgPct != null && kospi.chgPct != null && spx.chgPct * kospi.chgPct < 0) {
    w.push('미국 증시와 국내 증시가 반대 방향으로 마감해 디커플링이 나타났음 — 원인 확인이 필요함');
  }
  if (usdkrw && usdkrw.last != null) {
    if (usdkrw.last >= 1400) w.push(`달러/원이 ${fmtNum(usdkrw.last, 2)}원으로 1,400원대에 있음 — 해외 대체투자 환헤지 비용 점검이 필요함`);
    else if (Math.abs(usdkrw.chg || 0) >= 10) w.push(`달러/원이 하루 ${fmtSigned(usdkrw.chg, 2, '원')} 급변했음 — 기존 헤지 포지션 롤 비용 점검이 필요함`);
  }
  const ust = (d.ust || []).find((x) => x.name === '미 국채 10년');
  if (ust && ust.chg != null && Math.abs(ust.chg) >= 0.08) {
    w.push(`미 국채 10년 금리가 ${fmtSigned(ust.chg * 100, 0, 'bp')} 움직였음 — 사모대출·인프라 밸류에이션 영향 점검이 필요함`);
  }
  const evt = (d.issues || []).filter((i) => /FOMC|금통위|기준금리|CPI|고용지표|잭슨홀/.test(i.title));
  if (evt.length) w.push(`금리 이벤트 관련 보도가 ${evt.length}건 있었음 — 정책 경로 코멘트 확인이 필요함`);
  return w;
}
// 한줄 요약 — 핵심 3개 축(국내·해외·환율)을 한 문장으로.
export function buildSummary(d) {
  const kospi = d.kr.find((x) => x.name === '코스피');
  const spx = d.global.find((x) => x.name === 'S&P 500');
  const usdkrw = d.fx.find((x) => x.name === '달러/원');
  const parts = [];
  if (kospi && kospi.chgPct != null) parts.push(`코스피 ${fmtSigned(kospi.chgPct, 2, '%')}`);
  if (spx && spx.chgPct != null) parts.push(`S&P 500 ${fmtSigned(spx.chgPct, 2, '%')}`);
  if (usdkrw && usdkrw.last != null) parts.push(`달러/원 ${fmtNum(usdkrw.last, 2)}원(${fmtSigned(usdkrw.chg, 2, '원')})`);
  if (!parts.length) return '전일 시세를 받지 못해 요약을 만들지 못했음 — 다음 회차에 재수집함';
  return `${parts.join(' · ')} 으로 마감했음`;
}

// ── 한줄 요약: 시황 뉴스에 근거해 작성 ──────────────────
// 숫자만 나열하는 대신 "무엇 때문에 움직였는지"를 헤드라인에서 가져온다.
// (선택) Gemini 키가 있으면 헤드라인+수치만 근거로 한 문장을 쓰게 하고,
// 없거나 실패하면 헤드라인을 그대로 인용하는 결정적 폴백을 쓴다.
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
async function llmSummary(facts) {
  if (!GEMINI_API_KEY) return null;
  const prompt = [
    '아래는 오늘 아침 시황 브리핑의 실제 데이터다.',
    '이 자료에 있는 내용만 근거로, 전일 시장을 설명하는 한국어 요약을 1~2문장으로 써라.',
    '규칙:',
    '- 반드시 "음/슴체"로 끝낼 것 (예: ~했음, ~였음).',
    '- 지수 등락의 원인을 헤드라인에서 찾아 먼저 쓰고, 수치는 뒤에 짧게 붙일 것.',
    '- 자료에 없는 사실·수치·고유명사를 절대 만들지 말 것.',
    '- 따옴표나 머리기호 없이 문장만 출력할 것.',
    '',
    '[수치]', facts.numbers,
    '', '[헤드라인]', facts.headlines,
  ].join('\n');
  for (const model of GEMINI_MODELS) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // 사고형 모델은 응답 토큰을 추론에 먼저 쓰므로 예산을 넉넉히 준다
        // (부족하면 parts 가 비어 돌아와 매번 폴백으로 떨어진다).
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 1200 } }),
        signal: AbortSignal.timeout(25000),
      });
      if (!res.ok) { console.warn(`  [요약] ${model} HTTP ${res.status}`); continue; }
      const j = await res.json();
      const parts = ((((j.candidates || [])[0] || {}).content || {}).parts || []);
      const t = parts.map((p) => p.text || '').join(' ');
      const line = t.trim().split('\n').map((x) => x.trim()).filter(Boolean).pop() || '';
      if (line.length > 10 && /(음|슴|함)[.。]?$/.test(line)) return line.replace(/[.。]$/, '');
      console.warn(`  [요약] ${model} 형식 불일치 — finish=${(j.candidates || [{}])[0].finishReason || '?'} text="${t.slice(0, 60)}"`);
    } catch (e) { console.warn(`  [요약] ${model} ${e.message}`); }
  }
  return null;
}
// 결정적 폴백 — 대표 헤드라인을 인용하고 수치를 덧붙인다(창작 없음).
export function headlineSummary(issues, numbers, lead) {
  const list = issues || [];
  if (!list.length) return numbers ? `${numbers} 으로 마감했음` : '전일 시세를 받지 못해 요약을 만들지 못했음';
  // lead = { market:'국내'|'해외', dir:'하락'|'상승' } — 그날 지배적인 움직임.
  const DOWN = /급락|하락|폭락|약세|내림|조정|충격|下落/, UP = /급등|상승|강세|반등|랠리|사상 최고/;
  const KR = /코스피|코스닥|국내 증시|원화|서울 증시/, GL = /뉴욕|나스닥|다우|S&P|미국 증시|기술주|유럽 증시/;
  const score = (t) => {
    let sc = 0;
    if (lead) {
      if (lead.market === '국내' && KR.test(t)) sc += 3;
      if (lead.market === '해외' && GL.test(t)) sc += 3;
      if (lead.dir === '하락' && DOWN.test(t)) sc += 2;
      if (lead.dir === '상승' && UP.test(t)) sc += 2;
    }
    if (/마감/.test(t)) sc += 1;
    if (/선물|프리뷰|전망|예상/.test(t)) sc -= 2;        // 장 전 예측 기사보다 마감 기사를 우선
    return sc;
  };
  const best = list.slice().sort((a, b) => score(b.title) - score(a.title))[0];
  return `"${best.title}"(${best.source}) — ${numbers} 으로 마감했음`;
}

// ── 5년 일별 추이 (그래프용) ───────────────────────────────
// 앱은 브라우저에서 시세 API 를 직접 못 부르므로(CORS), 여기서 미리 받아
// history.json 으로 저장한다. 날짜(YYYYMMDD)와 종가만 담아 가볍게 유지한다.
export function parseHistory(j) {
  const r = ((j || {}).chart || {}).result;
  if (!Array.isArray(r) || !r[0]) return null;
  const ts = r[0].timestamp || [];
  const closes = (((r[0].indicators || {}).quote || [])[0] || {}).close || [];
  const d = [], c = [];
  for (let i = 0; i < ts.length; i++) {
    const v = closes[i];
    if (typeof v !== 'number' || !isFinite(v)) continue;
    const dt = new Date(ts[i] * 1000);
    d.push(dt.getUTCFullYear() * 10000 + (dt.getUTCMonth() + 1) * 100 + dt.getUTCDate());
    c.push(Math.round(v * 1000) / 1000);
  }
  return d.length ? { d, c } : null;
}
async function history(defs) {
  const series = {};
  for (const [sym, name] of defs) {
    try {
      const j = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=5y&interval=1d`, 25000);
      const h = parseHistory(j);
      if (h) { const k = /JPYKRW/.test(sym) ? 100 : 1; series[sym] = { name, d: h.d, c: k === 1 ? h.c : h.c.map((v) => Math.round(v * k * 1000) / 1000) }; }
      else errors.push(`추이(${name}): 빈 응답`);
    } catch (e) { errors.push(`추이(${name}): ${e.message}`); }
    await sleep(200);
  }
  return series;
}

// ── 메인 ────────────────────────────────────────────────
async function main() {
  if (process.argv.includes('--selftest')) return selftest();
  const now = kst();
  const [kr, global, fx, ust, commodity, crypto, sofr, sofrAvg, effr, so, boeBank, estr, eurib, jpTona, bok, iss] = [
    await quoteList(KR_INDEX),
    await quoteList(GL_INDEX),
    await quoteList(FX),
    await quoteList(UST),
    await quoteList(COMMODITY),
    await quoteList(CRYPTO),
    await nyFed('secured/sofr', 'SOFR'),
    await sofrAverages(),
    await nyFed('unsecured/effr', 'EFFR'),
    await sonia(),
    await boeSeries('IUDBEDR', '영국 정책금리'),
    await ecbSeries('EST/B.EU000A2X2A25.WT', '€STR'),
    await euribor(),
    await tona(),
    await bokBaseRate(),
    await issues(),
  ];
  // 한국은행 페이지 파싱이 실패하면 금통위 보도에서 인용한다(값을 지어내지 않음).
  const bokRate = bok || bokFromNews(iss) || await bokRateNews();

  // 테너별 금리표 — 실무에서 자주 쓰는 구간 위주.
  const tenorRates = [];
  if (sofr) tenorRates.push({ group: 'SOFR (USD)', tenor: 'O/N', rate: sofr.rate, asOf: sofr.asOf, src: 'New York Fed' });
  if (sofrAvg) {
    if (sofrAvg.a30 != null) tenorRates.push({ group: 'SOFR (USD)', tenor: '30일 평균', rate: sofrAvg.a30, asOf: sofrAvg.asOf, src: 'New York Fed' });
    if (sofrAvg.a90 != null) tenorRates.push({ group: 'SOFR (USD)', tenor: '90일 평균', rate: sofrAvg.a90, asOf: sofrAvg.asOf, src: 'New York Fed' });
    if (sofrAvg.a180 != null) tenorRates.push({ group: 'SOFR (USD)', tenor: '180일 평균', rate: sofrAvg.a180, asOf: sofrAvg.asOf, src: 'New York Fed' });
  }
  if (so) tenorRates.push({ group: 'SONIA (GBP)', tenor: 'O/N', rate: so.rate, asOf: so.asOf, src: 'Bank of England' });
  if (boeBank) tenorRates.push({ group: 'SONIA (GBP)', tenor: '정책금리', rate: boeBank.rate, asOf: boeBank.asOf, src: 'Bank of England' });
  if (estr) tenorRates.push({ group: 'EURIBOR·€STR (EUR)', tenor: '€STR O/N', rate: estr.rate, asOf: estr.asOf, src: 'ECB' });
  for (const e of eurib) tenorRates.push({ group: 'EURIBOR·€STR (EUR)', tenor: e.tenor, rate: e.rate, asOf: e.asOf, src: e.src || 'ECB' });
  if (jpTona) tenorRates.push({ group: 'TONA (JPY)', tenor: 'O/N', rate: jpTona.rate, asOf: jpTona.asOf, src: '일본은행' });

  // 환헤지 비용·스왑포인트 — 원화 투자자 기준.
  const spotOf = (n) => { const x = fx.find((f) => f.name === n); return x ? x.last : null; };
  const eur3m = (eurib.find((e) => e.tenor === '3M') || {}).rate;
  const usd3m = sofrAvg && sofrAvg.a90 != null ? sofrAvg.a90 : (sofr ? sofr.rate : null);
  const krwRate = bokRate ? bokRate.rate : null;
  const hedge = {
    krwRate,
    krwLabel: bokRate ? `한국 기준금리 ${bokRate.rate.toFixed(2)}%` : '',
    legs: [
      buildHedgeLeg('USD', spotOf('달러/원'), krwRate, usd3m, sofrAvg && sofrAvg.a90 != null ? 'SOFR 90일 평균' : 'SOFR O/N'),
      buildHedgeLeg('EUR', spotOf('유로/원'), krwRate, eur3m != null ? eur3m : (estr ? estr.rate : null), eur3m != null ? 'EURIBOR 3개월' : '€STR O/N'),
    ].filter(Boolean),
  };

  const data = {
    asOf: `${now.ymd}(${now.dow}) ${now.hm} KST`,
    updatedAt: now.ymd,
    dateKey: now.ymd.replace(/\./g, ''),
    ts: now.iso,
    kr, global, fx, ust, commodity, crypto,
    tenorRates,
    hedge,
    rates: {
      sofr: sofr ? { rate: sofr.rate, asOf: sofr.asOf, label: 'SOFR (미국 담보부 익일물)', src: 'New York Fed' } : null,
      sonia: so ? { rate: so.rate, asOf: so.asOf, label: 'SONIA (영국 무담보 익일물)', src: 'Bank of England' } : null,
      estr: estr ? { rate: estr.rate, asOf: estr.asOf, label: '€STR (유로 무담보 익일물)', src: 'ECB' } : null,
      tona: jpTona ? { rate: jpTona.rate, asOf: jpTona.asOf, label: 'TONA (일본 무담보 콜 익일물)', src: '일본은행' } : null,
      us: effr ? {
        effr: effr.rate,
        target: (effr.targetFrom != null && effr.targetTo != null) ? `${effr.targetFrom.toFixed(2)}~${effr.targetTo.toFixed(2)}%` : '',
        asOf: effr.asOf, label: '미국 기준금리(FOMC 목표범위) · EFFR', src: 'New York Fed',
      } : null,
      kr: bokRate ? { rate: bokRate.rate, asOf: bokRate.asOf, label: '한국 기준금리(한국은행)', src: bokRate.src || '한국은행', url: bokRate.url || '' } : null,
    },
    issues: iss,
    errors,
  };
  data.watch = buildWatch(data);
  // 한줄 요약 — 수치 나열 대신 시황 뉴스에 근거해 쓴다.
  const numbers = buildSummary(data).replace(/ 으로 마감했음$/, '');
  const headlines = (iss || []).slice(0, 6).map((i) => `- ${i.title} (${i.source})`).join('\n');
  const krMove = (kr.find((x) => x.name === '코스피') || {}).chgPct;
  const glMove = (global.find((x) => x.name === 'S&P 500') || {}).chgPct;
  const lead = (krMove == null && glMove == null) ? null : {
    market: Math.abs(krMove || 0) >= Math.abs(glMove || 0) ? '국내' : '해외',
    dir: (Math.abs(krMove || 0) >= Math.abs(glMove || 0) ? (krMove || 0) : (glMove || 0)) < 0 ? '하락' : '상승',
  };
  data.summary = (await llmSummary({ numbers, headlines })) || headlineSummary(iss, numbers, lead);
  data.summarySource = (iss || []).slice(0, 3).map((i) => ({ title: i.title, source: i.source, url: i.url }));

  await writeFile(new URL('../market.json', import.meta.url), JSON.stringify(data, null, 0));

  // 5년 일별 추이 — 앱의 지표 클릭 그래프용 (하루 1회 갱신)
  const hist = await history([...KR_INDEX, ...GL_INDEX, ...FX, ...UST, ...COMMODITY, ...CRYPTO]);
  await writeFile(new URL('../history.json', import.meta.url), JSON.stringify({ updatedAt: now.ymd, src: 'Yahoo Finance', series: hist }, null, 0));
  console.log(`history.json: ${Object.keys(hist).length}개 계열`);

  // ── 일자별 아카이브 ──────────────────────────────────────
  // briefs/YYYYMMDD.json 으로 쌓고 briefs/index.json 에 목록을 유지한다.
  await mkdir(new URL('../briefs/', import.meta.url), { recursive: true });
  await writeFile(new URL(`../briefs/${data.dateKey}.json`, import.meta.url), JSON.stringify(data, null, 0));
  let index = [];
  try { index = JSON.parse(await readFile(new URL('../briefs/index.json', import.meta.url), 'utf8')); } catch {}
  if (!Array.isArray(index)) index = [];
  index = index.filter((x) => x && x.dateKey !== data.dateKey);
  index.unshift({ dateKey: data.dateKey, date: data.updatedAt, title: `${data.dateKey} 시황`, summary: data.summary, ts: data.ts });
  index.sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1));
  index = index.slice(0, 120);
  await writeFile(new URL('../briefs/index.json', import.meta.url), JSON.stringify(index, null, 0));

  console.log(`market.json 갱신: 국내 ${kr.length} · 해외 ${global.length} · 환율 ${fx.length} · 원자재 ${commodity.length} · 크립토 ${crypto.length} · 금리 ${tenorRates.length} · 헤지 ${hedge.legs.length} · 이슈 ${iss.length} · 실패 ${errors.length}`);
  if (errors.length) console.warn('수집 실패 항목:', errors.join(' | '));
  console.log('요약:', data.summary);
}

function selftest() {
  // chartPreviousClose(구간 시작 이전 종가)를 쓰면 10일치 등락이 하루 등락으로
  // 둔갑한다 — 반드시 직전 일봉 종가(3188.42)와 비교해야 한다.
  const chart = { chart: { result: [{ meta: { regularMarketPrice: 3214.55, chartPreviousClose: 2900.0, previousClose: 3188.42 }, indicators: { quote: [{ close: [3100.0, 3188.42, 3214.55] }] } }] } };
  const q = parseYahooChart(chart);
  const ok1 = q && q.last === 3214.55 && q.prev === 3188.42 && Math.abs(q.chgPct - 0.8195) < 0.01;

  const csv = 'Symbol,Date,Time,Open,High,Low,Close,Volume\n^SPX,2026-08-21,22:00:00,6100.00,6180,6090,6150.00,0';
  const st = parseStooqCsv(csv);
  const ok2 = st && st.last === 6150 && Math.abs(st.chg - 50) < 1e-9;

  const ny = parseNyFed({ refRates: [{ effectiveDate: '2026-08-21', percentRate: 4.33, targetRateFrom: 4.25, targetRateTo: 4.5 }] });
  const ok3 = ny && ny.rate === 4.33 && ny.targetTo === 4.5;

  const boe = parseBoeCsv('Date,IUDSOIA\n20 Aug 2026,4.1900\n21 Aug 2026,4.1850');
  const ok4 = boe && boe.rate === 4.185 && boe.asOf === '21 Aug 2026';

  const bok = parseBokBaseRate('<table><tr><td>2026.05.29</td><td>2.25</td></tr><tr><td>2026.02.25</td><td>2.50</td></tr></table>');
  // 연·월·일이 각각 다른 칸에 있는 실제 한은 표 구조 (가장 최근 행을 골라야 함)
  const bokCells = parseBokBaseRate('<h2>한국은행 기준금리</h2><table><tr><td>2026</td><td>02</td><td>25</td><td>2.50</td></tr><tr><td>2026</td><td>07</td><td>10</td><td>2.75</td></tr></table>');
  // 페이지 상단 조회일(오늘)이 변경일자로 잡히면 안 된다 — 과거 변경일을 골라야 함
  const bokToday = parseBokBaseRate('<h2>기준금리</h2><p>조회일 2026.08.24 기준 2.75</p><table><tr><td>2026.07.10</td><td>2.75</td></tr></table>', 20260824);
  const ok5 = bok && bok.rate === 2.25 && bok.asOf === '2026.05.29'
    && bokCells && bokCells.rate === 2.75 && bokCells.asOf === '2026.07.10'
    && bokToday && bokToday.asOf === '2026.07.10';

  const bokNews = bokFromNews([
    { title: '한은 금통위, 기준금리 연 2.75%로 동결', source: '연합뉴스', url: 'https://x/1', ts: '2026-08-14T00:00:00.000Z' },
    { title: '한국은행 기준금리 연 2.50% 유지', source: '옛기사', url: 'https://x/0', ts: '2026-05-01T00:00:00.000Z' },
  ]);
  // 인상 문장에서는 결과값(3.00%)을 써야 한다 — 기존값(2.75%)이 아니라
  const bokHike = bokFromNews([{ title: '한은, 기준금리 2.75%에서 3.00%로 인상', source: '연합뉴스', url: 'https://x/3', ts: '2026-08-20T00:00:00.000Z' }]);
  const bokNoise = bokFromNews([{ title: '기준금리 3% 초읽기…영끌족 부담', source: '한국경제', url: 'https://x/2' }]);
  const ok8 = bokNews && bokNews.rate === 2.75 && bokNoise === null && bokHike && bokHike.rate === 3.00;

  const rss = parseRss('<rss><channel><item><title>코스피 2% 급등 마감 - 한국경제</title><link>https://x/1</link><pubDate>Fri, 21 Aug 2026 08:00:00 GMT</pubDate><source>한국경제</source></item></channel></rss>');
  const ok6 = rss.length === 1 && rss[0].title === '코스피 2% 급등 마감' && rss[0].source === '한국경제';

  const d = {
    kr: [{ name: '코스피', last: 3214.55, chg: 26.13, chgPct: 0.82 }],
    global: [{ name: 'S&P 500', last: 6150, chg: -30, chgPct: -0.49 }],
    fx: [{ name: '달러/원', last: 1412.4, chg: 12.4, chgPct: 0.89, unit: '원' }],
    ust: [{ name: '미 국채 10년', last: 4.32, chg: 0.1 }],
    issues: [{ title: 'FOMC 의사록 공개' }],
  };
  const watch = buildWatch(d), summary = buildSummary(d);
  // 음슴체 확인 — 생성 문장은 모두 '음/슴/함'으로 끝나야 한다.
  const endsOk = [summary, ...watch].every((t) => /(음|슴|함)$/.test(t.replace(/\s+$/, '')));
  const ok7 = watch.length >= 3 && endsOk && /코스피 \+0\.82%/.test(summary);

  console.log('watch:', watch.join('\n       '));
  console.log('요약 :', summary);
  // EURIBOR 일별 공표 페이지 파싱
  const eur = parseEuriborPage('<table><tr><td>Euribor 1 week</td><td>2.012 %</td></tr><tr><td>Euribor 1 month</td><td>2.045 %</td></tr><tr><td>Euribor 3 months</td><td>2.153 %</td></tr><tr><td>Euribor 6 months</td><td>2.244 %</td></tr><tr><td>Euribor 12 months</td><td>2.401 %</td></tr></table>');
  const ok13 = eur.length === 5 && eur[0].tenor === '1W' && eur[2].tenor === '3M' && eur[2].rate === 2.153 && eur[4].tenor === '12M';
  console.log('euribor:', JSON.stringify(eur.map(x => [x.tenor, x.rate])));

  // ECB CSV (EURIBOR·€STR)
  const ecb = parseEcbCsv('KEY,FREQ,TIME_PERIOD,OBS_VALUE\n"FM.D...",D,2026-08-21,2.153');
  const ok9 = ecb && ecb.rate === 2.153 && ecb.asOf === '2026-08-21';

  // SOFR 평균(30/90/180일)
  const avg = parseSofrAverages({ refRates: [{ effectiveDate: '2026-08-21', average30day: 3.61, average90day: 3.58, average180day: 3.55 }] });
  const ok10 = avg && avg.a90 === 3.58 && avg.a180 === 3.55;

  // TONA — 일본은행 표기의 ▲(마이너스)까지 해석
  const tona1 = parseTona('<td>無担保コールＯ／Ｎ物レート</td><td>0.478</td>');
  const tona2 = parseTona('<td>無担保コール</td><td>▲0.005</td>');
  const ok11 = tona1 && tona1.rate === 0.478 && tona2 && tona2.rate === -0.005;

  // 시계열 표에서는 날짜가 가장 최근인 행을 골라야 한다(정렬 방향과 무관하게)
  const tonaTbl = parseTonaTable('<tr><td>1990/03/20</td><td>7.250</td></tr><tr><td>2026/08/21</td><td>0.478</td></tr><tr><td>2026/08/20</td><td>0.477</td></tr>');
  const ok15 = tonaTbl && tonaTbl.rate === 0.478 && tonaTbl.asOf === '2026.08.21';

  // TONA 공표 CSV — 마지막 행의 평균금리를 읽는다
  const tonaCsv = parseTonaCsv('Date,Average,High,Low\n2026/08/21,0.477,0.480,0.470\n2026/08/22,0.478,0.481,0.472');
  const ok14 = tonaCsv && tonaCsv.rate === 0.478 && tonaCsv.asOf === '2026/08/22';

  // 헤지 스왑포인트 — 원화금리가 낮으면 스왑포인트는 음(−)이고 헤지는 비용이다
  const leg = buildHedgeLeg('USD', 1380, 2.75, 3.60, 'SOFR 90일 평균');
  const p3m = leg.points.find((x) => x.tenor === '3M');
  const ok12 = leg && Math.abs(leg.annualPct - (-0.85)) < 1e-9 && p3m.point < 0 && Math.abs(p3m.point - (-2.90)) < 0.2;
  console.log('헤지 :', JSON.stringify({ diff: leg.annualPct.toFixed(2), points: leg.points.map((x) => [x.tenor, +x.point.toFixed(2)]) }));

  const hist = parseHistory({ chart: { result: [{ timestamp: [1755993600, 1756080000], indicators: { quote: [{ close: [3200.123456, null] }] } }] } });
  const ok16 = hist && hist.d.length === 1 && hist.c[0] === 3200.123;

  const hs = headlineSummary([{ title: '딥시크 충격에 기술주 급락', source: '연합뉴스' }], '코스피 −2.34% · 나스닥 −3.10%');
  const hs2 = headlineSummary([
    { title: 'S&P500 선물, 조정 후 소폭 상승 전망', source: 'KB' },
    { title: '코스피 3% 급락 마감…외국인 매도', source: '연합뉴스' },
  ], '코스피 −3.23%', { market: '국내', dir: '하락' });
  const ok17 = /딥시크/.test(hs) && /마감했음$/.test(hs) && /코스피 3% 급락/.test(hs2);
  console.log('요약(지배적 움직임):', hs2);
  console.log('요약(폴백):', hs);

  const all = ok16 && ok17 && ok1 && ok2 && ok3 && ok4 && ok5 && ok6 && ok7 && ok8 && ok9 && ok10 && ok11 && ok12 && ok13 && ok14 && ok15;
  console.log(all ? '\nSELFTEST PASS' : `\nSELFTEST FAIL (${[ok1, ok2, ok3, ok4, ok5, ok6, ok7, ok8, ok9, ok10, ok11, ok12, ok13, ok14, ok15, ok16, ok17].join(',')})`);
  if (!all) process.exit(1);
}

if (process.argv[1] && process.argv[1].endsWith('daily-brief.mjs')) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
