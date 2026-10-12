/**
 * 🗓 เปิดจอ "สร้างปฏิทินบนเว็บ" ให้สินค้าปฏิทินที่มีอยู่แล้ว 2 ตัว (12 ต.ค. 69 — ผู้ใช้เลือก "เพิ่มให้ตัวเดิม")
 *
 *   npx tsx scripts/calendar-studio-attach.mts            # ดูผลก่อน
 *   npx tsx scripts/calendar-studio-attach.mts --write    # บันทึกจริง
 *
 * - ปฎิทินตั้งโต๊ะ ทรงมาตราฐาน (3x3-7-62cm): เพิ่มกลุ่ม "ปีปฏิทิน" 2026/2027 (ต้นทาง Calendar_Desktop)
 *     รูปแบบจอ: ขนาด 8 แผ่น → desktop14 (ปก + 12 เดือนรูปบนตารางล่าง + ภาพรวมปี = 14 หน้า)
 *               ขนาด 14 แผ่น → desktop26 (รูปกับตารางเดือนแยกหน้า = 26 หน้า) · แนวนอน/แนวตั้ง จาก "แนวปฏิทิน"
 * - ปฎิทินผ้าแคนวาส (40x85cm): เพิ่มกลุ่ม "ปีปฏิทิน" 2026–2030 (ตามต้นทาง Calendar_CanvasFabric) · รูปแบบ canvas
 * ราคา/ตัวเลือกเดิมของร้านไม่แตะ · เคารพสวิตช์ studioOff ที่แอดมินตั้งไว้ (ไม่เปิดให้เอง)
 * รันซ้ำได้: กลุ่มปีมีอยู่แล้ว = เขียนทับที่เดิม
 *
 * ⚠️ calendar-standard-build.mts / canvas-calendar-build.mts เขียน d.options ทับทั้งก้อน —
 *    รันสคริปต์พวกนั้นเมื่อไหร่ ต้องรันสคริปต์นี้ต่อท้ายเสมอ (กลุ่มปีหาย = จอปฏิทินใช้ปีหน้าแทน)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Product, ProductOption } from "../src/lib/products";

const WRITE = process.argv.includes("--write");
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const die = (m: string): never => {
  console.error("✗", m);
  process.exit(1);
};

const YEAR = "ปีปฏิทิน";
const yearGroup = (years: number[], section?: string): ProductOption => ({
  label: YEAR,
  display: "cards",
  ...(section ? { section } : {}),
  note: "ปฏิทินสร้างตามปีที่เลือก (เริ่มเดือนมกราคม) — กด 🗓 สร้างปฏิทินบนเว็บ",
  choices: years.map((y) => ({ name: `ปี ค.ศ. ${y} (พ.ศ. ${y + 543})` })),
});

type Job = {
  id: string;
  years: number[];
  /** ใส่กลุ่มปีต่อจากกลุ่มนี้ */
  after: string;
  formats: (p: Product) => NonNullable<Product["calendarStudio"]>["formats"];
};

const JOBS: Job[] = [
  {
    id: "3x3-7-62cm",
    years: [2026, 2027],
    after: "แนวปฏิทิน",
    formats: (p) => {
      const size = p.options.find((o) => o.label === "ขนาด")?.choices.map((c) => c.name) ?? [];
      const ori = p.options.find((o) => o.label === "แนวปฏิทิน")?.choices.map((c) => c.name) ?? [];
      const s8 = size.find((n) => /^8 แผ่น/.test(n)) ?? die(`ไม่เจอขนาด 8 แผ่น: ${size}`);
      const s14 = size.find((n) => /^14 แผ่น/.test(n)) ?? die(`ไม่เจอขนาด 14 แผ่น: ${size}`);
      if (!ori.includes("แนวนอน") || !ori.includes("แนวตั้ง")) die(`แนวปฏิทินเปลี่ยน: ${ori}`);
      return [
        { format: "desktop14-L", when: [{ label: "ขนาด", choices: [s8] }, { label: "แนวปฏิทิน", choices: ["แนวนอน"] }] },
        { format: "desktop14-P", when: [{ label: "ขนาด", choices: [s8] }, { label: "แนวปฏิทิน", choices: ["แนวตั้ง"] }] },
        { format: "desktop26-L", when: [{ label: "ขนาด", choices: [s14] }, { label: "แนวปฏิทิน", choices: ["แนวนอน"] }] },
        { format: "desktop26-P", when: [{ label: "ขนาด", choices: [s14] }, { label: "แนวปฏิทิน", choices: ["แนวตั้ง"] }] },
      ];
    },
  },
  {
    id: "40x85cm",
    years: [2026, 2027, 2028, 2029, 2030],
    after: "เทคนิคการพิมพ์",
    formats: () => [{ format: "canvas" }],
  },
];

for (const job of JOBS) {
  const { data: row, error } = await sb.from("products").select("name,data").eq("id", job.id).single();
  if (error || !row) die(`อ่าน ${job.id} ไม่ได้: ${error?.message}`);
  const p = row!.data as Product;
  const options = [...p.options];
  const afterAt = options.findIndex((o) => o.label === job.after);
  if (afterAt < 0) die(`${job.id}: ไม่เจอกลุ่ม "${job.after}"`);
  const g = yearGroup(job.years, options[afterAt].section);
  const at = options.findIndex((o) => o.label === YEAR);
  if (at >= 0) options[at] = g;
  else options.splice(afterAt + 1, 0, g);
  const formats = job.formats(p);
  const next: Product = { ...p, options, calendarStudio: { yearLabel: YEAR, formats }, savedAt: new Date().toISOString() };

  console.log(`\n📦 ${row!.name} (${job.id})${p.studioOff ? "  ⚠️ แอดมินปิดปุ่มวางลายไว้ (studioOff) — จอปฏิทินจะไม่ขึ้นจนกว่าจะเปิด" : ""}`);
  console.log(`   กลุ่ม: ${options.map((o) => o.label).join(" · ")}`);
  console.log(`   ปี: ${g.choices.map((c) => c.name).join(" / ")}`);
  console.log(`   รูปแบบ: ${formats!.map((f) => `${f.format}${f.when ? ` ← ${f.when.map((w) => w.choices[0]).join(" + ")}` : ""}`).join(" · ")}`);
  if (!WRITE) continue;

  const { error: upErr } = await sb.from("products").update({ data: next }).eq("id", job.id);
  if (upErr) die(`บันทึก ${job.id} ไม่สำเร็จ: ${upErr.message}`);
  const { data: check } = await sb.from("products").select("data").eq("id", job.id).single();
  const back = check!.data as Product;
  if (back.savedAt !== next.savedAt || !back.options.some((o) => o.label === YEAR) || back.options.length !== p.options.length + (at >= 0 ? 0 : 1))
    die(`${job.id}: อ่านกลับมาไม่ตรง`);
  console.log("   ✅ บันทึกแล้ว");
}
if (!WRITE) console.log("\n(dry-run — ใส่ --write เพื่อบันทึกจริง)");
