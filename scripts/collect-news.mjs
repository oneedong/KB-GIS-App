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
import { readFile, writeFile } from 'fs/promises';

// 여러 출처를 폭넓게 모으기 위한 검색어 (한국어 + 영어). Google 뉴스가
// 한경·더벨·Bloomberg·PERE 등 다양한 매체를 한 번에 묶어 돌려줍니다.
const QUERIES = [
  '국민연금 대체투자', '공제회 출자', '해외 대체투자 출자', '사모대출 펀드',
  '인프라 펀드 출자', '데이터센터 투자', '사모펀드 출자', '연기금 CIO 선임',
  'pension "private credit" fund', '"private equity" pension commitment',
  'infrastructure fund commitment', 'real estate fund final close',
  'Blackstone OR Ares OR KKR OR Apollo fund', 'CalPERS OR APG OR CPPIB CIO',
];

// ── (선택) 무료 LLM 요약: Google Gemini ──────────────────
// GEMINI_API_KEY(무료 등급)가 있으면 새 기사에 진짜 한국어 3줄 요약을 붙입니다.
// 키가 없으면 아래 enrich()의 추출식 요약을 그대로 씁니다.
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = 'gemini-1.5-flash';
const LLM_BUDGET = 40; // 한 번 실행당 요약할 신규 기사 수 상한 (무료 한도 보호)

async function llmSummarize(title, body) {
  if (!GEMINI_API_KEY) return null;
  const prompt = `다음 해외 대체투자 뉴스를 한국어 3줄로 요약해줘. 각 줄은 핵심만 담은 완결된 한 문장으로, 불릿/번호 없이 줄바꿈으로만 구분해줘.\n\n제목: ${title}\n내용: ${body}`;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 220 } }) }
    );
    if (!res.ok) return null;
    const j = await res.json();
    const text = (((j.candidates || [])[0] || {}).content || {}).parts?.[0]?.text || '';
    const lines = text.split('\n').map(s => s.replace(/^[\s\-*\d.)]+/, '').trim()).filter(Boolean).slice(0, 3);
    return lines.length ? lines : null;
  } catch (e) { return null; }
}

// ── 분류 사전 ────────────────────────────────────────────
const INSTS = [
  [/국민연금|national pension|\bNPS\b/i, '국민연금', '연기금'],
  [/한국투자공사|\bKIC\b/i, 'KIC', '연기금'],
  [/사학연금/i, '사학연금', '연기금'],
  [/교직원공제회|the-?k\b/i, '교직원공제회', '공제회'],
  [/행정공제회|\bPOBA\b/i, '행정공제회', '공제회'],
  [/군인공제회|\bMMAA\b/i, '군인공제회', '공제회'],
  [/과학기술인공제회|노란우산/i, '과학기술인공제회', '공제회'],
  [/삼성생명|한화생명|교보생명|생명보험|life insurance/i, '보험사', '보험사'],
  [/미래에셋자산운용|미래에셋운용/i, '미래에셋자산운용', '자산운용사'],
  [/미래에셋증권|한국투자증권|삼성증권|증권/i, '증권사', '증권사'],
  [/blackstone|블랙스톤/i, 'Blackstone', '해외 GP'],
  [/\bares\b|에어리스/i, 'Ares', '해외 GP'],
  [/\bKKR\b/i, 'KKR', '해외 GP'],
  [/apollo|아폴로/i, 'Apollo', '해외 GP'],
  [/brookfield|브룩필드/i, 'Brookfield', '해외 GP'],
  [/carlyle|칼라일/i, 'Carlyle', '해외 GP'],
  [/calpers|캘퍼스/i, 'CalPERS', '해외 GP'],
  [/calstrs/i, 'CalSTRS', '해외 GP'],
  [/\bAPG\b/i, 'APG', '해외 GP'],
  [/cppib|cpp investments/i, 'CPPIB', '해외 GP'],
  [/\bGIC\b|temasek|테마섹/i, 'GIC', '해외 GP'],
];
const ASSETS = [
  ['IN', /인프라|infrastructure|재생에너지|renewable|태양광|풍력|발전|data ?cent|데이터센터|통신탑|toll|airport|공항/i],
  ['PC', /사모대출|private credit|direct lending|다이렉트 렌딩|메자닌|mezzanine|private debt|사모채권/i],
  ['RE', /부동산|real estate|오피스|office|물류|logistics|호텔|hotel|리테일|retail|멀티패밀리|multifamily|임대주택/i],
  ['PE', /사모펀드|private equity|바이아웃|buyout|세컨더리|secondaries|\bPE\b|growth equity/i],
];
const REGIONS = [
  ['US', /미국|u\.?s\.?\b|뉴욕|new york|북미|north america/i],
  ['EU', /유럽|europe|영국|\bUK\b|런던|london|독일|german|프랑스|france|\bEU\b/i],
  ['AP', /아시아|asia|일본|japan|중국|china|인도|india|싱가포르|singapore|호주|australia/i],
];
const PEOPLE_RE = /인사|\bCIO\b|선임|영입|퇴임|사임|appoint|names?\b|hire|steps? down|join/i;

