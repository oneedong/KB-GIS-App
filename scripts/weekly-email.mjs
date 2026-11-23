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
 *   node scripts/weekly-email.mjs --out DIR --fresh         # 최신 보고서(그 주 일요일)가 6일보다 오래됐으면(지난주분이 아직 없으면) NOT_READY 출력 후 종료코드 3
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
const md2 = (d) => String(d).slice(5).replace('-', '.');   // 2026-11-08 → 11.08
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
    ].map((x) => ({ stage: x.stage, fin: !!x.fin, gp: x.gp || '', fund: x.fund && x.fund !== x.gp ? x.fund : '', size: x.size || '미상', src: src([x.id], 1) }))
      // 같은 운용사·같은 단계·같은 금액이 이름만 달리 두 번 잡힌 펀드는 하나로(기사마다 펀드명 표기가 달라 생김)
      .filter((f, i, arr) => {
        const key = (g) => `${g.gp.toLowerCase().replace(/[^0-9a-z가-힣]/g, '').slice(0, 8)}|${g.stage}|${g.size.toLowerCase().replace(/\s/g, '')}`;
        return f.size === '미상' || arr.findIndex((g) => key(g) === key(f)) === i;
      });
    return {
      k, label: A.label || k, summary: A.summary || '', status: A.status || '', korea: A.korea || '',
      strategies: A.strategies || [],
      stats: { articles: S.articles || 0, prev: S.prevArticles || 0, deals: S.deals || 0, finals: funds.filter((f) => f.fin).length, launches: funds.filter((f) => !f.fin).length, kr: S.krArticles || 0 },
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
    // 제목 = 보고 주간(월~일). 중복 발송 확인의 기준이므로 형식을 바꾸지 않는다. 예: '… — 2026.11.02~11.08'
    subject: `${SUBJECT_KEY} — ${dot(rep.from)}~${md2(rep.to)}`,
    period: `${dot(rep.from)} (${dow(rep.from)}) ~ ${md2(rep.to)} (${dow(rep.to)})`,
    key: String(rep.date).replace(/-/g, ''),
    page: `${APP}weekly/${String(rep.date).replace(/-/g, '')}.html`,
  };
}

