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
// Merge incoming articles into the stored set WITHOUT dropping old ones,
// so the archive accumulates over time and stays fully searchable.
function mergeArticles(existing, incoming) {
    const map = {};
    (existing || []).forEach(a => { if (a && a.id)
        map[a.id] = a; });
    (incoming || []).forEach(a => { if (a && a.id)
        map[a.id] = { ...map[a.id], ...a }; });
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
// Canonical share URL for an article.
function articleUrl(it) {
    if (!it)
        return 'https://kbgis.app';
    return it.url || ('https://kbgis.app/news/' + it.id);
}
const ASSET = {
    RE: { label: '부동산', code: 'Real Estate', color: 'oklch(0.62 0.13 55)' },
    PC: { label: '사모대출', code: 'Private Credit', color: 'oklch(0.6 0.12 210)' },
    PE: { label: '사모펀드', code: 'Private Equity', color: 'oklch(0.58 0.13 290)' },
    IN: { label: '인프라', code: 'Infrastructure', color: 'oklch(0.58 0.12 155)' },
};
const REGION = { US: '미국', EU: '유럽', AP: '아시아', GL: '글로벌' };
const CAT_LABEL = { LP: '한국 LP 동향', GP: '해외 GP 동향', '인사': 'CIO·인사 이동' };
const GROUPS = ['연기금', '공제회', '운용·증권', '보험·캐피탈', '해외 GP'];
function grp(t) {
    if (t === '연기금')
        return '연기금';
    if (t === '공제회')
        return '공제회';
    if (t === '자산운용사' || t === '증권사')
        return '운용·증권';
    if (t === '보험사' || t === '캐피탈')
        return '보험·캐피탈';
    if (t === '해외 GP')
        return '해외 GP';
    return '기타';
}
const BASE = [
    { id: 'n1', cat: 'LP', inst: '국민연금', instType: '연기금', asset: 'RE', region: 'US', date: '06.26', time: '08:12', source: 'Mandate Wire', lang: 'en',
        ko: '국민연금, 미국 멀티패밀리 메자닌 대출에 5억 달러 추가 배정',
        en: 'NPS allocates an additional $500M to U.S. multifamily mezzanine debt',
        metric: '+$500M', metricLabel: '추가 배정액',
        ai: ['국민연금이 미국 멀티패밀리 메자닌 대출에 5억 달러를 추가 배정했다.', '고금리 환경에서 안정적 인컴 확보를 노린 행보로 풀이된다.', '대체투자 내 사모대출 목표 배분율은 12%로 상향됐다.'],
        body: '국민연금공단이 미국 멀티패밀리(다세대 임대주택) 메자닌 대출에 5억 달러를 추가로 배정했다. 최근 고금리 환경에서 선순위 대비 높은 금리를 받으면서도 담보가치 하단이 두꺼운 메자닌 구조의 매력이 부각된 결과다. 국민연금은 올해 대체투자 포트폴리오에서 사모대출 비중을 단계적으로 확대하고 있다.',
        enBody: 'The National Pension Service has committed an additional $500 million to U.S. multifamily mezzanine debt, citing attractive risk-adjusted yields in a higher-for-longer rate environment. The allocation is part of a broader push to grow private credit within its alternatives book toward a 12% target.' },
    { id: 'n2', cat: 'LP', inst: '교직원공제회', instType: '공제회', asset: 'PE', region: 'EU', date: '06.26', time: '07:48', source: '한국경제', lang: 'ko',
        ko: '한국교직원공제회, 유럽 바이아웃 코인베스트에 2,000억 원 약정',
        en: 'The-K commits ₩200bn to European buyout co-investments',
        metric: '₩2,000억', metricLabel: '신규 약정액',
        ai: ['교직원공제회가 유럽 바이아웃 코인베스트 프로그램에 2,000억 원을 약정했다.', '검증된 GP와의 공동투자로 수수료를 낮추는 전략이다.', '유럽 중견기업(미드캡) 딜에 집중 배정될 예정이다.'],
        body: '한국교직원공제회가 유럽 바이아웃 펀드 운용사들과의 코인베스트(공동투자) 프로그램에 2,000억 원을 신규 약정했다. 블라인드 펀드 출자에 더해 직접 딜에 함께 참여해 운용보수와 성과보수를 절감하려는 의도다. 주로 유럽 미드캡 기업 인수 건에 자금이 배정될 전망이다.',
        enBody: null },
    { id: 'n3', cat: 'LP', inst: '행정공제회', instType: '공제회', asset: 'IN', region: 'GL', date: '06.26', time: '07:30', source: 'IPE Real Assets', lang: 'en',
        ko: '행정공제회(POBA), 글로벌 인프라 블라인드펀드에 3억 달러 출자',
        en: 'POBA commits $300M to a global infrastructure blind-pool fund',
        metric: '+$300M', metricLabel: '출자액',
        ai: ['행정공제회가 글로벌 코어플러스 인프라 펀드에 3억 달러를 출자했다.', '에너지 전환·디지털 인프라 자산에 분산 투자된다.', '물가 연동 현금흐름으로 인플레 헤지를 노린다.'],
        body: '행정공제회(POBA)가 글로벌 운용사의 코어플러스 인프라 블라인드펀드에 3억 달러를 출자했다. 전력·재생에너지, 디지털 인프라(데이터센터·통신탑) 등 물가에 연동되는 현금흐름 자산이 주요 투자 대상이다. 인플레이션 헤지와 장기 안정 수익을 동시에 겨냥한 배분이다.',
        enBody: "The Public Officials Benefit Association (POBA) has committed $300 million to a global core-plus infrastructure fund. The mandate targets energy transition and digital infrastructure assets with inflation-linked cash flows, supporting POBA's goal of stable long-duration returns." },
    { id: 'n4', cat: 'LP', inst: '미래에셋자산운용', instType: '자산운용사', asset: 'RE', region: 'US', date: '06.26', time: '07:05', source: '더벨', lang: 'ko',
        ko: '미래에셋운용, 미국 데이터센터 개발에 7억 달러 규모 투자 추진',
        en: 'Mirae Asset to invest $700M in U.S. data-center development',
        metric: '$700M', metricLabel: '투자 추진 규모',
        ai: ['미래에셋자산운용이 미국 데이터센터 개발 사업에 7억 달러 투자를 추진한다.', 'AI 수요로 급증한 데이터센터 임대 수요를 겨냥했다.', '국내 기관 자금을 모아 공동 출자 구조로 진행한다.'],
        body: '미래에셋자산운용이 미국 주요 거점의 하이퍼스케일 데이터센터 개발 사업에 약 7억 달러 규모 투자를 추진한다. 생성형 AI 확산으로 컴퓨팅 수요가 폭증하면서 데이터센터 임대 시장이 구조적 성장 국면에 진입했다는 판단이다. 국내 연기금·공제회 자금을 모아 공동 출자하는 구조로 설계 중이다.',
        enBody: null },
    { id: 'n5', cat: 'LP', inst: '삼성생명', instType: '보험사', asset: 'PC', region: 'EU', date: '06.25', time: '19:40', source: 'Private Debt Investor', lang: 'en',
        ko: '삼성생명, 유럽 사모대출 펀드에 4억 유로 출자',
        en: 'Samsung Life commits €400M to a European private credit fund',
        metric: '€400M', metricLabel: '출자액',
        ai: ['삼성생명이 유럽 다이렉트 렌딩 펀드에 4억 유로를 출자했다.', '보험 부채에 맞춘 장기·안정 인컴 자산 확보가 목적이다.', '유럽 미드마켓 기업 대출이 핵심 투자 대상이다.'],
        body: '삼성생명이 유럽 미드마켓 기업을 대상으로 한 다이렉트 렌딩(직접대출) 펀드에 4억 유로를 출자했다. 장기 보험 부채에 대응하기 위한 안정적 인컴 자산 확보 차원으로, 변동금리 기반 사모대출의 인컴 매력이 부각됐다.',
        enBody: 'Samsung Life has committed €400 million to a European direct lending fund focused on mid-market corporates. The insurer is seeking stable, long-duration income to match its liabilities, with floating-rate private credit offering attractive yields.' },
    { id: 'n6', cat: 'LP', inst: 'KIC', instType: '연기금', asset: 'IN', region: 'AP', date: '06.25', time: '18:20', source: 'IPE Real Assets', lang: 'en',
        ko: '한국투자공사(KIC), 아시아 신재생 인프라에 3억 달러 공동투자',
        en: 'KIC co-invests $300M in Asian renewable infrastructure',
        metric: '+$300M', metricLabel: '공동투자액',
        ai: ['KIC가 아시아 신재생에너지 인프라에 3억 달러를 공동투자했다.', '태양광·풍력 발전 자산 포트폴리오가 대상이다.', '에너지 전환 테마의 장기 성장에 베팅했다.'],
        body: '한국투자공사(KIC)가 글로벌 인프라 운용사와 함께 아시아 지역 신재생에너지 인프라에 3억 달러를 공동투자했다. 태양광·풍력 발전 자산과 관련 송배전 인프라가 주요 대상이다. 에너지 전환이라는 구조적 테마의 장기 성장성에 주목한 투자다.',
        enBody: "The Korea Investment Corporation has co-invested $300 million in Asian renewable energy infrastructure alongside a global manager. The portfolio spans solar and wind generation assets, reflecting KIC's conviction in the long-term energy transition theme." },
    { id: 'n7', cat: 'LP', inst: '군인공제회', instType: '공제회', asset: 'PE', region: 'US', date: '06.25', time: '16:10', source: '서울경제', lang: 'ko',
        ko: '군인공제회, 북미 PE 세컨더리 펀드에 1,500억 원 신규 출자',
        en: 'MMAA commits ₩150bn to a North American PE secondaries fund',
        metric: '₩1,500억', metricLabel: '신규 출자액',
        ai: ['군인공제회가 북미 PE 세컨더리 펀드에 1,500억 원을 출자했다.', '할인 매입으로 J커브를 완화하는 전략이다.', '분배 지연 환경에서 유동성 확보 수단으로 주목된다.'],
        body: '군인공제회가 북미 사모펀드(PE) 세컨더리 전문 펀드에 1,500억 원을 신규 출자했다. 기존 LP 지분을 할인된 가격에 매입해 초기 손실 구간(J커브)을 완화하고 빠른 분배를 기대할 수 있다는 점이 매력으로 꼽힌다. 분배가 지연되는 시장 환경에서 세컨더리가 유동성 대안으로 부각되고 있다.',
        enBody: null },
    { id: 'n8', cat: 'LP', inst: '미래에셋증권', instType: '증권사', asset: 'RE', region: 'EU', date: '06.25', time: '14:25', source: '매일경제', lang: 'ko',
        ko: '미래에셋증권, 런던 오피스 빌딩 인수금융 5,000억 원 주선',
        en: 'Mirae Asset Securities arranges ₩500bn financing for a London office tower',
        metric: '₩5,000억', metricLabel: '인수금융 주선',
        ai: ['미래에셋증권이 런던 핵심 오피스 빌딩 인수금융 5,000억 원을 주선했다.', '금리 안정 기대에 유럽 오피스 거래가 재개되는 신호다.', '셀다운을 통해 국내 기관에 재매각할 계획이다.'],
        body: '미래에셋증권이 런던 시티 권역 프라임 오피스 빌딩 인수를 위한 5,000억 원 규모 인수금융을 주선했다. 가격 조정이 마무리되고 금리 안정 기대가 커지면서 유럽 오피스 시장의 거래가 점진적으로 재개되는 분위기다. 미래에셋증권은 주선 물량 일부를 국내 기관 투자자에 셀다운(재매각)할 계획이다.',
        enBody: null },
    { id: 'n9', cat: 'GP', inst: 'Blackstone', instType: '해외 GP', asset: 'PE', region: 'EU', date: '06.25', time: '13:00', source: 'PERE', lang: 'en',
        ko: '블랙스톤, 유럽 물류 플랫폼 인수 위해 80억 유로 펀드 클로징',
        en: 'Blackstone closes €8B fund for a European logistics platform',
        metric: '€8.0B', metricLabel: '최종 클로징',
        ai: ['블랙스톤이 유럽 물류 부동산 펀드를 80억 유로에 최종 클로징했다.', '이커머스 성장에 따른 라스트마일 물류 수요가 배경이다.', '유럽 핵심 물류 거점 인수에 자금을 집행한다.'],
        body: '블랙스톤이 유럽 물류 부동산에 투자하는 펀드를 80억 유로 규모로 최종 클로징했다. 이커머스 침투율 상승과 공급망 재편으로 라스트마일 물류센터 수요가 견조하다는 판단이다. 펀드는 유럽 핵심 물류 거점의 자산 인수와 개발에 집행될 예정이다.',
        enBody: 'Blackstone has held a final close on an €8 billion fund targeting European logistics real estate. The firm points to resilient last-mile demand driven by e-commerce penetration and supply-chain reshoring, with capital earmarked for acquisitions and development across key European hubs.' },
    { id: 'n10', cat: 'GP', inst: 'Ares', instType: '해외 GP', asset: 'PC', region: 'US', date: '06.25', time: '11:30', source: 'Private Debt Investor', lang: 'en',
        ko: '에어리스, 북미 다이렉트 렌딩 펀드로 90억 달러 모집 마감',
        en: 'Ares wraps up a $9B North American direct lending fund',
        metric: '$9.0B', metricLabel: '펀드 결성액',
        ai: ['에어리스가 북미 다이렉트 렌딩 펀드로 90억 달러 모집을 마감했다.', '은행 대출 공백을 사모대출이 빠르게 메우고 있다.', '중견기업 대상 변동금리 대출이 핵심이다.'],
        body: '에어리스 매니지먼트가 북미 중견기업을 대상으로 한 다이렉트 렌딩 펀드 모집을 90억 달러 규모로 마감했다. 은행권 대출이 위축된 공백을 사모대출이 메우면서 자금 모집이 순조롭게 진행됐다. 변동금리 구조로 고금리 환경의 인컴 매력이 부각된다.',
        enBody: 'Ares Management has wrapped up a $9 billion North American direct lending fund focused on middle-market borrowers. Private credit continues to fill the gap left by retreating bank lenders, with floating-rate structures offering compelling income in a higher-rate environment.' },
    { id: 'n11', cat: '인사', inst: 'APG', instType: '해외 GP', asset: 'PC', region: 'GL', date: '06.25', time: '21:30', source: 'Private Debt Investor', lang: 'en',
        ko: 'APG, 신임 사모대출 부문 CIO에 마르틴 산체스 선임',
        en: 'APG names Martin Sanchez as new CIO of private credit',
        metric: '신규 선임', metricLabel: '인사',
        ai: ['네덜란드 연기금 운용사 APG가 사모대출 CIO를 새로 선임했다.', '마르틴 산체스가 글로벌 사모대출 배분을 총괄한다.', '사모대출 비중 확대 기조가 이어질 전망이다.'],
        body: '네덜란드 최대 연기금 운용사 APG가 사모대출 부문 최고투자책임자(CIO)에 마르틴 산체스를 선임했다. 신임 CIO는 글로벌 사모대출 포트폴리오의 배분과 운용을 총괄하게 된다. 시장에서는 APG의 사모대출 비중 확대 기조가 한층 강화될 것으로 본다.',
        enBody: "APG, the Netherlands' largest pension investor, has named Martin Sanchez as Chief Investment Officer for private credit. Sanchez will oversee allocation and management of the firm's global private debt portfolio, reinforcing APG's push to grow the asset class." },
    { id: 'n12', cat: '인사', inst: 'CalPERS', instType: '해외 GP', asset: 'PE', region: 'US', date: '06.25', time: '16:00', source: 'Buyouts', lang: 'en',
        ko: 'CalPERS 사모투자 총괄, 12월 말 퇴임 예정',
        en: 'CalPERS head of private equity to step down in December',
        metric: '12월 퇴임', metricLabel: '인사',
        ai: ['미국 최대 연기금 CalPERS의 사모투자 총괄이 연말 퇴임한다.', '후임 인선 전까지 사모투자 전략에 관심이 쏠린다.', 'CalPERS는 사모투자 비중 확대 기조를 유지해왔다.'],
        body: '미국 최대 공적 연기금 CalPERS의 사모투자(PE) 총괄 책임자가 12월 말 퇴임할 예정이다. 최근 사모투자 비중을 적극 확대해온 만큼 후임 인선과 전략 방향에 시장의 관심이 집중되고 있다.',
        enBody: 'The head of private equity at CalPERS, the largest U.S. public pension fund, is set to step down at the end of December. With the fund having actively ramped up its private equity allocation, attention now turns to succession and the future direction of its program.' },
];
// ─── Navbar ───────────────────────────────────────────────
function Navbar({ active, onHome, onCategory, onSearch, onBookmarks }) {
    const on = '#1c1d1f', off = '#b0b2b6';
    const tab = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer', flex: 1 };
    return (React.createElement("div", { style: { flexShrink: 0, height: 64, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(10px)', borderTop: '1px solid #ece9e2', display: 'flex', alignItems: 'center', justifyContent: 'space-around', paddingBottom: 'max(env(safe-area-inset-bottom), 6px)', boxSizing: 'content-box' } },
        React.createElement("div", { onClick: onHome, style: tab },
            React.createElement("span", { style: { fontSize: 17, lineHeight: 1, color: active === 'home' ? on : off } }, "\u2302"),
            React.createElement("span", { style: { font: '600 10.5px Pretendard', color: active === 'home' ? on : off } }, "\uD648")),
        React.createElement("div", { onClick: onCategory, style: tab },
            React.createElement("span", { style: { fontSize: 16, lineHeight: 1, color: active === 'category' ? on : off } }, "\u25A6"),
            React.createElement("span", { style: { font: '600 10.5px Pretendard', color: active === 'category' ? on : off } }, "\uCE74\uD14C\uACE0\uB9AC")),
        React.createElement("div", { onClick: onSearch, style: tab },
            React.createElement("span", { style: { fontSize: 16, lineHeight: 1, color: active === 'search' ? on : off } }, "\u2315"),
            React.createElement("span", { style: { font: '600 10.5px Pretendard', color: active === 'search' ? on : off } }, "\uAC80\uC0C9")),
        React.createElement("div", { onClick: onBookmarks, style: tab },
            React.createElement("span", { style: { fontSize: 15, lineHeight: 1, color: active === 'bookmarks' ? on : off } }, "\u25A2"),
            React.createElement("span", { style: { font: '600 10.5px Pretendard', color: active === 'bookmarks' ? on : off } }, "\uBD81\uB9C8\uD06C"))));
}
// ─── FeedItem ─────────────────────────────────────────────
function FeedItem({ item, onOpen, onBookmark }) {
    return (React.createElement("div", { onClick: onOpen, style: { display: 'flex', gap: 11, padding: '14px 18px', borderBottom: '1px solid #f3f1ea', cursor: 'pointer' } },
        React.createElement("div", { style: { width: 3, borderRadius: 2, background: item.assetColor, flexShrink: 0 } }),
        React.createElement("div", { style: { flex: 1, minWidth: 0 } },
            React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, flexWrap: 'wrap' } },
                React.createElement("span", { style: { font: '700 10.5px Pretendard', color: '#1c1d1f', background: '#f0eee7', padding: '2px 7px', borderRadius: 5 } }, item.inst),
                React.createElement("span", { style: { font: '600 10.5px Pretendard', color: item.assetColor } }, item.assetLabel),
                React.createElement("span", { style: { font: '500 10.5px Pretendard', color: '#9a9ca0' } }, item.regionLabel),
                React.createElement("span", { style: { font: '500 10.5px Pretendard', color: '#bcbec2' } }, item.time),
                item.unread && React.createElement("span", { style: { width: 6, height: 6, borderRadius: '50%', background: '#FFCC00', display: 'inline-block' } })),
            React.createElement("div", { style: { font: '650 14px/1.42 Pretendard', letterSpacing: '-.01em' } }, item.ko),
            React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 7, marginTop: 8 } },
                React.createElement("span", { style: { font: '600 10.5px Pretendard', color: '#1c1d1f', background: '#f2f0ea', padding: '3px 8px', borderRadius: 5 } }, item.metric),
                item.lang === 'en' && React.createElement("span", { style: { font: '700 9px Pretendard', color: '#56585c', border: '1px solid #ddd9cf', padding: '2px 5px', borderRadius: 4, letterSpacing: '.04em' } }, "EN \uC6D0\uBB38"),
                React.createElement("span", { style: { font: '500 10.5px Pretendard', color: '#b6b8bc', marginLeft: 'auto' } }, item.source))),
        React.createElement("div", { onClick: onBookmark, style: { flexShrink: 0, alignSelf: 'flex-start', fontSize: 15, cursor: 'pointer', color: '#cfccc4', padding: 2 } }, item.bookmarked ? React.createElement("span", { style: { color: '#1c1d1f' } }, "\u25A3") : React.createElement("span", null, "\u25A2"))));
}
// ─── App ──────────────────────────────────────────────────
function App() {
    const [screen, setScreen] = useState('home');
    const [prevScreen, setPrevScreen] = useState('home');
    const [filter, setFilter] = useState('전체');
    const [query, setQuery] = useState('');
    const [bm, setBm] = useState(() => store.get('bookmarks', {}));
    const [read, setRead] = useState(() => store.get('read', {}));
    const [articles, setArticles] = useState(() => sortArticles(mergeArticles(store.get('articles', []), BASE)));
    const [selectedId, setSelectedId] = useState(null);
    const [showShare, setShowShare] = useState(false);
    const [showOriginal, setShowOriginal] = useState(false);
    const [toast, setToast] = useState(null);
    const toastTimer = useRef(null);
    // Persist state changes.
    useEffect(() => { store.set('bookmarks', bm); }, [bm]);
    useEffect(() => { store.set('read', read); }, [read]);
    useEffect(() => { store.set('articles', articles); }, [articles]);
    // On launch, pull fresh news from the backend (if configured) and merge it
    // into the archive — new items appear, existing ones are kept.
    useEffect(() => {
        if (!NEWS_API)
            return;
        fetch(NEWS_API)
            .then(r => r.json())
            .then(incoming => {
            if (Array.isArray(incoming) && incoming.length) {
                setArticles(prev => sortArticles(mergeArticles(prev, incoming)));
            }
        })
            .catch(() => { });
    }, []);
    const flash = (msg) => {
        setToast(msg);
        clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(null), 2200);
    };
    const openItem = (id) => {
        if (screen !== 'detail')
            setPrevScreen(screen);
        setSelectedId(id);
        setRead(r => ({ ...r, [id]: true }));
        setShowOriginal(false);
        setScreen('detail');
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
    // Enrich items
    const items = articles.map(it => ({
        ...it,
        assetLabel: ASSET[it.asset].label,
        assetColor: ASSET[it.asset].color,
        regionLabel: REGION[it.region],
        catLabel: CAT_LABEL[it.cat],
        instGroup: grp(it.instType),
        bookmarked: !!bm[it.id],
        unread: !read[it.id],
    }));
    // Filter
    const isGroup = GROUPS.includes(filter);
    const isAsset = !!ASSET[filter];
    const isRegion = !!REGION[filter];
    let feedItems = items;
    if (filter !== '전체') {
        if (filter === '인사')
            feedItems = items.filter(i => i.cat === '인사');
        else if (isGroup)
            feedItems = items.filter(i => i.instGroup === filter && i.cat !== '인사');
        else if (isAsset)
            feedItems = items.filter(i => i.asset === filter);
        else if (isRegion)
            feedItems = items.filter(i => i.region === filter);
    }
    let feedFilterLabel = filter;
    if (filter === '인사')
        feedFilterLabel = 'CIO·인사 이동';
    else if (isAsset)
        feedFilterLabel = ASSET[filter].label;
    else if (isRegion)
        feedFilterLabel = REGION[filter];
    const chips = ['전체', '연기금', '공제회', '운용·증권', '보험·캐피탈', '해외 GP', '인사'].map(k => ({
        label: k, active: filter === k,
        bg: filter === k ? '#FFCC00' : '#2a2c30',
        color: filter === k ? '#1c1d1f' : '#cdced0',
    }));
    // Category data
    const ICON = { '연기금': '연금', '공제회': '공제', '운용·증권': '운용', '보험·캐피탈': '보험', '해외 GP': 'GP' };
    const SAMPLE = { '연기금': '국민연금 · KIC · 사학연금', '공제회': '교직원 · 행정 · 군인공제회', '운용·증권': '미래에셋운용 · 미래에셋증권', '보험·캐피탈': '삼성생명 · 한화 · 캐피탈', '해외 GP': 'Blackstone · Ares · KKR' };
    const catGroups = GROUPS.map(g => ({ name: g, count: items.filter(i => i.instGroup === g && i.cat !== '인사').length, icon: ICON[g], sample: SAMPLE[g] }));
    const assetCats = ['RE', 'PC', 'PE', 'IN'].map(k => ({ key: k, label: ASSET[k].label, code: ASSET[k].code, color: ASSET[k].color, count: items.filter(i => i.asset === k).length }));
    const regionCats = ['US', 'EU', 'AP', 'GL'].map(k => ({ key: k, label: REGION[k], count: items.filter(i => i.region === k).length }));
    // Search
    const q = query.trim().toLowerCase();
    const searchItems = q ? items.filter(i => (i.ko + ' ' + i.en + ' ' + i.inst + ' ' + i.instType + ' ' + i.source + ' ' + i.assetLabel).toLowerCase().includes(q)) : [];
    const suggests = ['국민연금', '공제회', '블랙스톤', '데이터센터', '사모대출', '인프라'];
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
    const navProps = { onHome: () => goTab('home'), onCategory: () => goTab('category'), onSearch: () => goTab('search'), onBookmarks: () => goTab('bookmarks') };
    return (React.createElement("div", { className: "app-frame", style: { color: '#1c1d1f' } },
        screen === 'home' && (React.createElement("div", { style: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } },
            React.createElement("div", { style: { background: '#1c1d1f', color: '#fff', flexShrink: 0 } },
                React.createElement("div", { style: { height: 'env(safe-area-inset-top)', flexShrink: 0 } }),
                React.createElement("div", { style: { padding: '14px 20px 18px' } },
                    React.createElement("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 } },
                        React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                            React.createElement("div", { style: { width: 27, height: 27, borderRadius: 7, background: '#FFCC00', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '800 12px Pretendard', color: '#1c1d1f', letterSpacing: '-.02em' } }, "KB"),
                            React.createElement("div", { style: { font: '800 16px Pretendard', color: '#FFCC00', letterSpacing: '.04em' } }, "KB GIS")),
                        React.createElement("div", { style: { width: 31, height: 31, borderRadius: '50%', border: '1px solid #34363a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a4a5a8', fontSize: 13, position: 'relative' } },
                            "\u2303",
                            React.createElement("div", { style: { position: 'absolute', top: 6, right: 7, width: 6, height: 6, borderRadius: '50%', background: '#FFCC00', border: '1.5px solid #1c1d1f' } }))),
                    React.createElement("div", { style: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' } },
                        React.createElement("div", { style: { font: '800 19px Pretendard', letterSpacing: '-.02em' } }, "\uC624\uB298\uC758 \uBE0C\uB9AC\uD504"),
                        React.createElement("div", { style: { font: '500 11.5px Pretendard', color: '#9b9c9e' } }, "2026.06.26 \uAE08 \u00B7 08:00 \uC5C5\uB370\uC774\uD2B8")),
                    React.createElement("div", { style: { display: 'flex', gap: 20, marginTop: 14 } },
                        React.createElement("div", null,
                            React.createElement("span", { style: { font: '800 22px Pretendard', color: '#FFCC00' } }, stats.total),
                            React.createElement("span", { style: { font: '500 10.5px Pretendard', color: '#9b9c9e', marginLeft: 5 } }, "\uC2E0\uADDC")),
                        React.createElement("div", { style: { width: 1, background: '#34363a' } }),
                        React.createElement("div", null,
                            React.createElement("span", { style: { font: '800 18px Pretendard' } }, stats.lp),
                            React.createElement("span", { style: { font: '500 10.5px Pretendard', color: '#9b9c9e', marginLeft: 4 } }, "LP")),
                        React.createElement("div", null,
                            React.createElement("span", { style: { font: '800 18px Pretendard' } }, stats.gp),
                            React.createElement("span", { style: { font: '500 10.5px Pretendard', color: '#9b9c9e', marginLeft: 4 } }, "GP")),
                        React.createElement("div", null,
                            React.createElement("span", { style: { font: '800 18px Pretendard' } }, stats.people),
                            React.createElement("span", { style: { font: '500 10.5px Pretendard', color: '#9b9c9e', marginLeft: 4 } }, "\uC778\uC0AC")))),
                React.createElement("div", { style: { display: 'flex', gap: 7, padding: '0 18px 14px', whiteSpace: 'nowrap', overflowX: 'auto' } }, chips.map(c => (React.createElement("div", { key: c.label, onClick: () => applyFilter(c.label), style: { padding: '7px 13px', borderRadius: 999, font: '600 12.5px Pretendard', flexShrink: 0, cursor: 'pointer', background: c.bg, color: c.color } }, c.label))))),
            React.createElement("div", { style: { flex: 1, minHeight: 0, overflowY: 'auto', background: '#fff' } },
                filter !== '전체' && (React.createElement("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 18px', background: '#fffaeb', borderBottom: '1px solid #f3eccf' } },
                    React.createElement("span", { style: { font: '600 12px Pretendard', color: '#9a7d12' } },
                        "\uD544\uD130 \u00B7 ",
                        feedFilterLabel,
                        " ",
                        React.createElement("span", { style: { color: '#c4a93a', fontWeight: 500 } },
                            feedItems.length,
                            "\uAC74")),
                    React.createElement("span", { onClick: () => setFilter('전체'), style: { font: '600 12px Pretendard', color: '#9a7d12', cursor: 'pointer' } }, "\uD574\uC81C \u2715"))),
                feedItems.map(item => React.createElement(FeedItem, { key: item.id, item: item, onOpen: () => openItem(item.id), onBookmark: e => toggleBm(item.id, e) })),
                React.createElement("div", { style: { padding: 18, textAlign: 'center', font: '500 11px Pretendard', color: '#bcbec2' } }, "\uAC04\uBC24\uC758 \uD574\uC678 \uB300\uCCB4\uD22C\uC790 \uB274\uC2A4\uB97C AI\uAC00 \uC815\uB9AC\uD588\uC2B5\uB2C8\uB2E4")),
            React.createElement(Navbar, { active: "home", ...navProps }))),
        screen === 'category' && (React.createElement("div", { style: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#fff' } },
            React.createElement("div", { style: { flexShrink: 0 } },
                React.createElement("div", { style: { height: 'max(env(safe-area-inset-top), 8px)', flexShrink: 0 } }),
                React.createElement("div", { style: { padding: '2px 20px 16px', borderBottom: '1px solid #efece4' } },
                    React.createElement("div", { style: { font: '800 20px Pretendard', letterSpacing: '-.02em' } }, "\uCE74\uD14C\uACE0\uB9AC"),
                    React.createElement("div", { style: { font: '500 11.5px Pretendard', color: '#9a9ca0', marginTop: 3 } }, "\uAE30\uAD00\u00B7\uC790\uC0B0\uAD70\u00B7\uC9C0\uC5ED\uBCC4\uB85C \uBE60\uB974\uAC8C \uBAA8\uC544\uBCF4\uAE30"))),
            React.createElement("div", { style: { flex: 1, minHeight: 0, overflowY: 'auto', padding: 18 } },
                React.createElement("div", { style: { font: '700 11px Pretendard', color: '#a6a8ac', letterSpacing: '.06em', marginBottom: 10 } }, "\uAE30\uAD00 \uC720\uD615"),
                React.createElement("div", { style: { display: 'flex', flexDirection: 'column', gap: 8 } }, catGroups.map(g => (React.createElement("div", { key: g.name, onClick: () => applyFilter(g.name), style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 15px', border: '1px solid #ece9e2', borderRadius: 13, cursor: 'pointer' } },
                    React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 11 } },
                        React.createElement("span", { style: { width: 34, height: 34, borderRadius: 9, background: '#f2f0ea', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '800 12px Pretendard', color: '#56585c' } }, g.icon),
                        React.createElement("div", null,
                            React.createElement("div", { style: { font: '700 14px Pretendard' } }, g.name),
                            React.createElement("div", { style: { font: '500 10.5px Pretendard', color: '#9a9ca0', marginTop: 2 } }, g.sample))),
                    React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 9 } },
                        React.createElement("span", { style: { font: '700 12px Pretendard', color: '#1c1d1f', background: '#f4f2ec', padding: '3px 9px', borderRadius: 999 } }, g.count),
                        React.createElement("span", { style: { color: '#cfccc4' } }, "\u203A")))))),
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
        screen === 'detail' && sel && (React.createElement("div", { style: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#fff' } },
            React.createElement("div", { style: { flexShrink: 0, height: 54, boxSizing: 'content-box', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'env(safe-area-inset-top) 16px 0 12px', borderBottom: '1px solid #efece4' } },
                React.createElement("div", { onClick: () => setScreen(prevScreen), style: { display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', font: '600 14px Pretendard', color: '#1c1d1f' } },
                    React.createElement("span", { style: { fontSize: 20 } }, "\u2039"),
                    " \uBE0C\uB9AC\uD504"),
                React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 4 } },
                    React.createElement("div", { onClick: e => toggleBm(sel.id, e), style: { width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 16, color: '#56585c' } }, bm[sel.id] ? React.createElement("span", { style: { color: '#1c1d1f' } }, "\u25A3") : React.createElement("span", null, "\u25A2")),
                    React.createElement("div", { onClick: e => onShare(sel, e), style: { width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 16, color: '#56585c' } }, "\u2197"))),
            React.createElement("div", { style: { flex: 1, minHeight: 0, overflowY: 'auto' } },
                React.createElement("div", { style: { height: 152, background: 'repeating-linear-gradient(135deg,#ece9e1 0 12px,#f4f2eb 12px 24px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '14px 18px' } },
                    React.createElement("span", { style: { font: '600 10.5px Pretendard', color: '#a9a69c', letterSpacing: '.06em' } }, sel.source),
                    React.createElement("span", { style: { background: '#1c1d1f', color: '#fff', font: '600 10.5px Pretendard', padding: '5px 10px', borderRadius: 6 } }, sel.catLabel)),
                React.createElement("div", { style: { padding: '18px 20px 26px' } },
                    React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 11 } },
                        React.createElement("span", { style: { font: '700 11px Pretendard', color: '#1c1d1f', background: '#f0eee7', padding: '3px 9px', borderRadius: 6 } }, sel.inst),
                        React.createElement("span", { style: { display: 'inline-flex', alignItems: 'center', gap: 5, font: '600 11px Pretendard' } },
                            React.createElement("span", { style: { width: 7, height: 7, borderRadius: 2, background: sel.assetColor, display: 'inline-block' } }),
                            sel.assetLabel),
                        React.createElement("span", { style: { font: '500 11px Pretendard', color: '#7a7c80' } }, sel.regionLabel)),
                    React.createElement("div", { style: { font: '700 21px/1.4 Pretendard', letterSpacing: '-.02em' } }, sel.ko),
                    React.createElement("div", { style: { font: '400 13.5px/1.5 Pretendard', color: '#8a8c90', marginTop: 8 } }, sel.en),
                    React.createElement("div", { style: { font: '500 11.5px Pretendard', color: '#a6a8ac', marginTop: 11 } },
                        sel.source,
                        " \u00B7 ",
                        sel.date,
                        " ",
                        sel.time),
                    React.createElement("div", { style: { marginTop: 18, background: '#fffaeb', border: '1px solid #f6ecc8', borderRadius: 14, padding: '15px 16px' } },
                        React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 6, font: '700 11.5px Pretendard', color: '#9a7d12', letterSpacing: '.03em', marginBottom: 10 } },
                            React.createElement("span", { style: { width: 17, height: 17, borderRadius: 5, background: '#FFCC00', color: '#1c1d1f', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', font: '800 9px Pretendard' } }, "AI"),
                            "3\uC904 \uC694\uC57D"),
                        sel.ai.map((line, i) => (React.createElement("div", { key: i, style: { display: 'flex', gap: 8, font: '500 13px/1.55 Pretendard', color: '#3d3e42', marginTop: 5 } },
                            React.createElement("span", { style: { color: '#d9b400', flexShrink: 0 } }, "\u2014"),
                            React.createElement("span", null, line))))),
                    React.createElement("div", { style: { display: 'flex', gap: 9, marginTop: 16 } },
                        React.createElement("div", { style: { flex: 1, background: '#f8f7f3', border: '1px solid #ece9e2', borderRadius: 12, padding: '13px 14px' } },
                            React.createElement("div", { style: { font: '800 19px Pretendard', color: '#1c1d1f' } }, sel.metric),
                            React.createElement("div", { style: { font: '500 10.5px Pretendard', color: '#9a9ca0', marginTop: 3 } }, sel.metricLabel)),
                        React.createElement("div", { style: { flex: 1, background: '#f8f7f3', border: '1px solid #ece9e2', borderRadius: 12, padding: '13px 14px' } },
                            React.createElement("div", { style: { font: '800 19px Pretendard', color: '#1c1d1f' } }, sel.assetLabel),
                            React.createElement("div", { style: { font: '500 10.5px Pretendard', color: '#9a9ca0', marginTop: 3 } },
                                "\uC790\uC0B0\uAD70 \u00B7 ",
                                sel.regionLabel))),
                    React.createElement("div", { style: { font: '500 14px/1.7 Pretendard', color: '#34353a', marginTop: 20 } }, sel.body),
                    sel.lang === 'en' && (React.createElement("div", { style: { marginTop: 20, border: '1px solid #ece9e2', borderRadius: 14, overflow: 'hidden' } },
                        React.createElement("div", { onClick: () => setShowOriginal(s => !s), style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', cursor: 'pointer', background: '#f8f7f3' } },
                            React.createElement("span", { style: { font: '700 12.5px Pretendard', color: '#1c1d1f' } }, "\uC6D0\uBB38 (English)"),
                            React.createElement("span", { style: { font: '600 11.5px Pretendard', color: '#9a7d12' } }, showOriginal ? '접기 ▲' : '원문 보기 ▼')),
                        showOriginal && (React.createElement("div", { style: { padding: '15px 16px', borderTop: '1px solid #ece9e2' } },
                            React.createElement("div", { style: { font: '700 14px/1.45 Pretendard', color: '#1c1d1f' } }, sel.en),
                            React.createElement("div", { style: { font: '400 13px/1.7 Pretendard', color: '#4a4b50', marginTop: 9 } }, sel.enBody),
                            React.createElement("a", { href: sel.url, target: "_blank", rel: "noopener noreferrer", style: { display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 13, font: '600 12.5px Pretendard', color: '#1c1d1f', background: '#FFCC00', padding: '9px 14px', borderRadius: 9, textDecoration: 'none' } }, "\uAE30\uC0AC \uC6D0\uBB38\uC73C\uB85C \uC774\uB3D9 \u2197"))))),
                    React.createElement("div", { style: { display: 'flex', gap: 9, marginTop: 20 } },
                        React.createElement("div", { onClick: e => onShare(sel, e), style: { flex: 1, height: 46, background: '#1c1d1f', borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, font: '700 13.5px Pretendard', color: '#fff', cursor: 'pointer' } }, "\u2197 \uACF5\uC720\uD558\uAE30"),
                        React.createElement("a", { href: sel.url, target: "_blank", rel: "noopener noreferrer", style: { width: 46, height: 46, border: '1px solid #e6e3db', borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#56585c', fontSize: 16, textDecoration: 'none' } }, "\u2398")))))),
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
