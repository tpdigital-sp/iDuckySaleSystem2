/**
 * ผ้าแขวนผนัง (fabric-poster) — ช่อง "จำนวนชิ้นที่ต้องการ (ต่อ 1 หลา)" → "จำนวนชิ้นที่ต้องการ" (22 ต.ค. 69)
 *   พนักงานแจ้ง (OD-261019-1820): เอาคำว่า "(ต่อ 1 หลา)" ออก เพราะตอนนี้สั่งชิ้นที่ยาวเกิน 1 หลาได้แล้ว
 *   (maxPerQtyCap 360 + longPiece 19 ต.ค. 69) คำว่า "ต่อ 1 หลา" เลยไม่ตรงความจริง
 *   ⚠️ รอบแรกวันเดียวกันผมเข้าใจผิดไปถอดทั้งช่อง (fabric-poster-pieces-remove.mjs) — สคริปต์นี้คืนช่องกลับในชื่อใหม่
 *
 *   ทำ 3 อย่าง (รันซ้ำได้):
 *   1) สินค้า: ใส่กลุ่มช่องกรอกชื่อใหม่ (ต่อจาก "ขนาดชิ้นงาน (ยาว)" · โผล่เมื่อ ตัดแบ่งตามขนาด) + ผูก sizeFee.piecesLabel
 *      ให้ ตัดแบ่ง/เย็บขอบ/โพ้งขอบ กลับมา · ถ้ายังมีกลุ่มชื่อเก่าอยู่ก็เปลี่ยนชื่อแทน
 *   2) ออเดอร์: เปลี่ยนคีย์ใน items[].sel + ข้อความ items[].selections ทุกใบที่มีชื่อเก่า (ราคา/ยอดไม่แตะ · จด log 1 บรรทัด)
 *      เขียนตรงเข้า data ไม่ผ่าน updateOrder — กันไปปลุก sync TP/ภาษี/งานเร่ง ทั้งที่แค่เปลี่ยนชื่อบรรทัดสเปค
 *   3) ใบเสนอราคา: เหมือนข้อ 2
 *
 * ดูเฉย ๆ:  node scripts/fabric-poster-pieces-rename.mjs
 * เขียนจริง: node scripts/fabric-poster-pieces-rename.mjs --write
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "fabric-poster";
const G_CUT = "การตัด";
const G_H = "ขนาดชิ้นงาน (ยาว)";
const OLD = "จำนวนชิ้นที่ต้องการ (ต่อ 1 หลา)";
const NEW = "จำนวนชิ้นที่ต้องการ";
const C_SPLIT = "ตัดแบ่งตามขนาด";

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

/* ───────── 1. สินค้า ───────── */
const OPT = {
  label: NEW,
  display: "input",
  standardInput: true,
  showWhen: { label: G_CUT, choices: [C_SPLIT] },
  input: {
    kind: "number",
    unit: "ชิ้น",
    min: 1,
    integer: true,
    required: false,
    placeholder: "เช่น 2",
    hint: "สั่งตัดน้อยกว่าที่ตัดได้ก็ได้ — ค่าตัด/เย็บขอบคิดตามจำนวนนี้ · ไม่กรอก = คิดเต็มตามที่ตัดได้",
  },
  choices: [],
};
{
  const { data, error } = await sb.from("products").select("data").eq("id", ID).single();
  if (error) throw error;
  const d = data.data;
  let changed = 0;
  const opts = d.options ?? [];
  const iOld = opts.findIndex((o) => o.label === OLD);
  const iNew = opts.findIndex((o) => o.label === NEW);
  if (iNew >= 0) {
    if (JSON.stringify(opts[iNew]) !== JSON.stringify(OPT)) {
      opts[iNew] = OPT;
      console.log(`~ สินค้า: อัปเดตกลุ่ม “${NEW}”`);
      changed++;
    }
    if (iOld >= 0) {
      opts.splice(iOld, 1);
      console.log(`- สินค้า: ลบกลุ่มชื่อเก่าที่ซ้ำ`);
      changed++;
    }
  } else if (iOld >= 0) {
    opts[iOld] = OPT;
    console.log(`~ สินค้า: เปลี่ยนชื่อกลุ่ม “${OLD}” → “${NEW}”`);
    changed++;
  } else {
    const at = opts.findIndex((o) => o.label === G_H);
    opts.splice(at < 0 ? opts.length : at + 1, 0, OPT);
    console.log(`+ สินค้า: เพิ่มกลุ่ม “${NEW}” ต่อจาก “${G_H}”`);
    changed++;
  }
  d.options = opts;
  for (const o of opts) {
    for (const c of o.choices ?? []) {
      if (!c.sizeFee?.perPiece || c.sizeFee.piecesLabel === NEW) continue;
      c.sizeFee.piecesLabel = NEW;
      console.log(`  ↳ ผูก piecesLabel: ${o.label} › ${c.name}`);
      changed++;
    }
  }
  if (!changed) console.log("สินค้า: ไม่มีอะไรต้องแก้");
  else if (WRITE) {
    const { error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID);
    if (e2) throw e2;
    console.log(`✅ สินค้า: เขียนแล้ว (${changed} จุด)`);
  } else console.log(`(ดูเฉย ๆ) สินค้า: แก้ ${changed} จุด`);
}

/* ───────── 2–3. ออเดอร์ + ใบเสนอราคา ───────── */
const renameItems = (items) => {
  let n = 0;
  const out = (items ?? []).map((it) => {
    let next = it;
    if (it.sel && Object.prototype.hasOwnProperty.call(it.sel, OLD)) {
      const sel = {};
      for (const [k, v] of Object.entries(it.sel)) sel[k === OLD ? NEW : k] = v; // คงลำดับคีย์เดิม
      next = { ...next, sel };
      n++;
    }
    if (typeof it.selections === "string" && it.selections.includes(OLD)) {
      next = { ...next, selections: it.selections.split(OLD).join(NEW) };
    }
    return next;
  });
  return { items: out, n };
};
const stamp = new Date().toISOString().slice(0, 10);
for (const t of ["orders", "quotes"]) {
  const { data: rows, error } = await sb.from(t).select("id,data").ilike("data->>items", `%${OLD}%`).order("id");
  if (error) throw error;
  console.log(`\n${t}: พบ ${rows.length} ใบที่มีชื่อเก่า`);
  for (const row of rows) {
    const { items, n } = renameItems(row.data.items);
    if (!n) continue;
    const next = {
      ...row.data,
      items,
      log: [
        ...(row.data.log ?? []),
        { at: new Date().toISOString(), by: "ระบบ", action: "เปลี่ยนชื่อบรรทัดสเปค", detail: `“${OLD}” → “${NEW}” (${n} รายการ · พนักงานแจ้ง 22 ต.ค. 69 สั่งชิ้นยาวเกิน 1 หลาได้แล้ว · ราคา/ยอดไม่เปลี่ยน)` },
      ],
    };
    console.log(`  ${row.id} [${row.data.status}] ${n} รายการ`);
    if (!WRITE) continue;
    mkdirSync("backups/fabric-poster-pieces-rename-" + stamp, { recursive: true });
    writeFileSync(`backups/fabric-poster-pieces-rename-${stamp}/${row.id}.json`, JSON.stringify(row.data, null, 1));
    const { error: e2 } = await sb.from(t).update({ data: next }).eq("id", row.id);
    if (e2) throw e2;
    console.log(`    ✅ เขียนแล้ว`);
  }
}
if (!WRITE) console.log("\n(ดูเฉย ๆ) — ใส่ --write เพื่อเขียนจริง");
