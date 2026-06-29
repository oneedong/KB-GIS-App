/*
 * KB GIS — LP 대체투자 배분 자동 갱신기
 *
 * allocations.json 의 기관 중 "공개·기계가독 데이터가 있는 기관"만 공공 API에서
 * 최신 대체투자 비중/금액을 받아 갱신합니다. 그 외 기관은 사람이 관리하는
 * 시드값을 그대로 둡니다. 파싱 실패·이상치(비정상 범위)는 절대 반영하지 않고
 * 기존 값을 보존합니다 → 잘못된 숫자가 표에 들어가지 않습니다.
 *
 *   DATA_GO_KR_KEY=... node scripts/update-allocations.mjs
 *   node scripts/update-allocations.mjs --selftest   # 네트워크 없이 병합/검증 테스트
 */
import { readFile, writeFile } from 'fs/promises';
import { parseFeed } from './collect-news.mjs';

const DATA_GO_KR_KEY = process.env.DATA_GO_KR_KEY || '';
const round1 = (v) => Math.round(v * 10) / 10;
const sane = (v, lo, hi) => typeof v === 'number' && isFinite(v) && v >= lo && v <= hi;
const num = (x) => { const n = Number(String(x).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : NaN; };

// ── 자산군별 금액 배열에서 대체투자 비중/금액 추출 (필드명 변형에 견고) ──
// items: [{ <분류명필드>: '대체투자', <금액필드>: 159000000, ... }, ...]
// 분류명에 '대체'가 든 행을 합쳐 대체투자 금액을, 전체 합으로 비중을 구합니다.
export function extractAlt(items) {
  if (!Array.isArray(items) || !items.length) return null;
  let total = 0, alt = 0, matched = 0;
  for (const it of items) {
    const vals = Object.values(it);
    const cat = vals.find(v => typeof v === 'string' && /대체|주식|채권|기타|단기|부동산|인프라|현금/.test(v));
    // 금액: 가장 큰 숫자형 값 (수익률·비중 같은 작은 수치와 구분)
    let amt = NaN;
    for (const v of vals) { const n = num(v); if (isFinite(n) && (!isFinite(amt) || n > amt)) amt = n; }
    if (!cat || !isFinite(amt) || amt <= 0) continue;
    total += amt; matched++;
    if (/대체/.test(cat)) alt += amt;
  }
  if (matched < 2 || alt <= 0 || total <= 0) return null;
  return { altRaw: alt, totalRaw: total, altPct: alt / total * 100 };
}

// 원시 금액 단위(억/백만/천원 등)를 모르므로, AUM이 정상 범위(조원)가 되도록
// 후보 배율을 시도해 단위를 추정합니다. 실패하면 금액은 버리고 비중만 씁니다.
function toJoTrillion(raw) {
  for (const div of [10000, 1000000, 100, 1]) {     // 억원, 백만원, (조 가정), 그대로
    const v = raw / div;
    if (sane(v, 5, 1500)) return v;                 // 국내 기관 AUM 합리적 범위(조원)
  }
  return null;
}

// ── 기관별 fetcher: {year, altPct, altAmount?, aum?} 또는 null ──
async function fetchNPS() {
  if (!DATA_GO_KR_KEY) { console.warn('국민연금: DATA_GO_KR_KEY 미설정 → 건너뜀'); return null; }
  // 공공데이터포털 "국민연금공단 기금운용 자산군별 현황" 계열 데이터셋.
  // (정확한 데이터셋 경로/필드는 발급 키 계정에서 확인해 NPS_FUND_URL 로 덮어쓸 수 있음)
  const base = process.env.NPS_FUND_URL || 'https://apis.data.go.kr/B552015/NpsFundOperationStatusService/getFundAssetClassStatus';
  try {
    const url = `${base}?serviceKey=${encodeURIComponent(DATA_GO_KR_KEY)}&resultType=json&numOfRows=200`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) { console.warn('국민연금 HTTP', res.status); return null; }
    const text = await res.text();
    let items;
    try { const j = JSON.parse(text); items = j?.response?.body?.items?.item || j?.items || j?.data; }
    catch { console.warn('국민연금: JSON 파싱 실패(데이터셋/키 확인 필요)'); return null; }
    const ext = extractAlt(items);
    if (!ext) { console.warn('국민연금: 자산군 데이터에서 대체투자 추출 실패'); return null; }
    const aum = toJoTrillion(ext.totalRaw);
    const altAmount = toJoTrillion(ext.altRaw);
    return { year: new Date().getFullYear(), altPct: ext.altPct, aum, altAmount };
  } catch (e) { console.warn('국민연금 error', e.message); return null; }
}

