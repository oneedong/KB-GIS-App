/*
 * KB GIS — 무료 뉴스 자동 수집기 (zero-dependency)
 *
 * Google 뉴스 RSS(무료, API키 불필요)에서 해외대체투자 관련 기사를 모아
 * 앱이 읽는 news.json 으로 저장합니다. GitHub Actions 스케줄러가 주기적으로
 * 실행합니다 (.github/workflows/collect-news.yml).
 *
 *   node scripts/collect-news.mjs            # 수집 후 news.json 갱신
 *   node scripts/collect-news.mjs --selftest # 네트워크 없이 파서/분류 테스트
 */
import { readFile, writeFile } from 'fs/promises';

// 검색어: placement agent 관점의 해외 alternative investment fund 중심.
// (1) 글로벌 펀드레이징/자산군  (2) 글로벌 GP  (3) 국내 LP의 해외 출자.
const QUERIES = [
  // (1) 글로벌 펀드레이징 · 자산군 (영어)
  'private equity fund final close billion',
  'private credit fund close billion',
  'infrastructure fund final close billion',
  'real estate fund close billion',
  'aviation OR aircraft leasing fund close',
  'secondaries fund final close',
  'alternative investment fund launch',
  'private fund fundraising final close',
  'placement agent private capital',
  // (2) 글로벌 GP (OR 그룹)
  'Blackstone OR Apollo OR KKR OR Carlyle OR Ares fund',
  'BlackRock OR Brookfield OR EQT OR CVC OR TPG fund',
  '"Bain Capital" OR Advent OR Permira OR "Warburg Pincus" fund',
  'Oaktree OR "Blue Owl" OR HPS OR "Sixth Street" credit fund',
  '"Partners Group" OR Ardian OR "Hamilton Lane" OR StepStone',
  '"Global Infrastructure Partners" OR Stonepeak OR "I Squared" OR Macquarie infrastructure',
  // (3) 국내 LP 의 해외 대체투자 (한국어 · 해외 맥락)
  '국민연금 해외 (사모 OR 인프라 OR 부동산 OR 사모대출)',
  '한국투자공사 해외 (사모 OR 인프라 OR 부동산)',
  '교직원공제회 해외 (대체투자 OR 사모 OR 출자)',
  '행정공제회 해외 (대체투자 OR 인프라 OR 부동산)',
  '군인공제회 해외 (대체투자 OR 사모 OR 출자)',
  '과학기술인공제회 해외 (대체투자 OR 출자)',
  '국내 기관 해외 대체투자 출자 약정',
  '연기금 공제회 해외 사모펀드 출자',
  '보험사 해외 (사모대출 OR 대체투자)',
  '한국 LP 해외 사모펀드 OR PEF 출자',
  // (4) CIO·조직/인사 (기관별 운용 사령탑) — insights.json 자동 갱신용
  '국민연금 (기금이사 OR CIO OR 기금운용본부장) (선임 OR 공모 OR 내정)',
  '(교직원공제회 OR 행정공제회 OR 군인공제회 OR 사학연금) CIO (선임 OR 내정 OR 공모)',
  '연기금 OR 공제회 CIO (선임 OR 인선 OR 영입)',
  // (5) 자산군별 수익률 — insights.json 자동 갱신용
  '국민연금 (대체투자 OR 사모투자 OR 부동산 OR 인프라) 수익률',
  '연기금 공제회 대체투자 수익률',
  // (6) 최신성 강화 — Google 뉴스 when: 연산자로 최근 3일 기사 우선 수집.
  // (RSS 기본 검색은 날짜순이 아니어서 오늘 기사가 묻히는 문제를 보완)
  'private equity OR private credit OR infrastructure fund (close OR raise) billion when:3d',
  '(국민연금 OR 교직원공제회 OR 행정공제회 OR 군인공제회 OR 사학연금) (대체투자 OR 사모 OR 인프라 OR 부동산 OR 출자) when:3d',
  '연기금 OR 공제회 (해외 대체투자 OR 사모펀드 OR 사모대출 OR 출자) when:3d',
  '(Blackstone OR KKR OR Apollo OR Ares OR Carlyle OR Brookfield) fund (close OR raise) when:3d',
];

// ── (선택) 무료 LLM 요약: Google Gemini ──────────────────
// 저장소 Secrets 에 GEMINI_API_KEY 가 있으면 "기사 본문"을 근거로 진짜 요약을
// 만듭니다. 모델명은 시간이 지나며 폐기되므로 후보를 순서대로 시도하고, 처음
// 성공한 모델을 이후에 재사용합니다(GEMINI_MODEL 로 직접 지정 가능).
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const MODEL_CANDIDATES = [process.env.GEMINI_MODEL, 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'].filter(Boolean);
let WORKING_MODEL = '';
const LLM_BUDGET = 90;

// Gemini 호출(모델 폴백 포함) → 응답 텍스트. 실패 시 null.
async function llmRaw(prompt, maxTok) {
  if (!GEMINI_API_KEY) return null;
  const models = WORKING_MODEL ? [WORKING_MODEL] : MODEL_CANDIDATES;
  for (const model of models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, maxOutputTokens: maxTok } }) }
      );
      if (res.status === 404 || res.status === 400) { console.warn(`gemini model ${model} unavailable (${res.status}), trying next`); continue; }
      if (!res.ok) { console.warn(`gemini ${model} HTTP ${res.status}`); return null; }
      const j = await res.json();
      const text = (((j.candidates || [])[0] || {}).content || {}).parts?.[0]?.text || '';
      if (text) { WORKING_MODEL = model; return text; }
      return null;
    } catch (e) { console.warn(`gemini ${model} error: ${e.message}`); }
  }
  return null;
}

// 한국어 기사 → 3줄 요약
async function summarizeKo(title, body) {
  const src = (body && body.length > 60) ? body.slice(0, 6000) : title;
  const prompt = `다음은 해외/국내 기관의 대체투자(사모펀드·사모대출·인프라·부동산·항공기금융) 관련 뉴스 기사다. 기사 "본문 내용"에 근거해 한국어 3줄로 요약하라. 각 줄은 핵심 사실(주체·금액·자산군·의미)을 담은 완결된 한 문장으로, 불릿/번호 없이 줄바꿈으로만 구분한다. 제목을 그대로 복사하지 말 것.\n\n[제목] ${title}\n\n[본문] ${src}`;
  const text = await llmRaw(prompt, 320);
  if (!text) return null;
  const lines = text.split('\n').map(s => s.replace(/^[\s\-*\d.)]+/, '').trim()).filter(Boolean).slice(0, 3);
  return lines.length ? lines : null;
}

