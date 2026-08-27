#!/usr/bin/env node
/**
 * Acrylic Kit — ค่าตะขอคิด "ตั้งแต่ชิ้นแรก" เหมือนพวงกุญแจอะคริลิค 2 มม.
 *
 *   node scripts/acrylic-kit-hook-price-first-piece.mjs                 # ดูก่อน (ไม่เขียน)
 *   node scripts/acrylic-kit-hook-price-first-piece.mjs --json /tmp/kit.json
 *   node scripts/acrylic-kit-hook-price-first-piece.mjs --write         # เขียนจริง
 *
 * ของเดิม (โคลนกติกาช่วงปลีกของพวงกุญแจ 3 มม. มา):
 *   • freeWhen    — ห่วง Z1 / โซ่ Z2 แถมฟรีเมื่อเลือก "รับตะขอ"
 *   • smallQtyFee — สั่ง 1-10 ชุด คิดเหมาตะขอชิ้นละ 10 บาท (แทนราคาอะไหล่จริง)
 *   • extraFromQty 11 ทุกกลุ่ม "สีตะขอ …" — ต่ำกว่า 11 ชุด ค่าสีไม่บวก (= ตะขอพลาสติกฟรี)
 *
 * ของใหม่ = เหมือนพวงกุญแจอะคริลิคความหนา 2 มม. คือไม่มีของแถม/ไม่มีค่าเหมา
 * ทุกแบบบวกตามราคาอะไหล่จริงตั้งแต่ชิ้นแรก ทุกจำนวนที่สั่ง (Z1/Z2 = ชิ้นละ 2 บาท)
 * — อ่านราคาอะไหล่สดจากพวงกุญแจอะคริลิคมาเทียบด้วย ต่างเมื่อไหร่บอก (--sync = ปรับตาม)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const TGT_ID = "new-mt2rpb1j-2194"; // Acrylic Kit
const REF_ID = "keyring-copy-copy"; // พวงกุญแจอะคริลิค (Acrylic Keyring) — ต้นแบบราคาอะไหล่
const HOOK_LABEL = "ตะขอ";
const TAKE_LABEL = "รับตะขอไหม";
const WRITE = process.argv.includes("--write");
const SYNC = process.argv.includes("--sync");

// ── ข้อความในหน้าที่ยังบอกว่ามีของแถม/ค่าเหมา ────────────────────────────────
const TEXT_FIXES = [
  [
    "• ใส่อะไหล่ตะขอ/ห่วงได้กว่า 30 แบบ เลือกแบบ+สี และระบุจำนวนชิ้นต่อชุดได้ (ห่วง Z1 / โซ่ Z2 สีเงินแถมฟรี)",
    "• ใส่อะไหล่ตะขอ/ห่วงได้กว่า 30 แบบ เลือกแบบ+สี และระบุจำนวนชิ้นต่อชุดได้ — คิดเพิ่มตามชนิดตั้งแต่ชิ้นแรก (ห่วง Z1 / โซ่ Z2 สีเงิน ชิ้นละ 2 บาท)",
  ],
  [
    "• ห่วง Z1 (ห่วงกลมเงิน) และ Z2 (โซ่ไข่ปลาเงิน) แถมฟรี",
    "• ห่วง Z1 (ห่วงกลมเงิน) และ Z2 (โซ่ไข่ปลาเงิน) คิดเพิ่มชิ้นละ 2 บาท",
  ],
  [
    "• ตะขอ/ห่วงแบบอื่น ช่วง 1-10 ชุด คิดเหมาชิ้นละ 10 บาท · สั่ง 11 ชุดขึ้นไปคิดตามราคาอะไหล่จริง (ประมาณ 2-15 บาท/ชิ้น) — ระบุจำนวนตะขอต่อ 1 ชุดได้ ระบบคูณให้อัตโนมัติ",
    "• ตะขอ/ห่วงแบบอื่นคิดตามราคาอะไหล่จริง (ประมาณ 2-15 บาท/ชิ้น) ตั้งแต่ชิ้นแรก ทุกจำนวนที่สั่ง — ระบุจำนวนตะขอต่อ 1 ชุดได้ ระบบคูณให้อัตโนมัติ",
  ],
  [
    "*อะไหล่ตะขอ/ห่วง เลือกแบบและสีได้กว่า 30 แบบในหน้าสินค้า ระบุจำนวนชิ้นต่อชุดได้ (ห่วง Z1 / โซ่ Z2 สีเงินแถมฟรี · ช่วง 1-10 ชุด คิดเหมาชิ้นละ 10 บาท · 11 ชุดขึ้นไปคิดตามอะไหล่)",
    "*อะไหล่ตะขอ/ห่วง เลือกแบบและสีได้กว่า 30 แบบในหน้าสินค้า ระบุจำนวนชิ้นต่อชุดได้ — คิดเพิ่มตามราคาอะไหล่จริงตั้งแต่ชิ้นแรก ทุกจำนวนที่สั่ง (ห่วง Z1 / โซ่ Z2 สีเงิน ชิ้นละ 2 บาท · แบบอื่นประมาณ 2-15 บาท/ชิ้น)",
  ],
];
const NOTE_OLD =
  'ตะขอ/ห่วงมีให้เลือกกว่า 30 แบบตามแผ่นอะไหล่ของร้าน — **ห่วง Z1 / โซ่ Z2 (สีเงิน) แถมฟรี** แบบอื่นคิดเพิ่มตามชนิด (ดูรูปอะไหล่ทั้งหมดในแท็บ "ตะขอ / ห่วง" ท้ายหน้า)';
const NOTE_NEW =
  'ตะขอ/ห่วงมีให้เลือกกว่า 30 แบบตามแผ่นอะไหล่ของร้าน — **คิดเพิ่มตามชนิดตั้งแต่ชิ้นแรก** (ห่วง Z1 / โซ่ Z2 สีเงิน ชิ้นละ 2 บาท · แบบอื่นตามราคาอะไหล่) ดูรูปอะไหล่ทั้งหมดในแท็บ "ตะขอ / ห่วง" ท้ายหน้า';

// ── เชื่อม Supabase ──────────────────────────────────────────────────────────
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const [{ data: tgt, error: e1 }, { data: ref, error: e2 }, { data: presetRows, error: e3 }] = await Promise.all([
  sb.from("products").select("id,data").eq("id", TGT_ID).single(),
  sb.from("products").select("id,data,name").eq("id", REF_ID).single(),
  sb.from("products").select("data").eq("category", "__presets__"),
]);
if (e1) throw new Error(`อ่านสินค้าไม่ได้ — ${e1.message}`);
if (e2) throw new Error(`อ่านพวงกุญแจต้นแบบไม่ได้ — ${e2.message}`);
if (e3) throw new Error(`อ่านคลังตัวเลือกไม่ได้ — ${e3.message}`);
const presets = (presetRows ?? []).map((r) => r.data).filter((p) => p?.id);
const choicesOf = (o) => (o?.presetId ? presets.find((p) => p.id === o.presetId)?.choices ?? o.choices : o?.choices) ?? [];

const d = structuredClone(tgt.data);
const log = [];

// ── 1) กลุ่ม "ตะขอ" — ถอดของแถม + ค่าเหมาช่วงปลีก ─────────────────────────────
const hook = d.options.find((o) => o.label === HOOK_LABEL);
if (!hook) throw new Error(`สินค้าไม่มีกลุ่ม "${HOOK_LABEL}" — โครงเปลี่ยน ตรวจก่อน`);
const hadFree = hook.freeWhen != null;
const hadFee = hook.smallQtyFee != null;
delete hook.freeWhen;
delete hook.smallQtyFee;
log.push(
  `กลุ่ม "${HOOK_LABEL}" — ${hadFree ? "ถอดของแถม (freeWhen: Z1/Z2 ฟรี)" : "ไม่มีของแถมอยู่แล้ว"} · ${
    hadFee ? "ถอดค่าเหมาช่วง 1-10 ชุด (smallQtyFee 10 บาท/ชิ้น)" : "ไม่มีค่าเหมาอยู่แล้ว"
  }`
);

// ── 2) กลุ่ม "สีตะขอ …" — ค่าสีบวกตั้งแต่ชุดแรก (ถอดเกณฑ์ 11 ชุด) ──────────────
const colorGroups = d.options.filter((o) => o.qtyFrom === HOOK_LABEL);
if (!colorGroups.length) throw new Error(`ไม่เจอกลุ่มสีตะขอ (qtyFrom = "${HOOK_LABEL}") — โครงเปลี่ยน ตรวจก่อน`);
const dropped = colorGroups.filter((o) => o.extraFromQty != null);
for (const o of dropped) delete o.extraFromQty;
log.push(
  `กลุ่มสีตะขอ ${colorGroups.length} กลุ่ม — ถอดเกณฑ์ "บวกเมื่อสั่งตั้งแต่ 11 ชุด" ${dropped.length} กลุ่ม (ที่เหลือไม่ได้ตั้งไว้)`
);

// ── 3) เทียบราคาอะไหล่กับพวงกุญแจอะคริลิค ──────────────────────────────────────
const refHook = ref.data.options.find((o) => o.label === HOOK_LABEL);
if (!refHook) throw new Error(`พวงกุญแจต้นแบบไม่มีกลุ่ม "${HOOK_LABEL}" — ตรวจก่อน`);
const refExtra = new Map(choicesOf(refHook).map((c) => [c.name, c.extra ?? 0]));
const diffs = [];
for (const c of hook.choices) {
  if (!refExtra.has(c.name)) {
    diffs.push(`${c.name}: พวงกุญแจไม่มีแบบนี้ (ของเรา ${c.extra ?? 0})`);
    continue;
  }
  const want = refExtra.get(c.name);
  if ((c.extra ?? 0) !== want) {
    diffs.push(`${c.name}: ของเรา ${c.extra ?? 0} · พวงกุญแจ ${want}`);
    if (SYNC) {
      if (want) c.extra = want;
      else delete c.extra;
    }
  }
}
log.push(
  diffs.length
    ? `⚠️ ราคาอะไหล่ต่างจากพวงกุญแจ ${diffs.length} แบบ${SYNC ? " (--sync = ปรับตามพวงกุญแจแล้ว)" : " (ใส่ --sync ถ้าจะปรับตาม)"}`
    : `ราคาอะไหล่ตรงกับพวงกุญแจอะคริลิคทุกแบบ (${hook.choices.length} แบบ) — ไม่ต้องแก้`
);
for (const s of diffs) console.log(`   • ${s}`);

// ── 4) ข้อความในหน้า ────────────────────────────────────────────────────────
let fixed = 0;
const patchText = (s) => {
  if (typeof s !== "string") return s;
  let out = s;
  for (const [oldTxt, newTxt] of TEXT_FIXES) {
    if (out.includes(newTxt)) continue;
    if (out.includes(oldTxt)) {
      out = out.replaceAll(oldTxt, newTxt);
      fixed++;
    }
  }
  return out;
};
d.description = patchText(d.description);
d.terms = patchText(d.terms);
d.highlights = (d.highlights ?? []).map(patchText);
d.tabs = (d.tabs ?? []).map((t) => ({ ...t, text: patchText(t.text) }));
d.body = (d.body ?? []).map((b) => ({ ...b, text: patchText(b.text) }));
const stale = TEXT_FIXES.filter(
  ([, newTxt]) => ![d.description, d.terms, ...(d.highlights ?? []), ...d.tabs.map((t) => t.text)].some((s) => s?.includes(newTxt))
);
for (const [oldTxt] of stale) console.log(`   ⚠️ ไม่เจอข้อความเดิม: ${oldTxt.slice(0, 70)}…`);

const take = d.options.find((o) => o.label === TAKE_LABEL);
if (take && take.note !== NOTE_NEW) {
  if (take.note !== NOTE_OLD) console.log("   ⚠️ note กลุ่ม \"รับตะขอไหม\" ไม่ตรงของเดิม — เขียนทับด้วยข้อความใหม่");
  take.note = NOTE_NEW;
  fixed++;
}
log.push(`ข้อความแก้ ${fixed} จุด${stale.length ? ` ⚠️ หาที่แก้ไม่เจอ ${stale.length} จุด` : ""}`);

d.savedAt = new Date().toISOString();

console.log(`\n📦 ${d.name} (${TGT_ID}) — ค่าตะขอคิดตั้งแต่ชิ้นแรก\n`);
for (const l of log) console.log(`   • ${l}`);
console.log(`   ฉบับร่าง (hidden): ${d.hidden === true ? "ใช่ — ยังไม่ขึ้นหน้าร้าน" : "ไม่ (เผยแพร่แล้ว)"}`);

const jsonAt = process.argv.indexOf("--json");
if (jsonAt > -1 && process.argv[jsonAt + 1]) {
  writeFileSync(process.argv[jsonAt + 1], JSON.stringify(d, null, 2));
  console.log(`   📄 เขียนผลลัพธ์ลง ${process.argv[jsonAt + 1]}`);
}

if (!WRITE) {
  console.log("\n(ยังไม่บันทึก — ใส่ --write)");
  process.exit(0);
}
const up = await sb.from("products").update({ data: d }).eq("id", TGT_ID);
if (up.error) throw new Error(`บันทึกไม่สำเร็จ — ${up.error.message}`);
console.log("\n✅ บันทึกแล้ว");
