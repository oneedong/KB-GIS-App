#!/usr/bin/env node
/*
 * KB GIS — 주요 해외 GP 주간 동향 요약(gp-briefs.json) — Claude Sonnet 5.5 일괄처리(Batch, 50% 할인)
 *
 * 최근 14일 기사가 많은 해외 운용사 30곳을 골라, 운용사마다 기사(제목·리드)·펀드레이징·투자내역을 모아
 * "최근 2주 동향 2~3문장 + 핵심 포인트 3~4개(근거 기사)"를 만든다. GP 프로필 화면의 '최근 동향' 상자에 쓴다.
 *  · 근거 기사 id 가 입력에 없는 포인트, 자료에 없는 숫자가 들어간 문장은 뺀다.
 *  · 하루 예산 장부(작업 'gp', 하루 $0.35) 안에 드는 운용사만 보낸다(기사 많은 순).
 *
 *   node scripts/gp-briefs.mjs          # 생성
 *   node scripts/gp-briefs.mjs --dry    # 고른 운용사·예상 비용만 출력
 */
import { readFile, writeFile } from 'node:fs/promises';
import { openBudget, askBatch, MODELS, claudeReady, maxCost, kstDay } from './claude.mjs';
import { numberBag, numbersOk, tidy, _koMoney as koMoney } from './weekly-market.mjs';

const ROOT = new URL('../', import.meta.url);
const readJson = async (f, d) => { try { return JSON.parse(await readFile(new URL(f, ROOT), 'utf8')); } catch { return d; } };
const titleOf = (a) => (a.lang === 'en' && a.tko ? a.tko : a.ko) || '';
const DAYS = 14, TOP = 30, PER_GP = 16;

const SYSTEM = `당신은 KB증권 글로벌상품영업부(해외 대체투자 펀드를 국내 기관투자자에게 소개하는 부서)의 운용사 담당 애널리스트입니다.
한 해외 운용사(GP)에 대한 최근 2주 자료(기사 목록 JSON: id, date, title, lead / 펀드레이징·딜 기록)를 받아, 미팅 준비용 동향을 씁니다.
- summary: 최근 2주 동향 2~3문장(펀드레이징·딜·전략·인사 중 중요한 것)
- points: 핵심 3~4개. 각 text 는 1문장 개조식 보고서체("~함", "~음"), ids 는 근거 기사 id(입력에 있는 것만, 1~2개)
규칙: 자료에 적힌 사실·숫자만 씁니다. 운용사·펀드·인명은 영문 그대로. 경어체를 쓰지 않습니다. 이 운용사와 무관한 기사는 무시합니다.`;
const SCHEMA = { type: 'object', additionalProperties: false, required: ['summary', 'points'], properties: {
  summary: { type: 'string' },
  points: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['text', 'ids'], properties: { text: { type: 'string' }, ids: { type: 'array', items: { type: 'string' } } } } },
} };

