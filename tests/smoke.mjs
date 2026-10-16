/*
 * 배포 전 점검(스모크 테스트): 앱을 실제 브라우저(Chromium)로 열어 주요 화면을 모두 눌러 보고,
 * 화면 오류(pageerror)·콘솔 오류가 하나라도 나면 실패로 끝난다.
 *   node tests/smoke.mjs            (playwright 패키지·Chromium 필요)
 * app-check 워크플로가 src·js·index.html 등이 바뀔 때마다 실행한다.
 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  try { const buf = await readFile(file); res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }); res.end(buf); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/index.html`;

const errors = [];
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
async function run(tag, viewport, steps) {
  const ctx = await browser.newContext({ viewport, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(6000);
  page.on('pageerror', (e) => errors.push(`${tag} PAGEERROR ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED|net::/.test(m.text())) errors.push(`${tag} CONSOLE ${m.text().slice(0, 200)}`); });
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());     // 외부 요청(프록시·시세)은 막고 앱 자체만 본다
  await page.goto(base);
  await page.waitForTimeout(1500);
  for (const [label, fn] of steps) {
    try { await fn(page); await page.waitForTimeout(500); console.log(`ok   ${tag} ${label}`); }
    catch (e) { errors.push(`${tag} ${label}: ${e.message.split('\n')[0]}`); console.log(`FAIL ${tag} ${label}`); }
  }
  await ctx.close();
}
const nav = (l) => async (p) => p.locator(`nav [aria-label="${l}"]`).click();
const side = (l) => async (p) => p.locator('aside').getByText(l, { exact: true }).click();
const see = (t) => async (p) => p.getByText(t).first().waitFor({ state: 'visible' });

await run('mobile', { width: 390, height: 844 }, [
  ['홈', nav('홈')],
  ['시황', nav('시황')],
  ['시장현황', async (p) => { await nav('시장현황')(p); await see('자산군별 한눈에')(p); }],
  ['시장현황-자산군', async (p) => { await p.getByText('Private Credit', { exact: true }).first().click(); await see('운용사별 이슈')(p); }],
  ['펀드레이징', async (p) => { await nav('펀드레이징')(p); await p.getByText('캘린더', { exact: true }).first().click(); }],
  ['Korea LP', async (p) => { await nav('Korea LP')(p); await p.getByText('배분·인사', { exact: true }).first().click(); }],
  ['Global GP', nav('Global GP')],
  ['전체', nav('전체')],
  ['투자내역', async (p) => { await p.getByText('투자내역', { exact: true }).first().click(); }],
  ['용어', async (p) => { await nav('전체')(p); await p.getByText('용어·개념', { exact: true }).first().click(); }],
  ['기사 열기', async (p) => { await nav('홈')(p); const it = p.locator('text=/전문|EN/'); if (await it.count()) await it.first().click(); await p.waitForTimeout(1200); }],
]);
await run('desktop', { width: 1440, height: 900 }, [
  ['홈', side('홈')], ['데일리 시황', side('데일리 시황')], ['시장현황', side('시장현황')], ['Korea LP', side('Korea LP')],
  ['Global GP', side('Global GP')], ['펀드레이징', side('펀드레이징')], ['투자내역', side('투자내역')], ['용어·개념', side('용어·개념')],
  ['검색', async (p) => { await side('검색')(p); await p.locator('input').first().fill('KKR'); }], ['북마크', side('북마크')],
]);
await browser.close();
server.close();
if (errors.length) { console.error('\n스모크 테스트 실패:\n' + errors.join('\n')); process.exit(1); }
console.log('\n스모크 테스트 통과');
