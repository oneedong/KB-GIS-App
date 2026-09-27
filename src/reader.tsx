// @ts-nocheck
/*
 * KB GIS — 기사 전문 불러오기·정제 (브라우저)
 *
 * 1) 수집기가 확보한 전문: bodies/<id>.json (가장 빠르고 정확)
 * 2) 없으면 공개 CORS 프록시로 원문 페이지를 받아 브라우저에서 추출
 *    - Mozilla Readability(vendor/readability.js)로 본문 컨테이너를 찾고
 *    - article-clean.js(수집기와 같은 규칙)로 광고·관련기사·바이라인·사진설명·
 *      저작권 꼬리 등 기사와 무관한 텍스트를 걷어낸다.
 * 3) 받은 전문은 세션·localStorage 에 캐시해 다시 열 때 즉시 표시한다.
 */

// ─── 캐시 ───────────────────────────────────────────────────
const LS_BODY_KEY = 'kbgis.bodies';
const bodyCache = {};
const bodyStore = {
  get(id) { try { const m = JSON.parse(localStorage.getItem(LS_BODY_KEY) || '{}'); return (m[id] && m[id].b) || ''; } catch { return ''; } },
  set(id, body) {
    try {
      const m = JSON.parse(localStorage.getItem(LS_BODY_KEY) || '{}');
      m[id] = { b: body, t: Date.now() };
      const ks = Object.keys(m);
      if (ks.length > 150) ks.sort((a, b) => m[a].t - m[b].t).slice(0, ks.length - 150).forEach((k) => { delete m[k]; });
      localStorage.setItem(LS_BODY_KEY, JSON.stringify(m));
    } catch { /* 저장 공간 부족 등은 무시 */ }
  },
};

// ─── 정제 규칙 (article-clean.js 가 없을 때도 최소한 동작하도록 보조 규칙 유지) ──
const FOOTER_RE = /저작권법?|무단\s*(?:사용|전재|복사|배포)|재배포\s*금지|등록번호|사업자등록번호|등록일자|발행일자|발행인|편집인|정보보호\s*책임자|청소년\s*보호책임자|고충처리인|대표전화|보도원칙|반론이나\s*정정|추후보도/;
const RELATED_RE = /관련\s*기사|많이\s*본\s*뉴스|인기\s*기사|추천\s*기사|함께\s*본\s*기사|핫\s*클릭|실시간\s*뉴스|이\s*시각\s*(?:추천|인기|주요)|화제의\s*뉴스|기자\s*구독|댓글\s*정책/;
const SITE_BOILER = /No\.?1\s*종합|종합\s*경제지|빠르고,?\s*정확하게|정확하게\s*전달|대한민국\s*(대표|No\.?1)/;
const DEAD_PAGE_RE = /존재하지\s*않는\s*(?:링크|기사|페이지)|삭제된\s*기사|삭제\s*되었거나|기사를\s*찾을\s*수\s*없|페이지를\s*찾을\s*수\s*없|요청하신\s*페이지|page\s*not\s*found|404\s*not\s*found/i;

