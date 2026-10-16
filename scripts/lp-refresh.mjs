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
const BAD_CTX = /수익률|수익|성과|목표|계획|까지\s*(?:확대|늘|높)|늘릴|높일|확대할|전망|예정|평균|업계/;
// 한 문장에서 대체투자 비중(%)·대체투자 금액·운용자산(조원)을 뽑는다(없으면 null)
export function extractFigures(sent) {
  const s = String(sent || '').replace(/\s+/g, ' ');
  const out = {};
  if (/대체(?:투자|자산)/.test(s)) {
    let m = s.match(/대체(?:투자|자산)(?:\s*(?:자산|부문))?\s*(?:비중|비율)\s*(?:은|이|도|을|를)?\s*(?:약\s*)?(\d{1,2}(?:\.\d{1,2})?)\s*%/)
      || s.match(/(\d{1,2}(?:\.\d{1,2})?)\s*%\s*(?:가|를|이|는)?\s*대체(?:투자|자산)/);
    if (m) {
      const around = s.slice(Math.max(0, (m.index || 0) - 24), (m.index || 0) + m[0].length + 24);
      const v = Number(m[1]);
      if (!BAD_CTX.test(around) && v >= 3 && v <= 95) out.altPct = v;
    }
    m = s.match(/대체(?:투자|자산)\s*(?:자산|규모|금액|투자액|잔액)?\s*(?:은|는|이|가)?\s*(?:약\s*)?(\d[\d,]*(?:\.\d+)?\s*조\s*(?:\d[\d,]*\s*억)?)\s*원/);
    if (m && !BAD_CTX.test(s.slice(Math.max(0, m.index - 10), m.index + m[0].length + 10))) { const v = joOf(m[1]); if (v && v >= 0.3 && v <= 600) out.altAmount = v; }
  }
  const a = s.match(/(?:총\s*자산|운용\s*자산|운용\s*규모|기금\s*(?:규모|적립금)|(?<!대체\s?)자산\s*규모|금융\s*자산|(?<!대체)투자\s*자산)\s*(?:은|는|이|가|을|를)?\s*(?:약\s*)?(\d[\d,]*(?:\.\d+)?\s*조\s*(?:\d[\d,]*\s*억)?)\s*원/);
  if (a && !/목표|전망|까지/.test(s.slice(a.index, a.index + a[0].length + 12))) { const v = joOf(a[1]); if (v && v >= 1 && v <= 2500) out.aum = v; }
  return Object.keys(out).length ? out : null;
}
// 기사 한 건(제목+본문)에서 기관 수치 찾기 — 기관명이 문장에 있거나, 제목에 있고 문장 주어가 생략된 경우
export function figuresFromArticle(title, body, aliases, pubYear) {
  const inTitle = aliases.some((x) => title.includes(x));
  const sents = `${title}. ${body}`.split(/(?<=다\.|\.)\s+|\n+/).map((x) => x.trim()).filter(Boolean);
  const found = [];
  for (const s of sents) {
    const named = aliases.some((x) => s.includes(x));
    if (!named && !(inTitle && /^(?:공제회|공단|연금|기금|본부)(?:는|은|의)|^(?:이|그)\s*(?:공제회|공단)/.test(s))) continue;
    // 다른 기관과 비교하는 문장("국민연금(16%)보다 높다")에서 다른 기관 수치를 가져오지 않도록 기관명이 둘 이상이면 건너뛴다
    if (TARGETS.filter(([, al]) => al.some((x) => s.includes(x))).length > 1 || (/국민연금/.test(s) && !aliases.includes('국민연금'))) continue;
    const f = extractFigures(s);
    if (f) found.push({ ...f, asOf: asOfOf(s, pubYear), sentence: s.slice(0, 220) });
  }
  return found;
}

