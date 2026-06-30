"use strict";
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
    get(key, def) { try {
        const v = localStorage.getItem(LS_PREFIX + key);
        return v == null ? def : JSON.parse(v);
    }
    catch (e) {
        return def;
    } },
    set(key, val) { try {
        localStorage.setItem(LS_PREFIX + key, JSON.stringify(val));
    }
    catch (e) { } },
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
    if (it.ts) {
        const t = Date.parse(it.ts);
        if (!isNaN(t))
            return t;
    }
    if (it.date) {
        const [mm, dd] = String(it.date).split('.').map(Number);
        const [hh, mi] = String(it.time || '00:00').split(':').map(Number);
        const y = new Date().getUTCFullYear();
        return Date.UTC(y, (mm || 1) - 1, dd || 1, (hh || 0) - 9, mi || 0); // KST→UTC
    }
    return 0;
}
const pad2 = (n) => String(n).padStart(2, '0');
// Canonical share URL for an article.
function articleUrl(it) {
    if (!it)
        return 'https://oneedong.github.io/KB-GIS-App/';
    return it.url || 'https://oneedong.github.io/KB-GIS-App/';
}
const ASSET = {
    RE: { label: '부동산', code: 'Real Estate', color: 'oklch(0.62 0.13 55)' },
    PC: { label: 'Private Credit', code: '사모대출', color: 'oklch(0.6 0.12 210)' },
    PE: { label: 'Private Equity', code: '사모펀드', color: 'oklch(0.58 0.13 290)' },
    IN: { label: '인프라', code: 'Infrastructure', color: 'oklch(0.58 0.12 155)' },
    AV: { label: 'Aviation', code: '항공기금융', color: 'oklch(0.62 0.14 25)' },
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
    if (s == null)
        return s;
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
    if (t === '연기금')
        return '연기금';
    if (t === '공제회')
        return '공제회';
    if (t === '중앙회')
        return '중앙회';
    if (t === '은행')
        return '은행';
    if (t === '자산운용사' || t === '증권사')
        return '운용·증권';
    if (t === '보험사' || t === '캐피탈')
        return '보험·캐피탈';
    if (t === '해외 GP')
        return 'Global GP';
    return '기타';
}
// 시드 데모 데이터는 제거되었습니다. 앱은 수집기가 채우는 news.json 의 실제
// 기사만 사용하며, 브라우저에 남은 옛 가짜 기사는 isRealArticle 로 걸러집니다.
// ─── Navbar ───────────────────────────────────────────────
function Navbar({ active, homeNew, isDesktop, onHome, onToday, onCategory, onAlloc, onSearch, onBookmarks }) {
    if (isDesktop)
        return null; // 데스크톱은 좌측 사이드바를 사용
    const on = '#1c1d1f', off = '#b0b2b6';
    const tab = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer', flex: 1 };
    return (React.createElement("div", { style: { flexShrink: 0, height: 64, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(10px)', borderTop: '1px solid #ece9e2', display: 'flex', alignItems: 'center', justifyContent: 'space-around', paddingBottom: 'max(env(safe-area-inset-bottom), 6px)', boxSizing: 'content-box' } },
        React.createElement("div", { onClick: onHome, style: tab },
            React.createElement("div", { style: { position: 'relative', lineHeight: 1 } },
                React.createElement("span", { style: { fontSize: 17, lineHeight: 1, color: active === 'home' ? on : off } }, "\u2302"),
                homeNew > 0 && React.createElement("span", { style: { position: 'absolute', top: -5, right: -11, minWidth: 15, height: 15, padding: '0 3px', boxSizing: 'border-box', borderRadius: 999, background: '#e8392f', color: '#fff', font: '700 9px Pretendard', display: 'flex', alignItems: 'center', justifyContent: 'center' } }, homeNew > 99 ? '99+' : homeNew)),
            React.createElement("span", { style: { font: '600 10px Pretendard', color: active === 'home' ? on : off } }, "\uD648")),
        React.createElement("div", { onClick: onToday, style: tab },
            React.createElement("span", { style: { fontSize: 16, lineHeight: 1, color: active === 'today' ? on : off } }, "\u25F7"),
            React.createElement("span", { style: { font: '600 10px Pretendard', color: active === 'today' ? on : off } }, "\uC624\uB298")),
        React.createElement("div", { onClick: onCategory, style: tab },
            React.createElement("span", { style: { fontSize: 16, lineHeight: 1, color: active === 'category' ? on : off } }, "\u25A6"),
            React.createElement("span", { style: { font: '600 10px Pretendard', color: active === 'category' ? on : off } }, "\uCE74\uD14C\uACE0\uB9AC")),
        React.createElement("div", { onClick: onAlloc, style: tab },
            React.createElement("span", { style: { fontSize: 16, lineHeight: 1, color: active === 'alloc' ? on : off } }, "\u25A4"),
            React.createElement("span", { style: { font: '600 10px Pretendard', color: active === 'alloc' ? on : off } }, "\uBC30\uBD84\uD604\uD669")),
        React.createElement("div", { onClick: onSearch, style: tab },
            React.createElement("span", { style: { fontSize: 16, lineHeight: 1, color: active === 'search' ? on : off } }, "\u2315"),
            React.createElement("span", { style: { font: '600 10px Pretendard', color: active === 'search' ? on : off } }, "\uAC80\uC0C9")),
        React.createElement("div", { onClick: onBookmarks, style: tab },
            React.createElement("span", { style: { fontSize: 15, lineHeight: 1, color: active === 'bookmarks' ? on : off } }, "\u25A2"),
            React.createElement("span", { style: { font: '600 10px Pretendard', color: active === 'bookmarks' ? on : off } }, "\uBD81\uB9C8\uD06C"))));
}
// ─── FeedItem ─────────────────────────────────────────────
function FeedItem({ item, onOpen, onBookmark, isNew, selected }) {
    return (React.createElement("div", { onClick: onOpen, style: { display: 'flex', gap: 11, padding: '14px 18px', borderBottom: '1px solid #f3f1ea', cursor: 'pointer', background: selected ? '#fffaf0' : undefined } },
        React.createElement("div", { style: { width: 3, borderRadius: 2, background: item.assetColor, flexShrink: 0 } }),
        React.createElement("div", { style: { flex: 1, minWidth: 0 } },
            React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, flexWrap: 'wrap' } },
                React.createElement("span", { style: { font: '700 10.5px Pretendard', color: '#1c1d1f', background: '#f0eee7', padding: '2px 7px', borderRadius: 5 } }, item.inst),
                React.createElement("span", { style: { font: '600 10.5px Pretendard', color: item.assetColor } }, item.assetLabel),
                React.createElement("span", { style: { font: '500 10.5px Pretendard', color: '#bcbec2' } },
                    item.date,
                    " ",
                    item.time),
                isNew && React.createElement("span", { style: { font: '700 8.5px Pretendard', color: '#9a7d12', background: '#FFCC00', borderRadius: 4, padding: '1px 4px', letterSpacing: '.04em' } }, "NEW")),
            React.createElement("div", { style: { font: '650 14px/1.42 Pretendard', letterSpacing: '-.01em' } }, item.ko),
            React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 7, marginTop: 8 } },
                React.createElement("span", { style: { font: '600 10.5px Pretendard', color: '#1c1d1f', background: '#f2f0ea', padding: '3px 8px', borderRadius: 5 } }, item.metric),
                item.lang === 'en' && React.createElement("span", { style: { font: '700 9px Pretendard', color: '#56585c', border: '1px solid #ddd9cf', padding: '2px 5px', borderRadius: 4, letterSpacing: '.04em' } }, "EN \uC6D0\uBB38"),
                React.createElement("span", { style: { font: '500 10.5px Pretendard', color: '#b6b8bc', marginLeft: 'auto' } }, item.source))),
        React.createElement("div", { onClick: onBookmark, style: { flexShrink: 0, alignSelf: 'flex-start', fontSize: 15, cursor: 'pointer', color: '#cfccc4', padding: 2 } }, item.bookmarked ? React.createElement("span", { style: { color: '#1c1d1f' } }, "\u25A3") : React.createElement("span", null, "\u25A2"))));
}
// ─── Allocation charts (dependency-free) ─────────────────
const fmtAmt = (v) => (v == null ? '–' : (v >= 100 ? Math.round(v) : (Math.round(v * 10) / 10))) + '조';
const fmtPct = (v) => (v == null ? '–' : (Math.round(v * 10) / 10)) + '%';
// Horizontal bars comparing 대체투자 비중 across institutions; the darker
// inner segment is the overseas portion of that allocation.
function AllocBars({ rows, selName, onSelect }) {
    const max = Math.max(...rows.map(r => r.altPct), 1);
    return (React.createElement("div", { style: { display: 'flex', flexDirection: 'column', gap: 11 } }, rows.map(r => {
        const full = r.altPct / max * 100;
        const overseas = r.altPct * (r.overseasAltPct || 0) / 100 / max * 100;
        const on = selName === r.name;
        return (React.createElement("div", { key: r.name, onClick: () => onSelect(r.name), style: { cursor: 'pointer' } },
            React.createElement("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 } },
                React.createElement("span", { style: { font: on ? '700 12.5px Pretendard' : '600 12.5px Pretendard', color: on ? '#1c1d1f' : '#3d3e42' } }, r.name),
                React.createElement("span", { style: { font: '700 12px Pretendard', color: '#1c1d1f' } },
                    fmtPct(r.altPct),
                    " ",
                    React.createElement("span", { style: { font: '500 10.5px Pretendard', color: '#a6a8ac' } },
                        "\u00B7 ",
                        fmtAmt(r.altAmount)))),
            React.createElement("div", { style: { position: 'relative', height: 13, borderRadius: 7, background: '#f0eee7', overflow: 'hidden' } },
                React.createElement("div", { style: { position: 'absolute', inset: 0, width: full + '%', background: '#FFE695', borderRadius: 7 } }),
                React.createElement("div", { style: { position: 'absolute', inset: 0, width: overseas + '%', background: '#FFCC00', borderRadius: 7 } }))));
    })));
}
// Yearly trend line (대체투자 비중 %) for one institution.
function TrendChart({ trend }) {
    if (!trend || trend.length < 2)
        return null;
    const W = 320, H = 132, padL = 30, padR = 10, padT = 14, padB = 22;
    const pcts = trend.map(t => t.altPct);
    const lo = Math.floor(Math.min(...pcts) / 5) * 5;
    const hi = Math.ceil(Math.max(...pcts) / 5) * 5;
    const span = Math.max(hi - lo, 5);
    const x = (i) => padL + i * (W - padL - padR) / (trend.length - 1);
    const y = (v) => padT + (1 - (v - lo) / span) * (H - padT - padB);
    const pts = trend.map((t, i) => `${x(i)},${y(t.altPct)}`).join(' ');
    const area = `${padL},${H - padB} ${pts} ${x(trend.length - 1)},${H - padB}`;
    return (React.createElement("svg", { viewBox: `0 0 ${W} ${H}`, style: { width: '100%', height: 'auto', display: 'block' } },
        [lo, lo + span / 2, hi].map((g, i) => (React.createElement("g", { key: i },
            React.createElement("line", { x1: padL, y1: y(g), x2: W - padR, y2: y(g), stroke: "#efece4", strokeWidth: "1" }),
            React.createElement("text", { x: padL - 6, y: y(g) + 3, textAnchor: "end", fontSize: "9", fill: "#b6b8bc", fontFamily: "Pretendard" }, Math.round(g))))),
        React.createElement("polygon", { points: area, fill: "#FFCC0022" }),
        React.createElement("polyline", { points: pts, fill: "none", stroke: "#FFCC00", strokeWidth: "2.5", strokeLinejoin: "round", strokeLinecap: "round" }),
        trend.map((t, i) => (React.createElement("g", { key: i },
            React.createElement("circle", { cx: x(i), cy: y(t.altPct), r: "3", fill: "#1c1d1f" }),
            React.createElement("text", { x: x(i), y: H - 7, textAnchor: "middle", fontSize: "9", fill: "#9a9ca0", fontFamily: "Pretendard" }, String(t.year).slice(2)))))));
}
// ─── Sidebar (desktop) ────────────────────────────────────
function Sidebar({ active, homeNew, go, onRefresh }) {
    const items = [
        ['home', '⌂', '홈'], ['today', '◷', '오늘'], ['category', '▦', '카테고리'],
        ['alloc', '▤', '배분현황'], ['search', '⌕', '검색'], ['bookmarks', '▢', '북마크'],
    ];
    return (React.createElement("div", { style: { width: 236, flexShrink: 0, background: '#1c1d1f', color: '#fff', display: 'flex', flexDirection: 'column', padding: '22px 14px' } },
        React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 9, padding: '4px 12px 22px' } },
            React.createElement("div", { style: { width: 30, height: 30, borderRadius: 8, background: '#FFCC00', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '800 13px Pretendard', color: '#1c1d1f', letterSpacing: '-.02em' } }, "KB"),
            React.createElement("div", { style: { font: '800 17px Pretendard', color: '#FFCC00', letterSpacing: '.04em' } }, "KB GIS")),
        React.createElement("div", { style: { display: 'flex', flexDirection: 'column', gap: 3 } }, items.map(([key, icon, label]) => {
            const on = active === key;
            return (React.createElement("div", { key: key, onClick: () => go(key), style: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 11, cursor: 'pointer', background: on ? '#2c2e32' : 'transparent', color: on ? '#FFCC00' : '#cdced0', font: on ? '700 14.5px Pretendard' : '600 14.5px Pretendard' } },
                React.createElement("span", { style: { fontSize: 16, width: 18, textAlign: 'center' } }, icon),
                React.createElement("span", null, label),
                key === 'home' && homeNew > 0 && React.createElement("span", { style: { marginLeft: 'auto', minWidth: 18, height: 18, padding: '0 5px', boxSizing: 'border-box', borderRadius: 999, background: '#e8392f', color: '#fff', font: '700 10px Pretendard', display: 'flex', alignItems: 'center', justifyContent: 'center' } }, homeNew > 99 ? '99+' : homeNew)));
        })),
        React.createElement("div", { onClick: onRefresh, style: { marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', font: '600 12.5px Pretendard', color: '#cdced0', border: '1px solid #34363a', borderRadius: 999, padding: '9px 12px' } }, "\u27F3 \uC0C8\uB85C\uACE0\uCE68")));
}
// ─── In-browser article body fetcher ────────────────────────
// bodyCache: 세션 동안 한 번 가져온 본문을 재사용 (페이지 새로고침 시 초기화)
const bodyCache = {};
function parseArticleHtml(html) {
    try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const ogEl = doc.querySelector('meta[property="og:description"], meta[name="description"]');
        const lead = ogEl ? (ogEl.getAttribute('content') || '') : '';
        const BOILER = /구독|로그인|회원가입|저작권|무단전재|재배포 금지|all rights reserved|cookie|쿠키|광고/i;
        // 다양한 한국 뉴스 사이트 본문 컨테이너 + 표준 <p> 태그 순서대로 시도
        const ps = [...doc.querySelectorAll([
                'article p', '.article_txt p', '.article-body p', '.article_body p',
                '#article-view-content-div p', '.view_content p', '.news_content p',
                '.article_view p', '.cont_article p', '.news-article-body p', 'p',
            ].join(', '))]
            .map(el => el.textContent.trim())
            .filter((s, i, a) => s.length > 30 && !BOILER.test(s) && a.indexOf(s) === i);
        return [lead, ...ps].filter(Boolean).join('\n\n').trim().slice(0, 8000);
    }
    catch {
        return '';
    }
}
// ─── ArticleDetail (shared by mobile detail screen & desktop right pane) ──
function ArticleDetail({ sel, bookmarked, onToggleBm, onShare, onBack, showBack }) {
    const [fetchedBody, setFetchedBody] = useState(null);
    const [loadingBody, setLoadingBody] = useState(false);
    useEffect(() => {
        setFetchedBody(null);
        setLoadingBody(false);
        if (!sel || !sel.url || /google\.com/i.test(sel.url))
            return;
        // 이미 충분한 본문이 있으면 재요청 불필요
        if ((sel.body || '').length > 400)
            return;
        // 세션 캐시에 있으면 즉시 사용
        if (bodyCache[sel.id]) {
            setFetchedBody(bodyCache[sel.id]);
            return;
        }
        const ctrl = new AbortController();
        setLoadingBody(true);
        fetch('https://corsproxy.io/?url=' + encodeURIComponent(sel.url), { signal: ctrl.signal })
            .then(r => { if (!r.ok)
            throw new Error(String(r.status)); return r.text(); })
            .then(html => {
            const body = parseArticleHtml(html);
            if (body && body.length > 80) {
                bodyCache[sel.id] = body;
                setFetchedBody(body);
            }
        })
            .catch(() => { })
            .finally(() => setLoadingBody(false));
        return () => ctrl.abort();
    }, [sel ? sel.id : null]);
    if (!sel)
        return (React.createElement("div", { style: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, background: '#fcfbf9', color: '#c2c4c8' } },
            React.createElement("div", { style: { fontSize: 34 } }, "\u25A2"),
            React.createElement("div", { style: { font: '600 13.5px Pretendard' } }, "\uC67C\uCABD \uBAA9\uB85D\uC5D0\uC11C \uAE30\uC0AC\uB97C \uC120\uD0DD\uD558\uC138\uC694")));
    const { y, m, d } = kstYMD(itemMs(sel));
    const realUrl = sel.url && /^https?:\/\//i.test(sel.url) && !/(^|\/\/)kbgis\.app/i.test(sel.url) ? sel.url : '';
    const displayBody = fetchedBody || sel.body || '';
    const isFullBody = displayBody.length > 300;
    return (React.createElement("div", { style: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#fff' } },
        React.createElement("div", { style: { flexShrink: 0, height: 54, boxSizing: 'content-box', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'env(safe-area-inset-top) 16px 0 12px', borderBottom: '1px solid #efece4' } },
            showBack
                ? React.createElement("div", { onClick: onBack, style: { display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', font: '600 14px Pretendard', color: '#1c1d1f' } },
                    React.createElement("span", { style: { fontSize: 20 } }, "\u2039"),
                    " \uBAA9\uB85D")
                : React.createElement("div", { style: { font: '700 13px Pretendard', color: '#9a9ca0', paddingLeft: 6 } }, "\uAE30\uC0AC \uC0C1\uC138"),
            React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 4 } },
                React.createElement("div", { onClick: onToggleBm, style: { width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 16, color: '#56585c' } }, bookmarked ? React.createElement("span", { style: { color: '#1c1d1f' } }, "\u25A3") : React.createElement("span", null, "\u25A2")),
                React.createElement("div", { onClick: onShare, style: { width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 16, color: '#56585c' } }, "\u2197"))),
        React.createElement("div", { style: { flex: 1, minHeight: 0, overflowY: 'auto' } },
            React.createElement("div", { style: { padding: '18px 20px 26px', maxWidth: 760, margin: '0 auto' } },
                React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 11 } },
                    React.createElement("span", { style: { font: '700 10.5px Pretendard', color: '#fff', background: '#1c1d1f', padding: '3px 9px', borderRadius: 6 } }, sel.catLabel),
                    React.createElement("span", { style: { font: '700 11px Pretendard', color: '#1c1d1f', background: '#f0eee7', padding: '3px 9px', borderRadius: 6 } }, sel.inst),
                    React.createElement("span", { style: { display: 'inline-flex', alignItems: 'center', gap: 5, font: '600 11px Pretendard' } },
                        React.createElement("span", { style: { width: 7, height: 7, borderRadius: 2, background: sel.assetColor, display: 'inline-block' } }),
                        sel.assetLabel)),
                React.createElement("div", { style: { font: '700 21px/1.4 Pretendard', letterSpacing: '-.02em' } }, sel.ko),
                sel.en && sel.en !== sel.ko && React.createElement("div", { style: { font: '400 13.5px/1.5 Pretendard', color: '#8a8c90', marginTop: 8 } }, sel.en),
                React.createElement("div", { style: { font: '500 11.5px Pretendard', color: '#a6a8ac', marginTop: 11 } },
                    sel.source,
                    " \u00B7 ",
                    `${y}.${pad2(m)}.${pad2(d)}`,
                    " ",
                    sel.time),
                React.createElement("div", { style: { marginTop: 18, background: '#fffaeb', border: '1px solid #f6ecc8', borderRadius: 14, padding: '15px 16px' } },
                    React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 6, font: '700 11.5px Pretendard', color: '#9a7d12', letterSpacing: '.03em', marginBottom: 10 } },
                        React.createElement("span", { style: { width: 17, height: 17, borderRadius: 5, background: '#FFCC00', color: '#1c1d1f', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', font: '800 9px Pretendard' } }, "AI"),
                        "3\uC904 \uC694\uC57D"),
                    sel.ai.map((line, i) => (React.createElement("div", { key: i, style: { display: 'flex', gap: 8, font: '500 13px/1.55 Pretendard', color: '#3d3e42', marginTop: 5 } },
                        React.createElement("span", { style: { color: '#d9b400', flexShrink: 0 } }, "\u2014"),
                        React.createElement("span", null, line))))),
                React.createElement("div", { style: { marginTop: 20 } },
                    React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 } },
                        React.createElement("div", { style: { font: '700 11px Pretendard', color: '#a6a8ac', letterSpacing: '.06em' } }, "\uAE30\uC0AC \uC6D0\uBB38"),
                        loadingBody && React.createElement("div", { style: { font: '600 10px Pretendard', color: '#a6a8ac' } }, "\uBD88\uB7EC\uC624\uB294 \uC911\u2026"),
                        !loadingBody && isFullBody && React.createElement("span", { style: { font: '600 10px Pretendard', color: '#2563eb', background: '#dbeafe', padding: '2px 8px', borderRadius: 4 } }, "\uC804\uBB38")),
                    loadingBody ? (React.createElement("div", { style: { font: '500 13px/1.6 Pretendard', color: '#c2c4c8', padding: '8px 0' } }, "\uAE30\uC0AC \uB0B4\uC6A9\uC744 \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4\u2026")) : isFullBody ? (React.createElement("div", { style: { font: '500 14px/1.85 Pretendard', color: '#2a2b2f', whiteSpace: 'pre-wrap' } }, displayBody)) : (React.createElement("div", null,
                        React.createElement("div", { style: { font: '500 14px/1.75 Pretendard', color: '#34353a' } }, displayBody),
                        realUrl && React.createElement("div", { style: { marginTop: 10, font: '500 12px Pretendard', color: '#9a9ca0' } }, "\uC804\uCCB4 \uBCF8\uBB38\uC740 \uC6D0\uBB38 \uAE30\uC0AC\uC5D0\uC11C \uD655\uC778\uD558\uC138\uC694.")))),
                React.createElement("div", { style: { display: 'flex', gap: 8, marginTop: 22 } },
                    React.createElement("div", { onClick: onShare, style: { flex: 1, height: 42, background: '#1c1d1f', borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, font: '700 13px Pretendard', color: '#fff', cursor: 'pointer' } }, "\u2197 \uACF5\uC720"),
                    realUrl && React.createElement("a", { href: realUrl, target: "_blank", rel: "noopener noreferrer", style: { flex: 1.6, height: 42, background: '#FFCC00', borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, font: '700 13px Pretendard', color: '#1c1d1f', textDecoration: 'none' } }, "\uAE30\uC0AC \uC804\uBB38 \uBCF4\uAE30 \u2197")),
                React.createElement("div", { style: { font: '500 11px Pretendard', color: '#b6b8bc', textAlign: 'center', marginTop: 10 } }, realUrl ? '요약은 참고용입니다 · 전체 내용은 기사 원문에서 확인하세요' : '원문 링크가 확인되지 않은 기사입니다')))));
}
// ─── App ──────────────────────────────────────────────────
function App() {
    const [screen, setScreen] = useState('home');
    const [prevScreen, setPrevScreen] = useState('home');
    const [filter, setFilter] = useState('전체');
    const [query, setQuery] = useState('');
    const [bm, setBm] = useState(() => store.get('bookmarks', {}));
    const [read, setRead] = useState(() => store.get('read', {}));
    // 저장된 기사는 유효(실제 링크)한 것만 불러온다 — 옛 시드/가짜 기사 즉시 제거.
    const [articles, setArticles] = useState(() => sortArticles((store.get('articles', []) || []).filter(isRealArticle)));
    const [selectedId, setSelectedId] = useState(null);
    const [showShare, setShowShare] = useState(false);
    const [expandedGroup, setExpandedGroup] = useState(null);
    const [alloc, setAlloc] = useState(null);
    const [allocSel, setAllocSel] = useState(null);
    const [insights, setInsights] = useState(null);
    const [roster, setRoster] = useState(null); // 국내 LP 전체 로스터
    const [seen, setSeen] = useState(() => store.get('seen', null));
    const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 900px)').matches);
    useEffect(() => {
        const mq = window.matchMedia('(min-width: 900px)');
        const h = (e) => setIsDesktop(e.matches);
        mq.addEventListener ? mq.addEventListener('change', h) : mq.addListener(h);
        return () => { mq.removeEventListener ? mq.removeEventListener('change', h) : mq.removeListener(h); };
    }, []);
    const [toast, setToast] = useState(null);
    const toastTimer = useRef(null);
    // Persist state changes.
    useEffect(() => { store.set('bookmarks', bm); }, [bm]);
    useEffect(() => { store.set('read', read); }, [read]);
    useEffect(() => { store.set('articles', articles); }, [articles]);
    useEffect(() => { if (seen)
        store.set('seen', seen); }, [seen]);
    // First ever launch: mark everything as already seen (no startup flood badge).
    useEffect(() => {
        if (seen === null && articles.length) {
            const m = {};
            articles.forEach(a => { m[a.id] = true; });
            setSeen(m);
        }
    }, [articles, seen]);
    const markSeen = (ids) => setSeen(s => { const n = { ...(s || {}) }; ids.forEach(id => { n[id] = true; }); return n; });
    // Pull fresh news from the backend and merge into the archive — new items
    // 라이브 피드(news.json)를 권위 있는 소스로 삼아 그대로 반영한다. 합집합
    // 누적을 하지 않으므로, 수집기 피드에서 빠진(삭제된·가짜) 기사는 화면에서도
    // 사라진다. 단 빈 응답으로 화면을 비우지는 않는다(오프라인/일시 오류 대비).
    const refreshNews = (showToast) => {
        if (!NEWS_API)
            return;
        fetch(NEWS_API + '?t=' + Date.now())
            .then(r => r.json())
            .then(incoming => {
            if (Array.isArray(incoming) && incoming.length) {
                setArticles(sortArticles(incoming.filter(isRealArticle)));
            }
            if (showToast)
                flash('최신 뉴스를 불러왔어요');
        })
            .catch(() => { if (showToast)
            flash('새로고침에 실패했어요'); });
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
            .catch(() => { });
    }, []);
    // Load CIO·자산군 수익률 인사이트 (뉴스 자동 추출 결과).
    useEffect(() => {
        fetch(INSIGHTS_API + '?t=' + Date.now())
            .then(r => r.json())
            .then(d => { if (d && (Array.isArray(d.cios) || Array.isArray(d.assetReturns)))
            setInsights(d); })
            .catch(() => { });
    }, []);
    // Load 국내 LP 전체 로스터 (업권별 기관 목록).
    useEffect(() => {
        fetch(INSTITUTIONS_API + '?t=' + Date.now())
            .then(r => r.json())
            .then(d => { if (d && Array.isArray(d.institutions))
            setRoster(d.institutions); })
            .catch(() => { });
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
            if (screen !== 'detail')
                setPrevScreen(screen);
            setScreen('detail');
        }
    };
    const toggleBm = (id, e) => {
        if (e)
            e.stopPropagation();
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
        if (e && e.stopPropagation)
            e.stopPropagation();
        const data = { title: 'KB GIS · 해외대체투자 뉴스', text: it ? it.ko : '', url: articleUrl(it) };
        if (navigator.share) {
            try {
                await navigator.share(data);
                return;
            }
            catch (err) {
                if (err && err.name === 'AbortError')
                    return;
            }
        }
        setShowShare(true);
    };
    const copyLink = (label) => {
        const url = articleUrl(sel);
        try {
            navigator.clipboard && navigator.clipboard.writeText(url);
        }
        catch (e) { }
        setShowShare(false);
        flash(label === '링크' ? '링크가 복사되었습니다' : label + ' 공유용 링크를 복사했어요');
    };
    // Enrich items (and sanitize any HTML/entities from the feed text)
    const items = articles.map(it => {
        const a = ASSET[it.asset] || ASSET.PE;
        return {
            ...it,
            ko: clean(it.ko),
            en: clean(it.en),
            body: clean(it.body),
            enBody: clean(it.enBody),
            source: clean(it.source),
            inst: clean(it.inst),
            ai: Array.isArray(it.ai) ? it.ai.map(clean).filter(Boolean) : [],
            assetLabel: a.label,
            assetColor: a.color,
            regionLabel: REGION[it.region] || '글로벌',
            catLabel: CAT_LABEL[it.cat] || '시장 동향',
            instGroup: grp(it.instType),
            bookmarked: !!bm[it.id],
            unread: !read[it.id],
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
        if (k === todayKey)
            return '오늘';
        if (k === yKey)
            return '어제';
        const { y, m, d } = kstYMD(itemMs(it));
        return `${y}.${pad2(m)}.${pad2(d)}`;
    };
    // New since last visit (badge). Excludes ones already seen/opened.
    const newItems = seen ? items.filter(i => !seen[i.id]) : [];
    const newCount = newItems.length;
    // Filter
    const isGroup = GROUPS.includes(filter);
    const isAsset = !!ASSET[filter];
    const isRegion = !!REGION[filter];
    let feedItems = items;
    if (filter !== '전체') {
        if (filter === '인사')
            feedItems = items.filter(i => i.cat === '인사');
        else if (filter === '마켓')
            feedItems = items.filter(i => i.cat === '마켓');
        else if (filter === 'Global GP')
            feedItems = items.filter(i => i.instGroup === 'Global GP' && i.cat !== '인사');
        else if (isGroup)
            feedItems = items.filter(i => i.instGroup === filter && i.cat !== '인사');
        else if (isAsset)
            feedItems = items.filter(i => i.asset === filter);
        else if (isRegion)
            feedItems = items.filter(i => i.region === filter);
        else
            feedItems = items.filter(i => i.inst === filter); // 개별 기관·운용사명
    }
    let feedFilterLabel = filter;
    if (filter === '인사')
        feedFilterLabel = '조직·인사 이동';
    else if (filter === '마켓')
        feedFilterLabel = '마켓 뉴스';
    else if (isAsset)
        feedFilterLabel = ASSET[filter].label;
    else if (isRegion)
        feedFilterLabel = REGION[filter];
    const CHIP_LABEL = { '인사': '조직·인사', '마켓': '마켓 뉴스' };
    const chips = ['전체', '마켓', 'Global GP', '연기금', '공제회', '중앙회', '은행', '보험·캐피탈', '운용·증권', '인사'].map(k => ({
        label: CHIP_LABEL[k] || k, active: filter === k,
        bg: filter === k ? '#FFCC00' : '#2a2c30',
        color: filter === k ? '#1c1d1f' : '#cdced0',
    }));
    // Category data
    const ICON = { '연기금': '연금', '공제회': '공제', '중앙회': '중앙', '은행': '은행', '운용·증권': '운용', '보험·캐피탈': '보험', '해외 GP': 'GP' };
    const SAMPLE = { '연기금': '국민연금 · KIC · 사학연금', '공제회': '교직원 · 행정 · 군인공제회', '중앙회': '농협 · 수협 · 새마을금고', '은행': '산업 · 기업 · 수출입은행', '운용·증권': '미래에셋 · 삼성 · KB', '보험·캐피탈': '삼성생명 · 한화 · 현대해상', '해외 GP': 'Blackstone · Ares · KKR' };
    // 기관과 무관한 대체투자 마켓 뉴스 수
    const marketCount = items.filter(i => i.cat === '마켓').length;
    // 그룹별 기사 수 (인사·마켓 제외)
    const instsByGroup = {};
    items.forEach(i => { if (i.cat !== '인사' && i.cat !== '마켓') {
        const g = i.instGroup;
        (instsByGroup[g] = instsByGroup[g] || {});
        instsByGroup[g][i.inst] = (instsByGroup[g][i.inst] || 0) + 1;
    } });
    // 업권별 전체 LP 로스터(institutions.json) — 기사가 없어도 전 기관을 노출.
    const rosterByGroup = {};
    (roster || []).forEach(r => { (rosterByGroup[r.group] = rosterByGroup[r.group] || []).push(r.name); });
    // 그룹 헤더 카운트: 로스터가 있으면 전체 기관 수, 없으면 기사 보유 기관 수.
    const catGroups = GROUPS.map(g => ({
        name: g,
        count: items.filter(i => i.instGroup === g && i.cat !== '인사').length,
        instCount: (rosterByGroup[g] || []).length,
        icon: ICON[g], sample: SAMPLE[g],
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
    const assetCats = ['RE', 'PC', 'PE', 'IN', 'AV'].map(k => ({ key: k, label: ASSET[k].label, code: ASSET[k].code, color: ASSET[k].color, count: items.filter(i => i.asset === k).length }));
    const regionCats = ['US', 'EU', 'AP', 'GL'].map(k => ({ key: k, label: REGION[k], count: items.filter(i => i.region === k).length }));
    // Global GP data
    const gpTotal = items.filter(i => i.instGroup === 'Global GP' && i.cat !== '인사').length;
    const gpCats = GP_NAMES.map(n => ({ name: n, count: items.filter(i => i.inst === n).length }));
    // Search
    const q = query.trim().toLowerCase();
    const searchItems = q ? items.filter(i => (i.ko + ' ' + i.en + ' ' + i.inst + ' ' + i.instType + ' ' + i.source + ' ' + i.assetLabel).toLowerCase().includes(q)) : [];
    const suggests = ['Blackstone', 'Apollo', '국민연금', 'private credit', 'infrastructure', 'aviation'];
    const recentItems = items.filter(i => read[i.id]).slice(0, 3);
    // Bookmarks
    const bmItems = items.filter(i => bm[i.id]);
    // Detail
    const sel = (selectedId && items.find(i => i.id === selectedId)) || items[0];
    // Stats
    const stats = { total: items.length, lp: items.filter(i => i.cat === 'LP').length, gp: items.filter(i => i.cat === 'GP').length, people: items.filter(i => i.cat === '인사').length };
    const shareTargets = [
        { label: '카카오톡', icon: 'K', bg: '#FFE812', fg: '#1c1d1f' },
        { label: '이메일', icon: '✉', bg: '#f0eee7', fg: '#56585c' },
        { label: '슬랙', icon: 'S', bg: '#f0eee7', fg: '#56585c' },
        { label: '팀즈', icon: 'T', bg: '#f0eee7', fg: '#56585c' },
    ];
    const navProps = { homeNew: newCount, isDesktop, onHome: () => goTab('home'), onToday: () => goTab('today'), onCategory: () => goTab('category'), onAlloc: () => goTab('alloc'), onSearch: () => goTab('search'), onBookmarks: () => goTab('bookmarks') };
    // Allocation screen derived data
    const allocRows = (alloc && alloc.institutions) || [];
    const allocSelData = allocRows.find(r => r.name === allocSel) || allocRows[0];
    // Desktop master-detail: list screens get a list pane + a persistent detail pane.
    const LIST_SCREENS = ['home', 'today', 'search', 'bookmarks'];
    const desktopMaster = isDesktop && LIST_SCREENS.includes(screen);
    const paneStyle = desktopMaster
        ? { width: 404, flexShrink: 0, minWidth: 0, borderRight: '1px solid #ece9e2', display: 'flex', flexDirection: 'column', minHeight: 0 }
        : { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 };
    return (React.createElement("div", { className: "app-frame", style: { color: '#1c1d1f', ...(isDesktop ? { flexDirection: 'row', width: '100vw', height: '100dvh', maxWidth: 'none', borderRadius: 0, border: 'none', boxShadow: 'none' } : {}) } },
        isDesktop && React.createElement(Sidebar, { active: screen === 'detail' ? prevScreen : screen, homeNew: newCount, go: goTab, onRefresh: () => refreshNews(true) }),
        React.createElement("div", { style: paneStyle },
            screen === 'home' && (React.createElement("div", { style: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } },
                React.createElement("div", { style: { background: '#1c1d1f', color: '#fff', flexShrink: 0 } },
                    React.createElement("div", { style: { height: 'env(safe-area-inset-top)', flexShrink: 0 } }),
                    React.createElement("div", { style: { padding: '14px 20px 18px' } },
                        !isDesktop && (React.createElement("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 } },
                            React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                                React.createElement("div", { style: { width: 27, height: 27, borderRadius: 7, background: '#FFCC00', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '800 12px Pretendard', color: '#1c1d1f', letterSpacing: '-.02em' } }, "KB"),
                                React.createElement("div", { style: { font: '800 16px Pretendard', color: '#FFCC00', letterSpacing: '.04em' } }, "KB GIS")),
                            React.createElement("div", { style: { width: 31, height: 31, borderRadius: '50%', border: '1px solid #34363a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a4a5a8', fontSize: 13, position: 'relative' } },
                                "\u2303",
                                React.createElement("div", { style: { position: 'absolute', top: 6, right: 7, width: 6, height: 6, borderRadius: '50%', background: '#FFCC00', border: '1.5px solid #1c1d1f' } })))),
                        React.createElement("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
                            React.createElement("div", { style: { font: '800 19px Pretendard', letterSpacing: '-.02em' } }, "News"),
                            React.createElement("div", { onClick: () => refreshNews(true), style: { display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', font: '600 11.5px Pretendard', color: '#cdced0', border: '1px solid #34363a', borderRadius: 999, padding: '5px 11px' } }, "\u27F3 \uC0C8\uB85C\uACE0\uCE68"))),
                    React.createElement("div", { style: { display: 'flex', gap: 7, padding: '0 18px 14px', whiteSpace: 'nowrap', overflowX: 'auto' } }, chips.map(c => (React.createElement("div", { key: c.label, onClick: () => applyFilter(c.label), style: { padding: '7px 13px', borderRadius: 999, font: '600 12.5px Pretendard', flexShrink: 0, cursor: 'pointer', background: c.bg, color: c.color } }, c.label))))),
                React.createElement("div", { style: { flex: 1, minHeight: 0, overflowY: 'auto', background: '#fff' } },
                    newCount > 0 && (React.createElement("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 18px', background: '#1c1d1f' } },
                        React.createElement("span", { style: { font: '600 12px Pretendard', color: '#FFCC00' } },
                            "\u25CF \uC0C8 \uC18C\uC2DD ",
                            newCount,
                            "\uAC74"),
                        React.createElement("span", { onClick: () => markSeen(items.map(i => i.id)), style: { font: '600 12px Pretendard', color: '#fff', cursor: 'pointer', border: '1px solid #3a3c40', borderRadius: 999, padding: '4px 11px' } }, "\uBAA8\uB450 \uD655\uC778"))),
                    filter !== '전체' && (React.createElement("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 18px', background: '#fffaeb', borderBottom: '1px solid #f3eccf' } },
                        React.createElement("span", { style: { font: '600 12px Pretendard', color: '#9a7d12' } },
                            "\uD544\uD130 \u00B7 ",
                            feedFilterLabel,
                            " ",
                            React.createElement("span", { style: { color: '#c4a93a', fontWeight: 500 } },
                                feedItems.length,
                                "\uAC74")),
                        React.createElement("span", { onClick: () => setFilter('전체'), style: { font: '600 12px Pretendard', color: '#9a7d12', cursor: 'pointer' } }, "\uD574\uC81C \u2715"))),
                    feedItems.length === 0 && filter !== '전체' && (React.createElement("div", { style: { padding: '48px 24px', textAlign: 'center', color: '#b0b2b6' } },
                        React.createElement("div", { style: { fontSize: 30 } }, "\u25A2"),
                        React.createElement("div", { style: { font: '600 13px Pretendard', marginTop: 10 } },
                            feedFilterLabel,
                            " \uAD00\uB828 \uCD5C\uADFC \uAE30\uC0AC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4"),
                        React.createElement("div", { style: { font: '500 11px Pretendard', color: '#c2c4c8', marginTop: 6 } }, "\uC0C8 \uAE30\uC0AC\uAC00 \uC218\uC9D1\uB418\uBA74 \uC790\uB3D9\uC73C\uB85C \uD45C\uC2DC\uB429\uB2C8\uB2E4"))),
                    (() => {
                        const out = [];
                        let last = null;
                        feedItems.forEach(item => {
                            const k = dayKeyOf(item);
                            if (k !== last) {
                                out.push(React.createElement("div", { key: 'h' + k, style: { position: 'sticky', top: 0, zIndex: 1, background: '#fbfaf7', font: '700 11.5px Pretendard', color: '#9a7d12', letterSpacing: '.02em', padding: '8px 18px', borderBottom: '1px solid #f0ede4' } }, dayLabelOf(item)));
                                last = k;
                            }
                            out.push(React.createElement(FeedItem, { key: item.id, item: item, isNew: seen && !seen[item.id], selected: isDesktop && selectedId === item.id, onOpen: () => openItem(item.id), onBookmark: e => toggleBm(item.id, e) }));
                        });
                        return out;
                    })(),
                    React.createElement("div", { style: { padding: 18, textAlign: 'center', font: '500 11px Pretendard', color: '#bcbec2' } }, "\uD574\uC678 \uB300\uCCB4\uD22C\uC790 \uB274\uC2A4\uB97C AI\uAC00 \uC815\uB9AC\uD588\uC2B5\uB2C8\uB2E4")),
                React.createElement(Navbar, { active: "home", ...navProps }))),
            screen === 'today' && (React.createElement("div", { style: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#fff' } },
                React.createElement("div", { style: { flexShrink: 0 } },
                    React.createElement("div", { style: { height: 'max(env(safe-area-inset-top), 8px)', flexShrink: 0 } }),
                    React.createElement("div", { style: { padding: '2px 20px 16px', borderBottom: '1px solid #efece4', display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
                        React.createElement("div", null,
                            React.createElement("div", { style: { font: '800 20px Pretendard', letterSpacing: '-.02em' } }, "\uC624\uB298"),
                            React.createElement("div", { style: { font: '500 11.5px Pretendard', color: '#9a9ca0', marginTop: 3 } },
                                "\uC624\uB298 \uC62C\uB77C\uC628 \uB274\uC2A4 \u00B7 ",
                                todayMD)),
                        React.createElement("div", { onClick: () => refreshNews(true), style: { cursor: 'pointer', font: '600 11.5px Pretendard', color: '#9a7d12', border: '1px solid #ece9e2', borderRadius: 999, padding: '6px 12px' } }, "\u27F3 \uC0C8\uB85C\uACE0\uCE68"))),
                React.createElement("div", { style: { flex: 1, minHeight: 0, overflowY: 'auto' } }, todayItems.length === 0 ? (React.createElement("div", { style: { padding: '80px 30px', textAlign: 'center' } },
                    React.createElement("div", { style: { fontSize: 30, color: '#d8d5cd' } }, "\u25F7"),
                    React.createElement("div", { style: { font: '600 14px Pretendard', color: '#56585c', marginTop: 14 } }, "\uC624\uB298 \uC62C\uB77C\uC628 \uB274\uC2A4\uAC00 \uC544\uC9C1 \uC5C6\uC2B5\uB2C8\uB2E4"),
                    React.createElement("div", { style: { font: '500 12px Pretendard', color: '#a6a8ac', marginTop: 6, lineHeight: 1.5 } },
                        "\uC7A0\uC2DC \uD6C4 \uC0C8\uB85C\uACE0\uCE68\uD558\uAC70\uB098",
                        React.createElement("br", null),
                        "\uD648\uC5D0\uC11C \uC804\uCCB4 \uB274\uC2A4\uB97C \uD655\uC778\uD558\uC138\uC694"))) : todayItems.map(item => React.createElement(FeedItem, { key: item.id, item: item, isNew: seen && !seen[item.id], selected: isDesktop && selectedId === item.id, onOpen: () => openItem(item.id), onBookmark: e => toggleBm(item.id, e) }))),
                React.createElement(Navbar, { active: "today", ...navProps }))),
            screen === 'category' && (React.createElement("div", { style: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#fff' } },
                React.createElement("div", { style: { flexShrink: 0 } },
                    React.createElement("div", { style: { height: 'max(env(safe-area-inset-top), 8px)', flexShrink: 0 } }),
                    React.createElement("div", { style: { padding: '2px 20px 16px', borderBottom: '1px solid #efece4' } },
                        React.createElement("div", { style: { font: '800 20px Pretendard', letterSpacing: '-.02em' } }, "\uCE74\uD14C\uACE0\uB9AC"),
                        React.createElement("div", { style: { font: '500 11.5px Pretendard', color: '#9a9ca0', marginTop: 3 } }, "\uAE30\uAD00\u00B7\uC790\uC0B0\uAD70\u00B7\uC9C0\uC5ED\uBCC4\uB85C \uBE60\uB974\uAC8C \uBAA8\uC544\uBCF4\uAE30"))),
                React.createElement("div", { style: { flex: 1, minHeight: 0, overflowY: 'auto', padding: 18 } },
                    React.createElement("div", { onClick: () => applyFilter('마켓'), style: { display: 'flex', alignItems: 'center', gap: 13, border: '1px solid #ece9e2', borderRadius: 14, padding: '14px 15px', marginBottom: 18, cursor: 'pointer', background: 'linear-gradient(90deg,#fffaeb,#fff)' } },
                        React.createElement("span", { style: { width: 38, height: 38, borderRadius: 10, background: '#FFCC00', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '800 15px Pretendard', color: '#1c1d1f', flexShrink: 0 } }, "\uD83D\uDCC8"),
                        React.createElement("div", { style: { flex: 1 } },
                            React.createElement("div", { style: { font: '700 14px Pretendard' } }, "\uB9C8\uCF13 \uB274\uC2A4"),
                            React.createElement("div", { style: { font: '500 10.5px Pretendard', color: '#9a9ca0', marginTop: 2 } }, "\uAE30\uAD00\uACFC \uBB34\uAD00\uD55C \uD574\uC678 \uB300\uCCB4\uD22C\uC790 \uC2DC\uC7A5\u00B7\uB51C\u00B7\uC804\uB9DD")),
                        React.createElement("span", { style: { font: '700 12px Pretendard', color: '#9a7d12', background: '#fff7d6', padding: '3px 10px', borderRadius: 999 } }, marketCount),
                        React.createElement("span", { style: { color: '#cfccc4' } }, "\u203A")),
                    React.createElement("div", { style: { font: '700 11px Pretendard', color: '#a6a8ac', letterSpacing: '.06em', marginBottom: 10 } },
                        "\uAD6D\uB0B4 LP \u00B7 \uC5C5\uAD8C\uBCC4 ",
                        React.createElement("span", { style: { fontWeight: 500, letterSpacing: 0 } },
                            "\u00B7 \uAE30\uAD00\uC744 \uB20C\uB7EC \uD574\uB2F9 \uAE30\uAD00 \uB274\uC2A4 \uBCF4\uAE30",
                            roster ? ` (전체 ${roster.length}개 기관)` : '')),
                    React.createElement("div", { style: { display: 'flex', flexDirection: 'column', gap: 8 } }, catGroups.map(g => {
                        const open = expandedGroup === g.name;
                        const insts = open ? groupInsts(g.name) : [];
                        return (React.createElement("div", { key: g.name, style: { border: '1px solid #ece9e2', borderRadius: 13, overflow: 'hidden' } },
                            React.createElement("div", { onClick: () => setExpandedGroup(x => x === g.name ? null : g.name), style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 15px', cursor: 'pointer' } },
                                React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 11 } },
                                    React.createElement("span", { style: { width: 34, height: 34, borderRadius: 9, background: '#f2f0ea', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '800 12px Pretendard', color: '#56585c' } }, g.icon),
                                    React.createElement("div", null,
                                        React.createElement("div", { style: { font: '700 14px Pretendard' } }, g.name),
                                        React.createElement("div", { style: { font: '500 10.5px Pretendard', color: '#9a9ca0', marginTop: 2 } }, g.sample))),
                                React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 9 } },
                                    g.instCount > 0 && React.createElement("span", { style: { font: '600 10.5px Pretendard', color: '#9a9ca0' } },
                                        "\uAE30\uAD00 ",
                                        g.instCount),
                                    React.createElement("span", { style: { font: '700 12px Pretendard', color: '#1c1d1f', background: '#f4f2ec', padding: '3px 9px', borderRadius: 999 } }, g.count),
                                    React.createElement("span", { style: { color: '#cfccc4', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' } }, "\u203A"))),
                            open && (React.createElement("div", { style: { padding: '2px 13px 14px', display: 'flex', flexWrap: 'wrap', gap: 7 } },
                                React.createElement("div", { onClick: () => applyFilter(g.name), style: { font: '600 12px Pretendard', color: '#1c1d1f', background: '#FFCC00', padding: '8px 12px', borderRadius: 999, cursor: 'pointer' } },
                                    g.name,
                                    " \uC804\uCCB4 \uAE30\uC0AC ",
                                    g.count),
                                insts.length === 0
                                    ? React.createElement("span", { style: { font: '500 11.5px Pretendard', color: '#a6a8ac', alignSelf: 'center' } }, "\uAE30\uAD00 \uBAA9\uB85D\uC744 \uBD88\uB7EC\uC624\uB294 \uC911\u2026")
                                    : insts.map(([name, c]) => (React.createElement("div", { key: name, onClick: () => applyFilter(name), style: { font: '600 12px Pretendard', color: c ? '#3d3e42' : '#a6a8ac', background: c ? '#f2f0ea' : '#f8f7f3', padding: '8px 12px', borderRadius: 999, cursor: 'pointer' } },
                                        name,
                                        c ? React.createElement("span", { style: { color: '#9a7d12', marginLeft: 4 } }, c) : null)))))));
                    })),
                    React.createElement("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '22px 0 10px' } },
                        React.createElement("span", { style: { font: '700 11px Pretendard', color: '#a6a8ac', letterSpacing: '.06em' } }, "Global GP \u00B7 \uD574\uC678 \uC6B4\uC6A9\uC0AC"),
                        React.createElement("span", { onClick: () => applyFilter('Global GP'), style: { font: '600 11px Pretendard', color: '#9a7d12', cursor: 'pointer' } },
                            "\uC804\uCCB4 \uBCF4\uAE30 ",
                            gpTotal,
                            " \u203A")),
                    React.createElement("div", { style: { display: 'flex', flexWrap: 'wrap', gap: 8 } }, gpCats.map(g => (React.createElement("div", { key: g.name, onClick: () => applyFilter(g.name), style: { display: 'flex', alignItems: 'center', gap: 6, font: '600 12.5px Pretendard', color: '#3d3e42', background: '#f2f0ea', padding: '9px 13px', borderRadius: 999, cursor: 'pointer' } },
                        g.name,
                        " ",
                        React.createElement("span", { style: { color: '#a6a8ac' } }, g.count))))),
                    React.createElement("div", { style: { font: '700 11px Pretendard', color: '#a6a8ac', letterSpacing: '.06em', margin: '22px 0 10px' } }, "\uC790\uC0B0\uAD70"),
                    React.createElement("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 } }, assetCats.map(a => (React.createElement("div", { key: a.key, onClick: () => applyFilter(a.key), style: { border: '1px solid #ece9e2', borderRadius: 13, padding: 14, cursor: 'pointer' } },
                        React.createElement("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
                            React.createElement("span", { style: { width: 9, height: 9, borderRadius: 3, background: a.color, display: 'inline-block' } }),
                            React.createElement("span", { style: { font: '700 12px Pretendard', color: '#1c1d1f' } }, a.count)),
                        React.createElement("div", { style: { font: '700 14px Pretendard', marginTop: 9 } }, a.label),
                        React.createElement("div", { style: { font: '500 10.5px Pretendard', color: '#9a9ca0', marginTop: 2 } }, a.code))))),
                    React.createElement("div", { style: { font: '700 11px Pretendard', color: '#a6a8ac', letterSpacing: '.06em', margin: '22px 0 10px' } }, "\uC9C0\uC5ED"),
                    React.createElement("div", { style: { display: 'flex', flexWrap: 'wrap', gap: 8 } }, regionCats.map(r => (React.createElement("div", { key: r.key, onClick: () => applyFilter(r.key), style: { font: '600 13px Pretendard', color: '#3d3e42', background: '#f2f0ea', padding: '9px 15px', borderRadius: 999, cursor: 'pointer' } },
                        r.label,
                        " ",
                        React.createElement("span", { style: { color: '#a6a8ac' } }, r.count)))))),
                React.createElement(Navbar, { active: "category", ...navProps }))),
            screen === 'alloc' && (React.createElement("div", { style: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#fff' } },
                React.createElement("div", { style: { flexShrink: 0 } },
                    React.createElement("div", { style: { height: 'max(env(safe-area-inset-top), 8px)', flexShrink: 0 } }),
                    React.createElement("div", { style: { padding: '2px 20px 16px', borderBottom: '1px solid #efece4' } },
                        React.createElement("div", { style: { font: '800 20px Pretendard', letterSpacing: '-.02em' } }, "\uB300\uCCB4\uD22C\uC790 \uBC30\uBD84\uD604\uD669"),
                        React.createElement("div", { style: { font: '500 11.5px Pretendard', color: '#9a9ca0', marginTop: 3 } },
                            "\uAD6D\uB0B4 LP \uAE30\uAD00\uBCC4 \uB300\uCCB4\uD22C\uC790 \uBE44\uC911\u00B7\uAE08\uC561\u00B7\uC5F0\uB3C4\uBCC4 \uCD94\uC774 ",
                            alloc && React.createElement("span", { style: { color: '#c4a93a' } },
                                "\u00B7 ",
                                alloc.asOf,
                                " \uAE30\uC900")))),
                React.createElement("div", { style: { flex: 1, minHeight: 0, overflowY: 'auto', padding: 18 } }, !allocSelData ? (React.createElement("div", { style: { padding: '80px 30px', textAlign: 'center' } },
                    React.createElement("div", { style: { fontSize: 30, color: '#d8d5cd' } }, "\u25A4"),
                    React.createElement("div", { style: { font: '600 14px Pretendard', color: '#56585c', marginTop: 14 } }, "\uBC30\uBD84 \uB370\uC774\uD130\uB97C \uBD88\uB7EC\uC624\uB294 \uC911\u2026"))) : (React.createElement(React.Fragment, null,
                    React.createElement("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 } },
                        React.createElement("span", { style: { font: '700 11px Pretendard', color: '#a6a8ac', letterSpacing: '.06em' } }, "\uAE30\uAD00\uBCC4 \uB300\uCCB4\uD22C\uC790 \uBE44\uC911"),
                        React.createElement("span", { style: { display: 'flex', alignItems: 'center', gap: 10, font: '500 10px Pretendard', color: '#9a9ca0' } },
                            React.createElement("span", { style: { display: 'flex', alignItems: 'center', gap: 4 } },
                                React.createElement("span", { style: { width: 9, height: 9, borderRadius: 2, background: '#FFCC00', display: 'inline-block' } }),
                                "\uD574\uC678"),
                            React.createElement("span", { style: { display: 'flex', alignItems: 'center', gap: 4 } },
                                React.createElement("span", { style: { width: 9, height: 9, borderRadius: 2, background: '#FFE695', display: 'inline-block' } }),
                                "\uC804\uCCB4"))),
                    React.createElement(AllocBars, { rows: allocRows, selName: allocSel, onSelect: setAllocSel }),
                    React.createElement("div", { style: { marginTop: 24, border: '1px solid #ece9e2', borderRadius: 16, padding: 16 } },
                        React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 13, flexWrap: 'wrap' } },
                            React.createElement("span", { style: { font: '800 16px Pretendard', letterSpacing: '-.02em' } }, allocSelData.name),
                            React.createElement("span", { style: { font: '600 10.5px Pretendard', color: '#56585c', background: '#f0eee7', padding: '2px 8px', borderRadius: 5 } }, allocSelData.group),
                            allocSelData.auto
                                ? React.createElement("span", { style: { font: '700 9.5px Pretendard', color: '#1a7a4a', background: '#e4f5ea', padding: '2px 8px', borderRadius: 5, letterSpacing: '.02em' } },
                                    "\u25CF ",
                                    allocSelData.autoKind === 'news' ? '기사 기반' : '자동 갱신')
                                : allocSelData.verified
                                    ? React.createElement("span", { style: { font: '700 9.5px Pretendard', color: '#1a5fa4', background: '#e6effa', padding: '2px 8px', borderRadius: 5, letterSpacing: '.02em' } }, "\u25CF \uACF5\uC2DC \uD655\uC815")
                                    : React.createElement("span", { style: { font: '700 9.5px Pretendard', color: '#9a7d12', background: '#fffaeb', padding: '2px 8px', borderRadius: 5, letterSpacing: '.02em' } }, "\uACF5\uC2DC \uCD94\uC815\uCE58")),
                        React.createElement("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginBottom: 16 } },
                            React.createElement("div", { style: { background: '#f8f7f3', borderRadius: 11, padding: '11px 13px' } },
                                React.createElement("div", { style: { font: '800 18px Pretendard' } }, fmtAmt(allocSelData.aum)),
                                React.createElement("div", { style: { font: '500 10px Pretendard', color: '#9a9ca0', marginTop: 2 } }, "\uC6B4\uC6A9\uC790\uC0B0(AUM)")),
                            React.createElement("div", { style: { background: '#fffaeb', borderRadius: 11, padding: '11px 13px' } },
                                React.createElement("div", { style: { font: '800 18px Pretendard', color: '#9a7d12' } }, fmtAmt(allocSelData.altAmount)),
                                React.createElement("div", { style: { font: '500 10px Pretendard', color: '#b89a2e', marginTop: 2 } }, "\uB300\uCCB4\uD22C\uC790 \uAE08\uC561")),
                            React.createElement("div", { style: { background: '#f8f7f3', borderRadius: 11, padding: '11px 13px' } },
                                React.createElement("div", { style: { font: '800 18px Pretendard' } }, fmtPct(allocSelData.altPct)),
                                React.createElement("div", { style: { font: '500 10px Pretendard', color: '#9a9ca0', marginTop: 2 } }, "\uB300\uCCB4\uD22C\uC790 \uBE44\uC911")),
                            React.createElement("div", { style: { background: '#f8f7f3', borderRadius: 11, padding: '11px 13px' } },
                                React.createElement("div", { style: { font: '800 18px Pretendard' } }, fmtPct(allocSelData.overseasAltPct)),
                                React.createElement("div", { style: { font: '500 10px Pretendard', color: '#9a9ca0', marginTop: 2 } }, "\uB300\uCCB4\uD22C\uC790 \uC911 \uD574\uC678"))),
                        React.createElement("div", { style: { font: '700 10.5px Pretendard', color: '#a6a8ac', letterSpacing: '.05em', marginBottom: 6 } }, "\uB300\uCCB4\uD22C\uC790 \uBE44\uC911 \uCD94\uC774"),
                        React.createElement(TrendChart, { trend: allocSelData.trend }),
                        allocSelData.sourceNote && React.createElement("div", { style: { font: '500 10.5px/1.6 Pretendard', color: '#9a9ca0', marginTop: 10, background: '#f8f7f3', borderRadius: 9, padding: '9px 11px' } }, allocSelData.sourceNote),
                        React.createElement("div", { style: { font: '500 10px Pretendard', color: '#b6b8bc', marginTop: 8 } },
                            "\uCD9C\uCC98 \u00B7 ",
                            allocSelData.sourceUrl
                                ? React.createElement("a", { href: allocSelData.sourceUrl, target: "_blank", rel: "noopener noreferrer", style: { color: '#7a8190', textDecoration: 'underline' } },
                                    allocSelData.source,
                                    " \u2197")
                                : allocSelData.source,
                            allocSelData.auto && allocSelData.updatedAt ? ` · ${allocSelData.updatedAt} 자동 갱신` : '')),
                    React.createElement("div", { style: { font: '700 11px Pretendard', color: '#a6a8ac', letterSpacing: '.06em', margin: '24px 0 10px' } }, "\uC804\uCCB4 \uD45C"),
                    React.createElement("div", { style: { border: '1px solid #ece9e2', borderRadius: 13, overflow: 'hidden' } },
                        React.createElement("div", { style: { display: 'grid', gridTemplateColumns: '1.7fr 1fr 0.9fr 0.9fr', background: '#f8f7f3', padding: '9px 12px', font: '700 10.5px Pretendard', color: '#7a7c80' } },
                            React.createElement("span", null, "\uAE30\uAD00"),
                            React.createElement("span", { style: { textAlign: 'right' } }, "\uB300\uCCB4\uD22C\uC790"),
                            React.createElement("span", { style: { textAlign: 'right' } }, "\uBE44\uC911"),
                            React.createElement("span", { style: { textAlign: 'right' } }, "\uD574\uC678")),
                        allocRows.map((r, i) => (React.createElement("div", { key: r.name, onClick: () => setAllocSel(r.name), style: { display: 'grid', gridTemplateColumns: '1.7fr 1fr 0.9fr 0.9fr', padding: '11px 12px', borderTop: '1px solid #f3f1ea', cursor: 'pointer', background: allocSel === r.name ? '#fffaeb' : '#fff', alignItems: 'center' } },
                            React.createElement("span", { style: { font: '600 12px Pretendard', color: '#1c1d1f' } }, r.name),
                            React.createElement("span", { style: { font: '600 12px Pretendard', textAlign: 'right' } }, fmtAmt(r.altAmount)),
                            React.createElement("span", { style: { font: '700 12px Pretendard', textAlign: 'right', color: '#9a7d12' } }, fmtPct(r.altPct)),
                            React.createElement("span", { style: { font: '500 12px Pretendard', textAlign: 'right', color: '#7a7c80' } }, fmtPct(r.overseasAltPct)))))),
                    alloc && alloc.note && React.createElement("div", { style: { font: '500 10.5px/1.6 Pretendard', color: '#b6b8bc', marginTop: 14 } },
                        "\u203B ",
                        alloc.note),
                    React.createElement("div", { style: { display: 'flex', alignItems: 'baseline', gap: 8, margin: '30px 0 10px' } },
                        React.createElement("div", { style: { font: '700 11px Pretendard', color: '#a6a8ac', letterSpacing: '.06em' } }, "\uC8FC\uC694 LP CIO\u00B7\uC778\uC0AC \uD604\uD669"),
                        React.createElement("span", { style: { font: '500 9.5px Pretendard', color: '#1a7a4a', background: '#e4f5ea', padding: '2px 7px', borderRadius: 5 } },
                            "\u25CF \uB274\uC2A4 \uC790\uB3D9 \uCD94\uCD9C",
                            insights && insights.updatedAt ? ` · ${insights.updatedAt}` : '')),
                    insights && insights.cios && insights.cios.length ? (React.createElement("div", { style: { border: '1px solid #ece9e2', borderRadius: 13, overflow: 'hidden' } }, insights.cios.map((c, i) => (React.createElement("a", { key: c.inst + i, href: c.url && /^https?:\/\//.test(c.url) ? c.url : undefined, target: "_blank", rel: "noopener noreferrer", style: { display: 'block', textDecoration: 'none', color: 'inherit', padding: '12px 13px', borderTop: i ? '1px solid #f3f1ea' : 'none', cursor: c.url ? 'pointer' : 'default' } },
                        React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' } },
                            React.createElement("span", { style: { font: '700 12.5px Pretendard', color: '#1c1d1f' } }, c.inst),
                            React.createElement("span", { style: { font: '700 9px Pretendard', color: c.status === '선임' ? '#1a5fa4' : '#9a7d12', background: c.status === '선임' ? '#e6effa' : '#fffaeb', padding: '2px 7px', borderRadius: 5 } }, c.status)),
                        React.createElement("div", { style: { font: '500 12px/1.5 Pretendard', color: '#3d3e42', marginTop: 5 } }, c.note),
                        React.createElement("div", { style: { font: '500 10px Pretendard', color: '#b6b8bc', marginTop: 5 } },
                            c.date,
                            " \u00B7 ",
                            c.source,
                            c.url ? ' · 기사 보기 ↗' : '')))))) : (React.createElement("div", { style: { font: '500 11px/1.6 Pretendard', color: '#b6b8bc', border: '1px dashed #e3e0d8', borderRadius: 13, padding: '14px' } }, "\uCD5C\uADFC \uAE30\uC0AC\uC5D0\uC11C \uCD94\uCD9C\uB41C CIO\u00B7\uC778\uC0AC \uC815\uBCF4\uAC00 \uC544\uC9C1 \uC5C6\uC2B5\uB2C8\uB2E4. \uAD00\uB828 \uAE30\uC0AC\uAC00 \uC62C\uB77C\uC624\uBA74 \uC790\uB3D9 \uBC18\uC601\uB429\uB2C8\uB2E4.")),
                    React.createElement("div", { style: { display: 'flex', alignItems: 'baseline', gap: 8, margin: '26px 0 10px' } },
                        React.createElement("div", { style: { font: '700 11px Pretendard', color: '#a6a8ac', letterSpacing: '.06em' } }, "\uC790\uC0B0\uAD70\uBCC4 \uC218\uC775\uB960"),
                        React.createElement("span", { style: { font: '500 9.5px Pretendard', color: '#1a7a4a', background: '#e4f5ea', padding: '2px 7px', borderRadius: 5 } }, "\u25CF \uCD5C\uADFC \uAE30\uC0AC \uAE30\uC900")),
                    insights && insights.assetReturns && insights.assetReturns.length ? (React.createElement("div", { style: { border: '1px solid #ece9e2', borderRadius: 13, overflow: 'hidden' } }, insights.assetReturns.map((r, i) => (React.createElement("a", { key: r.asset + i, href: r.url && /^https?:\/\//.test(r.url) ? r.url : undefined, target: "_blank", rel: "noopener noreferrer", style: { display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit', padding: '12px 13px', borderTop: i ? '1px solid #f3f1ea' : 'none' } },
                        React.createElement("span", { style: { width: 7, height: 7, borderRadius: 2, background: (ASSET[r.asset] && ASSET[r.asset].color) || '#c4a93a', display: 'inline-block', flexShrink: 0 } }),
                        React.createElement("span", { style: { font: '600 12px Pretendard', color: '#1c1d1f', flex: 1 } },
                            r.label,
                            r.inst ? ` · ${r.inst}` : ''),
                        React.createElement("span", { style: { font: '800 14px Pretendard', color: r.value < 0 ? '#c0392b' : '#1a7a4a' } },
                            r.value > 0 ? '+' : '',
                            r.value,
                            "%"),
                        React.createElement("span", { style: { font: '500 9.5px Pretendard', color: '#b6b8bc' } },
                            r.date,
                            "\u2197")))))) : (React.createElement("div", { style: { font: '500 11px/1.6 Pretendard', color: '#b6b8bc', border: '1px dashed #e3e0d8', borderRadius: 13, padding: '14px' } }, "\uCD5C\uADFC \uAE30\uC0AC\uC5D0\uC11C \uD655\uC778\uB41C \uC790\uC0B0\uAD70\uBCC4 \uC218\uC775\uB960\uC774 \uC544\uC9C1 \uC5C6\uC2B5\uB2C8\uB2E4. \uAD00\uB828 \uAE30\uC0AC\uAC00 \uC62C\uB77C\uC624\uBA74 \uC790\uB3D9 \uBC18\uC601\uB429\uB2C8\uB2E4."))))),
                React.createElement(Navbar, { active: "alloc", ...navProps }))),
            screen === 'search' && (React.createElement("div", { style: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#fff' } },
                React.createElement("div", { style: { flexShrink: 0 } },
                    React.createElement("div", { style: { height: 'max(env(safe-area-inset-top), 8px)', flexShrink: 0 } }),
                    React.createElement("div", { style: { padding: '4px 18px 16px', borderBottom: '1px solid #efece4' } },
                        React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 9, background: '#f4f2ec', borderRadius: 12, padding: '0 14px', height: 46 } },
                            React.createElement("span", { style: { color: '#9a9ca0', fontSize: 16 } }, "\u2315"),
                            React.createElement("input", { type: "text", value: query, onChange: e => setQuery(e.target.value), placeholder: "\uAE30\uAD00\u00B7GP\u00B7\uC790\uC0B0\uAD70 \uAC80\uC0C9 (\uC608: \uAD6D\uBBFC\uC5F0\uAE08, \uBE14\uB799\uC2A4\uD1A4)", style: { flex: 1, border: 'none', outline: 'none', background: 'transparent', font: '500 13.5px Pretendard', color: '#1c1d1f' } }),
                            q && React.createElement("span", { onClick: () => setQuery(''), style: { color: '#9a9ca0', fontSize: 15, cursor: 'pointer' } }, "\u2715")))),
                React.createElement("div", { style: { flex: 1, minHeight: 0, overflowY: 'auto' } }, q ? (React.createElement(React.Fragment, null,
                    React.createElement("div", { style: { padding: '12px 18px 6px', font: '600 12px Pretendard', color: '#9a9ca0' } },
                        "\uAC80\uC0C9 \uACB0\uACFC ",
                        React.createElement("span", { style: { color: '#1c1d1f' } }, searchItems.length),
                        "\uAC74"),
                    searchItems.map(item => (React.createElement("div", { key: item.id, onClick: () => openItem(item.id), style: { display: 'flex', gap: 11, padding: '13px 18px', borderBottom: '1px solid #f3f1ea', cursor: 'pointer' } },
                        React.createElement("div", { style: { width: 3, borderRadius: 2, background: item.assetColor, flexShrink: 0 } }),
                        React.createElement("div", { style: { flex: 1, minWidth: 0 } },
                            React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 } },
                                React.createElement("span", { style: { font: '700 10.5px Pretendard', color: '#1c1d1f', background: '#f0eee7', padding: '2px 7px', borderRadius: 5 } }, item.inst),
                                React.createElement("span", { style: { font: '600 10.5px Pretendard', color: item.assetColor } }, item.assetLabel),
                                React.createElement("span", { style: { font: '500 10.5px Pretendard', color: '#bcbec2' } }, item.time)),
                            React.createElement("div", { style: { font: '650 13.5px/1.4 Pretendard' } }, item.ko))))),
                    searchItems.length === 0 && React.createElement("div", { style: { padding: '60px 20px', textAlign: 'center', font: '500 13px Pretendard', color: '#a6a8ac' } }, "\uAC80\uC0C9 \uACB0\uACFC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4"))) : (React.createElement("div", { style: { padding: 18 } },
                    React.createElement("div", { style: { font: '700 11px Pretendard', color: '#a6a8ac', letterSpacing: '.06em', marginBottom: 11 } }, "\uCD94\uCC9C \uAC80\uC0C9\uC5B4"),
                    React.createElement("div", { style: { display: 'flex', flexWrap: 'wrap', gap: 8 } }, suggests.map(t => React.createElement("div", { key: t, onClick: () => setQuery(t), style: { font: '600 12.5px Pretendard', color: '#3d3e42', background: '#f2f0ea', padding: '9px 14px', borderRadius: 999, cursor: 'pointer' } }, t))),
                    recentItems.length > 0 && (React.createElement(React.Fragment, null,
                        React.createElement("div", { style: { font: '700 11px Pretendard', color: '#a6a8ac', letterSpacing: '.06em', margin: '24px 0 11px' } }, "\uCD5C\uADFC \uBCF8 \uB274\uC2A4"),
                        recentItems.map(item => (React.createElement("div", { key: item.id, onClick: () => openItem(item.id), style: { display: 'flex', alignItems: 'center', gap: 10, padding: '11px 0', borderBottom: '1px solid #f3f1ea', cursor: 'pointer' } },
                            React.createElement("span", { style: { width: 3, height: 30, borderRadius: 2, background: item.assetColor, flexShrink: 0, display: 'inline-block' } }),
                            React.createElement("div", { style: { flex: 1, minWidth: 0 } },
                                React.createElement("div", { style: { font: '600 13px/1.35 Pretendard' } }, item.ko),
                                React.createElement("div", { style: { font: '500 10px Pretendard', color: '#a6a8ac', marginTop: 3 } },
                                    item.inst,
                                    " \u00B7 ",
                                    item.source)))))))))),
                React.createElement(Navbar, { active: "search", ...navProps }))),
            screen === 'bookmarks' && (React.createElement("div", { style: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#fff' } },
                React.createElement("div", { style: { flexShrink: 0 } },
                    React.createElement("div", { style: { height: 'max(env(safe-area-inset-top), 8px)', flexShrink: 0 } }),
                    React.createElement("div", { style: { padding: '2px 20px 16px', borderBottom: '1px solid #efece4' } },
                        React.createElement("div", { style: { font: '800 20px Pretendard', letterSpacing: '-.02em' } }, "\uBD81\uB9C8\uD06C"),
                        React.createElement("div", { style: { font: '500 11.5px Pretendard', color: '#9a9ca0', marginTop: 3 } },
                            "\uC800\uC7A5\uD55C \uB274\uC2A4 ",
                            bmItems.length,
                            "\uAC74"))),
                React.createElement("div", { style: { flex: 1, minHeight: 0, overflowY: 'auto' } }, bmItems.length === 0 ? (React.createElement("div", { style: { padding: '90px 30px', textAlign: 'center' } },
                    React.createElement("div", { style: { fontSize: 30, color: '#d8d5cd' } }, "\u25A2"),
                    React.createElement("div", { style: { font: '600 14px Pretendard', color: '#56585c', marginTop: 14 } }, "\uC800\uC7A5\uD55C \uB274\uC2A4\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4"),
                    React.createElement("div", { style: { font: '500 12px Pretendard', color: '#a6a8ac', marginTop: 6, lineHeight: 1.5 } },
                        "\uB274\uC2A4 \uCE74\uB4DC\uC758 \uBD81\uB9C8\uD06C \uC544\uC774\uCF58\uC744 \uB20C\uB7EC",
                        React.createElement("br", null),
                        "\uB098\uC911\uC5D0 \uBCFC \uAE30\uC0AC\uB97C \uC800\uC7A5\uD558\uC138\uC694"))) : bmItems.map(item => (React.createElement("div", { key: item.id, onClick: () => openItem(item.id), style: { display: 'flex', gap: 11, padding: '14px 18px', borderBottom: '1px solid #f3f1ea', cursor: 'pointer' } },
                    React.createElement("div", { style: { width: 3, borderRadius: 2, background: item.assetColor, flexShrink: 0 } }),
                    React.createElement("div", { style: { flex: 1, minWidth: 0 } },
                        React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 } },
                            React.createElement("span", { style: { font: '700 10.5px Pretendard', color: '#1c1d1f', background: '#f0eee7', padding: '2px 7px', borderRadius: 5 } }, item.inst),
                            React.createElement("span", { style: { font: '600 10.5px Pretendard', color: item.assetColor } }, item.assetLabel),
                            React.createElement("span", { style: { font: '500 10.5px Pretendard', color: '#bcbec2' } }, item.time)),
                        React.createElement("div", { style: { font: '650 14px/1.4 Pretendard' } }, item.ko)),
                    React.createElement("div", { onClick: e => toggleBm(item.id, e), style: { flexShrink: 0, alignSelf: 'flex-start', fontSize: 15, cursor: 'pointer', color: '#1c1d1f', padding: 2 } }, "\u25A3"))))),
                React.createElement(Navbar, { active: "bookmarks", ...navProps }))),
            screen === 'detail' && sel && !isDesktop && (React.createElement(ArticleDetail, { sel: sel, bookmarked: !!bm[sel.id], onToggleBm: (e) => toggleBm(sel.id, e), onShare: (e) => onShare(sel, e), onBack: () => setScreen(prevScreen), showBack: true }))),
        desktopMaster && (React.createElement("div", { style: { flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' } },
            React.createElement(ArticleDetail, { sel: sel, bookmarked: !!(sel && bm[sel.id]), onToggleBm: (e) => sel && toggleBm(sel.id, e), onShare: (e) => onShare(sel, e), showBack: false }))),
        showShare && (React.createElement("div", { onClick: () => setShowShare(false), style: { position: 'absolute', inset: 0, background: 'rgba(20,20,22,.42)', display: 'flex', alignItems: 'flex-end', zIndex: 30 } },
            React.createElement("div", { onClick: e => e.stopPropagation(), style: { width: '100%', background: '#fff', borderRadius: '24px 24px 0 0', padding: '10px 20px 26px' } },
                React.createElement("div", { style: { width: 38, height: 4, borderRadius: 2, background: '#e2dfd6', margin: '0 auto 16px' } }),
                React.createElement("div", { style: { font: '800 16px Pretendard', letterSpacing: '-.01em', marginBottom: 4 } }, "\uACF5\uC720\uD558\uAE30"),
                React.createElement("div", { style: { font: '500 12px Pretendard', color: '#9a9ca0', marginBottom: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, sel && sel.ko),
                React.createElement("div", { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 18 } }, shareTargets.map(t => (React.createElement("div", { key: t.label, onClick: () => copyLink(t.label), style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, cursor: 'pointer', flex: 1 } },
                    React.createElement("div", { style: { width: 50, height: 50, borderRadius: 15, background: t.bg, color: t.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', font: '800 13px Pretendard' } }, t.icon),
                    React.createElement("span", { style: { font: '500 11px Pretendard', color: '#56585c' } }, t.label))))),
                React.createElement("div", { onClick: () => copyLink('링크'), style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f4f2ec', borderRadius: 12, padding: '13px 15px', cursor: 'pointer' } },
                    React.createElement("span", { style: { font: '500 12px Pretendard', color: '#7a7c80', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                        "https://kbgis.app/news/",
                        sel && sel.id),
                    React.createElement("span", { style: { font: '700 12.5px Pretendard', color: '#1c1d1f', background: '#FFCC00', padding: '6px 13px', borderRadius: 8, flexShrink: 0, marginLeft: 10 } }, "\uB9C1\uD06C \uBCF5\uC0AC"))))),
        toast && (React.createElement("div", { style: { position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: 84, background: '#1c1d1f', color: '#fff', font: '600 12.5px Pretendard', padding: '11px 18px', borderRadius: 999, zIndex: 40, boxShadow: '0 8px 24px rgba(0,0,0,.25)', whiteSpace: 'nowrap' } }, toast))));
}
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App, null));
