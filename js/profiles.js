"use strict";
// @ts-nocheck
/*
 * KB GIS — 기관 프로필(국내 LP·해외 GP)과 투자내역
 *
 * 프로필은 두 층으로 이뤄진다.
 *   - 기준 정보: lp-profiles.json / gp-profiles.json / allocations.json (공시·연차보고서 기준, 기준일 표기)
 *   - 수시 갱신: investments.json(투자내역) · insights.json(CIO·실무 인사·AUM·지방이전·수익률) · news.json(기사)
 *     — 3시간마다 수집기가 기사에서 뽑아 갱신한다. 모든 항목은 근거 기사 링크를 함께 둔다.
 */
// ─── 투자내역 한 줄 ──────────────────────────────────────────
function DealRow({ c, onOpen, showInst, onInst, first, compact }) {
    const e = c.lead;
    const pending = e.status && e.status !== '확정';
    if (compact) {
        // 홈 카드용 두 줄 요약: [행위] 기관 금액 · 날짜 / 제목 한 줄
        return (React.createElement("div", { onClick: () => onOpen && onOpen(e), style: { padding: '12px 0', borderTop: first ? 'none' : `1px solid ${KB.line2}`, cursor: 'pointer' } },
            React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 } },
                React.createElement(Tag, { tone: /출자|결성|선정|출자사업/.test(e.kind) ? 'yellow' : 'base' }, e.kind),
                React.createElement("span", { style: { font: F(700, 14.5), color: KB.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, e.inst),
                e.amount && React.createElement("span", { style: { font: F(700, 14), color: KB.gray, whiteSpace: 'nowrap' } }, e.amount),
                pending && React.createElement("span", { style: { font: F(500, 12), color: KB.mute, whiteSpace: 'nowrap' } }, e.status),
                React.createElement("span", { style: { marginLeft: 'auto', font: F(500, 12), color: KB.mute, whiteSpace: 'nowrap', paddingLeft: 6 } }, shortWhen(e))),
            React.createElement("div", { style: { font: F(500, 14, 1.45), color: KB.ink2, marginTop: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, e.title)));
    }
    return (React.createElement("div", { onClick: () => onOpen && onOpen(e), style: { padding: '14px 0', borderTop: first ? 'none' : `1px solid ${KB.line2}`, cursor: onOpen ? 'pointer' : 'default' } },
        React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' } },
            React.createElement(Tag, { tone: /출자|결성|선정|출자사업/.test(e.kind) ? 'yellow' : 'base' }, e.kind),
            pending && React.createElement(Tag, { tone: "outline" }, e.status),
            c.overseas && React.createElement("span", { style: { font: F(500, 12), color: KB.mute } }, "\uD574\uC678"),
            React.createElement("span", { style: { marginLeft: 'auto', font: F(500, 12), color: KB.mute } }, shortWhen(e))),
        (showInst || e.amount) && (React.createElement("div", { style: { display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8, flexWrap: 'wrap' } },
            showInst && (React.createElement("span", { onClick: (ev) => { if (onInst) {
                    ev.stopPropagation();
                    onInst(e);
                } }, style: { font: F(700, 15), color: KB.ink, textDecoration: onInst ? 'underline' : 'none', textDecorationColor: KB.line, textUnderlineOffset: 3 } }, e.inst)),
            e.amount && React.createElement("span", { style: { font: F(700, 15), color: KB.gray } }, e.amount),
            e.counterpart && React.createElement("span", { style: { font: F(500, 13), color: KB.sub } },
                e.role === 'LP' ? '운용사 ' : 'LP ',
                e.counterpart))),
        React.createElement("div", { style: { font: F(500, 14.5, 1.5), color: KB.ink2, marginTop: 6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } }, e.title),
        React.createElement("div", { style: { font: F(500, 12), color: KB.mute, marginTop: 5 } },
            e.source,
            c.items.length > 1 ? ` 외 ${c.items.length - 1}건 보도` : '')));
}
// ─── 투자내역 목록(필터 포함) ─────────────────────────────────
// events: investments.json 의 항목 배열(최신순). grouped: 'date' | 'inst'
function DealList({ events, onOpen, onInst, showInst, limit, emptyTitle, emptyDesc, defaultOverseas = false, grouped }) {
    const [ov, setOv] = React.useState(defaultOverseas);
    const [fk, setFk] = React.useState('all');
    const [more, setMore] = React.useState(false);
    const base = events || [];
    const filt = DEAL_FILTERS.find((f) => f[0] === fk);
    const list = base.filter((e) => (!ov || e.overseas) && (!filt[2] || filt[2].test(e.kind)));
    const clusters = clusterDeals(list);
    const counts = DEAL_FILTERS.map(([k, , re]) => [k, base.filter((e) => (!ov || e.overseas) && (!re || re.test(e.kind))).length]);
    const shown = limit && !more ? clusters.slice(0, limit) : clusters;
    const ovCount = base.filter((e) => e.overseas).length;
    let body;
    if (!clusters.length) {
        body = React.createElement(Empty, { compact: true, icon: "briefcase", title: emptyTitle || '해당하는 투자내역이 없습니다', desc: emptyDesc });
    }
    else if (grouped === 'inst') {
        const by = {};
        clusters.forEach((c) => { (by[c.inst] = by[c.inst] || []).push(c); });
        const insts = Object.keys(by).sort((a, b) => by[b].length - by[a].length || a.localeCompare(b));
        body = insts.map((name, i) => (React.createElement("div", { key: name, style: { marginTop: i ? 22 : 4 } },
            React.createElement("div", { onClick: () => onInst && onInst(by[name][0].lead), style: { display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 8, borderBottom: `2px solid ${KB.ink}`, cursor: onInst ? 'pointer' : 'default' } },
                React.createElement("span", { style: { font: F(700, 16), color: KB.ink } }, name),
                React.createElement(Tag, { tone: by[name][0].role === 'GP' ? 'dark' : 'yellow' }, by[name][0].role === 'GP' ? '해외 GP' : '국내 LP'),
                React.createElement("span", { style: { marginLeft: 'auto', font: F(600, 12.5), color: KB.sub } },
                    by[name].length,
                    "\uAC74"),
                onInst && React.createElement("span", { style: { color: KB.faint } },
                    React.createElement(Ico, { n: "chevron", size: 16, sw: 2 }))),
            by[name].slice(0, 4).map((c, j) => React.createElement(DealRow, { key: c.key + j, c: c, first: j === 0, onOpen: onOpen })),
            by[name].length > 4 && React.createElement("div", { onClick: () => onInst && onInst(by[name][0].lead), style: { font: F(600, 13), color: KB.sub, padding: '10px 0 0', cursor: 'pointer' } },
                name,
                " \uD22C\uC790\uB0B4\uC5ED ",
                by[name].length,
                "\uAC74 \uBAA8\uB450 \uBCF4\uAE30"))));
    }
    else if (grouped === 'date') {
        let last = '';
        body = shown.map((c, i) => {
            const lb = dayLabel(c.ms);
            const head = lb !== last ? React.createElement("div", { key: 'h' + i, style: { font: F(700, 13), color: KB.sub, padding: i ? '18px 0 2px' : '4px 0 2px' } }, lb) : null;
            last = lb;
            return React.createElement(React.Fragment, { key: c.key + i },
                head,
                React.createElement(DealRow, { c: c, first: !!head, onOpen: onOpen, onInst: onInst, showInst: showInst }));
        });
    }
    else {
        body = shown.map((c, i) => React.createElement(DealRow, { key: c.key + i, c: c, first: i === 0, onOpen: onOpen, onInst: onInst, showInst: showInst }));
    }
    return (React.createElement("div", null,
        React.createElement("div", { style: { display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 12 } },
            React.createElement(Chip, { active: ov, onClick: () => setOv((v) => !v), count: ovCount }, "\uD574\uC678\uB9CC"),
            React.createElement("span", { style: { width: 1, background: KB.line, margin: '6px 2px', flexShrink: 0 } }),
            DEAL_FILTERS.map(([k, label], i) => (counts[i][1] > 0 || k === 'all') && React.createElement(Chip, { key: k, active: fk === k, onClick: () => setFk(k), count: counts[i][1] }, label))),
        body,
        limit && !more && clusters.length > limit && grouped !== 'inst' && (React.createElement("div", { onClick: () => setMore(true), style: { textAlign: 'center', padding: '14px 0 2px', font: F(600, 13.5), color: KB.sub, cursor: 'pointer', borderTop: `1px solid ${KB.line2}` } },
            clusters.length - limit,
            "\uAC74 \uB354 \uBCF4\uAE30"))));
}
// ─── 기사 한 줄(프로필 안) ────────────────────────────────────
function MiniArticle({ a, onOpen, first }) {
    return (React.createElement("div", { onClick: () => onOpen(a.id), style: { padding: '13px 0', borderTop: first ? 'none' : `1px solid ${KB.line2}`, cursor: 'pointer' } },
        React.createElement("div", { style: { font: F(500, 14.5, 1.5), color: KB.ink } }, a.ko),
        React.createElement("div", { style: { font: F(500, 12), color: KB.mute, marginTop: 5 } },
            a.source,
            " \u00B7 ",
            shortWhen(a),
            a.cat === '인사' ? ' · 인사' : a.cat === '이전' ? ' · 지방이전' : '')));
}
// 최근 동향 요약 — 기사 수·자산군 분포·최신 기사
function RecentActivity({ articles, onOpen }) {
    const now = Date.now();
    const n30 = articles.filter((a) => now - itemMs(a) < 30 * 86400000).length;
    const mix = {};
    articles.forEach((a) => { mix[a.asset] = (mix[a.asset] || 0) + 1; });
    const mixList = Object.entries(mix).sort((a, b) => b[1] - a[1]);
    if (!articles.length)
        return React.createElement(Empty, { compact: true, icon: "clock", title: "\uCD5C\uADFC 3\uAC1C\uC6D4 \uAE30\uC0AC \uC5C6\uC74C", desc: "\uC0C8 \uAE30\uC0AC\uAC00 \uC218\uC9D1\uB418\uBA74 \uC790\uB3D9\uC73C\uB85C \uBC18\uC601\uB429\uB2C8\uB2E4." });
    return (React.createElement("div", null,
        React.createElement("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 } },
            React.createElement(Metric, { label: "\uCD5C\uADFC 30\uC77C \uAE30\uC0AC", value: `${n30}건` }),
            React.createElement(Metric, { label: "\uCD5C\uADFC 3\uAC1C\uC6D4 \uAE30\uC0AC", value: `${articles.length}건` })),
        mixList.length > 0 && (React.createElement("div", { style: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 } }, mixList.map(([k, c]) => React.createElement(Tag, { key: k, tone: "outline" },
            (ASSET[k] && ASSET[k].label) || k,
            " ",
            c))))));
}
// 연도별 대체투자 비중 추이
function AltTrend({ trend }) {
    if (!trend || trend.length < 2)
        return null;
    const W = 340, H = 150, L = 34, R = 12, TP = 16, B = 26;
    const v = trend.map((t) => t.altPct);
    const lo = Math.floor(Math.min(...v) / 5) * 5, hi = Math.ceil(Math.max(...v) / 5) * 5, span = Math.max(hi - lo, 5);
    const x = (i) => L + i * (W - L - R) / (trend.length - 1);
    const y = (p) => TP + (1 - (p - lo) / span) * (H - TP - B);
    const pts = trend.map((t, i) => `${x(i)},${y(t.altPct)}`).join(' ');
    return (React.createElement("svg", { viewBox: `0 0 ${W} ${H}`, style: { width: '100%', height: 'auto', display: 'block' } },
        [lo, lo + span / 2, hi].map((g, i) => (React.createElement("g", { key: i },
            React.createElement("line", { x1: L, y1: y(g), x2: W - R, y2: y(g), stroke: KB.line2, strokeWidth: "1" }),
            React.createElement("text", { x: L - 6, y: y(g) + 4, textAnchor: "end", fontSize: "11", fill: KB.mute, fontFamily: "Pretendard" },
                Math.round(g),
                "%")))),
        React.createElement("polyline", { points: pts, fill: "none", stroke: KB.gray, strokeWidth: "2.2", strokeLinejoin: "round" }),
        trend.map((t, i) => (React.createElement("g", { key: i },
            React.createElement("circle", { cx: x(i), cy: y(t.altPct), r: "4", fill: i === trend.length - 1 ? KB.yellow : '#fff', stroke: KB.gray, strokeWidth: "2" }),
            React.createElement("text", { x: x(i), y: y(t.altPct) - 9, textAnchor: "middle", fontSize: "11", fontWeight: "600", fill: KB.ink, fontFamily: "Pretendard" }, t.altPct),
            React.createElement("text", { x: x(i), y: H - 7, textAnchor: "middle", fontSize: "11", fill: KB.mute, fontFamily: "Pretendard" }, t.year))))));
}
// 링크 줄(외부 기사) — 근거 기사로 이동
const ExtLink = ({ href, children, first }) => {
    const ok = href && /^https?:\/\//.test(href);
    return (React.createElement("a", { href: ok ? href : undefined, target: "_blank", rel: "noopener noreferrer", style: { display: 'block', textDecoration: 'none', color: 'inherit', padding: '13px 0', borderTop: first ? 'none' : `1px solid ${KB.line2}` } }, children));
};
// 프로필 머리
function ProfileHead({ kicker, name, sub, tags, meta, updated }) {
    return (React.createElement("div", { style: { padding: '20px 20px 18px', background: KB.bg } },
        React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' } }, kicker),
        React.createElement("div", { style: { font: F(700, 25, 1.3), color: KB.ink, letterSpacing: '-.03em', marginTop: 10 } }, name),
        sub && React.createElement("div", { style: { font: F(500, 13.5), color: KB.mute, marginTop: 4 } }, sub),
        meta && React.createElement("div", { style: { font: F(500, 13), color: KB.sub, marginTop: 8 } }, meta),
        tags && tags.length > 0 && (React.createElement("div", { style: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 } }, tags.map((t) => React.createElement(Tag, { key: t, tone: "outline" }, t)))),
        updated && React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 5, font: F(500, 12), color: KB.mute, marginTop: 14 } },
            React.createElement(Ico, { n: "refresh", size: 14, sw: 1.8 }),
            updated)));
}
function ProfileFrame({ backLabel, onBack, title, children }) {
    const desktop = useDesktop();
    return (React.createElement("div", { style: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: desktop ? KB.band : KB.bg } },
        React.createElement(TopBar, { onBack: onBack, backLabel: backLabel, title: desktop ? title : '' }),
        React.createElement("div", { style: { flex: 1, minHeight: 0, overflowY: 'auto' } },
            React.createElement("div", { style: { maxWidth: desktop ? 880 : 'none', margin: '0 auto', padding: desktop ? '20px 24px 48px' : '0 0 32px' } }, children))));
}
// ─── 국내 LP 프로필 ──────────────────────────────────────────
function LpProfile({ name, group, profile, alloc, cio, execs, aumNews, move, returns, articles, deals, invUpdatedAt, insUpdatedAt, onBack, onOpenArticle, onOpenDeal, onOpenInst }) {
    const desktop = useDesktop();
    const p = profile || {};
    const aum = alloc && alloc.aum != null ? alloc.aum : (p.aum != null ? p.aum : null);
    const aumAsOf = alloc && alloc.aum != null ? (alloc.asOf || '공시 기준') : (p.aumAsOf || '');
    const latest = articles[0];
    const L = p.leadership || {};
    const cioIsNewer = cio && cio.status === '선임' && cio.person;
    const ovDeals = deals.filter((d) => d.overseas).length;
    const head = (React.createElement(ProfileHead, { kicker: React.createElement(React.Fragment, null,
            React.createElement(Tag, { tone: "dark" }, group || '국내 LP'),
            p.curated ? React.createElement(Tag, { tone: "yellow" }, "\uAC80\uC99D \uD504\uB85C\uD544") : React.createElement(Tag, null, "\uC5C5\uAD8C \uC77C\uBC18 \uC815\uBCF4")), name: name, sub: p.eng, meta: [p.founded ? `설립 ${p.founded}년` : '', p.hq || '', p.mandate ? `출자 방식 ${p.mandate}` : ''].filter(Boolean).join(' · '), tags: p.tags, updated: `투자내역·인사·AUM 자동 갱신 · 최근 ${[invUpdatedAt, insUpdatedAt].filter(Boolean).sort().pop() || '-'}` }));
    return (React.createElement(ProfileFrame, { backLabel: "Korea LP", onBack: onBack, title: name },
        desktop ? React.createElement("div", { style: { background: KB.bg, border: `1px solid ${KB.line}`, borderRadius: 12, overflow: 'hidden' } }, head) : head,
        React.createElement(Section, { first: !desktop, title: "\uD575\uC2EC \uC9C0\uD45C", sub: aumAsOf },
            React.createElement("div", { style: { display: 'grid', gridTemplateColumns: desktop ? 'repeat(4, 1fr)' : '1fr 1fr', gap: 8 } },
                React.createElement(Metric, { label: "\uC6B4\uC6A9\uC790\uC0B0(AUM)", value: aum == null ? '–' : (alloc && alloc.aum != null ? '' : '약 ') + fmtJo(aum), note: aumNews && aumNews.display ? `기사 기준 ${aumNews.display} (${aumNews.date})` : '' }),
                React.createElement(Metric, { accent: true, label: "\uB300\uCCB4\uD22C\uC790 \uBE44\uC911", value: alloc && alloc.altPct != null ? fmtPct(alloc.altPct) : '–' }),
                React.createElement(Metric, { label: "\uB300\uCCB4\uD22C\uC790 \uAE08\uC561", value: alloc && alloc.altAmount != null ? fmtJo(alloc.altAmount) : '–' }),
                React.createElement(Metric, { label: "\uB300\uCCB4\uD22C\uC790 \uC911 \uD574\uC678", value: alloc && alloc.overseasAltPct != null ? fmtPct(alloc.overseasAltPct) : '–' })),
            alloc && alloc.sourceNote && React.createElement("div", { style: { font: F(400, 12.5, 1.65), color: KB.sub, marginTop: 12 } }, alloc.sourceNote),
            alloc && alloc.source && (React.createElement("div", { style: { font: F(500, 12), color: KB.mute, marginTop: 8 } },
                "\uCD9C\uCC98 ",
                alloc.sourceUrl ? React.createElement("a", { href: alloc.sourceUrl, target: "_blank", rel: "noopener noreferrer", style: { color: KB.sub } }, alloc.source) : alloc.source))),
        React.createElement(Section, { title: "\uD22C\uC790\uB0B4\uC5ED", sub: `해외 ${ovDeals} · 전체 ${deals.length}건` },
            React.createElement(DealList, { events: deals, onOpen: onOpenDeal, onInst: onOpenInst, limit: 6, defaultOverseas: false, emptyTitle: "\uC544\uC9C1 \uC218\uC9D1\uB41C \uD22C\uC790\uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4", emptyDesc: "\uAE30\uC0AC \uC81C\uBAA9\uC5D0 \uCD9C\uC790\u00B7\uC778\uC218\u00B7\uD22C\uC790\u00B7\uC704\uD0C1\uC6B4\uC6A9\uC0AC \uC120\uC815 \uB4F1\uC774 \uB098\uC624\uBA74 \uADFC\uAC70 \uAE30\uC0AC\uC640 \uD568\uAED8 \uC790\uB3D9\uC73C\uB85C \uC313\uC785\uB2C8\uB2E4." })),
        React.createElement(Section, { title: "\uCD5C\uADFC \uB3D9\uD5A5", right: latest && React.createElement(More, { onClick: () => onOpenArticle(latest.id) }, "\uCD5C\uC2E0 \uAE30\uC0AC") },
            React.createElement(RecentActivity, { articles: articles })),
        (p.summary || p.altFocus) && (React.createElement(Section, { title: "\uC6B4\uC6A9 \uAC1C\uC694" },
            p.summary && React.createElement("div", { style: { font: F(400, 14.5, 1.75), color: KB.ink2 } }, p.summary),
            p.altFocus && (React.createElement("div", { style: { marginTop: 12, padding: '13px 15px', background: KB.band, borderRadius: 10 } },
                React.createElement("div", { style: { font: F(700, 12.5), color: KB.gray, marginBottom: 5 } }, "\uB300\uCCB4\uD22C\uC790 \uC811\uADFC"),
                React.createElement("div", { style: { font: F(400, 14, 1.7), color: KB.ink2 } }, p.altFocus))),
            !p.curated && React.createElement("div", { style: { font: F(400, 12, 1.6), color: KB.mute, marginTop: 10 } }, "\uC5C5\uAD8C(\uC720\uD615)\uC758 \uC77C\uBC18\uC801\uC778 \uC6B4\uC6A9 \uBC29\uC2DD \uAE30\uC900 \uC124\uBA85\uC785\uB2C8\uB2E4. \uAE30\uAD00\uBCC4 \uC218\uCE58\u00B7\uB3D9\uD5A5\uC740 \uC704 \uD22C\uC790\uB0B4\uC5ED\u00B7\uAE30\uC0AC\uB97C \uCC38\uACE0\uD558\uC138\uC694."))),
        (L.ceo || L.cio || cio) && (React.createElement(Section, { title: "\uB9AC\uB354\uC2ED", sub: L.asOf ? `${L.asOf} 기준` : '' },
            cioIsNewer && (React.createElement(ExtLink, { first: true, href: cio.url },
                React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 6 } },
                    React.createElement(Tag, { tone: "yellow" }, "CIO \u00B7 \uAE30\uC0AC \uAE30\uC900 \uCD5C\uC2E0"),
                    React.createElement("span", { style: { font: F(700, 15.5), color: KB.ink } }, cio.person),
                    cio.background && React.createElement("span", { style: { font: F(500, 13), color: KB.sub } },
                        cio.background,
                        " \uCD9C\uC2E0")),
                React.createElement("div", { style: { font: F(500, 12), color: KB.mute, marginTop: 6 } },
                    cio.date,
                    " \u00B7 ",
                    cio.source))),
            [['대표', L.ceo], ['CIO', L.cio]].filter(([, x]) => x).map(([badge, x], i) => (React.createElement("div", { key: badge, style: { padding: '13px 0', borderTop: cioIsNewer || i ? `1px solid ${KB.line2}` : 'none' } },
                React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
                    React.createElement(Tag, null, x.title || badge),
                    x.name ? React.createElement("span", { style: { font: F(700, 15.5), color: KB.ink } }, x.name) : React.createElement("span", { style: { font: F(600, 14), color: KB.gray } }, "\uACF5\uC11D\u00B7\uC778\uC120 \uC9C4\uD589"),
                    x.born && React.createElement("span", { style: { font: F(500, 13), color: KB.mute } },
                        x.born,
                        "\uB144\uC0DD")),
                (x.bio || x.note) && React.createElement("div", { style: { font: F(400, 13.5, 1.65), color: KB.sub, marginTop: 6 } }, x.bio || x.note)))),
            cio && !cioIsNewer && (React.createElement(ExtLink, { href: cio.url },
                React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 6 } },
                    React.createElement(Tag, { tone: "outline" }, "CIO \uC778\uC120"),
                    React.createElement("span", { style: { font: F(600, 14), color: KB.ink } }, cio.note)),
                React.createElement("div", { style: { font: F(500, 12), color: KB.mute, marginTop: 6 } },
                    cio.date,
                    " \u00B7 ",
                    cio.source))))),
        execs && execs.length > 0 && (React.createElement(Section, { title: "\uC6B4\uC6A9\uC870\uC9C1 \uC778\uC0AC", sub: "\uBCF8\uBD80\uC7A5\u00B7\uC2E4\uC7A5\u00B7\uD300\uC7A5 \u00B7 \uAE30\uC0AC \uC790\uB3D9 \uCD94\uCD9C" }, execs.map((e, i) => (React.createElement(ExtLink, { key: e.key || i, first: i === 0, href: e.url },
            React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
                React.createElement("span", { style: { font: F(700, 15), color: KB.ink } }, e.person),
                React.createElement("span", { style: { font: F(500, 13.5), color: KB.sub } }, e.title),
                React.createElement(Tag, { tone: "outline" }, e.action)),
            React.createElement("div", { style: { font: F(500, 12), color: KB.mute, marginTop: 5 } },
                e.date,
                " \u00B7 ",
                e.source)))))),
        move && (React.createElement(Section, { title: "\uC9C0\uBC29\uC774\uC804" },
            React.createElement(ExtLink, { first: true, href: move.url },
                React.createElement(Tag, { tone: "outline" }, move.stage),
                React.createElement("div", { style: { font: F(500, 14.5, 1.5), color: KB.ink, marginTop: 8 } }, move.title),
                React.createElement("div", { style: { font: F(500, 12), color: KB.mute, marginTop: 5 } },
                    move.date,
                    " \u00B7 ",
                    move.source)))),
        alloc && alloc.trend && alloc.trend.length >= 2 && (React.createElement(Section, { title: "\uB300\uCCB4\uD22C\uC790 \uBE44\uC911 \uCD94\uC774", sub: "\uC5F0\uB9D0 \uAE30\uC900 %" },
            React.createElement(AltTrend, { trend: alloc.trend }))),
        returns && returns.length > 0 && (React.createElement(Section, { title: "\uC790\uC0B0\uAD70\uBCC4 \uC218\uC775\uB960", sub: "\uAE30\uC0AC \uAE30\uC900" }, returns.map((r, i) => (React.createElement(ExtLink, { key: r.asset + i, first: i === 0, href: r.url },
            React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 10 } },
                React.createElement("span", { style: { flex: 1, font: F(500, 15), color: KB.ink } }, r.label),
                React.createElement(Delta, { v: r.value, digits: 1, size: 15 }),
                React.createElement("span", { style: { font: F(500, 12), color: KB.mute } }, r.date))))))),
        React.createElement(Section, { title: "\uAD00\uB828 \uAE30\uC0AC", sub: `${articles.length}건` },
            articles.length ? articles.slice(0, 30).map((a, i) => React.createElement(MiniArticle, { key: a.id, a: a, first: i === 0, onOpen: onOpenArticle }))
                : React.createElement(Empty, { compact: true, title: `최근 3개월 ${name} 관련 기사가 없습니다` }),
            React.createElement("div", { style: { font: F(400, 12, 1.7), color: KB.mute, marginTop: 16 } },
                p.asOf ? `기준 정보 ${p.asOf}. ` : '',
                "\uD22C\uC790\uB0B4\uC5ED\u00B7\uC778\uC0AC\u00B7AUM\u00B7\uAD00\uB828 \uAE30\uC0AC\uB294 3\uC2DC\uAC04\uB9C8\uB2E4 \uAE30\uC0AC\uC5D0\uC11C \uC790\uB3D9 \uAC31\uC2E0\uB418\uBA70, \uAC01 \uD56D\uBAA9\uC740 \uADFC\uAC70 \uAE30\uC0AC\uB85C \uC5F0\uACB0\uB429\uB2C8\uB2E4."))));
}
// ─── 해외 GP 프로필 ──────────────────────────────────────────
function GpProfile({ name, profile, articles, deals, lpLinks, frEvents, aumNews, invUpdatedAt, onBack, onOpenArticle, onOpenDeal, onOpenInst }) {
    const desktop = useDesktop();
    const p = profile || {};
    const latest = articles[0];
    const head = (React.createElement(ProfileHead, { kicker: React.createElement(React.Fragment, null,
            React.createElement(Tag, { tone: "dark" }, "Global GP"),
            p.listed && React.createElement(Tag, { tone: "outline" }, p.listed)), name: name, meta: [p.founded ? `설립 ${p.founded}년` : '', p.hq || ''].filter(Boolean).join(' · '), tags: p.tags, updated: `딜·펀드·기사 자동 갱신 · 최근 ${invUpdatedAt || '-'}` }));
    return (React.createElement(ProfileFrame, { backLabel: "Global GP", onBack: onBack, title: name },
        desktop ? React.createElement("div", { style: { background: KB.bg, border: `1px solid ${KB.line}`, borderRadius: 12, overflow: 'hidden' } }, head) : head,
        p.summary && (React.createElement("div", { style: { background: KB.bg, padding: desktop ? '16px 20px' : '0 20px 18px', marginTop: desktop ? 16 : 0, border: desktop ? `1px solid ${KB.line}` : 'none', borderRadius: desktop ? 12 : 0 } },
            React.createElement("div", { style: { font: F(400, 14.5, 1.75), color: KB.ink2 } }, p.summary))),
        React.createElement(Section, { title: "\uD575\uC2EC \uC9C0\uD45C" },
            React.createElement("div", { style: { display: 'grid', gridTemplateColumns: desktop ? 'repeat(3, 1fr)' : '1fr 1fr', gap: 8 } },
                React.createElement(Metric, { label: "\uC6B4\uC6A9\uC790\uC0B0(AUM)", value: p.aum || '–', note: p.aumAsOf || '' }),
                aumNews && aumNews.display
                    ? React.createElement(Metric, { accent: true, label: "\uAE30\uC0AC \uAE30\uC900 AUM", value: aumNews.display, note: `${aumNews.date} · ${aumNews.source}` })
                    : React.createElement(Metric, { label: "\uD22C\uC790\uB0B4\uC5ED(\uB204\uC801)", value: `${deals.length}건` }),
                React.createElement(Metric, { label: "\uCD5C\uADFC 30\uC77C \uAE30\uC0AC", value: `${articles.filter((a) => Date.now() - itemMs(a) < 30 * 86400000).length}건` }))),
        React.createElement(Section, { title: "\uB51C\u00B7\uD22C\uC790 \uB0B4\uC5ED", sub: `${deals.length}건 · 인수·매각·펀드 결성·출자 유치` },
            React.createElement(DealList, { events: deals, onOpen: onOpenDeal, limit: 8, emptyTitle: "\uC544\uC9C1 \uC218\uC9D1\uB41C \uB51C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4", emptyDesc: "\uAE30\uC0AC \uC81C\uBAA9\uC5D0 \uC778\uC218\u00B7\uB9E4\uAC01\u00B7\uD380\uB4DC \uACB0\uC131 \uB4F1\uC774 \uB098\uC624\uBA74 \uADFC\uAC70 \uAE30\uC0AC\uC640 \uD568\uAED8 \uC790\uB3D9\uC73C\uB85C \uC313\uC785\uB2C8\uB2E4." })),
        lpLinks && lpLinks.length > 0 && (React.createElement(Section, { title: "\uAD6D\uB0B4 LP\uC640\uC758 \uAC70\uB798", sub: "\uAE30\uC0AC\uC5D0\uC11C \uD568\uAED8 \uD655\uC778\uB41C \uAE30\uAD00" },
            React.createElement(DealList, { events: lpLinks, onOpen: onOpenDeal, onInst: onOpenInst, showInst: true, limit: 6 }))),
        frEvents && frEvents.length > 0 && (React.createElement(Section, { title: "\uD380\uB4DC\uB808\uC774\uC9D5" }, frEvents.slice(0, 6).map((f, i) => (React.createElement("div", { key: f.id + i, onClick: () => onOpenArticle(f.id, f), style: { padding: '13px 0', borderTop: i ? `1px solid ${KB.line2}` : 'none', cursor: 'pointer' } },
            React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 6 } },
                React.createElement(Tag, { tone: /파이널|클로즈/.test(f.stage) ? 'yellow' : 'outline' }, f.stage),
                f.size && React.createElement("span", { style: { font: F(700, 14), color: KB.gray } }, f.size),
                React.createElement("span", { style: { marginLeft: 'auto', font: F(500, 12), color: KB.mute } }, f.date)),
            React.createElement("div", { style: { font: F(500, 14.5, 1.5), color: KB.ink, marginTop: 6 } }, f.title)))))),
        ((p.people && p.people.length) || p.note) && (React.createElement(Section, { title: "\uD575\uC2EC \uC778\uBB3C \u00B7 \uCEE4\uBC84\uB9AC\uC9C0" },
            (p.people || []).map((pp, i) => (React.createElement("div", { key: pp.name + i, style: { padding: '13px 0', borderTop: i ? `1px solid ${KB.line2}` : 'none' } },
                React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
                    React.createElement("span", { style: { font: F(700, 15.5), color: KB.ink } }, pp.name),
                    React.createElement("span", { style: { font: F(500, 13), color: KB.sub } }, pp.title)),
                pp.note && React.createElement("div", { style: { font: F(400, 13.5, 1.65), color: KB.sub, marginTop: 6 } }, pp.note)))),
            p.note && (React.createElement("div", { style: { marginTop: p.people && p.people.length ? 10 : 0, padding: '13px 15px', background: KB.yellowTint, borderRadius: 10 } },
                React.createElement("div", { style: { font: F(700, 12.5), color: KB.gray, marginBottom: 5 } }, "\uCEE4\uBC84\uB9AC\uC9C0 \uB178\uD2B8"),
                React.createElement("div", { style: { font: F(500, 14, 1.65), color: KB.ink2 } }, p.note))))),
        (p.flagship || (p.strengths && p.strengths.length)) && (React.createElement(Section, { title: "\uAC15\uC810 \uC804\uB7B5", sub: "\uADFC\uAC70 \uD3EC\uD568" },
            p.flagship && (React.createElement("div", { style: { padding: '12px 14px', background: KB.band, borderRadius: 10, marginBottom: 6 } },
                React.createElement("div", { style: { font: F(700, 12.5), color: KB.gray, marginBottom: 4 } }, "\uD50C\uB798\uADF8\uC2ED \uD380\uB4DC"),
                React.createElement("div", { style: { font: F(500, 14, 1.6), color: KB.ink2 } }, p.flagship))),
            (p.strengths || []).map((st, i) => (React.createElement("div", { key: i, style: { padding: '13px 0', borderTop: i || p.flagship ? `1px solid ${KB.line2}` : 'none' } },
                React.createElement("div", { style: { font: F(700, 15), color: KB.ink } }, st.k && ASSET[st.k] ? ASSET[st.k].label : (st.label || '전략')),
                st.note && React.createElement("div", { style: { font: F(400, 13.5, 1.65), color: KB.sub, marginTop: 4 } }, st.note)))))),
        React.createElement(Section, { title: "\uCD5C\uADFC \uB3D9\uD5A5", right: latest && React.createElement(More, { onClick: () => onOpenArticle(latest.id) }, "\uCD5C\uC2E0 \uAE30\uC0AC") },
            React.createElement(RecentActivity, { articles: articles })),
        React.createElement(Section, { title: "\uAD00\uB828 \uAE30\uC0AC", sub: `${articles.length}건` },
            articles.length ? articles.slice(0, 30).map((a, i) => React.createElement(MiniArticle, { key: a.id, a: a, first: i === 0, onOpen: onOpenArticle }))
                : React.createElement(Empty, { compact: true, title: `최근 3개월 ${name} 관련 기사가 없습니다` }),
            React.createElement("div", { style: { font: F(400, 12, 1.7), color: KB.mute, marginTop: 16 } }, "\uAE30\uC900 \uC815\uBCF4\uB294 \uACF5\uAC1C \uC790\uB8CC(\uC5F0\uCC28\uBCF4\uACE0\uC11C\u00B7\uACF5\uC2DC\u00B7\uC8FC\uC694 \uBCF4\uB3C4) \uAE30\uC900\uC774\uBA70 AUM\uC740 \uADFC\uC0AC\uCE58\uC785\uB2C8\uB2E4. \uB51C\u00B7\uD380\uB4DC\uB808\uC774\uC9D5\u00B7\uAE30\uC0AC\u00B7\uAE30\uC0AC \uAE30\uC900 AUM\uC740 3\uC2DC\uAC04\uB9C8\uB2E4 \uC790\uB3D9 \uAC31\uC2E0\uB429\uB2C8\uB2E4."))));
}
// ─── 대체투자 배분 비교 (Korea LP › 배분·인사) ───────────────────
function AllocBars({ rows, sel, onSelect }) {
    const max = Math.max(...rows.map((r) => r.altPct || 0), 1);
    return (React.createElement("div", null, rows.map((r, i) => {
        const on = sel === r.name;
        return (React.createElement("div", { key: r.name, onClick: () => onSelect(r.name), style: { padding: '10px 0', borderTop: i ? `1px solid ${KB.line2}` : 'none', cursor: 'pointer' } },
            React.createElement("div", { style: { display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 7 } },
                React.createElement("span", { style: { font: on ? F(700, 14.5) : F(500, 14.5), color: KB.ink, flex: 1 } }, r.name),
                React.createElement("span", { style: { font: F(700, 14.5), color: KB.ink } }, fmtPct(r.altPct)),
                React.createElement("span", { style: { font: F(500, 12), color: KB.mute, minWidth: 64, textAlign: 'right' } }, fmtJo(r.altAmount))),
            React.createElement("div", { style: { position: 'relative', height: 8, borderRadius: 4, background: KB.band, overflow: 'hidden' } },
                React.createElement("div", { style: { position: 'absolute', inset: 0, width: (r.altPct / max * 100) + '%', background: on ? KB.gray : KB.faint, borderRadius: 4 } }),
                React.createElement("div", { style: { position: 'absolute', inset: 0, width: (r.altPct * (r.overseasAltPct || 0) / 100 / max * 100) + '%', background: KB.yellow, borderRadius: 4 } }))));
    })));
}
function AllocView({ alloc, insights, onOpenLp }) {
    const rows = (alloc && alloc.institutions) || [];
    const [sel, setSel] = React.useState(null);
    const cur = rows.find((r) => r.name === sel) || rows[0];
    if (!rows.length)
        return React.createElement(Empty, { title: "\uBC30\uBD84 \uB370\uC774\uD130\uB97C \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4" });
    const ins = insights || {};
    return (React.createElement(React.Fragment, null,
        React.createElement(Section, { first: true, title: "\uAE30\uAD00\uBCC4 \uB300\uCCB4\uD22C\uC790 \uBE44\uC911", sub: alloc.asOf, right: React.createElement("span", { style: { display: 'flex', alignItems: 'center', gap: 10, font: F(500, 12), color: KB.sub } },
                React.createElement("span", { style: { display: 'flex', alignItems: 'center', gap: 4 } },
                    React.createElement("span", { style: { width: 10, height: 10, borderRadius: 2, background: KB.yellow } }),
                    "\uD574\uC678"),
                React.createElement("span", { style: { display: 'flex', alignItems: 'center', gap: 4 } },
                    React.createElement("span", { style: { width: 10, height: 10, borderRadius: 2, background: KB.faint } }),
                    "\uC804\uCCB4")) },
            React.createElement(AllocBars, { rows: rows, sel: cur && cur.name, onSelect: setSel }),
            cur && (React.createElement("div", { style: { marginTop: 16, padding: 16, border: `1px solid ${KB.line}`, borderRadius: 12 } },
                React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 } },
                    React.createElement("span", { style: { font: F(700, 17), color: KB.ink } }, cur.name),
                    React.createElement(Tag, null, cur.group),
                    cur.verified ? React.createElement(Tag, { tone: "yellow" }, "\uACF5\uC2DC \uD655\uC815") : React.createElement(Tag, { tone: "outline" }, "\uACF5\uC2DC \uCD94\uC815\uCE58")),
                React.createElement("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 } },
                    React.createElement(Metric, { label: "\uC6B4\uC6A9\uC790\uC0B0(AUM)", value: fmtJo(cur.aum) }),
                    React.createElement(Metric, { accent: true, label: "\uB300\uCCB4\uD22C\uC790 \uAE08\uC561", value: fmtJo(cur.altAmount) }),
                    React.createElement(Metric, { label: "\uB300\uCCB4\uD22C\uC790 \uBE44\uC911", value: fmtPct(cur.altPct) }),
                    React.createElement(Metric, { label: "\uB300\uCCB4\uD22C\uC790 \uC911 \uD574\uC678", value: fmtPct(cur.overseasAltPct) })),
                React.createElement("div", { style: { marginTop: 12 } },
                    React.createElement(Btn, { kind: "dark", full: true, onClick: () => onOpenLp(cur.name) },
                        cur.name,
                        " \uD504\uB85C\uD544 \uBCF4\uAE30")))),
            alloc.note && React.createElement("div", { style: { font: F(400, 12, 1.65), color: KB.mute, marginTop: 12 } },
                "\u203B ",
                alloc.note)),
        React.createElement(Section, { title: "CIO \uC778\uC120 \uD604\uD669", sub: `기사 자동 추출${ins.updatedAt ? ' · ' + ins.updatedAt : ''}` }, (ins.cios || []).length ? ins.cios.map((c, i) => (React.createElement(ListRow, { key: c.inst + i, first: i === 0, chevron: true, onClick: () => onOpenLp(c.inst) },
            React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 6 } },
                React.createElement("span", { style: { font: F(700, 15), color: KB.ink } }, c.inst),
                React.createElement(Tag, { tone: c.status === '선임' ? 'yellow' : 'outline' }, c.status)),
            React.createElement("div", { style: { font: F(500, 13.5), color: KB.ink2, marginTop: 5 } }, c.note),
            React.createElement("div", { style: { font: F(500, 12), color: KB.mute, marginTop: 4 } },
                c.date,
                " \u00B7 ",
                c.source)))) : React.createElement(Empty, { compact: true, title: "\uAE30\uC0AC\uC5D0\uC11C \uD655\uC778\uB41C CIO \uC778\uC120 \uC18C\uC2DD\uC774 \uC5C6\uC2B5\uB2C8\uB2E4" })),
        React.createElement(Section, { title: "\uB300\uCCB4\uD22C\uC790 \uC6B4\uC6A9\uC870\uC9C1 \uC778\uC0AC", sub: "\uBCF8\uBD80\uC7A5\u00B7\uC2E4\uC7A5\u00B7\uD300\uC7A5" }, (ins.execs || []).length ? ins.execs.slice(0, 15).map((e, i) => (React.createElement(ListRow, { key: e.key || i, first: i === 0, chevron: true, onClick: () => onOpenLp(e.inst) },
            React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' } },
                React.createElement("span", { style: { font: F(700, 15), color: KB.ink } }, e.inst),
                React.createElement("span", { style: { font: F(500, 13.5), color: KB.sub } }, e.title)),
            React.createElement("div", { style: { font: F(500, 13.5), color: KB.ink2, marginTop: 5 } },
                e.person,
                " ",
                e.action),
            React.createElement("div", { style: { font: F(500, 12), color: KB.mute, marginTop: 4 } },
                e.date,
                " \u00B7 ",
                e.source)))) : React.createElement(Empty, { compact: true, title: "\uAE30\uC0AC\uC5D0\uC11C \uD655\uC778\uB41C \uC2E4\uBB34 \uC778\uC0AC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4" })),
        React.createElement(Section, { title: "\uC9C0\uBC29\uC774\uC804 \uC774\uC288", sub: "\uACF5\uC81C\uD68C\u00B7\uAD6D\uCC45\uC740\uD589\u00B7\uC5F0\uAE30\uAE08" }, (ins.relocations || []).length ? ins.relocations.slice(0, 12).map((m, i) => (React.createElement(ListRow, { key: m.inst + i, first: i === 0, chevron: true, onClick: () => onOpenLp(m.inst) },
            React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 6 } },
                React.createElement("span", { style: { font: F(700, 15), color: KB.ink } }, m.inst),
                React.createElement(Tag, { tone: "outline" }, m.stage)),
            React.createElement("div", { style: { font: F(500, 13.5, 1.5), color: KB.ink2, marginTop: 5 } }, m.title),
            React.createElement("div", { style: { font: F(500, 12), color: KB.mute, marginTop: 4 } },
                m.date,
                " \u00B7 ",
                m.source)))) : React.createElement(Empty, { compact: true, title: "\uC218\uC9D1\uB41C \uC9C0\uBC29\uC774\uC804 \uC774\uC288\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4" })),
        React.createElement(Section, { title: "\uC6B4\uC6A9\uC790\uC0B0(AUM) \uCD5C\uC2E0\uD654", sub: "\uAE30\uC0AC \uC2A4\uD06C\uB9AC\uB2DD" },
            (ins.aums || []).filter((x) => x.unit === 'KRW').length ? ins.aums.filter((x) => x.unit === 'KRW').map((x, i) => (React.createElement(ListRow, { key: x.inst + i, first: i === 0, chevron: true, onClick: () => onOpenLp(x.inst) },
                React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 10 } },
                    React.createElement("span", { style: { flex: 1, font: F(500, 15), color: KB.ink } }, x.inst),
                    React.createElement("span", { style: { font: F(700, 15), color: KB.ink } }, x.display)),
                React.createElement("div", { style: { font: F(500, 12), color: KB.mute, marginTop: 4 } },
                    x.date,
                    " \u00B7 ",
                    x.source,
                    x.ref ? ` · 공시 ${Math.round(x.ref / 10000).toLocaleString('ko-KR')}조원` : '')))) : React.createElement(Empty, { compact: true, title: "\uAE30\uC0AC\uC5D0\uC11C \uD655\uC778\uB41C AUM \uC218\uCE58\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4" }),
            React.createElement("div", { style: { font: F(400, 12, 1.65), color: KB.mute, marginTop: 10 } }, "\u2018\uC6B4\uC6A9\uC790\uC0B0\u00B7\uAE30\uAE08 \uADDC\uBAA8\u00B7\uC801\uB9BD\uAE08\u2019 \uBB38\uAD6C\uC640 \uD568\uAED8 \uC4F0\uC778 \uC218\uCE58\uB9CC \uBC18\uC601\uD558\uACE0, \uACF5\uC2DC AUM\uACFC \uADDC\uBAA8\uAC00 \uD06C\uAC8C \uB2E4\uB978 \uC218\uCE58(\uD558\uC704 \uD3EC\uD2B8\uD3F4\uB9AC\uC624 \uAE08\uC561 \uB4F1)\uB294 \uC81C\uC678\uD569\uB2C8\uB2E4.")),
        (ins.assetReturns || []).length > 0 && (React.createElement(Section, { title: "\uC790\uC0B0\uAD70\uBCC4 \uC218\uC775\uB960", sub: "\uCD5C\uADFC \uAE30\uC0AC \uAE30\uC900" }, ins.assetReturns.map((r, i) => (React.createElement(ExtLink, { key: r.asset + i, first: i === 0, href: r.url },
            React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 10 } },
                React.createElement("span", { style: { flex: 1, font: F(500, 15), color: KB.ink } },
                    r.label,
                    r.inst ? React.createElement("span", { style: { color: KB.mute } },
                        " \u00B7 ",
                        r.inst) : null),
                React.createElement(Delta, { v: r.value, digits: 1, size: 15 }),
                React.createElement("span", { style: { font: F(500, 12), color: KB.mute } }, r.date)))))))));
}
// ─── 펀드레이징 (운용사·펀드별 모집 단계와 단계별 일자) ─────────────
const FR_STEPS = ['모집 중', '1차 클로즈', '중간 클로즈', '클로즈', '파이널 클로즈'];
const FR_LABEL = { '모집 중': '모집 개시', '1차 클로즈': '1차 클로즈', '중간 클로즈': '중간 클로즈', '클로즈': '클로즈(단계 미상)', '파이널 클로즈': '파이널 클로즈' };
const frTone = (st) => (st === '파이널 클로즈' ? 'dark' : st === '모집 중' ? 'outline' : 'yellow');
const stratOf = (f) => f.strategy || (ASSET[f.asset] && ASSET[f.asset].label) || 'Alternatives';
const fundTitle = (f) => f.fund || (/\bfund$|펀드$/i.test(f.gp) ? f.gp : `${f.gp} · ${stratOf(f)}`);
// 공식 펀드명을 못 찾은 경우 이름처럼 보이지 않게 표시
const Unnamed = ({ f }) => (f.fund ? null : React.createElement("span", { style: { font: F(500, 12), color: KB.mute, marginLeft: 6, whiteSpace: 'nowrap' } }, "\uD380\uB4DC\uBA85 \uBBF8\uD655\uC778"));
const frDate = (s) => (s && s.ts ? fmtDate(itemMs(s)) : '');
const lastStage = (f) => f.stages[f.stages.length - 1];
// 단계별 타임라인
function FundTimeline({ f, onOpenStage }) {
    const reached = new Set(f.stages.map((s) => s.stage));
    const steps = FR_STEPS.filter((k) => k !== '클로즈' || reached.has('클로즈'));
    return (React.createElement("div", { style: { marginTop: 12 } },
        steps.map((k, i) => {
            const s = f.stages.find((x) => x.stage === k);
            const last = i === steps.length - 1;
            const col = s ? (k === '파이널 클로즈' ? KB.ink : KB.yellow) : KB.line;
            return (React.createElement("div", { key: k, onClick: () => s && onOpenStage(s), style: { display: 'flex', gap: 12, cursor: s ? 'pointer' : 'default', minHeight: 32 } },
                React.createElement("div", { style: { width: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 } },
                    React.createElement("span", { style: { width: 11, height: 11, borderRadius: 6, marginTop: 4, background: s ? col : '#fff', border: `2px solid ${col}`, boxSizing: 'border-box' } }),
                    !last && React.createElement("span", { style: { flex: 1, width: 2, background: s ? KB.yellowLine : KB.line2, marginTop: 2 } })),
                React.createElement("div", { style: { flex: 1, minWidth: 0, paddingBottom: last ? 0 : 8 } },
                    React.createElement("div", { style: { display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' } },
                        React.createElement("span", { style: { font: s ? F(600, 14) : F(500, 14), color: s ? KB.ink : KB.faint } }, FR_LABEL[k]),
                        s && React.createElement("span", { style: { font: F(600, 13), color: KB.sub } },
                            frDate(s),
                            s.dated ? '' : ' 보도'),
                        s && s.size && React.createElement("span", { style: { font: F(700, 13.5), color: KB.gray } }, s.size)),
                    s && React.createElement("div", { style: { font: F(500, 12.5, 1.45), color: KB.mute, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } },
                        s.source,
                        s.reports > 1 ? ` 외 ${s.reports - 1}건` : '',
                        " \u00B7 ",
                        s.tko || s.title))));
        }),
        f.dropped && f.dropped.length > 0 && (React.createElement("div", { style: { font: F(500, 12, 1.55), color: KB.mute, marginTop: 6, padding: '8px 10px', background: KB.band, borderRadius: 8 } },
            "\uC2DC\uAC04 \uC21C\uC11C\uAC00 \uB9DE\uC9C0 \uC54A\uB294 \uBCF4\uB3C4 ",
            f.dropped.length,
            "\uAC74(\uC608: \uD074\uB85C\uC988 \uC774\uD6C4\uC758 \u2018\uBAA8\uC9D1\u2019 \uAE30\uC0AC)\uC740 \uB2E4\uB978 \uBE48\uD2F0\uC9C0\uC774\uAC70\uB098 \uC7AC\uBCF4\uB3C4\uB85C \uBCF4\uACE0 \uD0C0\uC784\uB77C\uC778\uC5D0\uC11C \uC81C\uC678\uD588\uC2B5\uB2C8\uB2E4."))));
}
function FundCard({ f, onOpenStage, onGp, first }) {
    return (React.createElement("div", { style: { padding: '16px 0', borderTop: first ? 'none' : `1px solid ${KB.line2}` } },
        React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' } },
            React.createElement(Tag, { tone: frTone(f.status) }, f.status),
            React.createElement(Tag, null, stratOf(f)),
            !f.fund && React.createElement("span", { style: { font: F(500, 12), color: KB.mute } }, "\uACF5\uC2DD \uD380\uB4DC\uBA85 \uBBF8\uD655\uC778")),
        React.createElement("div", { style: { font: F(700, 16.5, 1.4), color: KB.ink, marginTop: 8, wordBreak: 'keep-all' } }, fundTitle(f)),
        React.createElement("div", { style: { display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4, font: F(500, 13), color: KB.sub } },
            React.createElement("span", { onClick: () => onGp && onGp(f.gp), style: { font: F(600, 13), color: KB.gray, cursor: onGp ? 'pointer' : 'default' } }, f.gp),
            f.target && React.createElement("span", null,
                "\uBAA9\uD45C ",
                f.target),
            f.hardcap && React.createElement("span", null,
                "\uD558\uB4DC\uCEA1 ",
                f.hardcap)),
        React.createElement(FundTimeline, { f: f, onOpenStage: onOpenStage })));
}
// 운용사별 보기의 한 줄(누르면 타임라인 펼침)
function FundLine({ f, onOpenStage, first }) {
    const [open, setOpen] = React.useState(false);
    const ls = lastStage(f);
    return (React.createElement("div", { style: { borderTop: first ? 'none' : `1px solid ${KB.line2}` } },
        React.createElement("div", { onClick: () => setOpen((o) => !o), style: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', cursor: 'pointer' } },
            React.createElement("div", { style: { flex: 1, minWidth: 0 } },
                React.createElement("div", { style: { font: F(600, 15, 1.4), color: f.fund ? KB.ink : KB.ink2, wordBreak: 'keep-all' } },
                    fundTitle(f),
                    React.createElement(Unnamed, { f: f })),
                React.createElement("div", { style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 3, font: F(500, 12.5), color: KB.mute } },
                    React.createElement("span", null, stratOf(f)),
                    ls && React.createElement("span", null,
                        FR_LABEL[ls.stage],
                        " ",
                        frDate(ls)),
                    f.target && React.createElement("span", null,
                        "\uBAA9\uD45C ",
                        f.target))),
            ls && ls.size && React.createElement("span", { style: { font: F(700, 14), color: KB.gray, whiteSpace: 'nowrap' } }, ls.size),
            React.createElement(Tag, { tone: frTone(f.status) }, f.status === '모집 중' ? '모집 중' : f.status.replace(' 클로즈', '')),
            React.createElement("span", { style: { color: KB.faint, transform: open ? 'rotate(180deg)' : 'none', display: 'flex' } },
                React.createElement(Ico, { n: "down", size: 16, sw: 2 }))),
        open && React.createElement("div", { style: { paddingBottom: 12 } },
            React.createElement(FundTimeline, { f: f, onOpenStage: onOpenStage }))));
}
function FundraisingView({ data, onOpen, onGp }) {
    const desktop = useDesktop();
    const [tab, setTab] = React.useState('funds');
    const [st, setSt] = React.useState('all');
    const [q, setQ] = React.useState('');
    const funds = (data && data.funds) || [];
    const items = (data && data.items) || [];
    const ql = q.trim().toLowerCase();
    const byQ = (f) => !ql || `${f.gp} ${f.fund} ${f.strategy}`.toLowerCase().includes(ql);
    const matchSt = (f) => st === 'all' || f.status === st || (st === '클로즈' && f.status !== '모집 중');
    const list = funds.filter((f) => matchSt(f) && byQ(f));
    const finals = funds.filter((f) => f.status === '파이널 클로즈' && byQ(f)).sort((a, b) => ((a.finalTs || '') < (b.finalTs || '') ? 1 : -1));
    const cnt = (k) => funds.filter((f) => (k === 'all' ? true : k === '클로즈' ? f.status !== '모집 중' : f.status === k)).length;
    const openStage = (s) => onOpen(s.id, s);
    const byGp = {};
    funds.filter(byQ).forEach((f) => { (byGp[f.gp] = byGp[f.gp] || []).push(f); });
    const gps = Object.keys(byGp).sort((a, b) => byGp[b].length - byGp[a].length || a.localeCompare(b));
    const search = (React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 8, height: 44, padding: '0 14px', background: KB.band, borderRadius: 10, marginBottom: 12 } },
        React.createElement(Ico, { n: "search", size: 18, color: KB.mute }),
        React.createElement("input", { value: q, onChange: (e) => setQ(e.target.value), placeholder: "\uC6B4\uC6A9\uC0AC\u00B7\uD380\uB4DC\uBA85\u00B7\uC804\uB7B5 \uAC80\uC0C9", style: { flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', font: F(500, 15), color: KB.ink } })));
    return (React.createElement("div", { style: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: KB.bg } },
        React.createElement(TopBar, { big: true, title: "\uD380\uB4DC\uB808\uC774\uC9D5", sub: `운용사 ${gps.length}곳 · 펀드 ${funds.length}개(펀드명 확인 ${funds.filter((f) => f.fund).length}) · 보도 ${items.length}건${data && data.updatedAt ? ` · ${data.updatedAt} 갱신` : ''}`, border: false }),
        React.createElement(Tabs, { items: [['funds', '펀드별', funds.length], ['final', '파이널 클로즈', finals.length], ['gp', '운용사별', gps.length], ['feed', '최신 보도', items.length]], value: tab, onChange: setTab, scroll: true, pad: 20 }),
        React.createElement("div", { style: { flex: 1, minHeight: 0, overflowY: 'auto' } },
            React.createElement("div", { style: { maxWidth: desktop ? 880 : 'none', margin: '0 auto', padding: '16px 20px 30px' } },
                tab !== 'feed' && search,
                tab === 'funds' && (React.createElement(React.Fragment, null,
                    React.createElement("div", { style: { display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 6 } }, [['all', '전체'], ['모집 중', '모집 중'], ['클로즈', '클로즈 전체'], ['1차 클로즈', '1차'], ['중간 클로즈', '중간'], ['파이널 클로즈', '파이널']].map(([k, l]) => React.createElement(Chip, { key: k, active: st === k, onClick: () => setSt(k), count: cnt(k) }, l))),
                    list.length ? list.map((f, i) => React.createElement(FundCard, { key: f.fundKey, f: f, first: i === 0, onOpenStage: openStage, onGp: onGp }))
                        : React.createElement(Empty, { compact: true, icon: "layers", title: "\uD574\uB2F9\uD558\uB294 \uD380\uB4DC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4" }))),
                tab === 'final' && (finals.length ? (React.createElement("div", null,
                    React.createElement("div", { style: { font: F(500, 12.5, 1.6), color: KB.mute, marginBottom: 6 } }, "\uCD5C\uC885 \uACB0\uC131(\uD30C\uC774\uB110 \uD074\uB85C\uC988)\uB41C \uD380\uB4DC \u00B7 \uCD5C\uADFC \uC21C"),
                    finals.map((f, i) => {
                        const fin = f.stages.find((s) => s.stage === '파이널 클로즈');
                        return (React.createElement("div", { key: f.fundKey, onClick: () => fin && openStage(fin), style: { padding: '14px 0', borderTop: i ? `1px solid ${KB.line2}` : 'none', cursor: 'pointer' } },
                            React.createElement("div", { style: { display: 'flex', alignItems: 'baseline', gap: 10 } },
                                React.createElement("span", { style: { flex: 1, minWidth: 0, font: F(700, 15.5, 1.4), color: f.fund ? KB.ink : KB.ink2, wordBreak: 'keep-all' } },
                                    fundTitle(f),
                                    React.createElement(Unnamed, { f: f })),
                                React.createElement("span", { style: { font: F(700, 15), color: KB.gray, whiteSpace: 'nowrap' } }, f.finalSize || '규모 미상')),
                            React.createElement("div", { style: { display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4, font: F(500, 12.5), color: KB.sub } },
                                React.createElement("span", { style: { fontWeight: 600, color: KB.gray } }, f.gp),
                                React.createElement("span", null, stratOf(f)),
                                React.createElement("span", null,
                                    "\uD30C\uC774\uB110 ",
                                    frDate(fin),
                                    fin && !fin.dated ? ' 보도' : ''),
                                f.target && React.createElement("span", null,
                                    "\uBAA9\uD45C ",
                                    f.target),
                                f.hardcap && React.createElement("span", null,
                                    "\uD558\uB4DC\uCEA1 ",
                                    f.hardcap))));
                    }))) : React.createElement(Empty, { compact: true, icon: "layers", title: "\uD30C\uC774\uB110 \uD074\uB85C\uC988\uB41C \uD380\uB4DC\uAC00 \uC544\uC9C1 \uC5C6\uC2B5\uB2C8\uB2E4" })),
                tab === 'gp' && (gps.length ? gps.map((g, gi) => {
                    const open = byGp[g].filter((f) => f.status === '모집 중');
                    const closed = byGp[g].filter((f) => f.status !== '모집 중');
                    return (React.createElement("div", { key: g, style: { marginTop: gi ? 18 : 2, border: `1px solid ${KB.line}`, borderRadius: 12, padding: '4px 16px 8px' } },
                        React.createElement("div", { onClick: () => onGp && onGp(g), style: { display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0 10px', cursor: 'pointer' } },
                            React.createElement("span", { style: { font: F(700, 17), color: KB.ink } }, g),
                            React.createElement("span", { style: { marginLeft: 'auto', display: 'flex', gap: 6 } },
                                open.length > 0 && React.createElement(Tag, { tone: "outline" },
                                    "\uBAA8\uC9D1 \uC911 ",
                                    open.length),
                                closed.length > 0 && React.createElement(Tag, { tone: "yellow" },
                                    "\uD074\uB85C\uC988 ",
                                    closed.length)),
                            React.createElement("span", { style: { color: KB.faint } },
                                React.createElement(Ico, { n: "chevron", size: 16, sw: 2 }))),
                        open.length > 0 && (React.createElement(React.Fragment, null,
                            React.createElement("div", { style: { font: F(700, 12.5), color: KB.sub, padding: '8px 0 2px', borderTop: `1px solid ${KB.line}` } }, "\uBAA8\uC9D1 \uC911"),
                            open.map((f, i) => React.createElement(FundLine, { key: f.fundKey, f: f, first: i === 0, onOpenStage: openStage })))),
                        closed.length > 0 && (React.createElement(React.Fragment, null,
                            React.createElement("div", { style: { font: F(700, 12.5), color: KB.sub, padding: '8px 0 2px', borderTop: `1px solid ${KB.line}` } }, "\uD074\uB85C\uC988(\uBAA8\uC9D1 \uC644\uB8CC\u00B7\uC9C4\uD589)"),
                            closed.map((f, i) => React.createElement(FundLine, { key: f.fundKey, f: f, first: i === 0, onOpenStage: openStage }))))));
                }) : React.createElement(Empty, { compact: true, icon: "layers", title: "\uD574\uB2F9\uD558\uB294 \uC6B4\uC6A9\uC0AC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4" })),
                tab === 'feed' && items.map((f, i) => (React.createElement("div", { key: f.key || f.id + i, onClick: () => onOpen(f.id, f), style: { padding: '14px 0', borderTop: i ? `1px solid ${KB.line2}` : 'none', cursor: 'pointer' } },
                    React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 6 } },
                        React.createElement(Tag, { tone: frTone(f.stage) }, f.stage),
                        f.gp && React.createElement("span", { style: { font: F(700, 14), color: KB.ink } }, f.gp),
                        f.size && React.createElement("span", { style: { font: F(700, 14), color: KB.gray } }, f.size),
                        React.createElement("span", { style: { marginLeft: 'auto', font: F(500, 12), color: KB.mute } }, fmtDate(itemMs({ ts: f.pubTs || f.ts })))),
                    f.fund && React.createElement("div", { style: { font: F(600, 13.5), color: KB.gray, marginTop: 6 } }, f.fund),
                    React.createElement("div", { style: { font: F(500, 14.5, 1.5), color: KB.ink2, marginTop: 6 } }, f.title),
                    f.tko && React.createElement("div", { style: { font: F(500, 14, 1.5), color: KB.ko, marginTop: 2 } }, f.tko),
                    React.createElement("div", { style: { font: F(500, 12), color: KB.mute, marginTop: 4 } }, f.source)))),
                React.createElement("div", { style: { font: F(400, 12, 1.7), color: KB.mute, marginTop: 18, paddingTop: 14, borderTop: `1px solid ${KB.line}` } }, "\uACF5\uC2DD \uD380\uB4DC\uBA85\u00B7\uB2E8\uACC4\u00B7\uAE08\uC561\u00B7\uC77C\uC790\uB294 \uAE30\uC0AC \uBCF8\uBB38\uC5D0 \uC801\uD78C \uB0B4\uC6A9\uC5D0\uC11C \uBF51\uC2B5\uB2C8\uB2E4(\uBCF8\uBB38\uC5D0 \uC5C6\uB294 \uAC12\uC740 \uBE44\uC6CC \uB460). \uB2E8\uACC4 \uC77C\uC790\uB294 \uBCF8\uBB38\uC5D0 \uC2E4\uC81C \uB0A0\uC9DC\uAC00 \uC788\uC73C\uBA74 \uADF8 \uB0A0\uC9DC, \uC5C6\uC73C\uBA74 \uCCAB \uBCF4\uB3C4\uC77C(\u2018\uBCF4\uB3C4\u2019 \uD45C\uC2DC)\uC785\uB2C8\uB2E4. \uC2DC\uAC04 \uC21C\uC11C\uAC00 \uB9DE\uC9C0 \uC54A\uB294 \uBCF4\uB3C4\uB294 \uD0C0\uC784\uB77C\uC778\uC5D0\uC11C \uC81C\uC678\uD569\uB2C8\uB2E4. 3\uC2DC\uAC04\uB9C8\uB2E4 \uAC31\uC2E0\u00B7\uB204\uC801\uB429\uB2C8\uB2E4.")))));
}
