// KB GIS — Claude API 공통 모듈: 하루 예산 장부(부서 키, 하루 $3 미만) + 호출 도우미
//
// 예산 규칙 — 어떤 경우에도 하루 합계가 $3를 넘지 않게 두 겹으로 막는다.
//  1) 작업별 하루 한도 JOB_CAP(합계 $2.95). 여러 워크플로가 동시에 돌아도 각자 자기 한도까지만 쓰므로 합계를 넘을 수 없다.
//  2) 전체 하루 한도 DAILY_CAP($2.70) — 작업 시작 시 장부에 적힌 오늘(KST) 사용액 기준.
//  · 호출 전에 '최대 비용'(입력 추정 + max_tokens 를 모두 쓴다고 가정)을 계산해 남은 한도를 넘으면 부르지 않는다
//    → 호출한 쪽이 무료 엔진(Gemini·구글 번역)으로 넘어간다.
//  · 호출 후 응답의 실제 사용량(usage)으로 비용을 계산해 usage/<KST 날짜>.<작업>.json 에 쌓는다(워크플로가 커밋).
// 단가(1M 토큰당 USD, 2026-10 공시가). 캐시 쓰기는 입력의 1.25배, 일괄처리(Batch)는 50%.
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { mkdirSync, writeFileSync } from 'node:fs';

export const PRICES = {
  'claude-haiku-5-5': { in: 0.10, out: 0.50, cr: 0.01, cw: 0.125 },
  'claude-sonnet-5-5': { in: 2, out: 10, cr: 0.20, cw: 2.5 },
  'claude-opus-5-5': { in: 4, out: 20, cr: 0.20, cw: 5 },
  'claude-sonnet-5': { in: 2, out: 10, cr: 0.20, cw: 2.5 },
  'claude-opus-5': { in: 5, out: 25, cr: 0.50, cw: 6.25 },
  'claude-opus-4-8': { in: 5, out: 25, cr: 0.50, cw: 6.25 },
};
const WORST = { in: 10, out: 50, cr: 1, cw: 12.5 };                 // 모르는 모델(서버 폴백 등)은 최상위 단가로
const HAIKU_LONG = { in: 0.50, out: 2.50, cr: 0.05, cw: 0.625 };  // Haiku 5.5 는 프롬프트 10만 토큰 초과분 단가가 다르다

// 작업별 하루 한도(USD). 합계 2.95 < 3.
export const JOB_CAP = { collect: 1.70, weekly: 0.70, gp: 0.35, brief: 0.12, lp: 0.04, test: 0.04 };
export const DAILY_CAP = Math.min(2.7, Number(process.env.LLM_DAILY_CAP) || 2.7);
// 작업별 모델 — 번역·기사 분석·펀드 정보 추출은 Sonnet 5.5, 주간 분석은 Opus 5.5, 대량·단순 판독은 Haiku 5.5
export const MODELS = { tr: 'claude-sonnet-5-5', fund: 'claude-sonnet-5-5', analyze: 'claude-sonnet-5-5', weekly: 'claude-sonnet-5-5', brief: 'claude-sonnet-5-5', gp: 'claude-sonnet-5-5', lp: 'claude-haiku-5-5' };

const DIR = new URL('../usage/', import.meta.url);
export const kstDay = (ms = Date.now()) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);

export function costOf(model, u = {}, batch = false) {
  const inTok = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
  const p = model === 'claude-haiku-5-5' && inTok > 100000 ? HAIKU_LONG : PRICES[model] || WORST;
  const c = ((u.input_tokens || 0) * p.in + (u.output_tokens || 0) * p.out + (u.cache_read_input_tokens || 0) * p.cr + (u.cache_creation_input_tokens || 0) * p.cw) / 1e6;
  return batch ? c / 2 : c;
}
// 입력 토큰 보수적 추정(한글이 섞인 글은 글자 2~3개가 토큰 1개 안팎)
// 입력 토큰 어림 — 일부러 넉넉하게(실측: 주간 프롬프트 한글 2.0만·ASCII 9.1만자 = 6.68만 토큰 → 이 식으로 7.3만).
// 한글은 글자당 약 1토큰, JSON·id·숫자가 많은 ASCII 는 1.8자당 1토큰으로 본다(영문 산문은 실제로 더 적게 든다).
export const estTokens = (s) => {
  const t = String(s || ''); let han = 0, asc = 0;
  for (let i = 0; i < t.length; i++) { const c = t.charCodeAt(i); if (c < 128) asc++; else if (c >= 0xac00 && c <= 0xd7a3) han++; }
  return Math.ceil(han * 1.1 + (t.length - han - asc) + asc / 1.8);
};
export const maxCost = (model, text, maxTokens, batch = false) => costOf(model, { input_tokens: estTokens(text), output_tokens: maxTokens }, batch);

