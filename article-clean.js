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
    paras = paras.map((p) => String(p || '').replace(/\r/g, '').replace(/[ \t ]+/g, ' ').trim()).filter(Boolean);

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

  return { clean, cleanText, paragraphsFromNode, isSentencey };
});
