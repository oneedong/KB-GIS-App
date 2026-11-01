// 펀드 규모 표기 정리 — 기사마다 "$8 Billion" "$4.2B" "almost $6 billion" "USD 300 mn" 처럼 제각각인 것을
// "$8bn" "$4.2bn" "약 $6bn" "$300m" 로 맞춘다. 괄호 속 환산(₩·¥ → $)도 같은 규칙으로 정리하고,
// 금액이 아닌 값("hard cap", "yes")은 비운다. 숫자 자체는 바꾸지 않는다(표기만 정리).
const UNIT = (u) => (/^t/i.test(u) ? 'tn' : /^b/i.test(u) ? 'bn' : 'm');
export function fmtSize(x) {
  let s = String(x || '').replace(/\s+/g, ' ').trim();
  if (!s || !/\d/.test(s)) return '';
  let suffix = '';
  s = s.replace(/^(?:almost|nearly|about|around|approximately|roughly|~)\s*/i, '약 ');
  const more = s.match(/^(?:just over|more than|over|above|in excess of|exceeding)\s+/i);
  if (more) { s = s.slice(more[0].length); suffix = ' 이상'; }
  s = s
    .replace(/\bUSD\s?(?=\d)/gi, '$').replace(/\bEUR\s?(?=\d)/gi, '€').replace(/\bGBP\s?(?=\d)/gi, '£').replace(/\bUS\$\s?/g, '$')
    // "452.5 billion won" → "4525억원", "100 billion yen" → "¥100bn"
    .replace(/(\d[\d,]*(?:\.\d+)?)\s?billion won\b/gi, (m, n) => `${Math.round(Number(n.replace(/,/g, '')) * 10).toLocaleString('en-US')}억원`)
    .replace(/(\d[\d,]*(?:\.\d+)?)\s?(billion|million|trillion) yen\b/gi, (m, n, u) => `¥${n}${UNIT(u)}`)
    // 통화기호·통화코드 + 숫자 + 단위
    .replace(/((?:A|C|NZ|S|HK)?\$|€|£|¥|RMB\s?|R(?=\d)|Ksh\s?)?(\d[\d,]*(?:\.\d+)?)\s?(trillion|billion|million|tn|bn|mn|[BMT])\b(\s?USD)?/gi,
      (m, c, n, u, usd) => `${(c || (usd ? '$' : '')).replace(/\s/g, '')}${n}${UNIT(u)}`)
    .replace(/\((?:about|around|approximately|roughly|nearly|almost)\s+/gi, '(약 ');
  // '이상'은 첫 금액 바로 뒤에: "A$1bn 이상 ($700m)"
  return suffix ? (s.includes(' (') ? s.replace(' (', `${suffix} (`) : s + suffix) : s;
}
