// @ts-nocheck
/*
 * KB GIS — 공용 데이터 도우미 (기사·기관·투자내역)
 * ui.tsx 다음에 로드된다. 화면 컴포넌트(profiles·article·app)가 함께 쓴다.
 */

// ─── 데이터 파일 ─────────────────────────────────────────────
const API = {
  news: './news.json',                 // 기사 목록(리드) — 3시간마다 수집기가 갱신
  alloc: './allocations.json',         // 기관별 대체투자 배분(공시)
  insights: './insights.json',         // CIO·실무 인사·AUM·지방이전·수익률(기사 자동 추출)
  market: './market.json',             // 데일리 시황(매일 08:00)
  briefIndex: './briefs/index.json',
  brief: (k) => `./briefs/${k}.json`,
  history: './history.json',           // 5년 추이
  roster: './institutions.json',       // 국내 LP 로스터
  lpProfiles: './lp-profiles.json',
  gpProfiles: './gp-profiles.json',
  fundraising: './fundraising.json',
  investments: './investments.json',   // 투자내역 누적 DB
};
const getJson = (url) => fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now()).then((r) => (r.ok ? r.json() : null)).catch(() => null);

// ─── 분류 ────────────────────────────────────────────────────
// 자산군 표기는 업계 용어 그대로(영문)
const ASSET = {
  RE: { label: 'Real Estate', en: 'Real Estate' },
  PC: { label: 'Private Credit', en: 'Private Credit' },
  PE: { label: 'Private Equity', en: 'Private Equity' },
  IN: { label: 'Infrastructure', en: 'Infrastructure' },
  AV: { label: 'Aviation', en: 'Aviation' },
};
const REGION = { US: '미국', EU: '유럽', AP: '아시아', GL: '글로벌' };
const CAT_LABEL = { LP: '국내 LP', GP: '해외 GP', '인사': '인사', '마켓': '시장', '이전': '지방이전' };
const GROUPS = ['연기금', '공제회', '중앙회', '은행', '보험·캐피탈', '운용·증권'];
function grp(t) {
  if (['연기금', '공제회', '중앙회', '은행'].includes(t)) return t;
  if (t === '자산운용사' || t === '증권사') return '운용·증권';
  if (t === '보험사' || t === '캐피탈') return '보험·캐피탈';
  if (t === '해외 GP') return 'Global GP';
  return '기타';
}

