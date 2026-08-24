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
import { writeFile, readFile } from 'fs/promises';

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
  ['EURUSD=X', '유로/달러', 'eurusd', ''],
  ['USDJPY=X', '달러/엔', 'usdjpy', '엔'],
  ['DX-Y.NYB', '달러인덱스', '', ''],
];
const UST = [['^TNX', '미 국채 10년', '']];

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
async function getText(url, timeout = 15000) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' }, signal: AbortSignal.timeout(timeout) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
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
    out.push({ name, symbol: sym, unit: unit || '', last: q ? q.last : null, chg: q ? q.chg : null, chgPct: q ? q.chgPct : null, src: q ? q.src : '' });
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
async function sonia() {
  const from = (() => { const d = new Date(Date.now() - 30 * 86400000); return `${String(d.getDate()).padStart(2, '0')}/${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]}/${d.getFullYear()}`; })();
  const url = `https://www.bankofengland.co.uk/boeapps/iadb/fromshowcolumns.asp?csv.x=yes&Datefrom=${from}&Dateto=now&SeriesCodes=IUDSOIA&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N`;
  try { return parseBoeCsv(await getText(url, 20000)); }
  catch (e) { errors.push(`SONIA: ${e.message}`); return null; }
}

// ── 한국은행 기준금리 (한은 공시 페이지) ──────────────────
// 표의 첫 행이 최근 변경일자·기준금리. 실패 시 값을 만들지 않고 비운다.
export function parseBokBaseRate(html) {
  const text = String(html).replace(/<[^>]+>/g, '\n').replace(/&nbsp;/g, ' ');
  const m = text.match(/(\d{4})\s*[.년]\s*(\d{1,2})\s*[.월]\s*(\d{1,2})[^\d]{0,40}?(\d\.\d{2})/);
  if (!m) return null;
  const rate = parseFloat(m[4]);
  if (!(rate >= 0 && rate <= 10)) return null;
  return { rate, asOf: `${m[1]}.${String(m[2]).padStart(2, '0')}.${String(m[3]).padStart(2, '0')}` };
}
async function bokBaseRate() {
  try {
    const r = parseBokBaseRate(await getText('https://www.bok.or.kr/portal/singl/baseRate/list.do?dataSeCd=01&menuNo=200643', 20000));
    if (r) return { ...r, src: '한국은행' };
    errors.push('한국 기준금리: 한국은행 페이지에서 표를 찾지 못함');
  } catch (e) { errors.push(`한국 기준금리: ${e.message}`); }
  return null;
}
// 폴백 — 금통위·기준금리 보도에서 '연 X.XX%' 를 인용한다(출처 링크 포함).
// '3% 초읽기' 같은 정수 표기는 소수 둘째 자리 조건으로 걸러진다.
export function bokFromNews(items) {
  for (const it of items || []) {
    const t = `${it.title || ''}`;
    if (!/한국은행|금통위|한은/.test(t)) continue;
    const m = t.match(/기준금리[^\d%]{0,14}?(\d\.\d{2})\s*%/);
    if (m) {
      const rate = parseFloat(m[1]);
      if (rate >= 0 && rate <= 10) return { rate, asOf: '', src: `${it.source} 보도 인용`, url: it.url };
    }
  }
  return null;
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
    let source = strip((b.match(/<source[^>]*>([\s\S]*?)<\/source>/i) || [])[1] || '');
    const dash = title.lastIndexOf(' - ');
    if (dash > 0) { if (!source) source = title.slice(dash + 3).trim(); title = title.slice(0, dash).trim(); }
    if (title && link) items.push({ title, url: link, source: source || '출처 미상', ts: pub ? new Date(pub).toISOString() : '' });
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
  }
  return out.sort((a, b) => (a.ts < b.ts ? 1 : -1)).slice(0, 8);
}

