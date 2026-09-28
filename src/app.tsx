// @ts-nocheck
/*
 * KB GIS — 해외대체투자 뉴스 앱 (화면 골격)
 *
 * TSX 를 tsc(--jsx react)로 js/ 에 컴파일한 일반 스크립트들로 동작한다(빌드 도구 없음).
 * 로드 순서(index.html): article-clean.js → vendor/readability.js → js/ui.js → js/data.js
 *   → js/glossary.js → js/reader.js → js/brief.js → js/profiles.js → js/article.js → js/app.js
 */
const { useState, useRef, useEffect, useMemo } = React;

// ─── 저장(localStorage) ─────────────────────────────────────
const LS = 'kbgis.';
const store = {
  get(k, d) { try { const v = localStorage.getItem(LS + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch (e) { /* 저장 공간 부족 등 */ } },
};

// ─── 내비게이션 ──────────────────────────────────────────────
const NAV = [['home', 'home', '홈'], ['brief', 'market', '시황'], ['fund', 'layers', '펀드레이징'], ['korlp', 'bank', 'Korea LP'], ['gp', 'globe', 'Global GP'], ['menu', 'grid', '전체']];
const SIDE = [['home', 'home', '홈'], ['brief', 'market', '데일리 시황'], ['korlp', 'bank', 'Korea LP'], ['gp', 'globe', 'Global GP'], ['fund', 'layers', '펀드레이징'], ['deals', 'briefcase', '투자내역'], ['learn', 'book', '용어·개념'], ['search', 'search', '검색'], ['bookmarks', 'bookmark', '북마크']];
const HOME_TABS = [['전체', '전체'], ['GP', 'Global GP'], ['연기금', '연기금'], ['공제회', '공제회'], ['중앙회', '중앙회'], ['은행', '은행'], ['보험·캐피탈', '보험·캐피탈'], ['운용·증권', '운용·증권'], ['인사', '인사'], ['이전', '지방이전']];
const LIST_SCREENS = ['home', 'search', 'bookmarks'];
const PAGE = 120;

const badgeStyle = { minWidth: 17, height: 17, padding: '0 5px', borderRadius: 9, background: KB.up, color: '#fff', font: F(700, 10.5), display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' };

function BottomNav({ active, onGo, badge }) {
  return (
    <nav style={{ flexShrink: 0, display: 'flex', background: KB.bg, borderTop: `1px solid ${KB.line}`, paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {NAV.map(([k, ic, label]) => {
        const on = active === k;
        return (
          <div key={k} onClick={() => onGo(k)} role="button" aria-label={label}
               style={{ flex: 1, height: 58, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, cursor: 'pointer', color: on ? KB.ink : KB.mute, position: 'relative' }}>
            <Ico n={ic} size={23} sw={on ? 2.1 : 1.6} />
            <span style={{ font: on ? F(700, 10.5) : F(500, 10.5), whiteSpace: 'nowrap', letterSpacing: '-.02em' }}>{label}</span>
            {k === 'home' && badge > 0 && <span style={{ ...badgeStyle, position: 'absolute', top: 6, left: '50%', marginLeft: 5 }}>{badge > 99 ? '99+' : badge}</span>}
          </div>
        );
      })}
    </nav>
  );
}

function Sidebar({ active, onGo, badge, onRefresh, updated }) {
  return (
    <aside style={{ width: 236, flexShrink: 0, background: KB.bg, borderRight: `1px solid ${KB.line}`, display: 'flex', flexDirection: 'column', padding: '22px 12px 18px' }}>
      <div style={{ padding: '0 10px 24px' }}><Logo size={19} onClick={() => onGo('home')} /></div>
      {SIDE.map(([k, ic, label]) => {
        const on = active === k;
        return (
          <div key={k} onClick={() => onGo(k)} style={{ display: 'flex', alignItems: 'center', gap: 12, height: 44, padding: '0 12px', marginBottom: 2, borderRadius: 8, cursor: 'pointer', position: 'relative', background: on ? KB.yellowTint : 'transparent', color: on ? KB.ink : KB.ink2, font: on ? F(700, 14.5) : F(500, 14.5) }}>
            {on && <span style={{ position: 'absolute', left: 0, top: 11, bottom: 11, width: 3, borderRadius: 2, background: KB.yellow }}></span>}
            <Ico n={ic} size={20} sw={on ? 2 : 1.7} color={on ? KB.gray : KB.sub} />
            <span>{label}</span>
            {k === 'home' && badge > 0 && <span style={{ ...badgeStyle, marginLeft: 'auto' }}>{badge > 99 ? '99+' : badge}</span>}
          </div>
        );
      })}
      <div style={{ marginTop: 'auto', padding: '16px 10px 0', borderTop: `1px solid ${KB.line}` }}>
        <div onClick={onRefresh} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer', font: F(600, 13.5), color: KB.ink2 }}><Ico n="refresh" size={17} />새로고침</div>
        <div style={{ font: F(500, 12, 1.6), color: KB.mute, marginTop: 8 }}>{updated ? `최근 기사 ${updated}` : ''}<br />기사 3시간 · 시황 매일 08:00 갱신</div>
      </div>
    </aside>
  );
}

// 검색창 모양(누르면 검색 화면)
function SearchField({ value, onChange, onFocus, placeholder, autoFocus, onClear }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 46, padding: '0 14px', background: KB.band, borderRadius: 10 }} onClick={onFocus}>
      <Ico n="search" size={19} color={KB.mute} />
      {onChange
        ? <input value={value} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
                 style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', font: F(500, 15), color: KB.ink }} />
        : <span style={{ flex: 1, font: F(500, 15), color: KB.mute }}>{placeholder}</span>}
      {value && onClear && <span onClick={onClear} style={{ color: KB.mute, cursor: 'pointer' }}><Ico n="close" size={18} /></span>}
    </div>
  );
}

// 바로가기 타일(전체 메뉴)
function Shortcut({ icon, label, onClick, note }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '14px 4px 12px', cursor: 'pointer', borderRadius: 10 }}>
      <span style={{ width: 46, height: 46, borderRadius: 14, background: KB.band, display: 'flex', alignItems: 'center', justifyContent: 'center', color: KB.gray }}><Ico n={icon} size={23} sw={1.8} /></span>
      <span style={{ font: F(600, 12.5), color: KB.ink2, textAlign: 'center', whiteSpace: 'nowrap' }}>{label}</span>
      {note != null && <span style={{ font: F(500, 11), color: KB.mute, marginTop: -5 }}>{note}</span>}
    </div>
  );
}

