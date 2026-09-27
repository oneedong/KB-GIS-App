"use strict";
// @ts-nocheck
/*
 * KB GIS — 해외대체투자 용어 사전 + 개념 도식
 *
 * 처음 보는 사람도 기사를 읽으며 개념을 익힐 수 있도록 용어마다
 *   short  : 한 줄 정의
 *   body   : 쉬운 설명 (해요체)
 *   ex     : 실제 상황 예시
 *   dia    : 개념 도식(아래 DIAGRAMS) 키
 *   rel    : 함께 보면 좋은 용어
 * 를 둔다. aliases 는 기사 본문에서 용어를 찾아 밑줄·해설을 붙일 때 쓰는 패턴이다.
 * 수치 예시는 이해를 돕기 위한 가상의 숫자이며 특정 펀드의 실제 조건이 아니다.
 *
 * ui.tsx 다음, app.tsx 앞에 로드된다(전역 KB·F·Ico 사용).
 */
const GLOSSARY_CATS = [
    ['fund', '펀드 구조'],
    ['flow', '자금 흐름·보수'],
    ['perf', '성과 지표'],
    ['strategy', '투자 전략'],
    ['credit', '크레딧·구조화'],
    ['real', '부동산·인프라·항공'],
    ['macro', '금리·환헤지'],
];
const GLOSSARY = [
    // ── 펀드 구조 ──
    { id: 'lp', cat: 'fund', term: 'LP (유한책임투자자)', en: 'Limited Partner', aliases: /\bLPs?\b|유한\s*책임\s*(?:사원|투자자)/,
        short: '펀드에 돈을 대는 투자자. 연기금·공제회·보험사 등이 여기에 해당해요.',
        body: '펀드에 자금을 약정하지만 운용에는 관여하지 않는 투자자예요. 손실 책임이 출자한 금액까지로 한정되기 때문에 ‘유한책임’이라고 불러요. 국내 기관이 해외 펀드에 들어가면 그 펀드의 LP가 됩니다.',
        ex: '교직원공제회가 Blackstone 부동산 펀드에 1억 달러를 약정하면, 교직원공제회는 그 펀드의 LP예요.',
        dia: 'structure', rel: ['gp', 'commitment', 'capital_call'] },
    { id: 'gp', cat: 'fund', term: 'GP (운용사)', en: 'General Partner', aliases: /\bGPs?\b(?![-\s]*(?:led|주도|지분|stake))|무한\s*책임\s*사원/,
        short: '펀드를 만들고 투자처를 골라 운용하는 회사예요.',
        body: '펀드를 설립해 돈을 모으고, 투자 대상을 찾아 사고·관리하고·팔아서 수익을 돌려주는 역할이에요. Blackstone·KKR·Apollo 같은 회사가 대표적이에요. GP도 보통 펀드 약정액의 1~3%를 직접 넣어(GP 커밋) LP와 이해관계를 맞춰요.',
        ex: 'KKR이 인프라 펀드를 조성해 전 세계 연기금에서 자금을 모으면 KKR이 GP, 연기금들이 LP예요.',
        dia: 'structure', rel: ['lp', 'mgmt_fee', 'carry'] },
    { id: 'blind', cat: 'fund', term: '블라인드펀드', en: 'Blind Pool Fund', aliases: /블라인드\s*(?:펀드|PEF)?|blind[- ]pool/,
        short: '투자처를 정하기 전에 먼저 돈을 모으는 펀드예요.',
        body: '투자 대상이 정해지지 않은(‘눈을 가린’) 상태에서 GP의 전략과 과거 성과를 믿고 약정하는 펀드예요. LP는 개별 딜을 고를 수 없는 대신 여러 자산에 분산된 포트폴리오를 얻어요. 대부분의 해외 사모펀드가 이 방식이에요.',
        ex: '“바이아웃 전략으로 북미 중견기업 10~15곳에 투자하겠다”는 설명만 보고 약정하는 경우예요.',
        rel: ['project', 'mandate', 'coinvest'] },
    { id: 'project', cat: 'fund', term: '프로젝트펀드', en: 'Project Fund', aliases: /프로젝트\s*펀드|deal[- ]by[- ]deal/,
        short: '투자할 대상을 먼저 정해 두고 그 한 건을 위해 모으는 펀드예요.',
        body: '특정 자산(예: 런던 오피스 빌딩 한 채)이 정해진 뒤 그 딜을 위해 자금을 모아요. LP가 투자처를 직접 보고 판단할 수 있지만, 한 자산에 집중되어 분산 효과는 작아요.',
        ex: '국내 증권사가 미국 물류센터 한 곳을 인수하려고 기관들을 모아 만드는 펀드가 대표적이에요.',
        rel: ['blind', 'coinvest'] },
    { id: 'commitment', cat: 'fund', term: '약정 (커밋먼트)', en: 'Commitment', aliases: /약정(?!서)|커밋먼트|커밋|commitments?\b/,
        short: '“이만큼까지 내겠다”고 약속한 총액이에요.',
        body: 'LP가 펀드에 들어갈 때 한 번에 돈을 보내지 않고, 최대 얼마까지 내겠다고 약속만 해요. 실제 돈은 GP가 투자할 때마다 필요한 만큼 나눠서 청구(캐피탈콜)해요. 그래서 약정액과 실제 납입액은 달라요.',
        ex: '1억 달러를 약정했어도 첫해에는 2천만 달러만 캐피탈콜로 납입할 수 있어요.',
        dia: 'flow', rel: ['capital_call', 'dry_powder', 'distribution'] },
    { id: 'capital_call', cat: 'flow', term: '캐피탈콜', en: 'Capital Call / Drawdown', aliases: /캐피탈\s*콜|capital calls?|drawdowns?|출자\s*요청|자금\s*요청/,
        short: 'GP가 투자할 때 LP에게 약정액의 일부를 보내 달라고 청구하는 것이에요.',
        body: '투자 대상이 생기면 GP가 LP에게 “약정액의 몇 %를 며칠까지 보내 달라”는 통지(Capital Call Notice)를 보내요. LP는 보통 10영업일 안팎에 납입해야 해서, 기관들은 언제 콜이 올지 예상해 유동성을 관리해요.',
        ex: '약정 1억 달러, 콜 비율 15%면 이번에 1,500만 달러를 납입해요.',
        dia: 'flow', rel: ['commitment', 'distribution', 'sub_line'] },
    { id: 'distribution', cat: 'flow', term: '분배', en: 'Distribution', aliases: /분배(?:금|\s*통지)?|distributions?\b/,
        short: '투자 자산을 팔거나 이자·배당이 들어오면 LP에게 돈을 돌려주는 것이에요.',
        body: '보유 자산을 매각(회수)하거나 운영 수익이 생기면 GP가 정해진 순서(워터폴)에 따라 LP에게 돈을 돌려줘요. 원금 반환분과 수익분이 섞여 있고, 통지서(Distribution Notice)에 구분해 적혀 와요.',
        ex: '물류센터를 팔아 5,000만 달러가 들어오면 각 LP 지분율대로 나눠 분배해요.',
        dia: 'waterfall', rel: ['waterfall', 'dpi', 'capital_call'] },
    { id: 'dry_powder', cat: 'fund', term: '드라이파우더', en: 'Dry Powder', aliases: /드라이\s*파우더|dry powder|미집행\s*(?:약정|자금)/,
        short: '약정은 받았지만 아직 투자하지 않은 자금이에요.',
        body: '펀드가 모은 약정액 중 아직 캐피탈콜로 쓰이지 않은 금액이에요. 시장 전체의 드라이파우더가 많다는 건 “사고 싶은 돈”이 많이 대기하고 있다는 뜻이라, 자산 가격을 받쳐 주는 요인으로 봐요.',
        ex: '10억 달러 펀드가 3억 달러를 투자했다면 드라이파우더는 약 7억 달러예요.',
        rel: ['commitment', 'investment_period'] },
    { id: 'vintage', cat: 'perf', term: '빈티지', en: 'Vintage Year', aliases: /빈티지|vintage/,
        short: '펀드가 처음 투자를 시작한 해예요.',
        body: '와인처럼 “몇 년산”을 구분하는 말이에요. 같은 해에 시작한 펀드끼리 비슷한 시장 환경을 겪기 때문에, 성과는 같은 빈티지끼리 비교하는 것이 공정해요.',
        ex: '2021년 빈티지 펀드는 고평가 시기에 투자해 성과가 낮은 편이라는 분석이 많아요.',
        rel: ['irr', 'jcurve'] },
    { id: 'investment_period', cat: 'fund', term: '투자기간 · 만기', en: 'Investment Period / Term', aliases: /투자\s*기간|investment period|펀드\s*만기|만기\s*연장/,
        short: '새 투자를 할 수 있는 기간과 펀드가 끝나는 시점이에요.',
        body: '보통 사모펀드는 만기 10년에 앞 4~5년이 투자기간이에요. 투자기간이 끝나면 새 투자는 멈추고 보유 자산을 키워 파는(회수) 단계로 넘어가요. 회수가 늦어지면 LP 동의를 받아 1~2년씩 연장하기도 해요.',
        ex: '“투자기간 5년 + 만기 10년 + 1년씩 2회 연장 가능” 같은 조건이 흔해요.',
        dia: 'lifecycle', rel: ['vintage', 'cv'] },
    { id: 'closing', cat: 'fund', term: '클로징 (1차·파이널)', en: 'First / Final Close', aliases: /(?:퍼스트|1차|파이널|최종|중간)\s*클로(?:징|즈)|클로징|first close|final close|interim close/,
        short: '펀드 모집을 단계별로 마감하는 것이에요.',
        body: '펀드는 한 번에 다 모으지 않고, 첫 투자자들이 모이면 1차 클로징을 해서 운용을 시작해요. 이후 투자자를 더 받아 마지막으로 모집을 끝내는 게 파이널 클로징이에요. 파이널 클로징 금액이 그 펀드의 최종 규모예요.',
        ex: '“Blackstone, 부동산 펀드 300억 달러로 파이널 클로징” = 모집을 300억 달러로 끝냈다는 뜻이에요.',
        dia: 'lifecycle', rel: ['hard_cap', 'commitment'] },
    { id: 'hard_cap', cat: 'fund', term: '하드캡', en: 'Hard Cap', aliases: /하드\s*캡|hard[- ]cap/,
        short: '펀드가 받을 수 있는 최대 모집 한도예요.',
        body: 'GP가 전략상 감당할 수 있는 규모를 넘지 않도록 정한 상한이에요. 목표액(타깃)보다 조금 높게 잡고, “하드캡으로 마감”했다면 수요가 넘쳐 한도까지 채웠다는 좋은 신호예요.',
        ex: '목표 50억 달러, 하드캡 60억 달러 펀드가 60억 달러에 마감하면 초과 수요가 있었던 거예요.',
        rel: ['closing'] },
    { id: 'mgmt_fee', cat: 'flow', term: '관리보수', en: 'Management Fee', aliases: /관리\s*보수|운용\s*보수|management fees?/,
        short: 'GP가 펀드 운용 대가로 매년 받는 고정 보수예요.',
        body: '투자기간에는 보통 약정액의 1.5~2%, 이후에는 투자 잔액 기준으로 조금 낮춰 받아요. 성과와 무관하게 나가는 비용이라, 초기 수익률이 마이너스로 보이는 J커브의 원인 중 하나예요.',
        ex: '약정 1억 달러 × 연 1.5% = 연 150만 달러가 관리보수예요.',
        dia: 'structure', rel: ['carry', 'jcurve'] },
    { id: 'carry', cat: 'flow', term: '성과보수 (캐리)', en: 'Carried Interest', aliases: /성과\s*보수|캐리드?\s*인터레스트|carried interest|\bcarry\b/,
        short: '약속한 기준 수익을 넘겼을 때 GP가 이익의 일부(보통 20%)를 가져가는 보수예요.',
        body: 'LP가 원금과 우선수익(허들)을 먼저 받은 뒤, 남는 이익의 일정 비율(사모펀드는 보통 20%, 크레딧은 10~15%)을 GP가 가져가요. GP가 좋은 성과를 내도록 만드는 핵심 장치예요.',
        ex: '펀드 이익이 1억 달러이고 조건을 충족하면 GP 성과보수는 약 2,000만 달러예요.',
        dia: 'waterfall', rel: ['hurdle', 'catchup', 'waterfall'] },
    { id: 'hurdle', cat: 'flow', term: '허들레이트 (우선수익률)', en: 'Hurdle / Preferred Return', aliases: /허들\s*레이트|허들|우선\s*수익(?:률)?|기준\s*수익률|preferred return|hurdle rate/i,
        short: 'GP가 성과보수를 받기 전에 LP에게 먼저 보장하는 최소 수익률이에요(보통 연 8%).',
        body: 'LP가 원금에 더해 연 8% 정도의 수익을 먼저 받아야 GP가 성과보수를 가져갈 수 있어요. 성과가 허들에 못 미치면 GP는 관리보수만 받아요.',
        ex: '허들 8%면 LP가 원금 + 연 8% 복리 수익을 받기 전까지 성과보수는 0이에요.',
        dia: 'waterfall', rel: ['carry', 'catchup'] },
    { id: 'catchup', cat: 'flow', term: '캐치업', en: 'GP Catch-up', aliases: /캐치\s*업|catch[- ]up/,
        short: '허들 이후 GP가 약속된 성과보수 비율을 ‘따라잡도록’ 먼저 받는 구간이에요.',
        body: 'LP가 허들까지 받은 뒤에는 한동안 이익의 대부분(예: 100% 또는 80%)이 GP에게 가요. GP 몫이 전체 이익의 20%가 되면 그 뒤로는 80:20으로 나눠요. 결과적으로 GP는 “전체 이익의 20%”를 받게 돼요.',
        ex: '허들까지 LP가 8을 받았다면, GP가 2를 받을 때까지 캐치업이 진행돼 8:2가 맞춰져요.',
        dia: 'waterfall', rel: ['hurdle', 'carry', 'waterfall'] },
    { id: 'waterfall', cat: 'flow', term: '워터폴 (분배 순서)', en: 'Distribution Waterfall', aliases: /워터폴|waterfall|분배\s*구조/,
        short: '회수한 돈을 누구에게 어떤 순서로 나눌지 정한 규칙이에요.',
        body: '물이 계단을 따라 내려가듯 ① 원금 반환 → ② 우선수익(허들) → ③ GP 캐치업 → ④ 나머지 80:20 분배 순서로 흘러가요. 펀드 전체 기준으로 계산하면 ‘유럽식’, 딜별로 계산하면 ‘미국식’이라고 불러요. 유럽식이 LP에게 더 유리해요.',
        ex: '100을 넣어 150을 회수했다면 100(원금)→허들분→캐치업→나머지 80:20 순서로 나눠요.',
        dia: 'waterfall', rel: ['hurdle', 'catchup', 'carry'] },
    { id: 'keyman', cat: 'fund', term: '키맨 조항', en: 'Key Person Clause', aliases: /키\s*맨|key[- ]?(?:man|person)/,
        short: '핵심 운용 인력이 떠나면 새 투자를 멈추는 LP 보호 조항이에요.',
        body: 'LP는 결국 ‘사람’을 보고 약정하기 때문에, 계약서에 지정한 핵심 인물이 퇴사하거나 업무에서 빠지면 투자기간을 자동 중단하고 LP가 계속 여부를 정하게 해요.',
        ex: '펀드 대표 파트너 2명 중 1명이 떠나면 키맨 이벤트가 발생해 신규 투자가 멈춰요.',
        rel: ['lpa', 'side_letter'] },
    { id: 'side_letter', cat: 'fund', term: '사이드레터', en: 'Side Letter', aliases: /사이드\s*레터|side letters?/,
        short: '특정 LP와만 따로 맺는 부속 합의서예요.',
        body: '본 계약(LPA)은 모든 LP에게 같지만, 큰 금액을 넣는 LP는 보수 할인·공동투자 우선권·보고 방식 같은 조건을 따로 받기도 해요. 다른 LP가 받은 좋은 조건을 나도 받게 하는 조항을 MFN(최혜국 대우)이라고 해요.',
        ex: '국내 연기금이 “원화 기준 보고서 제공, 관리보수 0.25%p 할인”을 사이드레터로 받는 경우예요.',
        rel: ['lpa', 'keyman'] },
    { id: 'lpa', cat: 'fund', term: 'LPA · PPM', en: 'LPA / PPM', aliases: /\bLPA\b|\bPPM\b|조합\s*규약|투자\s*설명서/,
        short: 'LPA는 펀드 계약서, PPM은 투자 설명서예요.',
        body: 'PPM(사모 투자설명서)은 GP가 전략·과거 성과·리스크를 설명하는 문서이고, LPA(Limited Partnership Agreement · 조합 계약)는 보수·분배·의사결정 등 권리와 의무를 정한 본 계약이에요. LP는 PPM으로 검토하고 LPA로 약정해요.',
        ex: '출자 심사 때 PPM으로 전략을 보고, 법무 검토는 LPA와 사이드레터를 중심으로 해요.',
        rel: ['side_letter', 'keyman'] },
    { id: 'mandate', cat: 'fund', term: '위탁운용사 선정 (출자사업)', en: 'Mandate / RFP', aliases: /위탁\s*운용사|출자\s*사업|운용사\s*선정|mandates?\b/,
        short: '국내 기관이 공고를 내고 돈을 맡길 운용사를 뽑는 절차예요.',
        body: '연기금·공제회는 “해외 인프라 블라인드펀드에 총 ○억 달러 출자” 같은 출자사업을 공고하고, 운용사 제안서를 받아 서류·PT 심사로 위탁운용사를 선정해요. 해외 GP 입장에서는 국내 자금을 받을 수 있는 핵심 기회라 placement 업무의 중심이에요.',
        ex: '교직원공제회가 해외 사모대출 출자사업에서 3곳을 최종 선정하는 식이에요.',
        rel: ['blind', 'placement'] },
    { id: 'placement', cat: 'fund', term: '플레이스먼트 에이전트', en: 'Placement Agent', aliases: /플레이스먼트|placement agents?|판매\s*대행/,
        short: '운용사를 대신해 투자자(LP)를 찾아 연결해 주는 중개인이에요.',
        body: '해외 GP가 한국 기관에 직접 접근하기 어렵기 때문에, 현지 네트워크를 가진 증권사·전문 회사가 펀드를 소개하고 실사·계약 과정을 돕고 성공보수를 받아요.',
        ex: '해외 GP의 펀드를 국내 공제회에 소개하고 약정이 성사되면 약정액의 일정 비율을 수수료로 받아요.',
        rel: ['mandate', 'lp'] },
    { id: 'evergreen', cat: 'fund', term: '에버그린·반개방형 펀드', en: 'Evergreen / Semi-liquid Fund', aliases: /에버그린|evergreen|semi[- ]liquid|반개방형|인터벌\s*펀드|interval fund/,
        short: '만기 없이 계속 돈을 받고, 정기적으로 일부 환매도 해 주는 펀드예요.',
        body: '일반 사모펀드는 10년 동안 돈이 묶이지만, 에버그린 펀드는 매달·분기마다 신규 자금을 받고 일정 한도(예: 분기 5%) 안에서 환매를 허용해요. 개인 부유층(프라이빗 웰스) 자금을 모으는 데 많이 써요. 환매 요청이 몰리면 한도 때문에 돈을 늦게 받을 수 있어요.',
        ex: 'Blackstone의 BREIT·BCRED가 대표적인 반개방형 상품이에요.',
        rel: ['nav', 'blind'] },
    { id: 'coinvest', cat: 'strategy', term: '공동투자 (코인베스트)', en: 'Co-investment', aliases: /코인베스트|공동\s*투자|co-?invest(?:ment)?s?/,
        short: 'LP가 펀드와 함께 특정 딜에 직접 추가로 투자하는 것이에요.',
        body: '펀드가 큰 딜을 할 때 일부를 LP에게 ‘함께 들어오라’고 제안해요. LP는 보수를 거의 안 내거나 적게 내면서 원하는 딜에 비중을 늘릴 수 있어 선호해요. 대신 딜을 빠르게 검토할 역량이 필요해요.',
        ex: 'KKR 인프라 펀드가 유럽 통신탑을 인수하며 국민연금에 5천만 달러 공동투자 기회를 주는 경우예요.',
        rel: ['blind', 'project'] },
    { id: 'fof', cat: 'strategy', term: '재간접 (펀드오브펀드)', en: 'Fund of Funds', aliases: /펀드\s*오브\s*펀드|재간접|fund of funds|\bFoFs?\b/,
        short: '여러 펀드에 나눠 투자하는 펀드예요.',
        body: '한 운용사가 여러 GP의 펀드를 골라 담아 분산 효과를 줘요. 작은 기관도 여러 해외 펀드에 접근할 수 있지만, 보수를 두 번(재간접 운용사 + 하위 펀드) 내는 단점이 있어요.',
        ex: '국내 기관이 Hamilton Lane·StepStone 같은 운용사의 재간접 펀드를 통해 여러 사모펀드에 투자해요.',
        rel: ['secondary', 'blind'] },
    { id: 'gp_stakes', cat: 'strategy', term: 'GP 지분투자', en: 'GP Stakes', aliases: /GP\s*지분|GP[- ]stakes?/,
        short: '펀드가 아니라 운용사(GP) 회사 자체의 지분을 사는 투자예요.',
        body: '운용사의 소수 지분을 사서 그 회사가 받는 관리보수·성과보수 일부를 나눠 받아요. 여러 펀드에서 나오는 보수가 꾸준해 채권처럼 안정적인 현금흐름을 기대할 수 있어요.',
        ex: 'Blue Owl이 중견 사모펀드 운용사 지분 15%를 사서 보수 수익을 나눠 받는 식이에요.',
        rel: ['gp', 'mgmt_fee'] },
    // ── 성과 지표 ──
    { id: 'irr', cat: 'perf', term: 'IRR (내부수익률)', en: 'Internal Rate of Return', aliases: /\bIRR\b|내부\s*수익률/,
        short: '돈이 들어가고 나온 ‘시점’까지 반영한 연평균 수익률이에요.',
        body: '같은 2배 수익이라도 3년 만에 벌었는지 10년 걸렸는지에 따라 가치가 달라요. IRR은 캐피탈콜·분배 시점을 모두 넣어 계산한 연 환산 수익률이라 사모펀드 성과 비교에 가장 많이 써요. 다만 빨리 일부를 돌려주면 IRR이 높게 나오는 점은 주의해야 해요.',
        ex: '100을 넣어 5년 뒤 200을 받으면 IRR은 약 14.9%예요.',
        rel: ['moic', 'tvpi', 'jcurve'] },
    { id: 'moic', cat: 'perf', term: 'MOIC (투자배수)', en: 'Multiple on Invested Capital', aliases: /\bMOIC\b|투자\s*배수|멀티플/,
        short: '넣은 돈의 몇 배를 돌려받았는지 보여 주는 숫자예요.',
        body: '회수했거나 회수할 가치 ÷ 투자한 돈이에요. 기간은 반영하지 않기 때문에 IRR과 함께 봐요. 딜 단위에서는 MOIC, 펀드 단위에서는 TVPI라는 말을 주로 써요.',
        ex: '100을 넣어 250이 되면 MOIC 2.5배예요.',
        dia: 'multiples', rel: ['irr', 'tvpi'] },
    { id: 'tvpi', cat: 'perf', term: 'TVPI · DPI · RVPI', en: 'Total / Distributed / Residual Value to Paid-in', aliases: /\bTVPI\b|\bDPI\b|\bRVPI\b/,
        short: '펀드 성과를 ‘이미 돌려받은 돈’과 ‘아직 남은 가치’로 나눠 보는 배수예요.',
        body: 'DPI = 지금까지 분배받은 돈 ÷ 납입한 돈(실제 현금), RVPI = 아직 보유 중인 자산 가치(NAV) ÷ 납입한 돈, TVPI = DPI + RVPI예요. 최근엔 “평가 이익 말고 실제로 돌려받았나”를 중시해 DPI가 특히 주목받아요.',
        ex: 'DPI 0.8배 + RVPI 0.7배 = TVPI 1.5배 → 넣은 돈의 80%는 이미 현금으로 받았어요.',
        dia: 'multiples', rel: ['moic', 'nav', 'distribution'] },
    { id: 'jcurve', cat: 'perf', term: 'J커브', en: 'J-Curve', aliases: /J\s*[-]?\s*커브|J-?curve|제이\s*커브/,
        short: '초기에는 수익률이 마이너스였다가 나중에 올라가는 사모펀드 특유의 모양이에요.',
        body: '초기에는 관리보수·거래 비용이 나가고 투자 자산은 아직 가치가 오르지 않아 누적 수익이 마이너스예요. 몇 년 뒤 자산 가치가 오르고 회수가 시작되면 플러스로 돌아서서 그래프가 알파벳 J 모양이 돼요.',
        ex: '보통 3~5년차에 누적 현금흐름이 바닥을 찍고 이후 회복해요.',
        dia: 'flow', rel: ['capital_call', 'mgmt_fee', 'irr'] },
    { id: 'nav', cat: 'perf', term: 'NAV (순자산가치)', en: 'Net Asset Value', aliases: /\bNAV\b|순자산\s*가치/,
        short: '펀드가 가진 자산을 지금 시점에 평가한 가치예요.',
        body: '아직 팔지 않은 투자 자산을 GP가 분기마다 평가한 금액에서 부채를 뺀 값이에요. 상장주식처럼 매일 가격이 나오지 않아 평가 방법·시점에 따라 달라질 수 있어요.',
        ex: '보유 기업 5곳의 평가액 합계가 8억 달러, 차입 1억 달러면 NAV는 7억 달러예요.',
        rel: ['tvpi', 'nav_loan', 'secondary'] },
    // ── 투자 전략 ──
    { id: 'buyout', cat: 'strategy', term: '바이아웃', en: 'Buyout', aliases: /바이\s*아웃|buy-?outs?|경영권\s*인수/,
        short: '기업의 경영권을 사서 가치를 높인 뒤 되파는 투자예요.',
        body: '지분 과반을 인수해 경영을 바꾸고(비용 절감·인수합병·해외 확장 등) 몇 년 뒤 매각하거나 상장해 차익을 내요. 인수 자금의 상당 부분을 대출로 조달하는 경우가 많아(LBO) 금리 수준에 민감해요.',
        ex: '사모펀드가 소프트웨어 회사를 인수해 5년간 키운 뒤 다른 회사에 파는 것이에요.',
        dia: 'stack', rel: ['growth', 'take_private', 'private_credit'] },
    { id: 'growth', cat: 'strategy', term: '그로스 투자', en: 'Growth Equity', aliases: /그로스\s*(?:캐피탈|에쿼티|투자|펀드)|growth equity/,
        short: '이미 돈을 버는 성장 기업에 소수 지분으로 투자하는 방식이에요.',
        body: '경영권은 가져가지 않고, 빠르게 크는 기업의 확장 자금을 대 줘요. 벤처보다 안정적이고 바이아웃보다 차입이 적어요.',
        ex: '매출이 빠르게 늘고 있는 핀테크 회사의 지분 20%를 사는 경우예요.',
        rel: ['buyout'] },
    { id: 'secondary', cat: 'strategy', term: '세컨더리', en: 'Secondaries', aliases: /세컨더리|secondar(?:y|ies)/,
        short: '이미 투자가 진행된 펀드 지분이나 자산을 사고파는 거래예요.',
        body: '사모펀드는 만기 전 돈을 빼기 어려워서, 급히 현금이 필요한 LP가 자기 지분을 할인해 파는 시장이 생겼어요(LP 주도). 반대로 GP가 좋은 자산을 더 오래 들고 가려고 새 펀드로 옮기는 거래도 있어요(GP 주도). 사는 쪽은 J커브를 건너뛰고 이미 투자된 자산을 볼 수 있어요.',
        ex: '국내 보험사가 보유한 해외 PE 펀드 지분을 NAV의 90%에 세컨더리 펀드에 파는 거래예요.',
        dia: 'secondary', rel: ['cv', 'nav', 'jcurve'] },
    { id: 'cv', cat: 'strategy', term: '컨티뉴에이션 펀드 (GP 주도 세컨더리)', en: 'Continuation Vehicle', aliases: /컨티뉴에이션|continuation (?:fund|vehicle)s?|GP[- ]?(?:led|주도)/,
        short: 'GP가 만기가 다가온 좋은 자산을 새 펀드로 옮겨 계속 운용하는 구조예요.',
        body: '기존 펀드 만기 때문에 팔아야 하지만 더 키울 여지가 있는 자산을, GP가 새로 만든 컨티뉴에이션 펀드로 옮겨요. 기존 LP는 현금을 받고 나가거나(매도) 새 펀드에 그대로 남을(롤오버) 수 있고, 새 투자자(세컨더리 펀드)가 자금을 대요.',
        ex: '10년 된 펀드의 알짜 기업 1곳을 새 펀드로 옮겨 3~5년 더 키우는 거래예요.',
        dia: 'secondary', rel: ['secondary', 'investment_period'] },
    { id: 'core_opp', cat: 'real', term: '코어 · 코어플러스 · 밸류애드 · 오퍼튜니스틱', en: 'Core / Core+ / Value-add / Opportunistic', aliases: /코어\s*플러스|밸류\s*애드|오퍼튜니스틱|core[- ]plus|value[- ]add|opportunistic/,
        short: '부동산·인프라 투자를 위험과 기대수익 수준으로 나눈 네 단계예요.',
        body: '코어는 안정적으로 임대료가 나오는 우량 자산(낮은 위험·낮은 수익), 코어플러스는 약간의 개선 여지가 있는 자산, 밸류애드는 리모델링·임차인 교체로 가치를 올리는 자산, 오퍼튜니스틱은 개발·부실자산처럼 위험이 큰 대신 높은 수익을 노리는 투자예요.',
        ex: '임차인이 꽉 찬 도심 오피스는 코어, 공실 많은 빌딩을 사서 고치는 건 밸류애드예요.',
        dia: 'spectrum', rel: ['cap_rate', 'infra'] },
    { id: 'take_private', cat: 'strategy', term: '테이크 프라이빗 (상장사 인수)', en: 'Take-private', aliases: /테이크\s*프라이빗|take[- ]private|자진\s*상장\s*폐지/,
        short: '상장사를 사들여 상장을 폐지하고 비상장으로 운영하는 거래예요.',
        body: '사모펀드가 주주들에게 프리미엄을 얹어 주식을 사고 상장을 폐지해요. 분기 실적 압박 없이 구조조정·장기 투자를 할 수 있다는 장점이 있어요.',
        ex: 'Blackstone이 상장 리츠를 주당 30% 프리미엄에 인수해 상장 폐지하는 경우예요.',
        rel: ['buyout'] },
    { id: 'distressed', cat: 'strategy', term: '스페셜 시추에이션 · 디스트레스드', en: 'Special Situations / Distressed', aliases: /스페셜\s*시추에이션|디스트레스드|distressed|special situations?/,
        short: '재무적으로 어려운 기업·자산에 싸게 투자해 회복 과정에서 수익을 내는 전략이에요.',
        body: '부도 위기 기업의 채권을 할인 매입하거나, 구조조정 과정에 새 자금을 대며 유리한 조건을 얻어요. 경기 침체기에 기회가 많아져요.',
        ex: '액면 100짜리 채권을 55에 사서 구조조정 후 85에 회수하는 식이에요.',
        rel: ['private_credit', 'seniority'] },
    // ── 크레딧·구조화 ──
    { id: 'private_credit', cat: 'credit', term: '사모대출 (프라이빗 크레딧)', en: 'Private Credit', aliases: /사모\s*대출|사모\s*신용|프라이빗\s*크레딧|private credit|private debt/,
        short: '은행 대신 펀드가 기업·자산에 직접 돈을 빌려주는 투자예요.',
        body: '은행 규제가 강해지면서 비어 있는 대출 수요를 사모펀드가 채우고 있어요. 대부분 변동금리(기준금리 + 가산금리)라 금리가 오르면 이자 수익도 늘어요. 주식형 사모펀드보다 수익은 낮지만 이자가 꾸준히 들어와 안정적이에요.',
        ex: '사모대출 펀드가 바이아웃 대상 기업에 SOFR + 5.5%로 3억 달러를 빌려주는 식이에요.',
        dia: 'stack', rel: ['direct_lending', 'unitranche', 'seniority'] },
    { id: 'direct_lending', cat: 'credit', term: '다이렉트 렌딩', en: 'Direct Lending', aliases: /다이렉트\s*렌딩|direct lending/,
        short: '사모대출 중에서도 중견기업에 선순위로 직접 빌려주는 가장 대표적인 형태예요.',
        body: '은행·채권시장을 거치지 않고 펀드가 기업과 직접 대출 조건을 협상해요. 주로 사모펀드가 인수한 중견기업(미들마켓)이 대상이고, 담보 순위가 높은 선순위 대출이라 손실 위험이 비교적 낮아요.',
        ex: 'Golub Capital·Ares 같은 운용사가 대표적인 다이렉트 렌딩 GP예요.',
        rel: ['private_credit', 'unitranche'] },
    { id: 'unitranche', cat: 'credit', term: '유니트랜치', en: 'Unitranche', aliases: /유니\s*트랜치|unitranche/,
        short: '선순위와 후순위 대출을 하나로 합친 단일 대출이에요.',
        body: '예전엔 은행 선순위 대출 + 메자닌을 따로 받았지만, 사모대출 펀드가 한 번에 묶어서 빌려줘요. 금리는 둘 사이 수준이고, 차주는 협상 상대가 하나라 절차가 빨라져요.',
        ex: '선순위 3억 + 후순위 1억 대신 유니트랜치 4억 달러를 한 펀드에서 받는 경우예요.',
        dia: 'stack', rel: ['direct_lending', 'seniority', 'mezz'] },
    { id: 'seniority', cat: 'credit', term: '선순위 · 후순위', en: 'Senior / Subordinated', aliases: /선순위|후순위|중순위|\bsenior\b|subordinated|\bjunior\b/,
        short: '문제가 생겼을 때 누가 먼저 돈을 돌려받는지의 순서예요.',
        body: '선순위는 먼저 상환받아 안전하지만 금리가 낮고, 후순위는 나중에 받아 위험한 대신 금리가 높아요. 가장 마지막이 주식(에쿼티)이에요. 이 층을 쌓은 모양을 ‘자본 구조(캐피털 스택)’라고 해요.',
        ex: '회사가 파산해 남은 가치가 70이면 선순위 대출 60을 먼저 갚고, 남는 10을 후순위가 가져가요.',
        dia: 'stack', rel: ['mezz', 'unitranche', 'ltv'] },
    { id: 'mezz', cat: 'credit', term: '메자닌', en: 'Mezzanine', aliases: /메자닌|mezzanine/,
        short: '선순위 대출과 주식 사이에 있는 중간 위험 자금이에요.',
        body: '건물의 중간층(메자닌)처럼 대출과 주식 사이에 자리해요. 후순위 대출·전환사채·우선주 등이 해당되고, 선순위보다 높은 금리에 주식 전환권 같은 추가 수익 장치가 붙기도 해요.',
        ex: '부동산 개발 사업에서 선순위 대출 60% 위에 메자닌 20%, 자기자본 20%를 넣는 구조예요.',
        dia: 'stack', rel: ['seniority', 'ltv'] },
    { id: 'abf', cat: 'credit', term: 'ABF (자산담보금융)', en: 'Asset-Based Finance', aliases: /\bABF\b|asset[- ](?:based|backed) finance|자산\s*담보\s*(?:금융|대출)/,
        short: '기업 신용이 아니라 대출채권·리스료 같은 ‘자산에서 나오는 현금흐름’을 담보로 하는 금융이에요.',
        body: '소비자 대출·자동차 할부·장비 리스·음원 저작권 같은 자산 묶음(풀)을 담보로 돈을 빌려줘요. 수많은 작은 자산에 분산돼 있어 한 곳이 부실해도 영향이 작고, 기업 대출과 다른 수익원이라 사모대출 안에서 분산 효과가 있어요.',
        ex: '유럽 은행이 가진 자동차 할부채권 10억 유로를 담보로 사모 크레딧 펀드가 선순위 자금을 대는 경우예요.',
        dia: 'abs', rel: ['abs', 'private_credit', 'seniority'] },
    { id: 'abs', cat: 'credit', term: 'ABS (자산유동화증권)', en: 'Asset-Backed Securities', aliases: /\bABS\b|자산\s*유동화\s*증권|asset[- ]backed securit(?:y|ies)/,
        short: '대출채권 같은 자산 묶음을 특수목적회사(SPV)에 넘기고 그 현금흐름으로 발행하는 증권이에요.',
        body: '은행이 가진 주택담보대출·카드채권 등을 SPV로 넘기면, SPV는 들어올 이자·원금을 근거로 여러 등급(트랜치)의 증권을 발행해요. 선순위 트랜치가 먼저 돈을 받고, 손실은 가장 아래 에쿼티 트랜치부터 떠안아요.',
        ex: '영국 주택담보대출 풀로 AAA 선순위·BBB 메자닌·에쿼티 세 층을 발행하는 RMBS가 대표적이에요.',
        dia: 'abs', rel: ['abf', 'clo', 'seniority'] },
    { id: 'clo', cat: 'credit', term: 'CLO (대출채권담보부증권)', en: 'Collateralized Loan Obligation', aliases: /\bCLOs?\b|대출\s*채권\s*담보부\s*증권/,
        short: '여러 기업 대출(레버리지론)을 묶어 등급별로 나눠 발행한 증권이에요.',
        body: '100~200개 기업 대출을 담아 AAA부터 에쿼티까지 트랜치로 나눠요. 원리는 ABS와 같고, 기초자산이 기업 대출이라는 점이 달라요. 레버리지론 시장의 가장 큰 매수자예요.',
        ex: '바이아웃 기업들의 선순위 대출 150개를 묶어 5억 달러 CLO를 발행하는 식이에요.',
        dia: 'abs', rel: ['abs', 'private_credit'] },
    { id: 'nav_loan', cat: 'credit', term: 'NAV 대출', en: 'NAV Financing', aliases: /NAV\s*(?:대출|론|loans?|lending|financing|facilit(?:y|ies))/,
        short: '펀드가 보유 자산의 가치(NAV)를 담보로 받는 대출이에요.',
        body: '투자가 거의 끝난 펀드가 보유 포트폴리오 가치를 담보로 돈을 빌려, 기존 기업에 추가 투자하거나 LP에게 먼저 분배해요. 매각이 어려운 시기에 유동성을 만드는 수단으로 쓰이지만, 레버리지가 늘어나는 점은 LP 입장에서 확인해야 해요.',
        ex: 'NAV 20억 달러 펀드가 NAV의 15%인 3억 달러를 빌려 LP에게 조기 분배하는 경우예요.',
        dia: 'fundfinance', rel: ['sub_line', 'nav'] },
    { id: 'sub_line', cat: 'credit', term: '서브스크립션 라인 (캐피탈콜 브릿지)', en: 'Subscription Credit Facility', aliases: /서브스크립션\s*(?:라인|파이낸싱|퍼실리티)|subscription (?:line|facility|financing)s?|캐피탈\s*콜\s*브릿지/,
        short: '펀드 초기에 LP의 ‘남은 약정’을 담보로 받는 단기 대출이에요.',
        body: 'GP가 딜 대금을 먼저 이 대출로 치르고, 나중에 캐피탈콜로 모아 갚아요. 콜 횟수를 줄이고 딜을 빨리 할 수 있지만, LP 돈이 늦게 들어가는 만큼 IRR이 높아 보이는 효과가 있어 공시를 확인해야 해요.',
        ex: '펀드가 은행에서 3개월짜리 2억 달러를 빌려 인수 대금을 내고, 분기 말에 캐피탈콜로 상환해요.',
        dia: 'fundfinance', rel: ['capital_call', 'nav_loan', 'irr'] },
    { id: 'ltv', cat: 'credit', term: 'LTV (담보인정비율)', en: 'Loan-to-Value', aliases: /\bLTV\b|담보\s*인정\s*비율|loan[- ]to[- ]value/,
        short: '담보 가치 대비 대출 금액의 비율이에요.',
        body: 'LTV가 낮을수록 담보 가격이 떨어져도 원금을 지킬 여유가 커요. 부동산 선순위 대출은 보통 LTV 50~65% 수준에서 이뤄져요.',
        ex: '1,000억 원 건물에 600억 원을 빌려주면 LTV 60%예요.',
        dia: 'stack', rel: ['seniority', 'mezz'] },
    { id: 'refinancing', cat: 'credit', term: '리파이낸싱', en: 'Refinancing', aliases: /리파이낸싱|refinanc(?:e|ing)/,
        short: '기존 대출을 새 대출로 갈아타는 것이에요.',
        body: '금리가 내려가거나 자산 가치가 올랐을 때 더 좋은 조건으로 갈아타 이자 부담을 줄이거나 자금을 추가로 확보해요. 만기에 리파이낸싱이 어려우면 매각 압박이 생겨요.',
        ex: '금리 7%로 빌린 대출을 5.5%짜리 새 대출로 바꾸는 경우예요.',
        rel: ['ltv', 'seniority'] },
    // ── 부동산·인프라·항공 ──
    { id: 'cap_rate', cat: 'real', term: '캡레이트', en: 'Cap Rate', aliases: /캡\s*레이트|cap rates?|자본\s*환원율/,
        short: '부동산의 연간 순영업소득(NOI)을 매입 가격으로 나눈 수익률이에요.',
        body: '가격 대비 임대 수익이 얼마나 나오는지 보여 줘요. 캡레이트가 낮을수록 비싸게 산 것이고, 금리가 오르면 투자자들이 더 높은 캡레이트를 요구해 부동산 가격이 내려가는 경향이 있어요.',
        ex: '연 NOI 50억 원 건물을 1,000억 원에 사면 캡레이트 5%예요.',
        rel: ['core_opp', 'ltv'] },
    { id: 'infra', cat: 'real', term: '인프라 투자 (브라운필드·그린필드)', en: 'Infrastructure', aliases: /브라운\s*필드|그린\s*필드|brownfield|greenfield/,
        short: '도로·발전소·통신탑·데이터센터처럼 필수 시설에 투자하는 것이에요.',
        body: '이미 운영 중인 시설(브라운필드)은 요금·계약으로 현금흐름이 안정적이고, 새로 짓는 시설(그린필드)은 건설 위험이 있지만 기대수익이 높아요. 물가 연동 요금 구조가 많아 인플레이션 방어 자산으로 꼽혀요.',
        ex: '운영 중인 유럽 풍력발전소 지분은 브라운필드, 새로 짓는 미국 데이터센터는 그린필드예요.',
        dia: 'spectrum', rel: ['core_opp', 'data_center'] },
    { id: 'data_center', cat: 'real', term: '데이터센터 투자', en: 'Data Centers', aliases: /데이터\s*센터|data cent(?:er|re)s?/,
        short: 'AI·클라우드 수요로 가장 빠르게 커지는 부동산·인프라 투자 분야예요.',
        body: '빅테크(하이퍼스케일러)와 장기 임대 계약을 맺어 수익이 안정적이지만, 전력 확보가 가장 큰 제약이에요. 부동산 펀드와 인프라 펀드 모두 투자하고, 개발형(그린필드)은 막대한 자금이 필요해 사모대출도 많이 쓰여요.',
        ex: '인프라 펀드가 하이퍼스케일러와 15년 임대 계약을 맺은 데이터센터 캠퍼스를 개발하는 경우예요.',
        rel: ['infra', 'core_opp'] },
    { id: 'lease', cat: 'real', term: '항공기 리스 (운용·금융리스)', en: 'Operating / Finance Lease', aliases: /운용\s*리스|금융\s*리스|오퍼레이팅\s*리스|operating leases?|finance leases?|세일\s*앤\s*리스백|sale[- ]and[- ]leaseback/,
        short: '항공사가 비행기를 사지 않고 빌려 쓰는 계약이에요.',
        body: '운용리스는 리스사(임대인·lessor)가 비행기를 소유하고 항공사가 몇 년 빌려 쓰는 방식으로, 잔존가치(나중 중고 가격) 위험을 리스사가 져요. 금융리스는 사실상 할부 구매로, 계약이 끝나면 항공사가 소유해요. 투자자는 리스료와 항공기 매각 가치로 수익을 내요.',
        ex: '리스사가 A321neo를 사서 항공사에 12년간 월 리스료를 받고 빌려주는 게 운용리스예요.',
        dia: 'lease', rel: ['abf', 'ltv'] },
    { id: 'reit', cat: 'real', term: '리츠', en: 'REITs', aliases: /리츠|\bREITs?\b/,
        short: '부동산에 투자해 임대 수익을 배당으로 나눠 주는 회사(펀드)예요.',
        body: '상장 리츠는 주식처럼 거래돼 유동성이 높고, 비상장 리츠는 사모펀드처럼 운용돼요. 이익의 대부분을 배당해야 하는 대신 법인세 혜택을 받아요.',
        ex: '미국 상장 물류 리츠 주식을 사면 물류센터 임대료를 배당으로 받는 셈이에요.',
        rel: ['cap_rate', 'core_opp'] },
    // ── 금리·환헤지 ──
    { id: 'sofr', cat: 'macro', term: 'SOFR', en: 'Secured Overnight Financing Rate', aliases: /\bSOFR\b/,
        short: '미국 달러 대출의 기준이 되는 하루짜리 금리예요.',
        body: '미 국채를 담보로 하루 동안 돈을 빌리는 시장에서 실제 거래된 금리예요. 과거 LIBOR를 대신해 사모대출·변동금리 대출 대부분이 ‘SOFR + 가산금리’로 이자를 정해요.',
        ex: '금리가 SOFR + 5.5%이고 SOFR가 3.6%면 대출 금리는 9.1%예요.',
        rel: ['private_credit', 'hedge'] },
    { id: 'hedge', cat: 'macro', term: '환헤지 · 스왑포인트', en: 'FX Hedge / Swap Point', aliases: /환\s*헤지|스왑\s*포인트|FX swaps?|외환\s*스왑|hedging cost/,
        short: '해외 자산 가치가 환율 때문에 흔들리지 않도록 미래 환율을 미리 고정하는 것이에요.',
        body: '달러 자산에 투자한 원화 투자자는 나중에 달러를 원화로 바꿀 때 환율이 떨어지면 손해를 봐요. 그래서 선물환·외환스왑으로 미래 환율을 고정하는데, 그 가격 차이(선물환율 − 현물환율)가 스왑포인트예요. 원화 금리가 달러보다 낮으면 헤지할 때 비용이 생겨요.',
        ex: '원화 2.75%, 달러 3.6%면 연 약 0.85%가 환헤지 비용으로 나가요.',
        dia: 'hedge', rel: ['sofr'] },
];
// 용어 → 빠른 조회
const GLOSSARY_BY_ID = Object.fromEntries(GLOSSARY.map((g) => [g.id, g]));
// 본문에서 용어 찾기 — 처음 등장 위치 순으로, 최대 limit 개
function findTerms(text, limit = 8) {
    const t = String(text || '');
    const hits = [];
    for (const g of GLOSSARY) {
        const m = t.match(g.aliases);
        if (m)
            hits.push({ g, idx: m.index });
    }
    return hits.sort((a, b) => a.idx - b.idx).slice(0, limit).map((h) => h.g);
}
// ─── 개념 도식 (SVG, 모바일 폭 360 기준 좌표) ───────────────────
// 글자 크기가 폰에서 그대로 읽히도록 좌표계를 휴대폰 폭에 맞췄다.
const D = {
    box: KB.band, line: '#D5D7DC', ink: KB.ink, sub: KB.sub, faint: '#9A9CA2', y: KB.yellow, yt: KB.yellowTint, g: KB.gray,
};
function Arrow({ id }) {
    return (React.createElement("defs", null,
        React.createElement("marker", { id: id, viewBox: "0 0 10 10", refX: "8.5", refY: "5", markerWidth: "7", markerHeight: "7", orient: "auto-start-reverse" },
            React.createElement("path", { d: "M0 0 L10 5 L0 10 z", fill: D.g }))));
}
const T = (x, y, s, o = {}) => React.createElement("text", { x: x, y: y, fontSize: o.size || 12, fontWeight: o.w || 500, fill: o.c || D.ink, textAnchor: o.a || 'middle', fontFamily: "Pretendard, sans-serif" }, s);
const Box = (x, y, w, h, o = {}) => React.createElement("rect", { x: x, y: y, width: w, height: h, rx: o.r == null ? 8 : o.r, fill: o.f || D.box, stroke: o.s || D.line, strokeWidth: o.sw || 1 });
const Ln = (x1, y1, x2, y2, id, o = {}) => React.createElement("line", { x1: x1, y1: y1, x2: x2, y2: y2, stroke: o.c || D.g, strokeWidth: o.w || 1.5, strokeDasharray: o.dash, markerEnd: id ? `url(#${id})` : undefined });
const DIAGRAMS = {
    // 1) 펀드 구조
    structure: { title: '사모펀드의 기본 구조', cap: 'LP는 돈을 대고(①), GP는 운용한다(②). 투자한 자산을 팔아 회수하면(③·④) 약속한 순서(워터폴)대로 LP에게 분배한다(⑤).', render: (k) => (React.createElement("svg", { viewBox: "0 0 360 312", width: "100%" },
            React.createElement(Arrow, { id: k }),
            Box(16, 14, 140, 58, { f: D.yt, s: D.y }),
            T(86, 38, 'LP (투자자)', { w: 700 }),
            T(86, 57, '연기금·공제회·보험사', { size: 10.5, c: D.sub }),
            Box(204, 14, 140, 58),
            T(274, 38, 'GP (운용사)', { w: 700 }),
            T(274, 57, 'Blackstone·KKR 등', { size: 10.5, c: D.sub }),
            Ln(98, 72, 140, 120, k),
            T(124, 92, '① 약정·캐피탈콜', { size: 10.5, c: D.g, a: 'start' }),
            Ln(262, 72, 220, 120, k),
            T(250, 110, '② 운용·투자 결정', { size: 10.5, c: D.g, a: 'start' }),
            React.createElement("path", { d: `M110 150 H40 V76`, fill: "none", stroke: D.y, strokeWidth: "2", strokeDasharray: "5 3", markerEnd: `url(#${k})` }),
            T(46, 112, '⑤ 분배', { size: 10.5, c: D.g, w: 700, a: 'start' }),
            Box(110, 122, 140, 52, { f: '#fff', s: D.g, sw: 1.5 }),
            T(180, 144, '펀드', { w: 700, size: 13 }),
            T(180, 163, 'Limited Partnership', { size: 10.5, c: D.sub }),
            Ln(162, 174, 162, 210, k),
            T(155, 197, '③ 투자', { size: 10.5, c: D.g, a: 'end' }),
            Ln(198, 210, 198, 176, k),
            T(205, 197, '④ 회수(매각·배당)', { size: 10.5, c: D.g, a: 'start' }),
            Box(22, 212, 98, 40),
            T(71, 237, '기업 A', { size: 11.5 }),
            Box(131, 212, 98, 40),
            T(180, 237, '부동산 B', { size: 11.5 }),
            Box(240, 212, 98, 40),
            T(289, 237, '인프라 C', { size: 11.5 }),
            T(180, 278, '분배 순서: LP 원금 → 우선수익 → GP 성과보수(캐리)', { size: 10.5, c: D.g, w: 600 }),
            T(180, 297, 'GP는 관리보수(연 1.5~2%)를 받고 약정의 1~3%를 직접 출자', { size: 10, c: D.sub }))) },
    // 2) 자금 흐름 + J커브 — 약정 100 기준 가상의 예시(총 납입 95, 총 분배 150)
    flow: { title: '캐피탈콜·분배와 J커브', cap: '막대는 해마다 오간 돈(아래 파랑: LP가 낸 캐피탈콜, 위 노랑: 돌려받은 분배), 검은 선은 그 누적 합계예요. 투자 초기엔 돈이 나가기만 해 누적이 마이너스로 파였다가, 회수가 시작되면 J 모양으로 올라와 0을 넘어서요. (약정 100 기준 가상의 예시)', render: (k) => {
            const calls = [-22, -25, -20, -13, -8, -4, -2, -1, 0, 0];
            const dists = [0, 0, 3, 8, 15, 24, 30, 30, 24, 16];
            const Z = 126, S = 1.3; // 0선 위치 · 1단위당 픽셀
            const X = (i) => 62 + i * 29; // 연차 중심
            const Y = (v) => Z - v * S;
            let cum = 0;
            const cums = calls.map((c, i) => (cum += c + dists[i]));
            const low = cums.indexOf(Math.min(...cums));
            const be = cums.findIndex((v) => v > 0); // 누적이 처음 0을 넘는 해
            const bx = X(be - 1) + 29 * (-cums[be - 1] / (cums[be] - cums[be - 1]));
            const pts = cums.map((v, i) => `${X(i)},${Y(v)}`).join(' ');
            const tick = (v) => React.createElement("g", { key: 'y' + v },
                React.createElement("line", { x1: "46", y1: Y(v), x2: "348", y2: Y(v), stroke: v === 0 ? D.g : D.line, strokeWidth: v === 0 ? 1.2 : 1, strokeDasharray: v === 0 ? undefined : '3 3' }),
                T(40, Y(v) + 4, v > 0 ? '+' + v : v === 0 ? '0' : '−' + (-v), { size: 10, c: D.sub, a: 'end' }));
            return (React.createElement("svg", { viewBox: "0 0 360 300", width: "100%" },
                React.createElement("rect", { x: "16", y: "10", width: "11", height: "11", rx: "2", fill: "#9DB6E8" }),
                T(32, 20, '캐피탈콜(납입)', { size: 10.5, a: 'start', c: D.sub }),
                React.createElement("rect", { x: "122", y: "10", width: "11", height: "11", rx: "2", fill: D.y }),
                T(138, 20, '분배(회수)', { size: 10.5, a: 'start', c: D.sub }),
                React.createElement("line", { x1: "210", y1: "15.5", x2: "228", y2: "15.5", stroke: D.ink, strokeWidth: "2.4" }),
                T(233, 20, 'LP 누적 순현금흐름', { size: 10.5, a: 'start', c: D.sub }),
                [50, -50].map(tick),
                React.createElement("line", { x1: (X(4) + X(5)) / 2, y1: "36", x2: (X(4) + X(5)) / 2, y2: "200", stroke: D.line, strokeWidth: "1" }),
                T((X(0) + X(4)) / 2, 44, '투자기간 · 돈이 나감', { size: 10, c: D.faint }),
                T((X(5) + X(9)) / 2, 44, '회수기간 · 돈이 돌아옴', { size: 10, c: D.faint }),
                calls.map((c, i) => c < 0 && React.createElement("rect", { key: 'c' + i, x: X(i) - 7, y: Z, width: 14, height: -c * S, rx: "1.5", fill: "#9DB6E8" })),
                dists.map((d, i) => d > 0 && React.createElement("rect", { key: 'd' + i, x: X(i) - 7, y: Y(d), width: 14, height: d * S, rx: "1.5", fill: D.y })),
                tick(0),
                React.createElement("polyline", { points: pts, fill: "none", stroke: D.ink, strokeWidth: "2.4", strokeLinejoin: "round" }),
                cums.map((v, i) => React.createElement("circle", { key: i, cx: X(i), cy: Y(v), r: i === low ? 4 : 2.8, fill: i === low ? D.ink : '#fff', stroke: D.ink, strokeWidth: "1.8" })),
                T(X(low) + 10, Y(cums[low]) + 16, `바닥 −${-cums[low]} (${low + 1}년차)`, { size: 10.5, w: 700, a: 'start' }),
                React.createElement("circle", { cx: bx, cy: Z, r: "4.5", fill: D.y, stroke: D.ink, strokeWidth: "1.8" }),
                T(348, Z + 34, `누적 0 돌파 (${be}~${be + 1}년차)`, { size: 10.5, w: 700, a: 'end' }),
                T(X(9) + 8, Y(cums[9]) + 4, `+${cums[9]}`, { size: 10.5, w: 700, a: 'start' }),
                calls.map((_, i) => React.createElement("g", { key: 'x' + i }, T(X(i), 250, `${i + 1}년`, { size: 10, c: D.sub }))),
                T(180, 272, `총 납입 ${-calls.reduce((a, b) => a + b, 0)} · 총 분배 ${dists.reduce((a, b) => a + b, 0)} → 최종 누적 +${cums[9]} (DPI ${(dists.reduce((a, b) => a + b, 0) / -calls.reduce((a, b) => a + b, 0)).toFixed(2)}배)`, { size: 10.5, c: D.g, w: 600 }),
                T(180, 290, '초기 마이너스는 관리보수·투자 집행 때문 — 성과가 나빠서가 아니다', { size: 10, c: D.sub })));
        } },
    // 3) 워터폴
    waterfall: { title: '분배 워터폴 (유럽식 예시)', cap: '회수한 돈은 위에서부터 차례로 채워진다. 윗단이 다 채워져야 아랫단으로 흘러간다.', render: (k) => (React.createElement("svg", { viewBox: "0 0 360 318", width: "100%" },
            React.createElement(Arrow, { id: k }),
            [
                ['① 원금 반환', 'LP가 낸 돈을 100% 먼저 돌려준다', 'LP 100%', D.yt, D.y],
                ['② 우선수익(허들)', '원금에 연 8% 수익이 될 때까지', 'LP 100%', D.yt, D.y],
                ['③ GP 캐치업', 'GP 몫이 전체 이익의 20%가 될 때까지', 'GP 80~100%', D.box, D.line],
                ['④ 잔여 이익 분배', '남는 이익을 나눈다', 'LP 80 : GP 20', '#fff', D.g],
            ].map(([h, d, sp, f, s], i) => (React.createElement("g", { key: i },
                Box(20 + i * 12, 14 + i * 74, 320 - i * 24, 56, { f, s }),
                T(36 + i * 12, 38 + i * 74, h, { a: 'start', w: 700, size: 12.5 }),
                T(36 + i * 12, 57 + i * 74, d, { a: 'start', size: 10.5, c: D.sub }),
                T(326 - i * 12, 48 + i * 74, sp, { a: 'end', w: 700, size: 11.5, c: D.g }),
                i < 3 && Ln(180, 70 + i * 74, 180, 86 + i * 74, k)))))) },
    // 4) 자본 구조
    stack: { title: '자본 구조 (캐피털 스택)', cap: '아래일수록 먼저 돌려받아 안전하고 금리가 낮다. 위로 갈수록 위험과 기대수익이 커진다.', render: (k) => (React.createElement("svg", { viewBox: "0 0 360 290", width: "100%" },
            React.createElement(Arrow, { id: k }),
            [
                ['보통주 (에쿼티)', '가장 마지막에 받음 · 상승 여력 무제한', '20%+', '#fff', D.g],
                ['우선주 (Preferred Equity)', '대출보다 뒤, 보통주보다 먼저', '13~16%', D.box, D.line],
                ['후순위·메자닌 대출', '선순위 다음 상환 · 전환권이 붙기도', '11~13%', D.box, D.line],
                ['선순위 대출', '가장 먼저 상환 · 담보 1순위', 'SOFR+5%', D.yt, D.y],
            ].map(([h, d, r, f, s], i) => (React.createElement("g", { key: i },
                Box(20, 14 + i * 62, 250, 54, { f, s, r: 4 }),
                T(34, 37 + i * 62, h, { a: 'start', w: 700, size: 12.5 }),
                T(34, 56 + i * 62, d, { a: 'start', size: 10.5, c: D.sub }),
                T(258, 45 + i * 62, r, { a: 'end', w: 700, size: 11.5, c: D.g })))),
            Ln(310, 256, 310, 20, k, { w: 2 }),
            T(322, 140, '위험↑', { a: 'start', size: 11, w: 700, c: D.g }),
            T(322, 156, '수익↑', { a: 'start', size: 11, w: 700, c: D.g }),
            T(180, 282, '기대수익률은 이해를 돕기 위한 대략적 예시', { size: 10, c: D.sub }))) },
    // 5) 전략 스펙트럼
    spectrum: { title: '부동산·인프라 전략 스펙트럼', cap: '오른쪽으로 갈수록 가치를 ‘만들어서’ 버는 비중이 커지고, 위험과 목표수익도 높아진다. (수익률은 일반적 범위 예시)', render: (k) => (React.createElement("svg", { viewBox: "0 0 360 230", width: "100%" },
            React.createElement(Arrow, { id: k }),
            Ln(24, 196, 344, 196, k, { w: 1.6 }),
            Ln(24, 196, 24, 18, k, { w: 1.6 }),
            T(344, 214, '위험', { a: 'end', size: 11, c: D.g, w: 600 }),
            T(32, 22, '기대수익', { a: 'start', size: 11, c: D.g, w: 600 }),
            [
                ['코어', '안정 임대수익', '6~8%', 60, 160],
                ['코어플러스', '소폭 개선', '8~11%', 135, 126],
                ['밸류애드', '리모델링·임차인 교체', '11~15%', 212, 90],
                ['오퍼튜니스틱', '개발·부실자산', '15%+', 290, 54],
            ].map(([h, d, r, x, y], i) => (React.createElement("g", { key: i },
                React.createElement("circle", { cx: x, cy: y, r: 20 + i * 3, fill: i === 3 ? D.yt : D.box, stroke: i === 3 ? D.y : D.line }),
                T(x, y - 1, h, { w: 700, size: 11.5 }),
                T(x, y + 14, r, { size: 10.5, c: D.g, w: 600 }),
                T(x, y + 44 + i * 3, d, { size: 10, c: D.sub })))))) },
    // 6) 세컨더리
    secondary: { title: '세컨더리 거래의 두 가지 유형', cap: 'LP 주도: 투자자가 지분을 판다 · GP 주도: 운용사가 자산을 새 펀드(컨티뉴에이션)로 옮긴다.', render: (k) => (React.createElement("svg", { viewBox: "0 0 360 300", width: "100%" },
            React.createElement(Arrow, { id: k }),
            T(20, 20, 'LP 주도 (LP-led)', { a: 'start', w: 700, size: 12.5 }),
            Box(20, 32, 130, 50, { f: D.yt, s: D.y }),
            T(85, 54, '기존 LP', { w: 700 }),
            T(85, 71, '현금이 필요', { size: 10.5, c: D.sub }),
            Ln(150, 57, 208, 57, k),
            T(179, 49, '지분 매도', { size: 10.5, c: D.g }),
            T(179, 75, '(NAV 대비 할인)', { size: 10, c: D.sub }),
            Box(210, 32, 130, 50),
            T(275, 54, '세컨더리 펀드', { w: 700 }),
            T(275, 71, '지분 인수', { size: 10.5, c: D.sub }),
            T(20, 124, 'GP 주도 (GP-led · 컨티뉴에이션)', { a: 'start', w: 700, size: 12.5 }),
            Box(20, 138, 130, 50),
            T(85, 160, '기존 펀드', { w: 700 }),
            T(85, 177, '만기 임박', { size: 10.5, c: D.sub }),
            Ln(150, 163, 208, 163, k),
            T(179, 155, '알짜 자산 이전', { size: 10.5, c: D.g }),
            Box(210, 138, 130, 50, { f: '#fff', s: D.g, sw: 1.5 }),
            T(275, 160, '컨티뉴에이션 펀드', { w: 700, size: 11.5 }),
            T(275, 177, '같은 GP가 계속 운용', { size: 10.5, c: D.sub }),
            Ln(85, 188, 85, 230, k),
            Box(20, 232, 130, 52),
            T(85, 254, '기존 LP 선택', { w: 700, size: 11.5 }),
            T(85, 272, '현금화 또는 롤오버', { size: 10.5, c: D.sub }),
            Ln(275, 244, 275, 190, k),
            Box(210, 246, 130, 40, { f: D.yt, s: D.y }),
            T(275, 271, '신규 투자자 자금', { w: 700, size: 11.5 }))) },
    // 7) 성과 배수
    multiples: { title: 'TVPI = DPI + RVPI', cap: '같은 TVPI 1.5배라도 DPI가 높을수록 이미 현금으로 돌려받은 몫이 크다. (가상의 예시)', render: (k) => (React.createElement("svg", { viewBox: "0 0 360 220", width: "100%" },
            Ln(40, 176, 340, 176, null, { c: D.line, w: 1 }),
            [
                ['펀드 A', 0.3, 1.2],
                ['펀드 B', 0.8, 0.7],
                ['펀드 C', 1.3, 0.2],
            ].map(([n, dpi, rvpi], i) => {
                const x = 70 + i * 95, s = 90;
                return (React.createElement("g", { key: i },
                    React.createElement("rect", { x: x, y: 176 - dpi * s, width: 46, height: dpi * s, fill: D.y }),
                    React.createElement("rect", { x: x, y: 176 - (dpi + rvpi) * s, width: 46, height: rvpi * s, fill: "#C9CCD2" }),
                    T(x + 23, 170 - (dpi + rvpi) * s, `${(dpi + rvpi).toFixed(1)}x`, { w: 700, size: 12 }),
                    T(x + 23, 196, n, { size: 11.5, w: 600 }),
                    T(x + 23, 212, `DPI ${dpi}x`, { size: 10, c: D.g })));
            }),
            React.createElement("rect", { x: "40", y: "8", width: "10", height: "10", fill: D.y }),
            T(56, 17, 'DPI 돌려받은 현금', { size: 10.5, a: 'start', c: D.sub }),
            React.createElement("rect", { x: "186", y: "8", width: "10", height: "10", fill: "#C9CCD2" }),
            T(202, 17, 'RVPI 남은 평가가치', { size: 10.5, a: 'start', c: D.sub }))) },
    // 8) ABS/ABF 구조
    abs: { title: '자산 유동화 구조 (ABS·ABF)', cap: '자산에서 나온 현금은 선순위부터 채우고(위→아래), 손실은 에쿼티부터 떠안는다(아래→위).', render: (k) => (React.createElement("svg", { viewBox: "0 0 360 290", width: "100%" },
            React.createElement(Arrow, { id: k }),
            Box(14, 20, 100, 110, { f: D.box }),
            T(64, 44, '자산 풀', { w: 700 }),
            ['자동차 할부', '소비자 대출', '장비 리스', '카드 채권'].map((s, i) => React.createElement("g", { key: i }, T(64, 66 + i * 16, s, { size: 10.5, c: D.sub }))),
            Ln(114, 75, 148, 75, k),
            T(131, 66, '양도', { size: 10, c: D.g }),
            Box(150, 44, 64, 62, { f: '#fff', s: D.g, sw: 1.5 }),
            T(182, 72, 'SPV', { w: 700 }),
            T(182, 89, '특수목적회사', { size: 9.5, c: D.sub }),
            Ln(214, 75, 238, 75, k),
            [
                ['선순위', 'AAA · 먼저 상환', D.yt, D.y],
                ['메자닌', 'BBB · 중간', D.box, D.line],
                ['에쿼티', '마지막 · 첫 손실', '#fff', D.g],
            ].map(([h, d, f, s], i) => (React.createElement("g", { key: i },
                Box(240, 16 + i * 40, 106, 36, { f, s, r: 4 }),
                T(293, 31 + i * 40, h, { w: 700, size: 11.5 }),
                T(293, 45 + i * 40, d, { size: 9.5, c: D.sub })))),
            Ln(360 - 8, 26, 360 - 8, 128, k, { w: 1.4 }),
            T(180, 170, '현금흐름 우선순위', { w: 700, size: 12 }),
            T(180, 190, '이자·원금 → ① 선순위 → ② 메자닌 → ③ 에쿼티', { size: 11, c: D.g }),
            T(180, 222, '손실 흡수 순서', { w: 700, size: 12 }),
            T(180, 242, '부실 발생 → ① 에쿼티 → ② 메자닌 → ③ 선순위', { size: 11, c: D.g }),
            T(180, 274, 'ABF 펀드는 주로 선순위·메자닌에 투자하거나 풀을 직접 매입', { size: 10.5, c: D.sub }))) },
    // 9) 펀드 생애주기 — 0년 = 1차 클로징. 투자기간은 1차 클로징부터 시작해 모집 기간과 겹친다.
    lifecycle: { title: '펀드 생애주기 (예시)', cap: '1차 클로징과 함께 투자기간이 시작되고, 모집은 파이널 클로징까지 1년 남짓 이어진다. 투자기간(신규 투자) → 회수기간(가치 제고·매각) → 만기, 필요하면 LP 동의로 연장. 실제 기간은 펀드마다 다르다.', render: (k) => {
            const X = (yr) => 45 + yr * 25; // 0년 = 1차 클로징
            const bar = (a, b, y, h, f, s, t, d, i) => (React.createElement("g", { key: i },
                React.createElement("rect", { x: X(a), y: y, width: X(b) - X(a), height: h, rx: 4, fill: f, stroke: s }),
                T((X(a) + X(b)) / 2, y + (d ? 16 : h / 2 + 4), t, { w: 700, size: X(b) - X(a) < 60 ? 10.5 : 12 }),
                d && T((X(a) + X(b)) / 2, y + 31, d, { size: 9.5, c: D.sub })));
            return (React.createElement("svg", { viewBox: "0 0 360 186", width: "100%" },
                React.createElement(Arrow, { id: k }),
                [0, 1.25].map((v) => React.createElement("line", { key: v, x1: X(v), y1: 50, x2: X(v), y2: 134, stroke: D.faint, strokeWidth: "1", strokeDasharray: "3 3" })),
                bar(-1, 1.25, 20, 30, D.box, D.line, '모집', null, 'f'),
                T(X(1.25) + 8, 39, '1차 → 파이널 클로징, 보통 12~18개월', { size: 10, c: D.sub, a: 'start' }),
                bar(0, 5, 60, 40, D.yt, D.y, '투자기간', '신규 투자 · 4~6년', 'i'),
                bar(5, 10, 60, 40, D.box, D.line, '회수기간', '가치 제고·매각', 'h'),
                bar(10, 12, 60, 40, '#fff', D.line, '연장', '+1~2년', 'e'),
                T(X(2.5), 118, '캐피탈콜이 몰림', { size: 10, c: D.g }),
                T(X(7.5), 118, '분배가 몰림', { size: 10, c: D.g }),
                Ln(20, 134, 346, 134, k, { w: 1.6 }),
                [0, 1.25, 5, 10].map((v) => React.createElement("g", { key: 't' + v }, Ln(X(v), 128, X(v), 140, null, { c: D.g }))),
                T(X(0), 156, '1차 클로징', { size: 10, c: D.ink, w: 600 }),
                T(X(1.25) + 2, 173, '파이널 클로징', { size: 10, c: D.ink, w: 600, a: 'start' }),
                T(X(5), 156, '투자기간 종료 (5년)', { size: 10, c: D.ink, w: 600 }),
                T(X(10), 156, '만기 (10년)', { size: 10, c: D.ink, w: 600 })));
        } },
    // 10) 환헤지
    hedge: { title: '환헤지와 스왑포인트', cap: '원화 금리가 달러 금리보다 낮으면 미래 환율(선물환)이 현물보다 낮게 정해져, 헤지할 때 그 차이만큼 비용이 된다. (가상의 숫자)', render: (k) => (React.createElement("svg", { viewBox: "0 0 360 230", width: "100%" },
            React.createElement(Arrow, { id: k }),
            Box(20, 20, 140, 64, { f: D.yt, s: D.y }),
            T(90, 44, '지금 (현물)', { w: 700 }),
            T(90, 66, '1달러 = 1,380원', { size: 12, c: D.g, w: 600 }),
            Box(200, 20, 140, 64),
            T(270, 44, '1년 뒤 (선물환)', { w: 700 }),
            T(270, 66, '1달러 = 1,368원', { size: 12, c: D.g, w: 600 }),
            Ln(160, 52, 198, 52, k),
            T(180, 112, '스왑포인트 = 1,368 − 1,380 = −12원', { w: 700, size: 12.5 }),
            T(180, 134, '≈ 현물 × (원화금리 − 달러금리)', { size: 11, c: D.sub }),
            T(180, 152, '= 1,380 × (2.75% − 3.60%) ≈ −12원', { size: 11, c: D.sub }),
            Box(20, 170, 320, 46, { f: '#fff', s: D.line }),
            T(180, 190, '원화 투자자가 달러 자산을 헤지하면', { size: 11, c: D.sub }),
            T(180, 207, '연 약 0.85% 비용 (원화 금리가 낮을 때)', { w: 700, size: 12, c: KB.up }))) },
    // 11) 펀드 파이낸스
    fundfinance: { title: '펀드 파이낸스: 서브스크립션 라인 vs NAV 대출', cap: '초기엔 LP의 남은 약정을, 후기엔 보유 자산 가치를 담보로 돈을 빌린다.', render: (k) => (React.createElement("svg", { viewBox: "0 0 360 230", width: "100%" },
            React.createElement(Arrow, { id: k }),
            Ln(20, 108, 344, 108, k, { w: 1.6 }),
            T(20, 128, '펀드 초기', { a: 'start', size: 10.5, c: D.sub }),
            T(344, 128, '펀드 후기', { a: 'end', size: 10.5, c: D.sub }),
            Box(20, 20, 150, 74, { f: D.yt, s: D.y }),
            T(95, 42, '서브스크립션 라인', { w: 700, size: 12 }),
            T(95, 60, '담보: LP의 남은 약정', { size: 10.5, c: D.g }),
            T(95, 78, '용도: 캐피탈콜 전 브릿지', { size: 10.5, c: D.sub }),
            Box(190, 20, 150, 74),
            T(265, 42, 'NAV 대출', { w: 700, size: 12 }),
            T(265, 60, '담보: 보유 자산 가치', { size: 10.5, c: D.g }),
            T(265, 78, '용도: 추가투자·조기분배', { size: 10.5, c: D.sub }),
            Box(20, 146, 320, 70, { f: '#fff' }),
            T(180, 168, 'LP가 확인할 점', { w: 700, size: 12 }),
            T(180, 188, '서브라인은 IRR을 높여 보이게 할 수 있고', { size: 11, c: D.sub }),
            T(180, 205, 'NAV 대출은 펀드 전체의 레버리지를 늘린다', { size: 11, c: D.sub }))) },
    // 12) 항공기 리스
    lease: { title: '운용리스 vs 금융리스', cap: '핵심 차이는 ‘비행기의 미래 가치(잔존가치) 위험을 누가 지느냐’이다.', render: (k) => (React.createElement("svg", { viewBox: "0 0 360 250", width: "100%" },
            React.createElement(Arrow, { id: k }),
            Box(20, 16, 150, 36, { f: D.yt, s: D.y }),
            T(95, 39, '운용리스', { w: 700, size: 13 }),
            Box(190, 16, 150, 36),
            T(265, 39, '금융리스', { w: 700, size: 13 }),
            [
                ['소유권', '리스사가 계속 소유', '만기에 항공사로 이전'],
                ['리스 기간', '5~12년 (기체 수명보다 짧음)', '기체 수명 대부분'],
                ['잔존가치 위험', '리스사(투자자)가 부담', '항공사가 부담'],
                ['투자자 수익원', '리스료 + 중고 매각가치', '원리금(대출과 비슷)'],
            ].map(([h, a, b], i) => (React.createElement("g", { key: i },
                T(180, 76 + i * 44, h, { w: 700, size: 11, c: D.g }),
                T(95, 94 + i * 44, a, { size: 10.5, c: D.ink2 || D.ink }),
                T(265, 94 + i * 44, b, { size: 10.5, c: D.ink2 || D.ink }),
                i < 3 && React.createElement("line", { x1: "20", y1: 104 + i * 44, x2: "340", y2: 104 + i * 44, stroke: D.line, strokeWidth: "1" })))))) },
};
// 도식 한 장 — 제목·그림·해설
function Diagram({ id, compact }) {
    const d = DIAGRAMS[id];
    if (!d)
        return null;
    const key = `arr-${id}-${compact ? 'c' : 'f'}`;
    return (React.createElement("figure", { style: { margin: 0, padding: compact ? '12px 12px 10px' : '16px 16px 12px', border: `1px solid ${KB.line}`, borderRadius: 10, background: '#fff' } },
        React.createElement("figcaption", { style: { font: F(700, 13.5), color: KB.ink, marginBottom: 10 } }, d.title),
        React.createElement("div", { style: { maxWidth: 520, margin: '0 auto' } }, d.render(key)),
        React.createElement("div", { style: { font: F(400, 12.5, 1.65), color: KB.sub, marginTop: 8 } }, d.cap)));
}
// 용어 카드 — 한 줄 정의 + (펼치면) 쉬운 설명·예시·도식·연관 용어
function TermCard({ g, open, onToggle, onOpenTerm, showDiagram = true }) {
    return (React.createElement("div", { style: { borderTop: `1px solid ${KB.line2}` } },
        React.createElement("div", { onClick: onToggle, style: { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '14px 0', cursor: 'pointer' } },
            React.createElement("div", { style: { flex: 1, minWidth: 0 } },
                React.createElement("div", { style: { display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' } },
                    React.createElement("span", { style: { font: F(700, 15), color: KB.ink } }, g.term),
                    g.en && React.createElement("span", { style: { font: F(500, 12), color: KB.mute } }, g.en)),
                React.createElement("div", { style: { font: F(400, 13.5, 1.6), color: KB.ink2, marginTop: 4 } }, g.short)),
            React.createElement("span", { style: { color: KB.faint, marginTop: 2, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' } },
                React.createElement(Ico, { n: "down", size: 18, sw: 2 }))),
        open && (React.createElement("div", { style: { padding: '0 0 16px' } },
            React.createElement("div", { style: { font: F(400, 14, 1.8), color: KB.ink2 } }, g.body),
            g.ex && (React.createElement("div", { style: { marginTop: 10, padding: '11px 13px', background: KB.band, borderRadius: 8, font: F(400, 13, 1.65), color: KB.ink2 } },
                React.createElement("span", { style: { font: F(700, 12), color: KB.gray, marginRight: 6 } }, "\uC608\uC2DC"),
                g.ex)),
            showDiagram && g.dia && React.createElement("div", { style: { marginTop: 12 } },
                React.createElement(Diagram, { id: g.dia, compact: true })),
            g.rel && g.rel.length > 0 && (React.createElement("div", { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 12 } },
                React.createElement("span", { style: { font: F(600, 12), color: KB.mute, marginRight: 2 } }, "\uD568\uAED8 \uBCF4\uAE30"),
                g.rel.map((r) => GLOSSARY_BY_ID[r] && (React.createElement("span", { key: r, onClick: () => onOpenTerm && onOpenTerm(r), style: { font: F(500, 12.5), color: KB.ink2, padding: '4px 10px', borderRadius: 14, border: `1px solid ${KB.line}`, cursor: 'pointer' } }, GLOSSARY_BY_ID[r].term.split(' (')[0])))))))));
}
// ─── 용어·개념 학습 화면 ─────────────────────────────────────
// 처음 보는 사람을 위한 순서: 누가(LP·GP) → 돈이 어떻게 오가나(약정·캐피탈콜·분배·워터폴)
// → 성과를 어떻게 재나(IRR·J커브) → 주요 전략(세컨더리·사모대출)
const LEARN_PATH = ['lp', 'gp', 'commitment', 'capital_call', 'distribution', 'waterfall', 'irr', 'jcurve', 'secondary', 'private_credit'];
function LearnScreen({ focus, onFocusDone }) {
    const desktop = useDesktop();
    const [tab, setTab] = React.useState('terms');
    const [q, setQ] = React.useState('');
    const [cat, setCat] = React.useState('all');
    const [open, setOpen] = React.useState(null);
    const scrollRef = React.useRef(null);
    const jump = (id) => {
        setTab('terms');
        setQ('');
        setCat('all');
        setOpen(id);
        setTimeout(() => {
            const el = document.getElementById('term-' + id);
            if (el && scrollRef.current)
                scrollRef.current.scrollTo({ top: el.offsetTop - 8, behavior: 'smooth' });
        }, 40);
    };
    React.useEffect(() => { if (focus) {
        jump(focus);
        onFocusDone && onFocusDone();
    } }, [focus]);
    const ql = q.trim().toLowerCase();
    const list = GLOSSARY.filter((g) => (cat === 'all' || g.cat === cat)
        && (!ql || `${g.term} ${g.en} ${g.short}`.toLowerCase().includes(ql) || g.aliases.test(q.trim())));
    const count = (c) => GLOSSARY.filter((g) => g.cat === c).length;
    return (React.createElement("div", { style: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: KB.bg } },
        React.createElement(TopBar, { big: true, title: "\uC6A9\uC5B4\u00B7\uAC1C\uB150", sub: `해외대체투자 기초 용어 ${GLOSSARY.length}개 · 그림 ${Object.keys(DIAGRAMS).length}장`, border: false }),
        React.createElement(Tabs, { items: [['terms', '용어 사전'], ['diagrams', '그림으로 이해하기']], value: tab, onChange: setTab }),
        React.createElement("div", { ref: scrollRef, style: { flex: 1, minHeight: 0, overflowY: 'auto', position: 'relative' } },
            React.createElement("div", { style: { maxWidth: 820, margin: '0 auto', padding: desktop ? '20px 24px 48px' : '16px 20px 40px' } }, tab === 'terms' ? (React.createElement(React.Fragment, null,
                React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 8, height: 46, padding: '0 14px', background: KB.band, borderRadius: 10 } },
                    React.createElement(Ico, { n: "search", size: 19, color: KB.mute }),
                    React.createElement("input", { value: q, onChange: (e) => setQ(e.target.value), placeholder: "\uC6A9\uC5B4 \uAC80\uC0C9 (\uC608: \uCE90\uD53C\uD0C8\uCF5C, IRR, \uC6CC\uD130\uD3F4)", style: { flex: 1, border: 'none', outline: 'none', background: 'transparent', font: F(500, 15), color: KB.ink, minWidth: 0 } }),
                    q && React.createElement("span", { onClick: () => setQ(''), style: { color: KB.mute, cursor: 'pointer' } },
                        React.createElement(Ico, { n: "close", size: 18 }))),
                !ql && cat === 'all' && (React.createElement("div", { style: { marginTop: 18, padding: '16px 16px 12px', border: `1px solid ${KB.yellowLine}`, background: KB.yellowTint, borderRadius: 12 } },
                    React.createElement("div", { style: { font: F(700, 15), color: KB.ink } }, "\uCC98\uC74C\uC774\uB77C\uBA74 \uC774 \uC21C\uC11C\uB85C \uC77D\uC5B4 \uBCF4\uC138\uC694"),
                    React.createElement("div", { style: { font: F(400, 13, 1.6), color: KB.sub, marginTop: 4 } }, "\uB204\uAC00 \uB3C8\uC744 \uB0B4\uACE0(LP) \uB204\uAC00 \uAD74\uB9AC\uB294\uC9C0(GP)\uBD80\uD130, \uB3C8\uC774 \uC624\uAC00\uB294 \uD750\uB984\uACFC \uC131\uACFC\uB97C \uC7AC\uB294 \uBC29\uBC95\uAE4C\uC9C0."),
                    React.createElement("div", { style: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 } }, LEARN_PATH.map((id, i) => GLOSSARY_BY_ID[id] && (React.createElement("span", { key: id, onClick: () => jump(id), style: { display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px 0 6px', borderRadius: 16, background: '#fff', border: `1px solid ${KB.yellowLine}`, cursor: 'pointer', font: F(600, 13), color: KB.ink2 } },
                        React.createElement("span", { style: { width: 20, height: 20, borderRadius: 10, background: KB.yellow, color: KB.ink, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', font: F(700, 11) } }, i + 1),
                        GLOSSARY_BY_ID[id].term.split(' (')[0])))))),
                React.createElement("div", { style: { display: 'flex', gap: 6, overflowX: 'auto', margin: '18px 0 6px', paddingBottom: 2 } },
                    React.createElement(Chip, { active: cat === 'all', onClick: () => setCat('all'), count: GLOSSARY.length }, "\uC804\uCCB4"),
                    GLOSSARY_CATS.map(([k, label]) => React.createElement(Chip, { key: k, active: cat === k, onClick: () => setCat(k), count: count(k) }, label))),
                list.length === 0 && React.createElement(Empty, { compact: true, title: "\uCC3E\uB294 \uC6A9\uC5B4\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4", desc: "\uB2E4\uB978 \uD45C\uD604\uC73C\uB85C \uAC80\uC0C9\uD574 \uBCF4\uC138\uC694." }),
                list.map((g) => (React.createElement("div", { key: g.id, id: 'term-' + g.id },
                    React.createElement(TermCard, { g: g, open: open === g.id, onToggle: () => setOpen((o) => (o === g.id ? null : g.id)), onOpenTerm: jump })))),
                React.createElement("div", { style: { font: F(400, 12, 1.7), color: KB.mute, marginTop: 18 } }, "\uC608\uC2DC\uC758 \uC22B\uC790\uB294 \uC774\uD574\uB97C \uB3D5\uAE30 \uC704\uD55C \uAC00\uC0C1\uC758 \uAC12\uC774\uBA70 \uD2B9\uC815 \uD380\uB4DC\uC758 \uC2E4\uC81C \uC870\uAC74\uC774 \uC544\uB2D9\uB2C8\uB2E4."))) : (React.createElement("div", { style: { display: 'grid', gridTemplateColumns: desktop ? '1fr 1fr' : '1fr', gap: 14 } }, Object.keys(DIAGRAMS).map((id) => {
                const rel = GLOSSARY.filter((g) => g.dia === id);
                return (React.createElement("div", { key: id },
                    React.createElement(Diagram, { id: id }),
                    rel.length > 0 && (React.createElement("div", { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 8 } },
                        React.createElement("span", { style: { font: F(600, 12), color: KB.mute } }, "\uAD00\uB828 \uC6A9\uC5B4"),
                        rel.map((g) => (React.createElement("span", { key: g.id, onClick: () => jump(g.id), style: { font: F(500, 12.5), color: KB.ink2, padding: '4px 10px', borderRadius: 14, border: `1px solid ${KB.line}`, cursor: 'pointer' } }, g.term.split(' (')[0])))))));
            })))))));
}
// 오늘의 용어 — 날짜마다 하나씩 돌아가며 보여 준다(같은 날엔 같은 용어)
function termOfDay() {
    const k = new Date(Date.now() + 9 * 3600 * 1000);
    const n = Math.floor(k.getTime() / 86400000);
    return GLOSSARY[n % GLOSSARY.length];
}
