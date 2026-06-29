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

// Merge incoming articles into the stored set WITHOUT dropping old ones,
// so the archive accumulates over time and stays fully searchable.
function mergeArticles(existing, incoming) {
  const map = {};
  (existing || []).forEach(a => { if (a && a.id) map[a.id] = a; });
  (incoming || []).forEach(a => { if (a && a.id) map[a.id] = { ...map[a.id], ...a }; });
  return Object.values(map);
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
  if (!it) return 'https://kbgis.app';
  return it.url || ('https://kbgis.app/news/' + it.id);
}

const ASSET = {
  RE: { label: '부동산',         code: 'Real Estate',     color: 'oklch(0.62 0.13 55)'  },
  PC: { label: 'Private Credit', code: '사모대출',         color: 'oklch(0.6 0.12 210)'  },
  PE: { label: 'Private Equity', code: '사모펀드',         color: 'oklch(0.58 0.13 290)' },
  IN: { label: '인프라',         code: 'Infrastructure',  color: 'oklch(0.58 0.12 155)' },
  AV: { label: 'Aviation',       code: '항공기금융',       color: 'oklch(0.62 0.14 25)'  },
};
const REGION = { US: '미국', EU: '유럽', AP: '아시아', GL: '글로벌' };
const CAT_LABEL = { LP: '한국 LP 동향', GP: 'Global GP 동향', '인사': 'CIO·인사 이동' };
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

