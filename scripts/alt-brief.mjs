#!/usr/bin/env node
/*
 * KB GIS — 매일 아침 해외대체 브리핑(alt-brief.json) — Claude Sonnet 5.5
 *
 * 최근 24시간(주말·휴일 다음 날은 최대 72시간) 수집 기사 가운데 중요한 것(펀드레이징·딜·국내 LP·금액 기사)을 골라
 * "오늘의 해외대체 핵심 3~5줄 + 한국 LP 관점"을 만든다. 홈 화면 '오늘의 해외대체' 카드에 쓴다.
 *  · 근거 기사 id 가 입력에 없는 항목, 자료에 없는 숫자가 들어간 문장은 뺀다(시장현황과 같은 검증).
 *  · 하루 예산 장부(작업 'brief', 하루 $0.12)를 넘으면 만들지 않고 기존 브리핑을 둔다.
 *
 *   node scripts/alt-brief.mjs          # 생성
 *   node scripts/alt-brief.mjs --dry    # 고른 기사·프롬프트 크기만 출력
 */
import { readFile, writeFile } from 'node:fs/promises';
import { openBudget, ask, MODELS, claudeReady, kstDay } from './claude.mjs';
import { numberBag, numbersOk, tidy, _koMoney as koMoney } from './weekly-market.mjs';

const ROOT = new URL('../', import.meta.url);
const readJson = async (f, d) => { try { return JSON.parse(await readFile(new URL(f, ROOT), 'utf8')); } catch { return d; } };
const titleOf = (a) => (a.lang === 'en' && a.tko ? a.tko : a.ko) || '';
const KR_LP = new Set(['연기금', '공제회', '보험·캐피탈', '은행', '중앙회', '운용·증권', '국내 LP']);

const SYSTEM = `당신은 KB증권 글로벌상품영업부(해외 대체투자 펀드를 국내 기관투자자에게 소개하는 부서)의 아침 브리핑 담당입니다.
입력은 최근 수집된 기사 목록(JSON: id, title, source, inst, lead)입니다. 국내 기관투자자 영업에 바로 쓸 아침 브리핑을 씁니다.
- headline: 오늘 가장 중요한 흐름 한 문장(60자 안팎)
- points: 핵심 3~5개. 각 text 는 1~2문장 개조식 보고서체("~함", "~음"), 누가·무엇을·얼마나를 구체적으로. ids 는 근거 기사 id(입력에 있는 것만, 1~3개)
- korea: 국내 기관투자자에게 의미 있는 점 1~2문장(관련 기사가 없으면 "")
규칙: 입력 기사에 적힌 사실·숫자만 씁니다. 운용사·펀드 이름은 영문 그대로, 금액은 원문 표기를 따릅니다. 경어체를 쓰지 않습니다.`;
const SCHEMA = { type: 'object', additionalProperties: false, required: ['headline', 'points', 'korea'], properties: {
  headline: { type: 'string' }, korea: { type: 'string' },
  points: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['text', 'ids'], properties: { text: { type: 'string' }, ids: { type: 'array', items: { type: 'string' } } } } },
} };

async function main() {
  const dry = process.argv.includes('--dry');
  const news = await readJson('news.json', []);
  const inv = ((await readJson('investments.json', {})).items || []);
  const fr = ((await readJson('fundraising.json', {})).items || []);
  const dealIds = new Set([...inv, ...fr].map((e) => e.id));
  const now = Date.now();
  // 월요일 아침이면 주말분까지(최대 72시간)
  const kDow = new Date(now + 9 * 3600e3).getUTCDay();
  const hours = kDow === 1 ? 72 : 30;
  const recent = news.filter((a) => now - Date.parse(a.ts) < hours * 3600e3);
  const score = (a) => (dealIds.has(a.id) ? 3 : 0) + (a.metric ? 2 : 0) + (KR_LP.has(a.instType) ? 1.5 : 0) + (a.instType === '해외 GP' ? 1 : 0) + (a.cat === '마켓' ? 0.5 : 0);
  const seen = new Set();
  const picks = recent.sort((x, y) => score(y) - score(x) || (x.ts < y.ts ? 1 : -1))
    .filter((a) => { const k = titleOf(a).replace(/[^0-9A-Za-z가-힣]/g, '').slice(0, 18).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, 60);
  const items = picks.map((a) => ({ id: a.id, title: titleOf(a), source: a.source || '', inst: a.inst || '', lead: String(a.body || '').replace(/\s+/g, ' ').slice(0, 280) }));
  const prompt = JSON.stringify(items);
  console.log(`alt-brief: 최근 ${hours}시간 기사 ${recent.length}건 중 ${items.length}건 · 프롬프트 ${prompt.length}자`);
  if (dry || !items.length) return;
  if (!claudeReady()) { console.log('ANTHROPIC_API_KEY 없음 — 건너뜀'); return; }

  const budget = await openBudget('brief');
  const r = await ask(budget, { model: MODELS.brief, system: SYSTEM, prompt, maxTokens: 4000, effort: 'medium', schema: SCHEMA });
  await budget.save();
  console.log(budget.summary());
  if (!r || !r.json) { console.log('브리핑을 만들지 못해 기존 브리핑을 둠'); return; }

  const bag = numberBag(prompt);
  const ids = new Set(items.map((x) => x.id));
  const clean = (s) => koMoney(tidy(String(s || '')));
  const dropped = [];
  const ok = (s) => { const t = clean(s); if (t && !numbersOk(t, bag)) { dropped.push(t); return ''; } return t; };
  const points = (r.json.points || []).map((p) => ({ text: ok(p.text), ids: (p.ids || []).map(String).filter((x) => ids.has(x)).slice(0, 3) }))
    .filter((p) => p.text && p.ids.length).slice(0, 5);
  if (!points.length) { console.log('검증을 통과한 항목이 없어 기존 브리핑을 둠'); return; }
  const used = new Set(points.flatMap((p) => p.ids));
  const refs = Object.fromEntries(picks.filter((a) => used.has(a.id)).map((a) => [a.id, { t: titleOf(a), s: a.source || '', u: a.url || '', d: String(a.ts || '').slice(0, 10) }]));
  const out = { date: kstDay(), generatedAt: new Date().toISOString(), via: `claude:${r.model}`, hours, headline: ok(r.json.headline), points, korea: ok(r.json.korea), refs, droppedSentences: dropped.length };
  await writeFile(new URL('alt-brief.json', ROOT), JSON.stringify(out, null, 1) + '\n');
  console.log(`alt-brief ${out.date}: ${points.length}개 항목 (검증으로 뺀 문장 ${dropped.length})`);
  if (dropped.length) console.log(' - ' + dropped.join('\n - '));
}

main().catch((e) => { console.error(e); process.exit(1); });