// ─── 텍스트 ──────────────────────────────────────────────────
// 제목·출처 등 한 줄 텍스트 정리(HTML 엔티티 제거). 본문은 문단 구분을 살려야 하므로 쓰지 않는다.
function clean(s) {
  if (s == null) return s;
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&nbsp;/g, ' ').replace(/&middot;/g, '·').replace(/&hellip;/g, '…')
    .replace(/&mdash;/g, '—').replace(/&quot;|&ldquo;|&rdquo;/g, '"').replace(/&#39;|&apos;|&rsquo;|&lsquo;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
// 본문용 — 엔티티만 풀고 줄바꿈은 유지
function cleanBody(s) {
  if (!s) return '';
  return String(s)
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
function isRealArticle(a) {
  return !!(a && a.url && /^https?:\/\//i.test(a.url) && !/(^|\/\/)kbgis\.app/i.test(a.url));
}

// ─── 날짜 ────────────────────────────────────────────────────
const pad2 = (n) => String(n).padStart(2, '0');
function kstYMD(ms) {
  const k = new Date(ms + 9 * 3600 * 1000);
  return { y: k.getUTCFullYear(), m: k.getUTCMonth() + 1, d: k.getUTCDate(), w: k.getUTCDay() };
}
function itemMs(it) {
  if (it && it.ts) { const t = Date.parse(it.ts); if (!isNaN(t)) return t; }
  if (it && it.date) {
    const [mm, dd] = String(it.date).split('.').map(Number);
    const [hh, mi] = String(it.time || '00:00').split(':').map(Number);
    return Date.UTC(new Date().getUTCFullYear(), (mm || 1) - 1, dd || 1, (hh || 0) - 9, mi || 0);
  }
  return 0;
}
function sortArticles(list) {
  return list.slice().sort((a, b) => itemMs(b) - itemMs(a));
}
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const dayKeyOf = (ms) => { const { y, m, d } = kstYMD(ms); return `${y}-${m}-${d}`; };
function dayLabel(ms) {
  const now = Date.now();
  const k = dayKeyOf(ms);
  if (k === dayKeyOf(now)) return '오늘';
  if (k === dayKeyOf(now - 86400000)) return '어제';
  const { y, m, d, w } = kstYMD(ms);
  const thisYear = kstYMD(now).y === y;
  return `${thisYear ? '' : y + '년 '}${m}월 ${d}일 ${WEEK[w]}요일`;
}
function fmtDate(ms) {
  const { y, m, d } = kstYMD(ms);
  return `${y}.${pad2(m)}.${pad2(d)}`;
}
// 목록용 짧은 시각: 오늘은 시:분, 그 외는 월.일
function shortWhen(it) {
  const ms = itemMs(it);
  if (dayKeyOf(ms) === dayKeyOf(Date.now())) return it.time || '';
  const { m, d } = kstYMD(ms);
  return `${pad2(m)}.${pad2(d)}`;
}

// ─── 숫자 ────────────────────────────────────────────────────
const fmtJo = (v) => (v == null ? '–' : (v >= 100 ? Math.round(v).toLocaleString('ko-KR') : (Math.round(v * 10) / 10)) + '조원');
const fmtPct = (v) => (v == null ? '–' : (Math.round(v * 10) / 10) + '%');

// ─── 투자내역 ────────────────────────────────────────────────
// 같은 딜을 여러 매체가 보도하면 한 건으로 묶는다: 같은 기관·같은 행위이고 10일 안에 나왔으며
// 금액이 같거나 제목의 고유 단어가 충분히 겹치면 같은 딜로 본다.
const DEAL_STOP = new Set(('the and for to of in on with its by as at from new fund funds private capital markets market launches launch launched announces announced ' +
  'closes closed close raises raised buys buy acquires acquire acquired deal deals stake inc llc ltd group partners management invests invest investment ' +
  'first final record largest over more than billion million bn mn 인수 매각 투자 출자 펀드 결성 완료 추진 검토 규모 달러 억 조 원').split(' '));
const GENERIC_CAPS = /^(?:Fund|Funds|Private|Markets?|Capital|Partners|Group|Energy|Infrastructure|Real|Estate|Logistics|Credit|Equity|Global|Asia|Europe|European|America|American|North|South|Data|Center|Centers|Investors?|Investment|Holdings|Management|Asset|Assets|Company|Platform|Portfolio|Strategic|Secondaries|Secondary|Growth|Buyout|Japan|Korea|China|India)$/;
function dealTokens(e) {
  const instWords = String(e.inst || '').toLowerCase().split(/\s+/);
  const t = String(e.title || '');
  const words = t.toLowerCase().replace(/[^0-9a-z가-힣]+/g, ' ').split(' ').filter((w) => w.length >= 2 && !DEAL_STOP.has(w) && !instWords.includes(w));
  const caps = (t.match(/\b[A-Z][A-Za-z0-9]{3,}\b/g) || []).filter((w) => !GENERIC_CAPS.test(w) && !instWords.includes(w.toLowerCase()));
  return { set: new Set(words), caps: new Set(caps.map((w) => w.toLowerCase())) };
}
const normAmt = (a) => String(a || '').toLowerCase().replace(/\s+/g, '').replace(/us\$/, '$');
function clusterDeals(list) {
  const out = [];
  for (const e of list) {
    const ms = itemMs(e);
    const tk = dealTokens(e);
    const c = out.find((c) => {
      if (c.inst !== e.inst || c.kind !== e.kind || Math.abs(c.ms - ms) > 10 * 86400000) return false;
      if (e.amount && c.amounts.has(normAmt(e.amount))) return true;
      let inter = 0; tk.set.forEach((w) => { if (c.tk.has(w)) inter++; });
      if (inter / Math.max(1, Math.min(tk.set.size, c.tk.size)) >= 0.5) return true;
      let capHit = false; tk.caps.forEach((w) => { if (c.caps.has(w)) capHit = true; });
      return capHit;
    });
    if (c) {
      c.items.push(e);
      if (e.amount) c.amounts.add(normAmt(e.amount));
      tk.set.forEach((w) => c.tk.add(w)); tk.caps.forEach((w) => c.caps.add(w));
      if (!c.lead.amount && e.amount) c.lead = e;
      if (e.overseas) c.overseas = true;
      continue;
    }
    out.push({ key: e.key, inst: e.inst, role: e.role, kind: e.kind, ms, tk: tk.set, caps: tk.caps, amounts: new Set(e.amount ? [normAmt(e.amount)] : []), lead: e, items: [e], overseas: !!e.overseas });
  }
  return out;
}
// 행위 묶음(필터용)
const DEAL_FILTERS = [
  ['all', '전체', null],
  ['commit', '출자·결성', /펀드 출자|출자 유치|펀드 결성|출자사업|위탁운용사 선정|공동투자/],
  ['buy', '인수·투자', /인수|투자|세컨더리/],
  ['sell', '매각', /매각/],
  ['credit', '대출', /대출/],
];
