/**
 * 🥊 เทียบ system message ของ ChatBot n8n (AI Agent1) แบบเดิม vs เดิม+addendum (ระดับความมั่นใจ + ตรวจก่อนส่ง) — 21 ต.ค. 69
 *   เคส: scripts/bench-cases-2026-10-21.json (24 ข้อความลูกค้าจริงจาก LINE + ประวัติ) · โมเดล gemini-3.8-flash temp 0.4 thinkingLevel low (ค่าเดียวกับ n8n ผ่าน gemini-proxy)
 *   จำลอง tool: เรียก priceSearch ในโปรเซส (= search_pricing) + ค้นคลังความรู้ Firestore แบบ bigram (≈ website_knowledge/product_knowledge) แล้วแปะใน "📎 ข้อมูลเสริม"
 *   ⚠️ ไม่ใช่ function-calling จริง (agent n8n เรียก tool เอง) · ไม่มี Pinecone/รูป/โปรไฟล์ลูกค้า — ใช้เทียบ "ผลของ prompt" เท่านั้น ไม่ใช่วัดคุณภาพสัมบูรณ์
 *   กรรมการ: Claude Sonnet 5.5 เทียบคู่ (สลับลำดับ A/B สุ่ม) ให้คะแนน + ธง แต่ง/โยนแอดมินเกิน/ถามซ้ำ
 *
 *   npx tsx --conditions=react-server scripts/bench-chatbot-addendum.mts [--runs 1] [--out <dir>]
 *   ⚠️ เรียกโมเดลตรง ไม่ลงบัญชีค่าใช้จ่าย /admin/chatbot/costs
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("=");
  if (i > 0 && !l.trim().startsWith("#") && !process.env[l.slice(0, i).trim()]) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const { priceSearch } = await import("../src/lib/server/price-search");
const { getChatFirestore } = await import("../src/lib/server/firebase-admin");
const Anthropic = (await import("@anthropic-ai/sdk")).default;

const args = process.argv.slice(2);
const argOf = (k: string, d: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const RUNS = Number(argOf("--runs", "1"));
const OUT = argOf("--out", `${ROOT}/docs/n8n-site-price/bench-addendum-2026-10-21`);
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
const MODEL = "gemini-3.8-flash";

type Case = { i: number; q: string; history: { role: string; text: string; at: string }[] };
const cases: Case[] = JSON.parse(readFileSync(`${ROOT}/scripts/bench-cases-2026-10-21.json`, "utf8"));
const base = readFileSync(`${ROOT}/docs/n8n-site-price/chatbot-system-message.txt`, "utf8");
const persona = readFileSync(`${ROOT}/docs/n8n-site-price/line-persona-rules.txt`, "utf8");
// --addendum <ไฟล์> เลือกฉบับที่จะเทียบ (v1 ค่าเริ่มต้น · v2 = system-prompt-addendum-checklist-v2.txt) · ใช้คู่กับ --out โฟลเดอร์ผลแยก (คัดลอก prep.json + คำตอบ base จากรอบก่อนมาได้ ไม่ต้องยิงซ้ำ)
const ADDENDUM_FILE = argOf("--addendum", `${ROOT}/docs/n8n-site-price/system-prompt-addendum-confidence.txt`);
const addendum = readFileSync(ADDENDUM_FILE, "utf8").replace(/^\[.*?\]\n+/s, "");

// ── 1) ข้อมูลที่ tool จะคืน (เตรียมครั้งเดียว ใช้ทั้ง 2 แบบ) ───────────────────────────────
const prepPath = `${OUT}/prep.json`;
type Prep = { i: number; pricing: string; found: boolean; kb: string };
let prep: Prep[] = existsSync(prepPath) ? JSON.parse(readFileSync(prepPath, "utf8")) : [];
if (prep.length !== cases.length) {
  const db = getChatFirestore()!;
  const kbSnap = await db.collection("knowledge-base").get();
  const kb = kbSnap.docs.map((d) => ({ t: String(d.data().title ?? d.data().name ?? ""), c: String(d.data().content ?? d.data().answer ?? "") })).filter((x) => x.t && x.c);
  const grams = (s: string) => {
    const t = s.replace(/[\s\p{P}]/gu, "").toLowerCase();
    const g = new Set<string>();
    for (let i = 0; i + 2 <= t.length; i++) g.add(t.slice(i, i + 2));
    return g;
  };
  const kbG = kb.map((x) => ({ ...x, g: grams(`${x.t} ${x.c.slice(0, 200)}`) }));
  prep = [];
  for (const c of cases) {
    const r = await priceSearch({ query: c.q, history: c.history, noFallback: true });
    const b = r.body as Record<string, unknown>;
    const found = !!b.found;
    const links = ((b.products as { name: string; url: string }[] | undefined) ?? []).map((p) => `${p.name}: ${p.url}`).join("\n");
    const pricing = found
      ? `[ผล search_pricing]\n${String(b.answer ?? b.text ?? "")}${links ? `\nลิงก์สินค้า:\n${links}` : ""}`
      : `[ผล search_pricing] ไม่พบข้อมูลตรงกับคำถามนี้ (${String(b.source ?? "")})`;
    const qg = grams(c.q);
    const top = kbG
      .map((x) => ({ x, s: [...qg].filter((g) => x.g.has(g)).length / Math.sqrt(x.g.size + 1) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 3)
      .map(({ x }) => `• ${x.t}\n  ${x.c.slice(0, 500)}`);
    prep.push({ i: c.i, found, pricing, kb: `[website_knowledge / product_knowledge]\n${top.join("\n")}` });
    console.log(`prep ${c.i}: found=${found}`);
  }
  writeFileSync(prepPath, JSON.stringify(prep, null, 1));
}

// ── 2) ประกอบ system message แบบเดียวกับ n8n (แทน {{ }}) ────────────────────────────────
const fmtHist = (h: Case["history"]) => (h.length ? h.map((m) => `${/assistant|admin|bot|shop/i.test(m.role) ? "แอดมิน" : "ลูกค้า"}: ${m.text}`).join("\n") : "(ครั้งแรกที่คุย)");
function systemFor(c: Case, p: Prep, withAddendum: boolean): string {
  let s = base;
  if (withAddendum) s = s.replace("{{ $json.body.personaPrompt || '' }}", `${addendum.trim()}\n\n{{ $json.body.personaPrompt || '' }}`);
  return s
    .replace("{{ $json.body.personaPrompt || '' }}", persona.trim())
    .replace("{{ $json.body.systemMessage || '(ไม่มีข้อมูลเสริม)' }}", `${p.pricing}\n\n${p.kb}`)
    .replace("{{ $json.body.conversationHistory || '(ครั้งแรกที่คุย)' }}", fmtHist(c.history));
}

async function gemini(system: string, user: string): Promise<{ text: string; ms: number; outTok: number; thoughtTok: number; inTok: number }> {
  const t0 = Date.now();
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 2048, thinkingConfig: { thinkingLevel: "low" } },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; usageMetadata?: Record<string, number>; error?: { message: string } };
  if (!res.ok) throw new Error(j.error?.message || `HTTP ${res.status}`);
  const text = (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
  const u = j.usageMetadata ?? {};
  return { text, ms: Date.now() - t0, outTok: u.candidatesTokenCount ?? 0, thoughtTok: u.thoughtsTokenCount ?? 0, inTok: u.promptTokenCount ?? 0 };
}

type Gen = { i: number; run: number; variant: "base" | "addendum"; text: string; ms: number; outTok: number; thoughtTok: number; inTok: number; err?: string };
const genPath = `${OUT}/gen.json`;
let gens: Gen[] = existsSync(genPath) ? JSON.parse(readFileSync(genPath, "utf8")) : [];
// คำตอบว่าง (โมเดลตอบ 0 token) = ลองใหม่รอบหน้า
gens = gens.filter((g) => g.text.trim());
const have = new Set(gens.map((g) => `${g.i}|${g.run}|${g.variant}`));
const todo: { c: Case; p: Prep; run: number; variant: "base" | "addendum" }[] = [];
for (const c of cases) for (let run = 0; run < RUNS; run++) for (const variant of ["base", "addendum"] as const) {
  if (!have.has(`${c.i}|${run}|${variant}`)) todo.push({ c, p: prep.find((x) => x.i === c.i)!, run, variant });
}
console.log(`generate: ${todo.length} calls`);
const POOL = 4;
let cursor = 0;
await Promise.all(
  Array.from({ length: POOL }, async () => {
    while (cursor < todo.length) {
      const t = todo[cursor++];
      try {
        const r = await gemini(systemFor(t.c, t.p, t.variant === "addendum"), t.c.q + (t.run ? " " : ""));
        gens.push({ i: t.c.i, run: t.run, variant: t.variant, ...r });
        console.log(`gen ${t.c.i} ${t.variant} ${r.ms}ms out=${r.outTok} think=${r.thoughtTok}`);
      } catch (e) {
        gens.push({ i: t.c.i, run: t.run, variant: t.variant, text: "", ms: 0, outTok: 0, thoughtTok: 0, inTok: 0, err: (e as Error).message });
        console.log(`gen ${t.c.i} ${t.variant} ERR ${(e as Error).message}`);
      }
      writeFileSync(genPath, JSON.stringify(gens, null, 1));
    }
  }),
);

// ── 3) กรรมการ Claude Sonnet 5.5 เทียบคู่ ─────────────────────────────────────────────
const anth = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 60_000 });
type Verdict = { i: number; run: number; better: "base" | "addendum" | "tie"; score: { base: number; addendum: number }; fab: { base: boolean; addendum: boolean }; handoff: { base: boolean; addendum: boolean }; reask: { base: boolean; addendum: boolean }; note: string };
// --judge claude (ค่าเริ่มต้น · Sonnet 5.5) | gemini (3.8 Flash ค่ายเดียวกับผู้ตอบ — ใช้เป็นความเห็นที่ 2 / ตอนเครดิต Anthropic หมด)
const JUDGE = argOf("--judge", "claude");
const judgePath = JUDGE === "gemini" ? `${OUT}/judge-gemini.json` : `${OUT}/judge.json`;
let verdicts: Verdict[] = existsSync(judgePath) ? JSON.parse(readFileSync(judgePath, "utf8")) : [];
const judged = new Set(verdicts.map((v) => `${v.i}|${v.run}`));
const RULES = `กติกาที่คำตอบต้องทำตาม (ย่อจาก system message ของร้าน): ตอบจากข้อมูลที่ให้เท่านั้น ห้ามแต่งตัวเลข/เงื่อนไข/ระยะเวลา · ห้ามตอบ "ไม่มี" หรือโยนให้แอดมินถ้าข้อมูลที่ให้พอตอบได้ · ตอบครบทุกประเด็นในข้อความล่าสุด · ไม่ถามสิ่งที่ลูกค้าบอกแล้วหรือมีในประวัติ · ถามเพิ่มเฉพาะที่จำเป็น · น้ำเสียงแอดมินผู้หญิงน่ารัก สุภาพ "คุณลูกค้า" ค่ะ/นะคะ emoji 1-2 ตัว ไม่ใช้ markdown · สั้นกระชับ (คำถามทั่วไป 1-3 บรรทัด) แต่รายการราคาจาก tool ต้องคงครบ · ปิดด้วยประโยคชวนที่เจาะจง · ถ้าข้อมูลพอบางส่วน ให้ตอบส่วนนั้นและบอกชัดว่าส่วนไหนรอแอดมินยืนยัน`;
for (const c of cases) for (let run = 0; run < RUNS; run++) {
  if (judged.has(`${c.i}|${run}`)) continue;
  const p = prep.find((x) => x.i === c.i)!;
  const a = gens.find((g) => g.i === c.i && g.run === run && g.variant === "base");
  const b = gens.find((g) => g.i === c.i && g.run === run && g.variant === "addendum");
  if (!a?.text || !b?.text) continue;
  const swap = Math.random() < 0.5;
  const A = swap ? b : a, B = swap ? a : b;
  const prompt = `คุณเป็นกรรมการตรวจคำตอบแชทของร้านพิมพ์/ของพรีเมียม iDucky ให้เทียบคำตอบ 2 แบบต่อข้อความลูกค้าเดียวกัน

${RULES}

== ประวัติการสนทนา ==
${fmtHist(c.history)}

== ข้อความล่าสุดของลูกค้า ==
${c.q}

== ข้อมูลที่บอทมีให้ใช้ (ผล tool) ==
${p.pricing}

${p.kb}

== คำตอบ A ==
${A.text}

== คำตอบ B ==
${B.text}

ให้ประเมินแต่ละคำตอบ: ถูกต้องตามข้อมูล (ไม่แต่ง) · ครบทุกประเด็น · ไม่ถามซ้ำ/ไม่ถามเกินจำเป็น · โยนให้แอดมินเฉพาะเมื่อจำเป็น · น้ำเสียง/ความยาวตามกติกา · ลูกค้ารู้ขั้นต่อไป
ตอบเป็น JSON เท่านั้น: {"better":"A"|"B"|"tie","scoreA":1-10,"scoreB":1-10,"fabA":bool,"fabB":bool,"handoffA":bool,"handoffB":bool,"reaskA":bool,"reaskB":bool,"note":"เหตุผลสั้น ๆ ภาษาไทย 1-2 ประโยค"}
fab = มีตัวเลข/เงื่อนไข/ระยะเวลาที่ไม่มีในข้อมูลที่ให้ · handoff = โยนให้แอดมิน/ขอเช็กทั้งที่ข้อมูลพอตอบ · reask = ถามสิ่งที่ลูกค้าบอกแล้ว`;
  try {
    // ⚠️ Sonnet 5.5 ไม่รับ assistant prefill → ขอ JSON ล้วนแล้วตัดเอาเอง
    const ask = `${prompt}\n\nตอบเป็น JSON ก้อนเดียว ไม่มีข้อความนำหน้าหรือตามหลัง`;
    let t: string;
    if (JUDGE === "gemini") {
      t = (await gemini("คุณเป็นกรรมการตรวจคุณภาพคำตอบแชท ตอบเป็น JSON เท่านั้น", ask)).text;
    } else {
      const r = await anth.messages.create({ model: "claude-sonnet-5-5", max_tokens: 1500, messages: [{ role: "user", content: ask }] });
      t = r.content.map((x) => (x.type === "text" ? x.text : "")).join("");
    }
    const s = t.indexOf("{"), e = t.lastIndexOf("}");
    if (s < 0 || e < 0) throw new Error(`no json: ${t.slice(0, 120)}`);
    // กรรมการบางทีใส่เครื่องหมายคำพูดไทย/ขึ้นบรรทัดใน note → ล้างก่อน parse
    const raw = t.slice(s, e + 1).replace(/```/g, "");
    const j = JSON.parse(raw) as { better: string; scoreA: number; scoreB: number; fabA: boolean; fabB: boolean; handoffA: boolean; handoffB: boolean; reaskA: boolean; reaskB: boolean; note: string };
    const toV = (x: "A" | "B"): "base" | "addendum" => (x === "A") === !swap ? "base" : "addendum";
    const pick = <T,>(xa: T, xb: T) => (swap ? { base: xb, addendum: xa } : { base: xa, addendum: xb });
    verdicts.push({
      i: c.i,
      run,
      better: j.better === "tie" ? "tie" : toV(j.better as "A" | "B"),
      score: pick(j.scoreA, j.scoreB),
      fab: pick(!!j.fabA, !!j.fabB),
      handoff: pick(!!j.handoffA, !!j.handoffB),
      reask: pick(!!j.reaskA, !!j.reaskB),
      note: j.note,
    });
    console.log(`judge ${c.i}: ${verdicts.at(-1)!.better} base=${verdicts.at(-1)!.score.base} add=${verdicts.at(-1)!.score.addendum} — ${j.note}`);
  } catch (e) {
    console.log(`judge ${c.i} ERR ${(e as Error).message}`);
  }
  writeFileSync(judgePath, JSON.stringify(verdicts, null, 1));
}

// ── 4) สรุป ─────────────────────────────────────────────────────────────────────────────
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const med = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);
const lines: string[] = [];
for (const v of ["base", "addendum"] as const) {
  const g = gens.filter((x) => x.variant === v && !x.err);
  const vs = verdicts;
  lines.push(
    `${v.padEnd(9)} n=${g.length} ms median ${med(g.map((x) => x.ms))} avg ${Math.round(sum(g.map((x) => x.ms)) / Math.max(1, g.length))} · out tok avg ${Math.round(sum(g.map((x) => x.outTok)) / Math.max(1, g.length))} · think tok avg ${Math.round(sum(g.map((x) => x.thoughtTok)) / Math.max(1, g.length))} · in tok avg ${Math.round(sum(g.map((x) => x.inTok)) / Math.max(1, g.length))} · ตัวอักษร avg ${Math.round(sum(g.map((x) => x.text.length)) / Math.max(1, g.length))}` +
      ` · score avg ${(sum(vs.map((x) => x.score[v])) / Math.max(1, vs.length)).toFixed(2)} · fab ${vs.filter((x) => x.fab[v]).length} · handoff ${vs.filter((x) => x.handoff[v]).length} · reask ${vs.filter((x) => x.reask[v]).length}`,
  );
}
lines.push(`better: base ${verdicts.filter((v) => v.better === "base").length} · addendum ${verdicts.filter((v) => v.better === "addendum").length} · tie ${verdicts.filter((v) => v.better === "tie").length} (จาก ${verdicts.length})`);
console.log("\n" + lines.join("\n"));
writeFileSync(`${OUT}/summary.txt`, lines.join("\n") + "\n");