// ── 메일 금액 표기: 외화는 mil·bil 로 통일 ─────────────────────────
// 보고서 문장은 "60억 달러", "3억 8천만 달러", 펀드 표는 "$6bn"·"€548m" 처럼 섞여 있다. 메일에서는
// 외화 금액을 "$6 bil"·"$380 mil"·"€548 mil" 로 맞춘다(원화 "2,145억 원"은 국내 관행대로 그대로 둔다).
// 바꾼 금액 바로 뒤 조사는 '빌·밀'(받침 ㄹ)에 맞춘다: 달러를→bil을, 달러가→bil이, 엔으로→bil로.
const CUR_KO = { 달러: '$', 유로: '€', 파운드: '£', 엔: '¥', 위안: 'CNY ' };
const CUR_PREFIX = { 호주: 'A', 캐나다: 'C', 싱가포르: 'S', 홍콩: 'HK', 뉴질랜드: 'NZ', 미: '', 미국: '' };
const KN = String.raw`(?:\d[\d,]*(?:\.\d+)?\s?조\s?)?(?:\d[\d,]*(?:\.\d+)?\s?억\s?)?(?:\d[\d,]*(?:\.\d+)?\s?(?:천만|백만|만)\s?)?`;
const KO_AMT = new RegExp(String.raw`(A|C|S|HK|NZ|US)?(?<![\d.,])(${KN})(?:\s?[~∼]\s?(${KN}))?\s?(?:(호주|캐나다|싱가포르|홍콩|뉴질랜드|미국|미)\s?)?(달러|유로|파운드|엔(?!비디)|위안)(으로|를|가(?![치량격])|는|와|였)?`, 'g');
const koVal = (t) => {
  const g = (re) => { const m = String(t).match(re); return m ? Number(m[1].replace(/,/g, '')) : 0; };
  const cheonman = g(/(\d[\d,]*(?:\.\d+)?)\s?천만/), baekman = g(/(\d[\d,]*(?:\.\d+)?)\s?백만/);
  const man = cheonman || baekman ? 0 : g(/(\d[\d,]*(?:\.\d+)?)\s?만/);
  return g(/(\d[\d,]*(?:\.\d+)?)\s?조/) * 1e12 + g(/(\d[\d,]*(?:\.\d+)?)\s?억/) * 1e8 + cheonman * 1e7 + baekman * 1e6 + man * 1e4;
};
const mbNum = (x) => Number(x.toFixed(2)).toLocaleString('en-US', { maximumFractionDigits: 2 });
const mbFmt = (v, sym) => (v >= 1e9 ? `${sym}${mbNum(v / 1e9)} bil` : `${sym}${mbNum(v / 1e6)} mil`);
export function toMB(text) {
  let s = String(text ?? '');
  // ① 기호·영문 단위: "$6bn" "€548m" "¥60bn" "A$1.2 billion" → "$6 bil" "€548 mil" ...
  s = s.replace(/((?:A|C|S|HK|NZ|US)?[$€£¥₩])\s?(\d[\d,]*(?:\.\d+)?)\s?(billion|bn|b|million|mn|m)\b/gi,
    (m, c, n, u) => `${c === 'US$' ? '$' : c}${n} ${/^b/i.test(u) ? 'bil' : 'mil'}`);
  // ② 한글 단위 + 외화: "60억 달러" "3억 8천만 달러" "80억~100억 달러" "약 2조엔" → "$6 bil" "$380 mil" "$8~10 bil" "약 ¥2,000 bil"
  s = s.replace(KO_AMT, (m, pre, a, b, land, cur, josa) => {
    if (!/[조억만]/.test(a) || (b && !/[조억만]/.test(b))) return m;   // 단위 없는 숫자("63.25달러")는 그대로
    const sym = (pre && pre !== 'US' ? pre : CUR_PREFIX[land] || '') + CUR_KO[cur];
    const va = koVal(a), vb = b ? koVal(b) : 0;
    let out;
    if (!b) out = mbFmt(va, sym);
    else if ((va >= 1e9) === (vb >= 1e9)) out = `${sym}${mbNum(va / (vb >= 1e9 ? 1e9 : 1e6))}~${mbFmt(vb, '')}`;
    else out = `${mbFmt(va, sym)}~${mbFmt(vb, sym)}`;
    const J = { 를: '을', 가: '이', 는: '은', 와: '과', 였: '이었', 으로: '로' };
    return out + (josa ? J[josa] : '');
  });
  return s;
}
// 메일에 쓰는 문장 전체에 금액 표기 적용(웹 페이지는 그대로)
function mailShape(M) {
  const t = toMB;
  return {
    ...M, headline: t(M.headline), korea: t(M.korea),
    assets: M.assets.map((a) => ({
      ...a, summary: t(a.summary), status: t(a.status), korea: t(a.korea),
      gp: a.gp.map((g) => ({ ...g, text: t(g.text) })),
      trends: a.trends.map((x) => ({ ...x, trend: t(x.trend), why: t(x.why) })),
      funds: a.funds.map((f) => ({ ...f, size: t(f.size) })),
      kr: a.kr.map((d) => ({ ...d, amount: t(d.amount) })),
    })),
  };
}
// 긴 단락은 문장마다 줄을 나눠 훑어보기 쉽게("~함. ~음." 단위, 숫자의 소수점·영문 약어는 나누지 않음)
export const sentences = (t) => String(t || '').replace(/([가-힣)\]%])\.\s+(?=\S)/g, '$1.\n').split('\n').map((x) => x.trim()).filter(Boolean);

const DISC = '본 메일은 KB증권 GIS를 위해 자동 생성된 주간 시장현황입니다. KB GIS 앱이 한 주간 수집한 공개 언론 보도를 집계·요약한 것으로 투자자문이 아니며, 원문 확인 후 활용하시기 바랍니다. 요약 문장 중 수집 자료에 없는 숫자가 들어간 문장은 자동으로 제외됩니다.';

