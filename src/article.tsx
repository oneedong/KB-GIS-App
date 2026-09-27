// @ts-nocheck
/*
 * KB GIS — 기사 목록 한 줄 · 기사 상세(전문 보기)
 *
 * 상세 화면
 *   - 전문: 수집기가 확보한 bodies/<id>.json → 없으면 원문 페이지를 받아 브라우저에서 추출(reader.tsx)
 *   - 광고·관련기사·기자 정보·사진 설명 등 기사와 무관한 부분은 article-clean.js 규칙으로 제외
 *   - 핵심 문장: 글자 전체를 덮는 형광펜
 *   - 용어: 처음 나온 곳에 점선 밑줄 → 누르면 쉬운 설명·그림, 본문 아래에 '이 기사에 나온 용어'
 */

// 형광펜 — 글자 높이 전체를 덮도록 인라인 배경 + 위아래 여백, 줄이 바뀌어도 각 줄에 같은 모양
const HIGHLIGHT = {
  background: 'rgba(196, 154, 104, .34)',   // 나뭇결 색 형광펜
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
  return (
    <div style={{ borderBottom: `1px solid ${KB.line2}`, background: selected ? KB.yellowTint : KB.bg }}>
    <div onClick={onOpen} onPointerDown={onPress} style={{ display: 'flex', gap: 10, padding: more.length ? '16px 20px 8px' : '16px 20px', cursor: 'pointer' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, font: F(600, 12.5), color: KB.gray, minWidth: 0 }}>
          {isNew && <span title="새 기사" style={{ width: 6, height: 6, borderRadius: 3, background: KB.yellow, flexShrink: 0 }}></span>}
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.instLabel}</span>
          {item.assetLabel && <span style={{ color: KB.faint }}>·</span>}
          {item.assetLabel && <span style={{ font: F(500, 12.5), color: KB.mute, whiteSpace: 'nowrap' }}>{item.assetLabel}</span>}
        </div>
        <div style={{ font: F(600, 16, 1.45), color: KB.ink, marginTop: 6, letterSpacing: '-.01em', wordBreak: 'keep-all', overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.ko}</div>
        {item.tko && <div style={{ font: F(500, 14.5, 1.45), color: KB.ko, marginTop: 4, wordBreak: 'keep-all', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.tko}</div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 8, font: F(500, 12), color: KB.mute, minWidth: 0 }}>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '50%' }}>{item.source}</span>
          <span>·</span>
          <span style={{ whiteSpace: 'nowrap' }}>{shortWhen(item)}</span>
          {item.b ? <Tag tone="outline" style={{ height: 18, padding: '0 5px', font: F(600, 10.5), marginLeft: 2 }}>전문</Tag> : null}
          {item.lang === 'en' && <Tag tone="outline" style={{ height: 18, padding: '0 5px', font: F(600, 10.5) }}>EN</Tag>}
        </div>
      </div>
      <div onClick={onBookmark} role="button" aria-label="북마크" style={{ alignSelf: 'flex-start', padding: 4, margin: '-2px -6px 0 0', cursor: 'pointer' }}>
        <Ico n="bookmark" size={20} sw={1.7} fill={item.bookmarked ? KB.yellow : 'none'} color={item.bookmarked ? KB.gray : KB.faint} />
      </div>
    </div>
    {more.length > 0 && (
      <div style={{ padding: '0 20px 12px' }}>
        <div onClick={() => setOpen((o) => !o)} role="button" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: '100%', padding: '4px 10px', borderRadius: 14, background: KB.band, font: F(600, 12), color: KB.sub, cursor: 'pointer' }}>
          <span style={{ whiteSpace: 'nowrap' }}>같은 소식 {more.length}건</span>
          <span style={{ font: F(500, 12), color: KB.mute, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>· {srcs.slice(0, 3).join(', ')}{srcs.length > 3 ? ' 외' : ''}</span>
          <span style={{ display: 'flex', transform: open ? 'rotate(180deg)' : 'none', color: KB.faint }}><Ico n="down" size={14} sw={2} /></span>
        </div>
        {open && (
          <div style={{ marginTop: 6, borderLeft: `2px solid ${KB.line}`, paddingLeft: 12 }}>
            {more.map((m) => (
              <div key={m.id} onClick={() => onOpenOther && onOpenOther(m.id)} onPointerDown={() => fetchArchiveBody(m)} style={{ padding: '7px 0', cursor: 'pointer' }}>
                <div style={{ font: F(500, 13.5, 1.45), color: KB.ink2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{m.tko || m.ko}</div>
                <div style={{ font: F(500, 11.5), color: KB.mute, marginTop: 2 }}>{m.source} · {shortWhen(m)}{m.b ? ' · 전문' : ''}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    )}
    </div>
  );
}

// 날짜별 머리(목록 안에서 고정)
function DayHeader({ label, count }) {
  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 1, display: 'flex', alignItems: 'baseline', gap: 6, padding: '10px 20px 9px', background: KB.band, borderBottom: `1px solid ${KB.line}` }}>
      <span style={{ font: F(700, 13.5), color: KB.ink }}>{label}</span>
      {count != null && <span style={{ font: F(500, 12), color: KB.mute }}>{count}건</span>}
    </div>
  );
}

// 본문 속 용어 — 점선 밑줄, 누르면 설명
function TermMark({ g, onOpen, children }) {
  return (
    <span onClick={(e) => { e.stopPropagation(); onOpen && onOpen(g.id); }} title={g.short}
          style={{ borderBottom: `1.5px dotted ${KB.gray}`, cursor: 'pointer', paddingBottom: 1 }}>{children}</span>
  );
}

function BodySkeleton() {
  return (
    <div aria-label="본문을 불러오는 중">
      {[92, 100, 96, 88, 60, 0, 97, 100, 84].map((w, i) => (
        w ? <div key={i} style={{ height: 14, width: w + '%', background: KB.band, borderRadius: 4, margin: '0 0 13px' }}></div> : <div key={i} style={{ height: 12 }}></div>
      ))}
    </div>
  );
}

function ArticleDetail({ sel, bookmarked, onToggleBm, onShare, onBack, showBack, deals, onOpenDeal, onOpenInst, onOpenTerm, onDead }) {
  const desktop = useDesktop();
  const [st, setSt] = React.useState({ id: null, body: '', ko: null, loading: false, dead: false, src: '' });
  const [lang, setLang] = React.useState('both');   // 영문 기사: both(한영 병기) | ko | en
  const [openTerm, setOpenTerm] = React.useState(null);
  const [retryOf, setRetryOf] = React.useState({ id: null, n: 0 });   // 본문 다시 불러오기(기사별)
  const retry = sel && retryOf.id === sel.id ? retryOf.n : 0;
  const scrollRef = React.useRef(null);

  React.useEffect(() => {
    if (!sel) return undefined;
    setOpenTerm(null);
    if (scrollRef.current && !retry) scrollRef.current.scrollTop = 0;
    setSt({ id: sel.id, body: '', ko: null, loading: true, dead: false, src: '' });
    const ctrl = new AbortController();
    let off = false;
    loadArticleBody(sel, ctrl.signal)
      .then((r) => {
        if (off) return;
        setSt({ id: sel.id, body: r.body || '', ko: r.ko || null, loading: false, dead: !!r.dead, src: r.src || '' });
        if (r.dead && onDead) onDead(sel.id);
      })
      .catch(() => { if (!off) setSt((s) => ({ ...s, loading: false })); });
    return () => { off = true; ctrl.abort(); };
  }, [sel ? sel.id : null, retry]);

  if (!sel) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: KB.band }}>
        <Empty icon="book" title="왼쪽 목록에서 기사를 선택하세요" desc="기사 전문과 핵심 문장, 용어 설명을 함께 볼 수 있습니다." />
      </div>
    );
  }

  const mine = st.id === sel.id;
  const lead0 = cleanBody(sel.body || '');
  const lead = lead0 && titleOk(sel.ko, lead0) ? lead0 : '';     // 제목과 무관한 리드(매체 소개문 등)는 쓰지 않는다
  const fetched = mine ? nm(st.body) : '';
  const text = fetched && fetched.length >= lead.length * 0.8 ? fetched : (lead || fetched);
  const isFull = !!fetched && fetched.length > Math.max(420, lead.length + 40);
  const loading = mine ? st.loading : true;
  // 문장이 하나도 없는 조각(다른 기사 제목·메뉴 잔재)만 남았다면 본문이 없는 것으로 본다
  const ko = mine && st.ko && Array.isArray(st.ko.p) ? st.ko : null;
  const isEn = sel.lang === 'en';
  const rawParas = ko && fetched ? String(fetched).split(/\n+/).map((x) => x.trim()).filter(Boolean) : toParagraphs(text, sel.ko);
  const paragraphs = rawParas.some((p) => isSentencey(p.replace(/…$/, '')) || p.length > 90) ? rawParas : [];
  const { paraSents, hl } = keySentences(paragraphs, sel.inst);
  const mark = makeTermMarker(12);
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
    if (!t) return null;
    return sub
      ? <div key={'k' + pi} style={{ font: F(700, 16, 1.5), color: KB.ko, margin: lang === 'ko' ? '28px 0 10px' : '-4px 0 12px' }}>{t}</div>
      : <p key={'k' + pi} style={{ font: F(400, 16, 1.85), color: KB.ko, margin: lang === 'ko' ? '0 0 20px' : '-8px 0 24px', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
          {mark(t).map((x, k) => (x.g ? <TermMark key={k} g={x.g} onOpen={onOpenTerm}>{x.t}</TermMark> : <React.Fragment key={k}>{x.t}</React.Fragment>))}
        </p>;
  };
  const showEn = !ko || lang !== 'ko';
  const showKo = ko && lang !== 'en';
  const bodyNodes = paraSents.map((ss, pi) => {
    const p = paragraphs[pi];
    const sub = isSubhead(p, paragraphs[pi + 1]);
    if (!showEn) return koNode(pi, sub) || (lang === 'ko' && pi >= (ko.n || ko.p.length) ? <p key={pi} style={{ font: F(400, 16.5, 1.9), color: KB.ink2, margin: '0 0 20px' }}>{p}</p> : null);
    if (sub) {
      return <React.Fragment key={pi}><h3 style={{ font: F(700, 17, 1.5), color: KB.ink, margin: '28px 0 10px', letterSpacing: '-.01em' }}>{p}</h3>{showKo && koNode(pi, true)}</React.Fragment>;
    }
    return (
      <React.Fragment key={pi}>
      <p style={{ font: F(400, 16.5, 1.9), color: KB.ink2, margin: '0 0 20px', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
        {ss.map((s, si) => {
          const parts = mark(s).map((x, k) => (x.g
            ? <TermMark key={k} g={x.g} onOpen={onOpenTerm}>{x.t}</TermMark>
            : <React.Fragment key={k}>{x.t}</React.Fragment>));
          const gap = si < ss.length - 1 ? ' ' : '';
          return hl.has(pi + ':' + si)
            ? <React.Fragment key={si}><span style={HIGHLIGHT}>{parts}</span>{gap}</React.Fragment>
            : <React.Fragment key={si}>{parts}{gap}</React.Fragment>;
        })}
      </p>
      {showKo && koNode(pi, false)}
      </React.Fragment>
    );
  });

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: KB.bg }}>
      <TopBar onBack={showBack ? onBack : null} backLabel={showBack ? '' : ''} title={desktop ? '' : ''}
        right={<>
          <IconBtn n="bookmark" label={bookmarked ? '북마크 해제' : '북마크'} active={bookmarked} onClick={onToggleBm} />
          <IconBtn n="share" label="공유" onClick={onShare} />
          {viewUrl && <a href={viewUrl} target="_blank" rel="noopener noreferrer" aria-label="원문 열기" title="원문 열기" style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', color: KB.ink2 }}><Ico n="external" size={21} /></a>}
        </>} />
      <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <article style={{ maxWidth: 720, margin: '0 auto', padding: desktop ? '28px 32px 48px' : '22px 20px 40px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Tag tone="dark">{sel.catLabel}</Tag>
            {sel.cat !== '마켓' && sel.inst && (
              <span onClick={() => onOpenInst && onOpenInst(sel)} style={{ font: F(600, 13), color: KB.gray, cursor: onOpenInst ? 'pointer' : 'default' }}>{sel.inst}</span>
            )}
            <span style={{ font: F(500, 13), color: KB.mute }}>{[sel.assetLabel, sel.regionLabel].filter(Boolean).join(' · ')}</span>
          </div>
          <h1 style={{ font: F(700, desktop ? 26 : 23, 1.4), color: KB.ink, letterSpacing: '-.025em', margin: '12px 0 0', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{sel.ko}</h1>
          {sel.tko && <div style={{ font: F(600, isEn ? 19 : 17, 1.45), color: KB.ko, marginTop: 8, wordBreak: 'keep-all' }}>{sel.tko}</div>}
          <div style={{ font: F(500, 13), color: KB.mute, marginTop: 12, paddingBottom: 18, borderBottom: `1px solid ${KB.line}` }}>{sel.source} · {when}</div>

          {isEn && (
            <div style={{ margin: '16px 0 0' }}>
              {ko ? (
                <div style={{ display: 'inline-flex', padding: 3, background: KB.band, borderRadius: 10 }}>
                  {[['both', '한영 병기'], ['ko', '한글'], ['en', 'English']].map(([k, l]) => (
                    <div key={k} onClick={() => setLang(k)} style={{ padding: '7px 14px', borderRadius: 8, cursor: 'pointer', font: lang === k ? F(700, 13) : F(500, 13), color: lang === k ? KB.ink : KB.sub, background: lang === k ? KB.card : 'transparent', boxShadow: lang === k ? '0 1px 2px rgba(0,0,0,.08)' : 'none' }}>{l}</div>
                  ))}
                </div>
              ) : (!loading && paragraphs.length > 0 && (
                <div style={{ font: F(500, 12.5, 1.6), color: KB.mute }}>본문 번역은 수집할 때 최신 기사부터 차례로 반영됩니다. 아직 번역되지 않아 영문으로 표시합니다.</div>
              ))}
              {ko && <div style={{ font: F(500, 12, 1.6), color: KB.mute, marginTop: 8 }}><span style={{ color: KB.ko, fontWeight: 600 }}>파란 글씨</span>는 한국어 번역입니다{ko.n && ko.n < paragraphs.length ? ` · 앞 ${ko.n}개 문단 번역` : ''}.</div>}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '18px 0 16px', font: F(500, 12.5), color: KB.mute }}>
            {loading && !paragraphs.length ? <span>원문에서 본문을 불러오는 중</span>
              : isFull ? <Tag tone="outline">전문</Tag>
              : paragraphs.length ? <Tag>기사 앞부분</Tag> : null}
            {hl.size > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ ...HIGHLIGHT, padding: '0 6px', fontWeight: 600, font: F(600, 11.5) }}>핵심</span>핵심 문장</span>}
            {terms.length > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ borderBottom: `1.5px dotted ${KB.gray}`, color: KB.ink2 }}>용어</span>누르면 설명</span>}
            {loading && paragraphs.length > 0 && <span>전문 불러오는 중</span>}
          </div>

          {paragraphs.length ? bodyNodes
            : loading ? <BodySkeleton />
            : (mine && st.dead)
              ? <div style={{ padding: '14px 16px', background: KB.band, borderRadius: 10, font: F(500, 14, 1.65), color: KB.ink2 }}>원문 기사가 삭제되어 더 이상 볼 수 없습니다. 다음 수집 때 목록에서 빠집니다.</div>
              : <div style={{ padding: '14px 16px', background: KB.band, borderRadius: 10, font: F(500, 14, 1.65), color: KB.ink2 }}>
                  언론사 보안 정책(유료·접근 제한)으로 본문을 가져오지 못했습니다. 아래 ‘원문 보기’로 확인하세요.
                  {realUrl && <span onClick={() => setRetryOf({ id: sel.id, n: retry + 1 })} role="button" style={{ display: 'inline-block', marginLeft: 6, font: F(600, 13.5), color: KB.gray, textDecoration: 'underline', textUnderlineOffset: 3, cursor: 'pointer' }}>다시 시도</span>}
                </div>}

          {!loading && paragraphs.length > 0 && !isFull && realUrl && (
            <div style={{ font: F(500, 13.5, 1.6), color: KB.sub, padding: '12px 14px', background: KB.band, borderRadius: 10, marginTop: 4 }}>
              {sel.paywalled ? '유료 기사라 앞부분만 제공됩니다. 전체 내용은 원문에서 확인하세요.' : '언론사 보안 정책(유료·접근 제한)으로 전문을 가져오지 못해 앞부분만 표시했습니다. 전체 내용은 원문에서 확인하세요.'}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 22 }}>
            {viewUrl && <Btn href={viewUrl} icon="external" full>원문 보기</Btn>}
            <Btn kind="secondary" icon="share" onClick={onShare} style={{ flex: viewUrl ? '0 0 auto' : 1, width: viewUrl ? 'auto' : '100%' }}>공유</Btn>
          </div>
          <div style={{ font: F(400, 12, 1.7), color: KB.mute, marginTop: 12 }}>
            {paragraphs.length
              ? `본문 출처 ${sel.source}. 광고·관련기사·기자 정보·사진 설명 등 기사 내용과 무관한 부분은 자동으로 제외했습니다. 핵심 문장 표시는 금액·출자·인수 같은 표현을 기준으로 고른 참고용입니다.`
              : `출처 ${sel.source}`}
          </div>

          {deals && deals.length > 0 && (
            <div style={{ marginTop: 34 }}>
              <div style={{ font: F(700, 17), color: KB.ink, paddingBottom: 10, borderBottom: `2px solid ${KB.ink}` }}>이 기사의 투자내역</div>
              {clusterDeals(deals).map((c, i) => <DealRow key={c.key + i} c={c} first showInst onInst={onOpenInst ? (e) => onOpenInst(e) : null} />)}
            </div>
          )}

          {terms.length > 0 && (
            <div style={{ marginTop: 34 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, paddingBottom: 10, borderBottom: `2px solid ${KB.ink}` }}>
                <span style={{ font: F(700, 17), color: KB.ink }}>이 기사에 나온 용어</span>
                <span style={{ font: F(500, 12.5), color: KB.mute }}>눌러서 쉬운 설명과 그림 보기</span>
              </div>
              {terms.map((g) => (
                <TermCard key={g.id} g={g} open={openTerm === g.id} onToggle={() => setOpenTerm((o) => (o === g.id ? null : g.id))} onOpenTerm={onOpenTerm} />
              ))}
            </div>
          )}
        </article>
      </div>
    </div>
  );
}

