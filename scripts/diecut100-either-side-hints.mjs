#!/usr/bin/env node
/**
 * 📏 ไดคัท 100% 10 ตัว — ข้อความใต้ช่อง "ขนาดไดคัท (กว้าง)/(สูง)" ให้ตรงกติกาใหม่ "กรอกช่องไหนก็ได้ช่องเดียว"
 *
 *   node scripts/diecut100-either-side-hints.mjs            # ดูก่อน (ไม่เขียน)
 *   node scripts/diecut100-either-side-hints.mjs --write    # ⚠️ รันหลัง deploy โค้ด longestOnlyPair แล้วเท่านั้น
 *
 * พนักงานแจ้ง 17 ก.ย. 69: ไฟล์ทรงสูง ลูกค้ากรอก 4 ซม. ที่ช่อง "สูง" แต่ระบบบังคับช่อง "กว้าง" → สั่งไม่ได้
 * โค้ด (inputError + longestOnlyPair) ปลดให้กรอกช่องไหนก็ได้แล้ว — สคริปต์นี้แก้แค่ "คำพูด" ใต้ช่องให้บอกตรงกัน
 * ถ้าเขียนก่อน deploy เว็บจริงจะบอกว่า "ช่องไหนก็ได้" ทั้งที่ยังบังคับช่องกว้างอยู่ = งงหนักกว่าเดิม
 * ค้นเป้าหมายจากธง sheetYield.longestOnly เอง ไม่ล็อกรายชื่อ · รันซ้ำได้ · อ่านกลับเทียบ + savedAt
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const envText = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (envText.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

/** [ข้อความเดิม, ข้อความใหม่] — แทนเฉพาะท่อนที่เปลี่ยน ท่อนขั้นต่ำ/เพดาน/ตารางร้าน คงไว้ตามของแต่ละสินค้า */
const W_SWAP = ["วัดด้านที่ยาวที่สุดของชิ้นงานหลังไดคัท ด้านเดียวพอ", "วัดด้านที่ยาวที่สุดของชิ้นงานหลังไดคัท กรอกช่องเดียวพอ (ช่องกว้างหรือช่องสูงก็ได้)"];
const H_SWAP = ["ไม่บังคับ — กรอกเพิ่มได้ถ้าวัดมาแล้ว", "งานทรงสูงกรอกช่องนี้ช่องเดียวก็ได้ · วัดมาครบสองด้านกรอกทั้งคู่ได้เลย"];
const H_PLACEHOLDER = ["ถ้าทราบ", "เช่น 4"];

const { data: rows, error } = await sb.from("products").select("id,name,data");
if (error) throw error;
let changed = 0;
for (const row of (rows ?? []).sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
  if (String(row.id).startsWith("__") || row.data?.choices) continue;
  const d = row.data;
  let dirty = false;
  for (const h of d.options ?? []) {
    if (!h.sheetYield?.longestOnly) continue;
    const w = (d.options ?? []).find((o) => o.label === h.sheetYield.pairLabel);
    const swap = (o, [from, to], key) => {
      const cur = o?.input?.[key];
      if (typeof cur !== "string" || !cur.includes(from)) {
        console.log(`= ${row.id} / ${o?.label} ${key} — ${cur?.includes(to) ? "แก้ไว้แล้ว" : "ไม่เจอข้อความเดิม ข้าม"}`);
        return;
      }
      o.input[key] = cur.split(from).join(to);
      dirty = true;
      console.log(`✎ ${row.id} / ${o.label} ${key}\n    → ${o.input[key]}`);
    };
    swap(w, W_SWAP, "hint");
    swap(h, H_SWAP, "hint");
    swap(h, H_PLACEHOLDER, "placeholder");
  }
  if (!dirty) continue;
  changed++;
  if (!WRITE) continue;
  d.savedAt = new Date().toISOString();
  const { error: e2 } = await sb.from("products").update({ data: d }).eq("id", row.id);
  if (e2) throw new Error(`${row.id}: ${e2.message}`);
  const { data: back } = await sb.from("products").select("data").eq("id", row.id).single();
  const okBack = (back?.data?.options ?? []).some((o) => o.input?.hint?.includes(W_SWAP[1]));
  if (!okBack) throw new Error(`${row.id}: อ่านกลับแล้วข้อความไม่เปลี่ยน`);
}
console.log(`\n${WRITE ? "เขียนแล้ว" : "จะแก้ (ยังไม่เขียน — ใส่ --write)"} ${changed} สินค้า`);
