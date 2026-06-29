import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 404, height: 872 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto('http://localhost:8099/index.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(400);

// Home rendered?
const headerText = await page.locator('text=오늘의 브리프').count();
const feedCards = await page.locator('text=국민연금').count();
console.log('home header present:', headerText > 0);
console.log('feed shows 국민연금:', feedCards > 0);
await page.screenshot({ path: 'scripts/_home.png' });

// Filter chip
await page.locator('text=공제회').first().click();
await page.waitForTimeout(200);
const filterBanner = await page.locator('text=필터 ·').count();
console.log('filter banner after chip click:', filterBanner > 0);

// Open a detail
await page.locator('text=해제 ✕').first().click(); // clear filter via banner
await page.waitForTimeout(150);
await page.locator('text=국민연금').first().click();
await page.waitForTimeout(250);
const aiSummary = await page.locator('text=3줄 요약').count();
console.log('detail AI summary present:', aiSummary > 0);
await page.screenshot({ path: 'scripts/_detail.png' });

// English original toggle
const origToggle = await page.locator('text=원문 보기 ▼').count();
console.log('EN original toggle present:', origToggle > 0);
if (origToggle > 0) {
  await page.locator('text=원문 보기 ▼').first().click();
  await page.waitForTimeout(150);
  const expanded = await page.locator('text=기사 원문으로 이동 ↗').count();
  console.log('original expanded:', expanded > 0);
}

// Share sheet
await page.locator('text=↗ 공유하기').first().click();
await page.waitForTimeout(200);
const shareSheet = await page.locator('text=링크 복사').count();
console.log('share sheet opened:', shareSheet > 0);
await page.screenshot({ path: 'scripts/_share.png' });

console.log('CONSOLE ERRORS:', errors.length ? errors : 'none');
await browser.close();
