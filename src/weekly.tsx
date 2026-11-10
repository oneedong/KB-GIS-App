// @ts-nocheck
/*
 * KB GIS — 주간 시장현황 (Private Equity · Private Credit · Real Estate · Infrastructure · Aviation)
 *
 * weekly/index.json(보고서 목록) → weekly/YYYYMMDD.json(한 주 보고서)을 읽어 보여 준다.
 * 보고서는 매주 월요일 아침 scripts/weekly-market.mjs 가 지난주(월~일)분을 만든다.
 * 자산군마다: 요약 · 시장 현황(수치) · 한국 투자자 · 운용사별 이슈 · 트렌드와 이유 · 테마 보도 추이
 * profiles.tsx 다음, app.tsx 앞에 로드된다(전역 KB·F·Ico·Section 등 사용).
 */

const WK_ASSETS = [['PE', 'Private Equity'], ['PC', 'Private Credit'], ['RE', 'Real Estate'], ['IN', 'Infrastructure'], ['AV', 'Aviation']];
const wkDate = (s) => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${m[1]}.${m[2]}.${m[3]}` : String(s || ''); };
const wkShort = (s) => { const m = String(s || '').match(/^\d{4}-(\d{2})-(\d{2})$/); return m ? `${+m[1]}/${+m[2]}` : String(s || ''); };
const viaLabel = (v) => {
  const m = String(v || '').match(/claude-(opus|sonnet|haiku|fable)-(\d+)-?(\d+)?/);
  if (m) return `분석 Claude ${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}${m[3] ? '.' + m[3] : ''}`;
  return /^claude/.test(v || '') ? '분석 Claude' : /^gemini/.test(v || '') ? '분석 Gemini' : '자동 집계(요약 모델 미사용)';
};

// 전주 대비 증감 표시
function WkDelta({ cur, prev }) {
  if (prev == null) return null;
  const d = cur - prev;
  if (!d) return <span style={{ font: F(600, 11.5), color: KB.mute }}>전주와 같음</span>;
  return <span style={{ font: F(700, 11.5), color: d > 0 ? KB.up : KB.down }}>{d > 0 ? '▲' : '▼'} {Math.abs(d)}</span>;
}

// 근거 기사 칩 — 앱에 있는 기사는 앱에서, 아카이브에서 밀려난 기사는 원문으로 연다
function WkRefs({ ids, refs, onOpen }) {
  const list = (ids || []).filter((id) => refs && refs[id]);
  if (!list.length) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
      {list.map((id, i) => {
        const r = refs[id];
        return (
          <span key={id + i} onClick={() => onOpen(id, { url: r.u })} title={nm(r.t)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: '100%', padding: '4px 9px', borderRadius: 2, border: `1px solid ${KB.line}`, background: KB.card, cursor: 'pointer', font: F(500, 12), color: KB.ink2 }}>
            <Ico n="external" size={12} color={KB.gray} />
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 260 }}>{r.s || '기사'} · {nm(r.t)}</span>
          </span>
        );
      })}
    </div>
  );
}

const wkHit = (q) => {
  const a = String(q || '').trim().toLowerCase();
  if (!a) return () => true;
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
  const P = ({ children }) => <div style={{ font: F(400, 14.5, 1.8), color: KB.ink2, wordBreak: 'keep-all' }}>{children}</div>;
  return (
    <>
      <Section first no={1} title={`${A.label} 요약`} sub={`${wkDate(rep.from)} ~ ${wkDate(rep.to)}`}>
        {A.summary ? <FocusNote style={{ font: F(500, 15, 1.75) }}>{nm(A.summary)}</FocusNote> : <Empty compact title="이번 주 요약이 없습니다" />}
      </Section>

      <Section no={2} title="시장 현황" sub="이번 주 수집 기준">
        <div style={grid}>
          <Metric label="관련 보도" value={`${S.articles || 0}건`} note={<WkDelta cur={S.articles || 0} prev={S.prevArticles} />} />
          <Metric label="딜(투자·인수·매각 등)" value={`${S.deals || 0}건`} />
          <Metric accent label="파이널 클로즈" value={`${S.finals || 0}건`} />
          <Metric label="모집 개시·1차 클로즈" value={`${(S.launches || 0) + (S.otherCloses || 0)}건`} />
        </div>
        {typeChips.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {typeChips.map(([t, n]) => <Tag key={t} tone="outline">{t} {n}</Tag>)}
          </div>
        )}
        {A.status && <div style={{ marginTop: 14 }}><P>{nm(A.status)}</P></div>}
        {(A.finals || []).length + (A.launches || []).length + (A.closes || []).length > 0 && (
          <>
            <SubHead>펀드레이징</SubHead>
            <table style={GRID.table}>
              <colgroup><col style={{ width: desktop ? 110 : 76 }} /><col style={{ width: desktop ? 180 : 92 }} /><col /><col style={{ width: desktop ? 120 : 78 }} /></colgroup>
              <thead><tr>{['단계', '운용사', '펀드', '규모'].map((h) => <th key={h} style={GRID.th}>{h}</th>)}</tr></thead>
              <tbody>
                {[...(A.finals || []).map((x) => ({ ...x, stage: '파이널 클로즈', fin: true })), ...(A.launches || []).map((x) => ({ ...x, stage: '모집 개시' })), ...(A.closes || [])].map((x, i) => (
                  <tr key={x.id + i} onClick={() => onOpen(x.id, rep.refs && rep.refs[x.id] ? { url: rep.refs[x.id].u } : null)} style={{ cursor: 'pointer', background: x.fin ? KB.yellowTint : undefined }}>
                    <td style={{ ...GRID.tag, font: F(700, 12.5), color: x.fin ? KB.yellowText : KB.blue, background: x.fin ? KB.yellowTint : KB.cell }}>{x.stage}</td>
                    <td style={{ ...GRID.td, font: F(700, 13.5), color: KB.ink }}>{x.gp}</td>
                    <td style={{ ...GRID.td, font: F(400, 13, 1.45) }}>{x.fund && x.fund !== x.gp ? x.fund : '–'}</td>
                    <td style={{ ...GRID.td, textAlign: 'center', font: F(700, 13), color: KB.ink, whiteSpace: 'nowrap' }}>{x.size || '미상'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Section>

      <Section no={3} title="한국 투자자" sub="선호 자산·전략과 현황">
        {A.korea ? <P>{nm(A.korea)}</P> : <div style={{ font: F(400, 13.5), color: KB.mute }}>이번 주 국내 투자자 관련 보도 없음</div>}
        {(A.strategies || []).length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
            <span style={{ font: F(600, 12.5), color: KB.sub, marginRight: 2, alignSelf: 'center' }}>주목 전략</span>
            {A.strategies.map((s) => <Tag key={s} tone="yellow">{s}</Tag>)}
          </div>
        )}
        {(A.krDeals || []).length > 0 && (
          <div style={{ marginTop: 14 }}>
            <SubHead style={{ marginTop: 0 }}>국내 기관 딜</SubHead>
            {A.krDeals.map((x, i) => (
              <div key={x.id + x.inst + i} onClick={() => onOpen(x.id, rep.refs && rep.refs[x.id] ? { url: rep.refs[x.id].u } : null)} style={{ padding: '9px 0', borderTop: i ? `1px solid ${KB.line2}` : 'none', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ font: F(700, 14), color: KB.ink }}>{x.inst}</span>
                  <Tag tone="outline">{x.kind}</Tag>
                  <Tag>{x.overseas ? '해외' : '국내'}</Tag>
                  {x.amount && <span style={{ font: F(700, 13.5), color: KB.gray }}>{x.amount}</span>}
                </div>
                <div style={{ font: F(500, 13, 1.5), color: KB.sub, marginTop: 3 }}>{nm(x.t)}</div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section no={4} title="운용사별 이슈" sub={`${gpIssues.length}곳`}>
        {gpIssues.length ? (
          <table style={GRID.table}>
            <colgroup><col style={{ width: desktop ? 150 : 84 }} /><col /></colgroup>
            <thead><tr><th style={GRID.th}>운용사</th><th style={GRID.th}>이번 주 이슈 · 근거 기사</th></tr></thead>
            <tbody>
              {gpIssues.map((g, i) => (
                <tr key={g.gp + i}>
                  <td style={{ ...GRID.tag, wordBreak: 'keep-all' }}>{g.gp}</td>
                  <td style={{ ...GRID.td, verticalAlign: 'top' }}>
                    <div style={{ font: F(400, 14, 1.65), color: KB.ink2, wordBreak: 'keep-all' }}>{nm(g.issue)}</div>
                    <WkRefs ids={g.refs} refs={rep.refs} onOpen={onOpen} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <Empty compact title={q ? '검색 결과가 없습니다' : '이번 주 정리된 운용사 이슈가 없습니다'} />}
      </Section>

      <Section no={5} title="트렌드와 그 이유" sub={`${trends.length}건`}>
        {trends.length ? trends.map((t, i) => (
          <div key={i} style={{ padding: '12px 0', borderTop: i ? `1px solid ${KB.line2}` : 'none' }}>
            <SubHead style={{ margin: '0 0 4px', wordBreak: 'keep-all' }}>{`5-${i + 1}. `}{nm(t.trend)}</SubHead>
            {t.why && <Bullets items={[<><span style={{ font: F(700, 13.5), color: KB.ink }}>이유: </span>{nm(t.why)}</>]} />}
            <WkRefs ids={t.refs} refs={rep.refs} onOpen={onOpen} />
          </div>
        )) : <Empty compact title={q ? '검색 결과가 없습니다' : '이번 주 정리된 트렌드가 없습니다'} />}
      </Section>

      {themes.length > 0 && (
        <Section no={6} title="테마별 보도 추이" sub="이번 주 · 직전 주 · 국내 보도">
          <div>
            <table style={GRID.table}>
              <colgroup><col /><col style={{ width: desktop ? 80 : 52 }} /><col style={{ width: desktop ? 80 : 52 }} /><col style={{ width: desktop ? 90 : 58 }} /><col style={{ width: desktop ? 70 : 44 }} /></colgroup>
              <thead><tr>
                {['테마', '이번 주', '직전 주', '변화', '국내'].map((h) => <th key={h} style={{ ...GRID.th, padding: '6px 4px' }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {themes.filter((t) => hit(t.name)).map((t, i) => {
                  const max = Math.max(...themes.map((x) => x.n), 1);
                  return (
                    <tr key={t.name}>
                      <td style={GRID.td}>
                        <div style={{ font: F(700, 13.5), color: KB.ink }}>{t.name}</div>
                        <div style={{ height: 4, background: KB.line2, marginTop: 5 }}><div style={{ width: `${(t.n / max) * 100}%`, height: 4, background: KB.yellow }}></div></div>
                      </td>
                      <td style={{ ...GRID.td, textAlign: 'center', font: F(700, 13.5), color: KB.ink, padding: '7px 4px' }}>{t.n}</td>
                      <td style={{ ...GRID.td, textAlign: 'center', font: F(500, 13), color: KB.sub, padding: '7px 4px' }}>{t.prev == null ? '–' : t.prev}</td>
                      <td style={{ ...GRID.td, textAlign: 'center', padding: '7px 4px' }}><WkDelta cur={t.n} prev={t.prev} /></td>
                      <td style={{ ...GRID.td, textAlign: 'center', font: F(500, 13), color: KB.sub, padding: '7px 4px' }}>{t.kr}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ font: F(400, 12, 1.6), color: KB.mute, marginTop: 8 }}>기사 제목·리드에 해당 테마 단어가 나온 건수입니다(한 기사가 여러 테마에 들어갈 수 있음).</div>
        </Section>
      )}
    </>
  );
}

// ─── 종합 ─────────────────────────────────────────────────────
function WkOverview({ rep, onAsset, onOpen, q }) {
  const desktop = useDesktop();
  const hit = wkHit(q);
  const kr = rep.krShare || [];
  const maxKr = Math.max(1, ...kr.map((x) => x.articles + x.deals));
  const rows = WK_ASSETS.map(([k, label]) => ({ k, label, A: (rep.assets || {})[k] || {} })).filter(({ label, A }) => hit(`${label} ${A.summary || ''} ${A.korea || ''} ${(A.gpIssues || []).map((g) => g.gp + ' ' + g.issue).join(' ')}`));
  return (
    <>
      <Section first no={1} title="이번 주 한 줄" sub={`${wkDate(rep.from)} ~ ${wkDate(rep.to)}`}>
        <FocusNote style={{ font: F(700, 16, 1.65) }}>{nm(rep.headline || '')}</FocusNote>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10, font: F(500, 12.5), color: KB.sub }}>
          <span>보도 {rep.totals ? rep.totals.articles : 0}건 <WkDelta cur={rep.totals ? rep.totals.articles : 0} prev={rep.totals ? rep.totals.prevArticles : null} /></span>
          <span>딜 {rep.totals ? rep.totals.deals : 0}건</span>
        </div>
      </Section>

      <Section no={2} title="한국 투자자 동향" sub="선호 자산군·전략">
        {rep.korea && <div style={{ font: F(400, 14.5, 1.8), color: KB.ink2, wordBreak: 'keep-all' }}>{nm(rep.korea)}</div>}
        <div style={{ marginTop: 14 }}>
          <SubHead style={{ marginTop: 0 }}>자산군별 국내 관련 보도·국내 LP 딜</SubHead>
          {kr.map((x) => (
            <div key={x.k} onClick={() => onAsset(x.k)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', cursor: 'pointer' }}>
              <span style={{ width: desktop ? 130 : 104, flexShrink: 0, font: F(600, 13), color: KB.ink }}>{x.label}</span>
              <div style={{ flex: 1, height: 10, background: KB.line2, overflow: 'hidden', display: 'flex' }}>
                <div style={{ width: `${(x.articles / maxKr) * 100}%`, background: KB.yellow }}></div>
                <div style={{ width: `${(x.deals / maxKr) * 100}%`, background: KB.woodDeep }}></div>
              </div>
              <span style={{ width: 86, textAlign: 'right', font: F(600, 12.5), color: KB.sub, whiteSpace: 'nowrap' }}>{x.articles}건 · 딜 {x.deals}</span>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 12, marginTop: 6, font: F(500, 11.5), color: KB.mute }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: KB.yellow }}></span>국내 관련 보도</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: KB.woodDeep }}></span>국내 LP 딜</span>
          </div>
        </div>
      </Section>

      <Section no={3} title="자산군별 한눈에" sub="누르면 상세">
        {rows.length ? rows.map(({ k, label, A }, i) => {
          const S = A.stats || {};
          return (
            <div key={k} onClick={() => onAsset(k)} style={{ padding: '13px 0', borderTop: i ? `1px solid ${KB.line2}` : 'none', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ font: F(700, 15), color: KB.ink }}>{label}</span>
                <span style={{ font: F(500, 12), color: KB.sub }}>보도 {S.articles || 0}건</span>
                <WkDelta cur={S.articles || 0} prev={S.prevArticles} />
                <span style={{ font: F(500, 12), color: KB.sub }}>· 딜 {S.deals || 0} · 파이널 {S.finals || 0}</span>
                <span style={{ marginLeft: 'auto', color: KB.faint }}><Ico n="chevron" size={16} sw={2} /></span>
              </div>
              {A.summary && <div style={{ font: F(400, 13.5, 1.65), color: KB.ink2, marginTop: 5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'keep-all' }}>{nm(A.summary)}</div>}
              {(A.gpIssues || []).length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 7 }}>
                  {A.gpIssues.slice(0, 5).map((g) => <Tag key={g.gp} tone="outline">{g.gp}</Tag>)}
                </div>
              )}
            </div>
          );
        }) : <Empty compact title="검색 결과가 없습니다" />}
      </Section>
    </>
  );
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
  React.useEffect(() => { getJson('./weekly/index.json').then((d) => { const l = Array.isArray(d) ? d : []; setIndex(l); if (l[0]) setKey(l[0].key); }); }, []);
  React.useEffect(() => {
    if (!key || cache[key]) return;
    getJson(`./weekly/${key}.json`).then((d) => { if (d) setCache((c) => ({ ...c, [key]: d })); });
  }, [key]);
  const rep = key ? cache[key] : null;
  const pos = (index || []).findIndex((x) => x.key === key);
  const go = (d) => { const n = (index || [])[pos + d]; if (n) { setKey(n.key); if (scrollRef.current) scrollRef.current.scrollTop = 0; } };
  const openAsset = (k) => { setTab(k); if (scrollRef.current) scrollRef.current.scrollTop = 0; };
  const cur = (index || [])[pos];
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: desktop ? KB.band : KB.bg }}>
      <TopBar big title="시장현황" sub={rep ? `${wkDate(rep.from)} ~ ${wkDate(rep.to)} · 매주 월요일 갱신(지난주 월~일) · ${viaLabel(rep.via)}` : '주간 자산군별 시장현황'} border={false} />
      {index && index.length > 0 && (
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '0 20px 10px', background: KB.bg }}>
          <span onClick={() => go(1)} style={{ cursor: pos < index.length - 1 ? 'pointer' : 'default', color: pos < index.length - 1 ? KB.sub : KB.faint, transform: 'scaleX(-1)', display: 'flex' }}><Ico n="chevron" size={20} sw={2} /></span>
          <select value={key} onChange={(e) => { setKey(e.target.value); if (scrollRef.current) scrollRef.current.scrollTop = 0; }}
            style={{ flex: desktop ? '0 0 auto' : 1, minWidth: 0, height: 36, padding: '0 10px', borderRadius: 2, border: `1px solid ${KB.line}`, background: KB.card, font: F(600, 14), color: KB.ink }}>
            {index.map((x) => <option key={x.key} value={x.key}>{wkDate(x.date)} 주간 ({wkShort(x.from)}~{wkShort(x.to)})</option>)}
          </select>
          <span onClick={() => go(-1)} style={{ cursor: pos > 0 ? 'pointer' : 'default', color: pos > 0 ? KB.sub : KB.faint, display: 'flex' }}><Ico n="chevron" size={20} sw={2} /></span>
          {cur && pos === 0 && <Tag tone="yellow">최신</Tag>}
        </div>
      )}
      <div style={{ flexShrink: 0, background: KB.bg }}>
        <Tabs scroll={desktop} grid={desktop ? 0 : 3} pad={20} items={[['all', '종합'], ...WK_ASSETS]} value={tab} onChange={openAsset} />
      </div>
      <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <div style={{ maxWidth: desktop ? 960 : 'none', margin: '0 auto', padding: desktop ? '18px 24px 40px' : '0 0 30px' }}>
          <div style={{ padding: desktop ? '0 0 14px' : '12px 20px 4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 44, padding: '0 14px', background: desktop ? KB.card : KB.band, borderRadius: 2, border: desktop ? `1px solid ${KB.line}` : 'none' }}>
              <Ico n="search" size={18} color={KB.mute} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="운용사·이슈·트렌드 검색 (예: Blackstone, 세컨더리)"
                style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', font: F(500, 15), color: KB.ink }} />
              {q && <span onClick={() => setQ('')} style={{ color: KB.mute, cursor: 'pointer', display: 'flex' }}><Ico n="close" size={18} /></span>}
            </div>
          </div>
          {!index ? <Empty title="시장현황을 불러오는 중입니다" />
            : !index.length ? <Empty title="아직 발행된 시장현황이 없습니다" desc="매주 월요일 아침에 지난주(월~일)를 정리해 올립니다." />
            : !rep ? <Empty title="보고서를 불러오는 중입니다" />
            : tab === 'all' ? <WkOverview rep={rep} onAsset={openAsset} onOpen={onOpen} q={q} />
            : <WkAsset A={{ label: (WK_ASSETS.find(([k]) => k === tab) || [])[1], ...((rep.assets || {})[tab] || {}) }} rep={rep} onOpen={onOpen} q={q} />}
          {rep && (
            <div style={{ font: F(400, 12, 1.75), color: KB.mute, padding: desktop ? '16px 4px 0' : '16px 20px 0' }}>
              {wkDate(rep.from)}~{wkDate(rep.to)}에 수집된 기사·딜·펀드레이징 기록만을 근거로 정리했습니다. 분석 문장은 근거 기사에 적힌 사실만 쓰도록 했고, 자료에서 확인되지 않는 숫자가 들어간 문장과 근거 기사가 없는 이슈·트렌드는 자동으로 뺐습니다{rep.droppedSentences ? `(이번 주 ${rep.droppedSentences}문장 제외)` : ''}. 투자 판단의 근거로 쓰기 전에 원문을 확인하세요.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