const BASE = [
  { id:'n1',  cat:'LP',  inst:'국민연금',       instType:'연기금',   asset:'RE', region:'US', date:'06.26', time:'08:12', source:'Mandate Wire',        lang:'en',
    ko:'국민연금, 미국 멀티패밀리 메자닌 대출에 5억 달러 추가 배정',
    en:'NPS allocates an additional $500M to U.S. multifamily mezzanine debt',
    metric:'+$500M', metricLabel:'추가 배정액',
    ai:['국민연금이 미국 멀티패밀리 메자닌 대출에 5억 달러를 추가 배정했다.','고금리 환경에서 안정적 인컴 확보를 노린 행보로 풀이된다.','대체투자 내 사모대출 목표 배분율은 12%로 상향됐다.'],
    body:'국민연금공단이 미국 멀티패밀리(다세대 임대주택) 메자닌 대출에 5억 달러를 추가로 배정했다. 최근 고금리 환경에서 선순위 대비 높은 금리를 받으면서도 담보가치 하단이 두꺼운 메자닌 구조의 매력이 부각된 결과다. 국민연금은 올해 대체투자 포트폴리오에서 사모대출 비중을 단계적으로 확대하고 있다.',
    enBody:'The National Pension Service has committed an additional $500 million to U.S. multifamily mezzanine debt, citing attractive risk-adjusted yields in a higher-for-longer rate environment. The allocation is part of a broader push to grow private credit within its alternatives book toward a 12% target.' },

  { id:'n2',  cat:'LP',  inst:'교직원공제회',    instType:'공제회',   asset:'PE', region:'EU', date:'06.26', time:'07:48', source:'한국경제',             lang:'ko',
    ko:'한국교직원공제회, 유럽 바이아웃 코인베스트에 2,000억 원 약정',
    en:'The-K commits ₩200bn to European buyout co-investments',
    metric:'₩2,000억', metricLabel:'신규 약정액',
    ai:['교직원공제회가 유럽 바이아웃 코인베스트 프로그램에 2,000억 원을 약정했다.','검증된 GP와의 공동투자로 수수료를 낮추는 전략이다.','유럽 중견기업(미드캡) 딜에 집중 배정될 예정이다.'],
    body:'한국교직원공제회가 유럽 바이아웃 펀드 운용사들과의 코인베스트(공동투자) 프로그램에 2,000억 원을 신규 약정했다. 블라인드 펀드 출자에 더해 직접 딜에 함께 참여해 운용보수와 성과보수를 절감하려는 의도다. 주로 유럽 미드캡 기업 인수 건에 자금이 배정될 전망이다.',
    enBody:null },

  { id:'n3',  cat:'LP',  inst:'행정공제회',      instType:'공제회',   asset:'IN', region:'GL', date:'06.26', time:'07:30', source:'IPE Real Assets',      lang:'en',
    ko:'행정공제회(POBA), 글로벌 인프라 블라인드펀드에 3억 달러 출자',
    en:'POBA commits $300M to a global infrastructure blind-pool fund',
    metric:'+$300M', metricLabel:'출자액',
    ai:['행정공제회가 글로벌 코어플러스 인프라 펀드에 3억 달러를 출자했다.','에너지 전환·디지털 인프라 자산에 분산 투자된다.','물가 연동 현금흐름으로 인플레 헤지를 노린다.'],
    body:'행정공제회(POBA)가 글로벌 운용사의 코어플러스 인프라 블라인드펀드에 3억 달러를 출자했다. 전력·재생에너지, 디지털 인프라(데이터센터·통신탑) 등 물가에 연동되는 현금흐름 자산이 주요 투자 대상이다. 인플레이션 헤지와 장기 안정 수익을 동시에 겨냥한 배분이다.',
    enBody:"The Public Officials Benefit Association (POBA) has committed $300 million to a global core-plus infrastructure fund. The mandate targets energy transition and digital infrastructure assets with inflation-linked cash flows, supporting POBA's goal of stable long-duration returns." },

  { id:'n4',  cat:'LP',  inst:'미래에셋자산운용', instType:'자산운용사', asset:'RE', region:'US', date:'06.26', time:'07:05', source:'더벨',              lang:'ko',
    ko:'미래에셋운용, 미국 데이터센터 개발에 7억 달러 규모 투자 추진',
    en:'Mirae Asset to invest $700M in U.S. data-center development',
    metric:'$700M', metricLabel:'투자 추진 규모',
    ai:['미래에셋자산운용이 미국 데이터센터 개발 사업에 7억 달러 투자를 추진한다.','AI 수요로 급증한 데이터센터 임대 수요를 겨냥했다.','국내 기관 자금을 모아 공동 출자 구조로 진행한다.'],
    body:'미래에셋자산운용이 미국 주요 거점의 하이퍼스케일 데이터센터 개발 사업에 약 7억 달러 규모 투자를 추진한다. 생성형 AI 확산으로 컴퓨팅 수요가 폭증하면서 데이터센터 임대 시장이 구조적 성장 국면에 진입했다는 판단이다. 국내 연기금·공제회 자금을 모아 공동 출자하는 구조로 설계 중이다.',
    enBody:null },

  { id:'n5',  cat:'LP',  inst:'삼성생명',        instType:'보험사',   asset:'PC', region:'EU', date:'06.25', time:'19:40', source:'Private Debt Investor', lang:'en',
    ko:'삼성생명, 유럽 사모대출 펀드에 4억 유로 출자',
    en:'Samsung Life commits €400M to a European private credit fund',
    metric:'€400M', metricLabel:'출자액',
    ai:['삼성생명이 유럽 다이렉트 렌딩 펀드에 4억 유로를 출자했다.','보험 부채에 맞춘 장기·안정 인컴 자산 확보가 목적이다.','유럽 미드마켓 기업 대출이 핵심 투자 대상이다.'],
    body:'삼성생명이 유럽 미드마켓 기업을 대상으로 한 다이렉트 렌딩(직접대출) 펀드에 4억 유로를 출자했다. 장기 보험 부채에 대응하기 위한 안정적 인컴 자산 확보 차원으로, 변동금리 기반 사모대출의 인컴 매력이 부각됐다.',
    enBody:'Samsung Life has committed €400 million to a European direct lending fund focused on mid-market corporates. The insurer is seeking stable, long-duration income to match its liabilities, with floating-rate private credit offering attractive yields.' },

  { id:'n6',  cat:'LP',  inst:'KIC',            instType:'연기금',   asset:'IN', region:'AP', date:'06.25', time:'18:20', source:'IPE Real Assets',      lang:'en',
    ko:'한국투자공사(KIC), 아시아 신재생 인프라에 3억 달러 공동투자',
    en:'KIC co-invests $300M in Asian renewable infrastructure',
    metric:'+$300M', metricLabel:'공동투자액',
    ai:['KIC가 아시아 신재생에너지 인프라에 3억 달러를 공동투자했다.','태양광·풍력 발전 자산 포트폴리오가 대상이다.','에너지 전환 테마의 장기 성장에 베팅했다.'],
    body:'한국투자공사(KIC)가 글로벌 인프라 운용사와 함께 아시아 지역 신재생에너지 인프라에 3억 달러를 공동투자했다. 태양광·풍력 발전 자산과 관련 송배전 인프라가 주요 대상이다. 에너지 전환이라는 구조적 테마의 장기 성장성에 주목한 투자다.',
    enBody:"The Korea Investment Corporation has co-invested $300 million in Asian renewable energy infrastructure alongside a global manager. The portfolio spans solar and wind generation assets, reflecting KIC's conviction in the long-term energy transition theme." },

  { id:'n7',  cat:'LP',  inst:'군인공제회',      instType:'공제회',   asset:'PE', region:'US', date:'06.25', time:'16:10', source:'서울경제',             lang:'ko',
    ko:'군인공제회, 북미 PE 세컨더리 펀드에 1,500억 원 신규 출자',
    en:'MMAA commits ₩150bn to a North American PE secondaries fund',
    metric:'₩1,500억', metricLabel:'신규 출자액',
    ai:['군인공제회가 북미 PE 세컨더리 펀드에 1,500억 원을 출자했다.','할인 매입으로 J커브를 완화하는 전략이다.','분배 지연 환경에서 유동성 확보 수단으로 주목된다.'],
    body:'군인공제회가 북미 사모펀드(PE) 세컨더리 전문 펀드에 1,500억 원을 신규 출자했다. 기존 LP 지분을 할인된 가격에 매입해 초기 손실 구간(J커브)을 완화하고 빠른 분배를 기대할 수 있다는 점이 매력으로 꼽힌다. 분배가 지연되는 시장 환경에서 세컨더리가 유동성 대안으로 부각되고 있다.',
    enBody:null },

  { id:'n8',  cat:'LP',  inst:'미래에셋증권',    instType:'증권사',   asset:'RE', region:'EU', date:'06.25', time:'14:25', source:'매일경제',             lang:'ko',
    ko:'미래에셋증권, 런던 오피스 빌딩 인수금융 5,000억 원 주선',
    en:'Mirae Asset Securities arranges ₩500bn financing for a London office tower',
    metric:'₩5,000억', metricLabel:'인수금융 주선',
    ai:['미래에셋증권이 런던 핵심 오피스 빌딩 인수금융 5,000억 원을 주선했다.','금리 안정 기대에 유럽 오피스 거래가 재개되는 신호다.','셀다운을 통해 국내 기관에 재매각할 계획이다.'],
    body:'미래에셋증권이 런던 시티 권역 프라임 오피스 빌딩 인수를 위한 5,000억 원 규모 인수금융을 주선했다. 가격 조정이 마무리되고 금리 안정 기대가 커지면서 유럽 오피스 시장의 거래가 점진적으로 재개되는 분위기다. 미래에셋증권은 주선 물량 일부를 국내 기관 투자자에 셀다운(재매각)할 계획이다.',
    enBody:null },

  { id:'n9',  cat:'GP',  inst:'Blackstone',     instType:'해외 GP',  asset:'PE', region:'EU', date:'06.25', time:'13:00', source:'PERE',                lang:'en',
    ko:'블랙스톤, 유럽 물류 플랫폼 인수 위해 80억 유로 펀드 클로징',
    en:'Blackstone closes €8B fund for a European logistics platform',
    metric:'€8.0B', metricLabel:'최종 클로징',
    ai:['블랙스톤이 유럽 물류 부동산 펀드를 80억 유로에 최종 클로징했다.','이커머스 성장에 따른 라스트마일 물류 수요가 배경이다.','유럽 핵심 물류 거점 인수에 자금을 집행한다.'],
    body:'블랙스톤이 유럽 물류 부동산에 투자하는 펀드를 80억 유로 규모로 최종 클로징했다. 이커머스 침투율 상승과 공급망 재편으로 라스트마일 물류센터 수요가 견조하다는 판단이다. 펀드는 유럽 핵심 물류 거점의 자산 인수와 개발에 집행될 예정이다.',
    enBody:'Blackstone has held a final close on an €8 billion fund targeting European logistics real estate. The firm points to resilient last-mile demand driven by e-commerce penetration and supply-chain reshoring, with capital earmarked for acquisitions and development across key European hubs.' },

  { id:'n10', cat:'GP',  inst:'Ares',           instType:'해외 GP',  asset:'PC', region:'US', date:'06.25', time:'11:30', source:'Private Debt Investor', lang:'en',
    ko:'에어리스, 북미 다이렉트 렌딩 펀드로 90억 달러 모집 마감',
    en:'Ares wraps up a $9B North American direct lending fund',
    metric:'$9.0B', metricLabel:'펀드 결성액',
    ai:['에어리스가 북미 다이렉트 렌딩 펀드로 90억 달러 모집을 마감했다.','은행 대출 공백을 사모대출이 빠르게 메우고 있다.','중견기업 대상 변동금리 대출이 핵심이다.'],
    body:'에어리스 매니지먼트가 북미 중견기업을 대상으로 한 다이렉트 렌딩 펀드 모집을 90억 달러 규모로 마감했다. 은행권 대출이 위축된 공백을 사모대출이 메우면서 자금 모집이 순조롭게 진행됐다. 변동금리 구조로 고금리 환경의 인컴 매력이 부각된다.',
    enBody:'Ares Management has wrapped up a $9 billion North American direct lending fund focused on middle-market borrowers. Private credit continues to fill the gap left by retreating bank lenders, with floating-rate structures offering compelling income in a higher-rate environment.' },

  { id:'n11', cat:'인사', inst:'APG',            instType:'해외 GP',  asset:'PC', region:'GL', date:'06.25', time:'21:30', source:'Private Debt Investor', lang:'en',
    ko:'APG, 신임 사모대출 부문 CIO에 마르틴 산체스 선임',
    en:'APG names Martin Sanchez as new CIO of private credit',
    metric:'신규 선임', metricLabel:'인사',
    ai:['네덜란드 연기금 운용사 APG가 사모대출 CIO를 새로 선임했다.','마르틴 산체스가 글로벌 사모대출 배분을 총괄한다.','사모대출 비중 확대 기조가 이어질 전망이다.'],
    body:'네덜란드 최대 연기금 운용사 APG가 사모대출 부문 최고투자책임자(CIO)에 마르틴 산체스를 선임했다. 신임 CIO는 글로벌 사모대출 포트폴리오의 배분과 운용을 총괄하게 된다. 시장에서는 APG의 사모대출 비중 확대 기조가 한층 강화될 것으로 본다.',
    enBody:"APG, the Netherlands' largest pension investor, has named Martin Sanchez as Chief Investment Officer for private credit. Sanchez will oversee allocation and management of the firm's global private debt portfolio, reinforcing APG's push to grow the asset class." },

  { id:'n12', cat:'인사', inst:'CalPERS',        instType:'해외 GP',  asset:'PE', region:'US', date:'06.25', time:'16:00', source:'Buyouts',              lang:'en',
    ko:'CalPERS 사모투자 총괄, 12월 말 퇴임 예정',
    en:'CalPERS head of private equity to step down in December',
    metric:'12월 퇴임', metricLabel:'인사',
    ai:['미국 최대 연기금 CalPERS의 사모투자 총괄이 연말 퇴임한다.','후임 인선 전까지 사모투자 전략에 관심이 쏠린다.','CalPERS는 사모투자 비중 확대 기조를 유지해왔다.'],
    body:'미국 최대 공적 연기금 CalPERS의 사모투자(PE) 총괄 책임자가 12월 말 퇴임할 예정이다. 최근 사모투자 비중을 적극 확대해온 만큼 후임 인선과 전략 방향에 시장의 관심이 집중되고 있다.',
    enBody:'The head of private equity at CalPERS, the largest U.S. public pension fund, is set to step down at the end of December. With the fund having actively ramped up its private equity allocation, attention now turns to succession and the future direction of its program.' },
];

