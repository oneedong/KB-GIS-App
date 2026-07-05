// @ts-nocheck
/*
 * KB GIS — 해외대체투자 시장뉴스 앱
 * Authored in JSX, transpiled to plain JS by tsc (--jsx react).
 * React / ReactDOM are loaded globally from CDN in index.html.
 */
const { useState, useRef, useEffect } = React;

// ─── Persistence (localStorage) ───────────────────────────
// Bookmarks (관심), read history, and the article archive all persist locally
// so nothing disappears between sessions and the archive keeps accumulating.
const LS_PREFIX = 'kbgis.';
const store = {
  get(key, def) { try { const v = localStorage.getItem(LS_PREFIX + key); return v == null ? def : JSON.parse(v); } catch (e) { return def; } },
  set(key, val) { try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(val)); } catch (e) {} },
};

// News feed: a JSON archive refreshed by the scheduled collector
// (scripts/collect-news.mjs via GitHub Actions). Fetched on launch and merged
// into the local archive. Set to '' to run on bundled seed data only.
const NEWS_API = './news.json';
// LP 기관별 대체투자 배분 데이터 (공개 공시 기반). 수동으로 갱신 가능한 JSON.
const ALLOC_API = './allocations.json';
// CIO·자산군 수익률 인사이트 (수집기가 뉴스에서 자동 추출·갱신 — insights.json)
const INSIGHTS_API = './insights.json';
// 국내 LP 기관 전체 로스터 (업권별 목록) — institutions.json
const INSTITUTIONS_API = './institutions.json';
// Placement agent 관점의 국내 LP 프로필 (설립연도·AUM·운용방식 등) — lp-profiles.json
const LP_PROFILES_API = './lp-profiles.json';

