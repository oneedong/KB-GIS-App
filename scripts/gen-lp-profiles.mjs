/*
 * KB GIS — 국내 LP 프로필(lp-profiles.json) 생성기
 *
 * institutions.json 의 전체 118개 기관에 대해 placement agent 관점의 프로필을
 * 만든다. 주요 LP 는 손으로 검증한 상세 프로필(CURATED)을, 그 외 기관은 업권
 * 유형 기준의 일반 프로필(TYPE_TEMPLATE)을 부여한다. 영문명은 collect-news.mjs
 * 분류 사전의 정규식에서 자동 추출한다. 각 프로필에는 갱신일(updatedAt)과 정보
 * 기준(asOf)을 표기한다.
 *
 *   node scripts/gen-lp-profiles.mjs
 *
 * 프로필 내용을 바꿨을 때만 다시 실행해 updatedAt 을 갱신한다(매일 자동 실행 X).
 */
import { readFile, writeFile } from 'fs/promises';

// 프로필을 손봤을 때 이 날짜를 갱신한다. (KST 기준 표기)
const UPDATED = '2026.06.30';

// ── 영문명 자동 추출 (collect-news.mjs 사전 정규식에서) ──────────
const src = await readFile(new URL('./collect-news.mjs', import.meta.url), 'utf8');
const blk = src.slice(src.indexOf('const KOREAN_LPS'), src.indexOf('const FOREIGN_GPS'));
const re = /\[\/(.*?)\/i,\s*'([^']+)',\s*'([^']+)'\]/g;
const engByName = {};
let m;
while ((m = re.exec(blk))) {
  const [, body, name] = m;
  const alts = body.split('|').map(a =>
    a.replace(/\\b/g, '').replace(/\\s\??/g, ' ').replace(/\\\./g, '.')
     .replace(/[?]/g, '').replace(/\\/g, '').replace(/\s+/g, ' ').trim()
  );
  // 한글이 없고 영문자를 포함한 후보 중 가장 긴 것을 영문명으로.
  const eng = alts
    .filter(a => /[A-Za-z]/.test(a) && !/[가-힣]/.test(a) && a.length > 1)
    .sort((a, b) => b.length - a.length)[0];
  if (eng) engByName[name] = eng;
}

// ── 업권 유형별 일반 프로필 템플릿 (수치 없는 정성적 설명) ──────────
const TYPE_TEMPLATE = {
  '연기금': {
    summary: '공적·준공적 연금 성격의 기관투자자. 장기 연금부채에 맞춰 국내외 자산을 분산 운용하며 대체투자 비중을 점진 확대하고 있다.',
    altFocus: '해외 부동산·인프라·사모투자·사모대출에 위탁운용과 블라인드펀드 출자를 중심으로 분산 투자한다.',
    mandate: '블라인드펀드 출자 중심',
    tags: ['연기금', '장기 운용'],
  },
  '공제회': {
    summary: '회원의 공제·복지 재원을 운용하는 공제회. 절대수익을 추구하며 대체투자 비중이 높은 편이다.',
    altFocus: '국내외 부동산·인프라·사모대출·PEF에 블라인드펀드 출자와 직접투자로 분산한다.',
    mandate: '블라인드펀드·직접투자',
    tags: ['공제회', '절대수익 추구'],
  },
  '중앙회': {
    summary: '회원 조합의 여유자금을 통합 운용하는 중앙기구. 대규모 자금을 국내외 자산에 배분한다.',
    altFocus: '부동산·인프라·PEF·사모대출에 블라인드펀드 출자와 직접투자로 참여한다.',
    mandate: '블라인드펀드 출자',
    tags: ['중앙회', '대규모 운용'],
  },
  '은행': {
    summary: '예수금 기반 자산을 운용하는 은행. 자기자본투자(PI)와 대체투자로 수익원을 다변화한다.',
    altFocus: '해외 부동산·인프라·사모대출 딜에 자기자본투자(PI), 셀다운, 직접투자로 참여한다.',
    mandate: 'PI·셀다운·직접투자',
    tags: ['은행', 'PI 투자'],
  },
  '보험사': {
    summary: '보험 부채의 장기성에 맞춰 자산을 운용하는 보험사. 안정적 현금흐름의 인컴형 대체투자를 선호한다.',
    altFocus: '해외 사모대출·인프라·부동산 등 장기 인컴형 자산에 위탁·직접 출자한다.',
    mandate: '장기 인컴형 대체투자',
    tags: ['보험사', '인컴형 대체 선호'],
  },
  '캐피탈': {
    summary: '여신전문 금융회사. 자기자본을 기반으로 대체투자와 구조화금융을 수행한다.',
    altFocus: '부동산·인프라 프로젝트금융(PF), 사모대출, 메자닌 등에 투자한다.',
    mandate: '구조화금융·메자닌',
    tags: ['캐피탈', '구조화금융'],
  },
  '증권사': {
    summary: '자기자본투자(PI)와 셀다운을 병행하는 증권사. 해외 대체투자 딜의 주관·인수·재매각을 수행한다.',
    altFocus: '해외 부동산·인프라 딜을 인수해 기관(LP)에 셀다운하거나 자기자본으로 PI 투자한다.',
    mandate: '딜 주관·인수·셀다운',
    tags: ['증권사', '딜 소싱·셀다운'],
  },
  '자산운용사': {
    summary: '기관·리테일 자금을 위탁받아 펀드를 설정·운용하는 운용사. 대체투자 펀드의 GP로서 국내 기관(LP) 자금을 모집한다.',
    altFocus: '부동산·인프라·PE 펀드를 설정해 국내 LP를 모집·운용하며, 일부는 자기 계정으로도 투자한다.',
    mandate: '펀드 설정·운용 (GP)',
    tags: ['자산운용사', '대체투자 GP'],
  },
};

// ── 손으로 검증한 상세 프로필 (주요 LP) ─────────────────────────
// 설립연도·본부·운용 성격은 공개된 안정적 사실(기관 홈페이지·연차보고서) 기준.
// aum 은 공시 근사치이며 aumAsOf 로 기준 시점을 표기(국민연금·KIC 는 verified).
const CURATED = {
  '국민연금': {
    founded: 1987, hq: '전북 전주', aum: 1208, aumAsOf: '2024년 말', aumVerified: true,
    summary: '국내 최대이자 세계 3대 연기금. 기금운용본부(전주)가 국내외 주식·채권·대체투자를 직접·위탁 병행 운용한다.',
    altFocus: '대체투자는 사모투자·부동산·인프라 부문이 직접투자, 블라인드펀드 출자, 코인베스트로 운용. 해외 비중이 약 88%로 글로벌 GP 출자를 지속 확대.',
    mandate: '블라인드펀드 출자 · 코인베스트 · 직접투자',
    tags: ['세계 3대 연기금', '해외 대체투자 확대', '글로벌 GP 핵심 LP'],
  },
  '한국투자공사': {
    founded: 2005, hq: '서울 (뉴욕·런던·싱가포르 해외사무소)', aum: 304, aumAsOf: '2024년 말', aumVerified: true,
    summary: '정부·한국은행 자산을 위탁받아 운용하는 국부펀드(SWF). 자산 전액을 해외에 투자한다.',
    altFocus: '사모주식·부동산·인프라·헤지펀드·사모대출에 걸쳐 글로벌 분산. 대형 GP 펀드 출자와 공동투자(코인베스트)를 적극 활용.',
    mandate: '글로벌 분산 · 코인베스트 · 대형 GP 출자',
    tags: ['국부펀드', '100% 해외운용', '코인베스트 적극'],
  },
  '사립학교교직원연금공단': {
    founded: 1974, hq: '전남 나주', aum: 24, aumAsOf: '2023년 말',
    summary: '사립학교 교직원을 위한 연금기금. 안정적 장기수익을 목표로 대체투자 비중을 꾸준히 확대해 왔다.',
    altFocus: '국내외 부동산·인프라·사모투자에 위탁·블라인드펀드 중심으로 출자. 해외 대체 비중을 점진 확대.',
    mandate: '블라인드펀드 출자 중심',
    tags: ['연기금', '대체 비중 확대'],
  },
  '한국교직원공제회': {
    founded: 1971, hq: '서울 여의도', aum: 50, aumAsOf: '2023년 말',
    summary: '유·초·중·고 교직원 대상 국내 최대 공제회. 회원 급여·복지 재원을 장기 운용한다.',
    altFocus: '대체투자 비중이 높은 대표 공제회. 해외 부동산·인프라·사모대출·PEF에 블라인드펀드와 직접투자로 분산.',
    mandate: '블라인드펀드 · 직접투자 · 해외 비중 높음',
    tags: ['국내 최대 공제회', '대체투자 비중 높음', '해외 PE/RE 핵심 LP'],
  },
  '대한지방행정공제회': {
    founded: 1975, hq: '서울', aum: 26, aumAsOf: '2023년 말',
    summary: '지방행정 공무원 대상 공제회. 대체투자 선도 기관으로 꼽힌다.',
    altFocus: '포트폴리오의 절반 이상을 대체투자에 배분. 해외 사모대출·인프라·부동산 블라인드펀드 출자에 적극적.',
    mandate: '대체 비중 50%+ · 해외 사모대출 선호',
    tags: ['대체투자 선도', '해외 사모대출 적극'],
  },
  '군인공제회': {
    founded: 1984, hq: '서울', aum: 15, aumAsOf: '2023년 말',
    summary: '직업군인 대상 공제회. 금융투자와 사업부문을 병행 운용한다.',
    altFocus: '국내외 부동산·인프라·PEF 출자. 항공기금융 등 실물자산 투자 경험 보유.',
    mandate: '실물자산 · 블라인드펀드 출자',
    tags: ['공제회', '실물자산 투자'],
  },
  '과학기술인공제회': {
    founded: 2003, hq: '서울', aum: 13, aumAsOf: '2023년 말',
    summary: '과학기술인 대상 공제회. 적극적 대체투자로 성장한 중형 LP.',
    altFocus: '해외 사모대출·인프라·PEF 블라인드펀드 출자에 활발. 신규 GP 발굴에 개방적.',
    mandate: '블라인드펀드 출자 · 신규 GP 개방적',
    tags: ['중형 LP', '신규 GP 개방적'],
  },
  '공무원연금공단': {
    founded: 1982, hq: '제주', aum: 9, aumAsOf: '2023년 말',
    summary: '공무원 대상 연금기금. 운용 규모 대비 대체투자 비중을 확대 중.',
    altFocus: '국내외 부동산·인프라·사모투자에 위탁 중심 출자.',
    mandate: '위탁 운용 중심',
    tags: ['연기금', '대체 확대'],
  },
  '우정사업본부': {
    founded: 2000, hq: '세종',
    summary: '예금·보험 양대 기금을 운용하는 대형 기관투자자. 안정성과 수익성을 함께 추구한다.',
    altFocus: '예금·보험 계정 모두 해외 대체투자(부동산·인프라·사모)에 위탁·블라인드펀드로 출자.',
    mandate: '예금·보험 양대 계정 · 위탁 출자',
    tags: ['대형 기관투자자', '예금·보험 양대 기금'],
  },
  '새마을금고중앙회': {
    founded: 1982, hq: '서울',
    summary: '전국 새마을금고 중앙기구. 대규모 여유자금을 운용하는 핵심 LP.',
    altFocus: '국내외 부동산·인프라·PEF·사모대출에 블라인드펀드와 직접투자로 분산.',
    mandate: '블라인드펀드 · 직접투자',
    tags: ['대형 LP', '부동산·인프라 활발'],
  },
  '농업협동조합중앙회': {
    founded: 1961, hq: '서울',
    summary: '전국 농협의 중앙기구. 상호금융 등 대규모 자금을 통합 운용한다.',
    altFocus: '국내외 부동산·인프라·PEF·사모대출에 블라인드펀드 출자.',
    mandate: '블라인드펀드 출자',
    tags: ['중앙회', '상호금융 운용'],
  },
  '수산업협동조합중앙회': {
    founded: 1962, hq: '서울',
    summary: '전국 수협의 중앙기구. 상호금융 여유자금을 운용한다.',
    altFocus: '부동산·인프라·사모대출 등에 위탁·블라인드펀드로 참여.',
    mandate: '블라인드펀드 출자',
    tags: ['중앙회', '상호금융 운용'],
  },
  '삼성생명보험': {
    founded: 1957, hq: '서울', aum: 310, aumAsOf: '일반계정 총자산',
    summary: '국내 최대 생명보험사. 보험 일반계정의 장기부채에 맞춰 자산을 운용한다.',
    altFocus: '해외 부동산·인프라·사모대출 등 장기·인컴형 대체투자 선호. 안정적 현금흐름 자산에 집중.',
    mandate: '장기 인컴형 · 해외 사모대출/인프라',
    tags: ['최대 생보사', '인컴형 대체 선호'],
  },
  '교보생명보험': {
    founded: 1958, hq: '서울',
    summary: '대형 생명보험사. 보험계정 자산을 장기 운용한다.',
    altFocus: '해외 부동산·인프라·사모대출 등 인컴형 대체투자에 위탁·직접 출자.',
    mandate: '장기 인컴형 대체투자',
    tags: ['대형 생보사', '인컴형 대체'],
  },
  '한화생명보험': {
    founded: 1946, hq: '서울',
    summary: '대형 생명보험사. 보험부채 매칭을 위한 장기 자산운용을 한다.',
    altFocus: '해외 사모대출·인프라·부동산 등 장기 인컴형 대체투자 확대.',
    mandate: '장기 인컴형 대체투자',
    tags: ['대형 생보사', '인컴형 대체'],
  },
};

// 설립연도만 추가로 확신하는 기관 (상세 요약은 유형 템플릿 사용)
const FOUNDED = {
  '한국산업은행': 1954, '중소기업은행': 1961, '한국수출입은행': 1976,
  'KB국민은행': 2001, '신한은행': 1982, '하나은행': 1971, '우리은행': 1999, 'NH농협은행': 2012,
  '삼성화재해상보험': 1952, '현대해상화재보험': 1955, 'DB손해보험': 1962, 'KB손해보험': 1959,
  '메리츠화재해상보험': 1922, '한화손해보험': 1946, '롯데손해보험': 1947,
  '미래에셋증권': 1999, '한국투자증권': 1974, 'NH투자증권': 1969, '삼성증권': 1982,
  'KB증권': 2017, '신한투자증권': 2002, '메리츠증권': 1973, '대신증권': 1962,
  '미래에셋자산운용': 1997, '삼성자산운용': 1998, '한화자산운용': 1988,
  '이지스자산운용': 2010, '마스턴투자운용': 2009, '코람코자산신탁': 2001,
  '신협중앙회': 1964, '신용협동조합중앙회': 1964, '산림조합중앙회': 1962,
  '경찰공제회': 1989, '대한소방공제회': 1991, '건설근로자공제회': 1997,
};

// ── 로스터 로드 → 프로필 생성 ───────────────────────────────────
const roster = JSON.parse(await readFile(new URL('../institutions.json', import.meta.url), 'utf8')).institutions;
const profiles = {};
let curatedCount = 0;
for (const inst of roster) {
  const { name, type } = inst;
  const eng = engByName[name] || '';
  const cur = CURATED[name];
  if (cur) {
    curatedCount++;
    profiles[name] = {
      eng: cur.eng || eng,
      ...cur,
      curated: true,
      updatedAt: UPDATED,
      asOf: cur.aumAsOf ? `${cur.aumAsOf} 공시·기관 자료 기준` : '기관 공시·연차보고서 기준',
    };
  } else {
    const t = TYPE_TEMPLATE[type] || TYPE_TEMPLATE['자산운용사'];
    const p = {
      eng,
      summary: t.summary,
      altFocus: t.altFocus,
      mandate: t.mandate,
      tags: t.tags,
      curated: false,
      updatedAt: UPDATED,
      asOf: `${UPDATED} 기준 · 업권 유형(${type}) 일반 정보`,
    };
    if (FOUNDED[name]) p.founded = FOUNDED[name];
    profiles[name] = p;
  }
}

const data = {
  updatedAt: UPDATED,
  note: 'Placement agent 관점의 국내 LP 프로필. 주요 LP 는 검증된 상세 프로필(curated:true), 그 외는 업권 유형 기준 일반 프로필(curated:false). 설립연도·운용 성격은 공개 자료 기준이며, AUM·CIO·대체투자 배분·관련 기사는 앱에서 뉴스·공시(insights.json·allocations.json·news.json)로 자동 반영됩니다. 각 프로필의 updatedAt(갱신일)·asOf(정보 기준)를 함께 표기합니다.',
  count: Object.keys(profiles).length,
  curatedCount,
  profiles,
};
await writeFile(new URL('../lp-profiles.json', import.meta.url), JSON.stringify(data, null, 0));
console.log(`lp-profiles.json: ${data.count} profiles (${curatedCount} curated, ${data.count - curatedCount} type-based), updatedAt ${UPDATED}`);