// 자동 갱신 대상(공개 기계가독 데이터 보유 기관)만 등록. 추가는 함수 하나면 됩니다.
export const FETCHERS = { '국민연금': fetchNPS };

// ── 기사 기반 추출 (모든 기관 공통 fallback, 키 불필요) ──
// 우리가 수집하지 않는 "배분 전략" 기사를 별도 검색해 대체투자 비중/금액 수치를
// 뽑아냅니다. 메인 뉴스 피드에는 넣지 않습니다(피드는 해외 펀드 뉴스 전용 유지).
const toJoFromUnit = (n, unit) => unit === '억' ? n / 10000 : n;   // 억원→조원
export function parseAllocation(text) {
  if (!text || !/대체투자|대체자산/.test(text)) return null;
  let altPct = NaN, altAmount = NaN;
  // 비중: "대체투자 … 16%" 또는 "16% … 대체투자" (대체투자 인접 12자 이내)
  const p1 = text.match(/대체(?:투자|자산)[^%]{0,12}?(\d{1,2}(?:\.\d)?)\s*%/);
  const p2 = text.match(/(\d{1,2}(?:\.\d)?)\s*%[^.,·]{0,12}?대체(?:투자|자산)/);
  if (p1) altPct = num(p1[1]); else if (p2) altPct = num(p2[1]);
  // 금액: "대체투자 … 159조" / "30조원" / "5,000억원"
  const a1 = text.match(/대체(?:투자|자산)[^조억]{0,14}?(\d{1,3}(?:,\d{3})*|\d+(?:\.\d+)?)\s*(조|억)\s*원?/);
  if (a1) altAmount = toJoFromUnit(num(a1[1]), a1[2]);
  const out = {};
  if (sane(altPct, 0.5, 100)) out.altPct = altPct;
  if (sane(altAmount, 0.1, 2000)) out.altAmount = altAmount;
  return out.altPct != null || out.altAmount != null ? out : null;
}