// ── 첨부 HTML (독립 문서) ────────────────────────────────────────
const CSS = `:root{--y:#FFBC00;--y2:#FFCC00;--ys:#FFF4D1;--g:#60584C;--ink:#545045;--mut:#60584C;--ln:#DEDCD8;--bg:#F2F1EF;--cd:#fff;--ch:#ECEAE6;--bl:#85714D;--sil:#8A8D8F}
@media(prefers-color-scheme:dark){:root{--ys:#3A3220;--g:#D4CEC4;--ink:#F2F0EC;--mut:#B8B2A8;--ln:#4A463F;--bg:#2A2823;--cd:#35322C;--ch:#403C35;--bl:#C9B48A;--sil:#A6A9AB}}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif;font-size:16px;line-height:1.6;-webkit-text-size-adjust:100%;word-break:keep-all}
a{color:inherit;text-decoration:underline;text-decoration-color:var(--y);text-decoration-thickness:2px;text-underline-offset:3px}
.top{height:5px;background:var(--y)}.wrap{max-width:780px;margin:0 auto;padding:22px 16px 64px}
.tb{display:flex;justify-content:space-between;align-items:center;gap:10px;margin:-8px 0 14px}.inf{font-size:11px;color:var(--mut)}.inf a{color:var(--mut);text-decoration-thickness:1px;word-break:break-all}.mb{flex:none;font-size:12px;font-weight:800;color:#545045;background:var(--y);padding:5px 11px;border-radius:99px;text-decoration:none}
.br{font-size:12px;font-weight:800;letter-spacing:.06em;color:var(--g);display:flex;align-items:center;gap:7px}.br i{width:10px;height:10px;background:var(--y);display:inline-block;border-radius:2px}
h1{font-size:23px;line-height:1.3;margin:8px 0;letter-spacing:-.02em}.mt{font-size:13px;color:var(--mut)}.mt b{color:var(--ink)}
.tg{display:inline-block;font-size:11.5px;font-weight:700;padding:2px 9px;border-radius:99px;background:var(--ch);color:var(--mut);white-space:nowrap;margin:0 4px 4px 0}.tg.k{background:var(--y);color:#545045}.tg.f{background:var(--g);color:var(--bg)}
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
.fd tr.fin td{background:var(--ys)}.fd .stg{font-size:12px;font-weight:800;color:var(--bl);white-space:nowrap}.fd tr.fin .stg{color:var(--bl)}
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
  H.push(`<header><div class="br"><i></i>KB증권 GIS · GLOBAL ALTERNATIVES WEEKLY</div><h1>${TITLE}</h1><div class="mt"><b>${E(M.period)}</b> 주간 · 분석 ${E(M.via)}</div></header>`);
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
// 메일 프로그램(특히 Outlook)은 바깥 표의 글꼴·크기·줄간격을 안쪽 칸에 물려주지 않고, div 의 여백·테두리도
// 무시한다. 그래서 글자가 들어가는 모든 칸(td)에 글꼴·크기·줄간격·색을 직접 넣고, 여백은 td padding 으로만 준다.
// 구성은 훑어보기 좋게: 전폭 헤더 → 핵심 수치 → 이번 주 한 줄 → 자산군별 한 줄 → 자산군별 상세(진한 띠 + 글머리표).
// KB금융그룹 색 규정 — 주색: KB Yellow Positive #FFBC00(Pantone 130C) · KB Yellow Negative #FFCC00(1235C) · KB Gray #60584C(404C)
// 보조색: KB Dark Gray #545045(411C) · KB Gold(872C, 화면용 근사 #85714D) · KB Silver(877C, 근사 #8A8D8F).
// 연한 바탕·구분선은 이 색들의 옅은 톤만 쓴다(파랑·빨강 등 규정 밖 색은 쓰지 않음).
const Y = '#FFBC00', Y2 = '#FFCC00', GR = '#60584C', INK = '#545045', GOLD = '#85714D', SIL = '#8A8D8F';
const YS = '#FFF4D1', CH = '#F2F1EF', LN = '#DEDCD8', MUT = GR, BL = GOLD, UP = GOLD, DOWN = SIL;
const FT = "font-family:'Malgun Gothic','맑은 고딕',sans-serif;";
const TB = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"';
const X = (size, lh, color = INK) => `${FT}font-size:${size}px;line-height:${lh};color:${color};`;   // 글자 칸 공통
const ROW = (inner, st = '', bg = '') => `<tr><td${bg ? ` bgcolor="${bg}"` : ''} style="${st.includes('font-family') ? '' : FT}${st}">${inner}</td></tr>`;
const dChip = (cur, prev) => {
  if (!prev) return '';
  const p = Math.round(((cur - prev) / prev) * 100);
  return `<span style="color:${p > 0 ? UP : p < 0 ? DOWN : MUT};font-weight:bold">${p > 0 ? '▲' : p < 0 ? '▼' : '–'}${Math.abs(p)}%</span>`;
};
const label = (t) => ROW(`<span style="color:${Y}">■</span> ${E(t)}`, `${X(13.5, 1.4, GR)}font-weight:bold;padding:16px 16px 6px`);
// 금액 강조 — 외화(mil·bil)와 원화(억·조 원) 금액을 굵게
const AMT_RE = /((?:A|C|S|HK|NZ)?[$€£¥]|CNY )\d[\d,]*(?:\.\d+)?(?:~\d[\d,]*(?:\.\d+)?)?\s(?:bil|mil)\b|\d[\d,]*(?:\.\d+)?\s?조(?:\s?\d[\d,]*\s?억)?\s?원|\d[\d,]*(?:\.\d+)?\s?억\s?원/g;
const R_ = (t) => E(t).replace(AMT_RE, (m) => `<b style="color:${INK};white-space:nowrap">${m}</b>`);   // 금액이 줄 끝에서 '$606 / mil' 로 갈라지지 않게
const para = (t, st = '') => ROW(R_(t), `${X(15, 1.7)}padding:0 16px 4px;${st}`);
// 문장이 둘 이상이면 문장마다 한 줄(짧은 대시 글머리) — 한 덩어리 단락보다 훑어보기 쉽다
const prose = (t) => {
  const ss = sentences(t);
  if (ss.length < 2) return para(t);
  return ROW(`${TB}>${ss.map((x) => `<tr><td width="14" valign="top" style="font-size:15px;line-height:1.7;color:${GOLD}">–</td><td style="${X(15, 1.7)}padding-bottom:6px">${R_(x)}</td></tr>`).join('')}</table>`, 'padding:0 16px 4px');
};
const src = (s) => s.length ? ` <a href="${E(s[0].u)}" style="color:${GOLD};font-size:12.5px;text-decoration:underline">${E(s[0].m)}</a>` : '';
// 글머리표 목록 — 표 한 개(Outlook 에서도 들여쓰기 유지)
const bullets = (items) => !items.length ? '' : ROW(`${TB}>${items.map((h) => `<tr><td width="16" valign="top" style="font-size:15px;line-height:1.7;color:${Y};font-weight:bold">•</td><td style="${X(15, 1.7)}padding-bottom:9px">${h}</td></tr>`).join('')}</table>`, 'padding:0 16px 2px');
// 자산군 바로가기 — 메일 안 앵커(#a-PE 등)로 이동. Outlook(PC)·Gmail(웹)·Apple Mail 에서 동작하고,
// 일부 휴대폰 메일 앱은 메일 안 이동을 지원하지 않는다(그때는 '웹에서 보기'의 같은 목차를 쓰면 된다).
const anchorTo = (id) => `<a name="${id}" id="${id}" style="font-size:0;line-height:0">&nbsp;</a>`;
const navChip = (a) => `<a href="#a-${a.k}" style="display:inline-block;margin:0 6px 8px 0;padding:8px 12px;border:1px solid ${LN};border-radius:3px;background:#FFFFFF;${FT}font-size:14px;line-height:1.3;color:${INK};font-weight:bold;text-decoration:none;white-space:nowrap">${E(a.label)} <span style="color:${GOLD};font-weight:normal">${num(a.stats.articles)}</span></a>`;

function emailBody(M, withPage) {
  const WEB = withPage ? M.page : APP;
  const fin = M.assets.reduce((n, a) => n + a.stats.finals, 0);
  const R = [];
  R.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="background:#FFFFFF;word-break:keep-all">`);
  // 헤더 — 전폭 노란 띠
  R.push(ROW(`${anchorTo('top')}<span style="${X(12, 1.4)}font-weight:bold;letter-spacing:1px">KB증권 GIS · GLOBAL ALTERNATIVES WEEKLY</span>`, 'padding:18px 16px 2px', Y));
  R.push(ROW(TITLE, `${X(24, 1.35)}font-weight:bold;padding:2px 16px 2px`, Y));
  R.push(ROW(`<b>${E(M.period)}</b> 주간 · 분석 ${E(M.via)}`, `${X(14, 1.5)}padding:2px 16px 14px`, Y));
  R.push(ROW(`<a href="${WEB}" style="color:${INK};font-weight:bold;text-decoration:underline">${withPage ? '웹에서 보기 (휴대폰 화면에 맞춤)' : 'KB GIS 앱에서 보기'} &#8250;</a>`, `${X(13.5, 1.4)}padding:0 16px 16px`, Y));
  // 핵심 수치 3칸
  const kpi = (n, l, extra) => `<td width="33%" valign="top" style="${X(12.5, 1.5, MUT)}padding:14px 6px 14px 16px"><span style="${X(26, 1.2)}font-weight:bold">${n}</span><br>${l}${extra ? ` ${extra}` : ''}</td>`;
  R.push(`<tr><td bgcolor="${CH}" style="background:${CH}">${TB}><tr>${kpi(num(M.totals.articles), '관련 보도', dChip(M.totals.articles, M.totals.prev))}${kpi(num(M.totals.deals), '딜·펀드 기록')}${kpi(num(fin), '파이널 클로즈')}</tr></table></td></tr>`);
  // 자산군 바로가기(누르면 메일 안 해당 자산군으로 이동)
  R.push(ROW(`${anchorTo('nav')}자산군 바로가기 <span style="font-weight:normal;color:${MUT};letter-spacing:0">· 숫자는 이번 주 보도 건수</span>`, `${X(13, 1.4, GR)}font-weight:bold;letter-spacing:1px;padding:16px 16px 8px`));
  R.push(ROW(M.assets.map(navChip).join(''), 'padding:0 10px 6px 16px'));
  // 이번 주 한 줄
  if (M.headline) {
    R.push(ROW('이번 주 한 줄', `${X(13, 1.4, GR)}font-weight:bold;letter-spacing:1px;padding:18px 16px 4px`));
    R.push(ROW(R_(M.headline), `${X(18, 1.6)}font-weight:bold;padding:0 16px 6px`));
  }
  // 한국 투자자 동향
  if (M.korea) { R.push(label('한국 투자자 동향')); R.push(prose(M.korea)); }
  if (M.krShare.length) R.push(ROW(M.krShare.map((x) => `${E(x.label)} <b>${x.articles}</b>건${x.deals ? `·딜 <b>${x.deals}</b>` : ''}`).join(' &nbsp;|&nbsp; '), `${X(13, 1.6, MUT)}padding:4px 16px 4px`));
  // 자산군별 한 줄
  R.push(label('자산군별 한 줄'));
  R.push(bullets(M.assets.map((a) => `<a href="#a-${a.k}" style="color:${INK};font-weight:bold;text-decoration:none">${E(a.label)} &#8250;</a> <span style="color:${MUT};font-size:13px">${num(a.stats.articles)}건 ${dChip(a.stats.articles, a.stats.prev)}</span><br>${R_(a.summary || '—')}`)));
  // 자산군별 상세 — 진한 띠로 구획
  for (const a of M.assets) {
    R.push(ROW(`${anchorTo('a-' + a.k)}`, 'font-size:14px;line-height:14px'));
    R.push(ROW(`${E(a.label)}<br><span style="${X(13, 1.6, Y2)}font-weight:normal">보도 ${num(a.stats.articles)}건 ${a.stats.prev ? `(전주 ${num(a.stats.prev)}) ` : ''}· 딜 ${num(a.stats.deals)} · 파이널 클로즈 ${a.stats.finals}</span>`, `${X(19, 1.4, '#FFFFFF')}font-weight:bold;padding:12px 16px`, INK));
    if (a.status) { R.push(label('시장 현황')); R.push(prose(a.status)); }
    if (a.gp.length) {
      R.push(label('운용사별 이슈'));
      R.push(bullets(a.gp.slice(0, 4).map((g) => `<b>${E(g.gp)}</b> ${R_(g.text)}${src(g.src)}`)));
      if (a.gp.length > 4 && withPage) R.push(ROW(`외 ${a.gp.length - 4}건 — <a href="${E(M.page)}#a-${a.k}" style="color:${BL}">웹에서 보기</a>`, `${X(13, 1.5, MUT)}padding:0 16px 4px 32px`));
    }
    if (a.trends.length) {
      R.push(label('트렌드와 그 이유'));
      R.push(bullets(a.trends.map((t) => `<b>${R_(t.trend)}</b>${t.why ? `<br>${R_(t.why)}` : ''}${src(t.src)}`)));
    }
    if (a.korea || a.kr.length) {
      R.push(label('한국 투자자'));
      if (a.korea) R.push(prose(a.korea));
      if (a.kr.length) R.push(bullets(a.kr.slice(0, 3).map((d) => `<b>${E(d.inst)}</b> ${E(d.kind)}${d.amount ? ` <b>${E(d.amount)}</b>` : ''}${src(d.src)}`)));
    }
    const fins = a.funds.filter((f) => f.fin), rest = a.funds.length - fins.length;
    if (fins.length) {
      R.push(label('파이널 클로즈'));
      R.push(ROW(`${TB}>${fins.map((f, i) => `<tr><td style="${X(14.5, 1.5)}padding:7px 8px 7px 0;${i ? `border-top:1px solid ${LN}` : ''}">${E(f.fund || f.gp)}${f.fund && !f.fund.includes(f.gp) ? ` <span style="color:${MUT};font-size:12.5px">${E(f.gp)}</span>` : ''}</td><td align="right" valign="top" style="${X(14.5, 1.5)}font-weight:bold;white-space:nowrap;padding:7px 0;${i ? `border-top:1px solid ${LN}` : ''}">${E(f.size)}</td></tr>`).join('')}</table>`, 'padding:0 16px 4px'));
    }
    if (rest && withPage) R.push(ROW(`모집 개시·기타 클로즈 ${rest}건 — <a href="${E(M.page)}#a-${a.k}" style="color:${BL}">웹에서 표로 보기</a>`, `${X(13, 1.5, MUT)}padding:4px 16px 4px`));
    R.push(ROW(`<a href="#nav" style="color:${GOLD};text-decoration:none">&#9650; 자산군 바로가기</a>`, `${X(12.5, 1.4, GOLD)}text-align:right;padding:10px 16px 6px`));
    R.push(ROW('&nbsp;', 'font-size:10px;line-height:10px'));
  }
  R.push(ROW('&nbsp;', 'font-size:8px;line-height:8px', CH));
  R.push(ROW(`${DISC}<br>문장 작성: ${E(M.via)} · 수치·펀드: 앱 수집 기록 집계${withPage ? ` · <a href="${E(M.page)}" style="color:${MUT}">웹에서 보기</a>` : ''} · <a href="${APP}" style="color:${MUT}">KB GIS 앱</a>`, `${X(12, 1.6, MUT)}padding:14px 16px 20px`));
  R.push('</table>');
  return R.join('');
}

