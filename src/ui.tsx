// @ts-nocheck
/*
 * KB GIS — 디자인 시스템 (KB증권 글로벌상품영업부 문서 양식 = GP 미팅노트와 같은 디자인)
 *
 * 흰 지면 + 옅은 회색 바탕, 섹션 제목은 KB 노랑(#FFBC00) 막대와 웜그레이(#71685D) 밑줄,
 * 소제목·태그·강조 라벨은 블루(#2F5597), 표 머리·제목 띠는 회색(#E7E6E6), 강조 박스는 옅은 노랑(#FFF8E1).
 * 글꼴은 맑은 고딕(없으면 Apple SD Gothic Neo·Noto Sans KR). 모서리는 각지게(문서 느낌).
 * 상승/하락은 국내 관행대로 빨강/파랑.
 * (예전 토큰 이름 yellow*·wood*·gray 는 호환을 위해 그대로 두고 값만 바꿨다.)
 *
 * 이 파일은 app.tsx 보다 먼저 로드되는 일반 스크립트다(index.html 참고).
 * 최상위 const/function 은 전역으로 공유되므로 React 훅은 React.useState 처럼 쓴다.
 */

const KB = {
  yellow: '#FFBC00',      // KB 노랑 — 섹션 막대·선택 표시·막대그래프
  yellowPress: '#C99400', // 노랑 버튼 테두리
  wood: '#FFBC00',
  woodDeep: '#2F5597',    // 흰 글자를 올리는 바탕(번호 원·강조 막대) — 블루
  yellowTint: '#FFF8E1',  // 강조 박스 바탕(미팅노트 focusnote·keybox)
  yellowLine: '#E8C25A',  // 강조 박스 테두리
  yellowText: '#9A7300',  // 노란 박스 위 글자·번호
  gray: '#2F5597',        // 블루 — 기관명·강조 라벨(미팅노트 제목·태그 색)
  blue: '#2F5597',
  warm: '#71685D',        // 웜그레이 — 섹션 밑줄(KB 로고 글자색)
  ink: '#222222',         // 제목·본문
  ink2: '#333333',
  sub: '#555555',         // 보조 텍스트
  mute: '#7F7F7F',        // 캡션·메타
  faint: '#BFBFBF',
  line: '#D9D9D9',        // 구분선
  line2: '#E7E6E6',
  rule: '#888888',        // 표 테두리(미팅노트 표와 같은 선)
  head: '#E7E6E6',        // 표 머리·제목 띠
  cell: '#F5F5F5',        // 표 머리열(태그 칸) 바탕
  band: '#F2F2F2',        // 지면 바깥 바탕·섹션 사이 띠
  bg: '#FFFFFF',          // 지면
  card: '#FFFFFF',
  up: '#D2382F',          // 상승
  down: '#2A62C4',        // 하락
  pos: '#3F7A4E',
  ko: '#2F5597',          // 영문 기사 한글 번역(병기)
};
// 폰트 단축: F(굵기, 크기, 행간) — 미팅노트와 같은 맑은 고딕
const FONT_STACK = "'Malgun Gothic', '맑은 고딕', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Noto Sans CJK KR', -apple-system, sans-serif";
const F = (w, size, lh) => `${w} ${size}px${lh ? '/' + lh : ''} ${FONT_STACK}`;

// 화면 모드(모바일/데스크톱)를 하위 컴포넌트가 알 수 있게
const UICtx = React.createContext({ desktop: false });
const useDesktop = () => React.useContext(UICtx).desktop;

