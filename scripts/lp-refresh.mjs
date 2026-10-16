#!/usr/bin/env node
/*
 * KB GIS — 국내 LP 대체투자 배분·운용자산 주간 최신화 (allocations.json)
 *
 * 왜 필요한가(2026-10 점검): '기관별 대체투자 비중'이 국민연금·KIC 두 곳뿐이었다. 다른 기관은 기계가독
 * 공시가 없어 손으로 넣은 시드만 있었고, 갱신 스크립트는 어느 워크플로에도 연결돼 있지 않았다.
 *
 * 방법: 기관마다 구글 뉴스에서 '대체투자 비중'·'운용자산' 기사를 찾아 원문을 열고, 기관명(또는 기사 제목의
 * 기관)과 수치가 함께 나온 문장에서만 값을 뽑는다. 수익률·목표치(…까지 확대)·계획 문장은 버린다.
 * 결과는 '보도 기준'(verified:false, basis:'press')으로 표시하고 근거 문장·매체·날짜·링크를 함께 저장한다.
 * 공식 공시로 확정된 기관(verified:true — 국민연금·KIC)의 공시 수치는 덮어쓰지 않는다.
 *
 *   node scripts/lp-refresh.mjs            # 갱신 후 allocations.json 저장
 *   node scripts/lp-refresh.mjs --dry      # 찾은 값만 출력
 *   node scripts/lp-refresh.mjs --selftest # 문장 추출 규칙 점검(네트워크 없음)
 */
import { readFile, writeFile } from 'node:fs/promises';

export const TARGETS = [
  ['한국교직원공제회', ['교직원공제회']], ['군인공제회', ['군인공제회']], ['대한지방행정공제회', ['행정공제회']],
  ['경찰공제회', ['경찰공제회']], ['과학기술인공제회', ['과학기술인공제회', '과학기술인공제']], ['공무원연금공단', ['공무원연금']],
  ['사립학교교직원연금공단', ['사학연금']], ['우정사업본부', ['우정사업본부', '우체국보험']], ['중소기업중앙회', ['노란우산']],
  ['새마을금고중앙회', ['새마을금고중앙회']], ['건설근로자공제회', ['건설근로자공제회']], ['대한소방공제회', ['소방공제회']],
  ['농업협동조합중앙회', ['농협중앙회']], ['신용협동조합중앙회', ['신협중앙회']],
];

