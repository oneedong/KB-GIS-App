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
    if (p.kind !== 'html') continue;                       // 리더 프록시는 JSON 을 망가뜨린다
    try {
      const r = await fetch(p.mk(url), { cache: 'no-store' });
      if (!r.ok) continue;
      const j = JSON.parse(await r.text());
      if (j) return j;
    } catch { /* 다음 프록시 */ }
  }
  return null;
}
async function liveYahoo(symbol) {
  const j = await proxyJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=5m`);
  const m = ((((j || {}).chart || {}).result || [{}])[0] || {}).meta || {};
  const last = typeof m.regularMarketPrice === 'number' ? m.regularMarketPrice : null;
  const prev = typeof m.chartPreviousClose === 'number' ? m.chartPreviousClose : (typeof m.previousClose === 'number' ? m.previousClose : null);
  if (last == null || !prev) return null;
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
      if (Object.keys(out).length) return out;
    }
  } catch { /* 코인베이스로 */ }
  const out = {};
  for (const [sym, id] of [['BTC-USD', 'BTC'], ['ETH-USD', 'ETH']]) {
    try {
      const r = await fetch(`https://api.coinbase.com/v2/prices/${id}-USD/spot`, { cache: 'no-store' });
      if (!r.ok) continue;
      const v = parseFloat((((await r.json()) || {}).data || {}).amount);
      if (isFinite(v)) out[sym] = { last: v, chg: null, chgPct: null, src: 'Coinbase' };
    } catch { /* 없음 */ }
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
    return (
      <Sheet open onClose={onClose} title={name} wide>
        <Empty compact title="추이 데이터를 불러오는 중입니다" />
      </Sheet>
    );
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
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const cx = (e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX) - rect.left;
    const t = (cx / rect.width * W - PL) / Math.max(1, (W - PL - PR));
    setHover(Math.max(0, Math.min(c.length - 1, Math.round(t * (c.length - 1)))));
  };
  const hi = hover, hv = hi == null ? null : c[hi], hd = hi == null ? null : d[hi];
  const hChg = hi == null || !c[0] ? null : (c[hi] - c[0]) / c[0] * 100;
  const tipX = hi == null ? 0 : Math.min(Math.max(x(hi), PL + 70), W - PR - 70);
  return (
    <Sheet open onClose={onClose} title={name} wide>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ font: F(700, 24), color: KB.ink, letterSpacing: '-.02em' }}>{fmtV(hv != null ? hv : c[c.length - 1])}<span style={{ font: F(500, 14), color: KB.sub }}>{unitTxt}</span></span>
        {hi == null
          ? <span style={{ font: F(600, 13.5), color: col }}>{range} {chg >= 0 ? '▲' : '▼'} {Math.abs(chg).toFixed(2)}%</span>
          : <span style={{ font: F(600, 13.5), color: hChg >= 0 ? KB.up : KB.down }}>{fmtD(hd)} · 구간 시작 대비 {hChg >= 0 ? '+' : '−'}{Math.abs(hChg).toFixed(2)}%</span>}
      </div>
      <div style={{ font: F(500, 12), color: KB.mute, marginTop: 4, minHeight: 16 }}>{hi == null ? '그래프를 손가락으로 끌거나 마우스를 올리면 날짜별 값이 표시됩니다' : '손을 떼면 최신 값으로 돌아갑니다'}</div>
      <div style={{ display: 'flex', gap: 6, margin: '12px 0 8px' }}>
        {['1M', '6M', '1Y', '5Y'].map((r) => <Chip key={r} active={range === r} onClick={() => { setRange(r); setHover(null); }}>{r}</Chip>)}
      </div>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', touchAction: 'none', cursor: 'crosshair' }}
           onMouseMove={pick} onMouseLeave={() => setHover(null)}
           onTouchStart={(e) => { e.preventDefault(); pick(e); }} onTouchMove={(e) => { e.preventDefault(); pick(e); }} onTouchEnd={() => setHover(null)}>
        <defs>
          <linearGradient id="tmFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={col} stopOpacity="0.12" /><stop offset="100%" stopColor={col} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const v = min + span * (1 - f), yy = PT + (H - PT - PB) * f;
          return (
            <g key={f}>
              <line x1={PL} y1={yy} x2={W - PR} y2={yy} stroke={KB.line2} strokeWidth="1.5" />
              <text x={PL - 10} y={yy + 5} textAnchor="end" fontSize="14" fill={KB.mute} fontFamily="Pretendard">{fmtV(v)}</text>
            </g>
          );
        })}
        <path d={area} fill="url(#tmFill)" />
        <path d={path} fill="none" stroke={col} strokeWidth="2.4" strokeLinejoin="round" />
        {hi != null && (
          <g>
            <line x1={x(hi)} y1={PT} x2={x(hi)} y2={H - PB} stroke={KB.faint} strokeWidth="1.5" strokeDasharray="4 4" />
            <circle cx={x(hi)} cy={y(hv)} r="6.5" fill="#fff" stroke={col} strokeWidth="3" />
            <g transform={`translate(${tipX - 70}, ${Math.max(PT, y(hv) - 58)})`}>
              <rect width="140" height="46" rx="8" fill={KB.ink} opacity="0.92" />
              <text x="70" y="19" textAnchor="middle" fontSize="13" fill="#cfd1d6" fontFamily="Pretendard">{fmtD(hd)}</text>
              <text x="70" y="37" textAnchor="middle" fontSize="16" fill="#fff" fontWeight="700" fontFamily="Pretendard">{fmtV(hv)}</text>
            </g>
          </g>
        )}
        {[0, Math.floor((d.length - 1) / 4), Math.floor((d.length - 1) / 2), Math.floor((d.length - 1) * 3 / 4), d.length - 1].map((i, k) => (
          <text key={k} x={x(i)} y={H - 12} textAnchor={k === 0 ? 'start' : k === 4 ? 'end' : 'middle'} fontSize="14" fill={KB.mute} fontFamily="Pretendard">{fmtDs(d[i])}</text>
        ))}
      </svg>
      <div style={{ font: F(500, 11.5), color: KB.mute, marginTop: 8 }}>일별 종가 · 출처 Yahoo Finance · {d.length}거래일</div>
    </Sheet>
  );
}

