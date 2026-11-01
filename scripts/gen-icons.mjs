// PWA 아이콘 생성 — 미팅노트와 같은 KB증권 디자인: 흰 바탕 + KB 마크(노랑) + 'GIS'(웜그레이)
// KB 마크는 icons/kb-logo.svg(미팅노트 헤더와 같은 벡터)의 노란 부분만 잘라 쓴다.
//   node scripts/gen-icons.mjs
import { readFile } from 'node:fs/promises';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const logo = await readFile(new URL('../icons/kb-logo.svg', import.meta.url), 'utf8');
const markPath = (logo.match(/<path fill="#EFAE21"[\s\S]*?\/>/) || [])[0];
if (!markPath) throw new Error('KB 마크(노란 path)를 찾지 못함');

// scale = 아이콘 한 변 대비 내용(마크+GIS)이 차지하는 비율(maskable 은 안전영역 안으로 작게)
function html(size, scale) {
  const content = Math.round(size * scale);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;}
    .c{box-sizing:border-box;width:${size}px;height:${size}px;background:#FFFFFF;display:flex;flex-direction:column;align-items:center;justify-content:center;}
    svg{width:${Math.round(content * 0.78)}px;height:auto;display:block;}
    .gis{margin-top:${Math.round(content * 0.06)}px;color:#71685D;font:700 ${Math.round(content * 0.27)}px/1 'Malgun Gothic','Noto Sans CJK KR','Noto Sans KR',sans-serif;letter-spacing:.06em;}
  </style></head><body><div class="c"><svg id="m" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2040 490">${markPath}</svg><div class="gis">GIS</div></div>
  <script>const s=document.getElementById('m');const b=s.getBBox();s.setAttribute('viewBox',[b.x,b.y,b.width,b.height].join(' '));</script></body></html>`;
}

const targets = [
  { file: 'icons/icon-192.png', size: 192, scale: 0.70 },
  { file: 'icons/icon-512.png', size: 512, scale: 0.70 },
  { file: 'icons/maskable-512.png', size: 512, scale: 0.54 },
  { file: 'icons/apple-touch-icon.png', size: 180, scale: 0.72 },
];
const browser = await chromium.launch();
for (const t of targets) {
  const page = await browser.newPage({ viewport: { width: t.size, height: t.size }, deviceScaleFactor: 1 });
  await page.setContent(html(t.size, t.scale), { waitUntil: 'load' });
  await page.waitForTimeout(100);
  await page.locator('.c').screenshot({ path: t.file });
  await page.close();
  console.log('wrote', t.file);
}
await browser.close();