// ─── Navbar ───────────────────────────────────────────────
function Navbar({ active, homeNew, isDesktop, onHome, onToday, onCategory, onAlloc, onSearch, onBookmarks }) {
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
      <div onClick={onAlloc} style={tab}>
        <span style={{fontSize:16, lineHeight:1, color:active==='alloc'?on:off}}>▤</span>
        <span style={{font:'600 10px Pretendard', color:active==='alloc'?on:off}}>배분현황</span>
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
    ['alloc', '▤', '배분현황'], ['search', '⌕', '검색'], ['bookmarks', '▢', '북마크'],
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

// ─── ArticleDetail (shared by mobile detail screen & desktop right pane) ──
function ArticleDetail({ sel, bookmarked, onToggleBm, onShare, onBack, showBack }) {
  if (!sel) return (
    <div style={{flex:1, minHeight:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:10, background:'#fcfbf9', color:'#c2c4c8'}}>
      <div style={{fontSize:34}}>▢</div>
      <div style={{font:'600 13.5px Pretendard'}}>왼쪽 목록에서 기사를 선택하세요</div>
    </div>
  );
  const { y, m, d } = kstYMD(itemMs(sel));
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
          <div style={{font:'700 21px/1.4 Pretendard', letterSpacing:'-.02em'}}>{sel.ko}</div>
          {sel.en && sel.en !== sel.ko && <div style={{font:'400 13.5px/1.5 Pretendard', color:'#8a8c90', marginTop:8}}>{sel.en}</div>}
          <div style={{font:'500 11.5px Pretendard', color:'#a6a8ac', marginTop:11}}>{sel.source} · {`${y}.${pad2(m)}.${pad2(d)}`} {sel.time}</div>

          <div style={{marginTop:18, background:'#fffaeb', border:'1px solid #f6ecc8', borderRadius:14, padding:'15px 16px'}}>
            <div style={{display:'flex', alignItems:'center', gap:6, font:'700 11.5px Pretendard', color:'#9a7d12', letterSpacing:'.03em', marginBottom:10}}>
              <span style={{width:17, height:17, borderRadius:5, background:'#FFCC00', color:'#1c1d1f', display:'inline-flex', alignItems:'center', justifyContent:'center', font:'800 9px Pretendard'}}>AI</span>
              3줄 요약
            </div>
            {sel.ai.map((line, i) => (
              <div key={i} style={{display:'flex', gap:8, font:'500 13px/1.55 Pretendard', color:'#3d3e42', marginTop:5}}>
                <span style={{color:'#d9b400', flexShrink:0}}>—</span>
                <span>{line}</span>
              </div>
            ))}
          </div>

          <div style={{marginTop:20}}>
            <div style={{font:'700 11px Pretendard', color:'#a6a8ac', letterSpacing:'.06em', marginBottom:9}}>기사 원문</div>
            <div style={{font:'500 14px/1.75 Pretendard', color:'#34353a', whiteSpace:'pre-wrap'}}>{sel.body}</div>
          </div>

          <div style={{display:'flex', gap:8, marginTop:22}}>
            <div onClick={onShare} style={{flex:1, height:42, background:'#1c1d1f', borderRadius:11, display:'flex', alignItems:'center', justifyContent:'center', gap:6, font:'700 13px Pretendard', color:'#fff', cursor:'pointer'}}>↗ 공유</div>
            <a href={sel.url} target="_blank" rel="noopener noreferrer" style={{flex:1.6, height:42, background:'#FFCC00', borderRadius:11, display:'flex', alignItems:'center', justifyContent:'center', gap:6, font:'700 13px Pretendard', color:'#1c1d1f', textDecoration:'none'}}>기사 전문 보기 ↗</a>
          </div>
          <div style={{font:'500 11px Pretendard', color:'#b6b8bc', textAlign:'center', marginTop:10}}>요약은 참고용입니다 · 전체 내용은 기사 원문에서 확인하세요</div>
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
  const [articles, setArticles]   = useState(() => sortArticles(mergeArticles(store.get('articles', []), BASE)));
  const [selectedId, setSelectedId] = useState(null);
  const [showShare, setShowShare]  = useState(false);
  const [expandedGroup, setExpandedGroup] = useState(null);
  const [alloc, setAlloc]          = useState(null);
  const [allocSel, setAllocSel]    = useState(null);
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
  // appear, existing ones are kept. Called on launch and via the refresh button.
  const refreshNews = (showToast) => {
    if (!NEWS_API) return;
    fetch(NEWS_API + '?t=' + Date.now())
      .then(r => r.json())
      .then(incoming => {
        if (Array.isArray(incoming) && incoming.length) {
          setArticles(prev => sortArticles(mergeArticles(prev, incoming)));
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

  const toggleBm = (id, e) => {
    if (e) e.stopPropagation();
    setBm(b => ({ ...b, [id]: !b[id] }));
  };

  const goTab = (name) => setScreen(name);

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
    else if (filter === 'Global GP') feedItems = items.filter(i => i.instGroup === 'Global GP' && i.cat !== '인사');
    else if (isGroup)            feedItems = items.filter(i => i.instGroup === filter && i.cat !== '인사');
    else if (isAsset)            feedItems = items.filter(i => i.asset === filter);
    else if (isRegion)           feedItems = items.filter(i => i.region === filter);
    else                         feedItems = items.filter(i => i.inst === filter); // 개별 기관·운용사명
  }

  let feedFilterLabel = filter;
  if (filter === '인사')    feedFilterLabel = 'CIO·인사 이동';
  else if (isAsset)         feedFilterLabel = ASSET[filter].label;
  else if (isRegion)        feedFilterLabel = REGION[filter];

  const chips = ['전체','Global GP','연기금','공제회','중앙회','은행','보험·캐피탈','운용·증권','인사'].map(k => ({
    label: k, active: filter === k,
    bg: filter === k ? '#FFCC00' : '#2a2c30',
    color: filter === k ? '#1c1d1f' : '#cdced0',
  }));

  // Category data
  const ICON   = { '연기금':'연금','공제회':'공제','중앙회':'중앙','은행':'은행','운용·증권':'운용','보험·캐피탈':'보험','해외 GP':'GP' };
  const SAMPLE = { '연기금':'국민연금 · KIC · 사학연금','공제회':'교직원 · 행정 · 군인공제회','중앙회':'농협 · 수협 · 새마을금고','은행':'산업 · 기업 · 수출입은행','운용·증권':'미래에셋 · 삼성 · KB','보험·캐피탈':'삼성생명 · 한화 · 현대해상','해외 GP':'Blackstone · Ares · KKR' };
  const catGroups = GROUPS.map(g => ({ name:g, count:items.filter(i=>i.instGroup===g&&i.cat!=='인사').length, icon:ICON[g], sample:SAMPLE[g] }));
  // 업권 그룹별 개별 기관 목록 (기사 많은 순) — 그룹을 펼쳐 기관별로 필터링
  const instsByGroup = {};
  items.forEach(i => { if (i.cat !== '인사') { const g = i.instGroup; (instsByGroup[g] = instsByGroup[g] || {}); instsByGroup[g][i.inst] = (instsByGroup[g][i.inst] || 0) + 1; } });
  const groupInsts = (g) => Object.entries(instsByGroup[g] || {}).sort((a, b) => b[1] - a[1]);
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

  const navProps = { homeNew:newCount, isDesktop, onHome:()=>goTab('home'), onToday:()=>goTab('today'), onCategory:()=>goTab('category'), onAlloc:()=>goTab('alloc'), onSearch:()=>goTab('search'), onBookmarks:()=>goTab('bookmarks') };

  // Allocation screen derived data
  const allocRows = (alloc && alloc.institutions) || [];
  const allocSelData = allocRows.find(r => r.name === allocSel) || allocRows[0];

  // Desktop master-detail: list screens get a list pane + a persistent detail pane.
  const LIST_SCREENS = ['home', 'today', 'search', 'bookmarks'];
  const desktopMaster = isDesktop && LIST_SCREENS.includes(screen);
  const paneStyle = desktopMaster
    ? { width: 404, flexShrink: 0, minWidth: 0, borderRight: '1px solid #ece9e2', display: 'flex', flexDirection: 'column', minHeight: 0 }
    : { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 };

  return (
    <div className="app-frame" style={{color:'#1c1d1f', ...(isDesktop ? { flexDirection:'row', width:'min(1180px, 96vw)', height:'min(900px, 94vh)' } : {})}}>

      {isDesktop && <Sidebar active={screen === 'detail' ? prevScreen : screen} homeNew={newCount} go={goTab} onRefresh={() => refreshNews(true)} />}

      {/* ── LIST PANE (mobile: the whole screen; desktop master: left list) ── */}
      <div style={paneStyle}>

      {/* ── HOME ── */}
      {screen === 'home' && (
        <div style={{flex:1, minHeight:0, display:'flex', flexDirection:'column'}}>
          <div style={{background:'#1c1d1f', color:'#fff', flexShrink:0}}>
            <div style={{height:'env(safe-area-inset-top)', flexShrink:0}}></div>
            <div style={{padding:'14px 20px 18px'}}>
              {!isDesktop && (
              <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14}}>
                <div style={{display:'flex', alignItems:'center', gap:8}}>
                  <div style={{width:27, height:27, borderRadius:7, background:'#FFCC00', display:'flex', alignItems:'center', justifyContent:'center', font:'800 12px Pretendard', color:'#1c1d1f', letterSpacing:'-.02em'}}>KB</div>
                  <div style={{font:'800 16px Pretendard', color:'#FFCC00', letterSpacing:'.04em'}}>KB GIS</div>
                </div>
                <div style={{width:31, height:31, borderRadius:'50%', border:'1px solid #34363a', display:'flex', alignItems:'center', justifyContent:'center', color:'#a4a5a8', fontSize:13, position:'relative'}}>
                  ⌃
                  <div style={{position:'absolute', top:6, right:7, width:6, height:6, borderRadius:'50%', background:'#FFCC00', border:'1.5px solid #1c1d1f'}}></div>
                </div>
              </div>
              )}
              <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                <div style={{font:'800 19px Pretendard', letterSpacing:'-.02em'}}>News</div>
                <div onClick={() => refreshNews(true)} style={{display:'flex', alignItems:'center', gap:5, cursor:'pointer', font:'600 11.5px Pretendard', color:'#cdced0', border:'1px solid #34363a', borderRadius:999, padding:'5px 11px'}}>⟳ 새로고침</div>
              </div>
            </div>
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
            <div style={{font:'700 11px Pretendard', color:'#a6a8ac', letterSpacing:'.06em', marginBottom:10}}>국내 LP · 업권별 <span style={{fontWeight:500, letterSpacing:0}}>· 눌러서 기관 선택</span></div>
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
                      <span style={{font:'700 12px Pretendard', color:'#1c1d1f', background:'#f4f2ec', padding:'3px 9px', borderRadius:999}}>{g.count}</span>
                      <span style={{color:'#cfccc4', transform:open?'rotate(90deg)':'none', transition:'transform .15s'}}>›</span>
                    </div>
                  </div>
                  {open && (
                    <div style={{padding:'2px 13px 14px', display:'flex', flexWrap:'wrap', gap:7}}>
                      <div onClick={() => applyFilter(g.name)} style={{font:'600 12px Pretendard', color:'#1c1d1f', background:'#FFCC00', padding:'8px 12px', borderRadius:999, cursor:'pointer'}}>{g.name} 전체 {g.count}</div>
                      {insts.length === 0
                        ? <span style={{font:'500 11.5px Pretendard', color:'#a6a8ac', alignSelf:'center'}}>아직 수집된 뉴스가 없습니다</span>
                        : insts.map(([name, c]) => (
                          <div key={name} onClick={() => applyFilter(name)} style={{font:'600 12px Pretendard', color:'#3d3e42', background:'#f2f0ea', padding:'8px 12px', borderRadius:999, cursor:'pointer'}}>{name} <span style={{color:'#a6a8ac'}}>{c}</span></div>
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

      {/* ── ALLOCATION (배분현황) ── */}
      {screen === 'alloc' && (
        <div style={{flex:1, minHeight:0, display:'flex', flexDirection:'column', background:'#fff'}}>
          <div style={{flexShrink:0}}>
            <div style={{height:'max(env(safe-area-inset-top), 8px)', flexShrink:0}}></div>
            <div style={{padding:'2px 20px 16px', borderBottom:'1px solid #efece4'}}>
              <div style={{font:'800 20px Pretendard', letterSpacing:'-.02em'}}>대체투자 배분현황</div>
              <div style={{font:'500 11.5px Pretendard', color:'#9a9ca0', marginTop:3}}>국내 LP 기관별 대체투자 비중·금액·연도별 추이 {alloc && <span style={{color:'#c4a93a'}}>· {alloc.asOf} 기준</span>}</div>
            </div>
          </div>
          <div style={{flex:1, minHeight:0, overflowY:'auto', padding:18}}>
            {!allocSelData ? (
              <div style={{padding:'80px 30px', textAlign:'center'}}>
                <div style={{fontSize:30, color:'#d8d5cd'}}>▤</div>
                <div style={{font:'600 14px Pretendard', color:'#56585c', marginTop:14}}>배분 데이터를 불러오는 중…</div>
              </div>
            ) : (
              <>
                {/* 비교 막대 */}
                <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12}}>
                  <span style={{font:'700 11px Pretendard', color:'#a6a8ac', letterSpacing:'.06em'}}>기관별 대체투자 비중</span>
                  <span style={{display:'flex', alignItems:'center', gap:10, font:'500 10px Pretendard', color:'#9a9ca0'}}>
                    <span style={{display:'flex', alignItems:'center', gap:4}}><span style={{width:9, height:9, borderRadius:2, background:'#FFCC00', display:'inline-block'}}></span>해외</span>
                    <span style={{display:'flex', alignItems:'center', gap:4}}><span style={{width:9, height:9, borderRadius:2, background:'#FFE695', display:'inline-block'}}></span>전체</span>
                  </span>
                </div>
                <AllocBars rows={allocRows} selName={allocSel} onSelect={setAllocSel} />

                {/* 선택 기관 상세 */}
                <div style={{marginTop:24, border:'1px solid #ece9e2', borderRadius:16, padding:16}}>
                  <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:13, flexWrap:'wrap'}}>
                    <span style={{font:'800 16px Pretendard', letterSpacing:'-.02em'}}>{allocSelData.name}</span>
                    <span style={{font:'600 10.5px Pretendard', color:'#56585c', background:'#f0eee7', padding:'2px 8px', borderRadius:5}}>{allocSelData.group}</span>
                    {allocSelData.auto
                      ? <span style={{font:'700 9.5px Pretendard', color:'#1a7a4a', background:'#e4f5ea', padding:'2px 8px', borderRadius:5, letterSpacing:'.02em'}}>● {allocSelData.autoKind === 'news' ? '기사 기반' : '자동 갱신'}</span>
                      : <span style={{font:'700 9.5px Pretendard', color:'#9a7d12', background:'#fffaeb', padding:'2px 8px', borderRadius:5, letterSpacing:'.02em'}}>공시 추정치</span>}
                  </div>
                  <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:9, marginBottom:16}}>
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
                  <div style={{font:'700 10.5px Pretendard', color:'#a6a8ac', letterSpacing:'.05em', marginBottom:6}}>대체투자 비중 추이</div>
                  <TrendChart trend={allocSelData.trend} />
                  <div style={{font:'500 10px Pretendard', color:'#b6b8bc', marginTop:8}}>출처 · {allocSelData.source}{allocSelData.auto && allocSelData.updatedAt ? ` · ${allocSelData.updatedAt} 자동 갱신` : ''}</div>
                </div>

                {/* 표 */}
                <div style={{font:'700 11px Pretendard', color:'#a6a8ac', letterSpacing:'.06em', margin:'24px 0 10px'}}>전체 표</div>
                <div style={{border:'1px solid #ece9e2', borderRadius:13, overflow:'hidden'}}>
                  <div style={{display:'grid', gridTemplateColumns:'1.7fr 1fr 0.9fr 0.9fr', background:'#f8f7f3', padding:'9px 12px', font:'700 10.5px Pretendard', color:'#7a7c80'}}>
                    <span>기관</span><span style={{textAlign:'right'}}>대체투자</span><span style={{textAlign:'right'}}>비중</span><span style={{textAlign:'right'}}>해외</span>
                  </div>
                  {allocRows.map((r, i) => (
                    <div key={r.name} onClick={() => setAllocSel(r.name)} style={{display:'grid', gridTemplateColumns:'1.7fr 1fr 0.9fr 0.9fr', padding:'11px 12px', borderTop:'1px solid #f3f1ea', cursor:'pointer', background:allocSel===r.name?'#fffaeb':'#fff', alignItems:'center'}}>
                      <span style={{font:'600 12px Pretendard', color:'#1c1d1f'}}>{r.name}</span>
                      <span style={{font:'600 12px Pretendard', textAlign:'right'}}>{fmtAmt(r.altAmount)}</span>
                      <span style={{font:'700 12px Pretendard', textAlign:'right', color:'#9a7d12'}}>{fmtPct(r.altPct)}</span>
                      <span style={{font:'500 12px Pretendard', textAlign:'right', color:'#7a7c80'}}>{fmtPct(r.overseasAltPct)}</span>
                    </div>
                  ))}
                </div>
                {alloc && alloc.note && <div style={{font:'500 10.5px/1.6 Pretendard', color:'#b6b8bc', marginTop:14}}>※ {alloc.note}</div>}
              </>
            )}
          </div>
          <Navbar active="alloc" {...navProps} />
        </div>
      )}

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

      {/* ── DETAIL (mobile full screen) ── */}
      {screen === 'detail' && sel && !isDesktop && (
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