// ─── 지표 표 (지수·환율·원자재·크립토) ───────────────────────
function MarketTable({ rows, live, onPick, digits }) {
  const list = rows || [];
  if (!list.length) return <Empty compact title="시세를 받지 못했음" />;
  return (
    <div>
      {list.map((x0, i) => {
        const lv = live && live[x0.symbol];
        const x = lv ? { ...x0, ...lv } : x0;
        const dg = x.unit === '$' ? (x.last != null && x.last < 10 ? 3 : 2) : (digits && !/원|엔/.test(x.unit || '') ? digits : 2);
        return (
          <div key={x.name + i} onClick={() => onPick && onPick(x0)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 0', borderTop: i ? `1px solid ${KB.line2}` : 'none', cursor: onPick ? 'pointer' : 'default' }}>
            <span style={{ flex: 1, minWidth: 0, font: F(500, 15), color: KB.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {x.name}
              {lv && <span title="실시간" style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 3, background: KB.pos, marginLeft: 6, verticalAlign: 'middle' }}></span>}
            </span>
            <span style={{ font: F(700, 15.5), color: KB.ink, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
              {x.unit === '$' ? '$' : ''}{x.last == null ? '–' : x.last.toLocaleString('ko-KR', { minimumFractionDigits: dg, maximumFractionDigits: dg })}
            </span>
            <span style={{ minWidth: 72, textAlign: 'right' }}><Delta v={x.chgPct} /></span>
          </div>
        );
      })}
    </div>
  );
}

// 금리 한 줄 — 값이 없으면 지어내지 않고 비운다
function RateLine({ label, value, sub, href, first }) {
  const Tag2 = href ? 'a' : 'div';
  return (
    <Tag2 {...(href ? { href, target: '_blank', rel: 'noopener noreferrer' } : {})}
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 0', borderTop: first ? 'none' : `1px solid ${KB.line2}`, textDecoration: 'none', color: 'inherit' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: F(500, 15), color: KB.ink }}>{label}</div>
        {sub && <div style={{ font: F(500, 12), color: KB.mute, marginTop: 3 }}>{sub}{href ? ' ↗' : ''}</div>}
      </div>
      <div style={{ font: F(700, 15.5), color: value ? KB.ink : KB.faint, whiteSpace: 'nowrap' }}>{value || '–'}</div>
    </Tag2>
  );
}

// ─── 환헤지 비용 · 스왑포인트 ────────────────────────────────
function HedgeBlock({ hedge }) {
  const [open, setOpen] = React.useState(false);
  const legs = (hedge && hedge.legs) || [];
  return (
    <div>
      <div onClick={() => setOpen((o) => !o)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px', background: KB.band, borderRadius: 8, cursor: 'pointer', marginBottom: 12 }}>
        <Ico n="info" size={17} color={KB.gray} />
        <span style={{ flex: 1, font: F(600, 13.5), color: KB.ink2 }}>스왑포인트란? 왜 이런 값이 나오나요</span>
        <span style={{ color: KB.mute, transform: open ? 'rotate(180deg)' : 'none' }}><Ico n="down" size={17} sw={2} /></span>
      </div>
      {open && (
        <div style={{ marginBottom: 14 }}>
          <Diagram id="hedge" compact />
          <div style={{ font: F(400, 13.5, 1.8), color: KB.ink2, marginTop: 10 }}>
            해외 대체투자는 만기가 길어 3·6개월 스왑을 계속 <b>롤오버</b>함. 그래서 헤지 비용은 매 롤 시점의 두 통화 금리차에 따라 바뀜.
            아래 값은 금리평형 공식으로 계산한 <b>이론치</b>이며, 실제 시장 스왑포인트는 달러 수급·신용도 차이(베이시스) 때문에 더 불리하게 형성되는 경우가 많음.
          </div>
        </div>
      )}
      {legs.length === 0 ? <Empty compact title="금리·환율을 받지 못해 계산하지 못했음" /> : legs.map((leg, li) => (
        <div key={leg.ccy} style={{ marginTop: li ? 18 : 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ font: F(700, 15.5), color: KB.ink }}>{leg.ccy}/KRW</span>
            <span style={{ font: F(500, 12.5), color: KB.mute }}>현물 {leg.spot.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원</span>
            <span style={{ marginLeft: 'auto' }}>
              <Tag tone={leg.annualPct < 0 ? 'up' : 'down'}>연 {leg.annualPct > 0 ? '+' : '−'}{Math.abs(leg.annualPct).toFixed(2)}% {leg.annualPct < 0 ? '비용' : '수취'}</Tag>
            </span>
          </div>
          <div style={{ font: F(500, 12.5), color: KB.sub, margin: '6px 0 4px' }}>
            원화 {leg.krwRate.toFixed(2)}% − {leg.baseLabel} {leg.foreignRate.toFixed(2)}% = {leg.diffPct > 0 ? '+' : '−'}{Math.abs(leg.diffPct).toFixed(2)}%p
          </div>
          {leg.points.map((pt, i) => (
            <div key={pt.tenor} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 0', borderTop: `1px solid ${KB.line2}` }}>
              <span style={{ font: F(600, 14), color: KB.ink, width: 40 }}>{pt.tenor}</span>
              <span style={{ font: F(500, 12.5), color: KB.mute, flex: 1 }}>선물 {pt.forward.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원</span>
              <span style={{ font: F(700, 14.5), color: pt.point < 0 ? KB.down : KB.up }}>{pt.point > 0 ? '+' : '−'}{Math.abs(pt.point).toFixed(2)}원</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── 시황 화면 ───────────────────────────────────────────────
function BriefScreen({ b, market, briefIndex, onSelectDate, live, liveAt, liveBusy, onRefreshLive, onPick }) {
  const desktop = useDesktop();
  const isLatest = !!(b && market && b.dateKey === market.dateKey);
  const lv = isLatest ? live : null;
  const grid = desktop ? { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px', alignItems: 'start' } : {};
  const col = (children) => <div style={{ minWidth: 0 }}>{children}</div>;
  const rateGroups = Object.entries(((b && b.tenorRates) || []).reduce((m, r) => { (m[r.group] = m[r.group] || []).push(r); return m; }, {}));
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: desktop ? KB.band : KB.bg }}>
      <TopBar big title={b && b.dateKey ? `${b.dateKey} 시황` : '데일리 시황'} sub={b ? `${b.asOf} 기준 · 매일 08:00 갱신` : '브리핑을 불러오는 중입니다'}
        right={isLatest && (
          <div onClick={onRefreshLive} style={{ display: 'flex', alignItems: 'center', gap: 5, height: 32, padding: '0 11px', borderRadius: 16, border: `1px solid ${KB.line}`, cursor: 'pointer', font: F(600, 12.5), color: liveAt ? KB.pos : KB.sub }}>
            {liveAt && <span style={{ width: 6, height: 6, borderRadius: 3, background: KB.pos }}></span>}
            {liveBusy ? '조회 중…' : liveAt ? `실시간 ${liveAt}` : '실시간 조회'}
          </div>
        )} />
      {briefIndex && briefIndex.length > 0 && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '10px 16px', background: KB.bg, borderBottom: `1px solid ${KB.line}`, flexShrink: 0 }}>
          {briefIndex.slice(0, 40).map((x) => <Chip key={x.dateKey} active={b && b.dateKey === x.dateKey} onClick={() => onSelectDate(x.dateKey)}>{x.dateKey}</Chip>)}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <div style={{ maxWidth: desktop ? 1120 : 'none', margin: '0 auto', padding: desktop ? '20px 24px 40px' : 0 }}>
          {!b ? <Empty title="아직 브리핑이 없습니다" desc="매일 아침 08시(KST)에 전일 시장을 정리해 올립니다." /> : (
            <>
              <Section first title="한줄 요약">
                <div style={{ font: F(500, 15.5, 1.75), color: KB.ink, padding: '14px 16px', background: KB.yellowTint, borderRadius: 10, borderLeft: `4px solid ${KB.yellow}` }}>{b.summary}</div>
                <div style={{ font: F(700, 13.5), color: KB.ink, margin: '16px 0 8px' }}>관찰 포인트</div>
                {(b.watch && b.watch.length) ? (
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                    {b.watch.map((w, i) => (
                      <li key={i} style={{ display: 'flex', gap: 9, font: F(400, 14, 1.7), color: KB.ink2, padding: '3px 0' }}>
                        <span style={{ width: 5, height: 5, borderRadius: 3, background: KB.gray, marginTop: 10, flexShrink: 0 }}></span><span>{w}</span>
                      </li>
                    ))}
                  </ul>
                ) : <div style={{ font: F(400, 13.5), color: KB.mute }}>기준선을 넘는 특이 신호는 없었음</div>}
              </Section>
              <div style={grid}>
                {col(<>
                  <Section title="국내증시" sub="누르면 5년 추이"><MarketTable rows={b.kr} live={lv} onPick={onPick} /></Section>
                  <Section title="해외증시"><MarketTable rows={b.global} live={lv} onPick={onPick} /></Section>
                  <Section title="환율"><MarketTable rows={b.fx} live={lv} onPick={onPick} digits={4} /></Section>
                  <Section title="원자재" sub="USD"><MarketTable rows={b.commodity} live={lv} onPick={onPick} /></Section>
                  <Section title="크립토" sub="USD · 실시간"><MarketTable rows={b.crypto} live={lv} onPick={onPick} /></Section>
                </>)}
                {col(<>
                  <Section title="기준금리">
                    <RateLine first label="한국 (한국은행)" value={b.rates && b.rates.kr && b.rates.kr.rate != null ? `${b.rates.kr.rate.toFixed(2)}%` : ''} sub={b.rates && b.rates.kr ? `${b.rates.kr.asOf || ''} · ${b.rates.kr.src || '한국은행'}` : '이번 회차 수집 실패'} href={b.rates && b.rates.kr && b.rates.kr.url} />
                    <RateLine label="미국 (FOMC 목표범위)" value={b.rates && b.rates.us ? (b.rates.us.target || `${(b.rates.us.effr || 0).toFixed(2)}%`) : ''} sub={b.rates && b.rates.us ? `EFFR ${b.rates.us.effr != null ? b.rates.us.effr.toFixed(2) + '%' : '–'} · ${b.rates.us.asOf || ''} · New York Fed` : '이번 회차 수집 실패'} />
                    {b.ust && b.ust[0] && b.ust[0].last != null && (
                      <div onClick={() => onPick(b.ust[0])} style={{ cursor: 'pointer' }}>
                        <RateLine label={b.ust[0].name} value={`${b.ust[0].last.toFixed(2)}%`} sub={`전일 대비 ${b.ust[0].chg >= 0 ? '+' : '−'}${Math.abs(b.ust[0].chg * 100).toFixed(0)}bp · 누르면 5년 추이`} />
                      </div>
                    )}
                  </Section>
                  <Section title="SOFR · SONIA · EURIBOR · TONA" sub="실무 주요 테너">
                    {rateGroups.length ? rateGroups.map(([g, rows], gi) => (
                      <div key={g} style={{ marginTop: gi ? 14 : 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', font: F(700, 13.5), color: KB.gray, paddingBottom: 6, borderBottom: `1px solid ${KB.line}` }}>
                          <span>{g}</span><span style={{ marginLeft: 'auto', font: F(500, 11.5), color: KB.mute }}>{rows[0].src}</span>
                        </div>
                        {rows.map((r, i) => (
                          <div key={r.tenor + i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: i ? `1px solid ${KB.line2}` : 'none' }}>
                            <span style={{ flex: 1, font: F(500, 14.5), color: KB.ink }}>{r.tenor}</span>
                            <span style={{ font: F(700, 15), color: KB.ink }}>{r.rate.toFixed(3)}%</span>
                            <span style={{ font: F(500, 11.5), color: KB.mute, minWidth: 78, textAlign: 'right' }}>{r.asOf}</span>
                          </div>
                        ))}
                      </div>
                    )) : <Empty compact title="금리 데이터를 받지 못했음" />}
                  </Section>
                  <Section title="환헤지 비용 · 스왑포인트"><HedgeBlock hedge={b.hedge} /></Section>
                </>)}
              </div>
              <Section title="주요이슈 뉴스">
                {(b.issues && b.issues.length) ? (
                  <div style={desktop ? { display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 24 } : {}}>
                    {b.issues.map((it, i) => (
                      <a key={i} href={it.url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', textDecoration: 'none', color: 'inherit', padding: '13px 0', borderTop: `1px solid ${KB.line2}` }}>
                        <div style={{ font: F(500, 14.5, 1.5), color: KB.ink }}>{it.title}</div>
                        <div style={{ font: F(500, 12), color: KB.mute, marginTop: 5 }}>{it.source}</div>
                      </a>
                    ))}
                  </div>
                ) : <Empty compact title="수집된 이슈가 없음" />}
                {(b.errors && b.errors.length > 0) && <div style={{ font: F(500, 12, 1.6), color: KB.mute, marginTop: 12 }}>※ 받지 못한 항목 {b.errors.length}건 — 값을 추정하지 않고 비워 뒀음</div>}
                <div style={{ font: F(400, 12, 1.8), color: KB.mute, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${KB.line}` }}>
                  출처 · 지수·환율·원자재·추이 Yahoo Finance(폴백 Stooq) · 크립토 Binance(폴백 Coinbase) · SOFR/EFFR·FOMC New York Fed · SONIA·영국 정책금리 Bank of England ·
                  €STR ECB · EURIBOR 일별 공표 · TONA 일본은행 · 한국 기준금리 한국은행 · 뉴스 구글 뉴스 · 환헤지는 위 금리로 금리평형 계산
                </div>
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// 홈 상단 요약 카드 — 오늘의 시황 한눈에
function BriefDigest({ market, onOpen }) {
  if (!market || !Array.isArray(market.kr)) return null;
  const pickRow = (list, name) => (list || []).find((x) => x.name === name);
  const rows = [pickRow(market.kr, '코스피'), pickRow(market.global, 'S&P 500'), pickRow(market.global, '나스닥'), pickRow(market.fx, '달러/원')].filter(Boolean);
  return (
    <div onClick={onOpen} style={{ margin: '14px 16px 4px', padding: '14px 16px', borderRadius: 12, border: `1px solid ${KB.line}`, background: KB.bg, cursor: 'pointer' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ font: F(700, 14.5), color: KB.ink }}>오늘의 시황</span>
        <span style={{ font: F(500, 12), color: KB.mute }}>{market.dateKey}</span>
        <span style={{ marginLeft: 'auto', color: KB.faint }}><Ico n="chevron" size={17} sw={2} /></span>
      </div>
      <div style={{ font: F(400, 13.5, 1.6), color: KB.ink2, marginTop: 6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{market.summary}</div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${rows.length}, 1fr)`, gap: 8, marginTop: 10 }}>
        {rows.map((r) => (
          <div key={r.name} style={{ minWidth: 0 }}>
            <div style={{ font: F(500, 11.5), color: KB.mute, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
            <div style={{ font: F(700, 13.5), color: KB.ink, marginTop: 2 }}>{r.last == null ? '–' : r.last.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}</div>
            <Delta v={r.chgPct} size={11.5} />
          </div>
        ))}
      </div>
    </div>
  );
}