// 영문 기사 → {titleKo, bodyKo, summary[3]} (번역 + 요약, JSON 한 번에)
async function translateAndSummarize(title, body) {
  const src = (body || '').slice(0, 5000);
  const prompt = `Translate the following English alternative-investment news article into natural Korean and summarize it. Output ONLY a JSON object, no markdown:\n{"titleKo": "한국어 제목", "bodyKo": "기사 본문을 사실 왜곡 없이 자연스러운 한국어로 번역한 전체 텍스트", "summary": ["핵심 한국어 문장1", "문장2", "문장3"]}\n\n[TITLE] ${title}\n\n[BODY] ${src}`;
  const text = await llmRaw(prompt, 2048);
  if (!text) return null;
  const m = text.match(/\{[\s\S]*\}/);
  try {
    const o = JSON.parse(m ? m[0] : text);
    if (!o || (!o.bodyKo && !o.titleKo)) return null;
    return { titleKo: o.titleKo || '', bodyKo: o.bodyKo || '', summary: Array.isArray(o.summary) ? o.summary.slice(0, 3) : null };
  } catch { return null; }
}

// ── 분류 사전 ────────────────────────────────────────────
// 국내 LP 기관 (업권별) — 첨부 엑셀 기반 자동 생성. 긴 이름이 먼저 매칭됩니다.
const KOREAN_LPS = [
  [/사립학교교직원연금공단|사학연금|Korea Teachers Pension/i, '사립학교교직원연금공단', '연기금'],
  [/수산업협동조합중앙회|National Federation of Fisheries Cooperatives/i, '수산업협동조합중앙회', '중앙회'],
  [/파인스트리트자산운용|Pine Street Asset Management/i, '파인스트리트자산운용', '자산운용사'],
  [/하나대체투자자산운용|Hana Alternative Asset Management/i, '하나대체투자자산운용', '자산운용사'],
  [/기계설비건설공제조합|Korea Mechanical Construction Financial Cooperative/i, '기계설비건설공제조합', '기타'],
  [/한국성장금융투자운용|Korea Growth Investment Corp\./i, '한국성장금융투자운용', '기타'],
  [/대한지방행정공제회|행정공제회|POBA|Public Officials Benefit Association/i, '대한지방행정공제회', '공제회'],
  [/엔지니어링공제조합|Korea Engineering Financial Cooperative/i, '엔지니어링공제조합', '공제회'],
  [/한국지방재정공제회|Korea Local Finance Association/i, '한국지방재정공제회', '공제회'],
  [/iM라이프생명보험|iM라이프생명|iM Life Insurance/i, 'iM라이프생명보험', '보험사'],
  [/신한라이프생명보험|신한라이프생명|Shinhan Life Insurance/i, '신한라이프생명보험', '보험사'],
  [/메리츠화재해상보험|메리츠화재해상|Meritz Fire & Marine Insurance/i, '메리츠화재해상보험', '보험사'],
  [/KB라이프생명보험|KB라이프생명|KB Life Insurance/i, 'KB라이프생명보험', '보험사'],
  [/메트라이프생명보험|메트라이프생명|MetLife Insurance/i, '메트라이프생명보험', '보험사'],
  [/처브라이프생명보험|처브라이프생명|Chubb Life Insurance/i, '처브라이프생명보험', '보험사'],
  [/농업협동조합중앙회|National Agricultural Cooperative Federation/i, '농업협동조합중앙회', '중앙회'],
  [/신용협동조합중앙회|National Credit Union Federation of Korea/i, '신용협동조합중앙회', '중앙회'],
  [/삼성SRA자산운용|Samsung SRA Asset Management/i, '삼성SRA자산운용', '자산운용사'],
  [/NH아문디자산운용|NH-Amundi Asset Management/i, 'NH아문디자산운용', '자산운용사'],
  [/Company H/i, 'Company H', '기타'],
  [/한국교직원공제회|교직원공제회|Korea Teachers' Credit Union/i, '한국교직원공제회', '공제회'],
  [/전문건설공제조합|Korea Specialty Contractors Financial Cooperative/i, '전문건설공제조합', '공제회'],
  [/건설근로자공제회|Construction Workers Mutual Aid Association/i, '건설근로자공제회', '공제회'],
  [/과학기술인공제회|Korea Scientists and Engineers Mutual-aid Association/i, '과학기술인공제회', '공제회'],
  [/전기공사공제조합|Korea Electrical Contractors Financial Cooperative/i, '전기공사공제조합', '공제회'],
  [/NH농협생명보험|NH농협생명|NH Life Insurance/i, 'NH농협생명보험', '보험사'],
  [/미래에셋생명보험|미래에셋생명|Mirae Asset Life Insurance/i, '미래에셋생명보험', '보험사'],
  [/푸본현대생명보험|푸본현대생명|Fubon Hyundai Life Insurance/i, '푸본현대생명보험', '보험사'],
  [/NH농협손해보험|NH농협손해/i, 'NH농협손해보험', '보험사'],
  [/삼성화재해상보험|삼성화재해상|Samsung Fire & Marine Insurance/i, '삼성화재해상보험', '보험사'],
  [/흥국화재해상보험|흥국화재해상|Heungkuk Fire & Marine Insurance/i, '흥국화재해상보험', '보험사'],
  [/현대해상화재보험|현대해상화재|Hyundai Marine & Fire Insurance/i, '현대해상화재보험', '보험사'],
  [/새마을금고중앙회|Korean Federation of Community Credit Cooperatives/i, '새마을금고중앙회', '중앙회'],
  [/미래에셋자산운용|Mirae Asset Global Investments/i, '미래에셋자산운용', '자산운용사'],
  [/키움투자자산운용|Kiwoom Asset Management/i, '키움투자자산운용', '자산운용사'],
  [/새마을금고복지회|MG Welfare Foundation/i, '새마을금고복지회', '기타'],
  [/공무원연금공단|공무원연금|Government Employees Pension Service/i, '공무원연금공단', '연기금'],
  [/대한소방공제회|Korea Fire Officials Mutual Aid Association/i, '대한소방공제회', '공제회'],
  [/SGI서울보증|Seoul Guarantee Insurance Company/i, 'SGI서울보증', '보험사'],
  [/라이나생명보험|라이나생명|Lina Life Insurance/i, '라이나생명보험', '보험사'],
  [/KDB생명보험|KDB생명|KDB Life Insurance/i, 'KDB생명보험', '보험사'],
  [/코리안리재보험|코리안리재|Korean Reinsurance Company/i, '코리안리재보험', '보험사'],
  [/AIA생명보험|AIA생명|AIA Life Insurance/i, 'AIA생명보험', '보험사'],
  [/ABL생명보험|ABL생명|ABL Life Insurance/i, 'ABL생명보험', '보험사'],
  [/중소기업중앙회|Korea Federation of SMEs/i, '중소기업중앙회', '중앙회'],
  [/산림조합중앙회|National Forestry Cooperative Federation/i, '산림조합중앙회', '중앙회'],
  [/저축은행중앙회|Korea Federation of Savings Banks/i, '저축은행중앙회', '중앙회'],
  [/MG새마을금고|KFCC/i, 'MG새마을금고', '은행'],
  [/한국수출입은행|수출입은행|The Export-Import Bank of Korea/i, '한국수출입은행', '은행'],
  [/IBK투자증권|IBK Investment & Securities/i, 'IBK투자증권', '증권사'],
  [/이지스자산운용|IGIS Asset Management/i, '이지스자산운용', '자산운용사'],
  [/마스턴투자운용|Mastern Investment Management/i, '마스턴투자운용', '자산운용사'],
  [/코람코자산신탁|KORAMCO/i, '코람코자산신탁', '자산운용사'],
  [/제이알투자운용|JR Investment Management/i, '제이알투자운용', '자산운용사'],
  [/NH농협캐피탈|NH Capital/i, 'NH농협캐피탈', '캐피탈'],
  [/우리금융캐피탈|Woori Financial Capital/i, '우리금융캐피탈', '캐피탈'],
  [/한국투자공사|KIC|Korea Investment Corporation/i, '한국투자공사', '연기금'],
  [/우정사업본부|Korea Post/i, '우정사업본부', '연기금'],
  [/건설공제조합|Construction Guarantee/i, '건설공제조합', '공제회'],
  [/교보생명보험|교보생명|Kyobo Life Insurance/i, '교보생명보험', '보험사'],
  [/하나생명보험|하나생명|Hana Life Insurance/i, '하나생명보험', '보험사'],
  [/DB생명보험|DB생명|DB Life Insurance/i, 'DB생명보험', '보험사'],
  [/한화생명보험|한화생명|Hanwha Life Insurance/i, '한화생명보험', '보험사'],
  [/삼성생명보험|삼성생명|Samsung Life Insurance/i, '삼성생명보험', '보험사'],
  [/동양생명보험|동양생명|Tongyang Life Insurance/i, '동양생명보험', '보험사'],
  [/흥국생명보험|흥국생명|Heungkuk Life Insurance/i, '흥국생명보험', '보험사'],
  [/한화손해보험|한화손해|Hanwha General Insurance/i, '한화손해보험', '보험사'],
  [/MG손해보험|MG손해|MG Non-Life Insurance/i, 'MG손해보험', '보험사'],
  [/DB손해보험|DB손해|DB Insurance/i, 'DB손해보험', '보험사'],
  [/농협손해보험|농협손해/i, '농협손해보험', '보험사'],
  [/롯데손해보험|롯데손해|Lotte Non-Life Insurance/i, '롯데손해보험', '보험사'],
  [/KB손해보험|KB손해|KB Insurance/i, 'KB손해보험', '보험사'],
  [/하나손해보험|하나손해|Hana Non-Life Insurance/i, '하나손해보험', '보험사'],
  [/중소기업은행|기업은행|IBK기업은행|Industrial Bank of Korea/i, '중소기업은행', '은행'],
  [/KB국민은행|Kookmin Bank/i, 'KB국민은행', '은행'],
  [/NH농협은행|NongHyup Bank/i, 'NH농협은행', '은행'],
  [/한국산업은행|산업은행|KDB산업은행|Korea Development Bank/i, '한국산업은행', '은행'],
  [/SC제일은행|Standard Chartered Bank Korea/i, 'SC제일은행', '은행'],
  [/한국씨티은행|Citibank Korea/i, '한국씨티은행', '은행'],
  [/NH투자증권|NH Investment & Securities/i, 'NH투자증권', '증권사'],
  [/신한투자증권|Shinhan Securities/i, '신한투자증권', '증권사'],
  [/미래에셋증권|Mirae Asset Securities/i, '미래에셋증권', '증권사'],
  [/한국투자증권|Korea Investment & Securities/i, '한국투자증권', '증권사'],
  [/한화투자증권|Hanwha Investment & Securities/i, '한화투자증권', '증권사'],
  [/DB금융투자|DB Financial Investment/i, 'DB금융투자', '증권사'],
  [/다올투자증권|DAOL Investment & Securities/i, '다올투자증권', '증권사'],
  [/유진투자증권|Eugene Investment & Securities/i, '유진투자증권', '증권사'],
  [/삼성자산운용|Samsung Asset Management/i, '삼성자산운용', '자산운용사'],
  [/신한자산운용|Shinhan Asset Management/i, '신한자산운용', '자산운용사'],
  [/KB자산운용|KB Asset Management/i, 'KB자산운용', '자산운용사'],
  [/DB자산운용|DB Asset Management/i, 'DB자산운용', '자산운용사'],
  [/현대자산운용|Hyundai Asset Management/i, '현대자산운용', '자산운용사'],
  [/한화자산운용|Hanwha Asset Management/i, '한화자산운용', '자산운용사'],
  [/IBK캐피탈|IBK Capital/i, 'IBK캐피탈', '캐피탈'],
  [/메리츠캐피탈|Meritz Capital/i, '메리츠캐피탈', '캐피탈'],
  [/BNK캐피탈|BNK Capital/i, 'BNK캐피탈', '캐피탈'],
  [/한국벤처투자|Korea Venture Investment Corp\./i, '한국벤처투자', '기타'],
  [/포스텍 재단|POSTECH Foundation/i, '포스텍 재단', '기타'],
  [/교원인베스트|Kyowon Invest/i, '교원인베스트', '기타'],
  [/근로복지공단|Korea Workers' Compensation & Welfare Service/i, '근로복지공단', '기타'],
  [/경찰공제회|Korea Police Mutual Aid Association/i, '경찰공제회', '공제회'],
  [/군인공제회|Military Mutual Aid Association/i, '군인공제회', '공제회'],
  [/메리츠증권|Meritz Securities/i, '메리츠증권', '증권사'],
  [/현대차증권|Hyundai Motor Securities/i, '현대차증권', '증권사'],
  [/신한캐피탈|Shinhan Capital/i, '신한캐피탈', '캐피탈'],
  [/현대커머셜|Hyundai Commercial/i, '현대커머셜', '캐피탈'],
  [/KB캐피탈|KB Capital/i, 'KB캐피탈', '캐피탈'],
  [/하나캐피탈|Hana Capital/i, '하나캐피탈', '캐피탈'],
  [/국민연금|NPS|국민연금공단|National Pension Service/i, '국민연금', '연기금'],
  [/우리은행|Woori Bank/i, '우리은행', '은행'],
  [/하나은행|Hana Bank/i, '하나은행', '은행'],
  [/신한은행|Shinhan Bank/i, '신한은행', '은행'],
  [/iM뱅크|iM Bank/i, 'iM뱅크', '은행'],
  [/수협은행|Suhyup Bank/i, '수협은행', '은행'],
  [/부산은행|Busan Bank/i, '부산은행', '은행'],
  [/경남은행|Kyongnam Bank/i, '경남은행', '은행'],
  [/광주은행|Kwangju Bank/i, '광주은행', '은행'],
  [/전북은행|Jeonbuk Bank/i, '전북은행', '은행'],
  [/삼성증권|Samsung Securities/i, '삼성증권', '증권사'],
  [/하나증권|Hana Securities/i, '하나증권', '증권사'],
  [/KB증권|KB Securities/i, 'KB증권', '증권사'],
  [/키움증권|Kiwoom Securities/i, '키움증권', '증권사'],
  [/대신증권|Daishin Securities/i, '대신증권', '증권사'],
  [/교보증권|Kyobo Securities/i, '교보증권', '증권사'],
  [/신영증권|Shinyoung Securities/i, '신영증권', '증권사'],
  [/M캐피탈|M Capital/i, 'M캐피탈', '캐피탈'],
  [/성담개발|Sungdam Development/i, '성담개발', '기타'],
  [/KT&G|KT&G Corporation/i, 'KT&G', '기타'],
  [/TCK/i, 'TCK', '기타'],
];
// 해외 GP (운용사)
// 해외 글로벌 운용사(Global GP). 약칭 충돌을 피하려고 짧은 이름엔 \b 경계 사용.
const FOREIGN_GPS = [
  [/blackstone|블랙스톤/i, 'Blackstone', '해외 GP'],
  [/\bKKR\b/i, 'KKR', '해외 GP'],
  [/apollo (?:global|management)|아폴로/i, 'Apollo', '해외 GP'],
  [/carlyle|칼라일/i, 'Carlyle', '해외 GP'],
  [/\bares\b|ares management|에어리스/i, 'Ares', '해외 GP'],
  [/brookfield|브룩필드/i, 'Brookfield', '해외 GP'],
  [/blackrock|블랙록/i, 'BlackRock', '해외 GP'],
  [/bain capital|베인캐피탈|베인 캐피탈/i, 'Bain Capital', '해외 GP'],
  [/\bTPG\b/i, 'TPG', '해외 GP'],
  [/\bCVC\b|cvc capital/i, 'CVC', '해외 GP'],
  [/\bEQT\b/i, 'EQT', '해외 GP'],
  [/advent international|어드벤트/i, 'Advent', '해외 GP'],
  [/permira|퍼미라/i, 'Permira', '해외 GP'],
  [/warburg pincus|워버그 ?핀커스/i, 'Warburg Pincus', '해외 GP'],
  [/vista equity|비스타 ?에쿼티/i, 'Vista Equity', '해외 GP'],
  [/silver lake|실버레이크/i, 'Silver Lake', '해외 GP'],
  [/thoma bravo|토마 ?브라보/i, 'Thoma Bravo', '해외 GP'],
  [/general atlantic|제너럴 ?애틀랜틱/i, 'General Atlantic', '해외 GP'],
  [/hellman ?& ?friedman|\bH&F\b/i, 'Hellman & Friedman', '해외 GP'],
  [/cinven|신벤/i, 'Cinven', '해외 GP'],
  [/CD&R|clayton.+dubilier/i, 'CD&R', '해외 GP'],
  [/oaktree|오크트리/i, 'Oaktree', '해외 GP'],
  [/\bHPS\b|hps investment/i, 'HPS', '해외 GP'],
  [/sixth street|식스스트리트/i, 'Sixth Street', '해외 GP'],
  [/blue owl|블루 ?아울/i, 'Blue Owl', '해외 GP'],
  [/golub capital|골럽/i, 'Golub Capital', '해외 GP'],
  [/intermediate capital|\bICG\b/i, 'ICG', '해외 GP'],
  [/tikehau|티케하우/i, 'Tikehau', '해외 GP'],
  [/pimco|핌코/i, 'PIMCO', '해외 GP'],
  [/\bPGIM\b/i, 'PGIM', '해외 GP'],
  [/global infrastructure partners|\bGIP\b/i, 'GIP', '해외 GP'],
  [/stonepeak|스톤피크/i, 'Stonepeak', '해외 GP'],
  [/i squared|isquared|\bISQ\b/i, 'I Squared', '해외 GP'],
  [/digitalbridge|디지털브리지/i, 'DigitalBridge', '해외 GP'],
  [/macquarie|맥쿼리/i, 'Macquarie', '해외 GP'],
  [/\bactis\b|액티스/i, 'Actis', '해외 GP'],
  [/starwood capital|스타우드/i, 'Starwood', '해외 GP'],
  [/\bhines\b|하인즈/i, 'Hines', '해외 GP'],
  [/greystar/i, 'Greystar', '해외 GP'],
  [/patrizia/i, 'PATRIZIA', '해외 GP'],
  [/nuveen|누빈/i, 'Nuveen', '해외 GP'],
  [/ardian|아디안/i, 'Ardian', '해외 GP'],
  [/partners group|파트너스 ?그룹/i, 'Partners Group', '해외 GP'],
  [/hamilton lane|해밀턴 ?레인/i, 'Hamilton Lane', '해외 GP'],
  [/stepstone|스텝스톤/i, 'StepStone', '해외 GP'],
  [/coller capital|콜러/i, 'Coller Capital', '해외 GP'],
  [/lexington partners/i, 'Lexington', '해외 GP'],
  [/pantheon|판테온/i, 'Pantheon', '해외 GP'],
  [/neuberger berman|뉴버거 ?버먼/i, 'Neuberger Berman', '해외 GP'],
  [/fortress investment|포트리스/i, 'Fortress', '해외 GP'],
  [/cerberus|서버러스/i, 'Cerberus', '해외 GP'],
  [/centerbridge|센터브리지/i, 'Centerbridge', '해외 GP'],
  [/lone star funds|론스타/i, 'Lone Star', '해외 GP'],
  [/angelo gordon/i, 'Angelo Gordon', '해외 GP'],
  [/davidson kempner/i, 'Davidson Kempner', '해외 GP'],
];
const INSTS = [...KOREAN_LPS, ...FOREIGN_GPS];

const ASSETS = [
  ['AV', /항공기|aircraft|aviation|항공\s?금융|aircraft leasing|항공기\s?리스|aircraft finance/i],
  ['IN', /인프라|infrastructure|재생에너지|renewable|태양광|풍력|발전소|data\s?cent|데이터센터|통신탑|toll road|공항|항만/i],
  ['PC', /사모대출|private credit|direct lending|다이렉트 렌딩|메자닌|mezzanine|private debt|사모채권|선순위 대출/i],
  ['RE', /부동산|real estate|오피스|office|물류|logistics|호텔|hotel|리테일|retail|멀티패밀리|multifamily|임대주택|데이터센터 부동산/i],
  ['PE', /사모펀드|private equity|바이아웃|buyout|세컨더리|secondaries|\bPE\b|growth equity|벤처/i],
];
const REGIONS = [
  ['US', /미국|u\.?s\.?\b|뉴욕|new york|북미|north america/i],
  ['EU', /유럽|europe|영국|\bUK\b|런던|london|독일|german|프랑스|france|\bEU\b/i],
  ['AP', /아시아|asia|일본|japan|중국|china|인도|india|싱가포르|singapore|호주|australia/i],
];
const PEOPLE_RE = /인사|\bCIO\b|선임|영입|퇴임|사임|승진|내정|appoint|\bnames?\b|hire|steps? down/i;
// 조직 개편·신설 등 "조직 변경" 신호 (인사 카테고리로 함께 분류)
const ORG_RE = /조직\s?개편|조직\s?변경|직제\s?개편|조직\s?재편|본부\s?신설|실\s?신설|과\s?신설|팀\s?신설|기금운용과|운용역\s?증원|reorganiz|restructur/i;

// ── 관련성 필터 (placement agent · 해외 대체투자 펀드 중심) ──
// 통과 조건: (1) 대체투자 자산군 신호 ALT_RE  (2) 펀드·출자 맥락 FUND_RE
// (3) 해외/글로벌 맥락 GLOBAL_RE 또는 글로벌 GP/국내 LP  (4) 잡음 EXCLUDE_RE 아님.
// → 상장사 주식·실적 등 public equity / 국내 리테일 뉴스를 걸러냅니다.
const ALT_RE = /대체투자|사모펀드|사모대출|private equity|private credit|private debt|infrastructure|인프라|real estate|부동산\s?펀드|바이아웃|buyout|메자닌|mezzanine|세컨더리|secondar|코인베스트|co-?invest|direct lending|다이렉트 렌딩|항공기|aircraft|aviation|블라인드\s?펀드|alternative (?:investment|asset)|venture capital|벤처캐피탈|\bPEF\b/i;
// 펀드·운용·출자 등 "투자기구/자금모집" 맥락 — 운영회사 일반 뉴스를 배제.
const FUND_RE = /펀드|\bfund\b|출자|약정|커밋|commit|결성|클로징|클로즈|final close|fund close|fundrais|펀드레이징|capital raise|raises?\b|mandate|블라인드|코인베스트|co-?invest|세컨더리|secondar|메자닌|mezzanine|다이렉트 렌딩|direct lending|바이아웃|buyout|사모펀드|사모대출|private equity|private credit|private debt|운용사|자산운용|\bGP\b|\bLP\b|sponsor|배정|배분|allocat|벤처캐피탈|venture capital/i;
const GLOBAL_RE = /해외|글로벌|global|overseas|cross-?border|international|offshore|미국|u\.?s\.?\b|유럽|europe|영국|london|런던|뉴욕|new york|북미|north america|아시아|asia|중국|일본|인도|싱가포르|중동|독일|프랑스/i;
// 국내 리테일·시황·상장사(공모주식)·일반 기업 뉴스 잡음
const EXCLUDE_RE = /분양|청약|아파트|재건축|재개발|전세|월세|입주|기준금리|코스피|코스닥|공모주|상장폐지|상장사|증시|주가|목표주가|시황|환율|예금|적금|카드론|주택담보|보험료|실손|자동차보험|채용|부고|유상증자|무상증자|자사주|영업이익|영업손실|당기순|순이익|매출액|어닝|컨센서스|배당금|기업공개|\bIPO\b|스팩|\bSPAC\b/i;

// ── 유틸 ────────────────────────────────────────────────
function decodeEntities(s = '') {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&nbsp;/g, ' ').replace(/&middot;/g, '·').replace(/&hellip;/g, '…')
    .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–')
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"').replace(/&#39;|&apos;|&rsquo;|&lsquo;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&amp;/g, '&');
}
function stripTags(s = '') {
  let t = decodeEntities(s);        // 인코딩된 태그(&lt;a&gt;)를 실제 태그로
  t = t.replace(/<[^>]+>/g, ' ');   // 태그 제거
  t = decodeEntities(t);            // 태그 제거 후 남은 엔티티 정리 (이중 인코딩 대응)
  return t.replace(/\s+/g, ' ').trim();
}
function tag(block, name) { const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i')); return m ? m[1].trim() : ''; }
function hasHangul(s = '') { return /[가-힣]/.test(s); }
function hashId(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return 'g' + (h >>> 0).toString(36); }
function pick(pairs, text, def) { for (const [key, re] of pairs) if (re.test(text)) return key; return def; }
function pickInst(text) { for (const [re, name, type] of INSTS) if (re.test(text)) return { inst: name, instType: type }; return null; }
// 텍스트에서 마지막으로 등장하는 국내 LP 기관(직함 바로 앞 기관)을 찾습니다.
function pickKoreanLpLast(text) {
  let best = null, bestIdx = -1;
  for (const [re, name, type] of KOREAN_LPS) {
    const m = text.match(re);
    if (m && m.index >= bestIdx) { bestIdx = m.index; best = { inst: name, instType: type }; }
  }
  return best;
}

// ── CIO·인사 / 자산군별 수익률 자동 추출 (insights.json) ──────
const CIO_TITLE = /기금이사|\bCIO\b|최고투자책임자|투자운용본부장|운용본부장|자금운용본부장/;
const CIO_APPOINT = /선임|임명|내정|취임|영입|발탁/;
const CIO_RECRUIT = /공모|모집|후보|압축|인선|공석|선정/;
const NAME_BLOCK = /국민|연금|공제|기금|운용|투자|대체|사모|신임|차기|올해|내년|최고|책임|본부|이사|대표|부문|해외|국내|글로벌|수익|자산|증원|복지|행정|교직|군인|과학|우정|연기|수협|중앙/;
// CIO/운용 사령탑 인사 추출 → { inst, status, person, background } | null
export function extractCio(text) {
  if (!CIO_TITLE.test(text)) return null;
  const tIdx = text.search(CIO_TITLE);
  const target = pickKoreanLpLast(text.slice(0, tIdx + 8)) || pickKoreanLpLast(text);
  let person = '';
  // 고정밀: "…CIO/기금이사 …에 OOO" (직함 뒤 이름)
  let m = text.match(/(?:기금이사|CIO|최고투자책임자|투자운용본부장|운용본부장)\s*(?:신임\s*)?(?:에|로|으로)\s*([가-힣]{2,4})/);
  if (m && !NAME_BLOCK.test(m[1])) person = m[1];
  if (!person) {                       // "OOO 신임 기금이사/CIO" (이름 먼저) — 선임 동반 시에만
    let m2 = text.match(/([가-힣]{2,4})\s*(?:신임)\s*(?:기금이사|CIO|최고투자책임자|운용본부장)/);
    if (m2 && !NAME_BLOCK.test(m2[1]) && CIO_APPOINT.test(text)) person = m2[1];
  }
  const status = person ? '선임' : (CIO_RECRUIT.test(text) ? '공모·인선 진행' : null);
  if (!person && !status) return null;
  let background = (text.match(/([가-힣A-Za-z·]{2,18})\s*출신/) || [])[1] || '';
  if (background && NAME_BLOCK.test(background) && background.length <= 3) background = '';
  return { inst: target ? target.inst : '', instType: target ? target.instType : '', status, person, background };
}
// 자산군별 수익률 추출 → { asset, value } | null  (수익률 맥락 + 자산군 + 합리적 %)
export function extractReturn(text) {
  if (!/수익률|운용수익|평가익|벌어들/.test(text)) return null;
  const pm = text.match(/(-?\d{1,2}(?:\.\d{1,2})?)\s*%/);
  if (!pm) return null;
  const v = parseFloat(pm[1]);
  if (v < -50 || v > 60) return null;
  for (const [code, re] of ASSETS) if (re.test(text)) return { asset: code, value: v };
  if (/대체투자/.test(text)) return { asset: 'ALT', value: v };
  return null;
}
// 수집 기사에서 insights(CIO·수익률) 빌드 — 기관별 최신 1건 유지.
export function buildInsights(articles) {
  const ASSET_LABEL = { AV: '항공기금융', IN: '인프라', PC: 'Private Credit', RE: '부동산', PE: 'Private Equity', ALT: '대체투자 전체' };
  const cioByInst = new Map();
  const retByAsset = new Map();
  const sorted = articles.slice().sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0)); // 최신 우선
  for (const a of sorted) {
    const text = `${a.ko || ''} ${a.body || ''}`;
    const c = extractCio(text);
    if (c && c.inst && c.instType !== '해외 GP') {
      if (!cioByInst.has(c.inst)) {
        const note = c.status === '선임'
          ? `신임 CIO ${c.person}${c.background ? ` (${c.background} 출신)` : ''}`
          : 'CIO 공모·인선 진행 중';
        cioByInst.set(c.inst, { inst: c.inst, group: grpName(c.instType), status: c.status, person: c.person, background: c.background, note, source: a.source, url: a.url, date: a.date, ts: a.ts });
      }
    }
    const r = extractReturn(text);
    if (r && !retByAsset.has(r.asset)) {
      retByAsset.set(r.asset, { asset: r.asset, label: ASSET_LABEL[r.asset] || r.asset, value: r.value, inst: a.instType !== '해외 GP' ? a.inst : '', source: a.source, url: a.url, date: a.date, ts: a.ts });
    }
  }
  const { date } = kstParts();
  return { updatedAt: date, cios: [...cioByInst.values()], assetReturns: [...retByAsset.values()] };
}
// instType → 업권 그룹(앱 표시용)
function grpName(t) {
  if (['연기금', '공제회', '중앙회', '은행'].includes(t)) return t;
  if (['자산운용사', '증권사'].includes(t)) return '운용·증권';
  if (['보험사', '캐피탈'].includes(t)) return '보험·캐피탈';
  return '기타';
}