// 예산 열기 — 작업 시작 때 한 번. runCap: 이번 회차 상한(하루에 여러 번 도는 수집용)
export async function openBudget(job, { runCap = Infinity } = {}) {
  const day = kstDay();
  let files = [];
  try { files = await readdir(DIR); } catch {}
  let spentToday = 0, mine = null;
  for (const f of files.filter((x) => x.startsWith(day + '.') && x.endsWith('.json'))) {
    try { const j = JSON.parse(await readFile(new URL(f, DIR), 'utf8')); spentToday += j.cost || 0; if (j.job === job) mine = j; } catch {}
  }
  const rec = mine || { day, job, cost: 0, calls: 0, skipped: 0, tokens: { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 }, byModel: {} };
  const startJob = rec.cost, cap = JOB_CAP[job] || 0;
  let run = 0;
  return {
    day, job, cap,
    remaining() { return Math.max(0, Math.min(DAILY_CAP - spentToday - run, cap - startJob - run, runCap - run)); },
    allow(est) { if (est <= this.remaining()) return true; rec.skipped++; return false; },
    add(model, usage = {}, cost) {
      run += cost; rec.cost = Math.round((rec.cost + cost) * 1e6) / 1e6; rec.calls++;
      rec.tokens.in += usage.input_tokens || 0; rec.tokens.out += usage.output_tokens || 0;
      rec.tokens.cacheRead += usage.cache_read_input_tokens || 0; rec.tokens.cacheWrite += usage.cache_creation_input_tokens || 0;
      rec.byModel[model] = Math.round(((rec.byModel[model] || 0) + cost) * 1e6) / 1e6;
      // 호출마다 바로 장부에 적는다 — 작업이 중간에 죽거나 시간 초과로 끊겨도 쓴 돈이 남도록
      try { rec.updatedAt = new Date().toISOString(); mkdirSync(DIR, { recursive: true }); writeFileSync(new URL(`${day}.${job}.json`, DIR), JSON.stringify(rec, null, 1) + '\n'); } catch {}
    },
    spentRun: () => run,
    async save() {
      if (!rec.calls && !rec.skipped) return;
      rec.updatedAt = new Date().toISOString();
      await mkdir(DIR, { recursive: true });
      await writeFile(new URL(`${day}.${job}.json`, DIR), JSON.stringify(rec, null, 1) + '\n');
    },
    summary() {
      return `claude[${job}] 이번 회차 $${run.toFixed(4)} · 오늘 ${job} $${rec.cost.toFixed(4)}/$${cap} · 오늘 전체 $${(spentToday - startJob + rec.cost).toFixed(4)}/$${DAILY_CAP}`
        + `${rec.skipped ? ` · 한도로 건너뜀 ${rec.skipped}회` : ''}`;
    },
  };
}

let client = null, Anthropic = null, OFF = '';
async function sdk() {
  if (!client) { ({ default: Anthropic } = await import('@anthropic-ai/sdk')); client = new Anthropic(); }
  return client;
}
export const claudeReady = () => !!process.env.ANTHROPIC_API_KEY && !OFF;

