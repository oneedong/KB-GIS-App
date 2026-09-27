"use strict";
// @ts-nocheck
/*
 * KB GIS — 데일리 시황 화면
 * market.json / briefs/YYYYMMDD.json(일자별) / history.json(5년 추이)을 그린다.
 * 실시간: 지수·환율·원자재는 공개 프록시 경유 Yahoo, 크립토는 거래소 API 직접.
 */
// ─── 실시간 시세 ─────────────────────────────────────────────
const LIVE_YAHOO = ['^KS11', '^KQ11', '^GSPC', '^IXIC', '^DJI', '^N225', 'KRW=X', 'GC=F', 'CL=F'];
async function proxyJson(url) {
    for (const p of CORS_PROXIES) {
        if (p.kind !== 'html')
            continue; // 리더 프록시는 JSON 을 망가뜨린다
        try {
            const r = await fetch(p.mk(url), { cache: 'no-store' });
            if (!r.ok)
                continue;
            const j = JSON.parse(await r.text());
            if (j)
                return j;
        }
        catch { /* 다음 프록시 */ }
    }
    return null;
}
async function liveYahoo(symbol) {
    const j = await proxyJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=5m`);
    const m = ((((j || {}).chart || {}).result || [{}])[0] || {}).meta || {};
    const last = typeof m.regularMarketPrice === 'number' ? m.regularMarketPrice : null;
    const prev = typeof m.chartPreviousClose === 'number' ? m.chartPreviousClose : (typeof m.previousClose === 'number' ? m.previousClose : null);
    if (last == null || !prev)
        return null;
    const k = /JPYKRW/.test(symbol) ? 100 : 1;
    return { last: last * k, chg: (last - prev) * k, chgPct: (last - prev) / prev * 100 };
}
async function liveCrypto() {
    try {
        const r = await fetch('https://api.binance.com/api/v3/ticker/24hr?symbols=%5B%22BTCUSDT%22%2C%22ETHUSDT%22%5D', { cache: 'no-store' });
        if (r.ok) {
            const out = {};
            for (const x of await r.json()) {
                out[x.symbol === 'BTCUSDT' ? 'BTC-USD' : 'ETH-USD'] = { last: parseFloat(x.lastPrice), chg: parseFloat(x.priceChange), chgPct: parseFloat(x.priceChangePercent), src: 'Binance' };
            }
            if (Object.keys(out).length)
                return out;
        }
    }
    catch { /* 코인베이스로 */ }
    const out = {};
    for (const [sym, id] of [['BTC-USD', 'BTC'], ['ETH-USD', 'ETH']]) {
        try {
            const r = await fetch(`https://api.coinbase.com/v2/prices/${id}-USD/spot`, { cache: 'no-store' });
            if (!r.ok)
                continue;
            const v = parseFloat((((await r.json()) || {}).data || {}).amount);
            if (isFinite(v))
                out[sym] = { last: v, chg: null, chgPct: null, src: 'Coinbase' };
        }
        catch { /* 없음 */ }
    }
    return out;
}
// ─── 5년 추이 그래프 (손가락·커서로 일자별 값 확인) ─────────────
function TrendModal({ series, name, unit, onClose }) {
    const [range, setRange] = React.useState('1Y');
    const [hover, setHover] = React.useState(null);
    const svgRef = React.useRef(null);
    const desktop = useDesktop();
    if (!series) {
        return (React.createElement(Sheet, { open: true, onClose: onClose, title: name, wide: true },
            React.createElement(Empty, { compact: true, title: "\uCD94\uC774 \uB370\uC774\uD130\uB97C \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4" })));
    }
    const N = { '1M': 22, '6M': 130, '1Y': 260, '5Y': 100000 }[range];
    const d = series.d.slice(-N), c = series.c.slice(-N);
    const W = 900, H = desktop ? 380 : 440, PL = 70, PR = 16, PT = 20, PB = 38;
    const min = Math.min(...c), max = Math.max(...c), span = (max - min) || 1;
    const x = (i) => PL + (c.length <= 1 ? 0 : (W - PL - PR) * i / (c.length - 1));
    const y = (v) => PT + (H - PT - PB) * (1 - (v - min) / span);
    const path = c.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const area = `${path} L${x(c.length - 1).toFixed(1)},${H - PB} L${x(0).toFixed(1)},${H - PB} Z`;
    const up = c.length > 1 && c[c.length - 1] >= c[0];
    const col = up ? KB.up : KB.down;
    const fmtD = (n) => `${String(n).slice(0, 4)}.${String(n).slice(4, 6)}.${String(n).slice(6, 8)}`;
    const fmtDs = (n) => `${String(n).slice(2, 4)}.${String(n).slice(4, 6)}.${String(n).slice(6, 8)}`;
    const fmtV = (v) => v.toLocaleString('ko-KR', { maximumFractionDigits: Math.abs(v) < 10 ? 3 : 2 });
    const unitTxt = unit === '$' ? ' USD' : (unit || '');
    const chg = c.length > 1 ? (c[c.length - 1] - c[0]) / c[0] * 100 : 0;
    const pick = (e) => {
        const svg = svgRef.current;
        if (!svg)
            return;
        const rect = svg.getBoundingClientRect();
        const cx = (e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX) - rect.left;
        const t = (cx / rect.width * W - PL) / Math.max(1, (W - PL - PR));
        setHover(Math.max(0, Math.min(c.length - 1, Math.round(t * (c.length - 1)))));
    };
    const hi = hover, hv = hi == null ? null : c[hi], hd = hi == null ? null : d[hi];
    const hChg = hi == null || !c[0] ? null : (c[hi] - c[0]) / c[0] * 100;
    const tipX = hi == null ? 0 : Math.min(Math.max(x(hi), PL + 70), W - PR - 70);
    return (React.createElement(Sheet, { open: true, onClose: onClose, title: name, wide: true },
        React.createElement("div", { style: { display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' } },
            React.createElement("span", { style: { font: F(700, 24), color: KB.ink, letterSpacing: '-.02em' } },
                fmtV(hv != null ? hv : c[c.length - 1]),
                React.createElement("span", { style: { font: F(500, 14), color: KB.sub } }, unitTxt)),
            hi == null
                ? React.createElement("span", { style: { font: F(600, 13.5), color: col } },
                    range,
                    " ",
                    chg >= 0 ? '▲' : '▼',
                    " ",
                    Math.abs(chg).toFixed(2),
                    "%")
                : React.createElement("span", { style: { font: F(600, 13.5), color: hChg >= 0 ? KB.up : KB.down } },
                    fmtD(hd),
                    " \u00B7 \uAD6C\uAC04 \uC2DC\uC791 \uB300\uBE44 ",
                    hChg >= 0 ? '+' : '−',
                    Math.abs(hChg).toFixed(2),
                    "%")),
        React.createElement("div", { style: { font: F(500, 12), color: KB.mute, marginTop: 4, minHeight: 16 } }, hi == null ? '그래프를 손가락으로 끌거나 마우스를 올리면 날짜별 값이 표시됩니다' : '손을 떼면 최신 값으로 돌아갑니다'),
        React.createElement("div", { style: { display: 'flex', gap: 6, margin: '12px 0 8px' } }, ['1M', '6M', '1Y', '5Y'].map((r) => React.createElement(Chip, { key: r, active: range === r, onClick: () => { setRange(r); setHover(null); } }, r))),
        React.createElement("svg", { ref: svgRef, viewBox: `0 0 ${W} ${H}`, style: { width: '100%', height: 'auto', display: 'block', touchAction: 'none', cursor: 'crosshair' }, onMouseMove: pick, onMouseLeave: () => setHover(null), onTouchStart: (e) => { e.preventDefault(); pick(e); }, onTouchMove: (e) => { e.preventDefault(); pick(e); }, onTouchEnd: () => setHover(null) },
            React.createElement("defs", null,
                React.createElement("linearGradient", { id: "tmFill", x1: "0", y1: "0", x2: "0", y2: "1" },
                    React.createElement("stop", { offset: "0%", stopColor: col, stopOpacity: "0.12" }),
                    React.createElement("stop", { offset: "100%", stopColor: col, stopOpacity: "0" }))),
            [0, 0.25, 0.5, 0.75, 1].map((f) => {
                const v = min + span * (1 - f), yy = PT + (H - PT - PB) * f;
                return (React.createElement("g", { key: f },
                    React.createElement("line", { x1: PL, y1: yy, x2: W - PR, y2: yy, stroke: KB.line2, strokeWidth: "1.5" }),
                    React.createElement("text", { x: PL - 10, y: yy + 5, textAnchor: "end", fontSize: "14", fill: KB.mute, fontFamily: "Pretendard" }, fmtV(v))));
            }),
            React.createElement("path", { d: area, fill: "url(#tmFill)" }),
            React.createElement("path", { d: path, fill: "none", stroke: col, strokeWidth: "2.4", strokeLinejoin: "round" }),
            hi != null && (React.createElement("g", null,
                React.createElement("line", { x1: x(hi), y1: PT, x2: x(hi), y2: H - PB, stroke: KB.faint, strokeWidth: "1.5", strokeDasharray: "4 4" }),
                React.createElement("circle", { cx: x(hi), cy: y(hv), r: "6.5", fill: "#fff", stroke: col, strokeWidth: "3" }),
                React.createElement("g", { transform: `translate(${tipX - 70}, ${Math.max(PT, y(hv) - 58)})` },
                    React.createElement("rect", { width: "140", height: "46", rx: "8", fill: KB.ink, opacity: "0.92" }),
                    React.createElement("text", { x: "70", y: "19", textAnchor: "middle", fontSize: "13", fill: "#cfd1d6", fontFamily: "Pretendard" }, fmtD(hd)),
                    React.createElement("text", { x: "70", y: "37", textAnchor: "middle", fontSize: "16", fill: "#fff", fontWeight: "700", fontFamily: "Pretendard" }, fmtV(hv))))),
            [0, Math.floor((d.length - 1) / 4), Math.floor((d.length - 1) / 2), Math.floor((d.length - 1) * 3 / 4), d.length - 1].map((i, k) => (React.createElement("text", { key: k, x: x(i), y: H - 12, textAnchor: k === 0 ? 'start' : k === 4 ? 'end' : 'middle', fontSize: "14", fill: KB.mute, fontFamily: "Pretendard" }, fmtDs(d[i]))))),
        React.createElement("div", { style: { font: F(500, 11.5), color: KB.mute, marginTop: 8 } },
            "\uC77C\uBCC4 \uC885\uAC00 \u00B7 \uCD9C\uCC98 Yahoo Finance \u00B7 ",
            d.length,
            "\uAC70\uB798\uC77C")));
}
// ─── 지표 표 (지수·환율·원자재·크립토) ───────────────────────
function MarketTable({ rows, live, onPick, digits }) {
    const list = rows || [];
    if (!list.length)
        return React.createElement(Empty, { compact: true, title: "\uC2DC\uC138\uB97C \uBC1B\uC9C0 \uBABB\uD588\uC74C" });
    return (React.createElement("div", null, list.map((x0, i) => {
        const lv = live && live[x0.symbol];
        const x = lv ? { ...x0, ...lv } : x0;
        const dg = x.unit === '$' ? (x.last != null && x.last < 10 ? 3 : 2) : (digits && !/원|엔/.test(x.unit || '') ? digits : 2);
        return (React.createElement("div", { key: x.name + i, onClick: () => onPick && onPick(x0), style: { display: 'flex', alignItems: 'center', gap: 10, padding: '13px 0', borderTop: i ? `1px solid ${KB.line2}` : 'none', cursor: onPick ? 'pointer' : 'default' } },
            React.createElement("span", { style: { flex: 1, minWidth: 0, font: F(500, 15), color: KB.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } },
                x.name,
                lv && React.createElement("span", { title: "\uC2E4\uC2DC\uAC04", style: { display: 'inline-block', width: 6, height: 6, borderRadius: 3, background: KB.pos, marginLeft: 6, verticalAlign: 'middle' } })),
            React.createElement("span", { style: { font: F(700, 15.5), color: KB.ink, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' } },
                x.unit === '$' ? '$' : '',
                x.last == null ? '–' : x.last.toLocaleString('ko-KR', { minimumFractionDigits: dg, maximumFractionDigits: dg })),
            React.createElement("span", { style: { minWidth: 72, textAlign: 'right' } },
                React.createElement(Delta, { v: x.chgPct }))));
    })));
}
// 금리 한 줄 — 값이 없으면 지어내지 않고 비운다
function RateLine({ label, value, sub, href, first }) {
    const Tag2 = href ? 'a' : 'div';
    return (React.createElement(Tag2, { ...(href ? { href, target: '_blank', rel: 'noopener noreferrer' } : {}), style: { display: 'flex', alignItems: 'center', gap: 10, padding: '13px 0', borderTop: first ? 'none' : `1px solid ${KB.line2}`, textDecoration: 'none', color: 'inherit' } },
        React.createElement("div", { style: { flex: 1, minWidth: 0 } },
            React.createElement("div", { style: { font: F(500, 15), color: KB.ink } }, label),
            sub && React.createElement("div", { style: { font: F(500, 12), color: KB.mute, marginTop: 3 } },
                sub,
                href ? ' ↗' : '')),
        React.createElement("div", { style: { font: F(700, 15.5), color: value ? KB.ink : KB.faint, whiteSpace: 'nowrap' } }, value || '–')));
}
// ─── 환헤지 비용 · 스왑포인트 ────────────────────────────────
function HedgeBlock({ hedge }) {
    const [open, setOpen] = React.useState(false);
    const legs = (hedge && hedge.legs) || [];
    return (React.createElement("div", null,
        React.createElement("div", { onClick: () => setOpen((o) => !o), style: { display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px', background: KB.band, borderRadius: 8, cursor: 'pointer', marginBottom: 12 } },
            React.createElement(Ico, { n: "info", size: 17, color: KB.gray }),
            React.createElement("span", { style: { flex: 1, font: F(600, 13.5), color: KB.ink2 } }, "\uC2A4\uC651\uD3EC\uC778\uD2B8\uB780? \uC65C \uC774\uB7F0 \uAC12\uC774 \uB098\uC624\uB098\uC694"),
            React.createElement("span", { style: { color: KB.mute, transform: open ? 'rotate(180deg)' : 'none' } },
                React.createElement(Ico, { n: "down", size: 17, sw: 2 }))),
        open && (React.createElement("div", { style: { marginBottom: 14 } },
            React.createElement(Diagram, { id: "hedge", compact: true }),
            React.createElement("div", { style: { font: F(400, 13.5, 1.8), color: KB.ink2, marginTop: 10 } },
                "\uD574\uC678 \uB300\uCCB4\uD22C\uC790\uB294 \uB9CC\uAE30\uAC00 \uAE38\uC5B4 3\u00B76\uAC1C\uC6D4 \uC2A4\uC651\uC744 \uACC4\uC18D ",
                React.createElement("b", null, "\uB864\uC624\uBC84"),
                "\uD568. \uADF8\uB798\uC11C \uD5E4\uC9C0 \uBE44\uC6A9\uC740 \uB9E4 \uB864 \uC2DC\uC810\uC758 \uB450 \uD1B5\uD654 \uAE08\uB9AC\uCC28\uC5D0 \uB530\uB77C \uBC14\uB01C. \uC544\uB798 \uAC12\uC740 \uAE08\uB9AC\uD3C9\uD615 \uACF5\uC2DD\uC73C\uB85C \uACC4\uC0B0\uD55C ",
                React.createElement("b", null, "\uC774\uB860\uCE58"),
                "\uC774\uBA70, \uC2E4\uC81C \uC2DC\uC7A5 \uC2A4\uC651\uD3EC\uC778\uD2B8\uB294 \uB2EC\uB7EC \uC218\uAE09\u00B7\uC2E0\uC6A9\uB3C4 \uCC28\uC774(\uBCA0\uC774\uC2DC\uC2A4) \uB54C\uBB38\uC5D0 \uB354 \uBD88\uB9AC\uD558\uAC8C \uD615\uC131\uB418\uB294 \uACBD\uC6B0\uAC00 \uB9CE\uC74C."))),
        legs.length === 0 ? React.createElement(Empty, { compact: true, title: "\uAE08\uB9AC\u00B7\uD658\uC728\uC744 \uBC1B\uC9C0 \uBABB\uD574 \uACC4\uC0B0\uD558\uC9C0 \uBABB\uD588\uC74C" }) : legs.map((leg, li) => (React.createElement("div", { key: leg.ccy, style: { marginTop: li ? 18 : 0 } },
            React.createElement("div", { style: { display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' } },
                React.createElement("span", { style: { font: F(700, 15.5), color: KB.ink } },
                    leg.ccy,
                    "/KRW"),
                React.createElement("span", { style: { font: F(500, 12.5), color: KB.mute } },
                    "\uD604\uBB3C ",
                    leg.spot.toLocaleString('ko-KR', { maximumFractionDigits: 2 }),
                    "\uC6D0"),
                React.createElement("span", { style: { marginLeft: 'auto' } },
                    React.createElement(Tag, { tone: leg.annualPct < 0 ? 'up' : 'down' },
                        "\uC5F0 ",
                        leg.annualPct > 0 ? '+' : '−',
                        Math.abs(leg.annualPct).toFixed(2),
                        "% ",
                        leg.annualPct < 0 ? '비용' : '수취'))),
            React.createElement("div", { style: { font: F(500, 12.5), color: KB.sub, margin: '6px 0 4px' } },
                "\uC6D0\uD654 ",
                leg.krwRate.toFixed(2),
                "% \u2212 ",
                leg.baseLabel,
                " ",
                leg.foreignRate.toFixed(2),
                "% = ",
                leg.diffPct > 0 ? '+' : '−',
                Math.abs(leg.diffPct).toFixed(2),
                "%p"),
            leg.points.map((pt, i) => (React.createElement("div", { key: pt.tenor, style: { display: 'flex', alignItems: 'center', gap: 10, padding: '11px 0', borderTop: `1px solid ${KB.line2}` } },
                React.createElement("span", { style: { font: F(600, 14), color: KB.ink, width: 40 } }, pt.tenor),
                React.createElement("span", { style: { font: F(500, 12.5), color: KB.mute, flex: 1 } },
                    "\uC120\uBB3C ",
                    pt.forward.toLocaleString('ko-KR', { maximumFractionDigits: 2 }),
                    "\uC6D0"),
                React.createElement("span", { style: { font: F(700, 14.5), color: pt.point < 0 ? KB.down : KB.up } },
                    pt.point > 0 ? '+' : '−',
                    Math.abs(pt.point).toFixed(2),
                    "\uC6D0")))))))));
}
// ─── 핵심 헤드라인 ───────────────────────────────────────────
// 수집한 시황 기사 중 '시장을 움직인 재료'가 담긴 제목을 앞세운다:
// 방향(급등·급락·반등…) + 원인(금리·관세·실적·반도체·유가…)이 함께 있으면 높은 점수.
const HL_MOVE = /급등|급락|폭락|폭등|반등|하락|상승|약세|강세|랠리|쇼크|패닉|최고치|최저치|사상\s*최|출렁|흔들|되돌림|숨고르기/;
const HL_CAUSE = /관세|금리|연준|Fed|FOMC|파월|CPI|물가|인플레|고용|실업|실적|반도체|AI|엔비디아|테슬라|애플|빅테크|유가|원유|전쟁|지정학|중동|중국|엔화|환율|국채|트럼프|경기|침체|셧다운|딥시크|수출|외국인|기관|매도|매수|금통위|한은|ECB|BOJ/;
function marketHeadlines(issues) {
    const seen = new Set();
    return (issues || []).map((it, i) => {
        const t = String(it.title || '');
        let sc = 0;
        if (HL_MOVE.test(t))
            sc += 3;
        if (HL_CAUSE.test(t))
            sc += 3;
        if (/[…,·]|에\s|로\s/.test(t))
            sc += 1; // "~에 급락", "…반도체 강세" 식 인과 표현
        if (/^\[?(?:코스피|코스닥|뉴욕증시|환율)\]?\s*마감$|^\S+\s+마감\s*$/.test(t))
            sc -= 3; // 숫자만 전하는 마감 기사
        return { ...it, sc, i };
    }).filter((x) => {
        const k = x.title.replace(/[^가-힣A-Za-z0-9]/g, '').slice(0, 14);
        if (seen.has(k))
            return false;
        seen.add(k);
        return true;
    }).sort((a, b) => b.sc - a.sc || a.i - b.i);
}
// ─── 달력(일자별 시황) ───────────────────────────────────────
const dk2d = (k) => new Date(Date.UTC(+k.slice(0, 4), +k.slice(4, 6) - 1, +k.slice(6, 8)));
function BriefCalendar({ keys, value, onPick }) {
    const has = new Set(keys);
    const cur = value || keys[0] || '';
    const [ym, setYm] = React.useState(() => (cur ? [+cur.slice(0, 4), +cur.slice(4, 6)] : [2026, 1]));
    const [y, m] = ym;
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
    const key = (d) => `${y}${pad2(m)}${pad2(d)}`;
    const move = (dm) => { const t = new Date(Date.UTC(y, m - 1 + dm, 1)); setYm([t.getUTCFullYear(), t.getUTCMonth() + 1]); };
    const monthHas = keys.some((k) => k.startsWith(`${y}${pad2(m)}`));
    return (React.createElement("div", { style: { padding: '6px 4px 4px' } },
        React.createElement("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, marginBottom: 10 } },
            React.createElement("span", { onClick: () => move(-1), style: { cursor: 'pointer', color: KB.sub, transform: 'scaleX(-1)' } },
                React.createElement(Ico, { n: "chevron", size: 20, sw: 2 })),
            React.createElement("span", { style: { font: F(700, 16), color: KB.ink, minWidth: 110, textAlign: 'center' } },
                y,
                "\uB144 ",
                m,
                "\uC6D4"),
            React.createElement("span", { onClick: () => move(1), style: { cursor: 'pointer', color: KB.sub } },
                React.createElement(Ico, { n: "chevron", size: 20, sw: 2 }))),
        React.createElement("div", { style: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', rowGap: 4, textAlign: 'center' } },
            ['일', '월', '화', '수', '목', '금', '토'].map((w, i) => React.createElement("div", { key: w, style: { font: F(600, 12), color: i === 0 ? KB.up : i === 6 ? KB.down : KB.mute, padding: '4px 0' } }, w)),
            cells.map((d, i) => {
                if (!d)
                    return React.createElement("div", { key: 'e' + i });
                const k = key(d), ok = has.has(k), on = k === cur;
                return (React.createElement("div", { key: k, onClick: () => ok && onPick(k), style: { height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: ok ? 'pointer' : 'default' } },
                    React.createElement("span", { style: { width: 36, height: 36, borderRadius: 18, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: on ? KB.ink : 'transparent', color: on ? '#fff' : ok ? KB.ink : KB.faint, font: ok ? F(700, 14) : F(400, 14), position: 'relative' } },
                        d,
                        ok && !on && React.createElement("span", { style: { position: 'absolute', bottom: 4, width: 4, height: 4, borderRadius: 2, background: KB.yellow } }))));
            })),
        !monthHas && React.createElement("div", { style: { font: F(500, 12.5), color: KB.mute, textAlign: 'center', marginTop: 8 } }, "\uC774 \uB2EC\uC5D0\uB294 \uC800\uC7A5\uB41C \uC2DC\uD669\uC774 \uC5C6\uC2B5\uB2C8\uB2E4"),
        React.createElement("div", { style: { font: F(500, 12), color: KB.mute, textAlign: 'center', marginTop: 8 } }, "\uB178\uB780 \uC810\uC774 \uC788\uB294 \uB0A0\uC9DC\uB97C \uB204\uB974\uBA74 \uADF8\uB0A0 \uC2DC\uD669\uC744 \uBCFC \uC218 \uC788\uC2B5\uB2C8\uB2E4")));
}
// ─── 시황 화면 ───────────────────────────────────────────────
function BriefScreen({ b, market, briefIndex, onSelectDate, live, liveAt, liveBusy, onRefreshLive, onPick }) {
    const desktop = useDesktop();
    const [cal, setCal] = React.useState(false);
    const isLatest = !!(b && market && b.dateKey === market.dateKey);
    const heads = marketHeadlines(b && b.issues);
    const top = heads[0], points = heads.slice(1, 5), rest = heads.slice(5);
    const lv = isLatest ? live : null;
    const grid = desktop ? { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px', alignItems: 'start' } : {};
    const col = (children) => React.createElement("div", { style: { minWidth: 0 } }, children);
    const rateGroups = Object.entries(((b && b.tenorRates) || []).reduce((m, r) => { (m[r.group] = m[r.group] || []).push(r); return m; }, {}));
    return (React.createElement("div", { style: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: desktop ? KB.band : KB.bg } },
        React.createElement(TopBar, { big: true, title: b && b.dateKey ? `${b.dateKey} 시황` : '데일리 시황', sub: b ? `${b.asOf} 기준 · 매일 08:00 갱신` : '브리핑을 불러오는 중입니다', right: isLatest && (React.createElement("div", { onClick: onRefreshLive, style: { display: 'flex', alignItems: 'center', gap: 5, height: 32, padding: '0 11px', borderRadius: 16, border: `1px solid ${KB.line}`, cursor: 'pointer', font: F(600, 12.5), color: liveAt ? KB.pos : KB.sub } },
                liveAt && React.createElement("span", { style: { width: 6, height: 6, borderRadius: 3, background: KB.pos } }),
                liveBusy ? '조회 중…' : liveAt ? `실시간 ${liveAt}` : '실시간 조회')) }),
        briefIndex && briefIndex.length > 0 && (React.createElement("div", { style: { flexShrink: 0, background: KB.bg, borderBottom: `1px solid ${KB.line}` } },
            React.createElement("div", { onClick: () => setCal((c) => !c), style: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', cursor: 'pointer' } },
                React.createElement(Ico, { n: "calendar", size: 19, color: KB.gray }),
                React.createElement("span", { style: { font: F(700, 14.5), color: KB.ink } }, b && b.dateKey ? `${b.dateKey.slice(0, 4)}.${b.dateKey.slice(4, 6)}.${b.dateKey.slice(6, 8)} (${['일', '월', '화', '수', '목', '금', '토'][dk2d(b.dateKey).getUTCDay()]})` : '날짜 선택'),
                React.createElement("span", { style: { font: F(500, 12.5), color: KB.mute } },
                    briefIndex.length,
                    "\uC77C\uCE58 \uC800\uC7A5"),
                React.createElement("span", { style: { marginLeft: 'auto', font: F(600, 13), color: KB.sub, display: 'flex', alignItems: 'center', gap: 3 } },
                    "\uB2EC\uB825",
                    React.createElement("span", { style: { transform: cal ? 'rotate(180deg)' : 'none', display: 'flex' } },
                        React.createElement(Ico, { n: "down", size: 16, sw: 2 })))),
            cal && (React.createElement("div", { style: { maxWidth: 420, margin: '0 auto', padding: '0 16px 12px' } },
                React.createElement(BriefCalendar, { keys: briefIndex.map((x) => x.dateKey), value: b && b.dateKey, onPick: (k) => { onSelectDate(k); setCal(false); } }))))),
        React.createElement("div", { style: { flex: 1, minHeight: 0, overflowY: 'auto' } },
            React.createElement("div", { style: { maxWidth: desktop ? 1120 : 'none', margin: '0 auto', padding: desktop ? '20px 24px 40px' : 0 } }, !b ? React.createElement(Empty, { title: "\uC544\uC9C1 \uBE0C\uB9AC\uD551\uC774 \uC5C6\uC2B5\uB2C8\uB2E4", desc: "\uB9E4\uC77C \uC544\uCE68 08\uC2DC(KST)\uC5D0 \uC804\uC77C \uC2DC\uC7A5\uC744 \uC815\uB9AC\uD574 \uC62C\uB9BD\uB2C8\uB2E4." }) : (React.createElement(React.Fragment, null,
                React.createElement(Section, { first: true, title: "\uD55C\uC904 \uC694\uC57D", sub: "\uC2DC\uC7A5\uC744 \uC6C0\uC9C1\uC778 \uD575\uC2EC \uB274\uC2A4" },
                    top ? (React.createElement("a", { href: top.url, target: "_blank", rel: "noopener noreferrer", style: { display: 'block', textDecoration: 'none', padding: '14px 16px', background: KB.yellowTint, borderRadius: 10, borderLeft: `4px solid ${KB.yellow}` } },
                        React.createElement("div", { style: { font: F(700, 17, 1.5), color: KB.ink, wordBreak: 'keep-all' } }, top.title),
                        React.createElement("div", { style: { font: F(500, 12.5), color: KB.sub, marginTop: 6 } }, top.source))) : React.createElement("div", { style: { font: F(500, 15.5, 1.75), color: KB.ink, padding: '14px 16px', background: KB.yellowTint, borderRadius: 10, borderLeft: `4px solid ${KB.yellow}` } }, b.summary),
                    React.createElement("div", { style: { font: F(700, 13.5), color: KB.ink, margin: '18px 0 4px' } }, "\uAD00\uCC30 \uD3EC\uC778\uD2B8"),
                    points.length ? points.map((w, i) => (React.createElement("a", { key: i, href: w.url, target: "_blank", rel: "noopener noreferrer", style: { display: 'flex', gap: 10, textDecoration: 'none', padding: '10px 0', borderTop: i ? `1px solid ${KB.line2}` : 'none' } },
                        React.createElement("span", { style: { width: 5, height: 5, borderRadius: 3, background: KB.gray, marginTop: 10, flexShrink: 0 } }),
                        React.createElement("span", { style: { flex: 1 } },
                            React.createElement("span", { style: { display: 'block', font: F(600, 15, 1.55), color: KB.ink, wordBreak: 'keep-all' } }, w.title),
                            React.createElement("span", { style: { display: 'block', font: F(500, 12), color: KB.mute, marginTop: 3 } }, w.source))))) : (b.watch && b.watch.length ? b.watch.map((w, i) => React.createElement("div", { key: i, style: { font: F(400, 14, 1.7), color: KB.ink2, padding: '3px 0' } },
                        "\u00B7 ",
                        w)) : React.createElement("div", { style: { font: F(400, 13.5), color: KB.mute } }, "\uC218\uC9D1\uB41C \uD575\uC2EC \uB274\uC2A4\uAC00 \uC5C6\uC74C"))),
                React.createElement("div", { style: grid },
                    col(React.createElement(React.Fragment, null,
                        React.createElement(Section, { title: "\uAD6D\uB0B4\uC99D\uC2DC", sub: "\uB204\uB974\uBA74 5\uB144 \uCD94\uC774" },
                            React.createElement(MarketTable, { rows: b.kr, live: lv, onPick: onPick })),
                        React.createElement(Section, { title: "\uD574\uC678\uC99D\uC2DC" },
                            React.createElement(MarketTable, { rows: b.global, live: lv, onPick: onPick })),
                        React.createElement(Section, { title: "\uD658\uC728" },
                            React.createElement(MarketTable, { rows: b.fx, live: lv, onPick: onPick, digits: 4 })),
                        React.createElement(Section, { title: "\uC6D0\uC790\uC7AC", sub: "USD" },
                            React.createElement(MarketTable, { rows: b.commodity, live: lv, onPick: onPick })),
                        React.createElement(Section, { title: "\uD06C\uB9BD\uD1A0", sub: "USD \u00B7 \uC2E4\uC2DC\uAC04" },
                            React.createElement(MarketTable, { rows: b.crypto, live: lv, onPick: onPick })))),
                    col(React.createElement(React.Fragment, null,
                        React.createElement(Section, { title: "\uAE30\uC900\uAE08\uB9AC" },
                            React.createElement(RateLine, { first: true, label: "\uD55C\uAD6D (\uD55C\uAD6D\uC740\uD589)", value: b.rates && b.rates.kr && b.rates.kr.rate != null ? `${b.rates.kr.rate.toFixed(2)}%` : '', sub: b.rates && b.rates.kr ? `${b.rates.kr.asOf || ''} · ${b.rates.kr.src || '한국은행'}` : '이번 회차 수집 실패', href: b.rates && b.rates.kr && b.rates.kr.url }),
                            React.createElement(RateLine, { label: "\uBBF8\uAD6D (FOMC \uBAA9\uD45C\uBC94\uC704)", value: b.rates && b.rates.us ? (b.rates.us.target || `${(b.rates.us.effr || 0).toFixed(2)}%`) : '', sub: b.rates && b.rates.us ? `EFFR ${b.rates.us.effr != null ? b.rates.us.effr.toFixed(2) + '%' : '–'} · ${b.rates.us.asOf || ''} · New York Fed` : '이번 회차 수집 실패' }),
                            b.ust && b.ust[0] && b.ust[0].last != null && (React.createElement("div", { onClick: () => onPick(b.ust[0]), style: { cursor: 'pointer' } },
                                React.createElement(RateLine, { label: b.ust[0].name, value: `${b.ust[0].last.toFixed(2)}%`, sub: `전일 대비 ${b.ust[0].chg >= 0 ? '+' : '−'}${Math.abs(b.ust[0].chg * 100).toFixed(0)}bp · 누르면 5년 추이` })))),
                        React.createElement(Section, { title: "SOFR \u00B7 SONIA \u00B7 EURIBOR \u00B7 TONA", sub: "\uC2E4\uBB34 \uC8FC\uC694 \uD14C\uB108" }, rateGroups.length ? rateGroups.map(([g, rows], gi) => (React.createElement("div", { key: g, style: { marginTop: gi ? 14 : 0 } },
                            React.createElement("div", { style: { display: 'flex', alignItems: 'baseline', font: F(700, 13.5), color: KB.gray, paddingBottom: 6, borderBottom: `1px solid ${KB.line}` } },
                                React.createElement("span", null, g),
                                React.createElement("span", { style: { marginLeft: 'auto', font: F(500, 11.5), color: KB.mute } }, rows[0].src)),
                            rows.map((r, i) => (React.createElement("div", { key: r.tenor + i, style: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: i ? `1px solid ${KB.line2}` : 'none' } },
                                React.createElement("span", { style: { flex: 1, font: F(500, 14.5), color: KB.ink } }, r.tenor),
                                React.createElement("span", { style: { font: F(700, 15), color: KB.ink } },
                                    r.rate.toFixed(3),
                                    "%"),
                                React.createElement("span", { style: { font: F(500, 11.5), color: KB.mute, minWidth: 78, textAlign: 'right' } }, r.asOf))))))) : React.createElement(Empty, { compact: true, title: "\uAE08\uB9AC \uB370\uC774\uD130\uB97C \uBC1B\uC9C0 \uBABB\uD588\uC74C" })),
                        React.createElement(Section, { title: "\uD658\uD5E4\uC9C0 \uBE44\uC6A9 \u00B7 \uC2A4\uC651\uD3EC\uC778\uD2B8" },
                            React.createElement(HedgeBlock, { hedge: b.hedge }))))),
                React.createElement(Section, { title: "\uADF8 \uBC16\uC758 \uC2DC\uD669 \uB274\uC2A4" },
                    rest.length ? (React.createElement("div", { style: desktop ? { display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 24 } : {} }, rest.map((it, i) => (React.createElement("a", { key: i, href: it.url, target: "_blank", rel: "noopener noreferrer", style: { display: 'block', textDecoration: 'none', color: 'inherit', padding: '13px 0', borderTop: `1px solid ${KB.line2}` } },
                        React.createElement("div", { style: { font: F(500, 14.5, 1.5), color: KB.ink } }, it.title),
                        React.createElement("div", { style: { font: F(500, 12), color: KB.mute, marginTop: 5 } }, it.source)))))) : React.createElement("div", { style: { font: F(400, 13.5), color: KB.mute } }, "\uC704 \uD575\uC2EC \uB274\uC2A4 \uC678 \uCD94\uAC00 \uAE30\uC0AC \uC5C6\uC74C"),
                    (b.errors && b.errors.length > 0) && React.createElement("div", { style: { font: F(500, 12, 1.6), color: KB.mute, marginTop: 12 } },
                        "\u203B \uBC1B\uC9C0 \uBABB\uD55C \uD56D\uBAA9 ",
                        b.errors.length,
                        "\uAC74 \u2014 \uAC12\uC744 \uCD94\uC815\uD558\uC9C0 \uC54A\uACE0 \uBE44\uC6CC \uB480\uC74C"),
                    React.createElement("div", { style: { font: F(400, 12, 1.8), color: KB.mute, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${KB.line}` } }, "\uCD9C\uCC98 \u00B7 \uC9C0\uC218\u00B7\uD658\uC728\u00B7\uC6D0\uC790\uC7AC\u00B7\uCD94\uC774 Yahoo Finance(\uD3F4\uBC31 Stooq) \u00B7 \uD06C\uB9BD\uD1A0 Binance(\uD3F4\uBC31 Coinbase) \u00B7 SOFR/EFFR\u00B7FOMC New York Fed \u00B7 SONIA\u00B7\uC601\uAD6D \uC815\uCC45\uAE08\uB9AC Bank of England \u00B7 \u20ACSTR ECB \u00B7 EURIBOR \uC77C\uBCC4 \uACF5\uD45C \u00B7 TONA \uC77C\uBCF8\uC740\uD589 \u00B7 \uD55C\uAD6D \uAE30\uC900\uAE08\uB9AC \uD55C\uAD6D\uC740\uD589 \u00B7 \uB274\uC2A4 \uAD6C\uAE00 \uB274\uC2A4 \u00B7 \uD658\uD5E4\uC9C0\uB294 \uC704 \uAE08\uB9AC\uB85C \uAE08\uB9AC\uD3C9\uD615 \uACC4\uC0B0"))))))));
}
// 홈 상단 요약 카드 — 오늘의 시황 한눈에
function BriefDigest({ market, onOpen }) {
    if (!market || !Array.isArray(market.kr))
        return null;
    const pickRow = (list, name) => (list || []).find((x) => x.name === name);
    const rows = [pickRow(market.kr, '코스피'), pickRow(market.global, 'S&P 500'), pickRow(market.global, '나스닥'), pickRow(market.fx, '달러/원')].filter(Boolean);
    return (React.createElement("div", { onClick: onOpen, style: { margin: '14px 16px 4px', padding: '14px 16px', borderRadius: 12, border: `1px solid ${KB.line}`, background: KB.bg, cursor: 'pointer' } },
        React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 6 } },
            React.createElement("span", { style: { font: F(700, 14.5), color: KB.ink } }, "\uC624\uB298\uC758 \uC2DC\uD669"),
            React.createElement("span", { style: { font: F(500, 12), color: KB.mute } }, market.dateKey),
            React.createElement("span", { style: { marginLeft: 'auto', color: KB.faint } },
                React.createElement(Ico, { n: "chevron", size: 17, sw: 2 }))),
        React.createElement("div", { style: { font: F(600, 14.5, 1.5), color: KB.ink, marginTop: 6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } }, (marketHeadlines(market.issues)[0] || {}).title || market.summary),
        React.createElement("div", { style: { display: 'grid', gridTemplateColumns: `repeat(${rows.length}, 1fr)`, gap: 8, marginTop: 10 } }, rows.map((r) => (React.createElement("div", { key: r.name, style: { minWidth: 0 } },
            React.createElement("div", { style: { font: F(500, 11.5), color: KB.mute, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, r.name),
            React.createElement("div", { style: { font: F(700, 13.5), color: KB.ink, marginTop: 2 } }, r.last == null ? '–' : r.last.toLocaleString('ko-KR', { maximumFractionDigits: 2 })),
            React.createElement(Delta, { v: r.chgPct, size: 11.5 })))))));
}