// ── 문장 생성 (음슴체) ────────────────────────────────────
// 모든 문장은 위에서 받아온 수치만 사용한다.
// 받침 유무에 따라 조사를 고른다 ('코스피은' 같은 어색한 문장 방지).
export function josa(word, withBatchim, without) {
  const c = String(word).trim().slice(-1).charCodeAt(0);
  const hangul = c >= 0xac00 && c <= 0xd7a3;
  const has = hangul ? (c - 0xac00) % 28 !== 0 : /[0-9a-zA-Z]/.test(String.fromCharCode(c));
  return has ? withBatchim : without;
}
export function lineIndex(x) {
  const t = josa(x.name, '은', '는');
  if (x.last == null) return `${x.name}${t} 시세를 받지 못했음 — 다음 회차에 재수집함`;
  const dir = x.chgPct > 0 ? '올랐음' : x.chgPct < 0 ? '내렸음' : '보합이었음';
  return `${x.name}${t} ${fmtNum(x.last, 2)}로 전일 대비 ${fmtSigned(x.chgPct, 2, '%')} ${dir}`;
}
export function lineFx(x) {
  const t = josa(x.name, '은', '는');
  if (x.last == null) return `${x.name}${t} 시세를 받지 못했음`;
  const digits = /원/.test(x.unit) ? 2 : 4;
  const tone = x.name === '달러/원' ? (x.chg > 0 ? ' — 원화가 약세였음' : x.chg < 0 ? ' — 원화가 강세였음' : '') : '';
  return `${x.name}${t} ${fmtNum(x.last, digits)}${x.unit}으로 ${fmtSigned(x.chg, digits, x.unit)} 움직였음${tone}`;
}
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

// ── 메인 ────────────────────────────────────────────────
async function main() {
  if (process.argv.includes('--selftest')) return selftest();
  const now = kst();
  const [kr, global, fx, ust, sofr, effr, so, bok, iss] = [
    await quoteList(KR_INDEX),
    await quoteList(GL_INDEX),
    await quoteList(FX),
    await quoteList(UST),
    await nyFed('secured/sofr', 'SOFR'),
    await nyFed('unsecured/effr', 'EFFR'),
    await sonia(),
    await bokBaseRate(),
    await issues(),
  ];
  // 한국은행 페이지 파싱이 실패하면 금통위 보도에서 인용한다(값을 지어내지 않음).
  const bokRate = bok || bokFromNews(iss);

  // 앱이 그대로 쓰는 표시 문장까지 여기서 만든다(앱은 렌더만 담당).
  const data = {
    asOf: `${now.ymd}(${now.dow}) ${now.hm} KST`,
    updatedAt: now.ymd,
    ts: now.iso,
    kr, global, fx, ust,
    rates: {
      sofr: sofr ? { rate: sofr.rate, asOf: sofr.asOf, label: 'SOFR (미국 담보부 익일물)', src: 'New York Fed' } : null,
      sonia: so ? { rate: so.rate, asOf: so.asOf, label: 'SONIA (영국 무담보 익일물)', src: 'Bank of England' } : null,
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
  data.krLines = kr.map(lineIndex);
  data.globalLines = global.map(lineIndex);
  data.fxLines = fx.map(lineFx);
  data.watch = buildWatch(data);
  data.summary = buildSummary(data);

  await writeFile(new URL('../market.json', import.meta.url), JSON.stringify(data, null, 0));
  console.log(`market.json 갱신: 국내 ${kr.length} · 해외 ${global.length} · 환율 ${fx.length} · 이슈 ${iss.length} · 실패 ${errors.length}`);
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
  const ok5 = bok && bok.rate === 2.25 && bok.asOf === '2026.05.29';

  const bokNews = bokFromNews([
    { title: '한은 금통위, 기준금리 연 2.75%로 동결', source: '연합뉴스', url: 'https://x/1' },
  ]);
  const bokNoise = bokFromNews([{ title: '기준금리 3% 초읽기…영끌족 부담', source: '한국경제', url: 'https://x/2' }]);
  const ok8 = bokNews && bokNews.rate === 2.75 && bokNoise === null;

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
  const line = lineIndex(d.kr[0]), fxLine = lineFx(d.fx[0]);
  // 음슴체 확인 — 모든 생성 문장이 '음/슴'으로 끝나야 한다.
  const endsOk = [line, fxLine, summary, ...watch].every((t) => /(음|슴|함)$/.test(t.replace(/\s+$/, '')));
  const josaOk = /코스피는/.test(line) && /달러\/원은/.test(fxLine);
  const ok7 = watch.length >= 3 && endsOk && josaOk && /코스피 \+0\.82%/.test(summary) && /원화가 약세/.test(fxLine);

  console.log('index:', line);
  console.log('fx   :', fxLine);
  console.log('watch:', watch.join('\n       '));
  console.log('요약 :', summary);
  const all = ok1 && ok2 && ok3 && ok4 && ok5 && ok6 && ok7 && ok8;
  console.log(all ? '\nSELFTEST PASS' : `\nSELFTEST FAIL (${[ok1, ok2, ok3, ok4, ok5, ok6, ok7, ok8].join(',')})`);
  if (!all) process.exit(1);
}

if (process.argv[1] && process.argv[1].endsWith('daily-brief.mjs')) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