function extractMetric(text) {
  const pats = [
    /[+\-]?\$[\d.,]+\s?(?:billion|million|bn|m|B|M)?/i,
    /€[\d.,]+\s?(?:billion|million|bn|m|B|M)?/i,
    /£[\d.,]+\s?(?:billion|million|bn|m|B|M)?/i,
    /₩?[\d,]+\s?(?:조|억)\s?원?/,
  ];
  for (const p of pats) { const m = text.match(p); if (m) return m[0].replace(/\s+/g, ' ').trim(); }
  return '';
}
function kstParts(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return { date: `${p(k.getUTCMonth() + 1)}.${p(k.getUTCDate())}`, time: `${p(k.getUTCHours())}:${p(k.getUTCMinutes())}`, iso: d.toISOString() };
}

// ── 원문 URL 해석 + 본문 추출 ────────────────────────────
// Google 뉴스 RSS 링크(news.google.com/rss/articles/CBMi...)에는 실제 기사
// 주소가 base64(protobuf)로 들어있는 경우가 많습니다. 디코딩해 진짜 URL을
// 뽑아내면 "기사 전문 보기"가 구글 인터스티셜을 거치지 않고 바로 원문으로
// 이동하고, 본문 크롤링도 가능해집니다. 실패하면 원래 링크를 그대로 둡니다.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export function resolveGoogleNewsUrl(link) {
  try {
    const m = String(link).match(/news\.google\.com\/(?:rss\/)?articles\/([^?/]+)/);
    if (!m) return link;
    let b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const s = Buffer.from(b64, 'base64').toString('latin1');
    const um = s.match(/https?:\/\/[^\x00-\x1f"'<>\\ ]+/);
    if (um) {
      const url = um[0].replace(/[\x00-\x1f].*$/, '');
      if (!/google\.com/.test(url)) return url;
    }
  } catch {}
  return link;
}

function metaContent(html, key) {
  const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']+)["']`, 'i');
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${key}["']`, 'i');
  const m = html.match(re1) || html.match(re2);
  return m ? decodeEntities(m[1]) : '';
}

