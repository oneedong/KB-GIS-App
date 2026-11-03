#!/usr/bin/env node
/*
 * KB GIS — 주간 시장현황 메일 만들기 (보고서 JSON → 메일 본문·첨부·텍스트)
 *
 * weekly/<날짜>.json(매주 마지막 영업일에 GitHub Actions 가 만든 보고서)을 읽어 메일 한 통 분량의 파일을 만든다.
 * 새로 검색하거나 문장을 쓰지 않는다 — 보고서에 있는 내용과 근거 기사 링크만 옮긴다.
 *   · email.html  메일 본문(Outlook·Gmail 호환: table + 인라인 스타일, 스크립트 없음)
 *   · body.txt    플레인텍스트 대체본
 *   · meta.json   제목·보고서 날짜·웹 페이지 주소
 *   · weekly/<YYYYMMDD>.html (--page)  같은 내용의 웹 페이지(다크모드·모바일). 앱 주소로 공개되고 메일의 '웹에서 보기'가 연결된다.
 *     첨부(base64) 대신 링크로 둔다 — 예약 세션이 수십 KB base64 를 옮겨 적다 깨지는 일을 없앤다.
 * 발송은 예약 작업(Claude, Gmail)이 한다 — 제목이 중복 발송 확인의 기준이므로 형식을 바꾸지 않는다.
 *
 *   node scripts/weekly-email.mjs --page                    # 최신 보고서의 웹 페이지(weekly/<날짜>.html) 만들기 — 주간 워크플로가 실행
 *   node scripts/weekly-email.mjs --out DIR                 # 최신 보고서 메일
 *   node scripts/weekly-email.mjs --out DIR --fresh         # 최신 보고서가 6일보다 오래됐으면(이번 주 것이 아직 없으면) NOT_READY 출력 후 종료코드 3
 *   node scripts/weekly-email.mjs --out DIR --date 2026-10-30
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fmtSize } from './money.mjs';

const ROOT = new URL('../', import.meta.url);
const APP = 'https://oneedong.github.io/KB-GIS-App/';
const TITLE = '글로벌 대체투자 주간 시장현황';
export const SUBJECT_KEY = `[자동발송][KB GIS] ${TITLE}`;
const ASSET_ORDER = ['PE', 'PC', 'RE', 'IN', 'AV'];
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const E = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (n) => Number(n || 0).toLocaleString('en-US');
const dot = (d) => String(d).replace(/-/g, '.');
const md = (d) => { const m = String(d).match(/^\d{4}-(\d{2})-(\d{2})$/); return m ? `${+m[1]}.${+m[2]}` : String(d); };
const dow = (d) => DOW[new Date(`${d}T00:00:00Z`).getUTCDay()];
const srcShort = (s) => { const t = String(s || '').split(/,\s|\s[-|–]\s/)[0].trim(); return !t ? '기사' : t.length > 26 ? t.slice(0, 25) + '…' : t; };
const dshort = (cur, prev) => { if (!prev) return ''; const p = Math.round(((cur - prev) / prev) * 100); return `전주 ${p > 0 ? '+' : ''}${p}%`; };
const viaLabel = (v) => {
  const m = String(v || '').match(/claude-(opus|sonnet|haiku|fable)-(\d+)-(\d+)/);
  if (m) return `Claude ${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}.${m[3]}`;
  if (/^gemini/.test(v || '')) return 'Gemini';
  return '자동 집계';
};
const delta = (cur, prev) => {
  if (!prev) return '';
  const p = Math.round(((cur - prev) / prev) * 100);
  return p === 0 ? '전주 수준' : `전주 대비 ${p > 0 ? '+' : ''}${p}%`;
};
// KST 기준 n일 전 날짜(YYYY-MM-DD)
export const kstDaysAgo = (n, nowMs = Date.now()) => new Date(nowMs + 9 * 3600e3 - n * 864e5).toISOString().slice(0, 10);

// ── 보고서 → 메일용 정리 ────────────────────────────────────────
export function shape(rep) {
  const refs = rep.refs || {};
  const src = (ids, max = 2) => (ids || []).map((id) => refs[id]).filter((r) => r && /^https?:\/\//.test(r.u || '')).slice(0, max)
    .map((r) => ({ m: srcShort(r.s), u: r.u, t: r.t || r.o || '', d: r.d || '' }));
  const assets = ASSET_ORDER.filter((k) => rep.assets && rep.assets[k]).map((k) => {
    const A = rep.assets[k], S = A.stats || {};
    const funds = [
      ...(A.finals || []).map((x) => ({ ...x, stage: '파이널 클로즈', fin: true })),
      ...(A.launches || []).map((x) => ({ ...x, stage: '모집 개시' })),
      ...(A.closes || []).map((x) => ({ ...x, stage: x.stage || '클로즈' })),
    ].map((x) => ({ stage: x.stage, fin: !!x.fin, gp: x.gp || '', fund: x.fund && x.fund !== x.gp ? x.fund : '', size: x.size || '미상', src: src([x.id], 1) }));
    return {
      k, label: A.label || k, summary: A.summary || '', status: A.status || '', korea: A.korea || '',
      strategies: A.strategies || [],
      stats: { articles: S.articles || 0, prev: S.prevArticles || 0, deals: S.deals || 0, finals: S.finals || 0, launches: (S.launches || 0) + (S.otherCloses || 0), kr: S.krArticles || 0 },
      gp: (A.gpIssues || []).map((g) => ({ gp: g.gp, text: g.issue, src: src(g.refs) })).filter((g) => g.text),
      trends: (A.trends || []).map((t) => ({ trend: t.trend, why: t.why || '', src: src(t.refs) })).filter((t) => t.trend),
      funds,
      kr: (A.krDeals || []).map((d) => ({ inst: d.inst, kind: d.kind || '', amount: fmtSize(d.amount) || '', t: d.t || '', src: src([d.id], 1) })),
    };
  });
  const T = rep.totals || {};
  return {
    date: rep.date, from: rep.from, to: rep.to, via: viaLabel(rep.via),
    headline: rep.headline || '', korea: rep.korea || '',
    totals: { articles: T.articles || 0, prev: T.prevArticles || 0, deals: T.deals || 0 },
    krShare: (rep.krShare || []).filter((x) => x.articles || x.deals),
    assets,
    subject: `${SUBJECT_KEY} — ${dot(rep.date)} (${dow(rep.date)}) 기준`,
    key: String(rep.date).replace(/-/g, ''),
    page: `${APP}weekly/${String(rep.date).replace(/-/g, '')}.html`,
  };
}

const DISC = '본 메일은 KB증권 GIS를 위해 자동 생성된 주간 시장현황입니다. KB GIS 앱이 한 주간 수집한 공개 언론 보도를 집계·요약한 것으로 투자자문이 아니며, 원문 확인 후 활용하시기 바랍니다. 요약 문장 중 수집 자료에 없는 숫자가 들어간 문장은 자동으로 제외됩니다.';

// ── 첨부 HTML (독립 문서) ────────────────────────────────────────
const CSS = `:root{--y:#FFBC00;--ys:#FFF6DB;--g:#60584C;--ink:#2B2722;--mut:#7A7268;--ln:#E7E2DA;--bg:#F5F3EF;--cd:#fff;--ch:#F0ECE5;--bl:#2F5597}
@media(prefers-color-scheme:dark){:root{--ys:#352C17;--g:#D9D2C7;--ink:#EEEAE3;--mut:#A69E92;--ln:#3A3530;--bg:#1A1815;--cd:#24211D;--ch:#302B25;--bl:#8FB0E8}}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif;font-size:16px;line-height:1.6;-webkit-text-size-adjust:100%;word-break:keep-all}
a{color:inherit;text-decoration:underline;text-decoration-color:var(--y);text-decoration-thickness:2px;text-underline-offset:3px}
.top{height:5px;background:var(--y)}.wrap{max-width:780px;margin:0 auto;padding:22px 16px 64px}
.tb{display:flex;justify-content:space-between;align-items:center;gap:10px;margin:-8px 0 14px}.inf{font-size:11px;color:var(--mut)}.inf a{color:var(--mut);text-decoration-thickness:1px;word-break:break-all}.mb{flex:none;font-size:12px;font-weight:800;color:#2B2722;background:var(--y);padding:5px 11px;border-radius:99px;text-decoration:none}
.br{font-size:12px;font-weight:800;letter-spacing:.06em;color:var(--g);display:flex;align-items:center;gap:7px}.br i{width:10px;height:10px;background:var(--y);display:inline-block;border-radius:2px}
h1{font-size:23px;line-height:1.3;margin:8px 0;letter-spacing:-.02em}.mt{font-size:13px;color:var(--mut)}.mt b{color:var(--ink)}
.tg{display:inline-block;font-size:11.5px;font-weight:700;padding:2px 9px;border-radius:99px;background:var(--ch);color:var(--mut);white-space:nowrap;margin:0 4px 4px 0}.tg.k{background:var(--y);color:#2B2722}.tg.f{background:var(--g);color:var(--bg)}
.sts{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:18px 0 12px}.st{background:var(--cd);border:1px solid var(--ln);border-radius:12px;padding:11px 13px}.st b{display:block;font-size:22px;line-height:1.2;font-variant-numeric:tabular-nums}.st span{font-size:12.5px;color:var(--mut)}.st.k{border-bottom:3px solid var(--y)}
.hl{background:var(--ys);border-left:4px solid var(--y);border-radius:0 12px 12px 0;padding:14px 16px;margin:14px 0}.hl h2{font-size:13px;letter-spacing:.06em;color:var(--g);margin:0 0 6px}.hl p{margin:0;font-size:16px;font-weight:700;line-height:1.6}
.box{background:var(--cd);border:1px solid var(--ln);border-radius:12px;padding:14px 16px;margin:0 0 10px}.box p{margin:0;font-size:15px;line-height:1.75}
.fb{position:sticky;top:0;z-index:5;margin:8px -16px 0;padding:10px 16px;background:var(--bg);display:flex;gap:6px;overflow-x:auto;scrollbar-width:none}.fb::-webkit-scrollbar{display:none}
.fb a{flex:none;font-size:13px;font-weight:700;padding:6px 12px;border-radius:99px;background:var(--cd);border:1px solid var(--ln);color:var(--ink);text-decoration:none}.fb a span{color:var(--mut);font-weight:600;margin-left:4px}
.sc{display:flex;align-items:center;gap:8px;font-size:18px;font-weight:800;margin:28px 0 12px;scroll-margin-top:60px}.sc::before{content:"";width:6px;height:20px;background:var(--y);border-radius:2px}.sc span{font-size:12px;font-weight:700;color:var(--mut);background:var(--ch);padding:2px 9px;border-radius:99px}
.sub{font-size:13px;font-weight:800;color:var(--g);letter-spacing:.04em;margin:16px 0 8px}
table.ov,table.fd{width:100%;border-collapse:collapse;background:var(--cd);border:1px solid var(--ln);border-radius:12px;overflow:hidden;font-size:14px}
.ov th,.fd th{background:var(--ch);color:var(--g);font-size:12px;font-weight:800;text-align:left;padding:8px 10px}.ov td,.fd td{border-top:1px solid var(--ln);padding:9px 10px;vertical-align:top;line-height:1.55}
.ov td.n,.fd td.n{white-space:nowrap;font-variant-numeric:tabular-nums}.ov a{font-weight:800;text-decoration:none;color:var(--ink)}.ov small{display:block;color:var(--mut);font-size:12px}
.fd tr.fin td{background:var(--ys)}.fd .stg{font-size:12px;font-weight:800;color:var(--bl);white-space:nowrap}.fd tr.fin .stg{color:#9A6B00}
.it{background:var(--cd);border:1px solid var(--ln);border-radius:12px;padding:12px 14px;margin:0 0 8px}.it b{color:var(--g)}.it .w{display:block;font-size:14.5px;line-height:1.7;margin-top:3px}
.sr{margin-top:6px;font-size:12.5px;color:var(--mut)}.sr a{color:var(--ink);font-weight:700;margin-right:8px;white-space:nowrap}
.ft{margin-top:32px;padding-top:14px;border-top:1px solid var(--ln);font-size:11.5px;color:var(--mut);line-height:1.6}
@media(max-width:480px){body{font-size:15px}.wrap{padding:16px 12px 64px}.fb{margin:8px -12px 0;padding:10px 12px}h1{font-size:20px}.st b{font-size:19px}.ov td,.fd td{padding:8px 7px;font-size:13px}.hide-m{display:none}}
@media print{.fb,.tb{display:none}}`;

function attachment(M) {
  const srcA = (s) => s.length ? `<div class="sr">${s.map((x) => `<a href="${E(x.u)}" title="${E(x.t)}">${E(x.m)} ↗</a>`).join('')}</div>` : '';
  const H = [];
  H.push(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="color-scheme" content="light dark"><title>KB GIS 주간 시장현황 ${E(dot(M.date))}</title><style>${CSS}</style></head><body>`);
  H.push(`<div class="top"></div><div class="wrap"><div class="tb"><span class="inf"><a href="${APP}">${APP}</a> 에서 기사 원문과 상세 현황을 볼 수 있습니다.</span><a class="mb" href="${APP}">모바일로 조회 ›</a></div>`);
  H.push(`<header><div class="br"><i></i>KB증권 GIS · GLOBAL ALTERNATIVES WEEKLY</div><h1>${TITLE}</h1><div class="mt"><b>${E(dot(M.date))} (${dow(M.date)}) 기준</b> · 수집 ${E(md(M.from))} ~ ${E(md(M.to))} · 분석 ${E(M.via)}</div></header>`);
  H.push(`<div class="sts"><div class="st"><b>${num(M.totals.articles)}</b><span>관련 보도 · ${E(delta(M.totals.articles, M.totals.prev) || '—')}</span></div><div class="st"><b>${num(M.totals.deals)}</b><span>딜·펀드 기록</span></div><div class="st k"><b>${num(M.assets.reduce((n, a) => n + a.stats.finals, 0))}</b><span>파이널 클로즈</span></div></div>`);
  if (M.headline) H.push(`<section class="hl"><h2>이번 주 한 줄</h2><p>${E(M.headline)}</p></section>`);
  if (M.korea || M.krShare.length) {
    H.push(`<div class="sc">한국 투자자 동향</div><div class="box">${M.korea ? `<p>${E(M.korea)}</p>` : ''}${M.krShare.length ? `<div style="margin-top:10px">${M.krShare.map((x) => `<span class="tg k">${E(x.label)} 기사 ${x.articles}${x.deals ? ` · 딜 ${x.deals}` : ''}</span>`).join('')}</div>` : ''}</div>`);
  }
  H.push(`<div class="sc">자산군별 한눈에</div><table class="ov"><thead><tr><th>자산군</th><th>보도</th><th class="hide-m">딜</th><th>요약</th></tr></thead><tbody>`);
  for (const a of M.assets) H.push(`<tr><td><a href="#a-${a.k}">${E(a.label)}</a></td><td class="n">${num(a.stats.articles)}<small>${E(delta(a.stats.articles, a.stats.prev))}</small></td><td class="n hide-m">${num(a.stats.deals)}</td><td>${E(a.summary || '—')}</td></tr>`);
  H.push('</tbody></table>');
  H.push(`<nav class="fb" aria-label="자산군">${M.assets.map((a) => `<a href="#a-${a.k}">${E(a.label)}<span>${a.stats.articles}</span></a>`).join('')}</nav>`);
  for (const a of M.assets) {
    H.push(`<section><div class="sc" id="a-${a.k}">${E(a.label)}<span>보도 ${num(a.stats.articles)} · 딜 ${num(a.stats.deals)}</span></div>`);
    if (a.summary) H.push(`<div class="hl" style="margin-top:0"><p style="font-size:15px">${E(a.summary)}</p></div>`);
    if (a.status) H.push(`<div class="sub">시장 현황</div><div class="box"><p>${E(a.status)}</p></div>`);
    if (a.korea || a.strategies.length || a.kr.length) {
      H.push(`<div class="sub">한국 투자자</div><div class="box">${a.korea ? `<p>${E(a.korea)}</p>` : ''}${a.strategies.length ? `<div style="margin-top:8px">${a.strategies.map((s) => `<span class="tg">${E(s)}</span>`).join('')}</div>` : ''}`
        + a.kr.map((d) => `<div class="sr" style="color:var(--ink);font-size:13.5px"><b>${E(d.inst)}</b> ${E(d.kind)}${d.amount ? ` · ${E(d.amount)}` : ''} — ${E(d.t)} ${d.src.map((x) => `<a href="${E(x.u)}">${E(x.m)} ↗</a>`).join('')}</div>`).join('') + '</div>');
    }
    if (a.gp.length) H.push(`<div class="sub">운용사별 이슈</div>${a.gp.map((g) => `<div class="it"><b>${E(g.gp)}</b><span class="w">${E(g.text)}</span>${srcA(g.src)}</div>`).join('')}`);
    if (a.trends.length) H.push(`<div class="sub">트렌드와 그 이유</div>${a.trends.map((t) => `<div class="it"><b>${E(t.trend)}</b>${t.why ? `<span class="w">${E(t.why)}</span>` : ''}${srcA(t.src)}</div>`).join('')}`);
    if (a.funds.length) {
      H.push(`<div class="sub">펀드레이징</div><table class="fd"><thead><tr><th>단계</th><th>운용사</th><th class="hide-m">펀드</th><th>규모</th></tr></thead><tbody>`
        + a.funds.map((f) => `<tr${f.fin ? ' class="fin"' : ''}><td class="stg">${E(f.stage)}</td><td>${f.src[0] ? `<a href="${E(f.src[0].u)}">${E(f.gp)}</a>` : E(f.gp)}</td><td class="hide-m">${E(f.fund || '–')}</td><td class="n">${E(f.size)}</td></tr>`).join('') + '</tbody></table>');
    }
    H.push('</section>');
  }
  H.push(`<footer class="ft">${DISC}<br>문장 작성: ${E(M.via)} · 수치·펀드 표: 앱 수집 기록 집계.</footer></div></body></html>`);
  return H.join('');
}

// ── 메일 본문 HTML (table + 인라인) ─────────────────────────────
const F = "font-family:'Malgun Gothic',sans-serif;word-break:keep-all;overflow-wrap:anywhere;";
const Y = '#FFBC00', YS = '#FFF6DB', GR = '#60584C', INK = '#2B2722', MUT = '#7A7268', LN = '#E7E2DA', BG = '#F5F3EF', CH = '#F0ECE5', BL = '#2F5597';
const TB = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"';
const row = (inner, pad = '0 16px 10px') => `<tr><td style="padding:${pad};${F}">${inner}</td></tr>`;
const sec = (t, sub) => row(`${TB}><tr><td width="6" bgcolor="${Y}" style="background:${Y};width:6px;font-size:0">&nbsp;</td><td style="padding:2px 0 2px 9px;${F}font-size:17px;font-weight:bold;color:${INK}">${E(t)}${sub ? ` <span style="font-size:12px;color:${MUT};font-weight:normal">${E(sub)}</span>` : ''}</td></tr></table>`, '22px 16px 10px');
const sub = (t) => `<div style="font-size:12.5px;font-weight:bold;color:${GR};letter-spacing:.5px;margin:14px 0 6px">${E(t)}</div>`;
const srcE = (s) => s.length ? `<div style="margin-top:4px;font-size:12px;color:${MUT}">${s.map((x) => `<a href="${E(x.u)}" style="color:${INK};font-weight:bold">${E(x.m)} ↗</a>`).join(' &nbsp;')}</div>` : '';
const box = (inner, extra = '') => `${TB} style="border:1px solid ${LN};${extra}"><tr><td style="padding:12px 14px;${F}">${inner}</td></tr></table>`;

function emailBody(M, withPage) {
  const WEB = withPage ? M.page : APP;
  const R = [];
  R.push(`<div style="margin:0;padding:0;background:${BG}">${TB} bgcolor="${BG}" style="background:${BG}"><tr><td align="center" style="padding:12px 4px">`);
  R.push('<!--[if mso]><table role="presentation" width="680" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->');
  R.push(`${TB} style="max-width:680px;background:#FFFFFF;border:1px solid ${LN}">`);
  R.push(`<tr><td height="5" bgcolor="${Y}" style="height:5px;line-height:5px;font-size:0;background:${Y}">&nbsp;</td></tr>`);
  const BTN = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="right"><tr><td bgcolor="${Y}" style="background:${Y};border-radius:12px;mso-padding-alt:5px 11px"><a href="${WEB}" style="display:inline-block;padding:5px 11px;${F}font-size:12px;font-weight:bold;color:${INK};text-decoration:none;white-space:nowrap">${withPage ? '웹에서 보기' : '모바일로 조회'} &#8250;</a></td></tr></table>`;
  R.push(row(`${TB}><tr><td style="${F}font-size:10.5px;color:${MUT};line-height:1.4">${withPage ? '휴대폰에서는 \'웹에서 보기\'가 화면에 맞춰 표시됩니다.' : `<a href="${APP}" style="color:${MUT}">KB GIS 앱</a>에서 기사 원문을 볼 수 있습니다.`}</td><td align="right" width="104" style="padding-left:6px">${BTN}</td></tr></table>`, '10px 16px 0'));
  R.push(row(`<div style="font-size:12px;font-weight:bold;letter-spacing:1px;color:${GR}"><span style="color:${Y}">■</span> KB증권 GIS · GLOBAL ALTERNATIVES WEEKLY</div><div style="font-size:22px;font-weight:bold;color:${INK};line-height:1.3;margin:6px 0">${TITLE}</div><div style="font-size:12.5px;color:${MUT};line-height:1.6"><b style="color:${INK}">${E(dot(M.date))} (${dow(M.date)}) 기준</b> · 수집 ${E(md(M.from))} ~ ${E(md(M.to))}<br>분석 ${E(M.via)} · 자산군 ${M.assets.length}개</div>`, '10px 16px 6px'));
  const st = (n, l, k) => `<td width="33%" style="padding:3px">${TB} style="border:1px solid ${LN};${k ? `border-bottom:3px solid ${Y};` : ''}"><tr><td style="padding:8px 9px;${F}"><div style="font-size:19px;font-weight:bold;color:${INK};line-height:1.2">${n}</div><div style="font-size:12px;color:${MUT}">${E(l)}</div></td></tr></table></td>`;
  const fin = M.assets.reduce((n, a) => n + a.stats.finals, 0);
  R.push(row(`${TB}><tr>${st(num(M.totals.articles), `관련 보도 ${dshort(M.totals.articles, M.totals.prev)}`, 0)}${st(num(M.totals.deals), '딜·펀드 기록', 0)}${st(num(fin), '파이널 클로즈', 1)}</tr></table>`, '10px 13px 6px'));
  if (M.headline) R.push(row(`${TB} bgcolor="${YS}" style="background:${YS};border-left:4px solid ${Y}"><tr><td style="padding:13px 16px;${F}"><div style="font-size:12px;font-weight:bold;letter-spacing:1px;color:${GR};margin-bottom:6px">이번 주 한 줄</div><div style="font-size:15.5px;font-weight:bold;color:${INK};line-height:1.6">${E(M.headline)}</div></td></tr></table>`, '6px 16px 4px'));
  if (M.korea || M.krShare.length) {
    R.push(sec('한국 투자자 동향'));
    R.push(row(box(`${M.korea ? `<div style="font-size:14.5px;color:${INK};line-height:1.75">${E(M.korea)}</div>` : ''}${M.krShare.length ? `<div style="margin-top:8px;font-size:12px;color:${MUT};line-height:2">${M.krShare.map((x) => `<span style="display:inline-block;background:${Y};color:${INK};font-weight:bold;border-radius:10px;padding:0 8px;margin:0 4px 3px 0;white-space:nowrap">${E(x.label)} 기사 ${x.articles}${x.deals ? ` · 딜 ${x.deals}` : ''}</span>`).join('')}</div>` : ''}`)));
  }
  R.push(sec('자산군별 한눈에'));
  R.push(row(`${TB} style="border:1px solid ${LN}"><tr>${['자산군', '보도', '요약'].map((h) => `<td bgcolor="${CH}" style="background:${CH};padding:7px 10px;${F}font-size:12px;font-weight:bold;color:${GR}">${h}</td>`).join('')}</tr>`
    + M.assets.map((a) => `<tr><td width="24%" style="padding:9px 8px 9px 10px;border-top:1px solid ${LN};${F}font-size:13px;font-weight:bold;color:${INK};vertical-align:top;line-height:1.4">${E(a.label)}</td><td width="16%" style="padding:9px 6px;border-top:1px solid ${LN};${F}font-size:13px;color:${INK};vertical-align:top">${num(a.stats.articles)}<div style="font-size:11px;color:${MUT};line-height:1.35">${E(dshort(a.stats.articles, a.stats.prev))}</div></td><td style="padding:9px 10px;border-top:1px solid ${LN};${F}font-size:13.5px;color:${INK};line-height:1.6;vertical-align:top">${E(a.summary || '—')}</td></tr>`).join('') + '</table>'));
  for (const a of M.assets) {
    R.push(sec(a.label, `보도 ${num(a.stats.articles)} · 딜 ${num(a.stats.deals)} · 파이널 클로즈 ${a.stats.finals}`));
    let inner = '';
    if (a.status) inner += `${sub('시장 현황')}<div style="font-size:14.5px;color:${INK};line-height:1.75">${E(a.status)}</div>`;
    if (a.korea || a.kr.length) inner += `${sub('한국 투자자')}${a.korea ? `<div style="font-size:14.5px;color:${INK};line-height:1.75">${E(a.korea)}</div>` : ''}`
      + a.kr.map((d) => `<div style="font-size:13px;color:${INK};line-height:1.6;margin-top:4px">· <b>${E(d.inst)}</b> ${E(d.kind)}${d.amount ? ` · ${E(d.amount)}` : ''}${d.src.map((x) => ` <a href="${E(x.u)}" style="color:${INK};font-weight:bold">${E(x.m)} ↗</a>`).join('')}</div>`).join('');
    if (a.gp.length) inner += sub('운용사별 이슈') + a.gp.map((g) => `<div style="padding:8px 0;border-top:1px dashed ${LN}"><div style="font-size:14px;color:${INK};line-height:1.65"><b style="color:${GR}">${E(g.gp)}</b> — ${E(g.text)}</div>${srcE(g.src)}</div>`).join('');
    if (a.trends.length) inner += sub('트렌드와 그 이유') + a.trends.map((t) => `<div style="padding:8px 0;border-top:1px dashed ${LN}"><div style="font-size:14px;font-weight:bold;color:${INK};line-height:1.6">${E(t.trend)}</div>${t.why ? `<div style="font-size:13.5px;color:${INK};line-height:1.7;margin-top:2px">${E(t.why)}</div>` : ''}${srcE(t.src)}</div>`).join('');
    // 펀드 표는 웹 페이지에만 두고, 메일에는 파이널 클로즈만 한 줄로(메일 크기를 줄여 클라이언트 잘림·전사 오류를 막는다)
    const fins = a.funds.filter((f) => f.fin), rest = a.funds.length - fins.length;
    if (fins.length || rest) inner += sub('펀드레이징') + `<div style="font-size:13.5px;color:${INK};line-height:1.7">`
      + (fins.length ? `<b style="color:#9A6B00">파이널 클로즈</b> ${fins.map((f) => `${E(f.fund || f.gp)}${f.fund && !f.fund.includes(f.gp) ? ` (${E(f.gp)})` : ''} <b>${E(f.size)}</b>`).join(' · ')}` : '')
      + (rest ? `<div style="font-size:12px;color:${MUT}">모집 개시·기타 클로즈 ${rest}건${withPage ? ' — 웹에서 보기에 표로 정리' : ''}</div>` : '') + '</div>';
    if (!inner) inner = `<div style="font-size:13.5px;color:${MUT}">이번 주 정리할 이슈가 없습니다.</div>`;
    R.push(row(box(inner)));
  }
  R.push(row(`<div style="border-top:1px solid ${LN};padding-top:12px;font-size:11px;color:${MUT};line-height:1.6">${DISC}<br>문장 작성: ${E(M.via)} · 수치·펀드 표: 앱 수집 기록 집계${withPage ? ` · 웹에서 보기: <a href="${E(M.page)}" style="color:${MUT}">${E(M.page)}</a>` : ''}</div>`, '18px 16px 22px'));
  R.push('</table><!--[if mso]></td></tr></table><![endif]--></td></tr></table></div>');
  return R.join('');
}

function plainText(M, withPage) {
  // HTML 을 못 보는 메일 프로그램용 요약본 — 짧게(상세·출처는 HTML 본문과 웹 페이지에)
  const T = [`KB증권 GIS · ${TITLE}`, `${dot(M.date)} (${dow(M.date)}) 기준 · 수집 ${md(M.from)} ~ ${md(M.to)} · 분석 ${M.via}`, withPage ? `웹에서 보기: ${M.page}` : `KB GIS 앱: ${APP}`, '',
    `관련 보도 ${num(M.totals.articles)}건(${delta(M.totals.articles, M.totals.prev) || '—'}) · 딜·펀드 기록 ${num(M.totals.deals)}건`, ''];
  if (M.headline) T.push('[이번 주 한 줄]', M.headline, '');
  if (M.korea) T.push('[한국 투자자 동향]', M.korea, '');
  for (const a of M.assets) {
    T.push(`■ ${a.label} — 보도 ${a.stats.articles} · 딜 ${a.stats.deals} · 파이널 클로즈 ${a.stats.finals}`);
    if (a.summary) T.push(a.summary);
    if (a.gp.length) T.push(`운용사: ${a.gp.map((g) => g.gp).join(', ')}`);
    T.push('');
  }
  T.push('---', DISC);
  return T.join('\n');
}

// 자기완결·태그 균형 검사 — 남의 메일함에서 깨지지 않도록
export function check(html, label) {
  const errs = [];
  if (/<(script|img|link|iframe)[^>]+(src|href)=["']?https?:/i.test(html)) errs.push('외부 리소스 참조');
  for (const t of ['table', 'tr', 'td', 'div', 'section', 'a']) {
    const o = (html.match(new RegExp(`<${t}[\\s>]`, 'g')) || []).length, c = (html.match(new RegExp(`</${t}>`, 'g')) || []).length;
    if (o !== c) errs.push(`<${t}> 열림 ${o} / 닫힘 ${c}`);
  }
  if (errs.length) throw new Error(`${label}: ${errs.join(', ')}`);
}

async function main() {
  const index = JSON.parse(await readFile(new URL('weekly/index.json', ROOT), 'utf8'));
  const want = arg('--date');
  const ent = want ? index.find((x) => x.date === want) : index.slice().sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  if (!ent) { console.log(`NOT_FOUND ${want || ''}`); process.exit(4); }
  // 금요일 저녁에 이번 주 보고서가 아직 없으면 최신은 지난주 금요일(7일 전) → 보내지 않는다.
  // 월요일 따라잡기 발송이면 금요일 보고서(3일 전)가 대상이 된다. 이미 보냈는지는 발송 쪽이 보낸편지함 제목으로 확인.
  if (process.argv.includes('--fresh') && ent.date < kstDaysAgo(6)) {
    console.log(`NOT_READY 최신 보고서 ${ent.date} — 6일 안에 만든 보고서가 없음(이번 주 보고서 생성 전)`);
    process.exit(3);
  }
  const rep = JSON.parse(await readFile(new URL(`weekly/${ent.key || ent.date.replace(/-/g, '')}.json`, ROOT), 'utf8'));
  const M = shape(rep);
  const page = attachment(M);
  check(page, '웹 페이지');
  const pageFile = new URL(`weekly/${M.key}.html`, ROOT);
  if (process.argv.includes('--page')) {
    await writeFile(pageFile, page);
    console.log(`page weekly/${M.key}.html ${Buffer.byteLength(page)}B`);
    if (!arg('--out')) return;
  }
  // 웹 페이지가 저장소에 올라가 있을 때만 '웹에서 보기'를 단다(없는 주소로 보내지 않게)
  const withPage = existsSync(pageFile);
  const mail = emailBody(M, withPage), txt = plainText(M, withPage);
  check(mail, '본문');
  const out = pathToFileURL(resolve(arg('--out') || 'mail-out') + '/');   // 상대·절대 경로 모두
  await mkdir(out, { recursive: true });
  await writeFile(new URL('email.html', out), mail);
  await writeFile(new URL('body.txt', out), txt);
  await writeFile(new URL('page.html', out), page);
  const meta = { subject: M.subject, subjectKey: SUBJECT_KEY, reportDate: M.date, from: M.from, to: M.to, via: M.via, page: withPage ? M.page : null };
  await writeFile(new URL('meta.json', out), JSON.stringify(meta, null, 1) + '\n');
  console.log(`OK ${M.subject}`);
  console.log(`   email.html ${Buffer.byteLength(mail)}B · body.txt ${Buffer.byteLength(txt)}B · 자산군 ${M.assets.length} · 출처 링크 ${(mail.match(/↗/g) || []).length} · 웹에서 보기 ${withPage ? M.page : '없음'}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