const num = (s) => Number(String(s).replace(/,/g, ''));
// "29조7280억원" → 29.728 (조원), "5,000억원" → 0.5
export function joOf(s) {
  const m = String(s).match(/(\d[\d,]*(?:\.\d+)?)\s*조\s*(?:(\d[\d,]*)\s*억)?|(\d[\d,]*)\s*억/);
  if (!m) return null;
  if (m[3]) return num(m[3]) / 10000;
  return num(m[1]) + (m[2] ? num(m[2]) / 10000 : 0);
}
// 기준 시점 — 문장에 적힌 것만. 없으면 '' (보도일로 대신 표시)
export function asOfOf(s, pubYear) {
  let m = s.match(/(20\d{2})년\s*(\d{1,2})월\s*말/); if (m) return `${m[1]}년 ${m[2]}월 말`;
  m = s.match(/(20\d{2})년\s*(?:말|연말)/); if (m) return `${m[1]}년 말`;
  m = s.match(/(20\d{2})년\s*(?:상반기|1분기|2분기|3분기)\s*말?/); if (m) return m[0].replace(/\s+/g, ' ').trim();
  if (/지난해\s*말|작년\s*말|전년\s*말/.test(s) && pubYear) return `${pubYear - 1}년 말`;
  m = s.match(/올해\s*(\d{1,2})월\s*말/); if (m && pubYear) return `${pubYear}년 ${m[1]}월 말`;
  m = s.match(/(\d{1,2})월\s*말\s*기준/); if (m && pubYear) return `${pubYear}년 ${m[1]}월 말`;
  return '';
}
const BAD_CTX = /수익률|수익|성과|평균|업계/;
// 문장 전체가 계획·전망·가정이면(… 늘리겠다, … 계획에 따르면, … 했다면 … 추산) 현재 수치가 아니다
const NOT_FACT = /겠다|계획|방침|목표|전망|예정|추산|추정|가정|라면|었다면|했다면|머물렀다면/;
const AMT = String.raw`\d[\d,]*(?:\.\d+)?\s*조\s*(?:\d[\d,]*\s*억)?\s*원?|\d[\d,]*\s*억\s*원?`;
// 수치 바로 앞의 시점 표현(가장 가까운 것) — '2022년 68.2%에서 … 지난해 51.0%로'의 51.0 → 지난해
function localAsOf(prefix, pubYear) {
  const ms = [...prefix.matchAll(/(20\d{2})년(?:\s*(\d{1,2})월)?(\s*말)?|지난해(\s*말)?|작년(\s*말)?|올해\s*(\d{1,2})월\s*말|(\d{1,2})월\s*말/g)];
  if (!ms.length) return '';
  const m = ms[ms.length - 1];
  if (m[1]) return m[2] ? `${m[1]}년 ${m[2]}월 말` : `${m[1]}년${m[3] ? ' 말' : ''}`;
  if (/^(?:지난해|작년)/.test(m[0])) return pubYear ? `${pubYear - 1}년${m[4] || m[5] ? ' 말' : ''}` : '';
  const mo = m[6] || m[7];
  return mo && pubYear ? `${pubYear}년 ${mo}월 말` : '';
}
// 한 문장에서 대체투자 비중(%)·대체투자 금액·운용자산(조원)을 뽑는다(없으면 null)
export function extractFigures(sent, pubYear = null) {
  const s = String(sent || '').replace(/\s+/g, ' ');
  if (NOT_FACT.test(s)) return null;
  const out = {};
  const okPct = (v) => v >= 3 && v <= 95;
  if (/대체(?:투자|자산)/.test(s) && !/각각/.test(s)) {
    // (1) "대체투자 비중은 62.1%" · "비중은 2022년 68.2%에서 … 지난해 51.0%로"(마지막 값이 최신) · "전체 운용자산의 27.4%"
    const an = s.match(/대체(?:투자|자산)(?:\s*(?:자산|부문))?\s*(?:비중|비율)\s*(?:은|이|도|을|를)?\s*/);
    if (an) {
      const from = an.index + an[0].length;
      const clause = s.slice(from, from + 120).split(/비중|비율|반면|했다|됐다|이다|였다|다\./)[0];
      const nums = [...clause.matchAll(/(\d{1,2}(?:\.\d{1,2})?)\s*%(?!\s*포인트|p)/g)].filter((x) => {
        const after = clause.slice(x.index + x[0].length, x.index + x[0].length + 6);
        return clause[x.index - 1] !== '~' && !/^\s*(?:확대|축소|증가|감소|상승|하락|늘|줄)/.test(after);   // 증감폭(3~4% 확대)은 수준이 아니다
      });
      const last = nums[nums.length - 1];
      if (last) {
        const around = s.slice(Math.max(0, an.index - 20), from + last.index + last[0].length + 20);
        const v = Number(last[1]);
        if (!BAD_CTX.test(around) && okPct(v)) { out.altPct = v; const lo = localAsOf(clause.slice(0, last.index), pubYear); if (lo) out.asOf = lo; }
      }
    }
    // (2) "대체투자가 23조7093억원(70.1%)" — 금액(비중)
    let m = s.match(new RegExp(String.raw`대체(?:투자|자산)\s*(?:은|는|이|가)?\s*(?:약\s*)?(${AMT})\s*\(\s*(\d{1,2}(?:\.\d{1,2})?)\s*%\s*\)`));
    if (m && out.altPct == null && !BAD_CTX.test(s.slice(Math.max(0, m.index - 20), m.index + m[0].length + 10)) && okPct(Number(m[2]))) {
      out.altPct = Number(m[2]); const v = joOf(m[1]); if (v && v >= 0.3 && v <= 600) out.altAmount = v;
    }
    // (3) "74.8%가 대체투자"
    if (out.altPct == null) {
      m = s.match(/(\d{1,2}(?:\.\d{1,2})?)\s*%\s*(?:가|를|이|는)?\s*대체(?:투자|자산)/);
      if (m && !BAD_CTX.test(s.slice(Math.max(0, m.index - 24), m.index + m[0].length + 24)) && okPct(Number(m[1]))) out.altPct = Number(m[1]);
    }
    // 대체투자 금액 "대체투자 자산은 232조6000억원"
    m = s.match(/대체(?:투자|자산)\s*(?:자산|규모|금액|투자액|잔액|운용\s*규모)?\s*(?:은|는|이|가)?\s*(?:약\s*)?(\d[\d,]*(?:\.\d+)?\s*조\s*(?:\d[\d,]*\s*억)?)\s*원/);
    if (out.altAmount == null && m && !BAD_CTX.test(s.slice(Math.max(0, m.index - 10), m.index + m[0].length + 10)) && !/에서\s*$/.test(s.slice(m.index + m[0].length, m.index + m[0].length + 4))) { const v = joOf(m[1]); if (v && v >= 0.3 && v <= 600) out.altAmount = v; }
  }
  // 운용자산: "운용자산은 20조4569억원" · "총 29조7000억원 규모의 기금을 운용" · "AUM은 6조5000억원"
  const a = s.match(/(?:총\s*자산|운용\s*자산|운용\s*규모|기금\s*(?:규모|적립금)|(?<!대체\s?)자산\s*규모|금융\s*자산|(?<!대체)투자\s*자산|AUM)\s*(?:은|는|이|가|을|를)?\s*(?:약\s*)?(\d[\d,]*(?:\.\d+)?\s*조\s*(?:\d[\d,]*\s*억)?)\s*원/)
    || s.match(/(?:총\s*)?(?:약\s*)?(\d[\d,]*(?:\.\d+)?\s*조\s*(?:\d[\d,]*\s*억)?)\s*원\s*규모의\s*(?:기금|자산)/);
  // '20조원 이상'·'23조원 육박' 같은 어림값은 정확한 운용자산이 아니므로 쓰지 않는다
  if (a && !/^\s*(?:이상|넘|돌파|육박|안팎|가량|대로|까지)/.test(s.slice(a.index + a[0].length, a.index + a[0].length + 5))) { const v = joOf(a[1]); if (v && v >= 1 && v <= 2500) out.aum = v; }
  return Object.keys(out).filter((k) => k !== 'asOf').length ? out : null;
}
// 기사 한 건(제목+본문)에서 기관 수치 찾기 — 기관명이 문장에 있거나, 제목에 있고 문장 주어가 생략된 경우
export function figuresFromArticle(title, body, aliases, pubYear) {
  // 기관 묶음: 대상 기관들 + 국민연금·KIC(비교 대상으로 자주 나온다)
  const GROUPS = [...TARGETS.map(([, al]) => al), ['국민연금'], ['한국투자공사', 'KIC']];
  const self = GROUPS.findIndex((al) => al.some((x) => aliases.includes(x)));
  const mentioned = (s) => GROUPS.map((al, i) => (al.some((x) => s.includes(x)) ? i : -1)).filter((i) => i >= 0);
  const sents = `${title}. ${body}`.split(/(?<=다\.|\.)\s+|\n+/).map((x) => x.trim()).filter(Boolean);
  const found = [];
  // 주어가 생략된 문장은 바로 앞에서 마지막으로 언급된 기관의 이야기로 읽는다(기사 문장의 일반적 흐름).
  // 다른 기관이 사이에 끼면 그 뒤 생략 문장은 이 기관 수치로 보지 않는다.
  let last = -1;
  for (const s of sents) {
    const ms = mentioned(s);
    if (ms.length > 1) { last = ms[ms.length - 1]; continue; }   // 두 기관 이상(비교 문장) — 수치를 가져오지 않는다
    if (ms.length === 1) last = ms[0];
    if (last !== self) continue;
    const f = extractFigures(s, pubYear);
    if (f) found.push({ ...f, asOf: f.asOf || asOfOf(s, pubYear), sentence: s.slice(0, 220) });
  }
  return found;
}