// ─── 아이콘 (24×24 선 아이콘, 이모지·유니코드 기호 대신) ─────────
const ICON_PATHS = {
  home: 'M3.5 10.2 12 3.5l8.5 6.7V19a1.5 1.5 0 0 1-1.5 1.5h-4.5v-6h-5v6H5A1.5 1.5 0 0 1 3.5 19z',
  market: 'M3.5 20.5h17M5.5 16.5l4-5.2 3.6 2.8 5.4-7.1M15.5 7h3v3',
  bank: 'M3 20.5h18M4.5 20.5v-9.5M19.5 20.5v-9.5M2.8 10.2 12 4l9.2 6.2M8.5 20.5v-7M12 20.5v-7M15.5 20.5v-7',
  globe: 'M12 3.2a8.8 8.8 0 1 0 0 17.6 8.8 8.8 0 0 0 0-17.6zM3.4 12h17.2M12 3.2c2.4 2.4 3.6 5.3 3.6 8.8s-1.2 6.4-3.6 8.8M12 3.2C9.6 5.6 8.4 8.5 8.4 12s1.2 6.4 3.6 8.8',
  menu: 'M4 6.5h16M4 12h16M4 17.5h16',
  grid: 'M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z',
  search: 'M10.8 4a6.8 6.8 0 1 0 0 13.6 6.8 6.8 0 0 0 0-13.6zM20 20l-4.3-4.3',
  bookmark: 'M6.5 3.5h11v17l-5.5-3.8-5.5 3.8z',
  share: 'M12 3.5v11M7.5 8 12 3.5 16.5 8M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13',
  back: 'M15 18.5 8.5 12 15 5.5',
  chevron: 'M9.5 5.5 16 12l-6.5 6.5',
  down: 'M5.5 9.5 12 16l6.5-6.5',
  close: 'M6 6l12 12M18 6 6 18',
  refresh: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4v5h-5',
  report: 'M5.5 3.5h13A1.5 1.5 0 0 1 20 5v14a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19V5a1.5 1.5 0 0 1 1.5-1.5zM8 16.5v-3.5M12 16.5V8.5M16 16.5v-6',
  calendar: 'M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5zM4 10h16M8.5 3v4M15.5 3v4',
  book: 'M4.5 5.5A2 2 0 0 1 6.5 3.5h12v14h-12a2 2 0 0 0-2 2zM4.5 19.5a2 2 0 0 0 2 2h12v-4',
  layers: 'M12 3.5 21 8.5l-9 5-9-5zM3 12.5l9 5 9-5M3 16.5l9 5 9-5',
  briefcase: 'M3.5 8.5A1.5 1.5 0 0 1 5 7h14a1.5 1.5 0 0 1 1.5 1.5v10A1.5 1.5 0 0 1 19 20H5a1.5 1.5 0 0 1-1.5-1.5zM8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7M3.5 13h17',
  flag: 'M5.5 21V4M5.5 4.5h11l-2 3.5 2 3.5h-11',
  external: 'M14 4h6v6M20 4l-8.5 8.5M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10',
  info: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 11v5.5M12 7.6v.2',
  clock: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 7.5V12l3 2',
  user: 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4.5 20.5c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5',
  filter: 'M4 5.5h16l-6.2 7.3v5.7l-3.6 1.8v-7.5z',
  check: 'M5 12.5 10 17.5 19.5 7',
  plus: 'M12 5v14M5 12h14',
};
function Ico({ n, size = 22, color = 'currentColor', sw = 1.7, fill = 'none', style }) {
  const d = ICON_PATHS[n];
  if (!d) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color} strokeWidth={sw}
         strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', flexShrink: 0, ...(style || {}) }} aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

// ─── 로고 — KB증권 로고(미팅노트 헤더와 같은 벡터) + GIS ─────────────
function Logo({ size = 18, onClick }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: Math.round(size * 0.5), cursor: onClick ? 'pointer' : 'default', userSelect: 'none' }} aria-label="KB증권 GIS">
      <img src="./icons/kb-logo.svg" alt="KB증권" style={{ height: Math.round(size * 1.25), width: 'auto', display: 'block', flexShrink: 0 }} />
      <span style={{ font: F(700, Math.round(size * 0.9)), color: KB.warm, paddingLeft: Math.round(size * 0.5), borderLeft: `1px solid ${KB.faint}`, lineHeight: 1, letterSpacing: '.02em' }}>GIS</span>
    </div>
  );
}