async function fetchRss(q) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=ko&gl=KR&ceid=KR:ko`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 KBGIS-alloc' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseFeed(await res.text());
}

// 최신 기사에서 대체투자 비중·금액을 추출. {year, altPct?, altAmount?, source} 또는 null
async function fetchFromNews(instName) {
  const queries = [`"${instName}" 대체투자 비중`, `"${instName}" 대체투자 자산 조원`];
  let best = null, bestMs = -1;
  for (const q of queries) {
    let items;
    try { items = await fetchRss(q); } catch (e) { console.warn(`기사검색 실패 ${instName}:`, e.message); continue; }
    for (const it of items) {
      const text = `${it.title} ${it.desc}`;
      if (!text.includes(instName)) continue;          // 기관명이 실제로 언급된 기사만
      const got = parseAllocation(text);
      if (!got) continue;
      const ms = Date.parse(it.pub) || 0;
      if (ms > bestMs) { bestMs = ms; best = { ...got, source: it.source || '뉴스', pub: it.pub }; }
    }
  }
  if (!best) return null;
  const year = bestMs > 0 ? new Date(bestMs).getFullYear() : new Date().getFullYear();
  return { year, altPct: best.altPct, altAmount: best.altAmount, source: best.source, pub: best.pub };
}

// ── 안전한 병합: 정상 범위 값만 반영, 아니면 시드값 보존 ──
export function applyUpdate(inst, upd, opts = {}) {
  if (!upd) return false;
  const today = opts.today || new Date().toISOString().slice(0, 10);
  if (!sane(upd.altPct, 0.5, 100)) return false;           // 비중을 못 구하면 건드리지 않음
  inst.altPct = round1(upd.altPct);
  if (sane(upd.altAmount, 0.1, 2000)) inst.altAmount = round1(upd.altAmount);
  if (sane(upd.aum, 5, 5000)) inst.aum = Math.round(upd.aum);
  inst.auto = true;
  inst.autoKind = opts.kind || 'api';                      // 'api' | 'news'
  inst.updatedAt = today;
  if (opts.source) inst.source = opts.source;
  const t = inst.trend && inst.trend.find(p => p.year === upd.year);
  if (t) { t.altPct = inst.altPct; if (inst.altAmount != null) t.altAmount = inst.altAmount; }
  else if (inst.trend) inst.trend.push({ year: upd.year, altPct: inst.altPct, altAmount: inst.altAmount });
  if (inst.trend) inst.trend.sort((a, b) => a.year - b.year);
  return true;
}

async function main() {
  if (process.argv.includes('--selftest')) return selftest();
  const path = new URL('../allocations.json', import.meta.url);
  const data = JSON.parse(await readFile(path, 'utf8'));
  let any = false;
  for (const inst of data.institutions) {
    // 1순위: 공개 API(있는 기관만). 2순위: 최신 기사에서 추출(모든 기관).
    const api = FETCHERS[inst.name] ? await FETCHERS[inst.name]() : null;
    if (applyUpdate(inst, api, { kind: 'api' })) {
      any = true; console.log(`갱신(API): ${inst.name} → 대체 ${inst.altPct}% (${inst.altAmount}조)`);
      continue;
    }
    const news = await fetchFromNews(inst.name);
    if (applyUpdate(inst, news, { kind: 'news', source: `기사 참고 · ${news?.source || ''} ${news?.pub ? new Date(news.pub).toISOString().slice(0,10) : ''}`.trim() })) {
      any = true; console.log(`갱신(기사): ${inst.name} → 대체 ${inst.altPct}%${inst.altAmount?` (${inst.altAmount}조)`:''}`);
    }
  }
  if (any) {
    data.asOf = String(new Date().getFullYear());
    data.institutions.sort((a, b) => b.altPct - a.altPct);
    await writeFile(path, JSON.stringify(data, null, 2) + '\n');
    console.log('allocations.json 갱신 완료');
  } else {
    console.log('자동 갱신된 기관 없음 (시드값 유지)');
  }
}

function selftest() {
  // 1) 추출: 자산군 배열에서 대체투자 비중 계산
  const items = [
    { assetClass: '주식', amount: 400000 },
    { assetClass: '채권', amount: 350000 },
    { assetClass: '대체투자', amount: 160000 },
    { assetClass: '단기자금', amount: 90000 },
  ];
  const ext = extractAlt(items);
  const ok1 = ext && Math.abs(ext.altPct - 16.0) < 0.2;     // 160000 / 1000000 = 16%

  // 2) 병합: 정상 값은 반영 + auto/updatedAt + trend upsert
  const inst = { name: '국민연금', altPct: 15.9, altAmount: 159, aum: 1036, auto: false,
    trend: [{ year: 2023, altPct: 15.9, altAmount: 159 }] };
  const okMerge = applyUpdate(inst, { year: 2024, altPct: 16.0, altAmount: 184, aum: 1150 }, { today: '2026-06-29' });
  const ok2 = okMerge && inst.altPct === 16.0 && inst.auto === true && inst.autoKind === 'api' && inst.updatedAt === '2026-06-29'
    && inst.trend.length === 2 && inst.trend[1].year === 2024;

  // 2b) 기사 본문에서 비중·금액 추출
  const n1 = parseAllocation('국민연금, 대체투자 비중 16%로 확대… 해외 사모펀드 출자 늘린다');
  const n2 = parseAllocation('한국교직원공제회 대체투자 자산 30조원 돌파');
  const n3 = parseAllocation('올해 기준금리 3.5% 동결, 코스피 상승');     // 대체투자 없음 → null
  const okNews = n1 && Math.abs(n1.altPct - 16) < 0.1 && n2 && Math.abs(n2.altAmount - 30) < 0.1 && n3 === null;

  // 3) 가드: 이상치(비중 9999%)는 무시하고 기존 값 보존
  const inst2 = { name: 'X', altPct: 20, altAmount: 10, aum: 50, trend: [] };
  const rejected = applyUpdate(inst2, { year: 2024, altPct: 9999, altAmount: -5, aum: 0 });
  const ok3 = rejected === false && inst2.altPct === 20;

  // 4) null(수집 실패) → 변경 없음
  const ok4 = applyUpdate({ altPct: 1, trend: [] }, null) === false;

  console.log(`extract=${ok1} merge=${ok2} news=${okNews} guard=${ok3} null=${ok4}`);
  const ok = ok1 && ok2 && okNews && ok3 && ok4;
  console.log(ok ? 'SELFTEST PASS' : 'SELFTEST FAIL');
  if (!ok) process.exit(1);
}

if (process.argv[1] && process.argv[1].endsWith('update-allocations.mjs')) {
  main().catch(e => { console.error(e); process.exit(1); });
}