// ─── App ────────────────────────────────────────────────────
function App() {
  const [screen, setScreen] = useState('home');
  const [prevScreen, setPrevScreen] = useState('home');
  const [filter, setFilter] = useState('전체');
  const [limit, setLimit] = useState(PAGE);
  const [query, setQuery] = useState('');
  const [bm, setBm] = useState(() => store.get('bookmarks', {}));
  const [read, setRead] = useState(() => store.get('read', {}));
  const [seen, setSeen] = useState(() => store.get('seen', null));
  const deadIds = () => store.get('deadIds', {}) || {};
  const [articles, setArticles] = useState(() => sortArticles((store.get('articles', []) || []).filter(isRealArticle).filter((a) => !deadIds()[a.id])));
  const [selectedId, setSelectedId] = useState(null);
  const [shareItem, setShareItem] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const homeScroll = useRef(null);

  const [alloc, setAlloc] = useState(null);
  const [insights, setInsights] = useState(null);
  const [market, setMarket] = useState(null);
  const [briefIndex, setBriefIndex] = useState(null);
  const [briefSel, setBriefSel] = useState(null);
  const [briefCache, setBriefCache] = useState({});
  const [histSeries, setHistSeries] = useState(null);
  const [trendSel, setTrendSel] = useState(null);
  const [liveQuotes, setLiveQuotes] = useState(null);
  const [liveAt, setLiveAt] = useState('');
  const [liveBusy, setLiveBusy] = useState(false);
  const [roster, setRoster] = useState(null);
  const [profiles, setProfiles] = useState(null);
  const [profilesAt, setProfilesAt] = useState('');
  const [gpProfiles, setGpProfiles] = useState(null);
  const [gpProfilesAt, setGpProfilesAt] = useState('');
  const [fundraising, setFundraising] = useState(null);
  const [investments, setInvestments] = useState(null);

  const [lpSel, setLpSel] = useState(null);
  const [lpTab, setLpTab] = useState('inst');
  const [lpGroup, setLpGroup] = useState('전체');
  const [lpQuery, setLpQuery] = useState('');
  const [gpSel, setGpSel] = useState(null);
  const [gpTab, setGpTab] = useState('list');
  const [gpQuery, setGpQuery] = useState('');
  const [dealRole, setDealRole] = useState('all');
  const [dealView, setDealView] = useState('table');
  const [dealQuery, setDealQuery] = useState('');
  const [homeQuery, setHomeQuery] = useState('');
  const [bmQuery, setBmQuery] = useState('');
  const [termSel, setTermSel] = useState(null);
  const [learnFocus, setLearnFocus] = useState(null);

  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 900px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 900px)');
    const h = (e) => setIsDesktop(e.matches);
    mq.addEventListener ? mq.addEventListener('change', h) : mq.addListener(h);
    return () => { mq.removeEventListener ? mq.removeEventListener('change', h) : mq.removeListener(h); };
  }, []);

  useEffect(() => { store.set('bookmarks', bm); }, [bm]);
  useEffect(() => { store.set('read', read); }, [read]);
  useEffect(() => { store.set('articles', articles.slice(0, 600)); prefetchBodies(articles); }, [articles]);
  useEffect(() => { if (seen) store.set('seen', seen); }, [seen]);
  useEffect(() => {
    if (seen === null && articles.length) { const m = {}; articles.forEach((a) => { m[a.id] = true; }); setSeen(m); }
  }, [articles, seen]);
  const markSeen = (ids) => setSeen((s) => { const n = { ...(s || {}) }; ids.forEach((id) => { n[id] = true; }); return n; });

  const flash = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  };

  // 기사 목록은 수집기 결과(news.json)를 그대로 따른다 — 수집기에서 빠진 기사는 화면에서도 사라진다.
  const refreshNews = (showToast) => {
    getJson(API.news).then((incoming) => {
      if (Array.isArray(incoming) && incoming.length) setArticles(sortArticles(incoming.filter(isRealArticle).filter((a) => !deadIds()[a.id])));
      if (showToast) flash(Array.isArray(incoming) ? '최신 기사를 불러왔습니다' : '새로고침하지 못했습니다');
    });
    getJson(API.investments).then((d) => { if (d && Array.isArray(d.items)) setInvestments(d); });
  };
  useEffect(() => {
    refreshNews(false);
    getJson(API.alloc).then((d) => { if (d && Array.isArray(d.institutions)) { d.institutions = d.institutions.slice().sort((a, b) => b.altPct - a.altPct); setAlloc(d); } });
    getJson(API.insights).then((d) => { if (d && (d.cios || d.aums)) setInsights(d); });
    getJson(API.market).then((d) => { if (d && (Array.isArray(d.kr) || Array.isArray(d.global))) setMarket(d); });
    getJson(API.briefIndex).then((d) => { if (Array.isArray(d)) setBriefIndex(d); });
    getJson(API.roster).then((d) => { if (d && Array.isArray(d.institutions)) setRoster(d.institutions); });
    getJson(API.lpProfiles).then((d) => { if (d && d.profiles) { setProfiles(d.profiles); setProfilesAt(d.updatedAt || ''); } });
    getJson(API.gpProfiles).then((d) => { if (d && d.profiles) { setGpProfiles(d.profiles); setGpProfilesAt(d.updatedAt || ''); } });
    getJson(API.fundraising).then((d) => { if (d && Array.isArray(d.items)) setFundraising(d); });
  }, []);

  // 과거 일자 시황은 고를 때 받는다
  useEffect(() => {
    if (!briefSel || briefCache[briefSel] || (market && market.dateKey === briefSel)) return;
    getJson(API.brief(briefSel)).then((d) => { if (d && d.dateKey) setBriefCache((c) => ({ ...c, [briefSel]: d })); });
  }, [briefSel, market]);

  // 실시간 시세 — 시황 화면에 있는 동안 60초마다
  const refreshLive = React.useCallback(async () => {
    setLiveBusy(true);
    try {
      const out = {};
      const [ys, cs] = await Promise.all([
        Promise.allSettled(LIVE_YAHOO.map((sym) => liveYahoo(sym).then((v) => [sym, v]))),
        liveCrypto(),
      ]);
      for (const r of ys) if (r.status === 'fulfilled' && r.value && r.value[1]) out[r.value[0]] = r.value[1];
      Object.assign(out, cs || {});
      if (Object.keys(out).length) {
        setLiveQuotes(out);
        const n = new Date();
        setLiveAt(`${pad2(n.getHours())}:${pad2(n.getMinutes())}`);
      }
    } finally { setLiveBusy(false); }
  }, []);
  useEffect(() => {
    if (screen !== 'brief') return undefined;
    refreshLive();
    const t = setInterval(refreshLive, 60000);
    return () => clearInterval(t);
  }, [screen, refreshLive]);
  const openTrend = (row) => {
    if (!row || !row.symbol) return;
    setTrendSel(row);
    if (!histSeries) getJson(API.history).then((d) => { if (d && d.series) setHistSeries(d.series); });
  };

  // ─── 파생 데이터 ─────────────────────────────────────────
  const items = useMemo(() => articles.map((it) => {
    const known = assetKnown(it);
    const a = known ? ASSET[it.asset] : null;
    const inst = clean(it.inst) || '';
    return {
      ...it,
      ko: nm(stripMedia(clean(it.ko), it.source)), en: clean(it.en), tko: nm(it.tko), source: clean(it.source), inst,
      body: nm(it.body || ''),
      asset: known ? it.asset : '',
      assetLabel: a ? a.label : '',
      regionLabel: REGION[it.region] || '글로벌',
      catLabel: CAT_LABEL[it.cat] || '시장',
      instGroup: grp(it.instType),
      instLabel: it.cat === '마켓' ? '시장 동향' : it.cat === '인사' ? `${inst} · 인사` : it.cat === '이전' ? `${inst} · 지방이전` : inst,
      bookmarked: !!bm[it.id],
    };
  }), [articles, bm]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const artsByInst = useMemo(() => {
    const m = {};
    items.forEach((i) => { if (i.cat !== '마켓') (m[i.inst] = m[i.inst] || []).push(i); });
    return m;
  }, [items]);
  const invItems = (investments && investments.items) || [];
  const dealsByInst = useMemo(() => { const m = {}; invItems.forEach((e) => { (m[e.inst] = m[e.inst] || []).push(e); }); return m; }, [investments]);
  const dealsByArticle = useMemo(() => { const m = {}; invItems.forEach((e) => { (m[e.id] = m[e.id] || []).push(e); }); return m; }, [investments]);
  const allocRows = (alloc && alloc.institutions) || [];
  const newCount = seen ? items.filter((i) => !seen[i.id]).length : 0;
  const latestAt = items[0] ? `${fmtDate(itemMs(items[0]))} ${items[0].time || ''}` : '';

  // ─── 동작 ────────────────────────────────────────────────
  const go = (k) => {
    if (k === 'korlp' && (screen === 'korlp' || screen !== 'detail')) setLpSel(null);
    if (k === 'gp' && (screen === 'gp' || screen !== 'detail')) setGpSel(null);
    if (k === 'home' && screen === 'home') { setFilter('전체'); if (homeScroll.current) homeScroll.current.scrollTop = 0; }
    setScreen(k);
  };
  const openArticle = (id, fallback) => {
    if (!byId.has(id)) {
      const u = fallback && (fallback.gurl || fallback.url);
      if (u) window.open(u, '_blank', 'noopener');
      return;
    }
    setSelectedId(id);
    setRead((r) => ({ ...r, [id]: true }));
    markSeen([id]);
    if (isDesktop && LIST_SCREENS.includes(screen)) return;         // 데스크톱 목록 화면은 오른쪽 창에 연다
    if (screen !== 'detail') setPrevScreen(screen);
    setScreen('detail');
  };
  const openDeal = (e) => openArticle(e.id, e);
  const openInst = (x) => {
    if (!x || !x.inst) return;
    const isGp = x.role === 'GP' || x.instType === '해외 GP';
    if (isGp) { setGpSel(x.inst); setScreen('gp'); }
    else { setLpSel(x.inst); setScreen('korlp'); }
  };
  const toggleBm = (id, e) => { if (e && e.stopPropagation) e.stopPropagation(); setBm((b) => ({ ...b, [id]: !b[id] })); };
  const onShare = async (it) => {
    if (!it) return;
    if (navigator.share) {
      try { await navigator.share({ title: it.ko, text: it.ko, url: it.url }); return; } catch (err) { if (err && err.name === 'AbortError') return; }
    }
    setShareItem(it);
  };
  const applyFilter = (key) => { setFilter(key); setLimit(PAGE); setScreen('home'); if (homeScroll.current) homeScroll.current.scrollTop = 0; };
  const onDead = (id) => { const m = deadIds(); m[id] = 1; store.set('deadIds', m); };
  const openTerm = (id) => setTermSel(id);
  const openLearn = (id) => { setTermSel(null); setLearnFocus(id || null); setScreen('learn'); };

  // ─── 홈 필터 ─────────────────────────────────────────────
  const filterFn = (() => {
    const f = filter;
    if (f === '전체') return () => true;
    if (f === 'GP') return (i) => i.instGroup === 'Global GP' && i.cat !== '인사';
    if (f === '인사') return (i) => i.cat === '인사';
    if (f === '이전') return (i) => i.cat === '이전';
    if (f === '마켓') return (i) => i.cat === '마켓';
    if (f === 'EN') return (i) => i.lang === 'en';
    if (GROUPS.includes(f)) return (i) => i.instGroup === f && i.cat !== '인사';
    if (ASSET[f]) return (i) => i.asset === f;
    if (REGION[f]) return (i) => i.region === f;
    return (i) => i.inst === f;
  })();
  // 목록 안 검색(한글 표기·영문 표기 모두 맞춤)
  const textHit = (qq) => {
    const a = qq.trim().toLowerCase();
    if (!a) return () => true;
    const b = (nm(qq.trim()) || '').toLowerCase();
    return (i) => { const t = `${i.ko} ${nm(i.ko)} ${i.tko || ''} ${i.inst} ${i.source} ${i.assetLabel || ''}`.toLowerCase(); return t.includes(a) || (!!b && b !== a && t.includes(b)); };
  };
  const feedItems = items.filter(filterFn).filter(textHit(homeQuery));
  const isHomeTab = HOME_TABS.some(([k]) => k === filter);
  const filterLabel = ASSET[filter] ? ASSET[filter].label : REGION[filter] ? REGION[filter] : filter === 'EN' ? '영문 기사' : filter === '마켓' ? '시장 동향' : filter;

  const sel = (selectedId && byId.get(selectedId)) || (isDesktop ? feedItems[0] : null) || null;

  // ─── 화면 조각 ───────────────────────────────────────────
  // 투자내역 공통 머리: 검색 + 보기 방식(최신순 / 기관별 / 기관별 표)
  const dealBar = (lbl, ph) => (
    <>
      <SearchField value={dealQuery} onChange={setDealQuery} onClear={() => setDealQuery('')} placeholder={ph} />
      <div style={{ display: 'flex', gap: 6, margin: '12px 0', flexWrap: 'wrap' }}>
        <Chip active={dealView === 'table'} onClick={() => setDealView('table')}>{lbl}별 표</Chip>
        <Chip active={dealView === 'inst'} onClick={() => setDealView('inst')}>{lbl}별</Chip>
        <Chip active={dealView === 'date'} onClick={() => setDealView('date')}>최신순</Chip>
      </div>
    </>
  );
  // 같은 소식은 한 건으로 묶어 보여 준다(북마크 목록은 그대로)
  const feedList = (list, opts = {}) => {
    const out = [];
    let last = null;
    const stories = opts.noGroup ? list.map((lead) => ({ lead, more: [] })) : clusterStories(list);
    const shown = opts.all ? stories : stories.slice(0, limit);
    const counts = {};
    shown.forEach((c) => { const k = dayKeyOf(itemMs(c.lead)); counts[k] = (counts[k] || 0) + 1; });
    shown.forEach(({ lead: item, more }) => {
      const k = dayKeyOf(itemMs(item));
      if (!opts.flat && k !== last) { out.push(<DayHeader key={'d' + k} label={dayLabel(itemMs(item))} count={counts[k]} />); last = k; }
      out.push(<FeedItem key={item.id} item={item} more={more} isNew={!!(seen && !seen[item.id])} selected={isDesktop && sel && (sel.id === item.id || more.some((m) => m.id === sel.id))}
        onOpen={() => openArticle(item.id)} onOpenOther={(id) => openArticle(id)} onPress={() => fetchArchiveBody(item)} onBookmark={(e) => toggleBm(item.id, e)} />);
    });
    if (!opts.all && stories.length > shown.length) {
      out.push(<div key="more" onClick={() => setLimit((n) => n + PAGE)} style={{ textAlign: 'center', padding: '18px 0 22px', font: F(600, 14), color: KB.sub, cursor: 'pointer' }}>기사 {Math.min(PAGE, stories.length - shown.length)}건 더 보기</div>);
    }
    return out;
  };

  const homeScreen = (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: KB.bg }}>
      <div style={{ flexShrink: 0, background: KB.bg }}>
        <div style={{ height: 'env(safe-area-inset-top)' }}></div>
        <div style={{ height: 58, display: 'flex', alignItems: 'center', padding: '0 8px 0 20px' }}>
          {isDesktop
            ? <div><div style={{ font: F(700, 20), color: KB.ink, letterSpacing: '-.02em' }}>최신 기사</div></div>
            : <Logo size={18} onClick={() => refreshNews(true)} />}
          <div style={{ marginLeft: 'auto', display: 'flex' }}>
            {!isDesktop && <IconBtn n="search" label="검색" onClick={() => setScreen('search')} />}
            <IconBtn n="refresh" label="새로고침" onClick={() => refreshNews(true)} />
          </div>
        </div>
        <Tabs scroll pad={20} items={HOME_TABS.map(([k, l]) => [k, l])} value={isHomeTab ? filter : ''} onChange={(k) => { setFilter(k); setLimit(PAGE); if (homeScroll.current) homeScroll.current.scrollTop = 0; }} />
      </div>
      <div ref={homeScroll} style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <div style={{ padding: '12px 20px 4px' }}>
          <SearchField value={homeQuery} onChange={(v) => { setHomeQuery(v); setLimit(PAGE); }} onClear={() => setHomeQuery('')} placeholder={`${isHomeTab && filter !== '전체' ? (HOME_TABS.find(([k]) => k === filter) || [, ''])[1] + ' ' : ''}기사 안에서 검색`} />
          {homeQuery.trim() && <div style={{ font: F(500, 12.5), color: KB.sub, marginTop: 8 }}>검색 결과 {feedItems.length}건</div>}
        </div>
        {!isHomeTab && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', background: KB.yellowTint, borderBottom: `1px solid ${KB.yellowLine}` }}>
            <Ico n="filter" size={16} color={KB.gray} />
            <span style={{ font: F(600, 13.5), color: KB.ink }}>{filterLabel}</span>
            <span style={{ font: F(500, 13), color: KB.sub }}>{feedItems.length}건</span>
            <span onClick={() => setFilter('전체')} style={{ marginLeft: 'auto', font: F(600, 13), color: KB.gray, cursor: 'pointer' }}>필터 해제</span>
          </div>
        )}
        {filter === '전체' && !homeQuery.trim() && (
          <div style={{ paddingBottom: 6 }}>
            <BriefDigest market={market} onOpen={() => setScreen('brief')} />
            <div style={{ height: 14 }}></div>
          </div>
        )}
        {newCount > 0 && filter === '전체' && (
          <div style={{ display: 'flex', alignItems: 'center', padding: '12px 20px', borderTop: `1px solid ${KB.line}` }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: KB.yellow, marginRight: 8 }}></span>
            <span style={{ font: F(600, 13.5), color: KB.ink }}>새 기사 {newCount}건</span>
            <span onClick={() => markSeen(items.map((i) => i.id))} style={{ marginLeft: 'auto', font: F(600, 13), color: KB.sub, cursor: 'pointer' }}>모두 확인</span>
          </div>
        )}
        {feedItems.length === 0
          ? (homeQuery.trim() ? <Empty compact title="검색 결과가 없습니다" desc="다른 단어로 검색하거나 상단 검색에서 전체 기사를 찾아보세요." /> : <Empty title={`${filterLabel} 관련 최근 기사가 없습니다`} desc="새 기사가 수집되면 자동으로 표시됩니다." />)
          : feedList(feedItems)}
        <div style={{ padding: '14px 20px 26px', font: F(400, 12, 1.7), color: KB.mute, textAlign: 'center' }}>
          기사 {items.length.toLocaleString('ko-KR')}건 · 국문·영문 뉴스 검색으로 3시간마다 수집{latestAt ? ` · 최근 ${latestAt}` : ''}
        </div>
      </div>
    </div>
  );

  const briefView = (!briefSel || (market && market.dateKey === briefSel)) ? market : (briefCache[briefSel] || null);
  const briefScreen = (
    <BriefScreen b={briefView} market={market} briefIndex={briefIndex} onSelectDate={setBriefSel}
      live={liveQuotes} liveAt={liveAt} liveBusy={liveBusy} onRefreshLive={refreshLive} onPick={openTrend} />
  );

  // Korea LP
  const lpRows = useMemo(() => (roster || []).map((r) => {
    const d = dealsByInst[r.name] || [];
    const al = allocRows.find((x) => x.name === r.name);
    const pr = profiles && profiles[r.name];
    return { name: r.name, group: r.group, arts: (artsByInst[r.name] || []).length, deals: d.length, ov: d.filter((x) => x.overseas).length, aum: al ? al.aum : (pr && pr.aum), curated: !!(pr && pr.curated) };
  }).sort((a, b) => (b.deals * 3 + b.arts) - (a.deals * 3 + a.arts) || a.name.localeCompare(b.name)), [roster, dealsByInst, artsByInst, alloc, profiles]);
  const lpDeals = invItems.filter((e) => e.role === 'LP');
  const lpScreen = (() => {
    if (lpSel) {
      const r = (roster || []).find((x) => x.name === lpSel);
      const al = allocRows.find((x) => x.name === lpSel);
      const ins = insights || {};
      return (
        <LpProfile name={lpSel} group={(r && r.group) || (al && al.group) || '국내 LP'} profile={profiles && profiles[lpSel]}
          alloc={al ? { ...al, asOf: (alloc && alloc.asOf) || '' } : null}
          cio={(ins.cios || []).find((c) => c.inst === lpSel)} execs={(ins.execs || []).filter((e) => e.inst === lpSel)}
          aumNews={(ins.aums || []).find((x) => x.inst === lpSel)} move={(ins.relocations || []).find((x) => x.inst === lpSel)}
          returns={(ins.assetReturns || []).filter((x) => x.inst === lpSel)}
          articles={artsByInst[lpSel] || []} deals={dealsByInst[lpSel] || []}
          invUpdatedAt={investments && investments.updatedAt} insUpdatedAt={ins.updatedAt}
          onBack={() => setLpSel(null)} onOpenArticle={openArticle} onOpenDeal={openDeal} onOpenInst={openInst} />
      );
    }
    const ql = lpQuery.trim();
    const rows = lpRows.filter((r) => (lpGroup === '전체' || r.group === lpGroup) && (!ql || r.name.includes(ql)));
    return (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: KB.bg }}>
        <TopBar big title="Korea LP" sub={`국내 기관 ${(roster || []).length}곳 · 프로필 ${profilesAt || '-'} 기준 · 투자내역 자동 갱신`} border={false} />
        <Tabs items={[['inst', '기관', (roster || []).length], ['deals', '투자내역', lpDeals.length], ['alloc', '배분·인사']]} value={lpTab} onChange={setLpTab} />
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: isDesktop && lpTab === 'alloc' ? KB.band : KB.bg }}>
          <div style={{ maxWidth: isDesktop ? 880 : 'none', margin: '0 auto', padding: isDesktop && lpTab === 'alloc' ? '20px 24px 40px' : 0 }}>
            {lpTab === 'inst' && (
              <div style={{ padding: '16px 20px 30px' }}>
                <SearchField value={lpQuery} onChange={setLpQuery} onClear={() => setLpQuery('')} placeholder="기관명 검색" />
                <div style={{ display: 'flex', gap: 6, overflowX: 'auto', margin: '14px 0 4px' }}>
                  {['전체', ...GROUPS].map((g) => <Chip key={g} active={lpGroup === g} onClick={() => setLpGroup(g)} count={g === '전체' ? lpRows.length : lpRows.filter((r) => r.group === g).length}>{g}</Chip>)}
                </div>
                {!roster ? <Empty compact title="기관 목록을 불러오는 중입니다" /> : rows.length === 0 ? <Empty compact title="찾는 기관이 없습니다" /> : rows.map((r, i) => (
                  <ListRow key={r.name} first={i === 0} chevron onClick={() => setLpSel(r.name)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ font: F(600, 15.5), color: KB.ink }}>{r.name}</span>
                      {r.curated && <Tag tone="yellow">검증</Tag>}
                    </div>
                    <div style={{ font: F(500, 12.5), color: KB.mute, marginTop: 4 }}>
                      {[r.group, r.aum ? `AUM ${fmtJo(r.aum)}` : '', r.arts ? `기사 ${r.arts}` : '', r.deals ? `투자내역 ${r.deals}${r.ov ? `(해외 ${r.ov})` : ''}` : ''].filter(Boolean).join(' · ')}
                    </div>
                  </ListRow>
                ))}
              </div>
            )}
            {lpTab === 'deals' && (
              <div style={{ padding: '16px 20px 30px' }}>
                {dealBar('기관', '기관·상대방·거래 검색 (예: 국민연금, 인수)')}
                <DealList events={lpDeals} query={dealQuery} onOpen={openDeal} onInst={openInst} showInst grouped={dealView} limit={dealView === 'date' ? 40 : null}
                  emptyTitle="아직 수집된 국내 LP 투자내역이 없습니다" emptyDesc="기관의 출자·인수·위탁운용사 선정 기사가 나오면 자동으로 쌓입니다." />
              </div>
            )}
            {lpTab === 'alloc' && <AllocView alloc={alloc} insights={insights} onOpenLp={(n) => setLpSel(n)} />}
          </div>
        </div>
      </div>
    );
  })();

  // Global GP
  const gpNames = gpProfiles ? Object.keys(gpProfiles) : [];
  // AUM(달러 환산, 십억 달러) 큰 순 — 프로필 AUM 이 없으면 기사 기준 AUM
  const aumB = (txt) => {
    const t = String(txt || '').replace(/,/g, '');
    // "전체 ~$12T · 대체 ~$600B" 처럼 대체투자 AUM 이 따로 있으면 그것으로 줄 세운다(대체투자 운용사 목록이므로)
    const m = t.match(/대체\s*~?\s*([$€£])?\s*([\d.]+)\s*([TtBbMm])/) || t.match(/([$€£])?\s*([\d.]+)\s*([TtBbMm])/);
    if (!m) return null;
    const v = parseFloat(m[2]) * ({ t: 1000, b: 1, m: 0.001 }[m[3].toLowerCase()]);
    return v * ({ '€': 1.08, '£': 1.27 }[m[1]] || 1);
  };
  const gpRows = useMemo(() => gpNames.map((n) => {
    const d = dealsByInst[n] || [];
    const p = gpProfiles[n] || {};
    const news = ((insights && insights.aums) || []).find((x) => x.inst === n);
    const aum = aumB(p.aum) != null ? aumB(p.aum) : (news ? aumB(news.display) : null);
    // 대체투자 AUM 을 알 수 없는 종합운용사(전체 AUM 만 공개: PIMCO·PGIM 등)는 대체 전업사 뒤에 둔다
    const grp = aum == null ? 2 : (/전체/.test(p.aum || '') && !/대체/.test(p.aum || '') ? 1 : 0);
    return { name: n, p, aum, grp, arts: (artsByInst[n] || []).length, deals: d.length };
  }).sort((a, b) => a.grp - b.grp || (b.aum || 0) - (a.aum || 0) || b.arts - a.arts), [gpProfiles, dealsByInst, artsByInst, insights]);
  const gpDeals = invItems.filter((e) => e.role === 'GP');
  const gpScreen = (() => {
    if (gpSel) {
      const ins = insights || {};
      const lpLinks = invItems.filter((e) => (e.role === 'LP' && e.counterpart === gpSel) || (e.role === 'GP' && e.inst === gpSel && e.counterpart));
      return (
        <GpProfile name={gpSel} profile={gpProfiles && gpProfiles[gpSel]} articles={artsByInst[gpSel] || []} deals={dealsByInst[gpSel] || []}
          lpLinks={lpLinks} frEvents={((fundraising && fundraising.items) || []).filter((f) => f.gp === gpSel)}
          aumNews={(ins.aums || []).find((x) => x.inst === gpSel)} invUpdatedAt={investments && investments.updatedAt}
          onBack={() => setGpSel(null)} onOpenArticle={openArticle} onOpenDeal={openDeal} onOpenInst={openInst} />
      );
    }
    const ql = gpQuery.trim().toLowerCase();
    const rows = gpRows.filter((r) => !ql || r.name.toLowerCase().includes(ql));
    const frItems = (fundraising && fundraising.items) || [];
    return (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: KB.bg }}>
        <TopBar big title="Global GP" sub={`해외 운용사 ${gpNames.length}곳 · 대체투자 AUM 순 · 프로필 ${gpProfilesAt || '-'} 기준`} border={false} />
        <Tabs items={[['list', '운용사', gpNames.length], ['deals', '딜', gpDeals.length]]} value={gpTab === 'fr' ? 'list' : gpTab} onChange={setGpTab} />
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <div style={{ maxWidth: isDesktop ? 880 : 'none', margin: '0 auto', padding: '16px 20px 30px' }}>
            {gpTab === 'list' && (
              <>
                <SearchField value={gpQuery} onChange={setGpQuery} onClear={() => setGpQuery('')} placeholder="운용사 검색 (예: Blackstone, KKR)" />
                <div style={{ height: 6 }}></div>
                {!gpProfiles ? <Empty compact title="운용사 목록을 불러오는 중입니다" /> : rows.map((r, i) => (
                  <ListRow key={r.name} first={i === 0} chevron onClick={() => setGpSel(r.name)}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ font: F(700, 13), color: r.aum != null ? KB.gray : KB.faint, width: 22 }}>{r.aum != null ? gpRows.indexOf(r) + 1 : '–'}</span>
                      <span style={{ font: F(600, 15.5), color: KB.ink, flex: 1, minWidth: 0 }}>{r.name}</span>
                      <span style={{ font: F(700, 14), color: KB.ink }}>{r.p.aum || '–'}</span>
                    </div>
                    <div style={{ font: F(500, 12.5), color: KB.mute, marginTop: 4, paddingLeft: 30 }}>
                      {[(r.p.strengths || []).slice(0, 3).map((s) => (s.k && ASSET[s.k] ? ASSET[s.k].label : s.label)).filter(Boolean).join('·'), r.arts ? `기사 ${r.arts}` : '', r.deals ? `딜 ${r.deals}` : ''].filter(Boolean).join(' · ')}
                    </div>
                  </ListRow>
                ))}
              </>
            )}
            {gpTab === 'deals' && (
              <>
                {dealBar('운용사', '운용사·자산·거래 검색 (예: Blackstone, 매각)')}
                <DealList events={gpDeals} query={dealQuery} onOpen={openDeal} onInst={openInst} showInst grouped={dealView} limit={dealView === 'date' ? 40 : null} />
              </>
            )}
            {gpTab === 'fr' && (
              frItems.length === 0 ? <Empty compact title="수집된 모집·클로징 소식이 없습니다" /> : (
                <>
                  {frItems.map((f, i) => (
                    <div key={f.id + i} onClick={() => openArticle(f.id, f)} style={{ padding: '14px 0', borderTop: i ? `1px solid ${KB.line2}` : 'none', cursor: 'pointer' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Tag tone={/파이널|클로즈/.test(f.stage) ? 'yellow' : 'outline'}>{f.stage}</Tag>
                        {f.gp && <span style={{ font: F(700, 14), color: KB.ink }}>{f.gp}</span>}
                        {f.size && <span style={{ font: F(700, 14), color: KB.gray }}>{f.size}</span>}
                        <span style={{ marginLeft: 'auto', font: F(500, 12), color: KB.mute }}>{f.date}</span>
                      </div>
                      <div style={{ font: F(500, 14.5, 1.5), color: KB.ink2, marginTop: 6 }}>{nm(f.title)}</div>
                      <div style={{ font: F(500, 12), color: KB.mute, marginTop: 4 }}>{f.source}</div>
                    </div>
                  ))}
                  <div style={{ font: F(400, 12, 1.7), color: KB.mute, marginTop: 14 }}>모집 단계·규모는 기사 표현을 그대로 옮긴 것이며 3시간마다 갱신됩니다.</div>
                </>
              )
            )}
          </div>
        </div>
      </div>
    );
  })();

  // 투자내역(전체)
  const dealsScreen = (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: KB.bg }}>
      <TopBar big title="투자내역" sub={`국내 LP·해외 GP의 출자·인수·매각 ${invItems.length}건${investments ? ` · ${investments.updatedAt} 갱신` : ''}`} border={false} />
      <Tabs items={[['all', '전체', invItems.length], ['LP', '국내 LP', lpDeals.length], ['GP', '해외 GP', gpDeals.length]]} value={dealRole} onChange={setDealRole} />
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <div style={{ maxWidth: isDesktop ? 880 : 'none', margin: '0 auto', padding: '16px 20px 30px' }}>
          {dealBar(dealRole === 'GP' ? '운용사' : dealRole === 'LP' ? '기관' : '운용사·기관', '기관·운용사·거래 검색 (예: KKR, 출자, 국민연금)')}
          <DealList key={dealRole} query={dealQuery} events={dealRole === 'all' ? invItems : invItems.filter((e) => e.role === dealRole)} onOpen={openDeal} onInst={openInst} showInst grouped={dealView} limit={dealView === 'date' ? 50 : null} />
          <div style={{ font: F(400, 12, 1.7), color: KB.mute, marginTop: 18, paddingTop: 14, borderTop: `1px solid ${KB.line}` }}>
            기사 제목에 출자·인수·매각·펀드 결성 같은 행위가 명시된 경우에만 기록합니다. 금액은 기사 표기 그대로이며, 검토·협상 단계는 ‘추진·검토’로 따로 표시합니다. 같은 딜을 여러 매체가 보도하면 한 건으로 묶습니다.
          </div>
        </div>
      </div>
    </div>
  );

  // 전체 메뉴
  const groupCount = (g) => items.filter((i) => i.instGroup === g && i.cat !== '인사').length;
  const menuScreen = (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: KB.bg }}>
      <TopBar big title="전체" border={false} />
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <div style={{ padding: '4px 20px 0' }}><SearchField placeholder="기사·기관·용어 검색" onFocus={() => setScreen('search')} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', padding: '10px 12px 6px' }}>
          <Shortcut icon="briefcase" label="투자내역" note={invItems.length} onClick={() => setScreen('deals')} />
          <Shortcut icon="book" label="용어·개념" note={GLOSSARY.length} onClick={() => openLearn()} />
          <Shortcut icon="bookmark" label="북마크" note={Object.values(bm).filter(Boolean).length} onClick={() => setScreen('bookmarks')} />
          <Shortcut icon="layers" label="펀드레이징" note={((fundraising && fundraising.items) || []).length} onClick={() => setScreen('fund')} />
          <Shortcut icon="user" label="인사 동향" onClick={() => applyFilter('인사')} />
          <Shortcut icon="flag" label="지방이전" onClick={() => applyFilter('이전')} />
          <Shortcut icon="globe" label="영문 기사" onClick={() => applyFilter('EN')} />
          <Shortcut icon="market" label="데일리 시황" onClick={() => setScreen('brief')} />
        </div>
        <Section title="기관 유형별 기사">
          {GROUPS.map((g, i) => (
            <ListRow key={g} first={i === 0} chevron onClick={() => applyFilter(g)} pad="13px 0">
              <div style={{ display: 'flex', alignItems: 'center' }}><span style={{ font: F(500, 15), color: KB.ink, flex: 1 }}>{g}</span><span style={{ font: F(600, 13), color: KB.sub }}>{groupCount(g)}</span></div>
            </ListRow>
          ))}
          <ListRow chevron onClick={() => applyFilter('GP')} pad="13px 0">
            <div style={{ display: 'flex', alignItems: 'center' }}><span style={{ font: F(500, 15), color: KB.ink, flex: 1 }}>Global GP</span><span style={{ font: F(600, 13), color: KB.sub }}>{items.filter((i) => i.instGroup === 'Global GP' && i.cat !== '인사').length}</span></div>
          </ListRow>
          <ListRow chevron onClick={() => applyFilter('마켓')} pad="13px 0">
            <div style={{ display: 'flex', alignItems: 'center' }}><span style={{ font: F(500, 15), color: KB.ink, flex: 1 }}>시장 동향 (기관 미지정)</span><span style={{ font: F(600, 13), color: KB.sub }}>{items.filter((i) => i.cat === '마켓').length}</span></div>
          </ListRow>
        </Section>
        <Section title="자산군">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {Object.keys(ASSET).map((k) => <Chip key={k} onClick={() => applyFilter(k)} count={items.filter((i) => i.asset === k).length}>{ASSET[k].label}</Chip>)}
          </div>
        </Section>
        <Section title="지역">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {Object.keys(REGION).map((k) => <Chip key={k} onClick={() => applyFilter(k)} count={items.filter((i) => i.region === k).length}>{REGION[k]}</Chip>)}
          </div>
        </Section>
        <Section title="운용사별 기사">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {gpRows.filter((r) => r.arts > 0).slice().sort((a, b) => b.arts - a.arts).slice(0, 24).map((r) => <Chip key={r.name} onClick={() => applyFilter(r.name)} count={r.arts}>{r.name}</Chip>)}
          </div>
        </Section>
        <Section title="데이터 안내">
          {[
            ['기사', `국문·영문 뉴스 검색 결과를 3시간마다 수집합니다. 현재 ${items.length.toLocaleString('ko-KR')}건${latestAt ? `, 최근 ${latestAt}` : ''}.`],
            ['기사 전문', '수집할 때 원문에서 본문을 추출해 두고, 광고·관련기사·기자 정보 등은 제외합니다. 유료·차단 매체는 앞부분만 제공됩니다.'],
            ['투자내역·인사·AUM', '기사 제목과 본문에서 자동으로 뽑아 누적하며, 모든 항목은 근거 기사로 연결됩니다.'],
            ['기관 기준 정보', `공시·연차보고서 기준입니다(국내 LP ${profilesAt || '-'}, 해외 GP ${gpProfilesAt || '-'}).`],
            ['데일리 시황', '매일 08:00(KST)에 전일 시장을 정리합니다. 지표는 누르면 5년 추이를 볼 수 있습니다.'],
          ].map(([k, v], i) => (
            <div key={k} style={{ padding: '12px 0', borderTop: i ? `1px solid ${KB.line2}` : 'none' }}>
              <div style={{ font: F(600, 14), color: KB.ink }}>{k}</div>
              <div style={{ font: F(400, 13, 1.65), color: KB.sub, marginTop: 3 }}>{v}</div>
            </div>
          ))}
        </Section>
      </div>
    </div>
  );

  // 검색 — 기사·기관·용어를 한 번에
  const q = query.trim().toLowerCase();
  const qn = (nm(query.trim()) || '').toLowerCase();       // '블랙스톤'으로 찾아도 Blackstone 기사가 나오게
  const hitQ = (s) => { const t = String(s || '').toLowerCase(); return t.includes(q) || (qn !== q && t.includes(qn)); };
  const searchScreen = (() => {
    const arts = q ? items.filter((i) => hitQ(`${i.ko} ${i.tko || ''} ${i.inst} ${i.source} ${i.assetLabel}`)) : [];
    const insts = q ? [
      ...(roster || []).filter((r) => r.name.toLowerCase().includes(q)).map((r) => ({ inst: r.name, role: 'LP', sub: r.group })),
      ...gpNames.filter((n) => hitQ(n)).map((n) => ({ inst: n, role: 'GP', sub: 'Global GP' })),
    ].slice(0, 8) : [];
    const terms = q ? GLOSSARY.filter((g) => `${g.term} ${g.en}`.toLowerCase().includes(q) || g.aliases.test(query.trim())).slice(0, 6) : [];
    const recent = items.filter((i) => read[i.id]).slice(0, 5);
    return (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: KB.bg }}>
        <div style={{ flexShrink: 0, borderBottom: `1px solid ${KB.line}` }}>
          <div style={{ height: 'env(safe-area-inset-top)' }}></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 16px 10px 6px' }}>
            {!isDesktop && <IconBtn n="back" label="뒤로" onClick={() => setScreen('home')} />}
            <div style={{ flex: 1, marginLeft: isDesktop ? 14 : 0 }}><SearchField value={query} onChange={setQuery} onClear={() => setQuery('')} autoFocus={!isDesktop} placeholder="기사·기관·용어 검색 (예: 국민연금, 블랙스톤, IRR)" /></div>
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {!q ? (
            <div style={{ padding: '18px 20px' }}>
              <div style={{ font: F(700, 14), color: KB.ink, marginBottom: 10 }}>추천 검색어</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {['국민연금', '교직원공제회', 'Blackstone', 'KKR', '사모대출', '세컨더리', '데이터센터', '항공기'].map((t) => <Chip key={t} onClick={() => setQuery(t)}>{t}</Chip>)}
              </div>
              {recent.length > 0 && (
                <>
                  <div style={{ font: F(700, 14), color: KB.ink, margin: '26px 0 2px' }}>최근 본 기사</div>
                  {recent.map((a, i) => <MiniArticle key={a.id} a={a} first={i === 0} onOpen={openArticle} />)}
                </>
              )}
            </div>
          ) : (
            <>
              {insts.length > 0 && (
                <div style={{ padding: '14px 20px 4px' }}>
                  <div style={{ font: F(700, 13.5), color: KB.sub, marginBottom: 2 }}>기관</div>
                  {insts.map((x, i) => (
                    <ListRow key={x.inst} first={i === 0} chevron onClick={() => openInst(x)} pad="12px 0">
                      <span style={{ font: F(600, 15), color: KB.ink }}>{x.inst}</span>
                      <span style={{ font: F(500, 12.5), color: KB.mute, marginLeft: 8 }}>{x.sub}</span>
                    </ListRow>
                  ))}
                </div>
              )}
              {terms.length > 0 && (
                <div style={{ padding: '14px 20px 6px' }}>
                  <div style={{ font: F(700, 13.5), color: KB.sub, marginBottom: 8 }}>용어</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{terms.map((g) => <Chip key={g.id} onClick={() => openTerm(g.id)}>{g.term}</Chip>)}</div>
                </div>
              )}
              <div style={{ padding: '16px 20px 8px', font: F(700, 13.5), color: KB.sub }}>기사 {arts.length}건</div>
              {arts.length ? feedList(arts, { flat: true, all: arts.length <= 200 }) : <Empty compact title="검색 결과가 없습니다" />}
            </>
          )}
        </div>
      </div>
    );
  })();

  const bmAll = items.filter((i) => bm[i.id]);
  const bmItems = bmAll.filter(textHit(bmQuery));
  const bookmarksScreen = (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: KB.bg }}>
      <TopBar big title="북마크" sub={`저장한 기사 ${bmAll.length}건`} />
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {bmAll.length > 0 && <div style={{ padding: '12px 20px 4px' }}><SearchField value={bmQuery} onChange={setBmQuery} onClear={() => setBmQuery('')} placeholder="저장한 기사에서 검색" /></div>}
        {bmItems.length ? feedList(bmItems, { flat: true, all: true, noGroup: true })
          : bmAll.length ? <Empty compact title="검색 결과가 없습니다" />
          : <Empty icon="bookmark" title="저장한 기사가 없습니다" desc="기사 목록의 북마크 아이콘을 눌러 나중에 볼 기사를 저장하세요." />}
      </div>
    </div>
  );

  const detail = (full) => sel && (
    <ArticleDetail sel={sel} bookmarked={!!bm[sel.id]} onToggleBm={() => toggleBm(sel.id)} onShare={() => onShare(sel)}
      onBack={() => setScreen(prevScreen)} showBack={full} deals={dealsByArticle[sel.id] || []}
      onOpenDeal={openDeal} onOpenInst={(x) => openInst({ inst: x.inst, role: x.role, instType: x.instType })} onOpenTerm={openTerm} onDead={onDead} />
  );

  const screens = {
    home: homeScreen, brief: briefScreen, korlp: lpScreen, gp: gpScreen, menu: menuScreen,
    search: searchScreen, bookmarks: bookmarksScreen, deals: dealsScreen,
    fund: <FundraisingView data={fundraising} onOpen={openArticle} onGp={(g) => openInst({ inst: g, role: 'GP' })} />,
    learn: <LearnScreen focus={learnFocus} onFocusDone={() => setLearnFocus(null)} />,
  };
  const navActive = screen === 'detail' ? prevScreen : screen;
  const bottomActive = ['home', 'brief', 'fund', 'korlp', 'gp'].includes(navActive) ? navActive : 'menu';
  const sideActive = navActive === 'menu' ? 'home' : navActive;
  const master = isDesktop && LIST_SCREENS.includes(screen);

  return (
    <UICtx.Provider value={{ desktop: isDesktop }}>
      <div className="app-frame" style={{ color: KB.ink, background: KB.bg, ...(isDesktop ? { flexDirection: 'row' } : {}) }}>
        {isDesktop && <Sidebar active={sideActive} onGo={go} badge={newCount} onRefresh={() => refreshNews(true)} updated={latestAt} />}
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: isDesktop ? 'row' : 'column' }}>
          {screen === 'detail'
            ? detail(true)
            : master
              ? (
                <>
                  <div style={{ width: 440, flexShrink: 0, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', borderRight: `1px solid ${KB.line}` }}>{screens[screen]}</div>
                  <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>{detail(false) || <ArticleDetail sel={null} />}</div>
                </>
              )
              : <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>{screens[screen] || homeScreen}</div>}
          {!isDesktop && screen !== 'detail' && <BottomNav active={bottomActive} onGo={go} badge={newCount} />}
        </div>

        {trendSel && <TrendModal series={histSeries && histSeries[trendSel.symbol]} name={trendSel.name} unit={trendSel.unit} onClose={() => setTrendSel(null)} />}
        <TermSheet id={termSel} onClose={() => setTermSel(null)} onOpenTerm={openTerm} onLearn={() => openLearn(termSel)} />
        <ShareSheet open={!!shareItem} item={shareItem} onClose={() => setShareItem(null)} onCopied={() => { setShareItem(null); flash('기사 링크를 복사했습니다'); }} />
        {toast && (
          <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: isDesktop ? 32 : 82, background: KB.ink, color: '#fff', font: F(600, 13.5), padding: '12px 18px', borderRadius: 10, zIndex: 60, boxShadow: '0 8px 24px rgba(0,0,0,.2)', whiteSpace: 'nowrap' }}>{toast}</div>
        )}
      </div>
    </UICtx.Provider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