// ─── 문서 머리 — 미팅노트·월간보고 헤더(좌 KB증권 로고 / 가운데 제목+날짜 / 우 부서) ─────
function DocHeader({ title, date, dept = '글로벌상품영업부', style }) {
  const desktop = useDesktop();
  const bd = `1px solid ${KB.rule}`;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', ...(style || {}) }}>
      <colgroup><col style={{ width: '23%' }} /><col style={{ width: '53%' }} /><col style={{ width: '24%' }} /></colgroup>
      <tbody>
        <tr>
          <td rowSpan={2} style={{ border: bd, height: desktop ? 64 : 52, padding: '0 6px', textAlign: 'center', verticalAlign: 'middle' }}>
            <img src="./icons/kb-logo.svg" alt="KB증권" style={{ width: '92%', maxWidth: 150, height: 'auto', display: 'block', margin: '0 auto' }} />
          </td>
          <td style={{ border: bd, background: KB.head, color: KB.blue, textAlign: 'center', verticalAlign: 'middle', font: F(700, desktop ? 20 : 15.5, 1.25), padding: desktop ? '8px 6px' : '6px 4px', letterSpacing: '-.01em' }}>{title}</td>
          <td rowSpan={2} style={{ border: bd, textAlign: 'center', verticalAlign: 'middle', font: F(500, desktop ? 15 : 12, 1.35), color: KB.ink, padding: '0 4px', wordBreak: 'keep-all' }}>{!desktop && dept === '글로벌상품영업부' ? <>글로벌상품<br />영업부</> : dept}</td>
        </tr>
        <tr>
          <td style={{ border: bd, color: KB.blue, textAlign: 'center', verticalAlign: 'middle', font: F(500, desktop ? 14 : 12), padding: desktop ? '4px 6px' : '3px 4px' }}>{date}</td>
        </tr>
      </tbody>
    </table>
  );
}

// ─── 문서 요소 — 미팅노트의 표·불릿·강조 박스 ───────────────────────
// 그리드 표 칸 스타일: 머리(회색 바탕·굵게·가운데) / 칸(테두리) / 태그 칸(블루 굵게·옅은 회색)
const GRID = {
  table: { width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' },
  th: { border: `1px solid ${KB.rule}`, background: KB.head, font: F(700, 13), color: KB.ink, textAlign: 'center', padding: '6px 8px', whiteSpace: 'nowrap' },
  td: { border: `1px solid ${KB.rule}`, font: F(400, 13.5, 1.5), color: KB.ink2, padding: '7px 9px', verticalAlign: 'middle' },
  tag: { border: `1px solid ${KB.rule}`, background: KB.cell, font: F(700, 13), color: KB.blue, textAlign: 'center', padding: '7px 6px', verticalAlign: 'middle' },
};
// 개조식 불릿 — 1단 ○, 2단 -
function Bullets({ items, sub, style }) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return null;
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: sub ? '0 0 0 2px' : 0, ...(style || {}) }}>
      {list.map((x, i) => (
        <li key={i} style={{ position: 'relative', paddingLeft: sub ? 13 : 17, margin: sub ? '2px 0' : '5px 0', font: F(400, sub ? 13.5 : 14.5, 1.65), color: sub ? KB.ink2 : KB.ink }}>
          <span style={{ position: 'absolute', left: 0, top: 0, font: F(400, sub ? 13.5 : 12.5, sub ? 1.65 : 1.95), color: sub ? KB.ink2 : '#444' }}>{sub ? '-' : '○'}</span>
          {x}
        </li>
      ))}
    </ul>
  );
}
// 강조 박스 — 미팅노트 focusnote(왼쪽 노란 막대 + 옅은 노랑)
function FocusNote({ children, style }) {
  return <div style={{ borderLeft: `4px solid ${KB.yellow}`, background: KB.yellowTint, padding: '10px 14px', font: F(500, 14.5, 1.65), color: KB.ink, ...(style || {}) }}>{children}</div>;
}