// ── 유틸 ────────────────────────────────────────────────
function decodeEntities(s = '') {
  return s
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&amp;/g, '&');
}
function stripTags(s = '') { return decodeEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim(); }
function tag(block, name) { const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i')); return m ? m[1].trim() : ''; }
function hasHangul(s = '') { return /[가-힣]/.test(s); }
function hashId(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return 'g' + (h >>> 0).toString(36); }

function pick(pairs, text, def) { for (const [key, re] of pairs) if (re.test(text)) return key; return def; }
function pickInst(text) { for (const [re, name, type] of INSTS) if (re.test(text)) return { inst: name, instType: type }; return null; }

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
  const k = new Date(d.getTime() + 9 * 3600 * 1000); // KST
  const mm = String(k.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(k.getUTCDate()).padStart(2, '0');
  const hh = String(k.getUTCHours()).padStart(2, '0');
  const mi = String(k.getUTCMinutes()).padStart(2, '0');
  return { date: `${mm}.${dd}`, time: `${hh}:${mi}`, iso: d.toISOString() };
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
    // Google 뉴스 제목은 "제목 - 출처" 형태 → 출처 분리
    const dash = title.lastIndexOf(' - ');
    if (dash > 0 && !source) source = title.slice(dash + 3).trim();
    if (dash > 0) title = title.slice(0, dash).trim();
    if (!title || !link) continue;
    items.push({ title, link, pub, desc, source: source || '출처 미상' });
  }
  return items;
}

export function enrich(raw) {
  const text = `${raw.title} ${raw.desc}`;
  const lang = hasHangul(raw.title) ? 'ko' : 'en';
  const instHit = pickInst(text);
  const inst = instHit ? instHit.inst : raw.source;
  const instType = instHit ? instHit.instType : '기타';
  const asset = pick(ASSETS, text, 'PE');
  const region = pick(REGIONS, text, 'GL');
  let cat = instType === '해외 GP' ? 'GP' : 'LP';
  if (PEOPLE_RE.test(text)) cat = '인사';
  const { date, time, iso } = kstParts(raw.pub);
  const sentences = (raw.desc || raw.title)
    .split(/(?<=[.!?。])\s+|(?<=다\.)\s*/)
    .map(s => s.trim()).filter(Boolean).slice(0, 3);
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
    enBody: lang === 'en' ? (raw.desc || '') : null,
    url: raw.link,
  };
}

function dedupe(list) {
  const seen = new Set(), out = [];
  for (const a of list) {
    const key = a.id + '|' + a.ko.slice(0, 40);
    if (seen.has(key) || seen.has(a.ko)) continue;
    seen.add(key); seen.add(a.ko); out.push(a);
  }
  return out;
}