const BOILER_RE = /구독|로그인|회원가입|저작권|무단전재|재배포 금지|all rights reserved|cookie|쿠키|광고|subscribe|sign in|newsletter|관련 기사|기자\s*$/i;
export function extractReadable(html) {
  if (!html) return '';
  const lead = metaContent(html, 'og:description') || metaContent(html, 'description');
  const h = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
  const ps = [...h.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map(m => stripTags(m[1]))
    .filter(s => s.length > 40 && !BOILER_RE.test(s));
  let combined = `${lead} ${ps.join(' ')}`.replace(/\s+/g, ' ').trim();
  return combined.slice(0, 8000);          // 기사 본문 전체(거의)를 담아 상세화면에서 바로 읽도록
}

async function fetchArticleText(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko,en;q=0.8' }, redirect: 'follow', signal: AbortSignal.timeout(12000) });
    if (!res.ok) return '';
    const ct = res.headers.get('content-type') || '';
    if (!/text|html/i.test(ct)) return '';
    return extractReadable(await res.text());
  } catch { return ''; }
}

function extractiveSummary(text) {
  const s = (text || '')
    .split(/(?<=[.!?。])\s+|(?<=다\.)\s*/)
    .map(x => x.trim())
    .filter(x => x.length > 12);
  return s.slice(0, 3);
}

