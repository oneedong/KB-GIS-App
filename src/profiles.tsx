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
    return (
      <div onClick={() => onOpen && onOpen(e)} style={{ padding: '12px 0', borderTop: first ? 'none' : `1px solid ${KB.line2}`, cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <Tag tone={/출자|결성|선정|출자사업/.test(e.kind) ? 'yellow' : 'base'}>{e.kind}</Tag>
          <span style={{ font: F(700, 14.5), color: KB.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.inst}</span>
          {e.amount && <span style={{ font: F(700, 14), color: KB.gray, whiteSpace: 'nowrap' }}>{e.amount}</span>}
          {pending && <span style={{ font: F(500, 12), color: KB.mute, whiteSpace: 'nowrap' }}>{e.status}</span>}
          <span style={{ marginLeft: 'auto', font: F(500, 12), color: KB.mute, whiteSpace: 'nowrap', paddingLeft: 6 }}>{shortWhen(e)}</span>
        </div>
        <div style={{ font: F(500, 14, 1.45), color: KB.ink2, marginTop: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nm(e.title)}</div>
      </div>
    );
  }
  return (
    <div onClick={() => onOpen && onOpen(e)} style={{ padding: '14px 0', borderTop: first ? 'none' : `1px solid ${KB.line2}`, cursor: onOpen ? 'pointer' : 'default' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <Tag tone={/출자|결성|선정|출자사업/.test(e.kind) ? 'yellow' : 'base'}>{e.kind}</Tag>
        {pending && <Tag tone="outline">{e.status}</Tag>}
        {c.overseas && <span style={{ font: F(500, 12), color: KB.mute }}>해외</span>}
        <span style={{ marginLeft: 'auto', font: F(500, 12), color: KB.mute }}>{shortWhen(e)}</span>
      </div>
      {(showInst || e.amount) && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          {showInst && (
            <span onClick={(ev) => { if (onInst) { ev.stopPropagation(); onInst(e); } }} style={{ font: F(700, 15), color: KB.ink, textDecoration: onInst ? 'underline' : 'none', textDecorationColor: KB.line, textUnderlineOffset: 3 }}>{e.inst}</span>
          )}
          {e.amount && <span style={{ font: F(700, 15), color: KB.gray }}>{e.amount}</span>}
          {e.counterpart && <span style={{ font: F(500, 13), color: KB.sub }}>{e.role === 'LP' ? '운용사 ' : 'LP '}{e.counterpart}</span>}
        </div>
      )}
      <div style={{ font: F(500, 14.5, 1.5), color: KB.ink2, marginTop: 6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{nm(e.title)}</div>
      <div style={{ font: F(500, 12), color: KB.mute, marginTop: 5 }}>
        {e.source}{c.items.length > 1 ? ` 외 ${c.items.length - 1}건 보도` : ''}
      </div>
    </div>
  );
}

// ─── 투자내역 목록(필터 포함) ─────────────────────────────────
// events: investments.json 의 항목 배열(최신순). grouped: 'date' | 'inst'
// 검색어가 투자내역 한 건에 걸리는지(기관·상대방·행위·금액·제목, 한글 음역도 인정)
function dealHit(e, q) {
  if (!q) return true;
  const t = `${e.inst} ${e.counterpart || ''} ${e.kind} ${e.amount || ''} ${e.title} ${nm(e.title)}`.toLowerCase();
  const a = q.trim().toLowerCase(), b = (nm(q.trim()) || '').toLowerCase();
  return t.includes(a) || (!!b && t.includes(b));
}
function DealList({ events, onOpen, onInst, showInst, limit, emptyTitle, emptyDesc, defaultOverseas = false, grouped, query }) {
  const [ov, setOv] = React.useState(defaultOverseas);
  const [fk, setFk] = React.useState('all');
  const [more, setMore] = React.useState(false);
  const base = (events || []).filter((e) => dealHit(e, query));
  const filt = DEAL_FILTERS.find((f) => f[0] === fk);
  const list = base.filter((e) => (!ov || e.overseas) && (!filt[2] || filt[2].test(e.kind)));
  const clusters = clusterDeals(list);
  const counts = DEAL_FILTERS.map(([k, , re]) => [k, base.filter((e) => (!ov || e.overseas) && (!re || re.test(e.kind))).length]);
  const shown = limit && !more ? clusters.slice(0, limit) : clusters;
  const ovCount = base.filter((e) => e.overseas).length;
  let body;
  if (!clusters.length) {
    body = <Empty compact icon="briefcase" title={query ? `'${query}' 검색 결과가 없습니다` : (emptyTitle || '해당하는 투자내역이 없습니다')} desc={query ? '' : emptyDesc} />;
  } else if (grouped === 'table') {
    body = <DealTable clusters={clusters} onOpen={onOpen} onInst={onInst} />;
  } else if (grouped === 'inst') {
    const by = {};
    clusters.forEach((c) => { (by[c.inst] = by[c.inst] || []).push(c); });
    const insts = Object.keys(by).sort((a, b) => by[b].length - by[a].length || a.localeCompare(b));
    body = insts.map((name, i) => (
      <div key={name} style={{ marginTop: i ? 22 : 4 }}>
        <div onClick={() => onInst && onInst(by[name][0].lead)} style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 8, borderBottom: `2px solid ${KB.ink}`, cursor: onInst ? 'pointer' : 'default' }}>
          <span style={{ font: F(700, 16), color: KB.ink }}>{name}</span>
          <Tag tone={by[name][0].role === 'GP' ? 'dark' : 'yellow'}>{by[name][0].role === 'GP' ? '해외 GP' : '국내 LP'}</Tag>
          <span style={{ marginLeft: 'auto', font: F(600, 12.5), color: KB.sub }}>{by[name].length}건</span>
          {onInst && <span style={{ color: KB.faint }}><Ico n="chevron" size={16} sw={2} /></span>}
        </div>
        {by[name].slice(0, 4).map((c, j) => <DealRow key={c.key + j} c={c} first={j === 0} onOpen={onOpen} />)}
        {by[name].length > 4 && <div onClick={() => onInst && onInst(by[name][0].lead)} style={{ font: F(600, 13), color: KB.sub, padding: '10px 0 0', cursor: 'pointer' }}>{name} 투자내역 {by[name].length}건 모두 보기</div>}
      </div>
    ));
  } else if (grouped === 'date') {
    let last = '';
    body = shown.map((c, i) => {
      const lb = dayLabel(c.ms);
      const head = lb !== last ? <div key={'h' + i} style={{ font: F(700, 13), color: KB.sub, padding: i ? '18px 0 2px' : '4px 0 2px' }}>{lb}</div> : null;
      last = lb;
      return <React.Fragment key={c.key + i}>{head}<DealRow c={c} first={!!head} onOpen={onOpen} onInst={onInst} showInst={showInst} /></React.Fragment>;
    });
  } else {
    body = shown.map((c, i) => <DealRow key={c.key + i} c={c} first={i === 0} onOpen={onOpen} onInst={onInst} showInst={showInst} />);
  }
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 12 }}>
        <Chip active={ov} onClick={() => setOv((v) => !v)} count={ovCount}>해외만</Chip>
        <span style={{ width: 1, background: KB.line, margin: '6px 2px', flexShrink: 0 }}></span>
        {DEAL_FILTERS.map(([k, label], i) => (counts[i][1] > 0 || k === 'all') && <Chip key={k} active={fk === k} onClick={() => setFk(k)} count={counts[i][1]}>{label}</Chip>)}
      </div>
      {body}
      {limit && !more && clusters.length > limit && grouped !== 'inst' && (
        <div onClick={() => setMore(true)} style={{ textAlign: 'center', padding: '14px 0 2px', font: F(600, 13.5), color: KB.sub, cursor: 'pointer', borderTop: `1px solid ${KB.line2}` }}>
          {clusters.length - limit}건 더 보기
        </div>
      )}
    </div>
  );
}

