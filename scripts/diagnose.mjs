/*
 * 진단: 본문 수집 실패·번역 경로를 GitHub Actions 환경에서 직접 확인한다.
 *   node scripts/diagnose.mjs [bodies|translate|gemini|all]
 * (diagnose 워크플로에서 실행 — 샌드박스에서는 국내 언론사·구글 번역이 막혀 있어 Actions 에서 본다)
 */
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fetchArticleText, fetchViaReader, resolveGoogleNewsUrlAsync } from './collect-news.mjs';
const AC = createRequire(import.meta.url)('../article-clean.js');
const mode = process.argv[2] || 'all';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const host = (u) => (String(u).match(/https?:\/\/([^/]+)/) || [])[1] || '?';

async function bodies() {
  const news = JSON.parse(await readFile('news.json', 'utf8'));
  const ko = news.filter((a) => a.lang === 'ko' && !a.fetched);
  // 호스트별로 최대 3건씩 고르게
  const per = {}, pick = [];
  for (const a of ko) { const h = host(a.url); per[h] = (per[h] || 0) + 1; if (per[h] <= 3 && pick.length < 45) pick.push(a); }
  console.log(`== 국문 본문 미확보 ${ko.length}건 중 ${pick.length}건 진단`);
  const rows = [];
  for (const a of pick) {
    const r = { h: host(a.url), src: a.source };
    try {
      let url = a.url;
      if (/news\.google\.com/.test(url)) { const real = await resolveGoogleNewsUrlAsync(url); r.gres = /news\.google\.com/.test(real) ? 'FAIL' : host(real); url = real; }
      if (!/news\.google\.com/.test(url)) {
        const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko,en;q=0.8' }, redirect: 'follow', signal: AbortSignal.timeout(12000) }).catch((e) => ({ err: e.message }));
        if (res.err) r.status = 'ERR ' + res.err.slice(0, 40);
        else {
          r.status = res.status; r.final = host(res.url); r.ct = (res.headers.get('content-type') || '').slice(0, 30);
          const html = await res.text(); r.html = html.length;
          r.bot = /captcha|cf-chl|Access Denied|정상적인 접근|비정상적인 접근|robot|Just a moment/i.test(html.slice(0, 20000)) ? 'BOT' : '';
          r.js = /<noscript|window\.location|location\.replace/i.test(html.slice(0, 4000)) && html.length < 5000 ? 'JSREDIR' : '';
          r.titleInHtml = AC.titleTokens ? AC.titleTokens(a.ko).filter((t) => html.includes(t)).length + '/' + AC.titleTokens(a.ko).length : '';
        }
        const fr = await fetchArticleText(url, a.ko);
        r.ext = (fr.text || '').length; r.via = fr.via || ''; r.match = fr.text ? AC.matchesTitle(a.ko, fr.text) : '';
        if ((fr.text || '').length < 250) { const alt = await fetchViaReader(url); r.reader = (alt || '').length; r.rmatch = alt ? AC.matchesTitle(a.ko, alt) : ''; }
      }
    } catch (e) { r.err = e.message.slice(0, 60); }
    rows.push(r);
    console.log(JSON.stringify(r), '|', a.ko.slice(0, 40));
  }
  const by = {};
  for (const r of rows) { const k = r.gres === 'FAIL' ? 'google 해석 실패' : r.status === 200 ? (r.ext >= 250 ? (r.match ? 'OK(지금은 성공)' : '제목 불일치') : r.reader >= 250 ? '리더로만 성공' : r.bot ? '봇 차단 페이지' : '추출 실패(200)') : `HTTP ${r.status}`; by[k] = (by[k] || 0) + 1; }
  console.log('== 원인별 집계', JSON.stringify(by));
}

async function translate() {
  console.log('== 구글 번역(gtx) 무료 엔드포인트');
  const samples = ['Blackstone closed its latest infrastructure fund at $8.5bn, above its target.', 'KKR agreed to acquire a stake in a Korean data center operator.'];
  let ok = 0, fail = 0;
  for (let i = 0; i < 25; i++) {
    const q = samples[i % 2] + ' ' + i;
    try {
      const r = await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ko&dt=t&q=' + encodeURIComponent(q), { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) });
      if (r.ok) { const j = await r.json(); ok++; if (i < 2) console.log(' ', r.status, (j[0] || []).map((x) => x[0]).join('')); }
      else { fail++; console.log('  HTTP', r.status); }
    } catch (e) { fail++; console.log('  ERR', e.message); }
  }
  console.log(`  25회 연속: 성공 ${ok}, 실패 ${fail}`);
  // 긴 본문(POST)
  const long = Array.from({ length: 12 }, (_, i) => `Paragraph ${i}: Apollo Global Management said its private credit fund saw redemption requests fall in the third quarter, while Ares Management raised $4.2 billion for its structured solutions strategy.`).join('\n\n');
  try {
    const r = await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ko&dt=t', { method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body: 'q=' + encodeURIComponent(long), signal: AbortSignal.timeout(15000) });
    const j = r.ok ? await r.json() : null;
    console.log('  POST long', long.length, 'chars →', r.status, j ? (j[0] || []).map((x) => x[0]).join('').length + ' chars' : '');
    if (j) console.log('  ', (j[0] || []).map((x) => x[0]).join('').slice(0, 200));
  } catch (e) { console.log('  POST ERR', e.message); }
}

async function gemini() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) { console.log('== GEMINI_API_KEY 없음'); return; }
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=200`).catch(() => null);
  if (!r || !r.ok) { console.log('== gemini models HTTP', r && r.status); return; }
  const j = await r.json();
  const names = (j.models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent')).map((m) => m.name.replace('models/', ''));
  console.log('== Gemini generateContent 모델', names.length, names.filter((n) => /flash|gemma/i.test(n)).join(', '));
  for (const m of names.filter((n) => /^(gemini-(flash|2\.\d-flash|flash-lite|2\.\d-flash-lite)(-latest)?|gemma-3-27b-it)$/.test(n)).slice(0, 8)) {
    const t0 = Date.now();
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: 'Translate to Korean: Blackstone closed its fund.' }] }] }), signal: AbortSignal.timeout(60000) }).catch((e) => ({ status: 'ERR ' + e.message }));
    console.log(`  ${m}: ${res.status} ${Date.now() - t0}ms`);
  }
}

if (mode === 'bodies' || mode === 'all') await bodies();
if (mode === 'translate' || mode === 'all') await translate();
if (mode === 'gemini' || mode === 'all') await gemini();