// ── RSS 파싱 + 기사 객체화 ───────────────────────────────
export function parseFeed(xml) {
  const items = [];
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];
  for (const b of blocks) {
    let title = stripTags(tag(b, 'title'));
    const link = stripTags(tag(b, 'link'));
    const pub = stripTags(tag(b, 'pubDate'));
    const desc = stripTags(tag(b, 'description'));
    const srcM = b.match(/<source[^>]*>([\s\S]*?)<\/source>/i);
    let source = srcM ? stripTags(srcM[1]) : '';
    const dash = title.lastIndexOf(' - ');
    if (dash > 0 && !source) source = title.slice(dash + 3).trim();
    if (dash > 0) title = title.slice(0, dash).trim();
    if (!title || !link) continue;
    items.push({ title, link, pub, desc, source: source || '출처 미상' });
  }
  return items;
}

const isForeignGP = (text) => FOREIGN_GPS.some(([re]) => re.test(text));
const isKoreanLP  = (text) => KOREAN_LPS.some(([re]) => re.test(text));
export function isRelevant(raw) {
  const text = `${raw.title} ${raw.desc}`;
  if (EXCLUDE_RE.test(text)) return false;            // 상장주식·시황·리테일 잡음 제거
  if (!ALT_RE.test(text)) return false;               // 대체투자 자산군 신호
  if (!FUND_RE.test(text)) return false;              // 펀드·출자·운용 맥락 (운영회사 뉴스 배제)
  return GLOBAL_RE.test(text) || isForeignGP(text) || isKoreanLP(text);
}

