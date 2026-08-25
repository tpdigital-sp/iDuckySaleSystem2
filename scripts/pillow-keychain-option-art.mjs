#!/usr/bin/env node
/**
 * เติมภาพประกอบให้ตัวเลือกของ PILLOW KEYCHAIN (pillow-keychain)
 *   รูปทรง:   ไดคัทสี่เหลี่ยม / ไดคัทตามทรง-วงกลม
 *   ลายพิมพ์: แบบมีขอบขาว / แบบเข้าเนื้อ
 *
 * ใช้ภาพจากแกลเลอรีเดิมของสินค้า (URL string เดียวกันเป๊ะ) — กดเลือกแล้ว
 * jumpToImage จับคู่ src เจอ เด้งไปช่องเดิมในแกลเลอรี ไม่งอกภาพซ้ำ
 *
 *   node scripts/pillow-keychain-option-art.mjs           # ดูผลก่อน (ไม่เขียน)
 *   node scripts/pillow-keychain-option-art.mjs --write
 *
 * แก้เฉพาะ imageSrc ของตัวเลือกใน MAP — ไม่เขียนทับสินค้าทั้ง row
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "pillow-keychain";

const WIX = (mid) => `https://static.wixstatic.com/media/${mid}/v1/fill/w_900,h_675,al_c,q_85/file.jpg`;

const MAP = {
  รูปทรง: {
    // หมอนจัตุรัสลายลูกโป่งสองใบ — ภาพแกลเลอรีช่อง 1
    "ไดคัทสี่เหลี่ยม": WIX("959b83_887a9c08e637489ea0819b5384030c8a~mv2.jpg"),
    // หัวเด็กผู้หญิงไดคัทตามทรง + ป้าย GOOD LUCK วงกลม — ภาพแกลเลอรีช่อง 3
    "ไดคัทตามทรง / วงกลม": WIX("959b83_cd563d5206f2401fa67520dd238e2569~mv2.jpg"),
  },
  ลายพิมพ์: {
    // ตัวการ์ตูนในรถเข็น เห็นขอบผ้าขาวรอบลายชัด — ภาพแกลเลอรีช่อง 4
    "แบบมีขอบขาว": WIX("959b83_7b5fde6a51264f3c8f2721127ca28181~mv2.jpg"),
    // ลูกโป่งเต็มผืน + ป้ายวงกลมพิมพ์ชนขอบ — ภาพแกลเลอรีช่อง 2
    "แบบเข้าเนื้อ": WIX("959b83_400cefc304f84adba9b781613f0cea90~mv2.jpg"),
  },
};

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) throw error;
const data = row.data;

let changed = 0;
for (const group of data.options ?? []) {
  const groupMap = MAP[group.label];
  if (!groupMap) continue;
  for (const choice of group.choices ?? []) {
    const src = groupMap[choice.name];
    if (!src) {
      console.log(`⚠️ ${group.label} / ${choice.name} — ไม่อยู่ใน MAP ข้าม`);
      continue;
    }
    const before = choice.imageSrc ?? "—";
    choice.imageSrc = src;
    changed++;
    console.log(`✓ ${group.label} / ${choice.name}\n    ${before} → ${src}`);
  }
}
for (const [g, m] of Object.entries(MAP)) {
  const grp = (data.options ?? []).find((o) => o.label === g);
  if (!grp) console.log(`⚠️ ไม่พบกลุ่ม "${g}" ในสินค้า`);
  else for (const name of Object.keys(m))
    if (!(grp.choices ?? []).some((c) => c.name === name)) console.log(`⚠️ ไม่พบตัวเลือก "${g} / ${name}"`);
}

if (!WRITE) {
  console.log(`\n(dry-run) จะแก้ ${changed} ตัวเลือก — รันด้วย --write เพื่อบันทึกจริง`);
  process.exit(0);
}

const { error: upErr } = await sb.from("products").update({ data }).eq("id", ID);
if (upErr) throw upErr;

// อ่านกลับตรวจ
const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
let ok = 0;
for (const [g, m] of Object.entries(MAP))
  for (const [name, src] of Object.entries(m)) {
    const got = (back.data.options ?? []).find((o) => o.label === g)?.choices?.find((c) => c.name === name)?.imageSrc;
    if (got === src) ok++;
    else console.log(`✗ อ่านกลับไม่ตรง: ${g} / ${name} → ${got}`);
  }
console.log(`\nบันทึกแล้ว — อ่านกลับตรง ${ok}/4`);