// ─── 화면 뼈대 ──────────────────────────────────────────────────
// 상단바: 뒤로가기·제목·오른쪽 액션. 모바일은 안전영역 여백 포함.
function TopBar({ title, sub, onBack, backLabel, right, border = true, big }) {
  return (
    <div style={{ flexShrink: 0, background: KB.bg, borderBottom: border ? `1px solid ${KB.line}` : 'none' }}>
      <div style={{ height: 'env(safe-area-inset-top)' }}></div>
      <div style={{ minHeight: 54, display: 'flex', alignItems: 'center', gap: 6, padding: onBack ? '0 12px 0 6px' : '0 16px 0 20px' }}>
        {onBack && (
          <div onClick={onBack} role="button" aria-label="뒤로" style={{ display: 'flex', alignItems: 'center', gap: 2, cursor: 'pointer', color: KB.ink, padding: '8px 6px' }}>
            <Ico n="back" size={24} sw={2} />
            {backLabel && <span style={{ font: F(600, 14.5), color: KB.ink2 }}>{backLabel}</span>}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          {title && <div style={{ font: big ? F(700, 21) : F(700, 17), color: KB.ink, letterSpacing: '-.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>}
          {sub && <div style={{ font: F(500, 12), color: KB.mute, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>}
        </div>
        {right && <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>{right}</div>}
      </div>
    </div>
  );
}
// 상단바 아이콘 버튼
function IconBtn({ n, onClick, label, active, size = 22 }) {
  return (
    <div onClick={onClick} role="button" aria-label={label} title={label}
         style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: active ? KB.ink : KB.ink2, borderRadius: 4 }}>
      <Ico n={n} size={size} fill={active && n === 'bookmark' ? KB.yellow : 'none'} color={active && n === 'bookmark' ? KB.gray : 'currentColor'} />
    </div>
  );
}

// 탭(밑줄형) — 선택 탭에 KB 노랑 막대
function Tabs({ items, value, onChange, scroll, pad = 20 }) {
  return (
    <div style={{ display: 'flex', gap: scroll ? 20 : 0, padding: `0 ${pad}px`, borderBottom: `1px solid ${KB.line}`, overflowX: scroll ? 'auto' : 'visible', whiteSpace: 'nowrap', background: KB.bg, flexShrink: 0 }}>
      {items.map(([k, label, count]) => {
        const on = value === k;
        return (
          <div key={k} onClick={() => onChange(k)} style={{ flex: scroll ? '0 0 auto' : 1, textAlign: 'center', padding: '12px 2px 11px', cursor: 'pointer', position: 'relative', font: on ? F(700, 14.5) : F(500, 14.5), color: on ? KB.ink : KB.mute }}>
            {label}{count != null && <span style={{ font: F(600, 12), color: on ? KB.gray : KB.faint, marginLeft: 4 }}>{count}</span>}
            {on && <div style={{ position: 'absolute', left: scroll ? 0 : '18%', right: scroll ? 0 : '18%', bottom: -1, height: 3, background: KB.yellow }}></div>}
          </div>
        );
      })}
    </div>
  );
}

// 필터 칩 — 선택: KB 노랑 채움(미팅노트 툴바 '켜짐'과 같은 모양) / 미선택: 테두리
function Chip({ active, onClick, children, count }) {
  return (
    <div onClick={onClick} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4, height: 32, padding: '0 12px', borderRadius: 4, cursor: 'pointer', font: active ? F(700, 13) : F(500, 13), background: active ? KB.yellow : KB.card, color: active ? KB.ink : KB.ink2, border: `1px solid ${active ? KB.yellowPress : KB.faint}`, whiteSpace: 'nowrap' }}>
      {children}{count != null && <span style={{ font: F(600, 11.5), color: active ? '#5C4500' : KB.mute }}>{count}</span>}
    </div>
  );
}

// 작은 라벨. tone: base | yellow | dark | outline | up | down | pos
function Tag({ children, tone = 'base', style }) {
  const T = {
    base: { background: KB.cell, color: KB.sub, boxShadow: `inset 0 0 0 1px ${KB.line2}` },
    yellow: { background: '#FFF3CC', color: '#7A5C00' },          // 미팅노트 강조 표의 태그 칸
    dark: { background: KB.blue, color: '#fff' },
    outline: { background: KB.card, color: KB.sub, boxShadow: `inset 0 0 0 1px ${KB.faint}` },
    up: { background: '#FDECEB', color: KB.up },
    down: { background: '#E9F0FC', color: KB.down },
    pos: { background: '#E7F4EC', color: KB.pos },
  }[tone] || {};
  return <span style={{ display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 7px', borderRadius: 2, font: F(600, 11.5), whiteSpace: 'nowrap', flexShrink: 0, ...T, ...(style || {}) }}>{children}</span>;
}

// 섹션 — 미팅노트의 섹션 제목(왼쪽 KB 노랑 막대 + 웜그레이 밑줄). 모바일은 회색 띠로 나뉜 흰 지면, 데스크톱은 흰 지면 카드.
// no: 번호("1.")를 붙이면 문서처럼 번호 매긴 제목이 된다.
function Section({ title, sub, right, children, first, pad = true, id, no }) {
  const desktop = useDesktop();
  const head = (title || right) && (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: pad ? (desktop ? '18px 20px 12px' : '18px 20px 12px') : '0 0 12px', paddingBottom: 7, borderBottom: `1.5px solid ${KB.warm}` }}>
      <span style={{ width: 4, height: 16, background: KB.yellow, flexShrink: 0 }}></span>
      <div style={{ font: F(700, 16), color: KB.ink, letterSpacing: '-.01em', whiteSpace: 'nowrap', flexShrink: 0 }}>{no != null && <span style={{ marginRight: 5 }}>{no}.</span>}{title}</div>
      {sub && <div style={{ font: F(500, 12), color: KB.mute, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>}
      {right && <div style={{ marginLeft: 'auto', flexShrink: 0, whiteSpace: 'nowrap' }}>{right}</div>}
    </div>
  );
  if (desktop) {
    return (
      <div id={id} style={{ background: KB.bg, border: `1px solid ${KB.line}`, boxShadow: '0 1px 4px rgba(0,0,0,.06)', marginTop: first ? 0 : 16, overflow: 'hidden' }}>
        {head}
        <div style={{ padding: pad ? '0 20px 18px' : 0 }}>{children}</div>
      </div>
    );
  }
  return (
    <div id={id} style={{ background: KB.bg, borderTop: first ? 'none' : `8px solid ${KB.band}` }}>
      {head}
      <div style={{ padding: pad ? '0 20px 20px' : 0 }}>{children}</div>
    </div>
  );
}
// 소제목 — 미팅노트 h3(블루 굵게)
function SubHead({ children, style }) {
  return <div style={{ font: F(700, 14.5), color: KB.blue, margin: '14px 0 6px', ...(style || {}) }}>{children}</div>;
}
// 섹션 머리 오른쪽의 '더보기' 링크
function More({ onClick, children = '전체보기' }) {
  return <span onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 1, font: F(500, 13), color: KB.sub, cursor: 'pointer' }}>{children}<Ico n="chevron" size={15} sw={2} /></span>;
}

// 목록 한 줄 (구분선 포함)
function ListRow({ children, onClick, first, pad = '14px 0', chevron, style }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: pad, borderTop: first ? 'none' : `1px solid ${KB.line2}`, cursor: onClick ? 'pointer' : 'default', ...(style || {}) }}>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      {chevron && <span style={{ color: KB.faint }}><Ico n="chevron" size={18} sw={2} /></span>}
    </div>
  );
}