export function enrich(raw) {
  const text = `${raw.title} ${raw.desc}`;
  const lang = hasHangul(raw.title) ? 'ko' : 'en';
  const instHit = pickInst(text);
  const inst = instHit ? instHit.inst : raw.source;
  const instType = instHit ? instHit.instType : '기타';
  const asset = pick(ASSETS, text, 'PE');
  const region = pick(REGIONS, text, 'GL');
  let cat = instType === '해외 GP' ? 'GP' : 'LP';
  if (PEOPLE_RE.test(text) || ORG_RE.test(text)) cat = '인사';   // 조직/인사 변경
  const { date, time, iso } = kstParts(raw.pub);
  const sentences = extractiveSummary(raw.desc || raw.title);
  return {
    id: hashId(raw.link),
    cat, inst, instType, asset, region,
    date, time, ts: iso, source: raw.source, lang,
    ko: raw.title,
    en: lang === 'en' ? raw.title : '',
    metric: extractMetric(text) || '뉴스',
    metricLabel: '핵심 지표',
    ai: sentences.length ? sentences : [raw.title],
    body: raw.desc || raw.title,
    fetched: false,
    url: resolveGoogleNewsUrl(raw.link),
  };
}

function dedupe(list) {
  const seen = new Set(), out = [];
  for (const a of list) {
    const key = a.ko.slice(0, 50);
    if (seen.has(a.id) || seen.has(key)) continue;
    seen.add(a.id); seen.add(key); out.push(a);
  }
  return out;
}