async function fetchQuery(q) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=ko&gl=KR&ceid=KR:ko`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 KBGIS-collector' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${q}`);
  return parseFeed(await res.text());
}

async function main() {
  if (process.argv.includes('--selftest')) return selftest();

  let all = [];
  for (const q of QUERIES) {
    try { all = all.concat((await fetchQuery(q)).map(enrich)); }
    catch (e) { console.warn('skip:', q, '-', e.message); }
  }
  // 기존 아카이브와 합쳐 누적 (오래된 기사 유지)
  let prev = [];
  try { prev = JSON.parse(await readFile(new URL('../news.json', import.meta.url), 'utf8')); } catch {}

  // 무료 LLM 요약 (키가 있을 때만, 신규 기사 위주로 상한 내에서)
  if (GEMINI_API_KEY) {
    const prevIds = new Set(prev.map(p => p.id));
    let budget = LLM_BUDGET, done = 0;
    for (const a of all) {
      if (budget <= 0) break;
      if (prevIds.has(a.id)) continue;
      const s = await llmSummarize(a.ko, a.body);
      if (s) { a.ai = s; a.aiSource = 'llm'; budget--; done++; }
    }
    console.log(`LLM summaries added: ${done}`);
  }

  const merged = dedupe([...all, ...prev])
    .sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0))
    .slice(0, 400); // 아카이브 상한
  await writeFile(new URL('../news.json', import.meta.url), JSON.stringify(merged, null, 0));
  console.log(`collected ${all.length}, archive now ${merged.length} articles`);
}

// 네트워크 없이 파서/분류 검증
function selftest() {
  const sample = `<rss><channel>
    <item><title>국민연금, 미국 멀티패밀리 메자닌 대출에 5억 달러($500M) 추가 배정 - 한국경제</title>
      <link>https://example.com/a1</link><pubDate>Fri, 26 Jun 2026 08:12:00 GMT</pubDate>
      <description>&lt;p&gt;국민연금공단이 미국 멀티패밀리 메자닌 대출에 5억 달러를 배정했다. 고금리 환경에서 인컴 확보가 목적이다.&lt;/p&gt;</description>
      <source url="https://hankyung.com">한국경제</source></item>
    <item><title>Blackstone closes €8B fund for European logistics platform - PERE</title>
      <link>https://example.com/a2</link><pubDate>Thu, 25 Jun 2026 13:00:00 GMT</pubDate>
      <description>Blackstone held a final close on an 8 billion euro fund targeting European logistics real estate.</description>
      <source url="https://perenews.com">PERE</source></item>
    <item><title>CalPERS head of private equity to step down in December - Buyouts</title>
      <link>https://example.com/a3</link><pubDate>Wed, 24 Jun 2026 16:00:00 GMT</pubDate>
      <description>The head of private equity at CalPERS is set to step down.</description></item>
  </channel></rss>`;
  const arts = parseFeed(sample).map(enrich);
  for (const a of arts) {
    console.log(`- [${a.cat}] ${a.inst}(${a.instType}) ${a.asset}/${a.region} ${a.lang} metric="${a.metric}" date=${a.date} ${a.time}`);
    console.log(`    ko: ${a.ko}`);
    console.log(`    ai: ${a.ai.length} lines, url=${a.url}`);
  }
  const ok = arts.length === 3
    && arts[0].inst === '국민연금' && arts[0].asset === 'PC' && arts[0].region === 'US' && arts[0].metric === '$500M'
    && arts[1].inst === 'Blackstone' && arts[1].cat === 'GP' && arts[1].lang === 'en'
    && arts[2].cat === '인사';
  console.log(ok ? '\nSELFTEST PASS' : '\nSELFTEST FAIL');
  if (!ok) process.exit(1);
}

// CLI 로 직접 실행할 때만 수집을 돌립니다 (import 시 부작용 방지).
if (process.argv[1] && process.argv[1].endsWith('collect-news.mjs')) {
  main().catch(e => { console.error(e); process.exit(1); });
}