// ─── 투자내역 표(기관·운용사별, 거래 유형별) ─────────────────────
// 거래 유형 — 기사에서 뽑은 행위를 표의 열로 쓰기 좋게 묶는다
const DEAL_TYPES = [
  ['출자', /^펀드 출자$|^출자 유치$/],
  ['결성', /^펀드 결성$/],
  ['투자', /^투자$|^공동투자$/],
  ['인수', /^인수$/],
  ['매각', /^매각$/],
  ['대출', /^대출/],
  ['세컨더리', /^세컨더리$/],
  ['출자사업·선정', /^출자사업$|^위탁운용사 선정$/],
];
const dealType = (kind) => (DEAL_TYPES.find(([, re]) => re.test(kind || '')) || ['기타'])[0];
const ymLabel = (ms) => { const { y, m } = kstYMD(ms); return `${y}년 ${pad2(m)}월`; };
const TH = { font: F(600, 12), color: KB.sub, textAlign: 'left', padding: '8px 6px', borderBottom: `1px solid ${KB.line}`, whiteSpace: 'nowrap', background: KB.band };
const TD = { font: F(500, 13, 1.45), color: KB.ink2, padding: '9px 6px', borderBottom: `1px solid ${KB.line2}`, verticalAlign: 'top' };
function DealTable({ clusters, onOpen, onInst }) {
  const desktop = useDesktop();
  const by = {};
  clusters.forEach((c) => { (by[c.inst] = by[c.inst] || []).push(c); });
  const insts = Object.keys(by).sort((a, b) => by[b].length - by[a].length || a.localeCompare(b));
  const typesUsed = DEAL_TYPES.map(([t]) => t).concat('기타').filter((t) => clusters.some((c) => dealType(c.lead.kind) === t));
  const anchor = (name) => 'dt-' + name.replace(/[^0-9A-Za-z가-힣]/g, '');
  const jump = (name) => { const el = document.getElementById(anchor(name)); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  return (
    <div>
      {/* 요약: 기관 × 거래 유형 건수 */}
      <div style={{ font: F(700, 14), color: KB.ink, margin: '4px 0 8px' }}>기관별 거래 유형 요약 <span style={{ font: F(500, 12), color: KB.mute }}>이름을 누르면 해당 표로 이동</span></div>
      <div style={{ overflowX: 'auto', border: `1px solid ${KB.line}`, borderRadius: 10, background: KB.card }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 120 + typesUsed.length * 62 }}>
          <thead><tr>
            <th style={{ ...TH, position: 'sticky', left: 0, zIndex: 1 }}>기관</th>
            {typesUsed.map((t) => <th key={t} style={{ ...TH, textAlign: 'center' }}>{t}</th>)}
            <th style={{ ...TH, textAlign: 'center' }}>합계</th>
          </tr></thead>
          <tbody>
            {insts.map((name) => (
              <tr key={name} onClick={() => jump(name)} style={{ cursor: 'pointer' }}>
                <td style={{ ...TD, font: F(600, 13), color: KB.ink, whiteSpace: 'nowrap', position: 'sticky', left: 0, background: KB.card }}>{name}</td>
                {typesUsed.map((t) => { const n = by[name].filter((c) => dealType(c.lead.kind) === t).length; return <td key={t} style={{ ...TD, textAlign: 'center', color: n ? KB.ink : KB.faint, font: n ? F(700, 13) : F(400, 13) }}>{n || '·'}</td>; })}
                <td style={{ ...TD, textAlign: 'center', font: F(700, 13), color: KB.gray }}>{by[name].length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* 기관별 상세 표: 거래 유형 → 시기(최신순) */}
      {insts.map((name) => {
        const rows = by[name].slice().sort((a, b) => {
          const ta = DEAL_TYPES.findIndex(([t]) => t === dealType(a.lead.kind)), tb = DEAL_TYPES.findIndex(([t]) => t === dealType(b.lead.kind));
          return ((ta < 0 ? 99 : ta) - (tb < 0 ? 99 : tb)) || (b.ms - a.ms);
        });
        const role = rows[0].role;
        return (
          <div key={name} id={anchor(name)} style={{ marginTop: 26, scrollMarginTop: 12 }}>
            <div onClick={() => onInst && onInst(rows[0].lead)} style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 8, cursor: onInst ? 'pointer' : 'default' }}>
              <span style={{ font: F(700, 16), color: KB.ink }}>{name}</span>
              <Tag tone={role === 'GP' ? 'dark' : 'yellow'}>{role === 'GP' ? '해외 GP' : '국내 LP'}</Tag>
              <span style={{ marginLeft: 'auto', font: F(600, 12.5), color: KB.sub }}>{rows.length}건</span>
            </div>
            <div style={{ overflowX: 'auto', border: `1px solid ${KB.line}`, borderRadius: 10, background: KB.card }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed', minWidth: desktop ? 0 : 520 }}>
                <colgroup><col style={{ width: 92 }} /><col style={{ width: 84 }} /><col /><col style={{ width: 92 }} /></colgroup>
                <thead><tr><th style={TH}>거래 유형</th><th style={TH}>시기</th><th style={TH}>내용</th><th style={{ ...TH, textAlign: 'right' }}>금액</th></tr></thead>
                <tbody>
                  {rows.map((c, i) => {
                    const t = dealType(c.lead.kind);
                    const first = i === 0 || dealType(rows[i - 1].lead.kind) !== t;
                    const span = first ? rows.filter((r) => dealType(r.lead.kind) === t).length : 0;
                    const e = c.lead;
                    return (
                      <tr key={c.key + i} onClick={() => onOpen && onOpen(e)} style={{ cursor: 'pointer' }}>
                        {first && <td rowSpan={span} style={{ ...TD, font: F(700, 13), color: KB.gray, background: KB.band, borderRight: `1px solid ${KB.line2}` }}>{t}{e.kind !== t && span === 1 ? <div style={{ font: F(500, 11), color: KB.mute }}>{e.kind}</div> : null}</td>}
                        <td style={{ ...TD, whiteSpace: 'nowrap', font: F(500, 12.5), color: KB.sub }}>{ymLabel(c.ms)}</td>
                        <td style={TD}>
                          <div style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{nm(e.title)}</div>
                          <div style={{ font: F(500, 11.5), color: KB.mute, marginTop: 3 }}>
                            {[e.status && e.status !== '확정' ? e.status : '', e.counterpart ? (e.role === 'LP' ? `운용사 ${e.counterpart}` : `LP ${e.counterpart}`) : '', c.overseas ? '해외' : '', e.source].filter(Boolean).join(' · ')}
                          </div>
                        </td>
                        <td style={{ ...TD, textAlign: 'right', font: F(700, 13), color: e.amount ? KB.gray : KB.faint }}>{e.amount || '–'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── 기사 한 줄(프로필 안) ────────────────────────────────────
function MiniArticle({ a, onOpen, first }) {
  return (
    <div onClick={() => onOpen(a.id)} style={{ padding: '13px 0', borderTop: first ? 'none' : `1px solid ${KB.line2}`, cursor: 'pointer' }}>
      <div style={{ font: F(500, 14.5, 1.5), color: KB.ink }}>{nm(a.ko)}</div>
      <div style={{ font: F(500, 12), color: KB.mute, marginTop: 5 }}>
        {a.source} · {shortWhen(a)}{a.cat === '인사' ? ' · 인사' : a.cat === '이전' ? ' · 지방이전' : ''}
      </div>
    </div>
  );
}

// 최근 동향 요약 — 기사 수·자산군 분포·최신 기사
function RecentActivity({ articles, onOpen }) {
  const now = Date.now();
  const n30 = articles.filter((a) => now - itemMs(a) < 30 * 86400000).length;
  const mix = {};
  articles.forEach((a) => { if (a.asset) mix[a.asset] = (mix[a.asset] || 0) + 1; });
  const mixList = Object.entries(mix).sort((a, b) => b[1] - a[1]);
  if (!articles.length) return <Empty compact icon="clock" title="최근 3개월 기사 없음" desc="새 기사가 수집되면 자동으로 반영됩니다." />;
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Metric label="최근 30일 기사" value={`${n30}건`} />
        <Metric label="최근 3개월 기사" value={`${articles.length}건`} />
      </div>
      {mixList.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
          {mixList.map(([k, c]) => <Tag key={k} tone="outline">{(ASSET[k] && ASSET[k].label) || k} {c}</Tag>)}
        </div>
      )}
    </div>
  );
}

// 연도별 대체투자 비중 추이
function AltTrend({ trend }) {
  if (!trend || trend.length < 2) return null;
  const W = 340, H = 150, L = 34, R = 12, TP = 16, B = 26;
  const v = trend.map((t) => t.altPct);
  const lo = Math.floor(Math.min(...v) / 5) * 5, hi = Math.ceil(Math.max(...v) / 5) * 5, span = Math.max(hi - lo, 5);
  const x = (i) => L + i * (W - L - R) / (trend.length - 1);
  const y = (p) => TP + (1 - (p - lo) / span) * (H - TP - B);
  const pts = trend.map((t, i) => `${x(i)},${y(t.altPct)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {[lo, lo + span / 2, hi].map((g, i) => (
        <g key={i}>
          <line x1={L} y1={y(g)} x2={W - R} y2={y(g)} stroke={KB.line2} strokeWidth="1" />
          <text x={L - 6} y={y(g) + 4} textAnchor="end" fontSize="11" fill={KB.mute} fontFamily="Pretendard">{Math.round(g)}%</text>
        </g>
      ))}
      <polyline points={pts} fill="none" stroke={KB.gray} strokeWidth="2.2" strokeLinejoin="round" />
      {trend.map((t, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(t.altPct)} r="4" fill={i === trend.length - 1 ? KB.yellow : KB.card} stroke={KB.gray} strokeWidth="2" />
          <text x={x(i)} y={y(t.altPct) - 9} textAnchor="middle" fontSize="11" fontWeight="600" fill={KB.ink} fontFamily="Pretendard">{t.altPct}</text>
          <text x={x(i)} y={H - 7} textAnchor="middle" fontSize="11" fill={KB.mute} fontFamily="Pretendard">{t.year}</text>
        </g>
      ))}
    </svg>
  );
}

// 링크 줄(외부 기사) — 근거 기사로 이동
const ExtLink = ({ href, children, first }) => {
  const ok = href && /^https?:\/\//.test(href);
  return (
    <a href={ok ? href : undefined} target="_blank" rel="noopener noreferrer"
       style={{ display: 'block', textDecoration: 'none', color: 'inherit', padding: '13px 0', borderTop: first ? 'none' : `1px solid ${KB.line2}` }}>
      {children}
    </a>
  );
};

// 프로필 머리
function ProfileHead({ kicker, name, sub, tags, meta, updated }) {
  return (
    <div style={{ padding: '20px 20px 18px', background: KB.bg }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>{kicker}</div>
      <div style={{ font: F(700, 25, 1.3), color: KB.ink, letterSpacing: '-.03em', marginTop: 10 }}>{name}</div>
      {sub && <div style={{ font: F(500, 13.5), color: KB.mute, marginTop: 4 }}>{sub}</div>}
      {meta && <div style={{ font: F(500, 13), color: KB.sub, marginTop: 8 }}>{meta}</div>}
      {tags && tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
          {tags.map((t) => <Tag key={t} tone="outline">{t}</Tag>)}
        </div>
      )}
      {updated && <div style={{ display: 'flex', alignItems: 'center', gap: 5, font: F(500, 12), color: KB.mute, marginTop: 14 }}><Ico n="refresh" size={14} sw={1.8} />{updated}</div>}
    </div>
  );
}

function ProfileFrame({ backLabel, onBack, title, children }) {
  const desktop = useDesktop();
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: desktop ? KB.band : KB.bg }}>
      <TopBar onBack={onBack} backLabel={backLabel} title={desktop ? title : ''} />
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <div style={{ maxWidth: desktop ? 880 : 'none', margin: '0 auto', padding: desktop ? '20px 24px 48px' : '0 0 32px' }}>{children}</div>
      </div>
    </div>
  );
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
  const head = (
    <ProfileHead
      kicker={<>
        <Tag tone="dark">{group || '국내 LP'}</Tag>
        {p.curated ? <Tag tone="yellow">검증 프로필</Tag> : <Tag>업권 일반 정보</Tag>}
      </>}
      name={name}
      sub={p.eng}
      meta={[p.founded ? `설립 ${p.founded}년` : '', p.hq || '', p.mandate ? `출자 방식 ${p.mandate}` : ''].filter(Boolean).join(' · ')}
      tags={p.tags}
      updated={`투자내역·인사·AUM 자동 갱신 · 최근 ${[invUpdatedAt, insUpdatedAt].filter(Boolean).sort().pop() || '-'}`}
    />
  );
  return (
    <ProfileFrame backLabel="Korea LP" onBack={onBack} title={name}>
      {desktop ? <div style={{ background: KB.bg, border: `1px solid ${KB.line}`, borderRadius: 12, overflow: 'hidden' }}>{head}</div> : head}

      <Section first={!desktop} title="핵심 지표" sub={aumAsOf}>
        <div style={{ display: 'grid', gridTemplateColumns: desktop ? 'repeat(4, 1fr)' : '1fr 1fr', gap: 8 }}>
          <Metric label="운용자산(AUM)" value={aum == null ? '–' : (alloc && alloc.aum != null ? '' : '약 ') + fmtJo(aum)} note={aumNews && aumNews.display ? `기사 기준 ${aumNews.display} (${aumNews.date})` : ''} />
          <Metric accent label="대체투자 비중" value={alloc && alloc.altPct != null ? fmtPct(alloc.altPct) : '–'} />
          <Metric label="대체투자 금액" value={alloc && alloc.altAmount != null ? fmtJo(alloc.altAmount) : '–'} />
          <Metric label="대체투자 중 해외" value={alloc && alloc.overseasAltPct != null ? fmtPct(alloc.overseasAltPct) : '–'} />
        </div>
        {alloc && alloc.sourceNote && <div style={{ font: F(400, 12.5, 1.65), color: KB.sub, marginTop: 12 }}>{alloc.sourceNote}</div>}
        {alloc && alloc.source && (
          <div style={{ font: F(500, 12), color: KB.mute, marginTop: 8 }}>
            출처 {alloc.sourceUrl ? <a href={alloc.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: KB.sub }}>{alloc.source}</a> : alloc.source}
          </div>
        )}
      </Section>

      <Section title="투자내역" sub={`해외 ${ovDeals} · 전체 ${deals.length}건`}>
        <DealList events={deals} onOpen={onOpenDeal} onInst={onOpenInst} limit={6} defaultOverseas={false}
          emptyTitle="아직 수집된 투자내역이 없습니다"
          emptyDesc="기사 제목에 출자·인수·투자·위탁운용사 선정 등이 나오면 근거 기사와 함께 자동으로 쌓입니다." />
      </Section>

      <Section title="최근 동향" right={latest && <More onClick={() => onOpenArticle(latest.id)}>최신 기사</More>}>
        <RecentActivity articles={articles} />
      </Section>

      {(p.summary || p.altFocus) && (
        <Section title="운용 개요">
          {p.summary && <div style={{ font: F(400, 14.5, 1.75), color: KB.ink2 }}>{p.summary}</div>}
          {p.altFocus && (
            <div style={{ marginTop: 12, padding: '13px 15px', background: KB.band, borderRadius: 10 }}>
              <div style={{ font: F(700, 12.5), color: KB.gray, marginBottom: 5 }}>대체투자 접근</div>
              <div style={{ font: F(400, 14, 1.7), color: KB.ink2 }}>{p.altFocus}</div>
            </div>
          )}
          {!p.curated && <div style={{ font: F(400, 12, 1.6), color: KB.mute, marginTop: 10 }}>업권(유형)의 일반적인 운용 방식 기준 설명입니다. 기관별 수치·동향은 위 투자내역·기사를 참고하세요.</div>}
        </Section>
      )}

      {(L.ceo || L.cio || cio) && (
        <Section title="리더십" sub={L.asOf ? `${L.asOf} 기준` : ''}>
          {cioIsNewer && (
            <ExtLink first href={cio.url}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Tag tone="yellow">CIO · 기사 기준 최신</Tag>
                <span style={{ font: F(700, 15.5), color: KB.ink }}>{cio.person}</span>
                {cio.background && <span style={{ font: F(500, 13), color: KB.sub }}>{cio.background} 출신</span>}
              </div>
              <div style={{ font: F(500, 12), color: KB.mute, marginTop: 6 }}>{cio.date} · {cio.source}</div>
            </ExtLink>
          )}
          {[['대표', L.ceo], ['CIO', L.cio]].filter(([, x]) => x).map(([badge, x], i) => (
            <div key={badge} style={{ padding: '13px 0', borderTop: cioIsNewer || i ? `1px solid ${KB.line2}` : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Tag>{x.title || badge}</Tag>
                {x.name ? <span style={{ font: F(700, 15.5), color: KB.ink }}>{x.name}</span> : <span style={{ font: F(600, 14), color: KB.gray }}>공석·인선 진행</span>}
                {x.born && <span style={{ font: F(500, 13), color: KB.mute }}>{x.born}년생</span>}
              </div>
              {(x.bio || x.note) && <div style={{ font: F(400, 13.5, 1.65), color: KB.sub, marginTop: 6 }}>{x.bio || x.note}</div>}
            </div>
          ))}
          {cio && !cioIsNewer && (
            <ExtLink href={cio.url}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Tag tone="outline">CIO 인선</Tag><span style={{ font: F(600, 14), color: KB.ink }}>{cio.note}</span></div>
              <div style={{ font: F(500, 12), color: KB.mute, marginTop: 6 }}>{cio.date} · {cio.source}</div>
            </ExtLink>
          )}
        </Section>
      )}

      {execs && execs.length > 0 && (
        <Section title="운용조직 인사" sub="본부장·실장·팀장 · 기사 자동 추출">
          {execs.map((e, i) => (
            <ExtLink key={e.key || i} first={i === 0} href={e.url}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ font: F(700, 15), color: KB.ink }}>{e.person}</span>
                <span style={{ font: F(500, 13.5), color: KB.sub }}>{nm(e.title)}</span>
                <Tag tone="outline">{e.action}</Tag>
              </div>
              <div style={{ font: F(500, 12), color: KB.mute, marginTop: 5 }}>{e.date} · {e.source}</div>
            </ExtLink>
          ))}
        </Section>
      )}

      {move && (
        <Section title="지방이전">
          <ExtLink first href={move.url}>
            <Tag tone="outline">{move.stage}</Tag>
            <div style={{ font: F(500, 14.5, 1.5), color: KB.ink, marginTop: 8 }}>{nm(move.title)}</div>
            <div style={{ font: F(500, 12), color: KB.mute, marginTop: 5 }}>{move.date} · {move.source}</div>
          </ExtLink>
        </Section>
      )}

      {alloc && alloc.trend && alloc.trend.length >= 2 && (
        <Section title="대체투자 비중 추이" sub="연말 기준 %">
          <AltTrend trend={alloc.trend} />
        </Section>
      )}

      {returns && returns.length > 0 && (
        <Section title="자산군별 수익률" sub="기사 기준">
          {returns.map((r, i) => (
            <ExtLink key={r.asset + i} first={i === 0} href={r.url}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ flex: 1, font: F(500, 15), color: KB.ink }}>{r.label}</span>
                <Delta v={r.value} digits={1} size={15} />
                <span style={{ font: F(500, 12), color: KB.mute }}>{r.date}</span>
              </div>
            </ExtLink>
          ))}
        </Section>
      )}

      <Section title="관련 기사" sub={`${articles.length}건`}>
        {articles.length ? articles.slice(0, 30).map((a, i) => <MiniArticle key={a.id} a={a} first={i === 0} onOpen={onOpenArticle} />)
          : <Empty compact title={`최근 3개월 ${name} 관련 기사가 없습니다`} />}
        <div style={{ font: F(400, 12, 1.7), color: KB.mute, marginTop: 16 }}>
          {p.asOf ? `기준 정보 ${p.asOf}. ` : ''}투자내역·인사·AUM·관련 기사는 3시간마다 기사에서 자동 갱신되며, 각 항목은 근거 기사로 연결됩니다.
        </div>
      </Section>
    </ProfileFrame>
  );
}

// ─── 해외 GP 프로필 ──────────────────────────────────────────
function GpProfile({ name, profile, articles, deals, lpLinks, frEvents, aumNews, invUpdatedAt, onBack, onOpenArticle, onOpenDeal, onOpenInst }) {
  const desktop = useDesktop();
  const p = profile || {};
  const latest = articles[0];
  const head = (
    <ProfileHead
      kicker={<><Tag tone="dark">Global GP</Tag>{p.listed && <Tag tone="outline">{p.listed}</Tag>}</>}
      name={name}
      meta={[p.founded ? `설립 ${p.founded}년` : '', p.hq || ''].filter(Boolean).join(' · ')}
      tags={p.tags}
      updated={`딜·펀드·기사 자동 갱신 · 최근 ${invUpdatedAt || '-'}`}
    />
  );
  return (
    <ProfileFrame backLabel="Global GP" onBack={onBack} title={name}>
      {desktop ? <div style={{ background: KB.bg, border: `1px solid ${KB.line}`, borderRadius: 12, overflow: 'hidden' }}>{head}</div> : head}
      {p.summary && (
        <div style={{ background: KB.bg, padding: desktop ? '16px 20px' : '0 20px 18px', marginTop: desktop ? 16 : 0, border: desktop ? `1px solid ${KB.line}` : 'none', borderRadius: desktop ? 12 : 0 }}>
          <div style={{ font: F(400, 14.5, 1.75), color: KB.ink2 }}>{p.summary}</div>
        </div>
      )}

      <Section title="핵심 지표">
        <div style={{ display: 'grid', gridTemplateColumns: desktop ? 'repeat(3, 1fr)' : '1fr 1fr', gap: 8 }}>
          <Metric label="운용자산(AUM)" value={p.aum || '–'} note={p.aumAsOf || ''} />
          {aumNews && aumNews.display
            ? <Metric accent label="기사 기준 AUM" value={aumNews.display} note={`${aumNews.date} · ${aumNews.source}`} />
            : <Metric label="투자내역(누적)" value={`${deals.length}건`} />}
          <Metric label="최근 30일 기사" value={`${articles.filter((a) => Date.now() - itemMs(a) < 30 * 86400000).length}건`} />
        </div>
      </Section>

      <Section title="딜·투자 내역" sub={`${deals.length}건 · 인수·매각·펀드 결성·출자 유치`}>
        <DealList events={deals} onOpen={onOpenDeal} limit={8}
          emptyTitle="아직 수집된 딜이 없습니다"
          emptyDesc="기사 제목에 인수·매각·펀드 결성 등이 나오면 근거 기사와 함께 자동으로 쌓입니다." />
      </Section>

      {lpLinks && lpLinks.length > 0 && (
        <Section title="국내 LP와의 거래" sub="기사에서 함께 확인된 기관">
          <DealList events={lpLinks} onOpen={onOpenDeal} onInst={onOpenInst} showInst limit={6} />
        </Section>
      )}

      {frEvents && frEvents.length > 0 && (
        <Section title="펀드레이징">
          {frEvents.slice(0, 6).map((f, i) => (
            <div key={f.id + i} onClick={() => onOpenArticle(f.id, f)} style={{ padding: '13px 0', borderTop: i ? `1px solid ${KB.line2}` : 'none', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Tag tone={/파이널|클로즈/.test(f.stage) ? 'yellow' : 'outline'}>{f.stage}</Tag>
                {f.size && <span style={{ font: F(700, 14), color: KB.gray }}>{f.size}</span>}
                <span style={{ marginLeft: 'auto', font: F(500, 12), color: KB.mute }}>{f.date}</span>
              </div>
              <div style={{ font: F(500, 14.5, 1.5), color: KB.ink, marginTop: 6 }}>{nm(f.title)}</div>
            </div>
          ))}
        </Section>
      )}

      {((p.people && p.people.length) || p.note) && (
        <Section title="핵심 인물 · 커버리지">
          {(p.people || []).map((pp, i) => (
            <div key={pp.name + i} style={{ padding: '13px 0', borderTop: i ? `1px solid ${KB.line2}` : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ font: F(700, 15.5), color: KB.ink }}>{pp.name}</span>
                <span style={{ font: F(500, 13), color: KB.sub }}>{nm(pp.title)}</span>
              </div>
              {pp.note && <div style={{ font: F(400, 13.5, 1.65), color: KB.sub, marginTop: 6 }}>{pp.note}</div>}
            </div>
          ))}
          {p.note && (
            <div style={{ marginTop: p.people && p.people.length ? 10 : 0, padding: '13px 15px', background: KB.yellowTint, borderRadius: 10 }}>
              <div style={{ font: F(700, 12.5), color: KB.gray, marginBottom: 5 }}>커버리지 노트</div>
              <div style={{ font: F(500, 14, 1.65), color: KB.ink2 }}>{p.note}</div>
            </div>
          )}
        </Section>
      )}

      {(p.flagship || (p.strengths && p.strengths.length)) && (
        <Section title="강점 전략" sub="근거 포함">
          {p.flagship && (
            <div style={{ padding: '12px 14px', background: KB.band, borderRadius: 10, marginBottom: 6 }}>
              <div style={{ font: F(700, 12.5), color: KB.gray, marginBottom: 4 }}>플래그십 펀드</div>
              <div style={{ font: F(500, 14, 1.6), color: KB.ink2 }}>{p.flagship}</div>
            </div>
          )}
          {(p.strengths || []).map((st, i) => (
            <div key={i} style={{ padding: '13px 0', borderTop: i || p.flagship ? `1px solid ${KB.line2}` : 'none' }}>
              <div style={{ font: F(700, 15), color: KB.ink }}>{st.k && ASSET[st.k] ? ASSET[st.k].label : (st.label || '전략')}</div>
              {st.note && <div style={{ font: F(400, 13.5, 1.65), color: KB.sub, marginTop: 4 }}>{st.note}</div>}
            </div>
          ))}
        </Section>
      )}

      <Section title="최근 동향" right={latest && <More onClick={() => onOpenArticle(latest.id)}>최신 기사</More>}>
        <RecentActivity articles={articles} />
      </Section>

      <Section title="관련 기사" sub={`${articles.length}건`}>
        {articles.length ? articles.slice(0, 30).map((a, i) => <MiniArticle key={a.id} a={a} first={i === 0} onOpen={onOpenArticle} />)
          : <Empty compact title={`최근 3개월 ${name} 관련 기사가 없습니다`} />}
        <div style={{ font: F(400, 12, 1.7), color: KB.mute, marginTop: 16 }}>
          기준 정보는 공개 자료(연차보고서·공시·주요 보도) 기준이며 AUM은 근사치입니다. 딜·펀드레이징·기사·기사 기준 AUM은 3시간마다 자동 갱신됩니다.
        </div>
      </Section>
    </ProfileFrame>
  );
}

// ─── 대체투자 배분 비교 (Korea LP › 배분·인사) ───────────────────
function AllocBars({ rows, sel, onSelect }) {
  const max = Math.max(...rows.map((r) => r.altPct || 0), 1);
  return (
    <div>
      {rows.map((r, i) => {
        const on = sel === r.name;
        return (
          <div key={r.name} onClick={() => onSelect(r.name)} style={{ padding: '10px 0', borderTop: i ? `1px solid ${KB.line2}` : 'none', cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 7 }}>
              <span style={{ font: on ? F(700, 14.5) : F(500, 14.5), color: KB.ink, flex: 1 }}>{r.name}</span>
              <span style={{ font: F(700, 14.5), color: KB.ink }}>{fmtPct(r.altPct)}</span>
              <span style={{ font: F(500, 12), color: KB.mute, minWidth: 64, textAlign: 'right' }}>{fmtJo(r.altAmount)}</span>
            </div>
            <div style={{ position: 'relative', height: 8, borderRadius: 4, background: KB.band, overflow: 'hidden' }}>
              <div style={{ position: 'absolute', inset: 0, width: (r.altPct / max * 100) + '%', background: on ? KB.gray : KB.faint, borderRadius: 4 }}></div>
              <div style={{ position: 'absolute', inset: 0, width: (r.altPct * (r.overseasAltPct || 0) / 100 / max * 100) + '%', background: KB.yellow, borderRadius: 4 }}></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AllocView({ alloc, insights, onOpenLp }) {
  const all = (alloc && alloc.institutions) || [];
  const [sel, setSel] = React.useState(null);
  const [q, setQ] = React.useState('');
  const desktop = useDesktop();
  const qa = q.trim().toLowerCase(), qb = (nm(q.trim()) || '').toLowerCase();
  const hit = (s) => { if (!qa) return true; const t = String(s || '').toLowerCase(); return t.includes(qa) || (!!qb && t.includes(qb)); };
  const rows = all.filter((r) => hit(`${r.name} ${r.group}`));
  const cur = rows.find((r) => r.name === sel) || rows[0];
  if (!all.length) return <Empty title="배분 데이터를 불러오는 중입니다" />;
  const ins0 = insights || {};
  const ins = qa ? {
    ...ins0,
    cios: (ins0.cios || []).filter((c) => hit(`${c.inst} ${c.note} ${c.status}`)),
    execs: (ins0.execs || []).filter((e) => hit(`${e.inst} ${e.title} ${e.person} ${e.action}`)),
    relocations: (ins0.relocations || []).filter((m) => hit(`${m.inst} ${m.title} ${m.stage}`)),
    aums: (ins0.aums || []).filter((x) => hit(x.inst)),
    assetReturns: (ins0.assetReturns || []).filter((r) => hit(`${r.label} ${r.inst || ''}`)),
  } : ins0;
  return (
    <>
      <div style={desktop ? { padding: 4, marginBottom: 14, background: KB.card, borderRadius: 12, border: `1px solid ${KB.line}` } : { padding: '16px 20px 0' }}><SearchField value={q} onChange={setQ} onClear={() => setQ('')} placeholder="기관·인물·이슈 검색 (예: 국민연금, CIO, 전주)" /></div>
      <Section first title="기관별 대체투자 비중" sub={alloc.asOf}
        right={<span style={{ display: 'flex', alignItems: 'center', gap: 10, font: F(500, 12), color: KB.sub }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: KB.yellow }}></span>해외</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: KB.faint }}></span>전체</span>
        </span>}>
        {rows.length ? <AllocBars rows={rows} sel={cur && cur.name} onSelect={setSel} /> : <Empty compact title="일치하는 기관이 없습니다" />}
        {cur && (
          <div style={{ marginTop: 16, padding: 16, border: `1px solid ${KB.line}`, borderRadius: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <span style={{ font: F(700, 17), color: KB.ink }}>{cur.name}</span>
              <Tag>{cur.group}</Tag>
              {cur.verified ? <Tag tone="yellow">공시 확정</Tag> : <Tag tone="outline">공시 추정치</Tag>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Metric label="운용자산(AUM)" value={fmtJo(cur.aum)} />
              <Metric accent label="대체투자 금액" value={fmtJo(cur.altAmount)} />
              <Metric label="대체투자 비중" value={fmtPct(cur.altPct)} />
              <Metric label="대체투자 중 해외" value={fmtPct(cur.overseasAltPct)} />
            </div>
            <div style={{ marginTop: 12 }}><Btn kind="dark" full onClick={() => onOpenLp(cur.name)}>{cur.name} 프로필 보기</Btn></div>
          </div>
        )}
        {alloc.note && <div style={{ font: F(400, 12, 1.65), color: KB.mute, marginTop: 12 }}>※ {alloc.note}</div>}
      </Section>

      <Section title="CIO 인선 현황" sub={`기사 자동 추출${ins.updatedAt ? ' · ' + ins.updatedAt : ''}`}>
        {(ins.cios || []).length ? ins.cios.map((c, i) => (
          <ListRow key={c.inst + i} first={i === 0} chevron onClick={() => onOpenLp(c.inst)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ font: F(700, 15), color: KB.ink }}>{c.inst}</span>
              <Tag tone={c.status === '선임' ? 'yellow' : 'outline'}>{c.status}</Tag>
            </div>
            <div style={{ font: F(500, 13.5), color: KB.ink2, marginTop: 5 }}>{c.note}</div>
            <div style={{ font: F(500, 12), color: KB.mute, marginTop: 4 }}>{c.date} · {c.source}</div>
          </ListRow>
        )) : <Empty compact title="기사에서 확인된 CIO 인선 소식이 없습니다" />}
      </Section>

      <Section title="대체투자 운용조직 인사" sub="본부장·실장·팀장">
        {(ins.execs || []).length ? ins.execs.slice(0, 15).map((e, i) => (
          <ListRow key={e.key || i} first={i === 0} chevron onClick={() => onOpenLp(e.inst)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ font: F(700, 15), color: KB.ink }}>{e.inst}</span>
              <span style={{ font: F(500, 13.5), color: KB.sub }}>{nm(e.title)}</span>
            </div>
            <div style={{ font: F(500, 13.5), color: KB.ink2, marginTop: 5 }}>{e.person} {e.action}</div>
            <div style={{ font: F(500, 12), color: KB.mute, marginTop: 4 }}>{e.date} · {e.source}</div>
          </ListRow>
        )) : <Empty compact title="기사에서 확인된 실무 인사가 없습니다" />}
      </Section>

      <Section title="지방이전 이슈" sub="공제회·국책은행·연기금">
        {(ins.relocations || []).length ? ins.relocations.slice(0, 12).map((m, i) => (
          <ListRow key={m.inst + i} first={i === 0} chevron onClick={() => onOpenLp(m.inst)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ font: F(700, 15), color: KB.ink }}>{m.inst}</span>
              <Tag tone="outline">{m.stage}</Tag>
            </div>
            <div style={{ font: F(500, 13.5, 1.5), color: KB.ink2, marginTop: 5 }}>{nm(m.title)}</div>
            <div style={{ font: F(500, 12), color: KB.mute, marginTop: 4 }}>{m.date} · {m.source}</div>
          </ListRow>
        )) : <Empty compact title="수집된 지방이전 이슈가 없습니다" />}
      </Section>

      <Section title="운용자산(AUM) 최신화" sub="기사 스크리닝">
        {(ins.aums || []).filter((x) => x.unit === 'KRW').length ? ins.aums.filter((x) => x.unit === 'KRW').map((x, i) => (
          <ListRow key={x.inst + i} first={i === 0} chevron onClick={() => onOpenLp(x.inst)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ flex: 1, font: F(500, 15), color: KB.ink }}>{x.inst}</span>
              <span style={{ font: F(700, 15), color: KB.ink }}>{x.display}</span>
            </div>
            <div style={{ font: F(500, 12), color: KB.mute, marginTop: 4 }}>{x.date} · {x.source}{x.ref ? ` · 공시 ${Math.round(x.ref / 10000).toLocaleString('ko-KR')}조원` : ''}</div>
          </ListRow>
        )) : <Empty compact title="기사에서 확인된 AUM 수치가 없습니다" />}
        <div style={{ font: F(400, 12, 1.65), color: KB.mute, marginTop: 10 }}>‘운용자산·기금 규모·적립금’ 문구와 함께 쓰인 수치만 반영하고, 공시 AUM과 규모가 크게 다른 수치(하위 포트폴리오 금액 등)는 제외합니다.</div>
      </Section>

      {(ins.assetReturns || []).length > 0 && (
        <Section title="자산군별 수익률" sub="최근 기사 기준">
          {ins.assetReturns.map((r, i) => (
            <ExtLink key={r.asset + i} first={i === 0} href={r.url}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ flex: 1, font: F(500, 15), color: KB.ink }}>{r.label}{r.inst ? <span style={{ color: KB.mute }}> · {r.inst}</span> : null}</span>
                <Delta v={r.value} digits={1} size={15} />
                <span style={{ font: F(500, 12), color: KB.mute }}>{r.date}</span>
              </div>
            </ExtLink>
          ))}
        </Section>
      )}
    </>
  );
}

// ─── 펀드레이징 (운용사·펀드별 모집 단계와 단계별 일자) ─────────────
const FR_STEPS = ['모집 중', '1차 클로즈', '중간 클로즈', '클로즈', '파이널 클로즈'];
const FR_LABEL = { '모집 중': '모집 개시', '1차 클로즈': '1차 클로즈', '중간 클로즈': '중간 클로즈', '클로즈': '클로즈(단계 미상)', '파이널 클로즈': '파이널 클로즈' };
const frTone = (st) => (st === '파이널 클로즈' ? 'dark' : st === '모집 중' ? 'outline' : 'yellow');
const stratOf = (f) => f.strategy || (ASSET[f.asset] && ASSET[f.asset].label) || 'Alternatives';
const fundTitle = (f) => f.fund || (/\bfund$|펀드$/i.test(f.gp) ? f.gp : `${f.gp} · ${stratOf(f)}`);
// 공식 펀드명을 못 찾은 경우 이름처럼 보이지 않게 표시
const Unnamed = ({ f }) => (f.fund ? null : <span style={{ font: F(500, 12), color: KB.mute, marginLeft: 6, whiteSpace: 'nowrap' }}>펀드명 미확인</span>);
const frDate = (s) => (s && s.ts ? fmtDate(itemMs(s)) : '');
const lastStage = (f) => f.stages[f.stages.length - 1];

// 단계별 타임라인
function FundTimeline({ f, onOpenStage }) {
  const reached = new Set(f.stages.map((s) => s.stage));
  const steps = FR_STEPS.filter((k) => k !== '클로즈' || reached.has('클로즈'));
  return (
    <div style={{ marginTop: 12 }}>
      {steps.map((k, i) => {
        const s = f.stages.find((x) => x.stage === k);
        const last = i === steps.length - 1;
        const col = s ? (k === '파이널 클로즈' ? KB.ink : KB.yellow) : KB.line;
        return (
          <div key={k} onClick={() => s && onOpenStage(s)} style={{ display: 'flex', gap: 12, cursor: s ? 'pointer' : 'default', minHeight: 32 }}>
            <div style={{ width: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
              <span style={{ width: 11, height: 11, borderRadius: 6, marginTop: 4, background: s ? col : KB.card, border: `2px solid ${col}`, boxSizing: 'border-box' }}></span>
              {!last && <span style={{ flex: 1, width: 2, background: s ? KB.yellowLine : KB.line2, marginTop: 2 }}></span>}
            </div>
            <div style={{ flex: 1, minWidth: 0, paddingBottom: last ? 0 : 8 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ font: s ? F(600, 14) : F(500, 14), color: s ? KB.ink : KB.faint }}>{FR_LABEL[k]}</span>
                {s && <span style={{ font: F(600, 13), color: KB.sub }}>{frDate(s)}{s.dated ? '' : ' 보도'}</span>}
                {s && s.size && <span style={{ font: F(700, 13.5), color: KB.gray }}>{s.size}</span>}
              </div>
              {s && <div style={{ font: F(500, 12.5, 1.45), color: KB.mute, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.source}{s.reports > 1 ? ` 외 ${s.reports - 1}건` : ''} · {nm(s.tko || s.title)}</div>}
            </div>
          </div>
        );
      })}
      {f.dropped && f.dropped.length > 0 && (
        <div style={{ font: F(500, 12, 1.55), color: KB.mute, marginTop: 6, padding: '8px 10px', background: KB.band, borderRadius: 8 }}>
          시간 순서가 맞지 않는 보도 {f.dropped.length}건(예: 클로즈 이후의 ‘모집’ 기사)은 다른 빈티지이거나 재보도로 보고 타임라인에서 제외했습니다.
        </div>
      )}
    </div>
  );
}

function FundCard({ f, onOpenStage, onGp, first }) {
  return (
    <div style={{ padding: '16px 0', borderTop: first ? 'none' : `1px solid ${KB.line2}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <Tag tone={frTone(f.status)}>{f.status}</Tag>
        <Tag>{stratOf(f)}</Tag>
        {!f.fund && <span style={{ font: F(500, 12), color: KB.mute }}>공식 펀드명 미확인</span>}
      </div>
      <div style={{ font: F(700, 16.5, 1.4), color: KB.ink, marginTop: 8, wordBreak: 'keep-all' }}>{fundTitle(f)}</div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4, font: F(500, 13), color: KB.sub }}>
        <span onClick={() => onGp && onGp(f.gp)} style={{ font: F(600, 13), color: KB.gray, cursor: onGp ? 'pointer' : 'default' }}>{f.gp}</span>
        {f.target && <span>목표 {f.target}</span>}
        {f.hardcap && <span>하드캡 {f.hardcap}</span>}
      </div>
      <FundTimeline f={f} onOpenStage={onOpenStage} />
    </div>
  );
}

// 운용사별 보기의 한 줄(누르면 타임라인 펼침)
function FundLine({ f, onOpenStage, first }) {
  const [open, setOpen] = React.useState(false);
  const ls = lastStage(f);
  // 모집 중 펀드의 '금액'이 목표액과 같으면 모은 돈처럼 보이지 않게 따로 표시하지 않는다
  const amt = ls && ls.size && !(f.status === '모집 중' && f.target && ls.size === f.target) ? ls.size : '';
  const meta = [f.fund ? stratOf(f) : '', ls ? `${FR_LABEL[ls.stage]} ${frDate(ls)}` : '', f.target ? `목표 ${f.target}` : ''].filter(Boolean).join(' · ');
  return (
    <div style={{ borderTop: first ? 'none' : `1px solid ${KB.line2}` }}>
      <div onClick={() => setOpen((o) => !o)} style={{ padding: '12px 0', cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          {/* 운용사 카드 안이므로 이름 없는 펀드는 운용사명을 되풀이하지 않고 전략으로 부른다 */}
          <div style={{ flex: 1, minWidth: 0, font: F(600, 15, 1.45), color: f.fund ? KB.ink : KB.ink2, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{f.fund || `${stratOf(f)} 펀드`}<Unnamed f={f} /></div>
          <span style={{ color: KB.faint, transform: open ? 'rotate(180deg)' : 'none', display: 'flex', marginTop: 2 }}><Ico n="down" size={16} sw={2} /></span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
          <Tag tone={frTone(f.status)}>{f.status}</Tag>
          {amt && <span style={{ font: F(700, 14), color: KB.gray, whiteSpace: 'nowrap' }}>{amt}</span>}
          {meta && <span style={{ font: F(500, 12.5, 1.5), color: KB.mute }}>{meta}</span>}
        </div>
      </div>
      {open && <div style={{ paddingBottom: 12 }}><FundTimeline f={f} onOpenStage={onOpenStage} /></div>}
    </div>
  );
}

// 펀드레이징 캘린더 — 펀드별 단계(모집 개시·1차·중간·파이널 클로즈)를 날짜에 찍는다
const stageColor = (st) => (st === '파이널 클로즈' ? KB.ink : st === '모집 중' ? '#9FB0C2' : KB.yellow);
function FrCalendar({ funds, onOpenStage, onGp }) {
  const desktop = useDesktop();
  const evs = [];
  funds.forEach((f) => f.stages.forEach((st) => { const ms = itemMs(st); if (ms) evs.push({ f, st, ms, ...kstYMD(ms) }); }));
  evs.sort((a, b) => b.ms - a.ms);
  const latest = evs[0];
  const [ym, setYm] = React.useState(() => (latest ? [latest.y, latest.m] : [2026, 1]));
  const [day, setDay] = React.useState(null);
  const [y, m] = ym;
  const monthEvs = evs.filter((e) => e.y === y && e.m === m);
  const byDay = {};
  monthEvs.forEach((e) => { (byDay[e.d] = byDay[e.d] || []).push(e); });
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const move = (dm) => { const t = new Date(Date.UTC(y, m - 1 + dm, 1)); setYm([t.getUTCFullYear(), t.getUTCMonth() + 1]); setDay(null); };
  const today = kstYMD(Date.now());
  const shown = day ? (byDay[day] || []) : monthEvs;
  const cellH = desktop ? 78 : 50;
  let lastD = null;
  return (
    <div>
      <div style={{ border: `1px solid ${KB.line}`, borderRadius: 12, background: KB.card, padding: desktop ? '12px 12px 10px' : '10px 6px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, marginBottom: 8 }}>
          <span onClick={() => move(-1)} style={{ cursor: 'pointer', color: KB.sub, transform: 'scaleX(-1)', display: 'flex' }}><Ico n="chevron" size={20} sw={2} /></span>
          <span style={{ font: F(700, 16), color: KB.ink, minWidth: 110, textAlign: 'center' }}>{y}년 {pad2(m)}월</span>
          <span onClick={() => move(1)} style={{ cursor: 'pointer', color: KB.sub, display: 'flex' }}><Ico n="chevron" size={20} sw={2} /></span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', textAlign: 'center' }}>
          {['일', '월', '화', '수', '목', '금', '토'].map((w, i) => <div key={w} style={{ font: F(600, 12), color: i === 0 ? KB.up : i === 6 ? KB.down : KB.mute, padding: '4px 0 6px' }}>{w}</div>)}
          {cells.map((d, i) => {
            if (!d) return <div key={'e' + i} style={{ height: cellH, borderTop: `1px solid ${KB.line2}` }}></div>;
            const list = byDay[d] || [];
            const on = day === d, isToday = today.y === y && today.m === m && today.d === d;
            return (
              <div key={d} onClick={() => list.length && setDay(on ? null : d)} style={{ height: cellH, borderTop: `1px solid ${KB.line2}`, padding: '4px 2px', cursor: list.length ? 'pointer' : 'default', background: on ? KB.yellowTint : 'transparent', overflow: 'hidden', boxSizing: 'border-box' }}>
                <div style={{ font: list.length ? F(700, 13) : F(500, 13), color: isToday ? KB.woodDeep : list.length ? KB.ink : KB.faint, textDecoration: isToday ? 'underline' : 'none' }}>{d}</div>
                {desktop ? list.slice(0, 2).map((e, j) => (
                  <div key={j} title={`${e.f.gp} · ${FR_LABEL[e.st.stage]}`} style={{ marginTop: 2, font: F(600, 10.5, 1.3), color: e.st.stage === '파이널 클로즈' ? '#fff' : KB.ink, background: e.st.stage === '파이널 클로즈' ? KB.ink : e.st.stage === '모집 중' ? '#E3E9F0' : KB.yellowTint, borderRadius: 4, padding: '1px 3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left' }}>{e.f.gp}</div>
                )) : (
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 2, marginTop: 4, flexWrap: 'wrap' }}>
                    {list.slice(0, 3).map((e, j) => <span key={j} style={{ width: 6, height: 6, borderRadius: 3, background: stageColor(e.st.stage) }}></span>)}
                  </div>
                )}
                {list.length > (desktop ? 2 : 3) && <div style={{ font: F(600, 10), color: KB.sub, marginTop: 1 }}>+{list.length - (desktop ? 2 : 3)}</div>}
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 8, font: F(500, 11.5), color: KB.sub }}>
          {[['모집 중', '모집 개시'], ['1차 클로즈', '1차·중간 클로즈'], ['파이널 클로즈', '파이널 클로즈']].map(([k, l]) => (
            <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 4, background: stageColor(k) }}></span>{l}</span>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '18px 0 4px' }}>
        <span style={{ font: F(700, 15), color: KB.ink }}>{day ? `${m}월 ${day}일` : `${y}년 ${pad2(m)}월 일정`}</span>
        <span style={{ font: F(500, 12.5), color: KB.sub }}>{shown.length}건</span>
        {day && <span onClick={() => setDay(null)} style={{ marginLeft: 'auto', font: F(600, 13), color: KB.gray, cursor: 'pointer' }}>이 달 전체 보기</span>}
      </div>
      {shown.length ? shown.map((e, i) => {
        const head = !day && e.d !== lastD;
        lastD = e.d;
        return (
          <React.Fragment key={e.f.fundKey + e.st.stage + i}>
            {head && <div style={{ font: F(700, 12.5), color: KB.sub, padding: i ? '14px 0 2px' : '6px 0 2px' }}>{m}월 {e.d}일 ({['일', '월', '화', '수', '목', '금', '토'][new Date(Date.UTC(y, m - 1, e.d)).getUTCDay()]})</div>}
            <div onClick={() => onOpenStage(e.st)} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 0', borderTop: head ? 'none' : `1px solid ${KB.line2}`, cursor: 'pointer' }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: stageColor(e.st.stage), marginTop: 6, flexShrink: 0 }}></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <Tag tone={frTone(e.st.stage)}>{FR_LABEL[e.st.stage]}</Tag>
                  <span onClick={(ev) => { ev.stopPropagation(); onGp && onGp(e.f.gp); }} style={{ font: F(700, 14), color: KB.gray }}>{e.f.gp}</span>
                  {e.st.size && <span style={{ font: F(700, 14), color: KB.ink }}>{e.st.size}</span>}
                </div>
                <div style={{ font: F(600, 14, 1.45), color: e.f.fund ? KB.ink : KB.ink2, marginTop: 4, wordBreak: 'keep-all' }}>{fundTitle(e.f)}<Unnamed f={e.f} /></div>
                <div style={{ font: F(500, 12), color: KB.mute, marginTop: 3 }}>{e.st.dated ? '본문 기재일' : '첫 보도일'} · {e.st.source}{e.st.reports > 1 ? ` 외 ${e.st.reports - 1}건` : ''}</div>
              </div>
            </div>
          </React.Fragment>
        );
      }) : <Empty compact icon="calendar" title="이 달에는 기록된 펀드레이징 일정이 없습니다" desc="화살표로 다른 달을 볼 수 있습니다." />}
    </div>
  );
}

function FundraisingView({ data, onOpen, onGp }) {
  const desktop = useDesktop();
  const [tab, setTab] = React.useState('gp');
  const [st, setSt] = React.useState('all');
  const [q, setQ] = React.useState('');
  const funds = (data && data.funds) || [];
  const items = (data && data.items) || [];
  const ql = q.trim().toLowerCase();
  const qn = (nm(q.trim()) || '').toLowerCase();
  const hitS = (s) => { const t = String(s || '').toLowerCase(); return t.includes(ql) || (!!qn && qn !== ql && t.includes(qn)); };
  const byQ = (f) => !ql || hitS(`${f.gp} ${f.fund || ''} ${f.strategy || ''} ${stratOf(f)} ${f.status} ${f.target || ''}`);
  const feed = items.filter((f) => !ql || hitS(`${f.gp || ''} ${f.fund || ''} ${f.stage} ${f.title} ${nm(f.title)} ${f.tko || ''} ${f.source}`));
  const matchSt = (f) => st === 'all' || f.status === st || (st === '클로즈' && f.status !== '모집 중');
  const list = funds.filter((f) => matchSt(f) && byQ(f));
  const finals = funds.filter((f) => f.status === '파이널 클로즈' && byQ(f)).sort((a, b) => ((a.finalTs || '') < (b.finalTs || '') ? 1 : -1));
  const cnt = (k) => funds.filter((f) => (k === 'all' ? true : k === '클로즈' ? f.status !== '모집 중' : f.status === k)).length;
  const openStage = (s) => onOpen(s.id, s);
  const byGp = {};
  funds.filter(byQ).forEach((f) => { (byGp[f.gp] = byGp[f.gp] || []).push(f); });
  const gps = Object.keys(byGp).sort((a, b) => byGp[b].length - byGp[a].length || a.localeCompare(b));
  const search = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 44, padding: '0 14px', background: KB.band, borderRadius: 10, marginBottom: 12 }}>
      <Ico n="search" size={18} color={KB.mute} />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="운용사·펀드명·전략 검색 (예: Carlyle, 인프라)" style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', font: F(500, 15), color: KB.ink }} />
      {q && <span onClick={() => setQ('')} style={{ color: KB.mute, cursor: 'pointer', display: 'flex' }}><Ico n="close" size={18} /></span>}
    </div>
  );
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: KB.bg }}>
      <TopBar big title="펀드레이징" sub={`운용사 ${gps.length}곳 · 펀드 ${funds.length}개(펀드명 확인 ${funds.filter((f) => f.fund).length}) · 보도 ${items.length}건${data && data.updatedAt ? ` · ${data.updatedAt} 갱신` : ''}`} border={false} />
      <Tabs items={[['gp', '운용사별', gps.length], ['funds', '펀드별', funds.filter(byQ).length], ['final', 'Final Closed', finals.length], ['feed', '최신 보도', feed.length], ['cal', '캘린더']]} value={tab} onChange={setTab} scroll pad={20} />
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <div style={{ maxWidth: desktop ? 880 : 'none', margin: '0 auto', padding: '16px 20px 30px' }}>
          {search}
          {tab === 'cal' && <FrCalendar funds={funds.filter(byQ)} onOpenStage={openStage} onGp={onGp} />}
          {tab === 'funds' && (
            <>
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 6 }}>
                {[['all', '전체'], ['모집 중', '모집 중'], ['클로즈', '클로즈 전체'], ['1차 클로즈', '1차'], ['중간 클로즈', '중간'], ['파이널 클로즈', '파이널']].map(([k, l]) => <Chip key={k} active={st === k} onClick={() => setSt(k)} count={cnt(k)}>{l}</Chip>)}
              </div>
              {list.length ? list.map((f, i) => <FundCard key={f.fundKey} f={f} first={i === 0} onOpenStage={openStage} onGp={onGp} />)
                : <Empty compact icon="layers" title="해당하는 펀드가 없습니다" />}
            </>
          )}
          {tab === 'final' && (finals.length ? (
            <div>
              <div style={{ font: F(500, 12.5, 1.6), color: KB.mute, marginBottom: 6 }}>최종 결성(파이널 클로즈)된 펀드 · 최근 순</div>
              {finals.map((f, i) => {
                const fin = f.stages.find((s) => s.stage === '파이널 클로즈');
                return (
                  <div key={f.fundKey} onClick={() => fin && openStage(fin)} style={{ padding: '14px 0', borderTop: i ? `1px solid ${KB.line2}` : 'none', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                      <span style={{ flex: 1, minWidth: 0, font: F(700, 15.5, 1.4), color: f.fund ? KB.ink : KB.ink2, wordBreak: 'keep-all' }}>{fundTitle(f)}<Unnamed f={f} /></span>
                      <span style={{ font: F(700, 15), color: KB.gray, whiteSpace: 'nowrap' }}>{f.finalSize || '규모 미상'}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4, font: F(500, 12.5), color: KB.sub }}>
                      <span style={{ fontWeight: 600, color: KB.gray }}>{f.gp}</span>
                      <span>{stratOf(f)}</span>
                      <span>파이널 {frDate(fin)}{fin && !fin.dated ? ' 보도' : ''}</span>
                      {f.target && <span>목표 {f.target}</span>}
                      {f.hardcap && <span>하드캡 {f.hardcap}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <Empty compact icon="layers" title="파이널 클로즈된 펀드가 아직 없습니다" />)}
          {tab === 'gp' && (gps.length ? gps.map((g, gi) => {
            const open = byGp[g].filter((f) => f.status === '모집 중');
            const closed = byGp[g].filter((f) => f.status !== '모집 중');
            return (
              <div key={g} style={{ marginTop: gi ? 18 : 2, border: `1px solid ${KB.line}`, borderRadius: 12, padding: '4px 16px 8px' }}>
                <div onClick={() => onGp && onGp(g)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0 10px', cursor: 'pointer' }}>
                  <span style={{ font: F(700, 17), color: KB.ink }}>{g}</span>
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                    {open.length > 0 && <Tag tone="outline">모집 중 {open.length}</Tag>}
                    {closed.length > 0 && <Tag tone="yellow">클로즈 {closed.length}</Tag>}
                  </span>
                  <span style={{ color: KB.faint }}><Ico n="chevron" size={16} sw={2} /></span>
                </div>
                {open.length > 0 && (
                  <>
                    <div style={{ font: F(700, 12.5), color: KB.sub, padding: '8px 0 2px', borderTop: `1px solid ${KB.line}` }}>모집 중</div>
                    {open.map((f, i) => <FundLine key={f.fundKey} f={f} first={i === 0} onOpenStage={openStage} />)}
                  </>
                )}
                {closed.length > 0 && (
                  <>
                    <div style={{ font: F(700, 12.5), color: KB.sub, padding: '8px 0 2px', borderTop: `1px solid ${KB.line}` }}>클로즈(모집 완료·진행)</div>
                    {closed.map((f, i) => <FundLine key={f.fundKey} f={f} first={i === 0} onOpenStage={openStage} />)}
                  </>
                )}
              </div>
            );
          }) : <Empty compact icon="layers" title="해당하는 운용사가 없습니다" />)}
          {tab === 'feed' && !feed.length && <Empty compact icon="layers" title="해당하는 보도가 없습니다" />}
          {tab === 'feed' && feed.map((f, i) => (
            <div key={f.key || f.id + i} onClick={() => onOpen(f.id, f)} style={{ padding: '14px 0', borderTop: i ? `1px solid ${KB.line2}` : 'none', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Tag tone={frTone(f.stage)}>{f.stage}</Tag>
                {f.gp && <span style={{ font: F(700, 14), color: KB.ink }}>{f.gp}</span>}
                {f.size && <span style={{ font: F(700, 14), color: KB.gray }}>{f.size}</span>}
                <span style={{ marginLeft: 'auto', font: F(500, 12), color: KB.mute }}>{fmtDate(itemMs({ ts: f.pubTs || f.ts }))}</span>
              </div>
              {f.fund && <div style={{ font: F(600, 13.5), color: KB.gray, marginTop: 6 }}>{f.fund}</div>}
              <div style={{ font: F(500, 14.5, 1.5), color: KB.ink2, marginTop: 6 }}>{nm(f.title)}</div>
              {f.tko && <div style={{ font: F(500, 14, 1.5), color: KB.ko, marginTop: 2 }}>{nm(f.tko)}</div>}
              <div style={{ font: F(500, 12), color: KB.mute, marginTop: 4 }}>{f.source}</div>
            </div>
          ))}
          <div style={{ font: F(400, 12, 1.7), color: KB.mute, marginTop: 18, paddingTop: 14, borderTop: `1px solid ${KB.line}` }}>
            공식 펀드명·단계·금액·일자는 기사 본문에 적힌 내용에서 뽑습니다(본문에 없는 값은 비워 둠). 단계 일자는 본문에 실제 날짜가 있으면 그 날짜, 없으면 첫 보도일(‘보도’ 표시)입니다. 시간 순서가 맞지 않는 보도는 타임라인에서 제외합니다. 3시간마다 갱신·누적됩니다.
          </div>
        </div>
      </div>
    </div>
  );
}