// 실제 외부 원문 링크가 있는 기사만 유효로 본다. 과거 시드/하드코딩 기사는
// 링크가 없으므로 걸러진다(브라우저 localStorage 에 남은 옛 가짜 기사 제거).
function isRealArticle(a) {
  return !!(a && a.url && /^https?:\/\//i.test(a.url) && !/(^|\/\/)kbgis\.app/i.test(a.url));
}

// Newest first, by date ('MM.DD') then time ('HH:MM').
function sortArticles(list) {
  return list.slice().sort((a, b) => {
    const ka = (a.date || '') + ' ' + (a.time || '');
    const kb = (b.date || '') + ' ' + (b.time || '');
    return ka < kb ? 1 : ka > kb ? -1 : 0;
  });
}

// KST calendar parts from epoch ms.
function kstYMD(ms) {
  const k = new Date(ms + 9 * 3600 * 1000);
  return { y: k.getUTCFullYear(), m: k.getUTCMonth() + 1, d: k.getUTCDate() };
}
// Best epoch (ms) for an article: prefer ISO ts, else current-year MM.DD + HH:MM.
function itemMs(it) {
  if (it.ts) { const t = Date.parse(it.ts); if (!isNaN(t)) return t; }
  if (it.date) {
    const [mm, dd] = String(it.date).split('.').map(Number);
    const [hh, mi] = String(it.time || '00:00').split(':').map(Number);
    const y = new Date().getUTCFullYear();
    return Date.UTC(y, (mm || 1) - 1, dd || 1, (hh || 0) - 9, mi || 0);   // KST→UTC
  }
  return 0;
}
const pad2 = (n) => String(n).padStart(2, '0');

// Canonical share URL for an article.
function articleUrl(it) {
  if (!it) return 'https://oneedong.github.io/KB-GIS-App/';
  return it.url || 'https://oneedong.github.io/KB-GIS-App/';
}

const ASSET = {
  RE: { label: '부동산',         code: 'Real Estate',     color: 'oklch(0.62 0.13 55)'  },
  PC: { label: 'Private Credit', code: '사모대출',         color: 'oklch(0.6 0.12 210)'  },
  PE: { label: 'Private Equity', code: '사모펀드',         color: 'oklch(0.58 0.13 290)' },
  IN: { label: '인프라',         code: 'Infrastructure',  color: 'oklch(0.58 0.12 155)' },
  AV: { label: 'Aviation',       code: '항공기금융',       color: 'oklch(0.62 0.14 25)'  },
};
const REGION = { US: '미국', EU: '유럽', AP: '아시아', GL: '글로벌' };
const CAT_LABEL = { LP: '한국 LP 동향', GP: 'Global GP 동향', '인사': '조직·인사 이동', '마켓': '마켓 뉴스' };
// 국내 LP 업권 그룹
const GROUPS = ['연기금', '공제회', '중앙회', '은행', '보험·캐피탈', '운용·증권'];
// Global GP — 카테고리에서 운용사별로 바로 필터
const GP_NAMES = ['Blackstone', 'Apollo', 'KKR', 'BlackRock', 'Carlyle', 'Brookfield', 'Ares', 'EQT', 'CVC', 'TPG', 'Bain Capital', 'Partners Group', 'Oaktree', 'Blue Owl', 'Ardian', 'Stonepeak'];

// Remove any leftover HTML/entities from feed text (defensive — older archive
// entries collected before the parser fix may still contain markup).
function clean(s) {
  if (s == null) return s;
  let t = String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&nbsp;/g, ' ').replace(/&middot;/g, '·').replace(/&hellip;/g, '…')
    .replace(/&mdash;/g, '—').replace(/&quot;|&ldquo;|&rdquo;/g, '"').replace(/&#39;|&apos;|&rsquo;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&amp;/g, '&');
  t = t.replace(/<[^>]+>/g, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

function grp(t) {
  if (t === '연기금') return '연기금';
  if (t === '공제회') return '공제회';
  if (t === '중앙회') return '중앙회';
  if (t === '은행') return '은행';
  if (t === '자산운용사' || t === '증권사') return '운용·증권';
  if (t === '보험사' || t === '캐피탈') return '보험·캐피탈';
  if (t === '해외 GP') return 'Global GP';
  return '기타';
}

// 시드 데모 데이터는 제거되었습니다. 앱은 수집기가 채우는 news.json 의 실제
// 기사만 사용하며, 브라우저에 남은 옛 가짜 기사는 isRealArticle 로 걸러집니다.

// ─── Navbar ───────────────────────────────────────────────
function Navbar({ active, homeNew, isDesktop, onHome, onToday, onCategory, onKoreaLp, onSearch, onBookmarks }) {
  if (isDesktop) return null;          // 데스크톱은 좌측 사이드바를 사용
  const on = '#1c1d1f', off = '#b0b2b6';
  const tab = { display:'flex', flexDirection:'column', alignItems:'center', gap:4, cursor:'pointer', flex:1 };
  return (
    <div style={{flexShrink:0, height:64, background:'rgba(255,255,255,0.95)', backdropFilter:'blur(10px)', borderTop:'1px solid #ece9e2', display:'flex', alignItems:'center', justifyContent:'space-around', paddingBottom:'max(env(safe-area-inset-bottom), 6px)', boxSizing:'content-box'}}>
      <div onClick={onHome} style={tab}>
        <div style={{position:'relative', lineHeight:1}}>
          <span style={{fontSize:17, lineHeight:1, color:active==='home'?on:off}}>⌂</span>
          {homeNew > 0 && <span style={{position:'absolute', top:-5, right:-11, minWidth:15, height:15, padding:'0 3px', boxSizing:'border-box', borderRadius:999, background:'#e8392f', color:'#fff', font:'700 9px Pretendard', display:'flex', alignItems:'center', justifyContent:'center'}}>{homeNew > 99 ? '99+' : homeNew}</span>}
        </div>
        <span style={{font:'600 10px Pretendard', color:active==='home'?on:off}}>홈</span>
      </div>
      <div onClick={onToday} style={tab}>
        <span style={{fontSize:16, lineHeight:1, color:active==='today'?on:off}}>◷</span>
        <span style={{font:'600 10px Pretendard', color:active==='today'?on:off}}>오늘</span>
      </div>
      <div onClick={onCategory} style={tab}>
        <span style={{fontSize:16, lineHeight:1, color:active==='category'?on:off}}>▦</span>
        <span style={{font:'600 10px Pretendard', color:active==='category'?on:off}}>카테고리</span>
      </div>
      <div onClick={onKoreaLp} style={tab}>
        <span style={{fontSize:16, lineHeight:1, color:active==='korlp'?on:off}}>★</span>
        <span style={{font:'600 10px Pretendard', color:active==='korlp'?on:off}}>Korea LP</span>
      </div>
      <div onClick={onSearch} style={tab}>
        <span style={{fontSize:16, lineHeight:1, color:active==='search'?on:off}}>⌕</span>
        <span style={{font:'600 10px Pretendard', color:active==='search'?on:off}}>검색</span>
      </div>
      <div onClick={onBookmarks} style={tab}>
        <span style={{fontSize:15, lineHeight:1, color:active==='bookmarks'?on:off}}>▢</span>
        <span style={{font:'600 10px Pretendard', color:active==='bookmarks'?on:off}}>북마크</span>
      </div>
    </div>
  );
}

// ─── FeedItem ─────────────────────────────────────────────
function FeedItem({ item, onOpen, onBookmark, isNew, selected }) {
  return (
    <div onClick={onOpen} style={{display:'flex', gap:11, padding:'14px 18px', borderBottom:'1px solid #f3f1ea', cursor:'pointer', background:selected?'#fffaf0':undefined}}>
      <div style={{width:3, borderRadius:2, background:item.assetColor, flexShrink:0}}></div>
      <div style={{flex:1, minWidth:0}}>
        <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:5, flexWrap:'wrap'}}>
          <span style={{font:'700 10.5px Pretendard', color:'#1c1d1f', background:'#f0eee7', padding:'2px 7px', borderRadius:5}}>{item.inst}</span>
          <span style={{font:'600 10.5px Pretendard', color:item.assetColor}}>{item.assetLabel}</span>
          <span style={{font:'500 10.5px Pretendard', color:'#bcbec2'}}>{item.date} {item.time}</span>
          {isNew && <span style={{font:'700 8.5px Pretendard', color:'#9a7d12', background:'#FFCC00', borderRadius:4, padding:'1px 4px', letterSpacing:'.04em'}}>NEW</span>}
        </div>
        <div style={{font:'650 14px/1.42 Pretendard', letterSpacing:'-.01em'}}>{item.ko}</div>
        <div style={{display:'flex', alignItems:'center', gap:7, marginTop:8}}>
          <span style={{font:'600 10.5px Pretendard', color:'#1c1d1f', background:'#f2f0ea', padding:'3px 8px', borderRadius:5}}>{item.metric}</span>
          {item.lang === 'en' && <span style={{font:'700 9px Pretendard', color:'#56585c', border:'1px solid #ddd9cf', padding:'2px 5px', borderRadius:4, letterSpacing:'.04em'}}>EN 원문</span>}
          <span style={{font:'500 10.5px Pretendard', color:'#b6b8bc', marginLeft:'auto'}}>{item.source}</span>
        </div>
      </div>
      <div onClick={onBookmark} style={{flexShrink:0, alignSelf:'flex-start', fontSize:15, cursor:'pointer', color:'#cfccc4', padding:2}}>
        {item.bookmarked ? <span style={{color:'#1c1d1f'}}>▣</span> : <span>▢</span>}
      </div>
    </div>
  );
}

// ─── Allocation charts (dependency-free) ─────────────────
const fmtAmt = (v) => (v == null ? '–' : (v >= 100 ? Math.round(v) : (Math.round(v * 10) / 10))) + '조';
const fmtPct = (v) => (v == null ? '–' : (Math.round(v * 10) / 10)) + '%';

// Horizontal bars comparing 대체투자 비중 across institutions; the darker
// inner segment is the overseas portion of that allocation.
function AllocBars({ rows, selName, onSelect }) {
  const max = Math.max(...rows.map(r => r.altPct), 1);
  return (
    <div style={{display:'flex', flexDirection:'column', gap:11}}>
      {rows.map(r => {
        const full = r.altPct / max * 100;
        const overseas = r.altPct * (r.overseasAltPct || 0) / 100 / max * 100;
        const on = selName === r.name;
        return (
          <div key={r.name} onClick={() => onSelect(r.name)} style={{cursor:'pointer'}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:4}}>
              <span style={{font:on?'700 12.5px Pretendard':'600 12.5px Pretendard', color:on?'#1c1d1f':'#3d3e42'}}>{r.name}</span>
              <span style={{font:'700 12px Pretendard', color:'#1c1d1f'}}>{fmtPct(r.altPct)} <span style={{font:'500 10.5px Pretendard', color:'#a6a8ac'}}>· {fmtAmt(r.altAmount)}</span></span>
            </div>
            <div style={{position:'relative', height:13, borderRadius:7, background:'#f0eee7', overflow:'hidden'}}>
              <div style={{position:'absolute', inset:0, width:full+'%', background:'#FFE695', borderRadius:7}}></div>
              <div style={{position:'absolute', inset:0, width:overseas+'%', background:'#FFCC00', borderRadius:7}}></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Yearly trend line (대체투자 비중 %) for one institution.
function TrendChart({ trend }) {
  if (!trend || trend.length < 2) return null;
  const W = 320, H = 132, padL = 30, padR = 10, padT = 14, padB = 22;
  const pcts = trend.map(t => t.altPct);
  const lo = Math.floor(Math.min(...pcts) / 5) * 5;
  const hi = Math.ceil(Math.max(...pcts) / 5) * 5;
  const span = Math.max(hi - lo, 5);
  const x = (i) => padL + i * (W - padL - padR) / (trend.length - 1);
  const y = (v) => padT + (1 - (v - lo) / span) * (H - padT - padB);
  const pts = trend.map((t, i) => `${x(i)},${y(t.altPct)}`).join(' ');
  const area = `${padL},${H - padB} ${pts} ${x(trend.length - 1)},${H - padB}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{width:'100%', height:'auto', display:'block'}}>
      {[lo, lo + span / 2, hi].map((g, i) => (
        <g key={i}>
          <line x1={padL} y1={y(g)} x2={W - padR} y2={y(g)} stroke="#efece4" strokeWidth="1" />
          <text x={padL - 6} y={y(g) + 3} textAnchor="end" fontSize="9" fill="#b6b8bc" fontFamily="Pretendard">{Math.round(g)}</text>
        </g>
      ))}
      <polygon points={area} fill="#FFCC0022" />
      <polyline points={pts} fill="none" stroke="#FFCC00" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {trend.map((t, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(t.altPct)} r="3" fill="#1c1d1f" />
          <text x={x(i)} y={H - 7} textAnchor="middle" fontSize="9" fill="#9a9ca0" fontFamily="Pretendard">{String(t.year).slice(2)}</text>
        </g>
      ))}
    </svg>
  );
}

// ─── Sidebar (desktop) ────────────────────────────────────
function Sidebar({ active, homeNew, go, onRefresh }) {
  const items = [
    ['home', '⌂', '홈'], ['today', '◷', '오늘'], ['category', '▦', '카테고리'],
    ['korlp', '★', 'Korea LP'], ['search', '⌕', '검색'], ['bookmarks', '▢', '북마크'],
  ];
  return (
    <div style={{width:236, flexShrink:0, background:'#1c1d1f', color:'#fff', display:'flex', flexDirection:'column', padding:'22px 14px'}}>
      <div style={{display:'flex', alignItems:'center', gap:9, padding:'4px 12px 22px'}}>
        <div style={{width:30, height:30, borderRadius:8, background:'#FFCC00', display:'flex', alignItems:'center', justifyContent:'center', font:'800 13px Pretendard', color:'#1c1d1f', letterSpacing:'-.02em'}}>KB</div>
        <div style={{font:'800 17px Pretendard', color:'#FFCC00', letterSpacing:'.04em'}}>KB GIS</div>
      </div>
      <div style={{display:'flex', flexDirection:'column', gap:3}}>
        {items.map(([key, icon, label]) => {
          const on = active === key;
          return (
            <div key={key} onClick={() => go(key)} style={{display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderRadius:11, cursor:'pointer', background:on?'#2c2e32':'transparent', color:on?'#FFCC00':'#cdced0', font:on?'700 14.5px Pretendard':'600 14.5px Pretendard'}}>
              <span style={{fontSize:16, width:18, textAlign:'center'}}>{icon}</span>
              <span>{label}</span>
              {key === 'home' && homeNew > 0 && <span style={{marginLeft:'auto', minWidth:18, height:18, padding:'0 5px', boxSizing:'border-box', borderRadius:999, background:'#e8392f', color:'#fff', font:'700 10px Pretendard', display:'flex', alignItems:'center', justifyContent:'center'}}>{homeNew > 99 ? '99+' : homeNew}</span>}
            </div>
          );
        })}
      </div>
      <div onClick={onRefresh} style={{marginTop:'auto', display:'flex', alignItems:'center', justifyContent:'center', gap:6, cursor:'pointer', font:'600 12.5px Pretendard', color:'#cdced0', border:'1px solid #34363a', borderRadius:999, padding:'9px 12px'}}>⟳ 새로고침</div>
    </div>
  );
}

// ─── In-browser article body fetcher ────────────────────────
// bodyCache: 세션 내 재사용. bodyStore: localStorage 영구 캐시(최대 120건 LRU) —
// 한 번 불러온 기사는 재방문 시 즉시 표시된다.
const bodyCache = {};
const bodyStore = {
  get(id) { const m = store.get('bodies', {}); const e = m[id]; return e ? e.b : ''; },
  set(id, body) {
    try {
      const m = store.get('bodies', {});
      m[id] = { b: body, t: Date.now() };
      const ks = Object.keys(m);
      if (ks.length > 120) {
        ks.sort((a, b) => m[a].t - m[b].t);
        ks.slice(0, ks.length - 120).forEach(k => { delete m[k]; });
      }
      store.set('bodies', m);
    } catch (e) {}
  },
};

// 여러 무료 CORS 프록시를 순서대로 시도해 본문을 가져온다(한 곳이 막혀도 폴백).
// kind:'text' 는 r.jina.ai 처럼 기사 텍스트(마크다운)를 돌려주는 리더 프록시.
const CORS_PROXIES = [
  { mk: (u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u), kind: 'html' },
  { mk: (u) => 'https://r.jina.ai/' + u, kind: 'text' },
  { mk: (u) => 'https://corsproxy.io/?url=' + encodeURIComponent(u), kind: 'html' },
  { mk: (u) => 'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent(u), kind: 'html' },
];

// r.jina.ai 리더 출력(마크다운) → 문단 텍스트.
function parseReaderText(t) {
  if (!t) return '';
  let s = String(t)
    .replace(/^(Title|URL Source|Published Time|Warning):.*$/gm, '')
    .replace(/^Markdown Content:\s*$/m, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')          // 이미지 제거
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');      // 링크 → 텍스트
  const paras = s.split(/\n{2,}/)
    .map(x => x.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(x => x.length > 30 && !/^[#>*\-|=]/.test(x) && !FOOTER_RE.test(x) && !RELATED_RE.test(x.slice(0, 24)) && /[가-힣a-zA-Z]{5,}/.test(x) && isSentencey(x));
  const out = stripSiteFooter(paras.join('\n\n')).slice(0, 8000);
  return looksJunky(out) ? '' : out;
}

// '소프트 404' — 200 응답이지만 "존재하지 않는 링크/기사" 안내만 있는 페이지.
const DEAD_PAGE_RE = /존재하지\s*않는\s*(?:링크|기사|페이지)|삭제된\s*기사|삭제\s*되었거나|기사를\s*찾을\s*수\s*없|페이지를\s*찾을\s*수\s*없|요청하신\s*페이지|page\s*not\s*found|404\s*not\s*found/i;

// 모든 프록시에 '동시에' 요청해 가장 먼저 성공한 본문을 쓴다(순차 대기 제거 →
// 체감 속도 대폭 개선). 각 시도는 8초(+읽기 5초) 제한이라 전체 ~13초 안에 끝난다.
async function fetchBodyViaProxies(url, signal) {
  let sawDead = false;
  const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));
  const attempt = async (p) => {
    const r = await Promise.race([fetch(p.mk(url), { signal }), timeout(8000)]);
    if (!r.ok) throw new Error('http');
    const raw = await Promise.race([r.text(), timeout(5000)]);
    const body = p.kind === 'text' ? parseReaderText(raw) : parseArticleHtml(raw);
    if (body && body.length > 120) return body;
    if (DEAD_PAGE_RE.test(String(raw).slice(0, 8000))) sawDead = true;
    throw new Error('empty');
  };
  const attempts = CORS_PROXIES.map(p => attempt(p));
  try {
    const body = typeof Promise.any === 'function'
      ? await Promise.any(attempts)
      : await new Promise((res, rej) => {                 // Promise.any 미지원 브라우저 폴백
          let left = attempts.length;
          attempts.forEach(a => a.then(res, () => { if (--left === 0) rej(new Error('all')); }));
        });
    return { body, dead: false };
  } catch { return { body: '', dead: sawDead }; }
}

// 기사 끝에 붙는 신문사 등록정보/발행인/보도원칙 등 '푸터 꼬리' 제거.
const FOOTER_RE = /등록번호|사업자등록번호|등록일자|발행일자|발행인|편집인|정보보호\s*책임자|청소년\s*보호책임자|고충처리인|대표전화|보도원칙|반론이나\s*정정|추후보도/;
// 기사 뒤에 딸려오는 '관련기사·많이 본 뉴스' 등 추천 위젯 헤드라인 나열.
const RELATED_RE = /관련\s*기사|많이\s*본\s*뉴스|인기\s*기사|추천\s*기사|함께\s*본\s*기사|핫\s*클릭|실시간\s*뉴스|이\s*시각\s*(?:추천|인기|주요)|화제의\s*뉴스|기자\s*구독|댓글\s*정책/;
// 포털(다음 등) '음성으로 듣기'(TTS) 위젯 안내문.
const TTS_RE = /음성으로\s*듣기|음성\s*재생|데이터\s*요금이\s*발생|글자\s*수\s*[\d,]+\s*자?\s*초과|본문\s*듣기|텍스트\s*음성\s*변환/;
// 언어 선택 목록(English/日本語/简体中文…)이 3개 이상 나열되면 위젯으로 판정.
const LANG_TOKEN_RE = /English|日本語|简体中文|Nederlands|Deutsch|Русский|Español|Italiano|Türkçe|tiếng\s*Việt|bahasa|ภาษาไทย|벵골어|아랍어|네델란드어/g;
const isLangList = (s) => ((String(s).match(LANG_TOKEN_RE) || []).length >= 3);
function stripSiteFooter(t) {
  if (!t) return '';
  let s = String(t);
  // 본문 중간에 끼어든 TTS 안내문을 통째로 제거(문장 중간 접합 케이스 포함)
  s = s.replace(/음성으로\s*듣기[^\n]{0,200}?있습니다\./g, ' ')
       .replace(/글자\s*수\s*[\d,]+\s*자?\s*초과[^\n]{0,80}?제공합니다\./g, ' ')
       .replace(/음성\s*재생\s*설정[^\n]{0,120}?있습니다\./g, ' ');
  const i = s.search(/(?:등록번호|제호|발행인)\s*[:：]/);
  if (i > 80) s = s.slice(0, i);
  // 본문에 이어 붙은 '관련기사/많이 본 뉴스' 위젯부터 끝까지 절단
  const j = s.search(RELATED_RE);
  if (j > 80) s = s.slice(0, j);
  // 문단 선두가 위젯 표제로 시작하거나 TTS 안내/언어목록 문단이면 제거
  s = s.split(/\n{1,}/).map(x => x.trim())
    .filter(x => x && !FOOTER_RE.test(x) && !RELATED_RE.test(x.slice(0, 24)) && !TTS_RE.test(x) && !isLangList(x))
    .join('\n\n');
  return s.replace(/[ \t]{2,}/g, ' ').trim();
}

// '문장형' 문단인지 검사 — 다른 뉴스 헤드라인 나열(문장 종결 없음, 짧고 "…"로
// 끝남)을 본문에서 걸러낸다. 종결어미(다./요.)나 마침표로 끝나거나 충분히 길면 통과.
function isSentencey(s) {
  const t = String(s).trim();
  if (t.length > 160) return true;
  return /(?:다|요)\.["'”’]?\s*$|[.!?]["'”’]?\s*$/.test(t);
}

// 매체 소개문/인기기사 나열로 오염된 '가짜 본문' 판별 (제목과 무관한 잡content).
const SITE_BOILER = /No\.?1\s*종합|종합\s*경제지|빠르고,?\s*정확하게|정확하게\s*전달|대한민국\s*(대표|No\.?1)/;
function looksJunky(s) {
  if (!s) return false;
  const t = String(s);
  if (SITE_BOILER.test(t.slice(0, 140))) return true;
  const ell = (t.match(/…|\.\.\./g) || []).length;
  if (ell >= 4 && t.length < 3500) return true;
  return false;
}

// 본문 문자열을 읽기 좋은 문단 배열로 나눈다. 개행(\n)이 있으면 그 기준으로
// 나누고, 없는 옛 본문(한 덩어리)은 문장 2~3개씩 묶어 문단을 만든다.
function toParagraphs(text, title) {
  if (!text) return [];
  const t = stripSiteFooter(String(text).replace(/\r/g, '').trim());
  if (!t) return [];
  let paras;
  if (/\n/.test(t)) {
    paras = t.split(/\n{1,}/).map(s => s.trim()).filter(Boolean);
  } else {
    const sentences = t.split(/(?<=다\.|요\.|[.!?。…])\s+/).map(s => s.trim()).filter(Boolean);
    paras = []; let buf = [];
    for (const s of sentences) {
      buf.push(s);
      if (buf.length >= 3 || buf.join(' ').length > 150) { paras.push(buf.join(' ')); buf = []; }
    }
    if (buf.length) paras.push(buf.join(' '));
    if (!paras.length) paras = [t];
  }
  // 제목을 그대로 반복하는 선두 문단은 제거(제목은 이미 상단에 헤딩으로 표시).
  const norm = (s) => s.replace(/[\s"'“”‘’·…\-]/g, '').slice(0, 24);
  if (title && paras.length && norm(paras[0]).includes(norm(title))) paras = paras.slice(1);
  return paras;
}

function parseArticleHtml(html) {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    // 1) JSON-LD articleBody 우선 — 매체 소개문/인기기사 위젯 오염을 피한다.
    for (const el of [...doc.querySelectorAll('script[type="application/ld+json"]')]) {
      let data; try { data = JSON.parse(el.textContent); } catch { continue; }
      const nodes = [];
      const push = (x) => { if (Array.isArray(x)) x.forEach(push); else if (x && typeof x === 'object') nodes.push(x); };
      push(Array.isArray(data) ? data : (data['@graph'] || data));
      for (const n of nodes) {
        if (n.articleBody && String(n.articleBody).trim().length > 120) {
          const body = stripSiteFooter(String(n.articleBody).replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()).slice(0, 8000);
          if (body.length > 120 && !looksJunky(body)) return body;
        }
      }
    }
    // 2) 본문 컨테이너 스코어링 — 페이지에서 '긴 문단이 가장 많이 모인' 요소를
    //    기사 본문으로 보고 그 안의 <p>만 추출한다. 페이지 전체 <p>를 긁으면
    //    사이드바·다른 뉴스 헤드라인이 섞이므로 전역 추출은 최후 수단으로만.
    const ogEl = doc.querySelector('meta[property="og:description"], meta[name="description"]');
    let lead = ogEl ? (ogEl.getAttribute('content') || '') : '';
    if (SITE_BOILER.test(lead)) lead = '';
    const BOILER = /구독|로그인|회원가입|저작권|무단전재|재배포 금지|all rights reserved|cookie|쿠키|광고/i;
    const pickPs = (root) => [...root.querySelectorAll('p')]
      .map(el => el.textContent.replace(/\s+/g, ' ').trim())
      .filter((s, i, a) => s.length > 30 && !BOILER.test(s) && !FOOTER_RE.test(s) && !RELATED_RE.test(s.slice(0, 24)) && isSentencey(s) && a.indexOf(s) === i);
    const scopes = [...doc.querySelectorAll('article, [itemprop~="articleBody"], [class*="article"], [id*="article"], [class*="news_"], [class*="view_"], [class*="content"]')];
    let best = null, bestLen = 0;
    for (const sc of scopes) {
      const len = pickPs(sc).reduce((n, s) => n + s.length, 0);
      if (len > bestLen) { bestLen = len; best = sc; }
    }
    const ps = bestLen > 250 ? pickPs(best) : pickPs(doc);
    const out = stripSiteFooter([lead, ...ps].filter(Boolean).join('\n\n').trim()).slice(0, 8000);
    return looksJunky(out) ? '' : out;
  } catch { return ''; }
}

// ─── ArticleDetail (shared by mobile detail screen & desktop right pane) ──
function ArticleDetail({ sel, bookmarked, onToggleBm, onShare, onBack, showBack }) {
  const [fetchedBody, setFetchedBody] = useState(null);
  const [loadingBody, setLoadingBody] = useState(false);
  const [deadLink, setDeadLink] = useState(false);

  useEffect(() => {
    setFetchedBody(null);
    setLoadingBody(false);
    setDeadLink(false);
    // 실제 외부 기사 주소가 있어야 본문을 가져올 수 있다(구글 뉴스 리디렉트
    // 주소는 수집기가 실제 주소로 해석해 news.json 에 저장한다).
    if (!sel || !sel.url || /news\.google\.com/i.test(sel.url) || !/^https?:\/\//i.test(sel.url)) return;
    // '정리 후' 본문이 충분할 때만 재요청 생략 — 관련기사 위젯/푸터를 걷어내면
    // 몇 줄 안 남는 기사는 브라우저에서 전체 본문을 다시 가져온다.
    const cleanStored = stripSiteFooter(sel.body || '');
    if (cleanStored.length > 400 && !looksJunky(cleanStored)) return;
    // 세션/영구 캐시에 있으면 즉시 사용(재방문 시 대기 없음)
    if (bodyCache[sel.id]) { setFetchedBody(bodyCache[sel.id]); return; }
    const stored = bodyStore.get(sel.id);
    if (stored) { bodyCache[sel.id] = stored; setFetchedBody(stored); return; }

    const ctrl = new AbortController();
    let cancelled = false;
    setLoadingBody(true);
    fetchBodyViaProxies(sel.url, ctrl.signal)
      .then(r => {
        if (cancelled) return;
        if (r.body) { bodyCache[sel.id] = r.body; bodyStore.set(sel.id, r.body); setFetchedBody(r.body); }
        else if (r.dead) setDeadLink(true);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingBody(false); });

    return () => { cancelled = true; ctrl.abort(); };
  }, [sel ? sel.id : null]);

  if (!sel) return (
    <div style={{flex:1, minHeight:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:10, background:'#fcfbf9', color:'#c2c4c8'}}>
      <div style={{fontSize:34}}>▢</div>
      <div style={{font:'600 13.5px Pretendard'}}>왼쪽 목록에서 기사를 선택하세요</div>
    </div>
  );

  const { y, m, d } = kstYMD(itemMs(sel));
  const realUrl = sel.url && /^https?:\/\//i.test(sel.url) && !/(^|\/\/)kbgis\.app/i.test(sel.url) ? sel.url : '';
  // 오염된 저장 본문은 표시하지 않고, 남은 본문도 위젯/푸터를 걷어낸 뒤 사용.
  const cleanBody = looksJunky(sel.body) ? '' : stripSiteFooter(sel.body || '');
  const displayBody = fetchedBody || cleanBody || '';
  const isFullBody = displayBody.length > 300;
  const paragraphs = toParagraphs(displayBody, sel.ko);
  // AI 3줄 요약: (1) LLM 요약(aiSource==='llm')은 정리만 해서 사용
  // (2) 그 외에는 '깨끗한 본문'의 첫 핵심 문장들로 항상 재생성 — 저장된 발췌
  //     요약은 과거 오염 본문에서 만들어졌을 수 있어 신뢰하지 않는다.
  // (3) 본문이 전혀 없으면 저장 요약(정리) → 제목 순으로 대체.
  const capLine = (s) => s.length > 170 ? s.slice(0, 168).trimEnd() + '…' : s;
  const normT = (s) => String(s).replace(/[\s"'“”‘’·…\-\[\]().]/g, '');
  const isTitleEcho = (l) => {
    const a = normT(l), b = normT(sel.ko);
    return a.includes(b.slice(0, 18)) || b.includes(a.slice(0, 18));
  };
  const cleanStoredAi = (sel.ai || [])
    .map(l => stripSiteFooter(String(l)))
    .filter(l => l && l.length >= 15 && !looksJunky(l) && !RELATED_RE.test(l.slice(0, 24)) && !isTitleEcho(l))
    .map(capLine)
    .slice(0, 3);
  const bodySents = paragraphs.join(' ')
    .split(/(?<=다\.|요\.)\s+|(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length >= 20 && s.length <= 220 && !isTitleEcho(s) && !FOOTER_RE.test(s) && !RELATED_RE.test(s.slice(0, 24)) && !TTS_RE.test(s) && !isLangList(s) && isSentencey(s));
  let aiLines;
  if (sel.aiSource === 'llm' && cleanStoredAi.length) aiLines = cleanStoredAi;
  else if (bodySents.length) aiLines = bodySents.slice(0, 3).map(capLine);
  else if (cleanStoredAi.length) aiLines = cleanStoredAi;
  else aiLines = [sel.ko];

  return (
    <div style={{flex:1, minHeight:0, display:'flex', flexDirection:'column', background:'#fff'}}>
      <div style={{flexShrink:0, height:54, boxSizing:'content-box', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'env(safe-area-inset-top) 16px 0 12px', borderBottom:'1px solid #efece4'}}>
        {showBack
          ? <div onClick={onBack} style={{display:'flex', alignItems:'center', gap:4, cursor:'pointer', font:'600 14px Pretendard', color:'#1c1d1f'}}><span style={{fontSize:20}}>‹</span> 목록</div>
          : <div style={{font:'700 13px Pretendard', color:'#9a9ca0', paddingLeft:6}}>기사 상세</div>}
        <div style={{display:'flex', alignItems:'center', gap:4}}>
          <div onClick={onToggleBm} style={{width:38, height:38, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontSize:16, color:'#56585c'}}>
            {bookmarked ? <span style={{color:'#1c1d1f'}}>▣</span> : <span>▢</span>}
          </div>
          <div onClick={onShare} style={{width:38, height:38, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontSize:16, color:'#56585c'}}>↗</div>
        </div>
      </div>
      <div style={{flex:1, minHeight:0, overflowY:'auto'}}>
        <div style={{padding:'18px 20px 26px', maxWidth:760, margin:'0 auto'}}>
          <div style={{display:'flex', alignItems:'center', gap:7, flexWrap:'wrap', marginBottom:11}}>
            <span style={{font:'700 10.5px Pretendard', color:'#fff', background:'#1c1d1f', padding:'3px 9px', borderRadius:6}}>{sel.catLabel}</span>
            <span style={{font:'700 11px Pretendard', color:'#1c1d1f', background:'#f0eee7', padding:'3px 9px', borderRadius:6}}>{sel.inst}</span>
            <span style={{display:'inline-flex', alignItems:'center', gap:5, font:'600 11px Pretendard'}}>
              <span style={{width:7, height:7, borderRadius:2, background:sel.assetColor, display:'inline-block'}}></span>
              {sel.assetLabel}
            </span>
          </div>
          <div style={{font:'800 22px/1.42 Pretendard', letterSpacing:'-.02em', color:'#111214'}}>{sel.ko}</div>
          {sel.en && sel.en !== sel.ko && <div style={{font:'400 13.5px/1.5 Pretendard', color:'#8a8c90', marginTop:8}}>{sel.en}</div>}
          <div style={{font:'500 11.5px Pretendard', color:'#a6a8ac', marginTop:12, paddingBottom:16, borderBottom:'1px solid #efece4'}}>{sel.source} · {`${y}.${pad2(m)}.${pad2(d)}`} {sel.time}</div>

          <div style={{marginTop:18, background:'#fffaeb', border:'1px solid #f6ecc8', borderRadius:14, padding:'15px 16px'}}>
            <div style={{display:'flex', alignItems:'center', gap:6, font:'700 11.5px Pretendard', color:'#9a7d12', letterSpacing:'.03em', marginBottom:10}}>
              <span style={{width:17, height:17, borderRadius:5, background:'#FFCC00', color:'#1c1d1f', display:'inline-flex', alignItems:'center', justifyContent:'center', font:'800 9px Pretendard'}}>AI</span>
              3줄 요약
            </div>
            {aiLines.map((line, i) => (
              <div key={i} style={{display:'flex', gap:8, font:'500 13px/1.55 Pretendard', color:'#3d3e42', marginTop:5}}>
                <span style={{color:'#d9b400', flexShrink:0}}>—</span>
                <span>{line}</span>
              </div>
            ))}
          </div>

          <div style={{marginTop:20}}>
            <div style={{display:'flex', alignItems:'center', gap:7, marginBottom:10}}>
              <div style={{font:'700 11px Pretendard', color:'#a6a8ac', letterSpacing:'.06em'}}>기사 원문</div>
              {loadingBody && <div style={{font:'600 10px Pretendard', color:'#a6a8ac'}}>불러오는 중…</div>}
              {!loadingBody && isFullBody && <span style={{font:'600 10px Pretendard', color:'#2563eb', background:'#dbeafe', padding:'2px 8px', borderRadius:4}}>전문</span>}
            </div>
            {loadingBody ? (
              <div style={{font:'500 13px/1.6 Pretendard', color:'#c2c4c8', padding:'8px 0'}}>기사 내용을 불러오는 중입니다…</div>
            ) : deadLink && !paragraphs.length ? (
              <div style={{font:'500 13px/1.7 Pretendard', color:'#c0392b', background:'#fdf1ef', border:'1px solid #f5d9d4', borderRadius:11, padding:'12px 14px'}}>
                이 기사의 원문 링크가 더 이상 존재하지 않습니다(삭제된 기사). 다음 뉴스 갱신 때 목록에서 자동으로 제거됩니다.
              </div>
            ) : paragraphs.length ? (
              <div>
                {paragraphs.map((p, i) => (
                  <p key={i} style={{font:'400 15px/1.95 Pretendard', color:'#2a2b2f', margin:'0 0 15px', wordBreak:'keep-all'}}>{p}</p>
                ))}
                {!isFullBody && realUrl && <div style={{marginTop:2, font:'500 12px Pretendard', color:'#9a9ca0'}}>전체 본문은 아래 ‘기사 전문 보기’에서 확인하세요.</div>}
              </div>
            ) : (
              <div style={{font:'500 13px/1.7 Pretendard', color:'#9a9ca0'}}>{realUrl ? '본문을 불러오지 못했습니다. 아래 ‘기사 전문 보기’에서 확인하세요.' : '원문 링크가 확인되지 않은 기사입니다.'}</div>
            )}
          </div>

          <div style={{display:'flex', gap:8, marginTop:22}}>
            <div onClick={onShare} style={{flex:1, height:42, background:'#1c1d1f', borderRadius:11, display:'flex', alignItems:'center', justifyContent:'center', gap:6, font:'700 13px Pretendard', color:'#fff', cursor:'pointer'}}>↗ 공유</div>
            {realUrl && !deadLink && <a href={realUrl} target="_blank" rel="noopener noreferrer" style={{flex:1.6, height:42, background:'#FFCC00', borderRadius:11, display:'flex', alignItems:'center', justifyContent:'center', gap:6, font:'700 13px Pretendard', color:'#1c1d1f', textDecoration:'none'}}>기사 전문 보기 ↗</a>}
          </div>
          <div style={{font:'500 11px Pretendard', color:'#b6b8bc', textAlign:'center', marginTop:10}}>{realUrl ? '요약은 참고용입니다 · 전체 내용은 기사 원문에서 확인하세요' : '원문 링크가 확인되지 않은 기사입니다'}</div>
        </div>
      </div>
    </div>
  );
}

// ─── LpProfile (Korea LP — 기관별 프로필: placement agent 관점) ──
// 설립연도·운용방식 등 안정적 사실은 lp-profiles.json(profile)에서, AUM·대체투자
// 배분은 allocations.json(alloc)에서, CIO·인사와 자산군 수익률은 insights.json에서,
// 관련 기사는 news.json(articles)에서 모아 한 화면에 보여준다.
function LpProfile({ name, group, profile, alloc, cio, returns, articles, onBack, onOpenArticle }) {
  const aum = (alloc && alloc.aum != null) ? alloc.aum : (profile && profile.aum != null ? profile.aum : null);
  const aumAsOf = (alloc && alloc.aum != null) ? (alloc.asOf || '공시 기준') : (profile && profile.aumAsOf) || '';
  const aumVerified = !!(alloc && alloc.aum != null);
  // 검증(공시 확정)된 값은 그대로, 프로필 근사치는 '~'로 근사 표기.
  const aumDisplay = aum == null ? '–' : (aumVerified ? fmtAmt(aum) : '~' + fmtAmt(aum));

  // ── 최신 기사 기반 자동 동향 (항상 최신 뉴스에 연동) ──
  const nowMs = Date.now();
  const cnt30 = articles.filter(a => nowMs - itemMs(a) < 30 * 86400000).length;
  const latest = articles[0] || null;                       // items 는 최신순 정렬
  const latestYMD = latest ? kstYMD(itemMs(latest)) : null;
  // 기관의 최근 기사가 다루는 자산군 분포 → 관심 자산군 칩
  const assetMix = (() => {
    const m = {};
    articles.forEach(a => { m[a.asset] = (m[a.asset] || 0) + 1; });
    return Object.entries(m).sort((x, y) => y[1] - x[1]);
  })();

  return (
    <div style={{flex:1, minHeight:0, display:'flex', flexDirection:'column', background:'#fff'}}>
      <div style={{flexShrink:0, height:54, boxSizing:'content-box', display:'flex', alignItems:'center', padding:'env(safe-area-inset-top) 16px 0 12px', borderBottom:'1px solid #efece4'}}>
        <div onClick={onBack} style={{display:'flex', alignItems:'center', gap:4, cursor:'pointer', font:'600 14px Pretendard', color:'#1c1d1f'}}><span style={{fontSize:20}}>‹</span> Korea LP</div>
      </div>
      <div style={{flex:1, minHeight:0, overflowY:'auto'}}>
        <div style={{padding:'18px 20px 28px', maxWidth:760, margin:'0 auto'}}>
          {/* 헤더 */}
          <div style={{display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:6}}>
            <span style={{font:'700 10.5px Pretendard', color:'#56585c', background:'#f0eee7', padding:'3px 9px', borderRadius:6}}>{group}</span>
            {profile && profile.curated
              ? <span style={{font:'700 9.5px Pretendard', color:'#1a5fa4', background:'#e6effa', padding:'3px 8px', borderRadius:6}}>● 검증 프로필</span>
              : <span style={{font:'700 9.5px Pretendard', color:'#7a7c80', background:'#f0eee7', padding:'3px 8px', borderRadius:6}}>업권 유형 기준</span>}
            {profile && profile.founded && <span style={{font:'600 10.5px Pretendard', color:'#9a9ca0'}}>설립 {profile.founded}년</span>}
            {profile && profile.hq && <span style={{font:'600 10.5px Pretendard', color:'#9a9ca0'}}>· {profile.hq}</span>}
          </div>
          <div style={{font:'800 23px Pretendard', letterSpacing:'-.02em'}}>{name}</div>
          {profile && profile.eng && <div style={{font:'500 12px Pretendard', color:'#a6a8ac', marginTop:3}}>{profile.eng}</div>}
          {profile && profile.tags && (
            <div style={{display:'flex', flexWrap:'wrap', gap:6, marginTop:11}}>
              {profile.tags.map(t => <span key={t} style={{font:'600 10.5px Pretendard', color:'#9a7d12', background:'#fffaeb', border:'1px solid #f3eccf', padding:'4px 9px', borderRadius:999}}>{t}</span>)}
            </div>
          )}

          {/* 핵심 지표 */}
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:9, marginTop:16}}>
            <div style={{background:'#f8f7f3', borderRadius:11, padding:'12px 13px'}}>
              <div style={{font:'800 18px Pretendard'}}>{aumDisplay}</div>
              <div style={{font:'500 10px Pretendard', color:'#9a9ca0', marginTop:2}}>운용자산(AUM){aumAsOf ? ` · ${aumAsOf}` : ''}{aum != null && !aumVerified ? ' 공시 기준' : ''}</div>
            </div>
            <div style={{background:'#fffaeb', borderRadius:11, padding:'12px 13px'}}>
              <div style={{font:'800 18px Pretendard', color:'#9a7d12'}}>{alloc && alloc.altPct != null ? fmtPct(alloc.altPct) : '–'}</div>
              <div style={{font:'500 10px Pretendard', color:'#b89a2e', marginTop:2}}>대체투자 비중</div>
            </div>
            <div style={{background:'#f8f7f3', borderRadius:11, padding:'12px 13px'}}>
              <div style={{font:'800 18px Pretendard'}}>{alloc && alloc.altAmount != null ? fmtAmt(alloc.altAmount) : '–'}</div>
              <div style={{font:'500 10px Pretendard', color:'#9a9ca0', marginTop:2}}>대체투자 금액</div>
            </div>
            <div style={{background:'#f8f7f3', borderRadius:11, padding:'12px 13px'}}>
              <div style={{font:'800 18px Pretendard'}}>{alloc && alloc.overseasAltPct != null ? fmtPct(alloc.overseasAltPct) : '–'}</div>
              <div style={{font:'500 10px Pretendard', color:'#9a9ca0', marginTop:2}}>대체투자 중 해외</div>
            </div>
          </div>

          {/* 최근 동향 — 최신 기사에서 자동 산출 (항상 최신 상태 유지) */}
          <div style={{marginTop:14, border:'1px solid #ece9e2', borderRadius:13, padding:'13px 14px', background:'#fbfaf7'}}>
            <div style={{display:'flex', alignItems:'center', gap:7, marginBottom:9}}>
              <span style={{font:'700 10.5px Pretendard', color:'#1a7a4a', background:'#e4f5ea', padding:'3px 9px', borderRadius:6}}>● 최근 동향</span>
              <span style={{font:'500 9.5px Pretendard', color:'#9a9ca0'}}>최신 기사 자동 연동{latestYMD ? ` · ${latestYMD.y}.${pad2(latestYMD.m)}.${pad2(latestYMD.d)} 갱신` : ''}</span>
            </div>
            {articles.length === 0 ? (
              <div style={{font:'500 12px/1.6 Pretendard', color:'#a6a8ac'}}>최근 3개월 내 수집된 기사가 없습니다. 새 기사가 올라오면 자동 반영됩니다.</div>
            ) : (
              <>
                <div style={{display:'flex', gap:14, marginBottom:latest ? 10 : 0}}>
                  <div><span style={{font:'800 16px Pretendard'}}>{articles.length}</span><span style={{font:'500 10.5px Pretendard', color:'#9a9ca0', marginLeft:4}}>기사 · 3개월</span></div>
                  <div><span style={{font:'800 16px Pretendard', color:cnt30 ? '#1a7a4a' : '#1c1d1f'}}>{cnt30}</span><span style={{font:'500 10.5px Pretendard', color:'#9a9ca0', marginLeft:4}}>기사 · 30일</span></div>
                </div>
                {assetMix.length > 0 && (
                  <div style={{display:'flex', flexWrap:'wrap', gap:6, marginBottom:latest ? 10 : 0}}>
                    {assetMix.map(([k, c]) => (
                      <span key={k} style={{display:'inline-flex', alignItems:'center', gap:5, font:'600 10.5px Pretendard', color:'#3d3e42', background:'#f0eee7', padding:'4px 9px', borderRadius:999}}>
                        <span style={{width:6, height:6, borderRadius:2, background:(ASSET[k] && ASSET[k].color) || '#c4a93a', display:'inline-block'}}></span>
                        {(ASSET[k] && ASSET[k].label) || k} {c}
                      </span>
                    ))}
                  </div>
                )}
                {latest && (
                  <div onClick={() => onOpenArticle(latest.id)} style={{cursor:'pointer', borderTop:'1px solid #f0ede4', paddingTop:9}}>
                    <div style={{font:'700 9.5px Pretendard', color:'#9a7d12', marginBottom:3}}>최신 기사</div>
                    <div style={{font:'650 12.5px/1.45 Pretendard', color:'#1c1d1f'}}>{latest.ko}</div>
                    <div style={{font:'500 10px Pretendard', color:'#b6b8bc', marginTop:3}}>{latest.date} {latest.time} · {latest.source} ›</div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* 운용 개요 */}
          {profile && (profile.summary || profile.altFocus) ? (
            <div style={{marginTop:18}}>
              <div style={{font:'700 11px Pretendard', color:'#a6a8ac', letterSpacing:'.06em', marginBottom:8}}>운용 개요</div>
              {profile.summary && <div style={{font:'500 13.5px/1.7 Pretendard', color:'#34353a'}}>{profile.summary}</div>}
              {profile.mandate && (
                <div style={{display:'flex', alignItems:'center', gap:7, marginTop:11, marginBottom:2}}>
                  <span style={{font:'700 10px Pretendard', color:'#1a5fa4', background:'#e6effa', padding:'3px 9px', borderRadius:6}}>출자 방식</span>
                  <span style={{font:'600 12px Pretendard', color:'#3d3e42'}}>{profile.mandate}</span>
                </div>
              )}
              {profile.altFocus && (
                <div style={{marginTop:11, background:'#f8f7f3', borderRadius:12, padding:'13px 14px'}}>
                  <div style={{font:'700 10.5px Pretendard', color:'#9a7d12', letterSpacing:'.03em', marginBottom:6}}>대체투자 접근</div>
                  <div style={{font:'500 12.5px/1.65 Pretendard', color:'#3d3e42'}}>{profile.altFocus}</div>
                </div>
              )}
            </div>
          ) : (
            <div style={{marginTop:18, font:'500 12px/1.6 Pretendard', color:'#b6b8bc', border:'1px dashed #e3e0d8', borderRadius:13, padding:'14px'}}>
              상세 프로필을 준비 중입니다. 아래 최신 기사에서 운용 동향을 확인하세요.
            </div>
          )}

          {/* 리더십 (이사장/CEO · CIO) — 이름·출생연도·이력 + 라이브 CIO 인사 뉴스 */}
          {(() => {
            const L = profile && profile.leadership;
            const ceoP = L && L.ceo;
            const cioP = L && L.cio;
            if (!ceoP && !cioP && !cio) return null;
            const Person = ({ badge, p }) => (
              <div style={{border:'1px solid #ece9e2', borderRadius:12, padding:'12px 14px'}}>
                <div style={{display:'flex', alignItems:'center', gap:8, flexWrap:'wrap'}}>
                  <span style={{font:'700 9.5px Pretendard', color:'#56585c', background:'#f0eee7', padding:'3px 9px', borderRadius:6, flexShrink:0}}>{p.title || badge}</span>
                  {p.name
                    ? <span style={{font:'700 13.5px Pretendard', color:'#1c1d1f'}}>{p.name}</span>
                    : <span style={{font:'600 12px Pretendard', color:'#9a7d12'}}>공석·인선 진행</span>}
                  {p.born && <span style={{font:'600 11px Pretendard', color:'#9a9ca0'}}>{p.born}년생</span>}
                </div>
                {(p.bio || p.note) && <div style={{font:'500 11.5px/1.6 Pretendard', color:'#56585c', marginTop:7}}>{p.bio || p.note}</div>}
              </div>
            );
            return (
              <div style={{marginTop:20}}>
                <div style={{display:'flex', alignItems:'baseline', gap:8, marginBottom:9, flexWrap:'wrap'}}>
                  <div style={{font:'700 11px Pretendard', color:'#a6a8ac', letterSpacing:'.06em'}}>리더십</div>
                  {L && L.asOf && <span style={{font:'500 9.5px Pretendard', color:'#9a9ca0'}}>· {L.asOf} 기준</span>}
                </div>
                <div style={{display:'flex', flexDirection:'column', gap:8}}>
                  {ceoP && <Person badge="대표" p={ceoP} />}
                  {cioP && <Person badge="CIO" p={cioP} />}
                  {/* 라이브 CIO 인사 뉴스 (insights 자동 추출) */}
                  {cio && (
                    <a href={cio.url && /^https?:\/\//.test(cio.url) ? cio.url : undefined} target="_blank" rel="noopener noreferrer"
                       style={{display:'block', textDecoration:'none', color:'inherit', border:'1px solid #ece9e2', borderRadius:12, padding:'12px 14px', cursor:cio.url?'pointer':'default', background:'#fbfcff'}}>
                      <div style={{display:'flex', alignItems:'center', gap:7, flexWrap:'wrap'}}>
                        <span style={{font:'700 9.5px Pretendard', color:'#1a7a4a', background:'#e4f5ea', padding:'3px 9px', borderRadius:6}}>CIO 인사 동향</span>
                        <span style={{font:'700 9px Pretendard', color:cio.status==='선임'?'#1a5fa4':'#9a7d12', background:cio.status==='선임'?'#e6effa':'#fffaeb', padding:'2px 7px', borderRadius:5}}>{cio.status}</span>
                        {cio.person && <span style={{font:'700 13px Pretendard', color:'#1c1d1f'}}>{cio.person}</span>}
                        {cio.background && <span style={{font:'500 11px Pretendard', color:'#9a9ca0'}}>{cio.background} 출신</span>}
                        <span style={{marginLeft:'auto', font:'500 9px Pretendard', color:'#9a9ca0'}}>뉴스 자동</span>
                      </div>
                      <div style={{font:'500 12px/1.5 Pretendard', color:'#3d3e42', marginTop:6}}>{cio.note}</div>
                      <div style={{font:'500 10px Pretendard', color:'#b6b8bc', marginTop:5}}>{cio.date} · {cio.source}{cio.url ? ' · 기사 보기 ↗' : ''}</div>
                    </a>
                  )}
                </div>
              </div>
            );
          })()}

          {/* 대체투자 배분 추이 */}
          {alloc && alloc.trend && alloc.trend.length >= 2 && (
            <div style={{marginTop:22}}>
              <div style={{font:'700 11px Pretendard', color:'#a6a8ac', letterSpacing:'.06em', marginBottom:6}}>대체투자 비중 추이</div>
              <TrendChart trend={alloc.trend} />
              {alloc.sourceNote && <div style={{font:'500 10.5px/1.6 Pretendard', color:'#9a9ca0', marginTop:8, background:'#f8f7f3', borderRadius:9, padding:'9px 11px'}}>{alloc.sourceNote}</div>}
              {alloc.source && <div style={{font:'500 10px Pretendard', color:'#b6b8bc', marginTop:7}}>출처 · {alloc.sourceUrl
                ? <a href={alloc.sourceUrl} target="_blank" rel="noopener noreferrer" style={{color:'#7a8190', textDecoration:'underline'}}>{alloc.source} ↗</a>
                : alloc.source}</div>}
            </div>
          )}

          {/* 자산군별 수익률 (기관 한정) */}
          {returns && returns.length > 0 && (
            <div style={{marginTop:22}}>
              <div style={{display:'flex', alignItems:'baseline', gap:8, marginBottom:9}}>
                <div style={{font:'700 11px Pretendard', color:'#a6a8ac', letterSpacing:'.06em'}}>자산군별 수익률</div>
                <span style={{font:'500 9.5px Pretendard', color:'#1a7a4a', background:'#e4f5ea', padding:'2px 7px', borderRadius:5}}>● 최근 기사 기준</span>
              </div>
              <div style={{border:'1px solid #ece9e2', borderRadius:13, overflow:'hidden'}}>
                {returns.map((r, i) => (
                  <a key={r.asset+i} href={r.url && /^https?:\/\//.test(r.url) ? r.url : undefined} target="_blank" rel="noopener noreferrer"
                     style={{display:'flex', alignItems:'center', gap:10, textDecoration:'none', color:'inherit', padding:'12px 13px', borderTop:i?'1px solid #f3f1ea':'none'}}>
                    <span style={{width:7, height:7, borderRadius:2, background:(ASSET[r.asset]&&ASSET[r.asset].color)||'#c4a93a', display:'inline-block', flexShrink:0}}></span>
                    <span style={{font:'600 12px Pretendard', color:'#1c1d1f', flex:1}}>{r.label}</span>
                    <span style={{font:'800 14px Pretendard', color:r.value<0?'#c0392b':'#1a7a4a'}}>{r.value>0?'+':''}{r.value}%</span>
                    <span style={{font:'500 9.5px Pretendard', color:'#b6b8bc'}}>{r.date}↗</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* 관련 기사 */}
          <div style={{marginTop:24}}>
            <div style={{display:'flex', alignItems:'baseline', gap:8, marginBottom:10}}>
              <div style={{font:'700 11px Pretendard', color:'#a6a8ac', letterSpacing:'.06em'}}>관련 기사</div>
              <span style={{font:'600 11px Pretendard', color:'#9a9ca0'}}>{articles.length}건</span>
            </div>
            {articles.length === 0 ? (
              <div style={{font:'500 12px/1.6 Pretendard', color:'#b6b8bc', border:'1px dashed #e3e0d8', borderRadius:13, padding:'14px'}}>최근 3개월 내 {name} 관련 기사가 아직 없습니다. 새 기사가 수집되면 자동 표시됩니다.</div>
            ) : (
              <div style={{border:'1px solid #ece9e2', borderRadius:13, overflow:'hidden'}}>
                {articles.map((item, i) => (
                  <div key={item.id} onClick={() => onOpenArticle(item.id)} style={{display:'flex', gap:10, padding:'13px 14px', borderTop:i?'1px solid #f3f1ea':'none', cursor:'pointer'}}>
                    <div style={{width:3, borderRadius:2, background:item.assetColor, flexShrink:0}}></div>
                    <div style={{flex:1, minWidth:0}}>
                      <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:4, flexWrap:'wrap'}}>
                        <span style={{font:'600 10.5px Pretendard', color:item.assetColor}}>{item.assetLabel}</span>
                        <span style={{font:'500 10.5px Pretendard', color:'#bcbec2'}}>{item.date} {item.time}</span>
                      </div>
                      <div style={{font:'650 13.5px/1.42 Pretendard', letterSpacing:'-.01em'}}>{item.ko}</div>
                      <div style={{font:'500 10px Pretendard', color:'#b6b8bc', marginTop:5}}>{item.source}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 갱신일·정보 기준 푸터 */}
          <div style={{marginTop:24, paddingTop:14, borderTop:'1px solid #f0ede4', font:'500 10px/1.6 Pretendard', color:'#b6b8bc'}}>
            {profile && profile.updatedAt && <div>프로필 업데이트 · {profile.updatedAt}</div>}
            {profile && profile.asOf && <div style={{marginTop:2}}>정보 기준 · {profile.asOf}</div>}
            <div style={{marginTop:2}}>CIO·대체투자 배분·관련 기사는 뉴스·공시에서 자동 갱신됩니다{cio && cio.date ? ` (CIO 최신: ${cio.date})` : ''}.</div>
            {profile && !profile.curated && <div style={{marginTop:4, color:'#c2c4c8'}}>※ 운용 개요는 해당 업권(유형)의 일반적 운용 방식 기준 설명이며, 개별 기관의 구체 수치·동향은 위 기사·배분 데이터를 참고하세요.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────
function App() {
  const [screen, setScreen]       = useState('home');
  const [prevScreen, setPrevScreen] = useState('home');
  const [filter, setFilter]       = useState('전체');
  const [query, setQuery]         = useState('');
  const [bm, setBm]               = useState(() => store.get('bookmarks', {}));
  const [read, setRead]           = useState(() => store.get('read', {}));
  // 저장된 기사는 유효(실제 링크)한 것만 불러온다 — 옛 시드/가짜 기사 즉시 제거.
  const [articles, setArticles]   = useState(() => sortArticles((store.get('articles', []) || []).filter(isRealArticle)));
  const [selectedId, setSelectedId] = useState(null);
  const [showShare, setShowShare]  = useState(false);
  const [expandedGroup, setExpandedGroup] = useState(null);
  const [alloc, setAlloc]          = useState(null);
  const [allocSel, setAllocSel]    = useState(null);
  const [insights, setInsights]    = useState(null);
  const [roster, setRoster]        = useState(null);   // 국내 LP 전체 로스터
  const [profiles, setProfiles]    = useState(null);   // 국내 LP 프로필(lp-profiles.json)
  const [profilesAt, setProfilesAt] = useState('');    // 프로필 일괄 갱신일
  const [lpSel, setLpSel]          = useState(null);   // Korea LP 선택 기관(null = 목록)
  const [lpTab, setLpTab]          = useState('inst'); // Korea LP 하위 탭: 'inst' | 'alloc'
  const [lpExpanded, setLpExpanded] = useState(null);  // Korea LP 업권 펼침
  const [seen, setSeen]            = useState(() => store.get('seen', null));
  const [isDesktop, setIsDesktop]  = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 900px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 900px)');
    const h = (e) => setIsDesktop(e.matches);
    mq.addEventListener ? mq.addEventListener('change', h) : mq.addListener(h);
    return () => { mq.removeEventListener ? mq.removeEventListener('change', h) : mq.removeListener(h); };
  }, []);
  const [toast, setToast]         = useState(null);
  const toastTimer = useRef(null);

  // Persist state changes.
  useEffect(() => { store.set('bookmarks', bm); }, [bm]);
  useEffect(() => { store.set('read', read); }, [read]);
  useEffect(() => { store.set('articles', articles); }, [articles]);
  useEffect(() => { if (seen) store.set('seen', seen); }, [seen]);
  // First ever launch: mark everything as already seen (no startup flood badge).
  useEffect(() => {
    if (seen === null && articles.length) {
      const m = {}; articles.forEach(a => { m[a.id] = true; }); setSeen(m);
    }
  }, [articles, seen]);

  const markSeen = (ids) => setSeen(s => { const n = { ...(s || {}) }; ids.forEach(id => { n[id] = true; }); return n; });

  // Pull fresh news from the backend and merge into the archive — new items
  // 라이브 피드(news.json)를 권위 있는 소스로 삼아 그대로 반영한다. 합집합
  // 누적을 하지 않으므로, 수집기 피드에서 빠진(삭제된·가짜) 기사는 화면에서도
  // 사라진다. 단 빈 응답으로 화면을 비우지는 않는다(오프라인/일시 오류 대비).
  const refreshNews = (showToast) => {
    if (!NEWS_API) return;
    fetch(NEWS_API + '?t=' + Date.now())
      .then(r => r.json())
      .then(incoming => {
        if (Array.isArray(incoming) && incoming.length) {
          setArticles(sortArticles(incoming.filter(isRealArticle)));
        }
        if (showToast) flash('최신 뉴스를 불러왔어요');
      })
      .catch(() => { if (showToast) flash('새로고침에 실패했어요'); });
  };
  useEffect(() => { refreshNews(false); }, []);

  // Load LP alternative-allocation dataset for the 배분 screen.
  useEffect(() => {
    fetch(ALLOC_API + '?t=' + Date.now())
      .then(r => r.json())
      .then(d => {
        if (d && Array.isArray(d.institutions)) {
          d.institutions = d.institutions.slice().sort((a, b) => b.altPct - a.altPct);
          setAlloc(d);
          setAllocSel(s => s || (d.institutions[0] && d.institutions[0].name));
        }
      })
      .catch(() => {});
  }, []);

  // Load CIO·자산군 수익률 인사이트 (뉴스 자동 추출 결과).
  useEffect(() => {
    fetch(INSIGHTS_API + '?t=' + Date.now())
      .then(r => r.json())
      .then(d => { if (d && (Array.isArray(d.cios) || Array.isArray(d.assetReturns))) setInsights(d); })
      .catch(() => {});
  }, []);

  // Load 국내 LP 전체 로스터 (업권별 기관 목록).
  useEffect(() => {
    fetch(INSTITUTIONS_API + '?t=' + Date.now())
      .then(r => r.json())
      .then(d => { if (d && Array.isArray(d.institutions)) setRoster(d.institutions); })
      .catch(() => {});
  }, []);

  // Load 국내 LP 프로필(설립연도·운용방식 등) — lp-profiles.json
  useEffect(() => {
    fetch(LP_PROFILES_API + '?t=' + Date.now())
      .then(r => r.json())
      .then(d => { if (d && d.profiles) { setProfiles(d.profiles); if (d.updatedAt) setProfilesAt(d.updatedAt); } })
      .catch(() => {});
  }, []);

  const flash = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  };

  const openItem = (id) => {
    setSelectedId(id);
    setRead(r => ({ ...r, [id]: true }));
    markSeen([id]);
    // 데스크톱은 목록을 유지한 채 오른쪽 패널만 갱신(마스터-디테일).
    if (!isDesktop) {
      if (screen !== 'detail') setPrevScreen(screen);
      setScreen('detail');
    }
  };

  // 전체화면 상세로 강제 이동(데스크톱 포함). Korea LP 프로필 등 마스터-디테일
  // 우측 패널이 없는 화면에서 기사를 열 때 사용.
  const openItemFull = (id) => {
    setSelectedId(id);
    setRead(r => ({ ...r, [id]: true }));
    markSeen([id]);
    if (screen !== 'detail') setPrevScreen(screen);
    setScreen('detail');
  };

  const toggleBm = (id, e) => {
    if (e) e.stopPropagation();
    setBm(b => ({ ...b, [id]: !b[id] }));
  };

  const goTab = (name) => {
    if (name === 'korlp') setLpSel(null);   // 탭 재진입 시 기관 목록으로 복귀
    setScreen(name);
  };

  const applyFilter = (key) => {
    setFilter(f => f === key ? '전체' : key);
    setScreen('home');
  };

  // Real share: use the OS share sheet (includes 카카오톡, 메시지, 메일 등) when
  // available; otherwise fall back to the in-app sheet with copy-link.
  const onShare = async (it, e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    const data = { title: 'KB GIS · 해외대체투자 뉴스', text: it ? it.ko : '', url: articleUrl(it) };
    if (navigator.share) {
      try { await navigator.share(data); return; } catch (err) { if (err && err.name === 'AbortError') return; }
    }
    setShowShare(true);
  };

  const copyLink = (label) => {
    const url = articleUrl(sel);
    try { navigator.clipboard && navigator.clipboard.writeText(url); } catch (e) {}
    setShowShare(false);
    flash(label === '링크' ? '링크가 복사되었습니다' : label + ' 공유용 링크를 복사했어요');
  };

  // Enrich items (and sanitize any HTML/entities from the feed text)
  const items = articles.map(it => {
    const a = ASSET[it.asset] || ASSET.PE;
    return {
      ...it,
      ko:          clean(it.ko),
      en:          clean(it.en),
      body:        clean(it.body),
      enBody:      clean(it.enBody),
      source:      clean(it.source),
      inst:        clean(it.inst),
      ai:          Array.isArray(it.ai) ? it.ai.map(clean).filter(Boolean) : [],
      assetLabel:  a.label,
      assetColor:  a.color,
      regionLabel: REGION[it.region] || '글로벌',
      catLabel:    CAT_LABEL[it.cat] || '시장 동향',
      instGroup:   grp(it.instType),
      bookmarked:  !!bm[it.id],
      unread:      !read[it.id],
    };
  });

  // Today's news (KST date), for the 오늘 tab
  const todayMD = (() => { const k = new Date(Date.now() + 9 * 3600 * 1000); return `${pad2(k.getUTCMonth() + 1)}.${pad2(k.getUTCDate())}`; })();
  const todayItems = items.filter(i => i.date === todayMD);

  // Date grouping helpers (오늘/어제/YYYY.MM.DD)
  const nowMs = Date.now();
  const keyOfMs = (ms) => { const { y, m, d } = kstYMD(ms); return y + '-' + m + '-' + d; };
  const todayKey = keyOfMs(nowMs), yKey = keyOfMs(nowMs - 86400000);
  const dayKeyOf = (it) => keyOfMs(itemMs(it));
  const dayLabelOf = (it) => {
    const k = dayKeyOf(it);
    if (k === todayKey) return '오늘';
    if (k === yKey) return '어제';
    const { y, m, d } = kstYMD(itemMs(it));
    return `${y}.${pad2(m)}.${pad2(d)}`;
  };

  // New since last visit (badge). Excludes ones already seen/opened.
  const newItems = seen ? items.filter(i => !seen[i.id]) : [];
  const newCount = newItems.length;

  // Filter
  const isGroup  = GROUPS.includes(filter);
  const isAsset  = !!ASSET[filter];
  const isRegion = !!REGION[filter];
  let feedItems = items;
  if (filter !== '전체') {
    if (filter === '인사')        feedItems = items.filter(i => i.cat === '인사');
    else if (filter === '마켓')   feedItems = items.filter(i => i.cat === '마켓');
    else if (filter === 'Global GP') feedItems = items.filter(i => i.instGroup === 'Global GP' && i.cat !== '인사');
    else if (isGroup)            feedItems = items.filter(i => i.instGroup === filter && i.cat !== '인사');
    else if (isAsset)            feedItems = items.filter(i => i.asset === filter);
    else if (isRegion)           feedItems = items.filter(i => i.region === filter);
    else                         feedItems = items.filter(i => i.inst === filter); // 개별 기관·운용사명
  }

  let feedFilterLabel = filter;
  if (filter === '인사')    feedFilterLabel = '조직·인사 이동';
  else if (filter === '마켓') feedFilterLabel = '마켓 뉴스';
  else if (isAsset)         feedFilterLabel = ASSET[filter].label;
  else if (isRegion)        feedFilterLabel = REGION[filter];

  const CHIP_LABEL = { '인사': '조직·인사', '마켓': '마켓 뉴스' };
  const chips = ['전체','마켓','Global GP','연기금','공제회','중앙회','은행','보험·캐피탈','운용·증권','인사'].map(k => ({
    label: CHIP_LABEL[k] || k, active: filter === k,
    bg: filter === k ? '#FFCC00' : '#2a2c30',
    color: filter === k ? '#1c1d1f' : '#cdced0',
  }));

  // Category data
  const ICON   = { '연기금':'연금','공제회':'공제','중앙회':'중앙','은행':'은행','운용·증권':'운용','보험·캐피탈':'보험','해외 GP':'GP' };
  const SAMPLE = { '연기금':'국민연금 · KIC · 사학연금','공제회':'교직원 · 행정 · 군인공제회','중앙회':'농협 · 수협 · 새마을금고','은행':'산업 · 기업 · 수출입은행','운용·증권':'미래에셋 · 삼성 · KB','보험·캐피탈':'삼성생명 · 한화 · 현대해상','해외 GP':'Blackstone · Ares · KKR' };
  // 기관과 무관한 대체투자 마켓 뉴스 수
  const marketCount = items.filter(i => i.cat === '마켓').length;
  // 그룹별 기사 수 (인사·마켓 제외)
  const instsByGroup = {};
  items.forEach(i => { if (i.cat !== '인사' && i.cat !== '마켓') { const g = i.instGroup; (instsByGroup[g] = instsByGroup[g] || {}); instsByGroup[g][i.inst] = (instsByGroup[g][i.inst] || 0) + 1; } });
  // 업권별 전체 LP 로스터(institutions.json) — 기사가 없어도 전 기관을 노출.
  const rosterByGroup = {};
  (roster || []).forEach(r => { (rosterByGroup[r.group] = rosterByGroup[r.group] || []).push(r.name); });
  // 그룹 헤더 카운트: 로스터가 있으면 전체 기관 수, 없으면 기사 보유 기관 수.
  const catGroups = GROUPS.map(g => ({
    name:g,
    count:items.filter(i=>i.instGroup===g&&i.cat!=='인사').length,
    instCount:(rosterByGroup[g] || []).length,
    icon:ICON[g], sample:SAMPLE[g],
  }));
  // 그룹을 펼치면 전체 LP 목록(+각 기관 기사 수)을 기사 많은 순으로 보여줍니다.
  const groupInsts = (g) => {
    const counts = instsByGroup[g] || {};
    const names = (rosterByGroup[g] && rosterByGroup[g].length)
      ? rosterByGroup[g]
      : Object.keys(counts);
    return names
      .map(name => [name, counts[name] || 0])
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  };
  const assetCats = ['RE','PC','PE','IN','AV'].map(k => ({ key:k, label:ASSET[k].label, code:ASSET[k].code, color:ASSET[k].color, count:items.filter(i=>i.asset===k).length }));
  const regionCats = ['US','EU','AP','GL'].map(k => ({ key:k, label:REGION[k], count:items.filter(i=>i.region===k).length }));
  // Global GP data
  const gpTotal = items.filter(i => i.instGroup === 'Global GP' && i.cat !== '인사').length;
  const gpCats = GP_NAMES.map(n => ({ name:n, count:items.filter(i => i.inst === n).length }));

  // Search
  const q = query.trim().toLowerCase();
  const searchItems = q ? items.filter(i => (i.ko+' '+i.en+' '+i.inst+' '+i.instType+' '+i.source+' '+i.assetLabel).toLowerCase().includes(q)) : [];
  const suggests = ['Blackstone','Apollo','국민연금','private credit','infrastructure','aviation'];
  const recentItems = items.filter(i => read[i.id]).slice(0, 3);

  // Bookmarks
  const bmItems = items.filter(i => bm[i.id]);

  // Detail
  const sel = (selectedId && items.find(i => i.id === selectedId)) || items[0];

  // Stats
  const stats = { total:items.length, lp:items.filter(i=>i.cat==='LP').length, gp:items.filter(i=>i.cat==='GP').length, people:items.filter(i=>i.cat==='인사').length };

  const shareTargets = [
    { label:'카카오톡', icon:'K', bg:'#FFE812', fg:'#1c1d1f' },
    { label:'이메일',   icon:'✉', bg:'#f0eee7', fg:'#56585c' },
    { label:'슬랙',     icon:'S', bg:'#f0eee7', fg:'#56585c' },
    { label:'팀즈',     icon:'T', bg:'#f0eee7', fg:'#56585c' },
  ];

  const navProps = { homeNew:newCount, isDesktop, onHome:()=>goTab('home'), onToday:()=>goTab('today'), onCategory:()=>goTab('category'), onKoreaLp:()=>goTab('korlp'), onSearch:()=>goTab('search'), onBookmarks:()=>goTab('bookmarks') };

  // Allocation screen derived data
  const allocRows = (alloc && alloc.institutions) || [];
  const allocSelData = allocRows.find(r => r.name === allocSel) || allocRows[0];

  // Korea LP — 선택 기관 프로필 조립 (profile + alloc + insights + 기사)
  const lpSelAllocRow = lpSel ? allocRows.find(r => r.name === lpSel) : null;
  const lpSelAlloc = lpSelAllocRow ? { ...lpSelAllocRow, asOf: (alloc && alloc.asOf) || '' } : null;
  const lpSelProfile = (lpSel && profiles && profiles[lpSel]) || null;
  const lpSelCio = (lpSel && insights && insights.cios) ? insights.cios.find(c => c.inst === lpSel) : null;
  const lpSelReturns = (lpSel && insights && insights.assetReturns) ? insights.assetReturns.filter(r => r.inst === lpSel) : [];
  const lpSelArticles = lpSel ? items.filter(i => i.inst === lpSel) : [];
  const lpSelGroup = lpSel
    ? (((roster || []).find(r => r.name === lpSel) || {}).group || (lpSelAllocRow && lpSelAllocRow.group) || '국내 LP')
    : '';
  const openLp = (name) => { setLpSel(name); };

  // Desktop master-detail: list screens get a list pane + a persistent detail pane.
  const LIST_SCREENS = ['home', 'today', 'search', 'bookmarks'];
  const desktopMaster = isDesktop && LIST_SCREENS.includes(screen);
  const paneStyle = desktopMaster
    ? { width: 404, flexShrink: 0, minWidth: 0, borderRight: '1px solid #ece9e2', display: 'flex', flexDirection: 'column', minHeight: 0 }
    : { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 };

  return (
    <div className="app-frame" style={{color:'#1c1d1f', ...(isDesktop ? { flexDirection:'row', width:'100vw', height:'100dvh', maxWidth:'none', borderRadius:0, border:'none', boxShadow:'none' } : {})}}>

      {isDesktop && <Sidebar active={screen === 'detail' ? prevScreen : screen} homeNew={newCount} go={goTab} onRefresh={() => refreshNews(true)} />}

      {/* ── LIST PANE (mobile: the whole screen; desktop master: left list) ── */}
      <div style={paneStyle}>

      {/* ── HOME ── */}
      {screen === 'home' && (
        <div style={{flex:1, minHeight:0, display:'flex', flexDirection:'column'}}>
          <div style={{background:'#1c1d1f', color:'#fff', flexShrink:0}}>
            <div style={{height:'env(safe-area-inset-top)', flexShrink:0}}></div>
            {!isDesktop && (
            <div style={{padding:'14px 20px 18px'}}>
              <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                {/* KB GIS 로고를 누르면 새로고침 */}
                <div onClick={() => refreshNews(true)} style={{display:'flex', alignItems:'center', gap:8, cursor:'pointer'}}>
                  <div style={{width:27, height:27, borderRadius:7, background:'#FFCC00', display:'flex', alignItems:'center', justifyContent:'center', font:'800 12px Pretendard', color:'#1c1d1f', letterSpacing:'-.02em'}}>KB</div>
                  <div style={{font:'800 16px Pretendard', color:'#FFCC00', letterSpacing:'.04em'}}>KB GIS</div>
                </div>
                <div style={{width:31, height:31, borderRadius:'50%', border:'1px solid #34363a', display:'flex', alignItems:'center', justifyContent:'center', color:'#a4a5a8', fontSize:13, position:'relative'}}>
                  ⌃
                  <div style={{position:'absolute', top:6, right:7, width:6, height:6, borderRadius:'50%', background:'#FFCC00', border:'1.5px solid #1c1d1f'}}></div>
                </div>
              </div>
            </div>
            )}
            <div style={{height:isDesktop?14:0}}></div>
            <div style={{display:'flex', gap:7, padding:'0 18px 14px', whiteSpace:'nowrap', overflowX:'auto'}}>
              {chips.map(c => (
                <div key={c.label} onClick={() => applyFilter(c.label)} style={{padding:'7px 13px', borderRadius:999, font:'600 12.5px Pretendard', flexShrink:0, cursor:'pointer', background:c.bg, color:c.color}}>{c.label}</div>
              ))}
            </div>
          </div>
          <div style={{flex:1, minHeight:0, overflowY:'auto', background:'#fff'}}>
            {newCount > 0 && (
              <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'11px 18px', background:'#1c1d1f'}}>
                <span style={{font:'600 12px Pretendard', color:'#FFCC00'}}>● 새 소식 {newCount}건</span>
                <span onClick={() => markSeen(items.map(i => i.id))} style={{font:'600 12px Pretendard', color:'#fff', cursor:'pointer', border:'1px solid #3a3c40', borderRadius:999, padding:'4px 11px'}}>모두 확인</span>
              </div>
            )}
            {filter !== '전체' && (
              <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'11px 18px', background:'#fffaeb', borderBottom:'1px solid #f3eccf'}}>
                <span style={{font:'600 12px Pretendard', color:'#9a7d12'}}>필터 · {feedFilterLabel} <span style={{color:'#c4a93a', fontWeight:500}}>{feedItems.length}건</span></span>
                <span onClick={() => setFilter('전체')} style={{font:'600 12px Pretendard', color:'#9a7d12', cursor:'pointer'}}>해제 ✕</span>
              </div>
            )}
            {feedItems.length === 0 && filter !== '전체' && (
              <div style={{padding:'48px 24px', textAlign:'center', color:'#b0b2b6'}}>
                <div style={{fontSize:30}}>▢</div>
                <div style={{font:'600 13px Pretendard', marginTop:10}}>{feedFilterLabel} 관련 최근 기사가 없습니다</div>
                <div style={{font:'500 11px Pretendard', color:'#c2c4c8', marginTop:6}}>새 기사가 수집되면 자동으로 표시됩니다</div>
              </div>
            )}
            {(() => {
              const out = []; let last = null;
              feedItems.forEach(item => {
                const k = dayKeyOf(item);
                if (k !== last) {
                  out.push(<div key={'h' + k} style={{position:'sticky', top:0, zIndex:1, background:'#fbfaf7', font:'700 11.5px Pretendard', color:'#9a7d12', letterSpacing:'.02em', padding:'8px 18px', borderBottom:'1px solid #f0ede4'}}>{dayLabelOf(item)}</div>);
                  last = k;
                }
                out.push(<FeedItem key={item.id} item={item} isNew={seen && !seen[item.id]} selected={isDesktop && selectedId === item.id} onOpen={() => openItem(item.id)} onBookmark={e => toggleBm(item.id, e)} />);
              });
              return out;
            })()}
            <div style={{padding:18, textAlign:'center', font:'500 11px Pretendard', color:'#bcbec2'}}>해외 대체투자 뉴스를 AI가 정리했습니다</div>
          </div>
          <Navbar active="home" {...navProps} />
        </div>
      )}

      {/* ── TODAY ── */}
      {screen === 'today' && (
        <div style={{flex:1, minHeight:0, display:'flex', flexDirection:'column', background:'#fff'}}>
          <div style={{flexShrink:0}}>
            <div style={{height:'max(env(safe-area-inset-top), 8px)', flexShrink:0}}></div>
            <div style={{padding:'2px 20px 16px', borderBottom:'1px solid #efece4', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
              <div>
                <div style={{font:'800 20px Pretendard', letterSpacing:'-.02em'}}>오늘</div>
                <div style={{font:'500 11.5px Pretendard', color:'#9a9ca0', marginTop:3}}>오늘 올라온 뉴스 · {todayMD}</div>
              </div>
              <div onClick={() => refreshNews(true)} style={{cursor:'pointer', font:'600 11.5px Pretendard', color:'#9a7d12', border:'1px solid #ece9e2', borderRadius:999, padding:'6px 12px'}}>⟳ 새로고침</div>
            </div>
          </div>
          <div style={{flex:1, minHeight:0, overflowY:'auto'}}>
            {todayItems.length === 0 ? (
              <div style={{padding:'80px 30px', textAlign:'center'}}>
                <div style={{fontSize:30, color:'#d8d5cd'}}>◷</div>
                <div style={{font:'600 14px Pretendard', color:'#56585c', marginTop:14}}>오늘 올라온 뉴스가 아직 없습니다</div>
                <div style={{font:'500 12px Pretendard', color:'#a6a8ac', marginTop:6, lineHeight:1.5}}>잠시 후 새로고침하거나<br/>홈에서 전체 뉴스를 확인하세요</div>
              </div>
            ) : todayItems.map(item => <FeedItem key={item.id} item={item} isNew={seen && !seen[item.id]} selected={isDesktop && selectedId === item.id} onOpen={() => openItem(item.id)} onBookmark={e => toggleBm(item.id, e)} />)}
          </div>
          <Navbar active="today" {...navProps} />
        </div>
      )}

      {/* ── CATEGORY ── */}
      {screen === 'category' && (
        <div style={{flex:1, minHeight:0, display:'flex', flexDirection:'column', background:'#fff'}}>
          <div style={{flexShrink:0}}>
            <div style={{height:'max(env(safe-area-inset-top), 8px)', flexShrink:0}}></div>
            <div style={{padding:'2px 20px 16px', borderBottom:'1px solid #efece4'}}>
              <div style={{font:'800 20px Pretendard', letterSpacing:'-.02em'}}>카테고리</div>
              <div style={{font:'500 11.5px Pretendard', color:'#9a9ca0', marginTop:3}}>기관·자산군·지역별로 빠르게 모아보기</div>
            </div>
          </div>
          <div style={{flex:1, minHeight:0, overflowY:'auto', padding:18}}>
            {/* 마켓 뉴스 — 기관과 무관한 대체투자 시장·딜·동향 뉴스 */}
            <div onClick={() => applyFilter('마켓')} style={{display:'flex', alignItems:'center', gap:13, border:'1px solid #ece9e2', borderRadius:14, padding:'14px 15px', marginBottom:18, cursor:'pointer', background:'linear-gradient(90deg,#fffaeb,#fff)'}}>
              <span style={{width:38, height:38, borderRadius:10, background:'#FFCC00', display:'flex', alignItems:'center', justifyContent:'center', font:'800 15px Pretendard', color:'#1c1d1f', flexShrink:0}}>📈</span>
              <div style={{flex:1}}>
                <div style={{font:'700 14px Pretendard'}}>마켓 뉴스</div>
                <div style={{font:'500 10.5px Pretendard', color:'#9a9ca0', marginTop:2}}>기관과 무관한 해외 대체투자 시장·딜·전망</div>
              </div>
              <span style={{font:'700 12px Pretendard', color:'#9a7d12', background:'#fff7d6', padding:'3px 10px', borderRadius:999}}>{marketCount}</span>
              <span style={{color:'#cfccc4'}}>›</span>
            </div>
            <div style={{font:'700 11px Pretendard', color:'#a6a8ac', letterSpacing:'.06em', marginBottom:10}}>국내 LP · 업권별 <span style={{fontWeight:500, letterSpacing:0}}>· 기관을 눌러 해당 기관 뉴스 보기{roster ? ` (전체 ${roster.length}개 기관)` : ''}</span></div>
            <div style={{display:'flex', flexDirection:'column', gap:8}}>
              {catGroups.map(g => {
                const open = expandedGroup === g.name;
                const insts = open ? groupInsts(g.name) : [];
                return (
                <div key={g.name} style={{border:'1px solid #ece9e2', borderRadius:13, overflow:'hidden'}}>
                  <div onClick={() => setExpandedGroup(x => x === g.name ? null : g.name)} style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 15px', cursor:'pointer'}}>
                    <div style={{display:'flex', alignItems:'center', gap:11}}>
                      <span style={{width:34, height:34, borderRadius:9, background:'#f2f0ea', display:'flex', alignItems:'center', justifyContent:'center', font:'800 12px Pretendard', color:'#56585c'}}>{g.icon}</span>
                      <div>
                        <div style={{font:'700 14px Pretendard'}}>{g.name}</div>
                        <div style={{font:'500 10.5px Pretendard', color:'#9a9ca0', marginTop:2}}>{g.sample}</div>
                      </div>
                    </div>
                    <div style={{display:'flex', alignItems:'center', gap:9}}>
                      {g.instCount > 0 && <span style={{font:'600 10.5px Pretendard', color:'#9a9ca0'}}>기관 {g.instCount}</span>}
                      <span style={{font:'700 12px Pretendard', color:'#1c1d1f', background:'#f4f2ec', padding:'3px 9px', borderRadius:999}}>{g.count}</span>
                      <span style={{color:'#cfccc4', transform:open?'rotate(90deg)':'none', transition:'transform .15s'}}>›</span>
                    </div>
                  </div>
                  {open && (
                    <div style={{padding:'2px 13px 14px', display:'flex', flexWrap:'wrap', gap:7}}>
                      <div onClick={() => applyFilter(g.name)} style={{font:'600 12px Pretendard', color:'#1c1d1f', background:'#FFCC00', padding:'8px 12px', borderRadius:999, cursor:'pointer'}}>{g.name} 전체 기사 {g.count}</div>
                      {insts.length === 0
                        ? <span style={{font:'500 11.5px Pretendard', color:'#a6a8ac', alignSelf:'center'}}>기관 목록을 불러오는 중…</span>
                        : insts.map(([name, c]) => (
                          <div key={name} onClick={() => applyFilter(name)} style={{font:'600 12px Pretendard', color:c?'#3d3e42':'#a6a8ac', background:c?'#f2f0ea':'#f8f7f3', padding:'8px 12px', borderRadius:999, cursor:'pointer'}}>{name}{c ? <span style={{color:'#9a7d12', marginLeft:4}}>{c}</span> : null}</div>
                        ))}
                    </div>
                  )}
                </div>
                );
              })}
            </div>

            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', margin:'22px 0 10px'}}>
              <span style={{font:'700 11px Pretendard', color:'#a6a8ac', letterSpacing:'.06em'}}>Global GP · 해외 운용사</span>
              <span onClick={() => applyFilter('Global GP')} style={{font:'600 11px Pretendard', color:'#9a7d12', cursor:'pointer'}}>전체 보기 {gpTotal} ›</span>
            </div>
            <div style={{display:'flex', flexWrap:'wrap', gap:8}}>
              {gpCats.map(g => (
                <div key={g.name} onClick={() => applyFilter(g.name)} style={{display:'flex', alignItems:'center', gap:6, font:'600 12.5px Pretendard', color:'#3d3e42', background:'#f2f0ea', padding:'9px 13px', borderRadius:999, cursor:'pointer'}}>
                  {g.name} <span style={{color:'#a6a8ac'}}>{g.count}</span>
                </div>
              ))}
            </div>

            <div style={{font:'700 11px Pretendard', color:'#a6a8ac', letterSpacing:'.06em', margin:'22px 0 10px'}}>자산군</div>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:9}}>
              {assetCats.map(a => (
                <div key={a.key} onClick={() => applyFilter(a.key)} style={{border:'1px solid #ece9e2', borderRadius:13, padding:14, cursor:'pointer'}}>
                  <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                    <span style={{width:9, height:9, borderRadius:3, background:a.color, display:'inline-block'}}></span>
                    <span style={{font:'700 12px Pretendard', color:'#1c1d1f'}}>{a.count}</span>
                  </div>
                  <div style={{font:'700 14px Pretendard', marginTop:9}}>{a.label}</div>
                  <div style={{font:'500 10.5px Pretendard', color:'#9a9ca0', marginTop:2}}>{a.code}</div>
                </div>
              ))}
            </div>
            <div style={{font:'700 11px Pretendard', color:'#a6a8ac', letterSpacing:'.06em', margin:'22px 0 10px'}}>지역</div>
            <div style={{display:'flex', flexWrap:'wrap', gap:8}}>
              {regionCats.map(r => (
                <div key={r.key} onClick={() => applyFilter(r.key)} style={{font:'600 13px Pretendard', color:'#3d3e42', background:'#f2f0ea', padding:'9px 15px', borderRadius:999, cursor:'pointer'}}>
                  {r.label} <span style={{color:'#a6a8ac'}}>{r.count}</span>
                </div>
              ))}
            </div>
          </div>
          <Navbar active="category" {...navProps} />
        </div>
      )}

      {/* ── KOREA LP ── */}
      {screen === 'korlp' && (lpSel ? (
        <LpProfile
          name={lpSel} group={lpSelGroup} profile={lpSelProfile}
          alloc={lpSelAlloc} cio={lpSelCio} returns={lpSelReturns} articles={lpSelArticles}
          onBack={() => setLpSel(null)}
          onOpenArticle={(id) => openItemFull(id)}
        />
      ) : (
        <div style={{flex:1, minHeight:0, display:'flex', flexDirection:'column', background:'#fff'}}>
          <div style={{flexShrink:0}}>
            <div style={{height:'max(env(safe-area-inset-top), 8px)', flexShrink:0}}></div>
            <div style={{padding:'2px 20px 14px', borderBottom:'1px solid #efece4'}}>
              <div style={{font:'800 20px Pretendard', letterSpacing:'-.02em'}}>Korea LP</div>
              <div style={{font:'500 11.5px Pretendard', color:'#9a9ca0', marginTop:3}}>국내 기관(LP)별 프로필 · 대체투자 배분 현황 {roster ? <span style={{color:'#c4a93a'}}>· 전체 {roster.length}개 기관</span> : null}{profilesAt ? <span> · 프로필 {profilesAt} 기준</span> : null}</div>
              <div style={{display:'flex', gap:7, marginTop:13}}>
                {[['inst','기관별 프로필'],['alloc','배분 비교']].map(([k, label]) => (
                  <div key={k} onClick={() => setLpTab(k)} style={{font: lpTab===k ? '700 12.5px Pretendard' : '600 12.5px Pretendard', color: lpTab===k ? '#1c1d1f' : '#9a9ca0', background: lpTab===k ? '#FFCC00' : '#f2f0ea', padding:'8px 16px', borderRadius:999, cursor:'pointer'}}>{label}</div>
                ))}
              </div>
            </div>
          </div>
          <div style={{flex:1, minHeight:0, overflowY:'auto', padding:18}}>
            {lpTab === 'inst' ? (
              /* ── 업권별 기관 목록 → 기관 프로필 ── */
              <div style={{display:'flex', flexDirection:'column', gap:8}}>
                <div style={{font:'500 11px/1.6 Pretendard', color:'#9a9ca0', marginBottom:2}}>업권을 펼쳐 기관을 선택하면 설립연도·AUM·운용방식·CIO·대체투자 배분과 관련 기사를 한눈에 볼 수 있습니다.</div>
                {catGroups.map(g => {
                  const open = lpExpanded === g.name;
                  const names = rosterByGroup[g.name] || [];
                  return (
                    <div key={g.name} style={{border:'1px solid #ece9e2', borderRadius:13, overflow:'hidden'}}>
                      <div onClick={() => setLpExpanded(x => x === g.name ? null : g.name)} style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 15px', cursor:'pointer'}}>
                        <div style={{display:'flex', alignItems:'center', gap:11}}>
                          <span style={{width:34, height:34, borderRadius:9, background:'#f2f0ea', display:'flex', alignItems:'center', justifyContent:'center', font:'800 12px Pretendard', color:'#56585c'}}>{g.icon}</span>
                          <div>
                            <div style={{font:'700 14px Pretendard'}}>{g.name}</div>
                            <div style={{font:'500 10.5px Pretendard', color:'#9a9ca0', marginTop:2}}>{g.sample}</div>
                          </div>
                        </div>
                        <div style={{display:'flex', alignItems:'center', gap:9}}>
                          <span style={{font:'600 10.5px Pretendard', color:'#9a9ca0'}}>기관 {names.length}</span>
                          <span style={{color:'#cfccc4', transform:open?'rotate(90deg)':'none', transition:'transform .15s'}}>›</span>
                        </div>
                      </div>
                      {open && (
                        <div style={{padding:'0 13px 8px'}}>
                          {names.length === 0
                            ? <span style={{font:'500 11.5px Pretendard', color:'#a6a8ac', display:'block', padding:'8px 2px'}}>기관 목록을 불러오는 중…</span>
                            : names.map(name => {
                              const c = (instsByGroup[g.name] || {})[name] || 0;
                              const hasProfile = !!(profiles && profiles[name]);
                              return (
                                <div key={name} onClick={() => openLp(name)} style={{display:'flex', alignItems:'center', gap:8, padding:'11px 4px', borderTop:'1px solid #f3f1ea', cursor:'pointer'}}>
                                  <span style={{flex:1, minWidth:0, font:'600 13px Pretendard', color:'#1c1d1f'}}>{name}{hasProfile && <span style={{color:'#e0b500', marginLeft:5, fontSize:10}}>★</span>}</span>
                                  {c > 0 && <span style={{font:'600 10px Pretendard', color:'#9a7d12', background:'#fff7d6', padding:'2px 8px', borderRadius:999, flexShrink:0}}>기사 {c}</span>}
                                  <span style={{color:'#cfccc4', flexShrink:0}}>›</span>
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  );
                })}
                <div style={{font:'500 10.5px/1.6 Pretendard', color:'#b6b8bc', marginTop:6, textAlign:'center'}}>★ 표시는 설립연도·운용방식 등 상세 프로필이 정리된 기관입니다</div>
              </div>
            ) : (
              /* ── 배분 비교 (기관 간 대체투자 비중·금액) ── */
              !allocSelData ? (
                <div style={{padding:'80px 30px', textAlign:'center'}}>
                  <div style={{fontSize:30, color:'#d8d5cd'}}>▤</div>
                  <div style={{font:'600 14px Pretendard', color:'#56585c', marginTop:14}}>배분 데이터를 불러오는 중…</div>
                </div>
              ) : (
                <>
                  <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12}}>
                    <span style={{font:'700 11px Pretendard', color:'#a6a8ac', letterSpacing:'.06em'}}>기관별 대체투자 비중 {alloc && <span style={{fontWeight:500, color:'#c4a93a'}}>· {alloc.asOf}</span>}</span>
                    <span style={{display:'flex', alignItems:'center', gap:10, font:'500 10px Pretendard', color:'#9a9ca0'}}>
                      <span style={{display:'flex', alignItems:'center', gap:4}}><span style={{width:9, height:9, borderRadius:2, background:'#FFCC00', display:'inline-block'}}></span>해외</span>
                      <span style={{display:'flex', alignItems:'center', gap:4}}><span style={{width:9, height:9, borderRadius:2, background:'#FFE695', display:'inline-block'}}></span>전체</span>
                    </span>
                  </div>
                  <AllocBars rows={allocRows} selName={allocSel} onSelect={setAllocSel} />

                  {/* 선택 기관 요약 + 프로필 진입 */}
                  <div style={{marginTop:24, border:'1px solid #ece9e2', borderRadius:16, padding:16}}>
                    <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:13, flexWrap:'wrap'}}>
                      <span style={{font:'800 16px Pretendard', letterSpacing:'-.02em'}}>{allocSelData.name}</span>
                      <span style={{font:'600 10.5px Pretendard', color:'#56585c', background:'#f0eee7', padding:'2px 8px', borderRadius:5}}>{allocSelData.group}</span>
                      {allocSelData.verified
                        ? <span style={{font:'700 9.5px Pretendard', color:'#1a5fa4', background:'#e6effa', padding:'2px 8px', borderRadius:5, letterSpacing:'.02em'}}>● 공시 확정</span>
                        : <span style={{font:'700 9.5px Pretendard', color:'#9a7d12', background:'#fffaeb', padding:'2px 8px', borderRadius:5, letterSpacing:'.02em'}}>공시 추정치</span>}
                    </div>
                    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:9, marginBottom:14}}>
                      <div style={{background:'#f8f7f3', borderRadius:11, padding:'11px 13px'}}>
                        <div style={{font:'800 18px Pretendard'}}>{fmtAmt(allocSelData.aum)}</div>
                        <div style={{font:'500 10px Pretendard', color:'#9a9ca0', marginTop:2}}>운용자산(AUM)</div>
                      </div>
                      <div style={{background:'#fffaeb', borderRadius:11, padding:'11px 13px'}}>
                        <div style={{font:'800 18px Pretendard', color:'#9a7d12'}}>{fmtAmt(allocSelData.altAmount)}</div>
                        <div style={{font:'500 10px Pretendard', color:'#b89a2e', marginTop:2}}>대체투자 금액</div>
                      </div>
                      <div style={{background:'#f8f7f3', borderRadius:11, padding:'11px 13px'}}>
                        <div style={{font:'800 18px Pretendard'}}>{fmtPct(allocSelData.altPct)}</div>
                        <div style={{font:'500 10px Pretendard', color:'#9a9ca0', marginTop:2}}>대체투자 비중</div>
                      </div>
                      <div style={{background:'#f8f7f3', borderRadius:11, padding:'11px 13px'}}>
                        <div style={{font:'800 18px Pretendard'}}>{fmtPct(allocSelData.overseasAltPct)}</div>
                        <div style={{font:'500 10px Pretendard', color:'#9a9ca0', marginTop:2}}>대체투자 중 해외</div>
                      </div>
                    </div>
                    <div onClick={() => openLp(allocSelData.name)} style={{display:'flex', alignItems:'center', justifyContent:'center', gap:6, height:40, background:'#1c1d1f', borderRadius:11, cursor:'pointer', font:'700 12.5px Pretendard', color:'#fff'}}>{allocSelData.name} 기관 프로필 보기 →</div>
                  </div>

                  {/* 표 */}
                  <div style={{font:'700 11px Pretendard', color:'#a6a8ac', letterSpacing:'.06em', margin:'24px 0 10px'}}>전체 표</div>
                  <div style={{border:'1px solid #ece9e2', borderRadius:13, overflow:'hidden'}}>
                    <div style={{display:'grid', gridTemplateColumns:'1.7fr 1fr 0.9fr 0.9fr', background:'#f8f7f3', padding:'9px 12px', font:'700 10.5px Pretendard', color:'#7a7c80'}}>
                      <span>기관</span><span style={{textAlign:'right'}}>대체투자</span><span style={{textAlign:'right'}}>비중</span><span style={{textAlign:'right'}}>해외</span>
                    </div>
                    {allocRows.map((r) => (
                      <div key={r.name} onClick={() => setAllocSel(r.name)} style={{display:'grid', gridTemplateColumns:'1.7fr 1fr 0.9fr 0.9fr', padding:'11px 12px', borderTop:'1px solid #f3f1ea', cursor:'pointer', background:allocSel===r.name?'#fffaeb':'#fff', alignItems:'center'}}>
                        <span style={{font:'600 12px Pretendard', color:'#1c1d1f'}}>{r.name}</span>
                        <span style={{font:'600 12px Pretendard', textAlign:'right'}}>{fmtAmt(r.altAmount)}</span>
                        <span style={{font:'700 12px Pretendard', textAlign:'right', color:'#9a7d12'}}>{fmtPct(r.altPct)}</span>
                        <span style={{font:'500 12px Pretendard', textAlign:'right', color:'#7a7c80'}}>{fmtPct(r.overseasAltPct)}</span>
                      </div>
                    ))}
                  </div>
                  {alloc && alloc.note && <div style={{font:'500 10.5px/1.6 Pretendard', color:'#b6b8bc', marginTop:14}}>※ {alloc.note}</div>}

                  {/* CIO·인사 현황 (뉴스 자동 추출) */}
                  <div style={{display:'flex', alignItems:'baseline', gap:8, margin:'30px 0 10px'}}>
                    <div style={{font:'700 11px Pretendard', color:'#a6a8ac', letterSpacing:'.06em'}}>주요 LP CIO·인사 현황</div>
                    <span style={{font:'500 9.5px Pretendard', color:'#1a7a4a', background:'#e4f5ea', padding:'2px 7px', borderRadius:5}}>● 뉴스 자동 추출{insights && insights.updatedAt ? ` · ${insights.updatedAt}` : ''}</span>
                  </div>
                  {insights && insights.cios && insights.cios.length ? (
                    <div style={{border:'1px solid #ece9e2', borderRadius:13, overflow:'hidden'}}>
                      {insights.cios.map((c, i) => (
                        <div key={c.inst+i} onClick={() => openLp(c.inst)} style={{padding:'12px 13px', borderTop:i?'1px solid #f3f1ea':'none', cursor:'pointer'}}>
                          <div style={{display:'flex', alignItems:'center', gap:7, flexWrap:'wrap'}}>
                            <span style={{font:'700 12.5px Pretendard', color:'#1c1d1f'}}>{c.inst}</span>
                            <span style={{font:'700 9px Pretendard', color:c.status==='선임'?'#1a5fa4':'#9a7d12', background:c.status==='선임'?'#e6effa':'#fffaeb', padding:'2px 7px', borderRadius:5}}>{c.status}</span>
                            <span style={{marginLeft:'auto', color:'#cfccc4'}}>›</span>
                          </div>
                          <div style={{font:'500 12px/1.5 Pretendard', color:'#3d3e42', marginTop:5}}>{c.note}</div>
                          <div style={{font:'500 10px Pretendard', color:'#b6b8bc', marginTop:5}}>{c.date} · {c.source}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{font:'500 11px/1.6 Pretendard', color:'#b6b8bc', border:'1px dashed #e3e0d8', borderRadius:13, padding:'14px'}}>최근 기사에서 추출된 CIO·인사 정보가 아직 없습니다. 관련 기사가 올라오면 자동 반영됩니다.</div>
                  )}

                  {/* 자산군별 수익률 (뉴스 자동 추출) */}
                  <div style={{display:'flex', alignItems:'baseline', gap:8, margin:'26px 0 10px'}}>
                    <div style={{font:'700 11px Pretendard', color:'#a6a8ac', letterSpacing:'.06em'}}>자산군별 수익률</div>
                    <span style={{font:'500 9.5px Pretendard', color:'#1a7a4a', background:'#e4f5ea', padding:'2px 7px', borderRadius:5}}>● 최근 기사 기준</span>
                  </div>
                  {insights && insights.assetReturns && insights.assetReturns.length ? (
                    <div style={{border:'1px solid #ece9e2', borderRadius:13, overflow:'hidden'}}>
                      {insights.assetReturns.map((r, i) => (
                        <a key={r.asset+i} href={r.url && /^https?:\/\//.test(r.url) ? r.url : undefined} target="_blank" rel="noopener noreferrer"
                           style={{display:'flex', alignItems:'center', gap:10, textDecoration:'none', color:'inherit', padding:'12px 13px', borderTop:i?'1px solid #f3f1ea':'none'}}>
                          <span style={{width:7, height:7, borderRadius:2, background:(ASSET[r.asset]&&ASSET[r.asset].color)||'#c4a93a', display:'inline-block', flexShrink:0}}></span>
                          <span style={{font:'600 12px Pretendard', color:'#1c1d1f', flex:1}}>{r.label}{r.inst?` · ${r.inst}`:''}</span>
                          <span style={{font:'800 14px Pretendard', color:r.value<0?'#c0392b':'#1a7a4a'}}>{r.value>0?'+':''}{r.value}%</span>
                          <span style={{font:'500 9.5px Pretendard', color:'#b6b8bc'}}>{r.date}↗</span>
                        </a>
                      ))}
                    </div>
                  ) : (
                    <div style={{font:'500 11px/1.6 Pretendard', color:'#b6b8bc', border:'1px dashed #e3e0d8', borderRadius:13, padding:'14px'}}>최근 기사에서 확인된 자산군별 수익률이 아직 없습니다. 관련 기사가 올라오면 자동 반영됩니다.</div>
                  )}
                </>
              )
            )}
          </div>
          <Navbar active="korlp" {...navProps} />
        </div>
      ))}

      {/* ── SEARCH ── */}
      {screen === 'search' && (
        <div style={{flex:1, minHeight:0, display:'flex', flexDirection:'column', background:'#fff'}}>
          <div style={{flexShrink:0}}>
            <div style={{height:'max(env(safe-area-inset-top), 8px)', flexShrink:0}}></div>
            <div style={{padding:'4px 18px 16px', borderBottom:'1px solid #efece4'}}>
              <div style={{display:'flex', alignItems:'center', gap:9, background:'#f4f2ec', borderRadius:12, padding:'0 14px', height:46}}>
                <span style={{color:'#9a9ca0', fontSize:16}}>⌕</span>
                <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="기관·GP·자산군 검색 (예: 국민연금, 블랙스톤)" style={{flex:1, border:'none', outline:'none', background:'transparent', font:'500 13.5px Pretendard', color:'#1c1d1f'}} />
                {q && <span onClick={() => setQuery('')} style={{color:'#9a9ca0', fontSize:15, cursor:'pointer'}}>✕</span>}
              </div>
            </div>
          </div>
          <div style={{flex:1, minHeight:0, overflowY:'auto'}}>
            {q ? (
              <>
                <div style={{padding:'12px 18px 6px', font:'600 12px Pretendard', color:'#9a9ca0'}}>검색 결과 <span style={{color:'#1c1d1f'}}>{searchItems.length}</span>건</div>
                {searchItems.map(item => (
                  <div key={item.id} onClick={() => openItem(item.id)} style={{display:'flex', gap:11, padding:'13px 18px', borderBottom:'1px solid #f3f1ea', cursor:'pointer'}}>
                    <div style={{width:3, borderRadius:2, background:item.assetColor, flexShrink:0}}></div>
                    <div style={{flex:1, minWidth:0}}>
                      <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:4}}>
                        <span style={{font:'700 10.5px Pretendard', color:'#1c1d1f', background:'#f0eee7', padding:'2px 7px', borderRadius:5}}>{item.inst}</span>
                        <span style={{font:'600 10.5px Pretendard', color:item.assetColor}}>{item.assetLabel}</span>
                        <span style={{font:'500 10.5px Pretendard', color:'#bcbec2'}}>{item.time}</span>
                      </div>
                      <div style={{font:'650 13.5px/1.4 Pretendard'}}>{item.ko}</div>
                    </div>
                  </div>
                ))}
                {searchItems.length === 0 && <div style={{padding:'60px 20px', textAlign:'center', font:'500 13px Pretendard', color:'#a6a8ac'}}>검색 결과가 없습니다</div>}
              </>
            ) : (
              <div style={{padding:18}}>
                <div style={{font:'700 11px Pretendard', color:'#a6a8ac', letterSpacing:'.06em', marginBottom:11}}>추천 검색어</div>
                <div style={{display:'flex', flexWrap:'wrap', gap:8}}>
                  {suggests.map(t => <div key={t} onClick={() => setQuery(t)} style={{font:'600 12.5px Pretendard', color:'#3d3e42', background:'#f2f0ea', padding:'9px 14px', borderRadius:999, cursor:'pointer'}}>{t}</div>)}
                </div>
                {recentItems.length > 0 && (
                  <>
                    <div style={{font:'700 11px Pretendard', color:'#a6a8ac', letterSpacing:'.06em', margin:'24px 0 11px'}}>최근 본 뉴스</div>
                    {recentItems.map(item => (
                      <div key={item.id} onClick={() => openItem(item.id)} style={{display:'flex', alignItems:'center', gap:10, padding:'11px 0', borderBottom:'1px solid #f3f1ea', cursor:'pointer'}}>
                        <span style={{width:3, height:30, borderRadius:2, background:item.assetColor, flexShrink:0, display:'inline-block'}}></span>
                        <div style={{flex:1, minWidth:0}}>
                          <div style={{font:'600 13px/1.35 Pretendard'}}>{item.ko}</div>
                          <div style={{font:'500 10px Pretendard', color:'#a6a8ac', marginTop:3}}>{item.inst} · {item.source}</div>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
          <Navbar active="search" {...navProps} />
        </div>
      )}

      {/* ── BOOKMARKS ── */}
      {screen === 'bookmarks' && (
        <div style={{flex:1, minHeight:0, display:'flex', flexDirection:'column', background:'#fff'}}>
          <div style={{flexShrink:0}}>
            <div style={{height:'max(env(safe-area-inset-top), 8px)', flexShrink:0}}></div>
            <div style={{padding:'2px 20px 16px', borderBottom:'1px solid #efece4'}}>
              <div style={{font:'800 20px Pretendard', letterSpacing:'-.02em'}}>북마크</div>
              <div style={{font:'500 11.5px Pretendard', color:'#9a9ca0', marginTop:3}}>저장한 뉴스 {bmItems.length}건</div>
            </div>
          </div>
          <div style={{flex:1, minHeight:0, overflowY:'auto'}}>
            {bmItems.length === 0 ? (
              <div style={{padding:'90px 30px', textAlign:'center'}}>
                <div style={{fontSize:30, color:'#d8d5cd'}}>▢</div>
                <div style={{font:'600 14px Pretendard', color:'#56585c', marginTop:14}}>저장한 뉴스가 없습니다</div>
                <div style={{font:'500 12px Pretendard', color:'#a6a8ac', marginTop:6, lineHeight:1.5}}>뉴스 카드의 북마크 아이콘을 눌러<br/>나중에 볼 기사를 저장하세요</div>
              </div>
            ) : bmItems.map(item => (
              <div key={item.id} onClick={() => openItem(item.id)} style={{display:'flex', gap:11, padding:'14px 18px', borderBottom:'1px solid #f3f1ea', cursor:'pointer'}}>
                <div style={{width:3, borderRadius:2, background:item.assetColor, flexShrink:0}}></div>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:4}}>
                    <span style={{font:'700 10.5px Pretendard', color:'#1c1d1f', background:'#f0eee7', padding:'2px 7px', borderRadius:5}}>{item.inst}</span>
                    <span style={{font:'600 10.5px Pretendard', color:item.assetColor}}>{item.assetLabel}</span>
                    <span style={{font:'500 10.5px Pretendard', color:'#bcbec2'}}>{item.time}</span>
                  </div>
                  <div style={{font:'650 14px/1.4 Pretendard'}}>{item.ko}</div>
                </div>
                <div onClick={e => toggleBm(item.id, e)} style={{flexShrink:0, alignSelf:'flex-start', fontSize:15, cursor:'pointer', color:'#1c1d1f', padding:2}}>▣</div>
              </div>
            ))}
          </div>
          <Navbar active="bookmarks" {...navProps} />
        </div>
      )}

      {/* ── DETAIL (full screen — mobile always; desktop when reached from a
             non-list screen like Korea LP that has no master-detail pane) ── */}
      {screen === 'detail' && sel && (!isDesktop || !LIST_SCREENS.includes(prevScreen)) && (
        <ArticleDetail sel={sel} bookmarked={!!bm[sel.id]} onToggleBm={(e) => toggleBm(sel.id, e)} onShare={(e) => onShare(sel, e)} onBack={() => setScreen(prevScreen)} showBack={true} />
      )}

      </div>{/* end list pane */}

      {/* ── DETAIL PANE (desktop master-detail, right side) ── */}
      {desktopMaster && (
        <div style={{flex:1, minWidth:0, minHeight:0, display:'flex', flexDirection:'column'}}>
          <ArticleDetail sel={sel} bookmarked={!!(sel && bm[sel.id])} onToggleBm={(e) => sel && toggleBm(sel.id, e)} onShare={(e) => onShare(sel, e)} showBack={false} />
        </div>
      )}

      {/* ── SHARE SHEET ── */}
      {showShare && (
        <div onClick={() => setShowShare(false)} style={{position:'absolute', inset:0, background:'rgba(20,20,22,.42)', display:'flex', alignItems:'flex-end', zIndex:30}}>
          <div onClick={e => e.stopPropagation()} style={{width:'100%', background:'#fff', borderRadius:'24px 24px 0 0', padding:'10px 20px 26px'}}>
            <div style={{width:38, height:4, borderRadius:2, background:'#e2dfd6', margin:'0 auto 16px'}}></div>
            <div style={{font:'800 16px Pretendard', letterSpacing:'-.01em', marginBottom:4}}>공유하기</div>
            <div style={{font:'500 12px Pretendard', color:'#9a9ca0', marginBottom:16, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{sel && sel.ko}</div>
            <div style={{display:'flex', justifyContent:'space-between', marginBottom:18}}>
              {shareTargets.map(t => (
                <div key={t.label} onClick={() => copyLink(t.label)} style={{display:'flex', flexDirection:'column', alignItems:'center', gap:7, cursor:'pointer', flex:1}}>
                  <div style={{width:50, height:50, borderRadius:15, background:t.bg, color:t.fg, display:'flex', alignItems:'center', justifyContent:'center', font:'800 13px Pretendard'}}>{t.icon}</div>
                  <span style={{font:'500 11px Pretendard', color:'#56585c'}}>{t.label}</span>
                </div>
              ))}
            </div>
            <div onClick={() => copyLink('링크')} style={{display:'flex', alignItems:'center', justifyContent:'space-between', background:'#f4f2ec', borderRadius:12, padding:'13px 15px', cursor:'pointer'}}>
              <span style={{font:'500 12px Pretendard', color:'#7a7c80', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>https://kbgis.app/news/{sel && sel.id}</span>
              <span style={{font:'700 12.5px Pretendard', color:'#1c1d1f', background:'#FFCC00', padding:'6px 13px', borderRadius:8, flexShrink:0, marginLeft:10}}>링크 복사</span>
            </div>
          </div>
        </div>
      )}

      {/* ── TOAST ── */}
      {toast && (
        <div style={{position:'absolute', left:'50%', transform:'translateX(-50%)', bottom:84, background:'#1c1d1f', color:'#fff', font:'600 12.5px Pretendard', padding:'11px 18px', borderRadius:999, zIndex:40, boxShadow:'0 8px 24px rgba(0,0,0,.25)', whiteSpace:'nowrap'}}>
          {toast}
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