// 한 번 묻기 → { text, json, model, cost } | null(키 없음·한도 초과·거절·오류 → 호출한 쪽이 다른 엔진으로)
//  schema: JSON 스키마를 주면 구조화 출력(output_config.format)으로 받아 json 에 파싱해 둔다
//  fallbacks: 안전 분류기가 거절하면 서버가 다른 모델로 이어서 답하게 한다(Opus 5.5 기본 권장)
export async function ask(budget, { model, system, prompt, maxTokens, effort, thinking, schema, fallbacks, stream }) {
  if (!claudeReady() || !budget) return null;
  if (!budget.allow(maxCost(model, (system || '') + prompt, maxTokens))) return null;
  const c = await sdk();
  const req = { model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] };
  if (system) req.system = system;
  const oc = {};
  if (effort) oc.effort = effort;
  if (schema) oc.format = { type: 'json_schema', schema };
  if (Object.keys(oc).length) req.output_config = oc;
  if (thinking) req.thinking = thinking;
  const run = async (withFallback) => {
    if (withFallback) {
      const b = { ...req, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' };
      return stream ? c.beta.messages.stream(b).finalMessage() : c.beta.messages.create(b);
    }
    return stream ? c.messages.stream(req).finalMessage() : c.messages.create(req);
  };
  try {
    let msg;
    try { msg = await run(!!fallbacks); } catch (e) {
      if (fallbacks && e instanceof Anthropic.BadRequestError) msg = await run(false);   // 폴백 미지원 시 그대로
      else throw e;
    }
    // 서버 폴백으로 다른 모델이 이어 답했으면 두 단가 중 비싼 쪽으로 계산(과소 계상 방지)
    const cost = Math.max(costOf(model, msg.usage), costOf(msg.model || model, msg.usage));
    budget.add(msg.model || model, msg.usage, cost);
    if (msg.stop_reason === 'refusal') return null;
    const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    let json = null;
    if (schema) { try { json = JSON.parse(text); } catch {} }
    return { text, json, model: msg.model || model, cost, stop: msg.stop_reason };
  } catch (e) {
    if (Anthropic && (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError)) { OFF = `${e.status}`; console.warn(`claude 인증 오류(${e.status}) — 이번 회차는 무료 엔진으로`); }
    else if (Anthropic && e instanceof Anthropic.RateLimitError) { OFF = '429'; console.warn('claude 429(요청 한도) — 이번 회차는 무료 엔진으로'); }
    else if (Anthropic && e instanceof Anthropic.BadRequestError) console.warn(`claude 400 ${model}: ${String(e.message || '').slice(0, 200)}`);
    else console.warn(`claude 오류 ${model}: ${e.status || ''} ${String(e.message || e).slice(0, 160)}`);
    return null;
  }
}

// 일괄처리(Batch, 50% 할인) — 급하지 않은 주간 작업용. items: [{ id, prompt, system?, maxTokens, schema? }]
// 예산 안에 드는 앞쪽 항목만 보낸다. waitMin 안에 끝나지 않으면 취소하고 끝난 것만 받는다(같은 회차에 정산).
export async function askBatch(budget, items, { model, effort, thinking, waitMin = 45 } = {}) {
  const out = new Map();
  if (!claudeReady() || !budget || !items.length) return out;
  let room = budget.remaining();
  const send = [];
  for (const it of items) {
    const est = maxCost(model, (it.system || '') + it.prompt, it.maxTokens, true);
    if (est > room) break;
    room -= est; send.push(it);
  }
  if (!send.length) { budget.allow(Infinity); return out; }
  const c = await sdk();
  const params = (it) => {
    const p = { model, max_tokens: it.maxTokens, messages: [{ role: 'user', content: it.prompt }] };
    if (it.system) p.system = it.system;
    const oc = {};
    if (effort) oc.effort = effort;
    if (it.schema) oc.format = { type: 'json_schema', schema: it.schema };
    if (Object.keys(oc).length) p.output_config = oc;
    if (thinking) p.thinking = thinking;
    return p;
  };
  try {
    let batch = await c.messages.batches.create({ requests: send.map((it) => ({ custom_id: it.id, params: params(it) })) });
    const until = Date.now() + waitMin * 60e3;
    let canceled = false;
    while (batch.processing_status !== 'ended') {
      if (!canceled && Date.now() > until) { canceled = true; console.warn(`batch ${batch.id}: ${waitMin}분 안에 끝나지 않아 취소 — 끝난 항목만 반영`); await c.messages.batches.cancel(batch.id); }
      await new Promise((r) => setTimeout(r, 20000));
      batch = await c.messages.batches.retrieve(batch.id);
    }
    for await (const r of await c.messages.batches.results(batch.id)) {
      if (r.result.type !== 'succeeded') continue;
      const msg = r.result.message;
      const cost = Math.max(costOf(model, msg.usage, true), costOf(msg.model || model, msg.usage, true));
      budget.add(msg.model || model, msg.usage, cost);
      if (msg.stop_reason === 'refusal') continue;
      const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      let json = null;
      try { json = JSON.parse(text); } catch {}
      out.set(r.custom_id, { text, json });
    }
  } catch (e) {
    console.warn(`claude batch 오류: ${e.status || ''} ${String(e.message || e).slice(0, 160)}`);
  }
  return out;
}