// 용어 설명 시트(어느 화면에서나)
function TermSheet({ id, onClose, onOpenTerm, onLearn }) {
  const g = id ? GLOSSARY_BY_ID[id] : null;
  return (
    <Sheet open={!!g} onClose={onClose} title="용어 설명">
      {g && (
        <>
          <TermCard g={g} open onToggle={() => {}} onOpenTerm={onOpenTerm} />
          <div style={{ marginTop: 16 }}><Btn kind="secondary" full icon="book" onClick={onLearn}>용어·개념 전체 보기</Btn></div>
        </>
      )}
    </Sheet>
  );
}

// 공유 시트 — OS 공유를 못 쓰는 환경용(실제 기사 주소만 다룬다)
function ShareSheet({ open, item, onClose, onCopied }) {
  if (!item) return null;
  const url = item.url || '';
  const copy = () => {
    try { navigator.clipboard && navigator.clipboard.writeText(url); } catch (e) { /* 무시 */ }
    onCopied && onCopied();
  };
  const mail = `mailto:?subject=${encodeURIComponent(item.ko)}&body=${encodeURIComponent(item.ko + '\n' + url)}`;
  return (
    <Sheet open={open} onClose={onClose} title="공유">
      <div style={{ font: F(600, 15, 1.5), color: KB.ink }}>{item.ko}</div>
      <div style={{ font: F(500, 12.5), color: KB.mute, marginTop: 4 }}>{item.source}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, padding: '10px 10px 10px 14px', background: KB.band, borderRadius: 10 }}>
        <span style={{ flex: 1, minWidth: 0, font: F(500, 13), color: KB.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{url}</span>
        <Btn onClick={copy} style={{ height: 36, padding: '0 14px', font: F(700, 13) }}>복사</Btn>
      </div>
      <div style={{ marginTop: 10 }}><Btn kind="secondary" full href={mail} icon="external">메일로 보내기</Btn></div>
    </Sheet>
  );
}
