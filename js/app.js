"use strict";
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
    get(k, d) { try {
        const v = localStorage.getItem(LS + k);
        return v == null ? d : JSON.parse(v);
    }
    catch (e) {
        return d;
    } },
    set(k, v) { try {
        localStorage.setItem(LS + k, JSON.stringify(v));
    }
    catch (e) { /* 저장 공간 부족 등 */ } },
};
// ─── 내비게이션 ──────────────────────────────────────────────
const NAV = [['home', 'home', '홈'], ['brief', 'market', '시황'], ['fund', 'layers', '펀드레이징'], ['korlp', 'bank', 'Korea LP'], ['gp', 'globe', 'Global GP'], ['menu', 'grid', '전체']];
const SIDE = [['home', 'home', '홈'], ['brief', 'market', '데일리 시황'], ['korlp', 'bank', 'Korea LP'], ['gp', 'globe', 'Global GP'], ['fund', 'layers', '펀드레이징'], ['deals', 'briefcase', '투자내역'], ['learn', 'book', '용어·개념'], ['search', 'search', '검색'], ['bookmarks', 'bookmark', '북마크']];
const HOME_TABS = [['전체', '전체'], ['GP', 'Global GP'], ['연기금', '연기금'], ['공제회', '공제회'], ['중앙회', '중앙회'], ['은행', '은행'], ['보험·캐피탈', '보험·캐피탈'], ['운용·증권', '운용·증권'], ['인사', '인사'], ['이전', '지방이전']];
const LIST_SCREENS = ['home', 'search', 'bookmarks'];
const PAGE = 120;
const badgeStyle = { minWidth: 17, height: 17, padding: '0 5px', borderRadius: 9, background: KB.up, color: '#fff', font: F(700, 10.5), display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' };
function BottomNav({ active, onGo, badge }) {
    return (React.createElement("nav", { style: { flexShrink: 0, display: 'flex', background: KB.bg, borderTop: `1px solid ${KB.line}`, paddingBottom: 'env(safe-area-inset-bottom)' } }, NAV.map(([k, ic, label]) => {
        const on = active === k;
        return (React.createElement("div", { key: k, onClick: () => onGo(k), role: "button", "aria-label": label, style: { flex: 1, height: 58, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, cursor: 'pointer', color: on ? KB.ink : KB.mute, position: 'relative' } },
            React.createElement(Ico, { n: ic, size: 23, sw: on ? 2.1 : 1.6 }),
            React.createElement("span", { style: { font: on ? F(700, 10.5) : F(500, 10.5), whiteSpace: 'nowrap', letterSpacing: '-.02em' } }, label),
            k === 'home' && badge > 0 && React.createElement("span", { style: { ...badgeStyle, position: 'absolute', top: 6, left: '50%', marginLeft: 5 } }, badge > 99 ? '99+' : badge)));
    })));
}
function Sidebar({ active, onGo, badge, onRefresh, updated }) {
    return (React.createElement("aside", { style: { width: 236, flexShrink: 0, background: KB.bg, borderRight: `1px solid ${KB.line}`, display: 'flex', flexDirection: 'column', padding: '22px 12px 18px' } },
        React.createElement("div", { style: { padding: '0 10px 24px' } },
            React.createElement(Logo, { size: 19, onClick: () => onGo('home') })),
        SIDE.map(([k, ic, label]) => {
            const on = active === k;
            return (React.createElement("div", { key: k, onClick: () => onGo(k), style: { display: 'flex', alignItems: 'center', gap: 12, height: 44, padding: '0 12px', marginBottom: 2, borderRadius: 8, cursor: 'pointer', position: 'relative', background: on ? KB.yellowTint : 'transparent', color: on ? KB.ink : KB.ink2, font: on ? F(700, 14.5) : F(500, 14.5) } },
                on && React.createElement("span", { style: { position: 'absolute', left: 0, top: 11, bottom: 11, width: 3, borderRadius: 2, background: KB.yellow } }),
                React.createElement(Ico, { n: ic, size: 20, sw: on ? 2 : 1.7, color: on ? KB.gray : KB.sub }),
                React.createElement("span", null, label),
                k === 'home' && badge > 0 && React.createElement("span", { style: { ...badgeStyle, marginLeft: 'auto' } }, badge > 99 ? '99+' : badge)));
        }),
        React.createElement("div", { style: { marginTop: 'auto', padding: '16px 10px 0', borderTop: `1px solid ${KB.line}` } },
            React.createElement("div", { onClick: onRefresh, style: { display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer', font: F(600, 13.5), color: KB.ink2 } },
                React.createElement(Ico, { n: "refresh", size: 17 }),
                "\uC0C8\uB85C\uACE0\uCE68"),
            React.createElement("div", { style: { font: F(500, 12, 1.6), color: KB.mute, marginTop: 8 } },
                updated ? `최근 기사 ${updated}` : '',
                React.createElement("br", null),
                "\uAE30\uC0AC 3\uC2DC\uAC04 \u00B7 \uC2DC\uD669 \uB9E4\uC77C 08:00 \uAC31\uC2E0"))));
}
// 검색창 모양(누르면 검색 화면)
function SearchField({ value, onChange, onFocus, placeholder, autoFocus, onClear }) {
    return (React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 8, height: 46, padding: '0 14px', background: KB.band, borderRadius: 10 }, onClick: onFocus },
        React.createElement(Ico, { n: "search", size: 19, color: KB.mute }),
        onChange
            ? React.createElement("input", { value: value, autoFocus: autoFocus, onChange: (e) => onChange(e.target.value), placeholder: placeholder, style: { flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', font: F(500, 15), color: KB.ink } })
            : React.createElement("span", { style: { flex: 1, font: F(500, 15), color: KB.mute } }, placeholder),
        value && onClear && React.createElement("span", { onClick: onClear, style: { color: KB.mute, cursor: 'pointer' } },
            React.createElement(Ico, { n: "close", size: 18 }))));
}
// 바로가기 타일(전체 메뉴)
function Shortcut({ icon, label, onClick, note }) {
    return (React.createElement("div", { onClick: onClick, style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '14px 4px 12px', cursor: 'pointer', borderRadius: 10 } },
        React.createElement("span", { style: { width: 46, height: 46, borderRadius: 14, background: KB.band, display: 'flex', alignItems: 'center', justifyContent: 'center', color: KB.gray } },
            React.createElement(Ico, { n: icon, size: 23, sw: 1.8 })),
        React.createElement("span", { style: { font: F(600, 12.5), color: KB.ink2, textAlign: 'center', whiteSpace: 'nowrap' } }, label),
        note != null && React.createElement("span", { style: { font: F(500, 11), color: KB.mute, marginTop: -5 } }, note)));
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
    useEffect(() => { if (seen)
        store.set('seen', seen); }, [seen]);
    useEffect(() => {
        if (seen === null && articles.length) {
            const m = {};
            articles.forEach((a) => { m[a.id] = true; });
            setSeen(m);
        }
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
            if (Array.isArray(incoming) && incoming.length)
                setArticles(sortArticles(incoming.filter(isRealArticle).filter((a) => !deadIds()[a.id])));
            if (showToast)
                flash(Array.isArray(incoming) ? '최신 기사를 불러왔습니다' : '새로고침하지 못했습니다');
        });
        getJson(API.investments).then((d) => { if (d && Array.isArray(d.items))
            setInvestments(d); });
    };
    useEffect(() => {
        refreshNews(false);
        getJson(API.alloc).then((d) => { if (d && Array.isArray(d.institutions)) {
            d.institutions = d.institutions.slice().sort((a, b) => b.altPct - a.altPct);
            setAlloc(d);
        } });
        getJson(API.insights).then((d) => { if (d && (d.cios || d.aums))
            setInsights(d); });
        getJson(API.market).then((d) => { if (d && (Array.isArray(d.kr) || Array.isArray(d.global)))
            setMarket(d); });
        getJson(API.briefIndex).then((d) => { if (Array.isArray(d))
            setBriefIndex(d); });
        getJson(API.roster).then((d) => { if (d && Array.isArray(d.institutions))
            setRoster(d.institutions); });
        getJson(API.lpProfiles).then((d) => { if (d && d.profiles) {
            setProfiles(d.profiles);
            setProfilesAt(d.updatedAt || '');
        } });
        getJson(API.gpProfiles).then((d) => { if (d && d.profiles) {
            setGpProfiles(d.profiles);
            setGpProfilesAt(d.updatedAt || '');
        } });
        getJson(API.fundraising).then((d) => { if (d && Array.isArray(d.items))
            setFundraising(d); });
    }, []);
    // 과거 일자 시황은 고를 때 받는다
    useEffect(() => {
        if (!briefSel || briefCache[briefSel] || (market && market.dateKey === briefSel))
            return;
        getJson(API.brief(briefSel)).then((d) => { if (d && d.dateKey)
            setBriefCache((c) => ({ ...c, [briefSel]: d })); });
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
            for (const r of ys)
                if (r.status === 'fulfilled' && r.value && r.value[1])
                    out[r.value[0]] = r.value[1];
            Object.assign(out, cs || {});
            if (Object.keys(out).length) {
                setLiveQuotes(out);
                const n = new Date();
                setLiveAt(`${pad2(n.getHours())}:${pad2(n.getMinutes())}`);
            }
        }
        finally {
            setLiveBusy(false);
        }
    }, []);
    useEffect(() => {
        if (screen !== 'brief')
            return undefined;
        refreshLive();
        const t = setInterval(refreshLive, 60000);
        return () => clearInterval(t);
    }, [screen, refreshLive]);
    const openTrend = (row) => {
        if (!row || !row.symbol)
            return;
        setTrendSel(row);
        if (!histSeries)
            getJson(API.history).then((d) => { if (d && d.series)
                setHistSeries(d.series); });
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
        items.forEach((i) => { if (i.cat !== '마켓')
            (m[i.inst] = m[i.inst] || []).push(i); });
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
        if (k === 'korlp' && (screen === 'korlp' || screen !== 'detail'))
            setLpSel(null);
        if (k === 'gp' && (screen === 'gp' || screen !== 'detail'))
            setGpSel(null);
        if (k === 'home' && screen === 'home') {
            setFilter('전체');
            if (homeScroll.current)
                homeScroll.current.scrollTop = 0;
        }
        setScreen(k);
    };
    const openArticle = (id, fallback) => {
        if (!byId.has(id)) {
            const u = fallback && (fallback.gurl || fallback.url);
            if (u)
                window.open(u, '_blank', 'noopener');
            return;
        }
        setSelectedId(id);
        setRead((r) => ({ ...r, [id]: true }));
        markSeen([id]);
        if (isDesktop && LIST_SCREENS.includes(screen))
            return; // 데스크톱 목록 화면은 오른쪽 창에 연다
        if (screen !== 'detail')
            setPrevScreen(screen);
        setScreen('detail');
    };
    const openDeal = (e) => openArticle(e.id, e);
    const openInst = (x) => {
        if (!x || !x.inst)
            return;
        const isGp = x.role === 'GP' || x.instType === '해외 GP';
        if (isGp) {
            setGpSel(x.inst);
            setScreen('gp');
        }
        else {
            setLpSel(x.inst);
            setScreen('korlp');
        }
    };
    const toggleBm = (id, e) => { if (e && e.stopPropagation)
        e.stopPropagation(); setBm((b) => ({ ...b, [id]: !b[id] })); };
    const onShare = async (it) => {
        if (!it)
            return;
        if (navigator.share) {
            try {
                await navigator.share({ title: it.ko, text: it.ko, url: it.url });
                return;
            }
            catch (err) {
                if (err && err.name === 'AbortError')
                    return;
            }
        }
        setShareItem(it);
    };
    const applyFilter = (key) => { setFilter(key); setLimit(PAGE); setScreen('home'); if (homeScroll.current)
        homeScroll.current.scrollTop = 0; };
    const onDead = (id) => { const m = deadIds(); m[id] = 1; store.set('deadIds', m); };
    const openTerm = (id) => setTermSel(id);
    const openLearn = (id) => { setTermSel(null); setLearnFocus(id || null); setScreen('learn'); };
    // ─── 홈 필터 ─────────────────────────────────────────────
    const filterFn = (() => {
        const f = filter;
        if (f === '전체')
            return () => true;
        if (f === 'GP')
            return (i) => i.instGroup === 'Global GP' && i.cat !== '인사';
        if (f === '인사')
            return (i) => i.cat === '인사';
        if (f === '이전')
            return (i) => i.cat === '이전';
        if (f === '마켓')
            return (i) => i.cat === '마켓';
        if (f === 'EN')
            return (i) => i.lang === 'en';
        if (GROUPS.includes(f))
            return (i) => i.instGroup === f && i.cat !== '인사';
        if (ASSET[f])
            return (i) => i.asset === f;
        if (REGION[f])
            return (i) => i.region === f;
        return (i) => i.inst === f;
    })();
    // 목록 안 검색(한글 표기·영문 표기 모두 맞춤)
    const textHit = (qq) => {
        const a = qq.trim().toLowerCase();
        if (!a)
            return () => true;
        const b = (nm(qq.trim()) || '').toLowerCase();
        return (i) => { const t = `${i.ko} ${nm(i.ko)} ${i.tko || ''} ${i.inst} ${i.source} ${i.assetLabel || ''}`.toLowerCase(); return t.includes(a) || (!!b && b !== a && t.includes(b)); };
    };
    const feedItems = items.filter(filterFn).filter(textHit(homeQuery));
    const isHomeTab = HOME_TABS.some(([k]) => k === filter);
    const filterLabel = ASSET[filter] ? ASSET[filter].label : REGION[filter] ? REGION[filter] : filter === 'EN' ? '영문 기사' : filter === '마켓' ? '시장 동향' : filter;
    const sel = (selectedId && byId.get(selectedId)) || (isDesktop ? feedItems[0] : null) || null;
    // ─── 화면 조각 ───────────────────────────────────────────
    // 투자내역 공통 머리: 검색 + 보기 방식(최신순 / 기관별 / 기관별 표)
    const dealBar = (lbl, ph) => (React.createElement(React.Fragment, null,
        React.createElement(SearchField, { value: dealQuery, onChange: setDealQuery, onClear: () => setDealQuery(''), placeholder: ph }),
        React.createElement("div", { style: { display: 'flex', gap: 6, margin: '12px 0', flexWrap: 'wrap' } },
            React.createElement(Chip, { active: dealView === 'table', onClick: () => setDealView('table') },
                lbl,
                "\uBCC4 \uD45C"),
            React.createElement(Chip, { active: dealView === 'inst', onClick: () => setDealView('inst') },
                lbl,
                "\uBCC4"),
            React.createElement(Chip, { active: dealView === 'date', onClick: () => setDealView('date') }, "\uCD5C\uC2E0\uC21C"))));
    // 같은 소식은 한 건으로 묶어 보여 준다(북마크 목록은 그대로)
    const feedList = (list, opts = {}) => {
        const out = [];
        let last = null;
        // 묶음의 대표 기사가 다른 날짜일 수 있어 대표 기사 시각으로 다시 정렬한다(같은 날짜 머리글이 두 번 나오지 않게)
        const stories = opts.noGroup ? list.map((lead) => ({ lead, more: [] })) : clusterStories(list).map((c, i) => [c, i]).sort((x, y) => (itemMs(y[0].lead) - itemMs(x[0].lead)) || (x[1] - y[1])).map(([c]) => c);
        const shown = opts.all ? stories : stories.slice(0, limit);
        const counts = {};
        shown.forEach((c) => { const k = dayKeyOf(itemMs(c.lead)); counts[k] = (counts[k] || 0) + 1; });
        shown.forEach(({ lead: item, more }) => {
            const k = dayKeyOf(itemMs(item));
            if (!opts.flat && k !== last) {
                out.push(React.createElement(DayHeader, { key: 'd' + k + '-' + out.length, label: dayLabel(itemMs(item)), count: counts[k] }));
                last = k;
            }
            out.push(React.createElement(FeedItem, { key: item.id, item: item, more: more, isNew: !!(seen && !seen[item.id]), selected: isDesktop && sel && (sel.id === item.id || more.some((m) => m.id === sel.id)), onOpen: () => openArticle(item.id), onOpenOther: (id) => openArticle(id), onPress: () => fetchArchiveBody(item), onBookmark: (e) => toggleBm(item.id, e) }));
        });
        if (!opts.all && stories.length > shown.length) {
            out.push(React.createElement("div", { key: "more", onClick: () => setLimit((n) => n + PAGE), style: { textAlign: 'center', padding: '18px 0 22px', font: F(600, 14), color: KB.sub, cursor: 'pointer' } },
                "\uAE30\uC0AC ",
                Math.min(PAGE, stories.length - shown.length),
                "\uAC74 \uB354 \uBCF4\uAE30"));
        }
        return out;
    };
    const homeScreen = (React.createElement("div", { style: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: KB.bg } },
        React.createElement("div", { style: { flexShrink: 0, background: KB.bg } },
            React.createElement("div", { style: { height: 'env(safe-area-inset-top)' } }),
            React.createElement("div", { style: { height: 58, display: 'flex', alignItems: 'center', padding: '0 8px 0 20px' } },
                isDesktop
                    ? React.createElement("div", null,
                        React.createElement("div", { style: { font: F(700, 20), color: KB.ink, letterSpacing: '-.02em' } }, "\uCD5C\uC2E0 \uAE30\uC0AC"))
                    : React.createElement(Logo, { size: 18, onClick: () => refreshNews(true) }),
                React.createElement("div", { style: { marginLeft: 'auto', display: 'flex' } },
                    !isDesktop && React.createElement(IconBtn, { n: "search", label: "\uAC80\uC0C9", onClick: () => setScreen('search') }),
                    React.createElement(IconBtn, { n: "refresh", label: "\uC0C8\uB85C\uACE0\uCE68", onClick: () => refreshNews(true) }))),
            React.createElement(Tabs, { scroll: true, pad: 20, items: HOME_TABS.map(([k, l]) => [k, l]), value: isHomeTab ? filter : '', onChange: (k) => { setFilter(k); setLimit(PAGE); if (homeScroll.current)
                    homeScroll.current.scrollTop = 0; } })),
        React.createElement("div", { ref: homeScroll, style: { flex: 1, minHeight: 0, overflowY: 'auto' } },
            React.createElement("div", { style: { padding: '12px 20px 4px' } },
                React.createElement(SearchField, { value: homeQuery, onChange: (v) => { setHomeQuery(v); setLimit(PAGE); }, onClear: () => setHomeQuery(''), placeholder: `${isHomeTab && filter !== '전체' ? (HOME_TABS.find(([k]) => k === filter) || [, ''])[1] + ' ' : ''}기사 안에서 검색` }),
                homeQuery.trim() && React.createElement("div", { style: { font: F(500, 12.5), color: KB.sub, marginTop: 8 } },
                    "\uAC80\uC0C9 \uACB0\uACFC ",
                    feedItems.length,
                    "\uAC74")),
            !isHomeTab && (React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', background: KB.yellowTint, borderBottom: `1px solid ${KB.yellowLine}` } },
                React.createElement(Ico, { n: "filter", size: 16, color: KB.gray }),
                React.createElement("span", { style: { font: F(600, 13.5), color: KB.ink } }, filterLabel),
                React.createElement("span", { style: { font: F(500, 13), color: KB.sub } },
                    feedItems.length,
                    "\uAC74"),
                React.createElement("span", { onClick: () => setFilter('전체'), style: { marginLeft: 'auto', font: F(600, 13), color: KB.gray, cursor: 'pointer' } }, "\uD544\uD130 \uD574\uC81C"))),
            filter === '전체' && !homeQuery.trim() && (React.createElement("div", { style: { paddingBottom: 6 } },
                React.createElement(BriefDigest, { market: market, onOpen: () => setScreen('brief') }),
                React.createElement("div", { style: { height: 14 } }))),
            newCount > 0 && filter === '전체' && (React.createElement("div", { style: { display: 'flex', alignItems: 'center', padding: '12px 20px', borderTop: `1px solid ${KB.line}` } },
                React.createElement("span", { style: { width: 6, height: 6, borderRadius: 3, background: KB.yellow, marginRight: 8 } }),
                React.createElement("span", { style: { font: F(600, 13.5), color: KB.ink } },
                    "\uC0C8 \uAE30\uC0AC ",
                    newCount,
                    "\uAC74"),
                React.createElement("span", { onClick: () => markSeen(items.map((i) => i.id)), style: { marginLeft: 'auto', font: F(600, 13), color: KB.sub, cursor: 'pointer' } }, "\uBAA8\uB450 \uD655\uC778"))),
            feedItems.length === 0
                ? (homeQuery.trim() ? React.createElement(Empty, { compact: true, title: "\uAC80\uC0C9 \uACB0\uACFC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4", desc: "\uB2E4\uB978 \uB2E8\uC5B4\uB85C \uAC80\uC0C9\uD558\uAC70\uB098 \uC0C1\uB2E8 \uAC80\uC0C9\uC5D0\uC11C \uC804\uCCB4 \uAE30\uC0AC\uB97C \uCC3E\uC544\uBCF4\uC138\uC694." }) : React.createElement(Empty, { title: `${filterLabel} 관련 최근 기사가 없습니다`, desc: "\uC0C8 \uAE30\uC0AC\uAC00 \uC218\uC9D1\uB418\uBA74 \uC790\uB3D9\uC73C\uB85C \uD45C\uC2DC\uB429\uB2C8\uB2E4." }))
                : feedList(feedItems),
            React.createElement("div", { style: { padding: '14px 20px 26px', font: F(400, 12, 1.7), color: KB.mute, textAlign: 'center' } },
                "\uAE30\uC0AC ",
                items.length.toLocaleString('ko-KR'),
                "\uAC74 \u00B7 \uAD6D\uBB38\u00B7\uC601\uBB38 \uB274\uC2A4 \uAC80\uC0C9\uC73C\uB85C 3\uC2DC\uAC04\uB9C8\uB2E4 \uC218\uC9D1",
                latestAt ? ` · 최근 ${latestAt}` : ''))));
    const briefView = (!briefSel || (market && market.dateKey === briefSel)) ? market : (briefCache[briefSel] || null);
    const briefScreen = (React.createElement(BriefScreen, { b: briefView, market: market, briefIndex: briefIndex, onSelectDate: setBriefSel, live: liveQuotes, liveAt: liveAt, liveBusy: liveBusy, onRefreshLive: refreshLive, onPick: openTrend }));
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
            return (React.createElement(LpProfile, { name: lpSel, group: (r && r.group) || (al && al.group) || '국내 LP', profile: profiles && profiles[lpSel], alloc: al ? { ...al, asOf: (alloc && alloc.asOf) || '' } : null, cio: (ins.cios || []).find((c) => c.inst === lpSel), execs: (ins.execs || []).filter((e) => e.inst === lpSel), aumNews: (ins.aums || []).find((x) => x.inst === lpSel), move: (ins.relocations || []).find((x) => x.inst === lpSel), returns: (ins.assetReturns || []).filter((x) => x.inst === lpSel), articles: artsByInst[lpSel] || [], deals: dealsByInst[lpSel] || [], invUpdatedAt: investments && investments.updatedAt, insUpdatedAt: ins.updatedAt, onBack: () => setLpSel(null), onOpenArticle: openArticle, onOpenDeal: openDeal, onOpenInst: openInst }));
        }
        const ql = lpQuery.trim();
        const rows = lpRows.filter((r) => (lpGroup === '전체' || r.group === lpGroup) && (!ql || r.name.includes(ql)));
        return (React.createElement("div", { style: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: KB.bg } },
            React.createElement(TopBar, { big: true, title: "Korea LP", sub: `국내 기관 ${(roster || []).length}곳 · 프로필 ${profilesAt || '-'} 기준 · 투자내역 자동 갱신`, border: false }),
            React.createElement(Tabs, { items: [['inst', '기관', (roster || []).length], ['deals', '투자내역', lpDeals.length], ['alloc', '배분·인사']], value: lpTab, onChange: setLpTab }),
            React.createElement("div", { style: { flex: 1, minHeight: 0, overflowY: 'auto', background: isDesktop && lpTab === 'alloc' ? KB.band : KB.bg } },
                React.createElement("div", { style: { maxWidth: isDesktop ? 880 : 'none', margin: '0 auto', padding: isDesktop && lpTab === 'alloc' ? '20px 24px 40px' : 0 } },
                    lpTab === 'inst' && (React.createElement("div", { style: { padding: '16px 20px 30px' } },
                        React.createElement(SearchField, { value: lpQuery, onChange: setLpQuery, onClear: () => setLpQuery(''), placeholder: "\uAE30\uAD00\uBA85 \uAC80\uC0C9" }),
                        React.createElement("div", { style: { display: 'flex', gap: 6, overflowX: 'auto', margin: '14px 0 4px' } }, ['전체', ...GROUPS].map((g) => React.createElement(Chip, { key: g, active: lpGroup === g, onClick: () => setLpGroup(g), count: g === '전체' ? lpRows.length : lpRows.filter((r) => r.group === g).length }, g))),
                        !roster ? React.createElement(Empty, { compact: true, title: "\uAE30\uAD00 \uBAA9\uB85D\uC744 \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4" }) : rows.length === 0 ? React.createElement(Empty, { compact: true, title: "\uCC3E\uB294 \uAE30\uAD00\uC774 \uC5C6\uC2B5\uB2C8\uB2E4" }) : rows.map((r, i) => (React.createElement(ListRow, { key: r.name, first: i === 0, chevron: true, onClick: () => setLpSel(r.name) },
                            React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 6 } },
                                React.createElement("span", { style: { font: F(600, 15.5), color: KB.ink } }, r.name),
                                r.curated && React.createElement(Tag, { tone: "yellow" }, "\uAC80\uC99D")),
                            React.createElement("div", { style: { font: F(500, 12.5), color: KB.mute, marginTop: 4 } }, [r.group, r.aum ? `AUM ${fmtJo(r.aum)}` : '', r.arts ? `기사 ${r.arts}` : '', r.deals ? `투자내역 ${r.deals}${r.ov ? `(해외 ${r.ov})` : ''}` : ''].filter(Boolean).join(' · '))))))),
                    lpTab === 'deals' && (React.createElement("div", { style: { padding: '16px 20px 30px' } },
                        dealBar('기관', '기관·상대방·거래 검색 (예: 국민연금, 인수)'),
                        React.createElement(DealList, { events: lpDeals, query: dealQuery, onOpen: openDeal, onInst: openInst, showInst: true, grouped: dealView, limit: dealView === 'date' ? 40 : null, emptyTitle: "\uC544\uC9C1 \uC218\uC9D1\uB41C \uAD6D\uB0B4 LP \uD22C\uC790\uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4", emptyDesc: "\uAE30\uAD00\uC758 \uCD9C\uC790\u00B7\uC778\uC218\u00B7\uC704\uD0C1\uC6B4\uC6A9\uC0AC \uC120\uC815 \uAE30\uC0AC\uAC00 \uB098\uC624\uBA74 \uC790\uB3D9\uC73C\uB85C \uC313\uC785\uB2C8\uB2E4." }))),
                    lpTab === 'alloc' && React.createElement(AllocView, { alloc: alloc, insights: insights, onOpenLp: (n) => setLpSel(n) })))));
    })();
    // Global GP
    const gpNames = gpProfiles ? Object.keys(gpProfiles) : [];
    // AUM(달러 환산, 십억 달러) 큰 순 — 프로필 AUM 이 없으면 기사 기준 AUM
    const aumB = (txt) => {
        const t = String(txt || '').replace(/,/g, '');
        // "전체 ~$12T · 대체 ~$600B" 처럼 대체투자 AUM 이 따로 있으면 그것으로 줄 세운다(대체투자 운용사 목록이므로)
        const m = t.match(/대체\s*~?\s*([$€£])?\s*([\d.]+)\s*([TtBbMm])/) || t.match(/([$€£])?\s*([\d.]+)\s*([TtBbMm])/);
        if (!m)
            return null;
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
            return (React.createElement(GpProfile, { name: gpSel, profile: gpProfiles && gpProfiles[gpSel], articles: artsByInst[gpSel] || [], deals: dealsByInst[gpSel] || [], lpLinks: lpLinks, frEvents: ((fundraising && fundraising.items) || []).filter((f) => f.gp === gpSel), aumNews: (ins.aums || []).find((x) => x.inst === gpSel), invUpdatedAt: investments && investments.updatedAt, onBack: () => setGpSel(null), onOpenArticle: openArticle, onOpenDeal: openDeal, onOpenInst: openInst }));
        }
        const ql = gpQuery.trim().toLowerCase();
        const rows = gpRows.filter((r) => !ql || r.name.toLowerCase().includes(ql));
        const frItems = (fundraising && fundraising.items) || [];
        return (React.createElement("div", { style: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: KB.bg } },
            React.createElement(TopBar, { big: true, title: "Global GP", sub: `해외 운용사 ${gpNames.length}곳 · 대체투자 AUM 순 · 프로필 ${gpProfilesAt || '-'} 기준`, border: false }),
            React.createElement(Tabs, { items: [['list', '운용사', gpNames.length], ['deals', '딜', gpDeals.length]], value: gpTab === 'fr' ? 'list' : gpTab, onChange: setGpTab }),
            React.createElement("div", { style: { flex: 1, minHeight: 0, overflowY: 'auto' } },
                React.createElement("div", { style: { maxWidth: isDesktop ? 880 : 'none', margin: '0 auto', padding: '16px 20px 30px' } },
                    gpTab === 'list' && (React.createElement(React.Fragment, null,
                        React.createElement(SearchField, { value: gpQuery, onChange: setGpQuery, onClear: () => setGpQuery(''), placeholder: "\uC6B4\uC6A9\uC0AC \uAC80\uC0C9 (\uC608: Blackstone, KKR)" }),
                        React.createElement("div", { style: { height: 6 } }),
                        !gpProfiles ? React.createElement(Empty, { compact: true, title: "\uC6B4\uC6A9\uC0AC \uBAA9\uB85D\uC744 \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4" }) : rows.map((r, i) => (React.createElement(ListRow, { key: r.name, first: i === 0, chevron: true, onClick: () => setGpSel(r.name) },
                            React.createElement("div", { style: { display: 'flex', alignItems: 'baseline', gap: 8 } },
                                React.createElement("span", { style: { font: F(700, 13), color: r.aum != null ? KB.gray : KB.faint, width: 22 } }, r.aum != null ? gpRows.indexOf(r) + 1 : '–'),
                                React.createElement("span", { style: { font: F(600, 15.5), color: KB.ink, flex: 1, minWidth: 0 } }, r.name),
                                React.createElement("span", { style: { font: F(700, 14), color: KB.ink } }, r.p.aum || '–')),
                            React.createElement("div", { style: { font: F(500, 12.5), color: KB.mute, marginTop: 4, paddingLeft: 30 } }, [(r.p.strengths || []).slice(0, 3).map((s) => (s.k && ASSET[s.k] ? ASSET[s.k].label : s.label)).filter(Boolean).join('·'), r.arts ? `기사 ${r.arts}` : '', r.deals ? `딜 ${r.deals}` : ''].filter(Boolean).join(' · '))))))),
                    gpTab === 'deals' && (React.createElement(React.Fragment, null,
                        dealBar('운용사', '운용사·자산·거래 검색 (예: Blackstone, 매각)'),
                        React.createElement(DealList, { events: gpDeals, query: dealQuery, onOpen: openDeal, onInst: openInst, showInst: true, grouped: dealView, limit: dealView === 'date' ? 40 : null }))),
                    gpTab === 'fr' && (frItems.length === 0 ? React.createElement(Empty, { compact: true, title: "\uC218\uC9D1\uB41C \uBAA8\uC9D1\u00B7\uD074\uB85C\uC9D5 \uC18C\uC2DD\uC774 \uC5C6\uC2B5\uB2C8\uB2E4" }) : (React.createElement(React.Fragment, null,
                        frItems.map((f, i) => (React.createElement("div", { key: f.id + i, onClick: () => openArticle(f.id, f), style: { padding: '14px 0', borderTop: i ? `1px solid ${KB.line2}` : 'none', cursor: 'pointer' } },
                            React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 6 } },
                                React.createElement(Tag, { tone: /파이널|클로즈/.test(f.stage) ? 'yellow' : 'outline' }, f.stage),
                                f.gp && React.createElement("span", { style: { font: F(700, 14), color: KB.ink } }, f.gp),
                                f.size && React.createElement("span", { style: { font: F(700, 14), color: KB.gray } }, f.size),
                                React.createElement("span", { style: { marginLeft: 'auto', font: F(500, 12), color: KB.mute } }, f.date)),
                            React.createElement("div", { style: { font: F(500, 14.5, 1.5), color: KB.ink2, marginTop: 6 } }, nm(f.title)),
                            React.createElement("div", { style: { font: F(500, 12), color: KB.mute, marginTop: 4 } }, f.source)))),
                        React.createElement("div", { style: { font: F(400, 12, 1.7), color: KB.mute, marginTop: 14 } }, "\uBAA8\uC9D1 \uB2E8\uACC4\u00B7\uADDC\uBAA8\uB294 \uAE30\uC0AC \uD45C\uD604\uC744 \uADF8\uB300\uB85C \uC62E\uAE34 \uAC83\uC774\uBA70 3\uC2DC\uAC04\uB9C8\uB2E4 \uAC31\uC2E0\uB429\uB2C8\uB2E4."))))))));
    })();
    // 투자내역(전체)
    const dealsScreen = (React.createElement("div", { style: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: KB.bg } },
        React.createElement(TopBar, { big: true, title: "\uD22C\uC790\uB0B4\uC5ED", sub: `국내 LP·해외 GP의 출자·인수·매각 ${invItems.length}건${investments ? ` · ${investments.updatedAt} 갱신` : ''}`, border: false }),
        React.createElement(Tabs, { items: [['all', '전체', invItems.length], ['LP', '국내 LP', lpDeals.length], ['GP', '해외 GP', gpDeals.length]], value: dealRole, onChange: setDealRole }),
        React.createElement("div", { style: { flex: 1, minHeight: 0, overflowY: 'auto' } },
            React.createElement("div", { style: { maxWidth: isDesktop ? 880 : 'none', margin: '0 auto', padding: '16px 20px 30px' } },
                dealBar(dealRole === 'GP' ? '운용사' : dealRole === 'LP' ? '기관' : '운용사·기관', '기관·운용사·거래 검색 (예: KKR, 출자, 국민연금)'),
                React.createElement(DealList, { key: dealRole, query: dealQuery, events: dealRole === 'all' ? invItems : invItems.filter((e) => e.role === dealRole), onOpen: openDeal, onInst: openInst, showInst: true, grouped: dealView, limit: dealView === 'date' ? 50 : null }),
                React.createElement("div", { style: { font: F(400, 12, 1.7), color: KB.mute, marginTop: 18, paddingTop: 14, borderTop: `1px solid ${KB.line}` } }, "\uAE30\uC0AC \uC81C\uBAA9\uC5D0 \uCD9C\uC790\u00B7\uC778\uC218\u00B7\uB9E4\uAC01\u00B7\uD380\uB4DC \uACB0\uC131 \uAC19\uC740 \uD589\uC704\uAC00 \uBA85\uC2DC\uB41C \uACBD\uC6B0\uC5D0\uB9CC \uAE30\uB85D\uD569\uB2C8\uB2E4. \uAE08\uC561\uC740 \uAE30\uC0AC \uD45C\uAE30 \uADF8\uB300\uB85C\uC774\uBA70, \uAC80\uD1A0\u00B7\uD611\uC0C1 \uB2E8\uACC4\uB294 \u2018\uCD94\uC9C4\u00B7\uAC80\uD1A0\u2019\uB85C \uB530\uB85C \uD45C\uC2DC\uD569\uB2C8\uB2E4. \uAC19\uC740 \uB51C\uC744 \uC5EC\uB7EC \uB9E4\uCCB4\uAC00 \uBCF4\uB3C4\uD558\uBA74 \uD55C \uAC74\uC73C\uB85C \uBB36\uC2B5\uB2C8\uB2E4.")))));
    // 전체 메뉴
    const groupCount = (g) => items.filter((i) => i.instGroup === g && i.cat !== '인사').length;
    const menuScreen = (React.createElement("div", { style: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: KB.bg } },
        React.createElement(TopBar, { big: true, title: "\uC804\uCCB4", border: false }),
        React.createElement("div", { style: { flex: 1, minHeight: 0, overflowY: 'auto' } },
            React.createElement("div", { style: { padding: '4px 20px 0' } },
                React.createElement(SearchField, { placeholder: "\uAE30\uC0AC\u00B7\uAE30\uAD00\u00B7\uC6A9\uC5B4 \uAC80\uC0C9", onFocus: () => setScreen('search') })),
            React.createElement("div", { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', padding: '10px 12px 6px' } },
                React.createElement(Shortcut, { icon: "briefcase", label: "\uD22C\uC790\uB0B4\uC5ED", note: invItems.length, onClick: () => setScreen('deals') }),
                React.createElement(Shortcut, { icon: "book", label: "\uC6A9\uC5B4\u00B7\uAC1C\uB150", note: GLOSSARY.length, onClick: () => openLearn() }),
                React.createElement(Shortcut, { icon: "bookmark", label: "\uBD81\uB9C8\uD06C", note: Object.values(bm).filter(Boolean).length, onClick: () => setScreen('bookmarks') }),
                React.createElement(Shortcut, { icon: "layers", label: "\uD380\uB4DC\uB808\uC774\uC9D5", note: ((fundraising && fundraising.items) || []).length, onClick: () => setScreen('fund') }),
                React.createElement(Shortcut, { icon: "user", label: "\uC778\uC0AC \uB3D9\uD5A5", onClick: () => applyFilter('인사') }),
                React.createElement(Shortcut, { icon: "flag", label: "\uC9C0\uBC29\uC774\uC804", onClick: () => applyFilter('이전') }),
                React.createElement(Shortcut, { icon: "globe", label: "\uC601\uBB38 \uAE30\uC0AC", onClick: () => applyFilter('EN') }),
                React.createElement(Shortcut, { icon: "market", label: "\uB370\uC77C\uB9AC \uC2DC\uD669", onClick: () => setScreen('brief') })),
            React.createElement(Section, { title: "\uAE30\uAD00 \uC720\uD615\uBCC4 \uAE30\uC0AC" },
                GROUPS.map((g, i) => (React.createElement(ListRow, { key: g, first: i === 0, chevron: true, onClick: () => applyFilter(g), pad: "13px 0" },
                    React.createElement("div", { style: { display: 'flex', alignItems: 'center' } },
                        React.createElement("span", { style: { font: F(500, 15), color: KB.ink, flex: 1 } }, g),
                        React.createElement("span", { style: { font: F(600, 13), color: KB.sub } }, groupCount(g)))))),
                React.createElement(ListRow, { chevron: true, onClick: () => applyFilter('GP'), pad: "13px 0" },
                    React.createElement("div", { style: { display: 'flex', alignItems: 'center' } },
                        React.createElement("span", { style: { font: F(500, 15), color: KB.ink, flex: 1 } }, "Global GP"),
                        React.createElement("span", { style: { font: F(600, 13), color: KB.sub } }, items.filter((i) => i.instGroup === 'Global GP' && i.cat !== '인사').length))),
                React.createElement(ListRow, { chevron: true, onClick: () => applyFilter('마켓'), pad: "13px 0" },
                    React.createElement("div", { style: { display: 'flex', alignItems: 'center' } },
                        React.createElement("span", { style: { font: F(500, 15), color: KB.ink, flex: 1 } }, "\uC2DC\uC7A5 \uB3D9\uD5A5 (\uAE30\uAD00 \uBBF8\uC9C0\uC815)"),
                        React.createElement("span", { style: { font: F(600, 13), color: KB.sub } }, items.filter((i) => i.cat === '마켓').length)))),
            React.createElement(Section, { title: "\uC790\uC0B0\uAD70" },
                React.createElement("div", { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } }, Object.keys(ASSET).map((k) => React.createElement(Chip, { key: k, onClick: () => applyFilter(k), count: items.filter((i) => i.asset === k).length }, ASSET[k].label)))),
            React.createElement(Section, { title: "\uC9C0\uC5ED" },
                React.createElement("div", { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } }, Object.keys(REGION).map((k) => React.createElement(Chip, { key: k, onClick: () => applyFilter(k), count: items.filter((i) => i.region === k).length }, REGION[k])))),
            React.createElement(Section, { title: "\uC6B4\uC6A9\uC0AC\uBCC4 \uAE30\uC0AC" },
                React.createElement("div", { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } }, gpRows.filter((r) => r.arts > 0).slice().sort((a, b) => b.arts - a.arts).slice(0, 24).map((r) => React.createElement(Chip, { key: r.name, onClick: () => applyFilter(r.name), count: r.arts }, r.name)))),
            React.createElement(Section, { title: "\uB370\uC774\uD130 \uC548\uB0B4" }, [
                ['기사', `국문·영문 뉴스 검색 결과를 3시간마다 수집합니다. 현재 ${items.length.toLocaleString('ko-KR')}건${latestAt ? `, 최근 ${latestAt}` : ''}.`],
                ['기사 전문', '수집할 때 원문에서 본문을 추출해 두고, 광고·관련기사·기자 정보 등은 제외합니다. 유료·차단 매체는 앞부분만 제공됩니다.'],
                ['투자내역·인사·AUM', '기사 제목과 본문에서 자동으로 뽑아 누적하며, 모든 항목은 근거 기사로 연결됩니다.'],
                ['기관 기준 정보', `공시·연차보고서 기준입니다(국내 LP ${profilesAt || '-'}, 해외 GP ${gpProfilesAt || '-'}).`],
                ['데일리 시황', '매일 08:00(KST)에 전일 시장을 정리합니다. 지표는 누르면 5년 추이를 볼 수 있습니다.'],
            ].map(([k, v], i) => (React.createElement("div", { key: k, style: { padding: '12px 0', borderTop: i ? `1px solid ${KB.line2}` : 'none' } },
                React.createElement("div", { style: { font: F(600, 14), color: KB.ink } }, k),
                React.createElement("div", { style: { font: F(400, 13, 1.65), color: KB.sub, marginTop: 3 } }, v))))))));
    // 검색 — 기사·기관·용어를 한 번에
    const q = query.trim().toLowerCase();
    const qn = (nm(query.trim()) || '').toLowerCase(); // '블랙스톤'으로 찾아도 Blackstone 기사가 나오게
    const hitQ = (s) => { const t = String(s || '').toLowerCase(); return t.includes(q) || (qn !== q && t.includes(qn)); };
    const searchScreen = (() => {
        const arts = q ? items.filter((i) => hitQ(`${i.ko} ${i.tko || ''} ${i.inst} ${i.source} ${i.assetLabel}`)) : [];
        const insts = q ? [
            ...(roster || []).filter((r) => r.name.toLowerCase().includes(q)).map((r) => ({ inst: r.name, role: 'LP', sub: r.group })),
            ...gpNames.filter((n) => hitQ(n)).map((n) => ({ inst: n, role: 'GP', sub: 'Global GP' })),
        ].slice(0, 8) : [];
        const terms = q ? GLOSSARY.filter((g) => `${g.term} ${g.en}`.toLowerCase().includes(q) || g.aliases.test(query.trim())).slice(0, 6) : [];
        const recent = items.filter((i) => read[i.id]).slice(0, 5);
        return (React.createElement("div", { style: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: KB.bg } },
            React.createElement("div", { style: { flexShrink: 0, borderBottom: `1px solid ${KB.line}` } },
                React.createElement("div", { style: { height: 'env(safe-area-inset-top)' } }),
                React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 4, padding: '8px 16px 10px 6px' } },
                    !isDesktop && React.createElement(IconBtn, { n: "back", label: "\uB4A4\uB85C", onClick: () => setScreen('home') }),
                    React.createElement("div", { style: { flex: 1, marginLeft: isDesktop ? 14 : 0 } },
                        React.createElement(SearchField, { value: query, onChange: setQuery, onClear: () => setQuery(''), autoFocus: !isDesktop, placeholder: "\uAE30\uC0AC\u00B7\uAE30\uAD00\u00B7\uC6A9\uC5B4 \uAC80\uC0C9 (\uC608: \uAD6D\uBBFC\uC5F0\uAE08, \uBE14\uB799\uC2A4\uD1A4, IRR)" })))),
            React.createElement("div", { style: { flex: 1, minHeight: 0, overflowY: 'auto' } }, !q ? (React.createElement("div", { style: { padding: '18px 20px' } },
                React.createElement("div", { style: { font: F(700, 14), color: KB.ink, marginBottom: 10 } }, "\uCD94\uCC9C \uAC80\uC0C9\uC5B4"),
                React.createElement("div", { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } }, ['국민연금', '교직원공제회', 'Blackstone', 'KKR', '사모대출', '세컨더리', '데이터센터', '항공기'].map((t) => React.createElement(Chip, { key: t, onClick: () => setQuery(t) }, t))),
                recent.length > 0 && (React.createElement(React.Fragment, null,
                    React.createElement("div", { style: { font: F(700, 14), color: KB.ink, margin: '26px 0 2px' } }, "\uCD5C\uADFC \uBCF8 \uAE30\uC0AC"),
                    recent.map((a, i) => React.createElement(MiniArticle, { key: a.id, a: a, first: i === 0, onOpen: openArticle })))))) : (React.createElement(React.Fragment, null,
                insts.length > 0 && (React.createElement("div", { style: { padding: '14px 20px 4px' } },
                    React.createElement("div", { style: { font: F(700, 13.5), color: KB.sub, marginBottom: 2 } }, "\uAE30\uAD00"),
                    insts.map((x, i) => (React.createElement(ListRow, { key: x.inst, first: i === 0, chevron: true, onClick: () => openInst(x), pad: "12px 0" },
                        React.createElement("span", { style: { font: F(600, 15), color: KB.ink } }, x.inst),
                        React.createElement("span", { style: { font: F(500, 12.5), color: KB.mute, marginLeft: 8 } }, x.sub)))))),
                terms.length > 0 && (React.createElement("div", { style: { padding: '14px 20px 6px' } },
                    React.createElement("div", { style: { font: F(700, 13.5), color: KB.sub, marginBottom: 8 } }, "\uC6A9\uC5B4"),
                    React.createElement("div", { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } }, terms.map((g) => React.createElement(Chip, { key: g.id, onClick: () => openTerm(g.id) }, g.term))))),
                React.createElement("div", { style: { padding: '16px 20px 8px', font: F(700, 13.5), color: KB.sub } },
                    "\uAE30\uC0AC ",
                    arts.length,
                    "\uAC74"),
                arts.length ? feedList(arts, { flat: true, all: arts.length <= 200 }) : React.createElement(Empty, { compact: true, title: "\uAC80\uC0C9 \uACB0\uACFC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4" }))))));
    })();
    const bmAll = items.filter((i) => bm[i.id]);
    const bmItems = bmAll.filter(textHit(bmQuery));
    const bookmarksScreen = (React.createElement("div", { style: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: KB.bg } },
        React.createElement(TopBar, { big: true, title: "\uBD81\uB9C8\uD06C", sub: `저장한 기사 ${bmAll.length}건` }),
        React.createElement("div", { style: { flex: 1, minHeight: 0, overflowY: 'auto' } },
            bmAll.length > 0 && React.createElement("div", { style: { padding: '12px 20px 4px' } },
                React.createElement(SearchField, { value: bmQuery, onChange: setBmQuery, onClear: () => setBmQuery(''), placeholder: "\uC800\uC7A5\uD55C \uAE30\uC0AC\uC5D0\uC11C \uAC80\uC0C9" })),
            bmItems.length ? feedList(bmItems, { flat: true, all: true, noGroup: true })
                : bmAll.length ? React.createElement(Empty, { compact: true, title: "\uAC80\uC0C9 \uACB0\uACFC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4" })
                    : React.createElement(Empty, { icon: "bookmark", title: "\uC800\uC7A5\uD55C \uAE30\uC0AC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4", desc: "\uAE30\uC0AC \uBAA9\uB85D\uC758 \uBD81\uB9C8\uD06C \uC544\uC774\uCF58\uC744 \uB20C\uB7EC \uB098\uC911\uC5D0 \uBCFC \uAE30\uC0AC\uB97C \uC800\uC7A5\uD558\uC138\uC694." }))));
    const detail = (full) => sel && (React.createElement(ArticleDetail, { sel: sel, bookmarked: !!bm[sel.id], onToggleBm: () => toggleBm(sel.id), onShare: () => onShare(sel), onBack: () => setScreen(prevScreen), showBack: full, deals: dealsByArticle[sel.id] || [], onOpenDeal: openDeal, onOpenInst: (x) => openInst({ inst: x.inst, role: x.role, instType: x.instType }), onOpenTerm: openTerm, onDead: onDead }));
    const screens = {
        home: homeScreen, brief: briefScreen, korlp: lpScreen, gp: gpScreen, menu: menuScreen,
        search: searchScreen, bookmarks: bookmarksScreen, deals: dealsScreen,
        fund: React.createElement(FundraisingView, { data: fundraising, onOpen: openArticle, onGp: (g) => openInst({ inst: g, role: 'GP' }) }),
        learn: React.createElement(LearnScreen, { focus: learnFocus, onFocusDone: () => setLearnFocus(null) }),
    };
    const navActive = screen === 'detail' ? prevScreen : screen;
    const bottomActive = ['home', 'brief', 'fund', 'korlp', 'gp'].includes(navActive) ? navActive : 'menu';
    const sideActive = navActive === 'menu' ? 'home' : navActive;
    const master = isDesktop && LIST_SCREENS.includes(screen);
    return (React.createElement(UICtx.Provider, { value: { desktop: isDesktop } },
        React.createElement("div", { className: "app-frame", style: { color: KB.ink, background: KB.bg, ...(isDesktop ? { flexDirection: 'row' } : {}) } },
            isDesktop && React.createElement(Sidebar, { active: sideActive, onGo: go, badge: newCount, onRefresh: () => refreshNews(true), updated: latestAt }),
            React.createElement("div", { style: { flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: isDesktop ? 'row' : 'column' } },
                screen === 'detail'
                    ? detail(true)
                    : master
                        ? (React.createElement(React.Fragment, null,
                            React.createElement("div", { style: { width: 440, flexShrink: 0, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', borderRight: `1px solid ${KB.line}` } }, screens[screen]),
                            React.createElement("div", { style: { flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' } }, detail(false) || React.createElement(ArticleDetail, { sel: null }))))
                        : React.createElement("div", { style: { flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' } }, screens[screen] || homeScreen),
                !isDesktop && screen !== 'detail' && React.createElement(BottomNav, { active: bottomActive, onGo: go, badge: newCount })),
            trendSel && React.createElement(TrendModal, { series: histSeries && histSeries[trendSel.symbol], name: trendSel.name, unit: trendSel.unit, onClose: () => setTrendSel(null) }),
            React.createElement(TermSheet, { id: termSel, onClose: () => setTermSel(null), onOpenTerm: openTerm, onLearn: () => openLearn(termSel) }),
            React.createElement(ShareSheet, { open: !!shareItem, item: shareItem, onClose: () => setShareItem(null), onCopied: () => { setShareItem(null); flash('기사 링크를 복사했습니다'); } }),
            toast && (React.createElement("div", { style: { position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: isDesktop ? 32 : 82, background: KB.ink, color: '#fff', font: F(600, 13.5), padding: '12px 18px', borderRadius: 10, zIndex: 60, boxShadow: '0 8px 24px rgba(0,0,0,.2)', whiteSpace: 'nowrap' } }, toast)))));
}
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App, null));