async function main() {
  const dry = process.argv.includes('--dry');
  const news = await readJson('news.json', []);
  const fr = await readJson('fundraising.json', { funds: [] });
  const inv = ((await readJson('investments.json', {})).items || []);
  const since = Date.now() - DAYS * 864e5;
  const recent = news.filter((a) => a.instType === '해외 GP' && a.inst && Date.parse(a.ts) >= since);
  const byGp = new Map();
  for (const a of recent) { if (!byGp.has(a.inst)) byGp.set(a.inst, []); byGp.get(a.inst).push(a); }
  const gps = [...byGp.entries()].sort((x, y) => y[1].length - x[1].length).slice(0, TOP);

  const items = [], srcText = {};
  for (const [gp, arts] of gps) {
    const seen = new Set();
    const list = arts.sort((x, y) => (x.ts < y.ts ? 1 : -1))
      .filter((a) => { const k = titleOf(a).replace(/[^0-9A-Za-z가-힣]/g, '').slice(0, 18).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
      .slice(0, PER_GP)
      .map((a) => ({ id: a.id, date: String(a.ts).slice(0, 10), title: titleOf(a), lead: String(a.body || '').replace(/\s+/g, ' ').slice(0, 260) }));
    const funds = (fr.funds || []).filter((f) => f.gp === gp).flatMap((f) => (f.stages || []).filter((s) => Date.parse(s.ts) >= since).map((s) => `${f.fund || '(펀드명 미상)'} ${s.stage} ${s.size || ''} (${String(s.ts).slice(0, 10)})`));
    const deals = inv.filter((e) => e.inst === gp && Date.parse(e.ts) >= since).slice(0, 10).map((e) => `${e.kind} ${e.amount || ''} — ${e.title} (${String(e.ts).slice(0, 10)})`);
    const prompt = `운용사: ${gp}\n기사:\n${JSON.stringify(list)}\n펀드레이징 기록:\n${funds.join('\n') || '없음'}\n딜 기록:\n${deals.join('\n') || '없음'}`;
    srcText[gp] = { prompt, ids: new Set(list.map((x) => x.id)), arts };
    items.push({ id: `gp${items.length}`, gp, system: SYSTEM, prompt, maxTokens: 900, schema: SCHEMA });
  }
  const est = items.reduce((n, it) => n + maxCost(MODELS.gp, it.system + it.prompt, it.maxTokens, true), 0);
  console.log(`gp-briefs: 운용사 ${items.length}곳 · 예상 최대 비용 $${est.toFixed(3)}(일괄처리 50% 반영)`);
  if (dry || !items.length) return;
  if (!claudeReady()) { console.log('ANTHROPIC_API_KEY 없음 — 건너뜀'); return; }

  const budget = await openBudget('gp');
  const res = await askBatch(budget, items, { model: MODELS.gp, thinking: { type: 'between_tools' } });
  await budget.save();
  console.log(budget.summary());

  const prev = await readJson('gp-briefs.json', { gps: {}, refs: {} });
  const out = { updatedAt: kstDay(), via: `claude:${MODELS.gp}`, days: DAYS, gps: { ...(prev.gps || {}) }, refs: { ...(prev.refs || {}) } };
  let made = 0, dropped = 0;
  for (const it of items) {
    const r = res.get(it.id);
    if (!r || !r.json) continue;
    const S = srcText[it.gp], bag = numberBag(S.prompt);
    const ok = (s) => { const t = koMoney(tidy(String(s || ''))); if (t && !numbersOk(t, bag)) { dropped++; return ''; } return t; };
    const points = (r.json.points || []).map((p) => ({ text: ok(p.text), ids: (p.ids || []).map(String).filter((x) => S.ids.has(x)).slice(0, 2) }))
      .filter((p) => p.text && p.ids.length).slice(0, 4);
    const summary = ok(r.json.summary);
    if (!summary && !points.length) continue;
    out.gps[it.gp] = { summary, points, n: S.arts.length, asOf: kstDay() };
    for (const id of points.flatMap((p) => p.ids)) {
      const a = S.arts.find((x) => x.id === id);
      if (a) out.refs[id] = { t: titleOf(a), s: a.source || '', u: a.url || '', d: String(a.ts || '').slice(0, 10) };
    }
    made++;
  }
  // 오래된 요약(4주 넘은 것)과 더는 쓰지 않는 근거는 정리
  const cut = kstDay(Date.now() - 28 * 864e5);
  for (const [g, v] of Object.entries(out.gps)) if ((v.asOf || '') < cut) delete out.gps[g];
  const used = new Set(Object.values(out.gps).flatMap((v) => v.points.flatMap((p) => p.ids)));
  for (const id of Object.keys(out.refs)) if (!used.has(id)) delete out.refs[id];
  await writeFile(new URL('gp-briefs.json', ROOT), JSON.stringify(out, null, 1) + '\n');
  console.log(`gp-briefs: ${made}곳 갱신 (검증으로 뺀 문장 ${dropped})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
