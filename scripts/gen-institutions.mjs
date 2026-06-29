/*
 * KB GIS — 국내 LP 기관 로스터(institutions.json) 생성기
 * collect-news.mjs 의 KOREAN_LPS 분류 사전에서 기관명·업권을 추출해, 앱이
 * 카테고리 화면에서 "업권별 전체 LP 목록"을 보여줄 수 있게 합니다.
 *   node scripts/gen-institutions.mjs
 */
import { readFile, writeFile } from 'fs/promises';

const src = await readFile(new URL('./collect-news.mjs', import.meta.url), 'utf8');
const blk = src.slice(src.indexOf('const KOREAN_LPS'), src.indexOf('const FOREIGN_GPS'));
const re = /\[\/.*?\/i,\s*'([^']+)',\s*'([^']+)'\]/g;
let m, seen = new Set(), out = [];
while ((m = re.exec(blk))) {
  const [, name, type] = m;
  if (seen.has(name)) continue;
  seen.add(name);
  out.push({ name, type });
}
// 앱 grp() 과 동일한 업권 매핑
const GRP = { '연기금': '연기금', '공제회': '공제회', '중앙회': '중앙회', '은행': '은행', '자산운용사': '운용·증권', '증권사': '운용·증권', '보험사': '보험·캐피탈', '캐피탈': '보험·캐피탈' };
const roster = out.map(x => ({ name: x.name, type: x.type, group: GRP[x.type] || '기타' })).filter(x => x.group !== '기타');
roster.sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));

const data = { updatedAt: new Date().toISOString().slice(0, 10), count: roster.length, institutions: roster };
await writeFile(new URL('../institutions.json', import.meta.url), JSON.stringify(data, null, 0));

const byGroup = {};
roster.forEach(x => { byGroup[x.group] = (byGroup[x.group] || 0) + 1; });
console.log(`institutions.json: ${roster.length} LPs`, byGroup);