// 핵심 수치 타일
function Metric({ value, label, note, accent, onClick }) {
  return (
    <div onClick={onClick} style={{ padding: '12px 14px 11px', background: accent ? KB.yellowTint : KB.cell, border: `1px solid ${accent ? KB.yellowLine : KB.line2}`, cursor: onClick ? 'pointer' : 'default', minWidth: 0 }}>
      <div style={{ font: F(600, 12), color: accent ? KB.yellowText : KB.sub }}>{label}</div>
      <div style={{ font: F(700, 20), color: KB.ink, marginTop: 5, letterSpacing: '-.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
      {note && <div style={{ font: F(500, 11.5), color: KB.mute, marginTop: 3, lineHeight: 1.45 }}>{note}</div>}
    </div>
  );
}

// 빈 상태
function Empty({ title, desc, icon = 'info', compact }) {
  return (
    <div style={{ padding: compact ? '22px 10px' : '64px 24px', textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'center', color: KB.faint }}><Ico n={icon} size={compact ? 26 : 34} sw={1.5} /></div>
      {title && <div style={{ font: F(600, 14.5), color: KB.ink2, marginTop: 12 }}>{title}</div>}
      {desc && <div style={{ font: F(400, 13, 1.6), color: KB.mute, marginTop: 6 }}>{desc}</div>}
    </div>
  );
}

// 버튼 — primary(KB 노랑·검은 글자)·secondary(테두리)·dark(블루)
function Btn({ children, onClick, kind = 'primary', href, full, style, icon }) {
  const S = {
    primary: { background: KB.yellow, color: KB.ink, border: `1px solid ${KB.yellowPress}` },
    secondary: { background: KB.bg, color: KB.ink, border: `1px solid ${KB.rule}` },
    dark: { background: KB.blue, color: '#fff', border: `1px solid ${KB.blue}` },
  }[kind];
  const st = { height: 48, padding: '0 18px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, font: F(700, 15), cursor: 'pointer', textDecoration: 'none', boxSizing: 'border-box', flex: full ? 1 : undefined, width: full ? '100%' : undefined, ...S, ...(style || {}) };
  const inner = <>{icon && <Ico n={icon} size={18} sw={2} />}{children}</>;
  return href
    ? <a href={href} target="_blank" rel="noopener noreferrer" style={st}>{inner}</a>
    : <div onClick={onClick} role="button" style={st}>{inner}</div>;
}

// 상승/하락 표시 (국내 관행: 상승 빨강 ▲ / 하락 파랑 ▼)
function Delta({ v, digits = 2, suffix = '%', size = 13 }) {
  if (v == null || !isFinite(v)) return <span style={{ font: F(600, size), color: KB.mute }}>–</span>;
  const up = v > 0, dn = v < 0;
  return (
    <span style={{ font: F(600, size), color: up ? KB.up : dn ? KB.down : KB.sub, whiteSpace: 'nowrap' }}>
      {up ? '▲' : dn ? '▼' : ''} {Math.abs(v).toFixed(digits)}{suffix}
    </span>
  );
}

// 하단 시트(모바일) / 가운데 대화상자(데스크톱)
function Sheet({ open, onClose, title, children, wide }) {
  const desktop = useDesktop();
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15,16,18,.45)', zIndex: 50, display: 'flex', alignItems: desktop ? 'center' : 'flex-end', justifyContent: 'center', padding: desktop ? 24 : 0 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: desktop ? (wide ? 880 : 560) : 'none', maxHeight: desktop ? '88vh' : '86vh', display: 'flex', flexDirection: 'column', background: KB.bg, borderRadius: desktop ? 4 : '8px 8px 0 0', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 12px 12px 20px', borderBottom: `1px solid ${KB.line}`, flexShrink: 0 }}>
          <div style={{ flex: 1, font: F(700, 16.5), color: KB.ink }}>{title}</div>
          <IconBtn n="close" onClick={onClose} label="닫기" />
        </div>
        <div style={{ overflowY: 'auto', padding: '16px 20px calc(20px + env(safe-area-inset-bottom))' }}>{children}</div>
      </div>
    </div>
  );
}
