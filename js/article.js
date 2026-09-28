"use strict";
// @ts-nocheck
/*
 * KB GIS — 기사 목록 한 줄 · 기사 상세(전문 보기)
 *
 * 상세 화면
 *   - 전문: 수집기가 확보한 bodies/<id>.json → 없으면 원문 페이지를 받아 브라우저에서 추출(reader.tsx)
 *   - 광고·관련기사·기자 정보·사진 설명 등 기사와 무관한 부분은 article-clean.js 규칙으로 제외
 *   - 문단별 핵심 주제: 문단마다 한 구절만 형광펜
 *   - 용어: 처음 나온 곳에 점선 밑줄 → 누르면 쉬운 설명·그림, 본문 아래에 '이 기사에 나온 용어'
 */
// 형광펜 — 글자 높이 전체를 덮도록 인라인 배경 + 위아래 여백, 줄이 바뀌어도 각 줄에 같은 모양
const HIGHLIGHT = {
    background: 'rgba(196, 154, 104, .34)', // 나뭇결 색 형광펜
    color: KB.ink,
    fontWeight: 600,
    padding: '3px 1px',
    borderRadius: 3,
    boxDecorationBreak: 'clone',
    WebkitBoxDecorationBreak: 'clone',
};
function FeedItem({ item, more = [], onOpen, onOpenOther, onPress, onBookmark, isNew, selected }) {
    const [open, setOpen] = React.useState(false);
    const srcs = [...new Set(more.map((m) => m.source))];
    return (React.createElement("div", { style: { borderBottom: `1px solid ${KB.line2}`, background: selected ? KB.yellowTint : KB.bg } },
        React.createElement("div", { onClick: onOpen, onPointerDown: onPress, style: { display: 'flex', gap: 10, padding: more.length ? '16px 20px 8px' : '16px 20px', cursor: 'pointer' } },
            React.createElement("div", { style: { flex: 1, minWidth: 0 } },
                React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 5, font: F(600, 12.5), color: KB.gray, minWidth: 0 } },
                    isNew && React.createElement("span", { title: "\uC0C8 \uAE30\uC0AC", style: { width: 6, height: 6, borderRadius: 3, background: KB.yellow, flexShrink: 0 } }),
                    React.createElement("span", { style: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, item.instLabel),
                    item.assetLabel && React.createElement("span", { style: { color: KB.faint } }, "\u00B7"),
                    item.assetLabel && React.createElement("span", { style: { font: F(500, 12.5), color: KB.mute, whiteSpace: 'nowrap' } }, item.assetLabel)),
                React.createElement("div", { style: { font: F(600, 16, 1.45), color: KB.ink, marginTop: 6, letterSpacing: '-.01em', wordBreak: 'keep-all', overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' } }, item.ko),
                item.tko && React.createElement("div", { style: { font: F(500, 14.5, 1.45), color: KB.ko, marginTop: 4, wordBreak: 'keep-all', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } }, item.tko),
                React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 5, marginTop: 8, font: F(500, 12), color: KB.mute, minWidth: 0 } },
                    React.createElement("span", { style: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '50%' } }, item.source),
                    React.createElement("span", null, "\u00B7"),
                    React.createElement("span", { style: { whiteSpace: 'nowrap' } }, shortWhen(item)),
                    item.b ? React.createElement(Tag, { tone: "outline", style: { height: 18, padding: '0 5px', font: F(600, 10.5), marginLeft: 2 } }, "\uC804\uBB38") : null,
                    item.lang === 'en' && React.createElement(Tag, { tone: "outline", style: { height: 18, padding: '0 5px', font: F(600, 10.5) } }, "EN"))),
            React.createElement("div", { onClick: onBookmark, role: "button", "aria-label": "\uBD81\uB9C8\uD06C", style: { alignSelf: 'flex-start', padding: 4, margin: '-2px -6px 0 0', cursor: 'pointer' } },
                React.createElement(Ico, { n: "bookmark", size: 20, sw: 1.7, fill: item.bookmarked ? KB.yellow : 'none', color: item.bookmarked ? KB.gray : KB.faint }))),
        more.length > 0 && (React.createElement("div", { style: { padding: '0 20px 12px' } },
            React.createElement("div", { onClick: () => setOpen((o) => !o), role: "button", style: { display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: '100%', padding: '4px 10px', borderRadius: 14, background: KB.band, font: F(600, 12), color: KB.sub, cursor: 'pointer' } },
                React.createElement("span", { style: { whiteSpace: 'nowrap' } },
                    "\uAC19\uC740 \uC18C\uC2DD ",
                    more.length,
                    "\uAC74"),
                React.createElement("span", { style: { font: F(500, 12), color: KB.mute, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } },
                    "\u00B7 ",
                    srcs.slice(0, 3).join(', '),
                    srcs.length > 3 ? ' 외' : ''),
                React.createElement("span", { style: { display: 'flex', transform: open ? 'rotate(180deg)' : 'none', color: KB.faint } },
                    React.createElement(Ico, { n: "down", size: 14, sw: 2 }))),
            open && (React.createElement("div", { style: { marginTop: 6, borderLeft: `2px solid ${KB.line}`, paddingLeft: 12 } }, more.map((m) => (React.createElement("div", { key: m.id, onClick: () => onOpenOther && onOpenOther(m.id), onPointerDown: () => fetchArchiveBody(m), style: { padding: '7px 0', cursor: 'pointer' } },
                React.createElement("div", { style: { font: F(500, 13.5, 1.45), color: KB.ink2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } }, m.tko || m.ko),
                React.createElement("div", { style: { font: F(500, 11.5), color: KB.mute, marginTop: 2 } },
                    m.source,
                    " \u00B7 ",
                    shortWhen(m),
                    m.b ? ' · 전문' : ''))))))))));
}
// 날짜별 머리(목록 안에서 고정)
function DayHeader({ label, count }) {
    return (React.createElement("div", { style: { position: 'sticky', top: 0, zIndex: 1, display: 'flex', alignItems: 'baseline', gap: 6, padding: '10px 20px 9px', background: KB.band, borderBottom: `1px solid ${KB.line}` } },
        React.createElement("span", { style: { font: F(700, 13.5), color: KB.ink } }, label),
        count != null && React.createElement("span", { style: { font: F(500, 12), color: KB.mute } },
            count,
            "\uAC74")));
}
// 본문 속 용어 — 점선 밑줄, 누르면 설명
function TermMark({ g, onOpen, children }) {
    return (React.createElement("span", { onClick: (e) => { e.stopPropagation(); onOpen && onOpen(g.id); }, title: g.short, style: { borderBottom: `1.5px dotted ${KB.gray}`, cursor: 'pointer', paddingBottom: 1 } }, children));
}
function BodySkeleton() {
    return (React.createElement("div", { "aria-label": "\uBCF8\uBB38\uC744 \uBD88\uB7EC\uC624\uB294 \uC911" }, [92, 100, 96, 88, 60, 0, 97, 100, 84].map((w, i) => (w ? React.createElement("div", { key: i, style: { height: 14, width: w + '%', background: KB.band, borderRadius: 4, margin: '0 0 13px' } }) : React.createElement("div", { key: i, style: { height: 12 } })))));
}
function ArticleDetail({ sel, bookmarked, onToggleBm, onShare, onBack, showBack, deals, onOpenDeal, onOpenInst, onOpenTerm, onDead }) {
    const desktop = useDesktop();
    const [st, setSt] = React.useState({ id: null, body: '', ko: null, loading: false, dead: false, src: '' });
    const [lang, setLang] = React.useState('both'); // 영문 기사: both(한영 병기) | ko | en
    const [openTerm, setOpenTerm] = React.useState(null);
    const [retryOf, setRetryOf] = React.useState({ id: null, n: 0 }); // 본문 다시 불러오기(기사별)
    const retry = sel && retryOf.id === sel.id ? retryOf.n : 0;
    const scrollRef = React.useRef(null);
    React.useEffect(() => {
        if (!sel)
            return undefined;
        setOpenTerm(null);
        if (scrollRef.current && !retry)
            scrollRef.current.scrollTop = 0;
        setSt({ id: sel.id, body: '', ko: null, loading: true, dead: false, src: '' });
        const ctrl = new AbortController();
        let off = false;
        loadArticleBody(sel, ctrl.signal)
            .then((r) => {
            if (off)
                return;
            setSt({ id: sel.id, body: r.body || '', ko: r.ko || null, loading: false, dead: !!r.dead, src: r.src || '' });
            if (r.dead && onDead)
                onDead(sel.id);
        })
            .catch(() => { if (!off)
            setSt((s) => ({ ...s, loading: false })); });
        return () => { off = true; ctrl.abort(); };
    }, [sel ? sel.id : null, retry]);
    if (!sel) {
        return (React.createElement("div", { style: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: KB.band } },
            React.createElement(Empty, { icon: "book", title: "\uC67C\uCABD \uBAA9\uB85D\uC5D0\uC11C \uAE30\uC0AC\uB97C \uC120\uD0DD\uD558\uC138\uC694", desc: "\uAE30\uC0AC \uC804\uBB38\uACFC \uD575\uC2EC \uBB38\uC7A5, \uC6A9\uC5B4 \uC124\uBA85\uC744 \uD568\uAED8 \uBCFC \uC218 \uC788\uC2B5\uB2C8\uB2E4." })));
    }
    const mine = st.id === sel.id;
    const lead0 = cleanBody(sel.body || '');
    const lead = lead0 && titleOk(sel.ko, lead0) ? lead0 : ''; // 제목과 무관한 리드(매체 소개문 등)는 쓰지 않는다
    const fetched = mine ? nm(st.body) : '';
    const text = fetched && fetched.length >= lead.length * 0.8 ? fetched : (lead || fetched);
    const isFull = !!fetched && fetched.length > Math.max(420, lead.length + 40);
    const loading = mine ? st.loading : true;
    // 문장이 하나도 없는 조각(다른 기사 제목·메뉴 잔재)만 남았다면 본문이 없는 것으로 본다
    const ko = mine && st.ko && Array.isArray(st.ko.p) ? st.ko : null;
    const isEn = sel.lang === 'en';
    const rawParas = ko && fetched ? String(fetched).split(/\n+/).map((x) => x.trim()).filter(Boolean) : toParagraphs(text, sel.ko);
    const paragraphs = rawParas.some((p) => isSentencey(p.replace(/…$/, '')) || p.length > 90) ? rawParas : [];
    const mark = makeTermMarker(12);
    // 문단 하나 그리기 — 용어 밑줄 + (있으면) 핵심 주제 구절 형광펜
    let hlCount = 0;
    const renderText = (t, withHl) => {
        const r = withHl ? keyPhrase(t, sel.inst) : null;
        const run = (x, base) => mark(x).map((y, k) => (y.g ? React.createElement(TermMark, { key: base + k, g: y.g, onOpen: onOpenTerm }, y.t) : React.createElement(React.Fragment, { key: base + k }, y.t)));
        if (!r)
            return run(t, 'a');
        hlCount++;
        return [...run(t.slice(0, r[0]), 'a'), React.createElement("span", { key: "hl", style: HIGHLIGHT }, run(t.slice(r[0], r[1]), 'h')), ...run(t.slice(r[1]), 'z')];
    };
    const realUrl = sel.url && /^https?:\/\//i.test(sel.url) ? sel.url : '';
    const viewUrl = sel.gurl && /^https?:\/\//i.test(sel.gurl) ? sel.gurl : realUrl;
    const terms = findTerms(`${sel.ko} ${text}`, 8);
    const when = fmtDate(itemMs(sel)) + (sel.time ? ' ' + sel.time : '');
    // 번역문에 섞여 나온 한자 표기("伦敦(런던)")는 괄호 속 한글만 남긴다
    // 번역이 영문 그대로 돌아온 문단(한글이 없는 문단)은 번역으로 보이지 않는다
    const koOf = (pi) => {
        const t = ko && pi < (ko.n || ko.p.length) ? String(ko.p[pi] || '') : '';
        return /[가-힣]/.test(t) ? nm(t.replace(/[\u4e00-\u9fff]+\(([^()]{1,30})\)/g, '$1')) : '';
    };
    const koNode = (pi, sub) => {
        const t = koOf(pi);
        if (!t)
            return null;
        return sub
            ? React.createElement("div", { key: 'k' + pi, style: { font: F(700, 16, 1.5), color: KB.ko, margin: lang === 'ko' ? '28px 0 10px' : '-4px 0 12px' } }, t)
            : React.createElement("p", { key: 'k' + pi, style: { font: F(400, 16, 1.85), color: KB.ko, margin: lang === 'ko' ? '0 0 20px' : '-8px 0 24px', wordBreak: 'keep-all', overflowWrap: 'anywhere' } }, renderText(t, true));
    };
    const showEn = !ko || lang !== 'ko';
    const showKo = ko && lang !== 'en';
    const bodyNodes = paragraphs.map((_, pi) => {
        const p = paragraphs[pi];
        const sub = isSubhead(p, paragraphs[pi + 1]);
        if (!showEn)
            return koNode(pi, sub) || (lang === 'ko' && pi >= (ko.n || ko.p.length) ? React.createElement("p", { key: pi, style: { font: F(400, 16.5, 1.9), color: KB.ink2, margin: '0 0 20px' } }, p) : null);
        if (sub) {
            return React.createElement(React.Fragment, { key: pi },
                React.createElement("h3", { style: { font: F(700, 17, 1.5), color: KB.ink, margin: '28px 0 10px', letterSpacing: '-.01em' } }, p),
                showKo && koNode(pi, true));
        }
        return (React.createElement(React.Fragment, { key: pi },
            React.createElement("p", { style: { font: F(400, 16.5, 1.9), color: KB.ink2, margin: '0 0 20px', wordBreak: 'keep-all', overflowWrap: 'anywhere' } }, renderText(p, !(showKo && koOf(pi)))),
            showKo && koNode(pi, false)));
    });
    return (React.createElement("div", { style: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: KB.bg } },
        React.createElement(TopBar, { onBack: showBack ? onBack : null, backLabel: showBack ? '' : '', title: desktop ? '' : '', right: React.createElement(React.Fragment, null,
                React.createElement(IconBtn, { n: "bookmark", label: bookmarked ? '북마크 해제' : '북마크', active: bookmarked, onClick: onToggleBm }),
                React.createElement(IconBtn, { n: "share", label: "\uACF5\uC720", onClick: onShare }),
                viewUrl && React.createElement("a", { href: viewUrl, target: "_blank", rel: "noopener noreferrer", "aria-label": "\uC6D0\uBB38 \uC5F4\uAE30", title: "\uC6D0\uBB38 \uC5F4\uAE30", style: { width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', color: KB.ink2 } },
                    React.createElement(Ico, { n: "external", size: 21 }))) }),
        React.createElement("div", { ref: scrollRef, style: { flex: 1, minHeight: 0, overflowY: 'auto' } },
            React.createElement("article", { style: { maxWidth: 720, margin: '0 auto', padding: desktop ? '28px 32px 48px' : '22px 20px 40px' } },
                React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' } },
                    React.createElement(Tag, { tone: "dark" }, sel.catLabel),
                    sel.cat !== '마켓' && sel.inst && (React.createElement("span", { onClick: () => onOpenInst && onOpenInst(sel), style: { font: F(600, 13), color: KB.gray, cursor: onOpenInst ? 'pointer' : 'default' } }, sel.inst)),
                    React.createElement("span", { style: { font: F(500, 13), color: KB.mute } }, [sel.assetLabel, sel.regionLabel].filter(Boolean).join(' · '))),
                React.createElement("h1", { style: { font: F(700, desktop ? 26 : 23, 1.4), color: KB.ink, letterSpacing: '-.025em', margin: '12px 0 0', wordBreak: 'keep-all', overflowWrap: 'anywhere' } }, sel.ko),
                sel.tko && React.createElement("div", { style: { font: F(600, isEn ? 19 : 17, 1.45), color: KB.ko, marginTop: 8, wordBreak: 'keep-all' } }, sel.tko),
                React.createElement("div", { style: { font: F(500, 13), color: KB.mute, marginTop: 12, paddingBottom: 18, borderBottom: `1px solid ${KB.line}` } },
                    sel.source,
                    " \u00B7 ",
                    when),
                isEn && (React.createElement("div", { style: { margin: '16px 0 0' } },
                    ko ? (React.createElement("div", { style: { display: 'inline-flex', padding: 3, background: KB.band, borderRadius: 10 } }, [['both', '한영 병기'], ['ko', '한글'], ['en', 'English']].map(([k, l]) => (React.createElement("div", { key: k, onClick: () => setLang(k), style: { padding: '7px 14px', borderRadius: 8, cursor: 'pointer', font: lang === k ? F(700, 13) : F(500, 13), color: lang === k ? KB.ink : KB.sub, background: lang === k ? KB.card : 'transparent', boxShadow: lang === k ? '0 1px 2px rgba(0,0,0,.08)' : 'none' } }, l))))) : (!loading && paragraphs.length > 0 && (React.createElement("div", { style: { font: F(500, 12.5, 1.6), color: KB.mute } }, "\uBCF8\uBB38 \uBC88\uC5ED\uC740 \uC218\uC9D1\uD560 \uB54C \uCD5C\uC2E0 \uAE30\uC0AC\uBD80\uD130 \uCC28\uB840\uB85C \uBC18\uC601\uB429\uB2C8\uB2E4. \uC544\uC9C1 \uBC88\uC5ED\uB418\uC9C0 \uC54A\uC544 \uC601\uBB38\uC73C\uB85C \uD45C\uC2DC\uD569\uB2C8\uB2E4."))),
                    ko && React.createElement("div", { style: { font: F(500, 12, 1.6), color: KB.mute, marginTop: 8 } },
                        React.createElement("span", { style: { color: KB.ko, fontWeight: 600 } }, "\uD30C\uB780 \uAE00\uC528"),
                        "\uB294 \uD55C\uAD6D\uC5B4 \uBC88\uC5ED\uC785\uB2C8\uB2E4",
                        ko.n && ko.n < paragraphs.length ? ` · 앞 ${ko.n}개 문단 번역` : '',
                        "."))),
                React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '18px 0 16px', font: F(500, 12.5), color: KB.mute } },
                    loading && !paragraphs.length ? React.createElement("span", null, "\uC6D0\uBB38\uC5D0\uC11C \uBCF8\uBB38\uC744 \uBD88\uB7EC\uC624\uB294 \uC911")
                        : isFull ? React.createElement(Tag, { tone: "outline" }, "\uC804\uBB38")
                            : paragraphs.length ? React.createElement(Tag, null, "\uAE30\uC0AC \uC55E\uBD80\uBD84") : null,
                    hlCount > 0 && React.createElement("span", { style: { display: 'inline-flex', alignItems: 'center', gap: 5 } },
                        React.createElement("span", { style: { ...HIGHLIGHT, padding: '0 6px', fontWeight: 600, font: F(600, 11.5) } }, "\uD575\uC2EC"),
                        "\uBB38\uB2E8\uBCC4 \uD575\uC2EC \uC8FC\uC81C"),
                    terms.length > 0 && React.createElement("span", { style: { display: 'inline-flex', alignItems: 'center', gap: 5 } },
                        React.createElement("span", { style: { borderBottom: `1.5px dotted ${KB.gray}`, color: KB.ink2 } }, "\uC6A9\uC5B4"),
                        "\uB204\uB974\uBA74 \uC124\uBA85"),
                    loading && paragraphs.length > 0 && React.createElement("span", null, "\uC804\uBB38 \uBD88\uB7EC\uC624\uB294 \uC911")),
                paragraphs.length ? bodyNodes
                    : loading ? React.createElement(BodySkeleton, null)
                        : (mine && st.dead)
                            ? React.createElement("div", { style: { padding: '14px 16px', background: KB.band, borderRadius: 10, font: F(500, 14, 1.65), color: KB.ink2 } }, "\uC6D0\uBB38 \uAE30\uC0AC\uAC00 \uC0AD\uC81C\uB418\uC5B4 \uB354 \uC774\uC0C1 \uBCFC \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uB2E4\uC74C \uC218\uC9D1 \uB54C \uBAA9\uB85D\uC5D0\uC11C \uBE60\uC9D1\uB2C8\uB2E4.")
                            : React.createElement("div", { style: { padding: '14px 16px', background: KB.band, borderRadius: 10, font: F(500, 14, 1.65), color: KB.ink2 } },
                                "\uC5B8\uB860\uC0AC \uBCF4\uC548 \uC815\uCC45(\uC720\uB8CC\u00B7\uC811\uADFC \uC81C\uD55C)\uC73C\uB85C \uBCF8\uBB38\uC744 \uAC00\uC838\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC544\uB798 \u2018\uC6D0\uBB38 \uBCF4\uAE30\u2019\uB85C \uD655\uC778\uD558\uC138\uC694.",
                                realUrl && React.createElement("span", { onClick: () => setRetryOf({ id: sel.id, n: retry + 1 }), role: "button", style: { display: 'inline-block', marginLeft: 6, font: F(600, 13.5), color: KB.gray, textDecoration: 'underline', textUnderlineOffset: 3, cursor: 'pointer' } }, "\uB2E4\uC2DC \uC2DC\uB3C4")),
                !loading && paragraphs.length > 0 && !isFull && realUrl && (React.createElement("div", { style: { font: F(500, 13.5, 1.6), color: KB.sub, padding: '12px 14px', background: KB.band, borderRadius: 10, marginTop: 4 } }, sel.paywalled ? '유료 기사라 앞부분만 제공됩니다. 전체 내용은 원문에서 확인하세요.' : '언론사 보안 정책(유료·접근 제한)으로 전문을 가져오지 못해 앞부분만 표시했습니다. 전체 내용은 원문에서 확인하세요.')),
                React.createElement("div", { style: { display: 'flex', gap: 8, marginTop: 22 } },
                    viewUrl && React.createElement(Btn, { href: viewUrl, icon: "external", full: true }, "\uC6D0\uBB38 \uBCF4\uAE30"),
                    React.createElement(Btn, { kind: "secondary", icon: "share", onClick: onShare, style: { flex: viewUrl ? '0 0 auto' : 1, width: viewUrl ? 'auto' : '100%' } }, "\uACF5\uC720")),
                React.createElement("div", { style: { font: F(400, 12, 1.7), color: KB.mute, marginTop: 12 } }, paragraphs.length
                    ? `본문 출처 ${sel.source}. 광고·관련기사·기자 정보·사진 설명 등 기사 내용과 무관한 부분은 자동으로 제외했습니다. 핵심 문장 표시는 금액·출자·인수 같은 표현을 기준으로 고른 참고용입니다.`
                    : `출처 ${sel.source}`),
                deals && deals.length > 0 && (React.createElement("div", { style: { marginTop: 34 } },
                    React.createElement("div", { style: { font: F(700, 17), color: KB.ink, paddingBottom: 10, borderBottom: `2px solid ${KB.ink}` } }, "\uC774 \uAE30\uC0AC\uC758 \uD22C\uC790\uB0B4\uC5ED"),
                    clusterDeals(deals).map((c, i) => React.createElement(DealRow, { key: c.key + i, c: c, first: true, showInst: true, onInst: onOpenInst ? (e) => onOpenInst(e) : null })))),
                terms.length > 0 && (React.createElement("div", { style: { marginTop: 34 } },
                    React.createElement("div", { style: { display: 'flex', alignItems: 'baseline', gap: 8, paddingBottom: 10, borderBottom: `2px solid ${KB.ink}` } },
                        React.createElement("span", { style: { font: F(700, 17), color: KB.ink } }, "\uC774 \uAE30\uC0AC\uC5D0 \uB098\uC628 \uC6A9\uC5B4"),
                        React.createElement("span", { style: { font: F(500, 12.5), color: KB.mute } }, "\uB20C\uB7EC\uC11C \uC26C\uC6B4 \uC124\uBA85\uACFC \uADF8\uB9BC \uBCF4\uAE30")),
                    terms.map((g) => (React.createElement(TermCard, { key: g.id, g: g, open: openTerm === g.id, onToggle: () => setOpenTerm((o) => (o === g.id ? null : g.id)), onOpenTerm: onOpenTerm })))))))));
}
// 용어 설명 시트(어느 화면에서나)
function TermSheet({ id, onClose, onOpenTerm, onLearn }) {
    const g = id ? GLOSSARY_BY_ID[id] : null;
    return (React.createElement(Sheet, { open: !!g, onClose: onClose, title: "\uC6A9\uC5B4 \uC124\uBA85" }, g && (React.createElement(React.Fragment, null,
        React.createElement(TermCard, { g: g, open: true, onToggle: () => { }, onOpenTerm: onOpenTerm }),
        React.createElement("div", { style: { marginTop: 16 } },
            React.createElement(Btn, { kind: "secondary", full: true, icon: "book", onClick: onLearn }, "\uC6A9\uC5B4\u00B7\uAC1C\uB150 \uC804\uCCB4 \uBCF4\uAE30"))))));
}
// 공유 시트 — OS 공유를 못 쓰는 환경용(실제 기사 주소만 다룬다)
function ShareSheet({ open, item, onClose, onCopied }) {
    if (!item)
        return null;
    const url = item.url || '';
    const copy = () => {
        try {
            navigator.clipboard && navigator.clipboard.writeText(url);
        }
        catch (e) { /* 무시 */ }
        onCopied && onCopied();
    };
    const mail = `mailto:?subject=${encodeURIComponent(item.ko)}&body=${encodeURIComponent(item.ko + '\n' + url)}`;
    return (React.createElement(Sheet, { open: open, onClose: onClose, title: "\uACF5\uC720" },
        React.createElement("div", { style: { font: F(600, 15, 1.5), color: KB.ink } }, item.ko),
        React.createElement("div", { style: { font: F(500, 12.5), color: KB.mute, marginTop: 4 } }, item.source),
        React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, padding: '10px 10px 10px 14px', background: KB.band, borderRadius: 10 } },
            React.createElement("span", { style: { flex: 1, minWidth: 0, font: F(500, 13), color: KB.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, url),
            React.createElement(Btn, { onClick: copy, style: { height: 36, padding: '0 14px', font: F(700, 13) } }, "\uBCF5\uC0AC")),
        React.createElement("div", { style: { marginTop: 10 } },
            React.createElement(Btn, { kind: "secondary", full: true, href: mail, icon: "external" }, "\uBA54\uC77C\uB85C \uBCF4\uB0B4\uAE30"))));
}