function plainText(M, withPage) {
  // HTML 을 못 보는 메일 프로그램용 요약본 — 짧게(상세·출처는 HTML 본문과 웹 페이지에)
  const T = [`KB증권 GIS · ${TITLE}`, `${M.period} 주간 · 분석 ${M.via}`, withPage ? `웹에서 보기: ${M.page}` : `KB GIS 앱: ${APP}`, '',
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

function selftest() {
  const cases = [
    ['Pantheon이 60억 달러 규모 세컨더리 펀드', 'Pantheon이 $6 bil 규모 세컨더리 펀드'],
    ['약 3억 8천만 달러)를 출시함', '약 $380 mil)를 출시함'],
    ['Pantheon·Mirova 5억 4,800만 유로 세컨더리', 'Pantheon·Mirova €548 mil 세컨더리'],
    ['7억6천만 달러 상업용', '$760 mil 상업용'],
    ['2억 1250만 달러에 인수함', '$212.5 mil에 인수함'],
    ['6억 600만 달러 등', '$606 mil 등'],
    ['1억 4,000만 유로에 인수함', '€140 mil에 인수함'],
    ['5,750만 달러를 투자함', '$57.5 mil을 투자함'],
    ['1,230억 달러를 기록함', '$123 bil을 기록함'],
    ['36억 달러를 모집', '$3.6 bil을 모집'],
    ['260억 달러가 몰림', '$26 bil이 몰림'],
    ['45억 달러로 파이널 클로즈', '$4.5 bil로 파이널 클로즈'],
    ['130억 유로에 이름', '€13 bil에 이름'],
    ['50억 달러였음', '$5 bil이었음'],
    ['80억~100억 달러 밸류에이션', '$8~10 bil 밸류에이션'],
    ['5억~12억 유로', '€500 mil~€1.2 bil'],
    ['A2억 350만 달러에 인수함', 'A$203.5 mil에 인수함'],
    ['약 2조엔(JLL)으로', '약 ¥2,000 bil(JLL)으로'],
    ['2500억엔으로 매각', '¥250 bil로 매각'],
    ['5억 호주달러', 'A$500 mil'],
    ['주당 63.25달러, 가치 1억 달러', '주당 63.25달러, 가치 $100 mil'],
    ['2,145억 원을 완납', '2,145억 원을 완납'],
    ['240조 원에 이른다', '240조 원에 이른다'],
    ['달러 가치 하락, 엔비디아 1억 달러가치', '달러 가치 하락, 엔비디아 $100 mil가치'],
    ['$6bn', '$6 bil'], ['$27.5m', '$27.5 mil'], ['€552m ($619m)', '€552 mil ($619 mil)'], ['¥60bn', '¥60 bil'],
    ['£425m', '£425 mil'], ['A$1.2bn 이상', 'A$1.2 bil 이상'], ['Rs 6,200 crore', 'Rs 6,200 crore'], ['647MW·24GWh·$1.12', '647MW·24GWh·$1.12'],
  ];
  const bad = cases.filter(([a, b]) => toMB(a) !== b).map(([a, b]) => `  ${a} → ${toMB(a)} (기대: ${b})`);
  const sx = sentences('국민연금은 6.0% 이상으로 높임. U.S. 시장에서 Inc. 가 늘었음. 마지막 문장(괄호)임.');
  const okS = sx.length === 3 && sx[0].endsWith('높임.') && sx[1].includes('U.S. 시장에서 Inc. 가');
  if (bad.length || !okS) { console.log('SELFTEST FAIL\n' + bad.join('\n') + (okS ? '' : `\n  문장 나누기: ${JSON.stringify(sx)}`)); process.exit(1); }
  console.log(`금액 표기 ${cases.length}/${cases.length} ok · 문장 나누기 ok\nSELFTEST PASS`);
}

async function main() {
  if (process.argv.includes('--selftest')) return selftest();
  const index = JSON.parse(await readFile(new URL('weekly/index.json', ROOT), 'utf8'));
  const want = arg('--date');
  const ent = want ? index.find((x) => x.date === want) : index.slice().sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  if (!ent) { console.log(`NOT_FOUND ${want || ''}`); process.exit(4); }
  // 월요일 아침에 지난주(일요일 보고일) 보고서가 아직 없으면 최신은 8일 전 일요일분 → 보내지 않는다.
  // 화요일 따라잡기여도 어제 그제 일요일분(1~2일 전)이 대상. 이미 보냈는지는 발송 쪽이 보낸편지함 제목으로 확인.
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
  const MM = mailShape(M);                       // 메일은 외화 금액을 mil·bil 로(웹 페이지는 그대로)
  const mail = emailBody(MM, withPage), txt = plainText(MM, withPage);
  check(mail, '본문');
  // 메일 안 이동 링크(#…)마다 도착 지점이 있는지
  const dead = [...mail.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]).filter((id) => !mail.includes(`name="${id}"`));
  if (dead.length) throw new Error(`본문: 도착 지점 없는 이동 링크 ${[...new Set(dead)].join(', ')}`);
  const out = pathToFileURL(resolve(arg('--out') || 'mail-out') + '/');   // 상대·절대 경로 모두
  await mkdir(out, { recursive: true });
  await writeFile(new URL('email.html', out), mail);
  await writeFile(new URL('body.txt', out), txt);
  await writeFile(new URL('page.html', out), page);
  const meta = { subject: M.subject, subjectKey: SUBJECT_KEY, reportDate: M.date, from: M.from, to: M.to, via: M.via, page: withPage ? M.page : null };
  await writeFile(new URL('meta.json', out), JSON.stringify(meta, null, 1) + '\n');
  console.log(`OK ${M.subject}`);
  console.log(`   email.html ${Buffer.byteLength(mail)}B · body.txt ${Buffer.byteLength(txt)}B · 자산군 ${M.assets.length} · 링크 ${(mail.match(/<a href/g) || []).length} · 웹에서 보기 ${withPage ? M.page : '없음'}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