function selftest() {
  const cases = [
    ['교직원공제회의 대체투자 비중은 62.1%로 다른 공제회 대비 높은 편이다.', { altPct: 62.1 }],
    ['지난해 말 군인공제회 투자운용자산의 74.8%가 대체투자와 부동산이다.', { altPct: 74.8 }],
    ['사학연금의 금융자산 규모는 전년 대비 약 3조9000억원 증가한 29조7280억원으로 확대됐다.', null],
    ['2024년 말 기준 군인공제회 총자산은 약 20조4569억원으로 운용수익률은 7.2%다.', { aum: 20.4569 }],
    ['대체투자 수익률은 2024년 7.9%에서 지난해 6.2%로 내려앉았다.', null],
    ['공제회는 2029년까지 대체투자 비중을 85.2%로 확대한다는 목표를 세웠다.', null],
    ['지난해 말 국민연금 대체투자 자산은 232조6000억원으로 전년보다 25조7000억원 증가했다.', { altAmount: 232.6 }],
  ];
  let ok = true;
  for (const [s, exp] of cases) {
    const got = extractFigures(s);
    const pass = exp === null ? !got || (!got.altPct && !got.aum && !got.altAmount) : Object.entries(exp).every(([k, v]) => got && Math.abs(got[k] - v) < 0.001);
    if (!pass) { ok = false; console.log('FAIL', JSON.stringify(got), '<=', s); }
  }
  const asof = [asOfOf('지난해 말 군인공제회', 2026), asOfOf('2025년 9월말 총자산', 2026), asOfOf('2024년 말 기준', 2026)];
  if (asof.join('|') !== '2025년 말|2025년 9월 말|2024년 말') { ok = false; console.log('asOf FAIL', asof); }
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
    for (const q of [`${aliases[0]} 대체투자 비중`, `${aliases[0]} 운용자산 조원`]) {
      try { items.push(...(await search(q))); } catch (e) { console.warn(`검색 실패 ${name}: ${e.message}`); }
    }
    const seen = new Set();
    const cands = items.filter((it) => aliases.some((x) => it.title.includes(x)) && /대체|자산|기금|운용|수익률/.test(it.title))
      .filter((it) => (seen.has(it.title) ? false : seen.add(it.title)))
      .sort((x, y) => (Date.parse(y.pub) || 0) - (Date.parse(x.pub) || 0)).slice(0, 8);
    let bestPct = null, bestAum = null;
    for (const it of cands) {
      const pubMs = Date.parse(it.pub) || 0, pubYear = pubMs ? new Date(pubMs).getFullYear() : null;
      let url = it.link;
      try { url = await resolveGoogleNewsUrlAsync(it.link); } catch {}
      let body = '';
      if (!/news\.google\.com/.test(url)) { try { body = (await fetchArticleText(url, it.title)).text || ''; } catch {} }
      for (const f of figuresFromArticle(it.title, body || it.desc || '', aliases, pubYear)) {
        const rec = { ...f, source: it.source || '', sourceUrl: url, pub: pubMs ? new Date(pubMs).toISOString().slice(0, 10) : '' };
        if (f.altPct != null && (!bestPct || rec.pub > bestPct.pub)) bestPct = rec;
        if (f.aum != null && (!bestAum || rec.pub > bestAum.pub)) bestAum = rec;
      }
    }
    console.log(`${name}: 비중 ${bestPct ? `${bestPct.altPct}% (${bestPct.asOf || '보도 ' + bestPct.pub}, ${bestPct.source})` : '-'} · 운용자산 ${bestAum ? `${bestAum.aum.toFixed(1)}조 (${bestAum.asOf || '보도 ' + bestAum.pub}, ${bestAum.source})` : '-'}`);
    if (bestPct) console.log(`   └ "${bestPct.sentence}"`);
    if (dry || !bestPct) continue;
    let inst = data.institutions.find((x) => x.name === name);
    if (inst && inst.verified) continue;                       // 공시 확정 수치는 기사로 덮지 않는다
    if (inst && inst.pub && inst.pub >= bestPct.pub) continue;  // 이미 같은/더 새 기사 반영
    const group = (roster.find((r) => r.name === name) || {}).group || '';
    const next = {
      name, group, altPct: bestPct.altPct,
      altAmount: bestPct.altAmount != null ? Math.round(bestPct.altAmount * 10) / 10 : (bestAum && bestAum.aum ? null : null),
      aum: bestAum ? Math.round(bestAum.aum * 10) / 10 : null,
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
