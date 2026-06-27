// Generates PWA icons by rendering an HTML badge in the local Chromium.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

// `scale` = fraction of the canvas occupied by the yellow box (rest is dark margin).
// Inside the box: "KB" on top, "GIS" directly beneath it.
function html(size, scale) {
  const box = Math.round(size * scale);
  const kb = Math.round(box * 0.42);
  const gis = Math.round(box * 0.205);
  const radius = Math.round(box * 0.24);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;}
    .c{box-sizing:border-box;width:${size}px;height:${size}px;background:#1c1d1f;
       display:flex;align-items:center;justify-content:center;
       font-family:-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;}
    .box{width:${box}px;height:${box}px;border-radius:${radius}px;background:#FFCC00;
       display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1;}
    .kb{color:#1c1d1f;font-weight:800;font-size:${kb}px;letter-spacing:-0.02em;}
    .gis{color:#1c1d1f;font-weight:800;font-size:${gis}px;letter-spacing:0.08em;
       margin-top:${Math.round(box * 0.05)}px;}
  </style></head><body>
    <div class="c">
      <div class="box">
        <div class="kb">KB</div>
        <div class="gis">GIS</div>
      </div>
    </div>
  </body></html>`;
}

const targets = [
  { file: 'icons/icon-192.png',         size: 192, scale: 0.66 },
  { file: 'icons/icon-512.png',         size: 512, scale: 0.66 },
  { file: 'icons/maskable-512.png',     size: 512, scale: 0.52 },
  { file: 'icons/apple-touch-icon.png', size: 180, scale: 0.70 },
];

const browser = await chromium.launch();
for (const t of targets) {
  const page = await browser.newPage({ viewport: { width: t.size, height: t.size }, deviceScaleFactor: 1 });
  await page.setContent(html(t.size, t.scale), { waitUntil: 'networkidle' });
  await page.locator('.c').screenshot({ path: t.file });
  await page.close();
  console.log('wrote', t.file);
}
await browser.close();
