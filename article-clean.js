/*
 * KB GIS — 기사 본문 정제 (수집기·앱 공용)
 *
 * 뉴스 페이지에서 떼어 낸 문단 목록에서 기사와 무관한 텍스트를 걷어낸다.
 *   - 광고·구독 유도·공유 버튼 문구
 *   - 관련기사·많이 본 뉴스 등 추천 위젯 (이런 표지가 나오면 그 뒤는 통째로 버림)
 *   - 기자 바이라인·이메일·사진 설명·저작권/등록정보 꼬리
 *   - 포털 TTS 안내·언어 선택 목록·메뉴 뭉치·다른 기사 헤드라인 나열
 *   - 영문 매체 꼬리(Reporting by… / Sign up… 등)
 *
 * 브라우저에서는 <script> 로 불러 window.ArticleClean 으로, 수집기(Node)에서는
 * require() 로 같은 코드를 쓴다 — 거르는 기준이 두 곳에서 어긋나지 않게 하기 위함.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ArticleClean = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ── 여기서부터 끝까지 버린다: 본문 뒤에 붙는 위젯·꼬리의 시작 표지 ──
  const END_MARKERS = [
    /^(?:[■□▶▷☞※\-·\s]*)(?:관련\s*기사|관련뉴스|관련 뉴스|추천\s*기사|많이\s*본\s*(?:뉴스|기사)|인기\s*기사|함께\s*(?:본|보면\s*좋은)\s*기사|핫\s*클릭|이\s*시각\s*(?:주요|인기|추천)|화제의\s*뉴스|오늘의\s*주요\s*뉴스|최신\s*기사|주요\s*뉴스)\s*[:>]?\s*$/,
    /^(?:Related(?:\s+(?:articles|stories|coverage|news))?|Read more|More from|Most read|Popular|Trending|Recommended|You may also like|Also read|See also)\s*:?\s*$/i,
    /^(?:ⓒ|©)/,
    /(?:저작권자|Copyright)\s*[ⓒ©(]/i,
    // 보도자료 꼬리: "About Blackstone", "Forward-Looking Statements", "Media Contact" 이후는 회사 소개·연락처
    /^(?:About\s+[A-Z][\w&.,'’ ()-]{1,60}|Forward[- ]Looking Statements?|Cautionary (?:Note|Statement)[\w ]{0,40}|(?:Media|Press|Investor)\s+(?:Contacts?|Relations|Inquiries)|Contacts?|Disclaimer\b.*|More news and analyses on .*)\s*:?\s*$/i,
  ];

  // ── 단락 단위로 버리는 패턴 ──
  const DROP = [
    // 저작권·재배포·AI 학습 금지 고지
    /무단\s*(?:전재|복제|배포|사용)|재배포\s*금지|AI\s*학습.*(?:금지|이용)|all rights reserved/i,
    // 신문사 등록정보·발행인 꼬리
    /(?:등록번호|사업자등록번호|등록일자|발행일자|발행인|편집인|청소년\s*보호\s*책임자|고충처리인|대표전화)\s*[:：]/,
    // 포털 TTS·글자크기 안내
    /음성으로\s*듣기|음성\s*재생|본문\s*듣기|글자\s*크기\s*(?:설정|조절)|글씨\s*크기|텍스트\s*음성\s*변환|데이터\s*요금이\s*발생/,
    // 공유·스크랩·댓글 UI 문구
    /^(?:공유하기|스크랩|인쇄|좋아요|댓글|기사\s*저장|URL\s*복사|페이스북|트위터|카카오(?:톡|스토리)?|네이버\s*블로그)(?:\s*[\/·|]\s*\S+)*\s*$/,
    // 영문 매체 꼬리
    /^(?:Reporting by|Editing by|Additional reporting|Writing by|Compiled by|Our Standards|Sign up|Subscribe|Get the latest|Register (?:now|for)|Click here|For more (?:news|information)|This article (?:was|first)|Want to read more|Thomson Reuters|Bloomberg L\.P\.)/i,
    // 광고 표기만 있는 단락
    /^(?:AD|광고|Advertisement|ADVERTISEMENT|Sponsored(?: content)?|스폰서)\s*$/i,
    // 포털·언론사 안내문 (자동요약 안내, 윤리강령, 언론사 이동, 검색 선호 출처, 투자 책임 고지, 댓글 정책, 알림 설정)
    /자동\s*요약한\s*결과|요약\s*보기\s*자동\s*요약|윤리\s*강령|독자\s*편집\s*위원회|정정[‧·ㆍ]?\s*반론\s*보도|해당\s*언론사로\s*이동|에서\s*직접\s*확인하세요|선호\s*출처로?\s*추가|기사를\s*더\s*자주\s*볼\s*수|투자\s*판단의\s*참고용|투자\s*손실에\s*대한\s*책임|건전한\s*토론\s*문화|댓글은\s*표시가\s*제한|알림\s*설정하고|엄선한\s*주요\s*뉴스|글자\s*크기로\s*변경|파란\s*원을\s*좌우로/,
    // 영문 매체 안내문
    /preferred source on Google|MarketBeat|narrative science|instant news alert|translated from its original|^Like this article\?|editorial guidelines|ethics policy|reset your password|username or email|Already have an account|^(?:Log ?In|Sign ?In|Sign ?Up)\b.{0,30}$|^Powered by\b.{0,60}$/i,
    // 표 형태로 흩어진 종목 코드 줄 ("en | US0925… | BLACKSTONE INC. | …")
    /^[^|]{0,40}(?:\s\|\s[^|]{1,40}){3,}$/,
  ];

  // 짧은 단락에서만 버리는 패턴 (긴 본문 문장에 우연히 들어간 경우는 살린다)
  const DROP_IF_SHORT = [
    // '구독' 한 단어만으로는 판정하지 않는다(본문에 '구독형 펀드' 같은 표현이 있음)
    [/구독\s*(?:하기|신청|버튼|하세요|해\s*주세요)|구독자\s*전용|로그인|회원\s*가입|앱\s*(?:다운|설치)|뉴스레터|카카오톡\s*채널|네이버에서\s*.{0,20}구독|(?:제보|문의)\s*(?:하기|:)|기사\s*제보/, 110],
    [/^(?:사진|그래픽|자료|이미지|출처|영상|편집)\s*[=:]/, 120],
    [/(?:\/|\s|\()(?:사진|그래픽|이미지)\s*=\s*\S+(?:\s*(?:제공|캡처))?\)?\s*$/, 120],
    [/(?:제공|캡처|뉴스1|뉴시스|연합뉴스)\s*\)?\s*$/, 45],
    [/^[가-힣]{2,4}\s?(?:선임|수석|객원)?\s?(?:기자|특파원|통신원|앵커)\b/, 60],
    [/[\w.+-]+@[\w-]+\.[\w.-]+/, 80],
    [/^[▶▷☞→■□◆◇※«»‹›]/, 160],
    [/(?:좋아요|공유|스크랩|추천)\s*\d*\s*$/, 30],
    // 사진 설명(▲ 로 시작하는 국내 매체 캡션)
    [/^[▲△]\s*\S/, 220],
    // 영문 바이라인·게시 시각: "By Amit Chowdhry Sep 21, 2026", "Updated On Sep 23, 2026 at 05:05 PM IST"
    [/^By\s+[A-Z][\w.'’-]+(?:\s+[A-Z][\w.'’-]+){0,3}\b/, 80],
    [/^(?:Updated|Published|Posted|Last updated|First published)(?:\s+on)?\s*:?\s+\w/i, 80],
    [/^(?:Photo|Image|Credit|Source|Photograph)\s*:/i, 160],
    [/\b\d{1,2}:\d{2}\s*(?:AM|PM)?\s*\(?(?:UTC|GMT|IST|EST|EDT|KST|CET)\b/i, 90],
    // 국내 매체 게시 시각·기자 소개
    [/(?:발행일|입력|수정|승인|등록|송고)\s*:?\s*\d{4}[.\-/]\s?\d{1,2}[.\-/]\s?\d{1,2}/, 70],
    [/(?:취재|담당)(?:하고\s*있습니다|합니다)\.|보도하겠습니다\.?\s*$/, 240],
    [/This account is not managed or monitored|will not receive a response/i, 600],
    [/데이터\s*레터|뉴스레터|매일\s*아침\s*\d+\s*시/, 160],
    [/^(?:Read (?:Earlier|More|Next|Also)|Also Read|Recommended|Related)\s*:/i, 200],
    [/^(?:Price as of|Market capitali[sz]ation|Sector\s*\/\s*Industry|Index membership|Next earnings date|52[- ]week|P\/E ratio|Dividend yield)\b/i, 120],
    [/\d+\s*분\s*(?:걸림|읽기)|\d+\s*min(?:ute)?s?\s*read|댓글\s*남기기/i, 60],
  ];

  // 첫 단락 앞의 바이라인 접두어: "(서울=연합뉴스) 홍길동 기자 =", "[이데일리 김OO 기자]", "[더벨]"
  const BYLINE_PREFIXES = [
    /^\s*[\[(【〔]\s*[^\])】〕]{0,30}?(?:=|기자|특파원|통신원)[^\])】〕]{0,30}[\])】〕]\s*/,
    /^\s*[가-힣]{2,4}\s?(?:선임|수석|객원)?\s?기자\s*=\s*/,
    /^\s*[\[【]\s*(?:더벨|딜사이트|인베스트조선|마켓인사이트|시그널|WEEKLY|단독|속보|종합|인터뷰)\s*[\]】]\s*/i,
    /^\s*[A-Z][A-Za-z .]{1,30},\s*[A-Z][a-z]{2,9}\.?\s*\d{1,2}\s*\((?:Reuters|Bloomberg|AP|AFP)\)\s*[-–—]\s*/,
    /^\s*[A-Z ]{3,30}\s*\((?:Reuters|Bloomberg|AP|AFP)\)\s*[-–—]\s*/,
  ];

  // 단락 안의 자잘한 꼬리 표기 제거 (사진 캡션 괄호, ▶ 링크 꼬리 등)
  function scrubInline(s) {
    return s
      .replace(/\s*[\[(]\s*(?:사진|그래픽|자료|이미지|영상)\s*=\s*[^\])]{1,40}[\])]\s*/g, ' ')
      .replace(/\s*\/\s*(?:사진|그래픽)\s*=\s*\S+(?:\s*(?:제공|캡처))?\s*$/g, '')
      .replace(/\s*[▶☞]\s*[^.!?。]{0,80}$/g, '')
      .replace(/[ \t ]{2,}/g, ' ')
      .trim();
  }

  const LANG_TOKEN = /English|日本語|简体中文|繁體中文|Nederlands|Deutsch|Русский|Español|Italiano|Türkçe|tiếng\s*Việt|bahasa|ภาษาไทย|Français|Português/g;
  const isLangList = (s) => ((String(s).match(LANG_TOKEN) || []).length >= 3);
  // 메뉴 뭉치 — 공백이 거의 없거나 문장 종결이 전혀 없는 긴 덩어리
  function isNavBlob(t) {
    if (t.length < 120) return false;
    const spaces = (t.match(/\s/g) || []).length;
    const enders = (t.match(/다\.|요\.|[.!?]/g) || []).length;
    return spaces / t.length < 0.06 || (enders === 0 && t.length > 200);
  }
  // 다른 기사 헤드라인 나열 — 말줄임이 여럿인데 문장 종결이 없음
  function isHeadlineRun(t) {
    const ell = (t.match(/…|\.\.\./g) || []).length;
    return ell >= 2 && !/(?:다|요)\.|[.!?]\s/.test(t.replace(/\.\.\./g, ''));
  }
  // 문장형 단락인지(종결 표현 존재) — 짧은 조각이 문장이 아니면 위젯 잔재로 본다
  function isSentencey(t) {
    if (/(?:다|요|음|함|임)\.?["'”’)]?\s*$|[.!?。]["'”’)]?\s*$/.test(t)) return true;
    return t.length > 160 && /(?:다|요)\.|[.!?]\s/.test(t);
  }
  const norm = (s) => String(s).replace(/[\s"'“”‘’·…\-–—.,:;!?()[\]]/g, '').toLowerCase();

  /**
   * 문단 배열(또는 개행으로 나뉜 문자열)을 정제한다.
   * @returns {{ paragraphs: string[], paywalled: boolean }}
   */
  function clean(input, opts) {
    const title = (opts && opts.title) || '';
    let paras = Array.isArray(input) ? input.slice() : String(input || '').split(/\n+/);
    // 말줄임으로 잘린 요약(og:description) 뒤에 다른 글이 붙어 온 경우(“…관련 투자 기..  한국 남자 농구…”) 그 자리에서 나눈다
    paras = paras.flatMap((p) => String(p || '').split(/(?<=[가-힣A-Za-z0-9]\.\.|…)[ \t ]{2,}(?=\S)/));
    paras = paras.map((p) => String(p || '').replace(/\r/g, '').replace(/[ \t ]+/g, ' ').trim()).filter(Boolean);
    // 잘린 요약 단락(끝이 '..'·'…')은 뒤에 본문이 이어지면 버린다 — 본문과 중복이거나 다른 기사로 넘어가는 경계다
    paras = paras.filter((p, i) => !(i < paras.length - 1 && /(?:[가-힣A-Za-z0-9]\.\.|…)$/.test(p)));

    const out = [];
    const seen = [];
    let paywalled = false;
    for (let i = 0; i < paras.length; i++) {
      let p = paras[i];
      // 본문 뒤 위젯·꼬리 시작 표지 → 이후 전부 버림(본문이 어느 정도 모였을 때만)
      if (END_MARKERS.some((re) => re.test(p)) && out.join('').length > 120) break;
      if (/유료\s*(?:회원|기사|콘텐츠|서비스)|구독자\s*전용|로그인\s*후\s*(?:이용|열람)|전문은\s*.{0,20}(?:유료|구독|로그인)|(?:PLUS|프리미엄)\s*(?:회원|기사)/.test(p) && p.length < 200) { paywalled = true; continue; }
      if (DROP.some((re) => re.test(p))) continue;
      if (DROP_IF_SHORT.some(([re, max]) => p.length <= max && re.test(p))) continue;
      if (isLangList(p) || isNavBlob(p) || isHeadlineRun(p)) continue;
      // 인코딩이 깨진 단락(대체 문자 다수) — 다시 받아야 하므로 버린다
      if ((p.match(/\uFFFD/g) || []).length > 3) continue;
      // 첫 본문 단락의 바이라인 접두어 제거
      if (!out.length) for (const re of BYLINE_PREFIXES) p = p.replace(re, '');
      p = scrubInline(p);
      if (p.length < 2) continue;
      // 너무 짧은데 문장도 아닌 조각(버튼·메뉴 잔재) 제거
      if (p.length < 25 && !isSentencey(p)) continue;
      // 제목을 그대로 반복한 첫 단락 제거
      if (!out.length && title && norm(p).startsWith(norm(title).slice(0, 30)) && p.length < title.length + 20) continue;
      // 앞 단락과 사실상 같은 반복 단락(포털이 리드를 재삽입) 제거. 앞쪽이 잘린 리드
      // (og:description)이고 뒤쪽이 온전한 문단이면 더 긴 쪽을 남긴다.
      const full = norm(p);
      const head = full.slice(0, 40);
      const j = head ? seen.findIndex((x) => x.includes(head) || full.startsWith(x.slice(0, 40))) : -1;
      if (j >= 0) {
        if (p.length > out[j].length) { out[j] = p; seen[j] = full.slice(0, 400); }
        continue;
      }
      seen.push(full.slice(0, 400));
      out.push(p);
    }
    return { paragraphs: dropHeadlineRuns(out), paywalled };
  }

  // 문장이 아닌 짧은 줄이 3개 이상 연달아 나오면 다른 기사 제목 목록·인물 명단 같은
  // 위젯 잔재로 본다(본문 소제목은 사이사이 문단이 있어 연달아 나오지 않는다).
  // '-', '•' 로 시작하는 목록은 본문 요약 목록일 수 있어 남긴다.
  function dropHeadlineRuns(list) {
    const isShortLine = (p) => p.length <= 100 && !isSentencey(p) && !/^[-•·‐]/.test(p);
    const keep = list.map(() => true);
    for (let i = 0; i < list.length;) {
      if (!isShortLine(list[i])) { i++; continue; }
      let j = i;
      while (j < list.length && isShortLine(list[j])) j++;
      if (j - i >= 3) for (let k = i; k < j; k++) keep[k] = false;
      i = j;
    }
    return list.filter((_, i) => keep[i]);
  }

  /** 문자열 본문을 정제한 뒤 '\n\n' 으로 이어 돌려준다. */
  function cleanText(text, opts) {
    return clean(String(text || '').split(/\n+/), opts).paragraphs.join('\n\n');
  }

  /**
   * Readability 가 돌려준 본문 HTML 조각에서 블록 단위 문단을 뽑는다.
   * (DOM 은 호출하는 쪽이 넘긴다 — 브라우저 DOMParser 또는 linkedom)
   */
  function paragraphsFromNode(root) {
    const blocks = [];
    const BLOCK = /^(P|H2|H3|H4|LI|BLOCKQUOTE|PRE|FIGCAPTION|TD)$/;
    const walk = (el) => {
      for (const c of Array.from(el.childNodes || [])) {
        if (c.nodeType !== 1) continue;
        const tag = String(c.tagName || '').toUpperCase();
        if (tag === 'FIGCAPTION' || tag === 'FIGURE' || tag === 'SCRIPT' || tag === 'STYLE' || tag === 'ASIDE' || tag === 'NAV') continue;
        if (BLOCK.test(tag)) {
          // <br> 로만 나뉜 긴 단락은 줄 단위로 쪼갠다
          const html = String(c.innerHTML || '');
          if (/<br\s*\/?>/i.test(html)) {
            html.split(/<br\s*\/?>/i).forEach((part) => {
              const t = part.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
              if (t) blocks.push(t);
            });
          } else {
            const t = String(c.textContent || '').replace(/\s+/g, ' ').trim();
            if (t) blocks.push(t);
          }
        } else {
          walk(c);
        }
      }
    };
    walk(root);
    return blocks;
  }

  // ── 제목-본문 일치 검사 ──
  // 프록시·리디렉트 문제로 다른 기사(예: 국민연금 기사 자리에 북한 DMZ 기사)가 본문으로 들어오는 것을
  // 막는다. 제목의 핵심 단어(국문 2자 이상 어간, 영문 3자 이상, 숫자)가 본문 앞부분에 충분히 나와야 한다.
  const STOP_KO = /^(?:관련|기자|뉴스|단독|종합|속보|오늘|내년|올해|지난|이번|위해|대한|통해|위한|것으로|있다|했다|한다|밝혔다|전망|확대|추진|검토|규모|최대|최고|사상|첫|새|더)$/;
  const STOP_EN = new Set('the and for with from into over after amid about than that this its their his her new has have will are was were been more most first says said report reports update updated exclusive news how why what who inc ltd llc plc group'.split(' '));
  function titleTokens(title) {
    const t = String(title || '').replace(/\[[^\]]{0,20}\]|【[^】]{0,20}】/g, ' ');
    const out = new Set();
    for (const w of t.match(/[가-힣]{2,}/g) || []) {
      const stem = w.replace(/(?:으로부터|로부터|에서는|에게서|으로|에서|에게|까지|부터|이다|이며|하고|하며|했다|한다|은|는|이|가|을|를|의|에|로|와|과|도|만|서)$/, '');
      if (stem.length >= 2 && !STOP_KO.test(stem)) out.add(stem.slice(0, 4));
    }
    for (const w of t.match(/[A-Za-z][A-Za-z0-9&'’-]{2,}/g) || []) {
      const lw = w.toLowerCase().replace(/['’]s$/, '');
      if (!STOP_EN.has(lw)) out.add(lw);
    }
    for (const w of t.match(/\d[\d.,]*/g) || []) if (w.replace(/\D/g, '').length >= 2) out.add(w.replace(/[.,]$/, ''));
    return [...out];
  }
  // ── 해외 기관·인명은 영문 원어로 ─────────────────────────────
  // 국내 언론·번역문이 한글로 음역한 해외 운용사·기관·인물 이름을 원래 영문 표기로 되돌린다.
  // (한국 기관·한국인 이름은 그대로.) 긴 이름을 먼저 둔다. 오탐이 없도록 금융 맥락에서
  // 사실상 한 가지 뜻으로만 쓰이는 표기만 넣었다.
  const EN_NAMES = [
    // 인물
    [/스티븐\s?슈워?츠먼/g, 'Stephen Schwarzman'], [/슈워?츠먼/g, 'Schwarzman'], [/존\s?그레이(?=\s|[은는이가을를의와과도,·]|$)/g, 'Jon Gray'],
    [/래리\s?핑크/g, 'Larry Fink'], [/헨리\s?크래비스/g, 'Henry Kravis'], [/마크\s?로완/g, 'Marc Rowan'], [/브루스\s?플랫/g, 'Bruce Flatt'],
    [/데이비드\s?루벤스타인/g, 'David Rubenstein'], [/조(?:셉)?\s?바라타/g, 'Joe Baratta'], [/바라타(?=\s|[은는이가을를의와과도,·]|$)/g, 'Baratta'],
    [/제롬\s?파월/g, 'Jerome Powell'], [/파월(?=\s?(?:의장|연준|Fed)|[은는이가을를의와과도,·]|\s|$)/g, 'Powell'],
    [/도널드\s?트럼프/g, 'Donald Trump'], [/트럼프/g, 'Trump'], [/스콧\s?베센트/g, 'Scott Bessent'], [/베센트/g, 'Bessent'],
    [/워런\s?버핏/g, 'Warren Buffett'], [/일론\s?머스크/g, 'Elon Musk'], [/젠슨\s?황/g, 'Jensen Huang'], [/칼\s?아이칸/g, 'Carl Icahn'],
    [/일함\s?알리예프/g, 'Ilham Aliyev'],
    // 운용사·기관
    [/블랙스톤/g, 'Blackstone'], [/블랙록/g, 'BlackRock'], [/골드만\s?삭스/g, 'Goldman Sachs'], [/모건\s?스탠리/g, 'Morgan Stanley'],
    [/(?:JP|제이피)\s?모[건간]\s?체이스/g, 'JPMorgan Chase'], [/(?:JP|제이피)\s?모[건간]/g, 'JPMorgan'],
    [/아폴로\s?글로벌(?:\s?매니지먼트)?/g, 'Apollo Global Management'], [/아폴로/g, 'Apollo'], [/칼라일(?:\s?그룹)?/g, 'Carlyle'],
    [/브룩필드\s?(?:자산운용|에셋\s?매니지먼트)/g, 'Brookfield Asset Management'], [/브룩필드/g, 'Brookfield'],
    [/베인\s?캐피[탈털]\s?벤처스/g, 'Bain Capital Ventures'], [/베인\s?캐피[탈털]/g, 'Bain Capital'], [/어드벤트\s?인터내셔널/g, 'Advent International'],
    [/퍼미라/g, 'Permira'], [/워버그\s?핀커스/g, 'Warburg Pincus'], [/실버\s?레이크/g, 'Silver Lake'], [/토마\s?브라보/g, 'Thoma Bravo'],
    [/제너럴\s?애틀랜틱/g, 'General Atlantic'], [/헬먼\s?(?:앤드?|&)\s?프리드먼/g, 'Hellman & Friedman'], [/오크트리(?:\s?캐피[탈털])?/g, 'Oaktree'],
    [/식스\s?스트리트/g, 'Sixth Street'], [/블루\s?아울/g, 'Blue Owl'], [/골럽\s?캐피[탈털]/g, 'Golub Capital'], [/핌코/g, 'PIMCO'],
    [/스톤피크/g, 'Stonepeak'], [/디지털\s?브리지/g, 'DigitalBridge'], [/맥쿼리\s?자산운용/g, 'Macquarie Asset Management'], [/맥쿼리/g, 'Macquarie'],
    [/스타우드\s?캐피[탈털]/g, 'Starwood Capital'], [/누빈/g, 'Nuveen'], [/아르?디안/g, 'Ardian'], [/(?<![가-힣A-Za-z])파트너스\s?그룹/g, 'Partners Group'],
    [/해밀턴\s?레인/g, 'Hamilton Lane'], [/스텝스톤/g, 'StepStone'], [/하버베스트/g, 'HarbourVest'], [/판테온/g, 'Pantheon'],
    [/렉싱턴\s?파트너스/g, 'Lexington Partners'], [/콜러\s?캐피[탈털]/g, 'Coller Capital'], [/(?:뉴|노이)버거\s?버먼/g, 'Neuberger Berman'],
    [/론스타/g, 'Lone Star'], [/서버러스/g, 'Cerberus'], [/포트리스/g, 'Fortress'], [/티시먼\s?스파이어/g, 'Tishman Speyer'],
    [/아레스\s?매니지먼트/g, 'Ares Management'], [/(?<![가-힣])아레스(?=\s|[은는이가을를의와과도,·]|$)/g, 'Ares'], [/아팩스|에이펙스\s?파트너스/g, 'Apax'], [/신벤/g, 'Cinven'],
    [/인베스코/g, 'Invesco'], [/피델리티/g, 'Fidelity'], [/뱅가드/g, 'Vanguard'], [/알리안츠/g, 'Allianz'], [/슈로더/g, 'Schroders'],
    [/노무라/g, 'Nomura'], [/소프트뱅크/g, 'SoftBank'], [/캘퍼스/g, 'CalPERS'], [/캘스타스/g, 'CalSTRS'], [/테마섹/g, 'Temasek'], [/무바달라/g, 'Mubadala'],
    [/싱가포르투자청/g, 'GIC'], [/아부다비투자청/g, 'ADIA'], [/캐나다연금투자위원회|CPP\s?인베스트먼츠?/g, 'CPP Investments'],
    [/온타리오\s?교원연금/g, "Ontario Teachers'"], [/세쿼이아(?:\s?캐피[탈털])?/g, 'Sequoia'], [/앤드리슨\s?호로위츠/g, 'Andreessen Horowitz'],
    [/뱅크\s?오브\s?아메리카/g, 'Bank of America'], [/도이(?:치|체)\s?(?:뱅크|방크)/g, 'Deutsche Bank'], [/바클레이즈/g, 'Barclays'],
    [/BNP\s?파리바/g, 'BNP Paribas'], [/미즈호/g, 'Mizuho'], [/엔비디아/g, 'Nvidia'], [/마이크로소프트/g, 'Microsoft'],
    [/클리프워터/g, 'Cliffwater'], [/액티스/g, 'Actis'], [/콕스\s?캐피[털탈]/g, 'Cox Capital'], [/사바\s?캐피[털탈]/g, 'Saba Capital'], [/온도\s?파이낸스/g, 'Ondo Finance'],
    [/HPS\s?코퍼레이트\s?렌딩\s?펀드/g, 'HPS Corporate Lending Fund'], [/릴라이언스\s?월드와이드/g, 'Reliance Worldwide'], [/오스탈/g, 'Austal'], [/메리어트/g, 'Marriott'], [/쉐라톤/g, 'Sheraton'],
    [/오라클/g, 'Oracle'], [/구글/g, 'Google'], [/아마존/g, 'Amazon'], [/오픈\s?AI/g, 'OpenAI'], [/존슨\s?(?:앤드?|&)\s?존슨/g, 'Johnson & Johnson'], [/나스닥/g, 'Nasdaq'],
    [/블룸버그/g, 'Bloomberg'], [/로이터/g, 'Reuters'], [/파이낸셜\s?타임스/g, 'Financial Times'], [/월스트리트저널/g, 'Wall Street Journal'],
  ];
  // 영문으로 바꾼 이름 바로 뒤에 조사가 아닌 한글 단어가 붙으면 띄어 쓴다(예: Macquarie자산운용 → Macquarie 자산운용)
  const PARTICLE = /^(?:으로|에서|에게|까지|부터|께서|처럼|보다|이나|이랑|라고|은|는|이|가|을|를|의|와|과|도|에|로|만|나|랑|측)/;
  function enNames(s) {
    if (!s || !/[가-힣]/.test(s)) return s;
    let t = String(s);
    for (const [re, en] of EN_NAMES) {
      re.lastIndex = 0;
      if (!re.test(t)) continue;
      re.lastIndex = 0;
      t = t.replace(re, (m, ...args) => {
        const str = args[args.length - 1], off = args[args.length - 2];
        const rest = str.slice(off + m.length);
        return /^[가-힣]/.test(rest) && !PARTICLE.test(rest) ? en + ' ' : en;
      });
    }
    return t;
  }

  function matchesTitle(title, text) {
    title = enNames(title); text = enNames(String(text || '').slice(0, 3000));
    const toks = titleTokens(title);
    if (toks.length < 2) return true;                         // 판단할 단서가 부족하면 통과
    const body = String(text || '').slice(0, 3000).toLowerCase();
    let hits = 0;
    for (const k of toks) if (body.includes(k.toLowerCase())) hits++;
    // 짧은 리드(부제·요약): 제목 핵심어가 하나라도 있으면 통과. 하나도 없으면 매체 소개문 등 엉뚱한 글이다(“…프리미엄 뉴스를 제공합니다”)
    if (body.length < 400) return hits >= 1 || toks.length < 3;
    const subjectHit = body.includes(toks[0].toLowerCase());   // 제목 첫 단어(대개 주체 기관)
    return hits >= 3 || hits / toks.length >= 0.34 || (hits >= 2 && subjectHit);
  }

  return { clean, cleanText, paragraphsFromNode, isSentencey, matchesTitle, titleTokens, enNames };
});