function isSentencey(s) {
  const t = String(s).trim();
  if (/(?:다|요)\.["'”’]?\s*$|[.!?]["'”’]?\s*$/.test(t)) return true;
  return t.length > 160 && /(?:다|요)\.|[.!?]/.test(t);
}
function looksJunky(s) {
  if (!s) return false;
  const t = String(s);
  if (SITE_BOILER.test(t.slice(0, 140))) return true;
  const ell = (t.match(/…|\.\.\./g) || []).length;
  return ell >= 4 && t.length < 3500;
}
// 문단 배열 정제 — 공용 규칙(ArticleClean) 우선
function cleanParas(paras, title) {
  const list = (paras || []).map((p) => String(p || '').trim()).filter(Boolean);
  if (typeof ArticleClean !== 'undefined') return ArticleClean.clean(list, { title }).paragraphs;
  return list.filter((p) => !FOOTER_RE.test(p) && !RELATED_RE.test(p.slice(0, 24)));
}
function cleanBodyText(text, title) {
  return cleanParas(String(text || '').replace(/\r/g, '').split(/\n+/), title).join('\n\n');
}

// ─── 원문 HTML → 본문 ────────────────────────────────────────
// JSON-LD 본문 / Readability / <p> 모음 세 후보를 정제해 가장 충실한 것을 쓴다.
function parseArticleHtml(html, title) {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const cands = [];
    // (1) JSON-LD articleBody
    for (const el of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))) {
      let data; try { data = JSON.parse(el.textContent); } catch { continue; }
      const nodes = [];
      const push = (x) => { if (Array.isArray(x)) x.forEach(push); else if (x && typeof x === 'object') nodes.push(x); };
      push(Array.isArray(data) ? data : (data['@graph'] || data));
      for (const n of nodes) {
        if (n.articleBody && String(n.articleBody).trim().length > 120) cands.push(cleanParas(String(n.articleBody).split(/\n+/), title));
      }
    }
    // (2) Readability — 본문 컨테이너 추출(광고·위젯 블록 배제)
    if (typeof Readability !== 'undefined') {
      try {
        const art = new Readability(doc.cloneNode(true), { charThreshold: 200 }).parse();
        if (art && art.content) {
          const d2 = new DOMParser().parseFromString(`<div id="kbgis-root">${art.content}</div>`, 'text/html');
          const root = d2.getElementById('kbgis-root');
          const blocks = (typeof ArticleClean !== 'undefined') ? ArticleClean.paragraphsFromNode(root) : Array.from(root.querySelectorAll('p')).map((p) => p.textContent);
          cands.push(cleanParas(blocks, title));
        }
      } catch { /* 다음 후보로 */ }
    }
    // (3) 본문 컨테이너의 <p> (최후 수단)
    const scopes = Array.from(doc.querySelectorAll('article, [itemprop~="articleBody"], [class*="article"], [id*="article"], [class*="news_"], [class*="view_"], [class*="content"]'));
    let best = null, bestLen = 0;
    for (const sc of scopes) {
      const len = Array.from(sc.querySelectorAll('p')).reduce((n, p) => n + p.textContent.trim().length, 0);
      if (len > bestLen) { bestLen = len; best = sc; }
    }
    const ps = Array.from((bestLen > 250 ? best : doc).querySelectorAll('p')).map((p) => p.textContent.replace(/\s+/g, ' ').trim()).filter((s) => s.length > 30 && isSentencey(s));
    if (ps.length) cands.push(cleanParas(ps, title));

    let pick = null, score = -1;
    for (const c of cands) {
      const sc = c.join('').length + Math.min(c.length, 10) * 40;
      if (sc > score) { score = sc; pick = c; }
    }
    const out = pick ? pick.join('\n\n').slice(0, 12000) : '';
    return looksJunky(out) ? '' : out;
  } catch { return ''; }
}