async function fetchQuery(q) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=ko&gl=KR&ceid=KR:ko`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 KBGIS-collector' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseFeed(await res.text());
}

async function main() {
  if (process.argv.includes('--selftest')) return selftest();

  let all = [];
  for (const q of QUERIES) {
    try {
      const items = (await fetchQuery(q)).filter(isRelevant).map(enrich);
      all = all.concat(items);
    } catch (e) { console.warn('skip:', q, '-', e.message); }
  }
  all = dedupe(all);

  let prev = [];
  try { prev = JSON.parse(await readFile(new URL('../news.json', import.meta.url), 'utf8')); } catch {}
  // 보관된 과거 기사도 강화된 관련성 기준으로 다시 거릅니다(상장주식·국내 잡음 제거).
  // 단, (1) 수동 고정(pinned) 기사와 (2) 추적 대상 기관의 조직/인사 변경 뉴스는
  // 펀드 키워드가 없어도 보존합니다(예: 국민연금 '기금운용과' 신설).
  const before = prev.length;
  prev = prev.filter(p => {
    const txt = `${p.ko || ''} ${p.body || ''}`;
    if (p.pinned) return true;
    if ((PEOPLE_RE.test(txt) || ORG_RE.test(txt)) && p.instType && p.instType !== '기타' && p.inst && p.inst !== '출처 미상') return true;
    return isRelevant({ title: p.ko || '', desc: p.body || '' });
  });
  if (before !== prev.length) console.log(`archive re-filtered: ${before} -> ${prev.length}`);
  const prevById = new Map(prev.map(p => [p.id, p]));

  // 본문 크롤링 + 요약 패스. 이전 실행에서 이미 본문/요약을 확보한 기사는
  // 재사용해 매 실행마다 다시 긁지 않습니다(Actions 시간 절약).
  let fetchBudget = 110, llmBudget = LLM_BUDGET, fetched = 0, summarized = 0;
  for (const a of all) {
    const old = prevById.get(a.id);
    if (old && old.fetched) {                          // 과거에 확보한 본문/요약/번역 재사용
      a.body = old.body; a.fetched = true;
      a.ai = old.ai && old.ai.length ? old.ai : a.ai;
      if (old.aiSource) a.aiSource = old.aiSource;
      if (old.translated) { a.translated = true; a.ko = old.ko; a.en = old.en; a.enBody = old.enBody; }
      if (old.url && !/google\.com/.test(old.url)) a.url = old.url;
      continue;
    }
    if (fetchBudget <= 0) continue;
    fetchBudget--;
    const text = await fetchArticleText(a.url);
    if (text && text.length > 120) {                   // 진짜 본문 확보
      a.body = text;
      a.ai = extractiveSummary(text);
      a.fetched = true;
      fetched++;
      if (GEMINI_API_KEY && llmBudget > 0) {           // 본문 근거 LLM 요약/번역 (본문 있을 때만)
        if (a.lang === 'en') {                         // 영문 → 한글 번역 + 요약
          const r = await translateAndSummarize(a.ko, a.body);
          if (r) {
            if (r.titleKo) { a.en = a.ko; a.ko = r.titleKo; }   // ko=한글 제목, en=원문 제목
            if (r.bodyKo)  { a.enBody = a.body; a.body = r.bodyKo; }
            if (r.summary && r.summary.length) a.ai = r.summary;
            a.aiSource = 'llm'; a.translated = true; llmBudget--; summarized++;
          }
        } else {                                        // 한국어 → 요약
          const s = await summarizeKo(a.ko, a.body);
          if (s) { a.ai = s; a.aiSource = 'llm'; llmBudget--; summarized++; }
        }
      }
    }
  }
  console.log(`article bodies fetched: ${fetched}, LLM summaries: ${summarized}`);

  // 원문 본문을 확보한 기사를 우선 노출합니다. 다만 Google 뉴스 RSS·기사 사이트가
  // 통째로 봇차단(403)되어 단 한 건도 본문을 확보하지 못하는 환경에서는 피드를
  // 통째로 비우지 않고(과거엔 news.json 이 []로 초기화되는 버그가 있었음) 관련성
  // 필터를 통과한 RSS 기사라도 유지해 앱이 빈 화면이 되지 않게 합니다.
  // 최근 2개월(63일) 기사만 노출합니다. RSS 검색이 간혹 수년 전 기사를 섞어
  // 반환하므로 날짜 창으로 오래된 잡음을 걸러냅니다. (pinned 기사는 예외 보존)
  const WINDOW_MS = 63 * 24 * 3600 * 1000;
  const cutoff = Date.now() - WINDOW_MS;
  const inWindow = (a) => { if (a.pinned) return true; const t = Date.parse(a.ts); return !isNaN(t) && t >= cutoff; };
  const deduped = dedupe([...all, ...prev]).filter(inWindow);
  const fetchedOnly = deduped.filter(a => a.fetched);
  const merged = (fetchedOnly.length >= 10 ? fetchedOnly : deduped)
    .sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0))
    .slice(0, 500);
  await writeFile(new URL('../news.json', import.meta.url), JSON.stringify(merged, null, 0));
  console.log(`collected ${all.length} relevant, archive now ${merged.length} articles`);

  // CIO·자산군 수익률 인사이트 자동 갱신(insights.json). 기존 값은 새 추출이
  // 있을 때만 갱신해, 일시적으로 기사가 없어도 최근 정보가 사라지지 않게 합니다.
  let prevIns = { cios: [], assetReturns: [] };
  try { prevIns = JSON.parse(await readFile(new URL('../insights.json', import.meta.url), 'utf8')); } catch {}
  const fresh = buildInsights(merged);
  const mergeBy = (key, prevArr, newArr) => {
    const map = new Map((prevArr || []).map(x => [x[key], x]));
    for (const n of newArr) { const old = map.get(n[key]); if (!old || (n.ts || '') >= (old.ts || '')) map.set(n[key], n); }
    return [...map.values()].sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
  };
  const insights = {
    updatedAt: fresh.updatedAt,
    cios: mergeBy('inst', prevIns.cios, fresh.cios),
    assetReturns: mergeBy('asset', prevIns.assetReturns, fresh.assetReturns),
  };
  await writeFile(new URL('../insights.json', import.meta.url), JSON.stringify(insights, null, 0));
  console.log(`insights: ${insights.cios.length} CIO, ${insights.assetReturns.length} asset-returns`);
}

function selftest() {
  const sample = `<rss><channel>
    <item><title>국민연금, 미국 멀티패밀리 메자닌 대출에 5억 달러($500M) 추가 배정 - 한국경제</title>
      <link>https://example.com/a1</link><pubDate>Fri, 26 Jun 2026 08:12:00 GMT</pubDate>
      <description>&lt;a href="https://news.google.com/x"&gt;국민연금, 메자닌 대출 5억 달러 배정&lt;/a&gt;&amp;nbsp;&amp;nbsp;&lt;font color="#6f6f6f"&gt;한국경제&lt;/font&gt;</description>
      <source url="https://hankyung.com">한국경제</source></item>
    <item><title>Blackstone closes $10B global private credit fund - Bloomberg</title>
      <link>https://example.com/a2</link><pubDate>Thu, 25 Jun 2026 13:00:00 GMT</pubDate>
      <description>Blackstone held a final close on a $10 billion private credit fund.</description><source>Bloomberg</source></item>
    <item><title>군인공제회, 글로벌 항공기 리스 펀드에 2,000억 원 출자 - 더벨</title>
      <link>https://example.com/a3</link><pubDate>Wed, 24 Jun 2026 09:00:00 GMT</pubDate>
      <description>군인공제회가 글로벌 항공기 금융 펀드에 출자했다.</description><source>더벨</source></item>
    <item><title>국내 데이터센터 분양 임박, 청약 시작 - IT조선</title>
      <link>https://example.com/a4</link><pubDate>Wed, 24 Jun 2026 16:00:00 GMT</pubDate>
      <description>국내 데이터센터 분양이 시작된다.</description><source>IT조선</source></item>
  </channel></rss>`;
  const parsed = parseFeed(sample);
  const kept = parsed.filter(isRelevant).map(enrich);
  for (const a of kept) {
    console.log(`- [${a.cat}] ${a.inst}(${a.instType}) ${a.asset}/${a.region} metric="${a.metric}"`);
    console.log(`    ko: ${a.ko}`);
  }
  const a1 = kept[0], a2 = kept[1], a3 = kept[2];
  const ok = parsed.length === 4 && kept.length === 3          // 국내 데이터센터 분양 기사는 제외(해외 맥락X + 분양 잡음)
    && a1.inst === '국민연금' && a1.asset === 'PC' && a1.region === 'US' && a1.metric === '$500M'
    && !/[<>]/.test(a1.body) && !/&nbsp;|&lt;/.test(a1.body)    // HTML/엔티티 완전 제거
    && a2.inst === 'Blackstone' && a2.cat === 'GP' && a2.instType === '해외 GP'  // 글로벌 GP는 지역어 없어도 통과
    && a3.inst === '군인공제회' && a3.asset === 'AV' && a3.instType === '공제회';

  // CIO·수익률 추출 자가 테스트
  const cio1 = extractCio('국민연금 기금이사에 홍길동 한국은행 출신 선임');   // 직함 앞 기관=국민연금, 이름=홍길동
  const cio2 = extractCio('국민연금, 차기 CIO 공개 모집…25일까지 후보 접수'); // 공모 진행
  const ret1 = extractReturn('국민연금 대체투자 수익률 12.3% 기록');          // 대체투자 12.3%
  const ok2 = cio1 && cio1.inst === '국민연금' && cio1.person === '홍길동' && cio1.background === '한국은행' && cio1.status === '선임'
    && cio2 && cio2.status === '공모·인선 진행'
    && ret1 && ret1.asset === 'ALT' && ret1.value === 12.3;
  console.log(`extract: cio1=${JSON.stringify(cio1)} cio2.status=${cio2 && cio2.status} ret1=${JSON.stringify(ret1)}`);
  console.log((ok && ok2) ? '\nSELFTEST PASS' : '\nSELFTEST FAIL');
  if (!(ok && ok2)) process.exit(1);
}

if (process.argv[1] && process.argv[1].endsWith('collect-news.mjs')) {
  main().catch(e => { console.error(e); process.exit(1); });
}
