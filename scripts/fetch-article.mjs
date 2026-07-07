/*
 * 진단용: 특정 기사 URL 을 수집기와 동일한 방식으로 가져와 제목·본문 추출,
 * 관련성 필터(isRelevant) 통과 여부와 분류(enrich)를 출력한다.
 *   node scripts/fetch-article.mjs <url>
 * (GitHub Actions 의 fetch-url 워크플로에서 사용 — "이 기사가 왜 앱에 없지?"
 *  를 로그로 확인하는 용도)
 */
import { extractReadable, isRelevant, enrich } from './collect-news.mjs';

const url = process.argv[2];
if (!url) { console.error('usage: node scripts/fetch-article.mjs <url>'); process.exit(1); }

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko,en;q=0.8' }, redirect: 'follow', signal: AbortSignal.timeout(15000) });
const html = await res.text();
const og = (k) => (html.match(new RegExp(`<meta[^>]+property=["']og:${k}["'][^>]*content=["']([^"']+)`, 'i')) || [])[1] || '';
const title = og('title') || (html.match(/<title>([^<]+)/i) || [])[1] || '';
const body = extractReadable(html);

console.log('=== FETCH RESULT ===');
console.log('status:', res.status, '| finalUrl:', res.url);
console.log('title:', title);
console.log('body length:', body.length);
console.log('body head:', JSON.stringify(body.slice(0, 400)));

const raw = { title, desc: body.slice(0, 300), source: og('site_name') || 'daum' };
console.log('\n=== RELEVANCE ===');
console.log('isRelevant:', isRelevant(raw));
const e = enrich({ ...raw, link: url, pub: new Date().toUTCString() });
console.log('classify:', JSON.stringify({ cat: e.cat, inst: e.inst, instType: e.instType, asset: e.asset }));
