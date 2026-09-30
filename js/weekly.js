"use strict";
// @ts-nocheck
/*
 * KB GIS — 주간 시장현황 (Private Equity · Private Credit · Real Estate · Infrastructure · Aviation)
 *
 * weekly/index.json(보고서 목록) → weekly/YYYYMMDD.json(한 주 보고서)을 읽어 보여 준다.
 * 보고서는 매주 마지막 영업일에 scripts/weekly-market.mjs 가 만든다.
 * 자산군마다: 요약 · 시장 현황(수치) · 한국 투자자 · 운용사별 이슈 · 트렌드와 이유 · 테마 보도 추이
 * profiles.tsx 다음, app.tsx 앞에 로드된다(전역 KB·F·Ico·Section 등 사용).
 */
const WK_ASSETS = [['PE', 'Private Equity'], ['PC', 'Private Credit'], ['RE', 'Real Estate'], ['IN', 'Infrastructure'], ['AV', 'Aviation']];
const wkDate = (s) => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${m[1]}.${m[2]}.${m[3]}` : String(s || ''); };
const wkShort = (s) => { const m = String(s || '').match(/^\d{4}-(\d{2})-(\d{2})$/); return m ? `${+m[1]}/${+m[2]}` : String(s || ''); };
const viaLabel = (v) => (/^claude/.test(v || '') ? '분석 Claude' : /^gemini/.test(v || '') ? '분석 Gemini' : '자동 집계(요약 모델 미사용)');
// 전주 대비 증감 표시
function WkDelta({ cur, prev }) {
    if (prev == null)
        return null;
    const d = cur - prev;
    if (!d)
        return React.createElement("span", { style: { font: F(600, 11.5), color: KB.mute } }, "\uC804\uC8FC\uC640 \uAC19\uC74C");
    return React.createElement("span", { style: { font: F(700, 11.5), color: d > 0 ? KB.up : KB.down } },
        d > 0 ? '▲' : '▼',
        " ",
        Math.abs(d));
}
// 근거 기사 칩 — 앱에 있는 기사는 앱에서, 아카이브에서 밀려난 기사는 원문으로 연다
function WkRefs({ ids, refs, onOpen }) {
    const list = (ids || []).filter((id) => refs && refs[id]);
    if (!list.length)
        return null;
    return (React.createElement("div", { style: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 } }, list.map((id, i) => {
        const r = refs[id];
        return (React.createElement("span", { key: id + i, onClick: () => onOpen(id, { url: r.u }), title: nm(r.t), style: { display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: '100%', padding: '4px 9px', borderRadius: 14, border: `1px solid ${KB.line}`, background: KB.card, cursor: 'pointer', font: F(500, 12), color: KB.ink2 } },
            React.createElement(Ico, { n: "external", size: 12, color: KB.gray }),
            React.createElement("span", { style: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 260 } },
                r.s || '기사',
                " \u00B7 ",
                nm(r.t))));
    })));
}
const wkHit = (q) => {
    const a = String(q || '').trim().toLowerCase();
    if (!a)
        return () => true;
    const b = (nm(q.trim()) || '').toLowerCase();
    return (s) => { const t = String(s || '').toLowerCase(); return t.includes(a) || (!!b && t.includes(b)); };
};
// ─── 자산군 한 개 ─────────────────────────────────────────────
function WkAsset({ A, rep, onOpen, q }) {
    const desktop = useDesktop();
    const hit = wkHit(q);
    const S = A.stats || {};
    const gpIssues = (A.gpIssues || []).filter((g) => hit(`${g.gp} ${g.issue}`));
    const trends = (A.trends || []).filter((t) => hit(`${t.trend} ${t.why}`));
    const themes = A.themes || [];
    const typeChips = Object.entries(S.dealTypes || {}).sort((a, b) => b[1] - a[1]);
    const grid = desktop ? { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 } : { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 };
    const P = ({ children }) => React.createElement("div", { style: { font: F(400, 14.5, 1.8), color: KB.ink2, wordBreak: 'keep-all' } }, children);
    return (React.createElement(React.Fragment, null,
        React.createElement(Section, { first: true, title: A.label, sub: `${wkDate(rep.from)} ~ ${wkDate(rep.to)}` }, A.summary ? (React.createElement("div", { style: { padding: '14px 16px', background: KB.yellowTint, borderRadius: 10, borderLeft: `4px solid ${KB.yellow}`, font: F(500, 15, 1.75), color: KB.ink, wordBreak: 'keep-all' } }, nm(A.summary))) : React.createElement(Empty, { compact: true, title: "\uC774\uBC88 \uC8FC \uC694\uC57D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4" })),
        React.createElement(Section, { title: "\uC2DC\uC7A5 \uD604\uD669", sub: "\uC774\uBC88 \uC8FC \uC218\uC9D1 \uAE30\uC900" },
            React.createElement("div", { style: grid },
                React.createElement(Metric, { label: "\uAD00\uB828 \uBCF4\uB3C4", value: `${S.articles || 0}건`, note: React.createElement(WkDelta, { cur: S.articles || 0, prev: S.prevArticles }) }),
                React.createElement(Metric, { label: "\uB51C(\uD22C\uC790\u00B7\uC778\uC218\u00B7\uB9E4\uAC01 \uB4F1)", value: `${S.deals || 0}건` }),
                React.createElement(Metric, { accent: true, label: "\uD30C\uC774\uB110 \uD074\uB85C\uC988", value: `${S.finals || 0}건` }),
                React.createElement(Metric, { label: "\uBAA8\uC9D1 \uAC1C\uC2DC\u00B71\uCC28 \uD074\uB85C\uC988", value: `${(S.launches || 0) + (S.otherCloses || 0)}건` })),
            typeChips.length > 0 && (React.createElement("div", { style: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 } }, typeChips.map(([t, n]) => React.createElement(Tag, { key: t, tone: "outline" },
                t,
                " ",
                n)))),
            A.status && React.createElement("div", { style: { marginTop: 14 } },
                React.createElement(P, null, nm(A.status))),
            (A.finals || []).length > 0 && (React.createElement("div", { style: { marginTop: 14 } },
                React.createElement("div", { style: { font: F(700, 13), color: KB.gray, marginBottom: 4 } }, "\uD30C\uC774\uB110 \uD074\uB85C\uC988"),
                A.finals.map((x, i) => (React.createElement("div", { key: x.id + i, onClick: () => onOpen(x.id, rep.refs && rep.refs[x.id] ? { url: rep.refs[x.id].u } : null), style: { display: 'flex', gap: 10, alignItems: 'baseline', padding: '8px 0', borderTop: i ? `1px solid ${KB.line2}` : 'none', cursor: 'pointer' } },
                    React.createElement("span", { style: { font: F(700, 14), color: KB.ink } }, x.gp),
                    React.createElement("span", { style: { flex: 1, minWidth: 0, font: F(500, 13.5), color: KB.ink2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, x.fund && x.fund !== x.gp ? x.fund : ''),
                    React.createElement("span", { style: { font: F(700, 14), color: KB.gray, whiteSpace: 'nowrap' } }, x.size || '규모 미상')))))),
            (A.launches || []).length + (A.closes || []).length > 0 && (React.createElement("div", { style: { marginTop: 12 } },
                React.createElement("div", { style: { font: F(700, 13), color: KB.gray, marginBottom: 4 } }, "\uBAA8\uC9D1 \uAC1C\uC2DC\u00B7\uC911\uAC04 \uD074\uB85C\uC988"),
                [...(A.launches || []).map((x) => ({ ...x, stage: '모집 개시' })), ...(A.closes || [])].map((x, i) => (React.createElement("div", { key: x.id + i, onClick: () => onOpen(x.id, rep.refs && rep.refs[x.id] ? { url: rep.refs[x.id].u } : null), style: { display: 'flex', gap: 8, alignItems: 'baseline', padding: '7px 0', borderTop: i ? `1px solid ${KB.line2}` : 'none', cursor: 'pointer' } },
                    React.createElement(Tag, { tone: "outline" }, x.stage),
                    React.createElement("span", { style: { font: F(600, 13.5), color: KB.ink } }, x.gp),
                    React.createElement("span", { style: { flex: 1, minWidth: 0, font: F(500, 13), color: KB.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, x.fund && x.fund !== x.gp ? x.fund : ''),
                    x.size && React.createElement("span", { style: { font: F(700, 13), color: KB.gray, whiteSpace: 'nowrap' } }, x.size))))))),
        React.createElement(Section, { title: "\uD55C\uAD6D \uD22C\uC790\uC790", sub: "\uC120\uD638 \uC790\uC0B0\u00B7\uC804\uB7B5\uACFC \uD604\uD669" },
            A.korea ? React.createElement(P, null, nm(A.korea)) : React.createElement("div", { style: { font: F(400, 13.5), color: KB.mute } }, "\uC774\uBC88 \uC8FC \uAD6D\uB0B4 \uD22C\uC790\uC790 \uAD00\uB828 \uBCF4\uB3C4 \uC5C6\uC74C"),
            (A.strategies || []).length > 0 && (React.createElement("div", { style: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 } },
                React.createElement("span", { style: { font: F(600, 12.5), color: KB.sub, marginRight: 2, alignSelf: 'center' } }, "\uC8FC\uBAA9 \uC804\uB7B5"),
                A.strategies.map((s) => React.createElement(Tag, { key: s, tone: "yellow" }, s)))),
            (A.krDeals || []).length > 0 && (React.createElement("div", { style: { marginTop: 14 } },
                React.createElement("div", { style: { font: F(700, 13), color: KB.gray, marginBottom: 4 } }, "\uAD6D\uB0B4 \uAE30\uAD00 \uB51C"),
                A.krDeals.map((x, i) => (React.createElement("div", { key: x.id + x.inst + i, onClick: () => onOpen(x.id, rep.refs && rep.refs[x.id] ? { url: rep.refs[x.id].u } : null), style: { padding: '9px 0', borderTop: i ? `1px solid ${KB.line2}` : 'none', cursor: 'pointer' } },
                    React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' } },
                        React.createElement("span", { style: { font: F(700, 14), color: KB.ink } }, x.inst),
                        React.createElement(Tag, { tone: "outline" }, x.kind),
                        React.createElement(Tag, null, x.overseas ? '해외' : '국내'),
                        x.amount && React.createElement("span", { style: { font: F(700, 13.5), color: KB.gray } }, x.amount)),
                    React.createElement("div", { style: { font: F(500, 13, 1.5), color: KB.sub, marginTop: 3 } }, nm(x.t)))))))),
        React.createElement(Section, { title: "\uC6B4\uC6A9\uC0AC\uBCC4 \uC774\uC288", sub: `${gpIssues.length}곳` }, gpIssues.length ? (desktop ? (React.createElement("div", { style: { border: `1px solid ${KB.line}`, borderRadius: 10, overflow: 'hidden', background: KB.card } },
            React.createElement("table", { style: { borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' } },
                React.createElement("colgroup", null,
                    React.createElement("col", { style: { width: 150 } }),
                    React.createElement("col", null)),
                React.createElement("thead", null,
                    React.createElement("tr", null,
                        React.createElement("th", { style: { font: F(600, 12), color: KB.sub, textAlign: 'left', padding: '9px 12px', background: KB.band, borderBottom: `1px solid ${KB.line}` } }, "\uC6B4\uC6A9\uC0AC"),
                        React.createElement("th", { style: { font: F(600, 12), color: KB.sub, textAlign: 'left', padding: '9px 12px', background: KB.band, borderBottom: `1px solid ${KB.line}` } }, "\uC774\uBC88 \uC8FC \uC774\uC288 \u00B7 \uADFC\uAC70 \uAE30\uC0AC"))),
                React.createElement("tbody", null, gpIssues.map((g, i) => (React.createElement("tr", { key: g.gp + i },
                    React.createElement("td", { style: { font: F(700, 14), color: KB.ink, padding: '12px', verticalAlign: 'top', borderTop: i ? `1px solid ${KB.line2}` : 'none' } }, g.gp),
                    React.createElement("td", { style: { padding: '12px', verticalAlign: 'top', borderTop: i ? `1px solid ${KB.line2}` : 'none' } },
                        React.createElement("div", { style: { font: F(400, 14, 1.7), color: KB.ink2, wordBreak: 'keep-all' } }, nm(g.issue)),
                        React.createElement(WkRefs, { ids: g.refs, refs: rep.refs, onOpen: onOpen }))))))))) : gpIssues.map((g, i) => (React.createElement("div", { key: g.gp + i, style: { padding: '12px 0', borderTop: i ? `1px solid ${KB.line2}` : 'none' } },
            React.createElement("div", { style: { font: F(700, 15), color: KB.ink } }, g.gp),
            React.createElement("div", { style: { font: F(400, 14, 1.7), color: KB.ink2, marginTop: 4, wordBreak: 'keep-all' } }, nm(g.issue)),
            React.createElement(WkRefs, { ids: g.refs, refs: rep.refs, onOpen: onOpen }))))) : React.createElement(Empty, { compact: true, title: q ? '검색 결과가 없습니다' : '이번 주 정리된 운용사 이슈가 없습니다' })),
        React.createElement(Section, { title: "\uD2B8\uB80C\uB4DC\uC640 \uADF8 \uC774\uC720", sub: `${trends.length}건` }, trends.length ? trends.map((t, i) => (React.createElement("div", { key: i, style: { padding: '14px 0', borderTop: i ? `1px solid ${KB.line2}` : 'none' } },
            React.createElement("div", { style: { display: 'flex', gap: 8, alignItems: 'flex-start' } },
                React.createElement("span", { style: { flexShrink: 0, width: 22, height: 22, borderRadius: 11, background: KB.woodDeep, color: '#fff', font: F(700, 12), display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 } }, i + 1),
                React.createElement("div", { style: { flex: 1, minWidth: 0 } },
                    React.createElement("div", { style: { font: F(700, 15, 1.5), color: KB.ink, wordBreak: 'keep-all' } }, nm(t.trend)),
                    t.why && (React.createElement("div", { style: { marginTop: 8, padding: '10px 12px', background: KB.band, borderRadius: 8 } },
                        React.createElement("span", { style: { font: F(700, 12), color: KB.gray, marginRight: 6 } }, "\uC774\uC720"),
                        React.createElement("span", { style: { font: F(400, 14, 1.75), color: KB.ink2, wordBreak: 'keep-all' } }, nm(t.why)))),
                    React.createElement(WkRefs, { ids: t.refs, refs: rep.refs, onOpen: onOpen })))))) : React.createElement(Empty, { compact: true, title: q ? '검색 결과가 없습니다' : '이번 주 정리된 트렌드가 없습니다' })),
        themes.length > 0 && (React.createElement(Section, { title: "\uD14C\uB9C8\uBCC4 \uBCF4\uB3C4 \uCD94\uC774", sub: "\uC774\uBC88 \uC8FC \u00B7 \uC9C1\uC804 \uC8FC \u00B7 \uAD6D\uB0B4 \uBCF4\uB3C4" },
            React.createElement("div", { style: { border: `1px solid ${KB.line}`, borderRadius: 10, overflow: 'hidden', background: KB.card } },
                React.createElement("table", { style: { borderCollapse: 'collapse', width: '100%' } },
                    React.createElement("thead", null,
                        React.createElement("tr", null, ['테마', '이번 주', '직전 주', '변화', '국내'].map((h, i) => React.createElement("th", { key: h, style: { font: F(600, 12), color: KB.sub, textAlign: i ? 'right' : 'left', padding: '8px 10px', background: KB.band, borderBottom: `1px solid ${KB.line}`, whiteSpace: 'nowrap' } }, h)))),
                    React.createElement("tbody", null, themes.filter((t) => hit(t.name)).map((t, i) => {
                        const max = Math.max(...themes.map((x) => x.n), 1);
                        return (React.createElement("tr", { key: t.name },
                            React.createElement("td", { style: { padding: '9px 10px', borderTop: i ? `1px solid ${KB.line2}` : 'none' } },
                                React.createElement("div", { style: { font: F(600, 13.5), color: KB.ink } }, t.name),
                                React.createElement("div", { style: { height: 4, borderRadius: 2, background: KB.line2, marginTop: 5 } },
                                    React.createElement("div", { style: { width: `${(t.n / max) * 100}%`, height: 4, borderRadius: 2, background: KB.yellow } }))),
                            React.createElement("td", { style: { textAlign: 'right', padding: '9px 10px', font: F(700, 13.5), color: KB.ink, borderTop: i ? `1px solid ${KB.line2}` : 'none' } }, t.n),
                            React.createElement("td", { style: { textAlign: 'right', padding: '9px 10px', font: F(500, 13), color: KB.sub, borderTop: i ? `1px solid ${KB.line2}` : 'none' } }, t.prev),
                            React.createElement("td", { style: { textAlign: 'right', padding: '9px 10px', borderTop: i ? `1px solid ${KB.line2}` : 'none' } },
                                React.createElement(WkDelta, { cur: t.n, prev: t.prev })),
                            React.createElement("td", { style: { textAlign: 'right', padding: '9px 10px', font: F(500, 13), color: KB.sub, borderTop: i ? `1px solid ${KB.line2}` : 'none' } }, t.kr)));
                    })))),
            React.createElement("div", { style: { font: F(400, 12, 1.6), color: KB.mute, marginTop: 8 } }, "\uAE30\uC0AC \uC81C\uBAA9\u00B7\uB9AC\uB4DC\uC5D0 \uD574\uB2F9 \uD14C\uB9C8 \uB2E8\uC5B4\uAC00 \uB098\uC628 \uAC74\uC218\uC785\uB2C8\uB2E4(\uD55C \uAE30\uC0AC\uAC00 \uC5EC\uB7EC \uD14C\uB9C8\uC5D0 \uB4E4\uC5B4\uAC08 \uC218 \uC788\uC74C).")))));
}
// ─── 종합 ─────────────────────────────────────────────────────
function WkOverview({ rep, onAsset, onOpen, q }) {
    const desktop = useDesktop();
    const hit = wkHit(q);
    const kr = rep.krShare || [];
    const maxKr = Math.max(1, ...kr.map((x) => x.articles + x.deals));
    const rows = WK_ASSETS.map(([k, label]) => ({ k, label, A: (rep.assets || {})[k] || {} })).filter(({ label, A }) => hit(`${label} ${A.summary || ''} ${A.korea || ''} ${(A.gpIssues || []).map((g) => g.gp + ' ' + g.issue).join(' ')}`));
    return (React.createElement(React.Fragment, null,
        React.createElement(Section, { first: true, title: "\uC774\uBC88 \uC8FC \uD55C \uC904", sub: `${wkDate(rep.from)} ~ ${wkDate(rep.to)}` },
            React.createElement("div", { style: { padding: '14px 16px', background: KB.yellowTint, borderRadius: 10, borderLeft: `4px solid ${KB.yellow}`, font: F(700, 16, 1.65), color: KB.ink, wordBreak: 'keep-all' } }, nm(rep.headline || '')),
            React.createElement("div", { style: { display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10, font: F(500, 12.5), color: KB.sub } },
                React.createElement("span", null,
                    "\uBCF4\uB3C4 ",
                    rep.totals ? rep.totals.articles : 0,
                    "\uAC74 ",
                    React.createElement(WkDelta, { cur: rep.totals ? rep.totals.articles : 0, prev: rep.totals ? rep.totals.prevArticles : null })),
                React.createElement("span", null,
                    "\uB51C ",
                    rep.totals ? rep.totals.deals : 0,
                    "\uAC74"))),
        React.createElement(Section, { title: "\uD55C\uAD6D \uD22C\uC790\uC790 \uB3D9\uD5A5", sub: "\uC120\uD638 \uC790\uC0B0\uAD70\u00B7\uC804\uB7B5" },
            rep.korea && React.createElement("div", { style: { font: F(400, 14.5, 1.8), color: KB.ink2, wordBreak: 'keep-all' } }, nm(rep.korea)),
            React.createElement("div", { style: { marginTop: 14 } },
                React.createElement("div", { style: { font: F(700, 13), color: KB.gray, marginBottom: 8 } }, "\uC790\uC0B0\uAD70\uBCC4 \uAD6D\uB0B4 \uAD00\uB828 \uBCF4\uB3C4\u00B7\uAD6D\uB0B4 LP \uB51C"),
                kr.map((x) => (React.createElement("div", { key: x.k, onClick: () => onAsset(x.k), style: { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', cursor: 'pointer' } },
                    React.createElement("span", { style: { width: desktop ? 130 : 104, flexShrink: 0, font: F(600, 13), color: KB.ink } }, x.label),
                    React.createElement("div", { style: { flex: 1, height: 10, background: KB.line2, borderRadius: 5, overflow: 'hidden', display: 'flex' } },
                        React.createElement("div", { style: { width: `${(x.articles / maxKr) * 100}%`, background: KB.yellow } }),
                        React.createElement("div", { style: { width: `${(x.deals / maxKr) * 100}%`, background: KB.woodDeep } })),
                    React.createElement("span", { style: { width: 86, textAlign: 'right', font: F(600, 12.5), color: KB.sub, whiteSpace: 'nowrap' } },
                        x.articles,
                        "\uAC74 \u00B7 \uB51C ",
                        x.deals)))),
                React.createElement("div", { style: { display: 'flex', gap: 12, marginTop: 6, font: F(500, 11.5), color: KB.mute } },
                    React.createElement("span", { style: { display: 'flex', alignItems: 'center', gap: 4 } },
                        React.createElement("span", { style: { width: 9, height: 9, borderRadius: 2, background: KB.yellow } }),
                        "\uAD6D\uB0B4 \uAD00\uB828 \uBCF4\uB3C4"),
                    React.createElement("span", { style: { display: 'flex', alignItems: 'center', gap: 4 } },
                        React.createElement("span", { style: { width: 9, height: 9, borderRadius: 2, background: KB.woodDeep } }),
                        "\uAD6D\uB0B4 LP \uB51C")))),
        React.createElement(Section, { title: "\uC790\uC0B0\uAD70\uBCC4 \uD55C\uB208\uC5D0", sub: "\uB204\uB974\uBA74 \uC0C1\uC138" }, rows.length ? rows.map(({ k, label, A }, i) => {
            const S = A.stats || {};
            return (React.createElement("div", { key: k, onClick: () => onAsset(k), style: { padding: '13px 0', borderTop: i ? `1px solid ${KB.line2}` : 'none', cursor: 'pointer' } },
                React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
                    React.createElement("span", { style: { font: F(700, 15), color: KB.ink } }, label),
                    React.createElement("span", { style: { font: F(500, 12), color: KB.sub } },
                        "\uBCF4\uB3C4 ",
                        S.articles || 0,
                        "\uAC74"),
                    React.createElement(WkDelta, { cur: S.articles || 0, prev: S.prevArticles }),
                    React.createElement("span", { style: { font: F(500, 12), color: KB.sub } },
                        "\u00B7 \uB51C ",
                        S.deals || 0,
                        " \u00B7 \uD30C\uC774\uB110 ",
                        S.finals || 0),
                    React.createElement("span", { style: { marginLeft: 'auto', color: KB.faint } },
                        React.createElement(Ico, { n: "chevron", size: 16, sw: 2 }))),
                A.summary && React.createElement("div", { style: { font: F(400, 13.5, 1.65), color: KB.ink2, marginTop: 5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'keep-all' } }, nm(A.summary)),
                (A.gpIssues || []).length > 0 && (React.createElement("div", { style: { display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 7 } }, A.gpIssues.slice(0, 5).map((g) => React.createElement(Tag, { key: g.gp, tone: "outline" }, g.gp))))));
        }) : React.createElement(Empty, { compact: true, title: "\uAC80\uC0C9 \uACB0\uACFC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4" }))));
}
// ─── 화면 ─────────────────────────────────────────────────────
function WeeklyScreen({ onOpen }) {
    const desktop = useDesktop();
    const [index, setIndex] = React.useState(null);
    const [key, setKey] = React.useState('');
    const [cache, setCache] = React.useState({});
    const [tab, setTab] = React.useState('all');
    const [q, setQ] = React.useState('');
    const scrollRef = React.useRef(null);
    React.useEffect(() => { getJson('./weekly/index.json').then((d) => { const l = Array.isArray(d) ? d : []; setIndex(l); if (l[0])
        setKey(l[0].key); }); }, []);
    React.useEffect(() => {
        if (!key || cache[key])
            return;
        getJson(`./weekly/${key}.json`).then((d) => { if (d)
            setCache((c) => ({ ...c, [key]: d })); });
    }, [key]);
    const rep = key ? cache[key] : null;
    const pos = (index || []).findIndex((x) => x.key === key);
    const go = (d) => { const n = (index || [])[pos + d]; if (n) {
        setKey(n.key);
        if (scrollRef.current)
            scrollRef.current.scrollTop = 0;
    } };
    const openAsset = (k) => { setTab(k); if (scrollRef.current)
        scrollRef.current.scrollTop = 0; };
    const cur = (index || [])[pos];
    return (React.createElement("div", { style: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: desktop ? KB.band : KB.bg } },
        React.createElement(TopBar, { big: true, title: "\uC2DC\uC7A5\uD604\uD669", sub: rep ? `${wkDate(rep.from)} ~ ${wkDate(rep.to)} · 매주 마지막 영업일 갱신 · ${viaLabel(rep.via)}` : '주간 자산군별 시장현황', border: false }),
        index && index.length > 0 && (React.createElement("div", { style: { flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '0 20px 10px', background: KB.bg } },
            React.createElement("span", { onClick: () => go(1), style: { cursor: pos < index.length - 1 ? 'pointer' : 'default', color: pos < index.length - 1 ? KB.sub : KB.faint, transform: 'scaleX(-1)', display: 'flex' } },
                React.createElement(Ico, { n: "chevron", size: 20, sw: 2 })),
            React.createElement("select", { value: key, onChange: (e) => { setKey(e.target.value); if (scrollRef.current)
                    scrollRef.current.scrollTop = 0; }, style: { flex: desktop ? '0 0 auto' : 1, minWidth: 0, height: 36, padding: '0 10px', borderRadius: 8, border: `1px solid ${KB.line}`, background: KB.card, font: F(600, 14), color: KB.ink } }, index.map((x) => React.createElement("option", { key: x.key, value: x.key },
                wkDate(x.date),
                " \uC8FC\uAC04 (",
                wkShort(x.from),
                "~",
                wkShort(x.to),
                ")"))),
            React.createElement("span", { onClick: () => go(-1), style: { cursor: pos > 0 ? 'pointer' : 'default', color: pos > 0 ? KB.sub : KB.faint, display: 'flex' } },
                React.createElement(Ico, { n: "chevron", size: 20, sw: 2 })),
            cur && pos === 0 && React.createElement(Tag, { tone: "yellow" }, "\uCD5C\uC2E0"))),
        React.createElement("div", { style: { flexShrink: 0, background: KB.bg } },
            React.createElement(Tabs, { scroll: true, pad: 20, items: [['all', '종합'], ...WK_ASSETS], value: tab, onChange: openAsset })),
        React.createElement("div", { ref: scrollRef, style: { flex: 1, minHeight: 0, overflowY: 'auto' } },
            React.createElement("div", { style: { maxWidth: desktop ? 960 : 'none', margin: '0 auto', padding: desktop ? '18px 24px 40px' : '0 0 30px' } },
                React.createElement("div", { style: { padding: desktop ? '0 0 14px' : '12px 20px 4px' } },
                    React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 8, height: 44, padding: '0 14px', background: desktop ? KB.card : KB.band, borderRadius: 10, border: desktop ? `1px solid ${KB.line}` : 'none' } },
                        React.createElement(Ico, { n: "search", size: 18, color: KB.mute }),
                        React.createElement("input", { value: q, onChange: (e) => setQ(e.target.value), placeholder: "\uC6B4\uC6A9\uC0AC\u00B7\uC774\uC288\u00B7\uD2B8\uB80C\uB4DC \uAC80\uC0C9 (\uC608: Blackstone, \uC138\uCEE8\uB354\uB9AC)", style: { flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', font: F(500, 15), color: KB.ink } }),
                        q && React.createElement("span", { onClick: () => setQ(''), style: { color: KB.mute, cursor: 'pointer', display: 'flex' } },
                            React.createElement(Ico, { n: "close", size: 18 })))),
                !index ? React.createElement(Empty, { title: "\uC2DC\uC7A5\uD604\uD669\uC744 \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4" })
                    : !index.length ? React.createElement(Empty, { title: "\uC544\uC9C1 \uBC1C\uD589\uB41C \uC2DC\uC7A5\uD604\uD669\uC774 \uC5C6\uC2B5\uB2C8\uB2E4", desc: "\uB9E4\uC8FC \uB9C8\uC9C0\uB9C9 \uC601\uC5C5\uC77C \uC624\uD6C4\uC5D0 \uD55C \uC8FC\uB97C \uC815\uB9AC\uD574 \uC62C\uB9BD\uB2C8\uB2E4." })
                        : !rep ? React.createElement(Empty, { title: "\uBCF4\uACE0\uC11C\uB97C \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4" })
                            : tab === 'all' ? React.createElement(WkOverview, { rep: rep, onAsset: openAsset, onOpen: onOpen, q: q })
                                : React.createElement(WkAsset, { A: { label: (WK_ASSETS.find(([k]) => k === tab) || [])[1], ...((rep.assets || {})[tab] || {}) }, rep: rep, onOpen: onOpen, q: q }),
                rep && (React.createElement("div", { style: { font: F(400, 12, 1.75), color: KB.mute, padding: desktop ? '16px 4px 0' : '16px 20px 0' } },
                    wkDate(rep.from),
                    "~",
                    wkDate(rep.to),
                    "\uC5D0 \uC218\uC9D1\uB41C \uAE30\uC0AC\u00B7\uB51C\u00B7\uD380\uB4DC\uB808\uC774\uC9D5 \uAE30\uB85D\uB9CC\uC744 \uADFC\uAC70\uB85C \uC815\uB9AC\uD588\uC2B5\uB2C8\uB2E4. \uBD84\uC11D \uBB38\uC7A5\uC740 \uADFC\uAC70 \uAE30\uC0AC\uC5D0 \uC801\uD78C \uC0AC\uC2E4\uB9CC \uC4F0\uB3C4\uB85D \uD588\uACE0, \uC790\uB8CC\uC5D0\uC11C \uD655\uC778\uB418\uC9C0 \uC54A\uB294 \uC22B\uC790\uAC00 \uB4E4\uC5B4\uAC04 \uBB38\uC7A5\uACFC \uADFC\uAC70 \uAE30\uC0AC\uAC00 \uC5C6\uB294 \uC774\uC288\u00B7\uD2B8\uB80C\uB4DC\uB294 \uC790\uB3D9\uC73C\uB85C \uBE90\uC2B5\uB2C8\uB2E4",
                    rep.droppedSentences ? `(이번 주 ${rep.droppedSentences}문장 제외)` : '',
                    ". \uD22C\uC790 \uD310\uB2E8\uC758 \uADFC\uAC70\uB85C \uC4F0\uAE30 \uC804\uC5D0 \uC6D0\uBB38\uC744 \uD655\uC778\uD558\uC138\uC694."))))));
}