function selftest() {
  const cases = [
    ['교직원공제회의 대체투자 비중은 62.1%로 다른 공제회 대비 높은 편이다.', { altPct: 62.1 }],
    ['사학연금의 대체투자 비중은 전체 운용자산의 27.4% 수준이다.', { altPct: 27.4 }],
    ['지난해 말 군인공제회 투자운용자산의 74.8%가 대체투자와 부동산이다.', { altPct: 74.8 }],
    ['사학연금의 금융자산 규모는 전년 대비 약 3조9000억원 증가한 29조7280억원으로 확대됐다.', null],
    ['2024년 말 기준 군인공제회 총자산은 약 20조4569억원으로 운용수익률은 7.2%다.', { aum: 20.4569 }],
    ['대체투자 수익률은 2024년 7.9%에서 지난해 6.2%로 내려앉았다.', null],
    ['공제회는 2029년까지 대체투자 비중을 85.2%로 확대한다는 목표를 세웠다.', null],
    ['지난해 말 국민연금 대체투자 자산은 232조6000억원으로 전년보다 25조7000억원 증가했다.', { altAmount: 232.6 }],
    // 2026-10 실제 기사 문장(진단 로그) — 놓치던 문형과 걸러야 할 문형
    ['운용자산은 대체투자가 23조7093억원(70.1%)으로 가장 많고 주식 4조1515억원(12.27%), 단기자금 등 3조6547억원(10.8%), 채권 2조3104억원(6.8%) 순이다.', { altPct: 70.1, altAmount: 23.7093 }],
    ['투자자산 기준 대체투자 비중은 2022년 68.2%에서 2023년 60.2%, 2024년 53.2%, 지난해 51.0%로 3년 연속 뒷걸음질했다.', { altPct: 51.0 }],
    ['반면 주식, 채권, 대체투자 비중은 2년 전보다 각각 9.0%→7.8%, 21.4%→19.7%, 60.2%→51.0%로 축소됐다.', null],
    ['대신 대체투자는 64.1%까지 13%포인트 넘게 끌어올리고, 채권은 19.7%에서 21.8%로, 주식은 7.8%에서 9.7%로 높일 계획이다.', null],
    ['지난 5월 말 기준 공무원연금의 채권 보유액은 3조8727억원(22.5%), 주식은 5조6587억원(32.8%), 대체투자는 2조4054억(14.0%)으로 비중은 대략 2:3:1로 나타났다.', { altPct: 14.0, altAmount: 2.4054 }],
    ['주식이 2023년 말 수준(2조999억원)에 머물렀다면 5월 말 대체투자 비중은 20.2%가 아니라 28.7%로 추산된다.', null],
    ['2024년 발표한 2025~2029년 중장기 재무관리계획에서도 재무 악화 시 대응 방안으로 대체투자 비중을 30%에서 34%로, 해외투자 비중을 29.6%에서 36%로 늘리겠다고 밝힌 바 있다.', null],
    ['주식·채권·대체투자 등 사학연금의 유가증권 투자 가운데 대체투자 비중은 2016년 16.0%에서 지난해 25.5%까지 상승했다.', { altPct: 25.5 }],
    ['사학연금은 지난해 말 기준 국내채권, 대체투자, 해외주식, 국내주식, 해외채권 등 총 29조7000억원 규모의 기금을 운용하고 있다.', { aum: 29.7 }],
    ['□ 한편, 자산군별 운용수익률(시간가중수익률 기준)의 경우, 국내주식 90.9%, 해외주식 18.3%, 대체투자 7.8% 등의 순으로 나타났다.', null],
    ['노란우산공제회의 연간 자산배분 계획에 따르면 대체투자 비중은 2021년 23.5%, 2022년 24.8%, 2023년 26.9%까지 꾸준히 증가했다.', null],
    ['전년보다 채권·단기 비중을 줄이고 주식·대체투자 비중을 3~4% 확대해 위험자산의 비중을 높인 점이 눈에 띈다.', null],
    ['행정공제회는 대체투자와 주식, 채권을 아우른 포트폴리오를 운용하며 자산 규모를 20조원 이상으로 키워왔다.', null],
    ['경찰공제회의 AUM은 6조5000억원에 불과하지만 대체투자본부에서 총 12명이 근무 중이다.', { aum: 6.5 }],
  ];
  let ok = true;
  for (const [s, exp] of cases) {
    const got = extractFigures(s, 2026);
    const pass = exp === null ? !got || (!got.altPct && !got.aum && !got.altAmount) : Object.entries(exp).every(([k, v]) => got && Math.abs(got[k] - v) < 0.001);
    if (!pass) { ok = false; console.log('FAIL', JSON.stringify(got), '<=', s); }
  }
  const asof = [asOfOf('지난해 말 군인공제회', 2026), asOfOf('2025년 9월말 총자산', 2026), asOfOf('2024년 말 기준', 2026)];
  if (asof.join('|') !== '2025년 말|2025년 9월 말|2024년 말') { ok = false; console.log('asOf FAIL', asof); }
  const lo = extractFigures('투자자산 기준 대체투자 비중은 2022년 68.2%에서 2023년 60.2%, 2024년 53.2%, 지난해 51.0%로 3년 연속 뒷걸음질했다.', 2026);
  if (!lo || lo.asOf !== '2025년') { ok = false; console.log('localAsOf FAIL', lo); }
  const solo = figuresFromArticle('행정공제회, 대체투자 쏠림 점검', '운용자산은 대체투자가 23조7093억원(70.1%)으로 가장 많다.', ['행정공제회'], 2026);
  if (solo.length !== 1 || solo[0].altPct !== 70.1) { ok = false; console.log('solo FAIL', solo); }
  const mixed = figuresFromArticle('행정공제회·교직원공제회 대체투자 점검', '교직원공제회도 비슷하다. 운용자산은 대체투자가 23조7093억원(70.1%)으로 가장 많다.', ['행정공제회'], 2026);
  if (mixed.length !== 0) { ok = false; console.log('mixed FAIL', mixed); }
  const ante = figuresFromArticle('CIO 공백에 투자 멈춘 경찰공제회', '국민연금 출신 인사가 거론된다. 경찰공제회는 올해 배분안을 내놨다. 투자자산 기준 대체투자 비중은 2022년 68.2%에서 지난해 51.0%로 뒷걸음질했다.', ['경찰공제회'], 2026);
  if (ante.length !== 1 || ante[0].altPct !== 51) { ok = false; console.log('antecedent FAIL', ante); }
  const art = figuresFromArticle('교직원공제회, 해외 대체투자 확대', '공제회의 대체투자 비중은 62.1%다. 국민연금의 대체투자 비중은 16.2%다.', ['교직원공제회'], 2026);
  if (art.length !== 1 || art[0].altPct !== 62.1) { ok = false; console.log('article FAIL', art); }
  console.log(ok ? 'SELFTEST PASS' : 'SELFTEST FAIL');
  if (!ok) process.exit(1);
}