// r.jina.ai 리더 출력(마크다운) → 문단
function parseReaderText(t) {
  if (!t) return '';
  const s = String(t)
    .replace(/^(Title|URL Source|Published Time|Warning):.*$/gm, '')
    .replace(/^Markdown Content:\s*$/m, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  const paras = s.split(/\n{2,}/).map((x) => x.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((x) => x.length > 30 && !/^[#>*\-|=]/.test(x) && /[가-힣a-zA-Z]{5,}/.test(x) && isSentencey(x));
  const out = cleanParas(paras).join('\n\n').slice(0, 12000);
  return looksJunky(out) ? '' : out;
}

// 응답 바이트 → 문자열 (EUC-KR 등 인코딩 감지 — 국내 언론사 일부는 아직 EUC-KR)
function decodeBytes(buf, contentType) {
  const bytes = new Uint8Array(buf);
  let cs = (String(contentType || '').match(/charset=["']?([\w-]+)/i) || [])[1] || '';
  if (!cs) {
    const head = new TextDecoder('latin1').decode(bytes.slice(0, 4096));
    cs = (head.match(/<meta[^>]+charset=["']?([\w-]+)/i) || [])[1] || '';
  }
  cs = cs.toLowerCase();
  if (/^(?:euc-?kr|ks_c_5601-1987|cp949|x-windows-949|ms949)$/.test(cs)) cs = 'euc-kr';
  try { return new TextDecoder(cs || 'utf-8').decode(bytes); } catch { return new TextDecoder('utf-8').decode(bytes); }
}

// 공개 CORS 프록시 — 모두 동시에 시도해 가장 먼저 성공한 본문을 쓴다.
const CORS_PROXIES = [
  { mk: (u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u), kind: 'html' },
  { mk: (u) => 'https://r.jina.ai/' + u, kind: 'text' },
  { mk: (u) => 'https://corsproxy.io/?url=' + encodeURIComponent(u), kind: 'html' },
  { mk: (u) => 'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent(u), kind: 'html' },
];
async function fetchBodyViaProxies(url, signal, title) {
  let sawDead = false;
  const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));
  const attempt = async (p) => {
    const r = await Promise.race([fetch(p.mk(url), { signal }), timeout(9000)]);
    if (!r.ok) throw new Error('http');
    const raw = p.kind === 'text'
      ? await Promise.race([r.text(), timeout(6000)])
      : decodeBytes(await Promise.race([r.arrayBuffer(), timeout(6000)]), r.headers.get('content-type'));
    const body = p.kind === 'text' ? parseReaderText(raw) : parseArticleHtml(raw, title);
    if (body && body.length > 120) return body;
    if (DEAD_PAGE_RE.test(String(raw).slice(0, 8000))) sawDead = true;
    throw new Error('empty');
  };
  const attempts = CORS_PROXIES.map((p) => attempt(p));
  try {
    const body = typeof Promise.any === 'function'
      ? await Promise.any(attempts)
      : await new Promise((res, rej) => { let left = attempts.length; attempts.forEach((a) => a.then(res, () => { if (--left === 0) rej(new Error('all')); })); });
    return { body, dead: false };
  } catch { return { body: '', dead: sawDead }; }
}

// 기사 전문 로드 — 캐시 → bodies/ → 프록시 순
async function loadArticleBody(sel, signal) {
  if (bodyCache[sel.id]) return { body: bodyCache[sel.id], src: 'cache' };
  const stored = bodyStore.get(sel.id);
  if (stored) { bodyCache[sel.id] = stored; return { body: stored, src: 'cache' }; }
  if (sel.b) {
    try {
      const r = await fetch(`./bodies/${sel.id}.json`, { signal });
      if (r.ok) {
        const j = await r.json();
        if (j && j.body) { const b = cleanBodyText(j.body, sel.ko); bodyCache[sel.id] = b; return { body: b, src: 'archive' }; }
      }
    } catch { /* 프록시로 */ }
  }
  if (!sel.url || /news\.google\.com/i.test(sel.url) || !/^https?:\/\//i.test(sel.url)) return { body: '', src: '' };
  const r = await fetchBodyViaProxies(sel.url, signal, sel.ko);
  if (r.body) { bodyCache[sel.id] = r.body; bodyStore.set(sel.id, r.body); }
  return { body: r.body, dead: r.dead, src: r.body ? 'live' : '' };
}

// 본문 문자열 → 읽기 좋은 문단 배열. 개행이 없는 옛 본문은 2~3문장씩 묶는다.
function toParagraphs(text, title) {
  if (!text) return [];
  let t = String(text).replace(/\r/g, '').trim();
  t = t.replace(/(다\.|요\.)(?=[가-힣A-Za-z"'‘“])/g, '$1 ');          // "…했다.다음" 붙음 정리
  let paras = /\n/.test(t) ? t.split(/\n+/) : [t];
  // 한 덩어리 본문은 문장 단위로 쪼개 문단을 만든다
  paras = paras.flatMap((p) => {
    if (p.length < 420) return [p];
    const ss = splitSentences(p);
    const out = []; let buf = [];
    for (const s of ss) { buf.push(s); if (buf.length >= 3 || buf.join(' ').length > 220) { out.push(buf.join(' ')); buf = []; } }
    if (buf.length) out.push(buf.join(' '));
    return out;
  });
  paras = cleanParas(paras, title);
  // 마지막 문단이 문장 중간에서 끊긴 리드면 말줄임 표시
  if (paras.length) {
    const last = paras[paras.length - 1];
    if (last.length <= 160 && !isSentencey(last) && !/…$/.test(last)) paras[paras.length - 1] = last.replace(/[\s·,]+$/, '') + '…';
  }
  return paras;
}

// ─── 핵심 문장 (형광펜) ─────────────────────────────────────
// 금액·비율 + 출자/인수/선임 같은 행위 + 기사 주체 기관이 함께 있는 문장이 핵심이다.
const AMOUNT_RE = /[\d,.]+\s*(?:조|억|만)\s*(?:원|달러|유로|파운드|엔)|\$\s?[\d,.]+\s*(?:billion|million|bn|mn|m\b|b\b)?|€\s?[\d,.]+|£\s?[\d,.]+|[\d.]+\s*%|[\d,.]+\s*(?:billion|million)\b|[\d,.]+\s*bp\b/i;
const KEY_ACTION_RE = /출자|약정|커밋|결성|클로징|클로즈|조성|모집|인수|매각|매입|투자하|투자한다|투자했|선임|임명|내정|취임|영입|증자|자본\s*확충|배정|배분|계약|체결|확보|돌파|기록했|급증|급감|확대|철회|무산|합의|출범|설립|진출|선정|final\s*close|acquir|invest|appoint|raise[sd]?|commit/i;
function scoreKeySentence(s, inst) {
  let sc = 0;
  if (AMOUNT_RE.test(s)) sc += 3;
  if (KEY_ACTION_RE.test(s)) sc += 2;
  if (inst && inst !== '출처 미상' && s.includes(inst)) sc += 1;
  if (/CIO|기금이사|운용본부장|최고투자책임자/.test(s)) sc += 1;
  return sc;
}
// 문장 나누기 — 구형 iOS 사파리에서도 동작하도록 lookbehind 정규식을 쓰지 않는다.
// "3.5%", "U.S." 같은 약어 속 마침표에서는 자르지 않는다(마침표 뒤 공백 + 다음 글자가 있어야 끊음).
function splitSentences(p) {
  return String(p)
    .replace(/(다\.|요\.|[.!?。]["'”’)]?)\s+(?=[가-힣A-Z0-9"'“‘(\[])/g, '$1\u0001')
    .split('\u0001').map((s) => s.trim()).filter(Boolean);
}
// 문단 → 문장 배열, 핵심 문장 키 집합(최대 3개, 3점 이상)
function keySentences(paragraphs, inst) {
  const paraSents = paragraphs.map((p) => splitSentences(p));
  const cands = [];
  paraSents.forEach((ss, pi) => ss.forEach((s, si) => {
    const sc = scoreKeySentence(s, inst);
    if (sc >= 3 && s.length >= 20 && s.length <= 320) cands.push({ pi, si, sc });
  }));
  cands.sort((a, b) => b.sc - a.sc || a.pi - b.pi || a.si - b.si);
  return { paraSents, hl: new Set(cands.slice(0, 3).map((c) => c.pi + ':' + c.si)) };
}

// 소제목 판정 — 짧고 문장이 아니며 바로 뒤에 본문 문단이 이어지는 줄
function isSubhead(p, next) {
  const t = String(p || '').trim();
  return t.length >= 4 && t.length <= 60 && !isSentencey(t) && !!next && String(next).length > t.length;
}

// ─── 용어 표시 ───────────────────────────────────────────────
// 기사 전체에서 용어마다 '처음 나온 한 곳'에만 점선 밑줄을 긋는다(최대 limit 개).
// 반환: 문장 문자열 → [{ t: '문자열' } | { t: '매칭', g: 용어 }] 조각 배열을 만드는 함수
function makeTermMarker(limit = 12) {
  const used = new Set();
  const globals = GLOSSARY.map((g) => ({ g, re: new RegExp(g.aliases.source, g.aliases.flags.replace('g', '')) }));
  return function mark(text) {
    const parts = [];
    let rest = String(text);
    while (rest && used.size < limit) {
      let best = null;
      for (const { g, re } of globals) {
        if (used.has(g.id)) continue;
        const m = rest.match(re);
        if (m && m[0] && (!best || m.index < best.idx || (m.index === best.idx && m[0].length > best.len))) best = { g, idx: m.index, len: m[0].length };
      }
      if (!best) break;
      if (best.idx > 0) parts.push({ t: rest.slice(0, best.idx) });
      parts.push({ t: rest.slice(best.idx, best.idx + best.len), g: best.g });
      used.add(best.g.id);
      rest = rest.slice(best.idx + best.len);
    }
    if (rest) parts.push({ t: rest });
    return parts;
  };
}