async function search(q) {
  const { parseFeed } = await import('./collect-news.mjs');
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q + ' when:365d')}&hl=ko&gl=KR&ceid=KR:ko`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 KBGIS-lp' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseFeed(await res.text());
}

async function main() {
  if (process.argv.includes('--selftest')) return selftest();
  const dry = process.argv.includes('--dry');
  const { resolveGoogleNewsUrlAsync, fetchArticleText } = await import('./collect-news.mjs');
  const roster = JSON.parse(await readFile(new URL('../institutions.json', import.meta.url), 'utf8')).institutions;
  const path = new URL('../allocations.json', import.meta.url);
  const data = JSON.parse(await readFile(path, 'utf8'));
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  let changed = 0;
  for (const [name, aliases] of TARGETS) {
    const items = [];
    for (const q of [`${aliases[0]} 대체투자 비중`, `${aliases[0]} 대체투자`, `${aliases[0]} 운용자산 조원`]) {
      try { items.push(...(await search(q))); } catch (e) { console.warn(`검색 실패 ${name}: ${e.message}`); }
    }
    const seen = new Set();
    const cands = items.filter((it) => aliases.some((x) => it.title.includes(x)) && /대체|자산|기금|운용|수익률/.test(it.title))
      .filter((it) => (seen.has(it.title) ? false : seen.add(it.title)))
      .sort((x, y) => (Date.parse(y.pub) || 0) - (Date.parse(x.pub) || 0)).slice(0, 10);
    let bestPct = null, bestAum = null, opened = 0;
    const near = [];                                   // 못 뽑았을 때 원인 확인용 — 대체·% 가 함께 나온 문장
    for (const it of cands) {
      const pubMs = Date.parse(it.pub) || 0, pubYear = pubMs ? new Date(pubMs).getFullYear() : null;
      let url = it.link;
      try { url = await resolveGoogleNewsUrlAsync(it.link); } catch {}
      let body = '';
      if (!/news\.google\.com/.test(url)) { try { body = (await fetchArticleText(url, it.title)).text || ''; } catch {} }
      if (body.length > 200) opened++;
      if (dry) for (const x of `${it.title}. ${body}`.split(/(?<=다\.)\s+|\n+/)) if (/대체/.test(x) && /\d\s*%|\d\s*조/.test(x) && near.length < 6) near.push(x.trim().slice(0, 200));
      for (const f of figuresFromArticle(it.title, body || it.desc || '', aliases, pubYear)) {
        const rec = { ...f, source: it.source || '', sourceUrl: url, pub: pubMs ? new Date(pubMs).toISOString().slice(0, 10) : '' };
        if (f.altPct != null && (!bestPct || rec.pub > bestPct.pub)) bestPct = rec;
        if (f.aum != null && (!bestAum || rec.pub > bestAum.pub)) bestAum = rec;
      }
    }
    console.log(`${name}: 비중 ${bestPct ? `${bestPct.altPct}% (${bestPct.asOf || '보도 ' + bestPct.pub}, ${bestPct.source})` : '-'} · 운용자산 ${bestAum ? `${bestAum.aum.toFixed(1)}조 (${bestAum.asOf || '보도 ' + bestAum.pub}, ${bestAum.source})` : '-'}`);
    console.log(`   (후보 기사 ${cands.length}건 · 본문 확보 ${opened}건)`);
    if (bestPct) console.log(`   └ 비중: "${bestPct.sentence}"`);
    if (bestAum) console.log(`   └ 운용자산: "${bestAum.sentence}"`);
    if (dry && !bestPct) for (const x of near) console.log(`   · 미추출 후보: ${x}`);
    if (dry || !bestPct) continue;
    let inst = data.institutions.find((x) => x.name === name);
    if (inst && inst.verified) continue;                       // 공시 확정 수치는 기사로 덮지 않는다
    if (inst && inst.pub && inst.pub >= bestPct.pub) continue;  // 이미 같은/더 새 기사 반영
    const group = (roster.find((r) => r.name === name) || {}).group || '';
    const next = {
      name, group, altPct: bestPct.altPct,
      altAmount: bestPct.altAmount != null ? Math.round(bestPct.altAmount * 10) / 10 : (bestAum && bestAum.aum ? null : null),
      // 다른 기사·시점의 운용자산이 대체투자 금액보다 작으면 서로 맞지 않으므로 운용자산은 비워 둔다
      aum: bestAum && !(bestPct.altAmount != null && bestPct.altAmount > bestAum.aum) ? Math.round(bestAum.aum * 10) / 10 : null,
      overseasAltPct: null, verified: false, basis: 'press',
      asOf: bestPct.asOf || `${bestPct.pub} 보도`, pub: bestPct.pub,
      source: `${bestPct.source} 보도`, sourceUrl: bestPct.sourceUrl,
      sourceNote: `“${bestPct.sentence}”${bestAum && bestAum.sourceUrl !== bestPct.sourceUrl ? ` · 운용자산: “${bestAum.sentence}”(${bestAum.source})` : ''}`,
      checkedAt: today,
    };
    if (inst) Object.assign(inst, next); else data.institutions.push({ ...next, trend: [] });
    changed++;
  }
  if (dry) return;
  for (const x of data.institutions) if (x.basis === 'press') x.checkedAt = today;
  data.note = '국민연금·KIC는 기관 공시 확정치, 그 밖의 기관은 최근 기사에 인용된 수치(보도 기준 — 기준 시점·근거 문장·출처 링크 함께 표시)입니다. 매주 월요일 자동 확인하며, 공시 확정치는 기사로 덮어쓰지 않습니다.';
  data.institutions.sort((a, b) => (b.verified ? 1 : 0) - (a.verified ? 1 : 0) || b.altPct - a.altPct);
  await writeFile(path, JSON.stringify(data, null, 2) + '\n');
  console.log(`allocations.json: ${changed}개 기관 갱신`);
}

if (process.argv[1] && process.argv[1].endsWith('lp-refresh.mjs')) main().catch((e) => { console.error(e); process.exit(1); });
