/**
 * 🏷 นำ "คำขอแก้สเปคเรท" จากหน้ารายงาน (artifact R4PfSCNQioJxKupUkLPqTX · คอลเลกชัน edits) ลงสินค้าจริง
 * เขียน PriceRate.workSpec / specOn ของเรทนั้น (ว่าง = ลบ workSpec กลับไปใช้อัตโนมัติ · specOn null = ค่าเริ่มต้น)
 *
 * ใช้: ดึงคำขอเป็นไฟล์ JSON (ArtifactData list + out_dir) แล้ว
 *   node scripts/apply-rate-spec-edits.mjs <โฟลเดอร์ที่มีไฟล์ edits/*.json>            (ดูอย่างเดียว)
 *   node scripts/apply-rate-spec-edits.mjs <โฟลเดอร์> --apply                          (เขียนจริง)
 * เฉพาะคำขอ status "pending" · อ่านกลับเทียบทุกแถว (กับดัก update ไม่ลง · ดู memory iducky-script-write-product)
 * พิมพ์รายการ key ที่ลงสำเร็จ — เอาไปเปลี่ยน status เป็น "applied" ในหน้ารายงาน
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

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
const dir = process.argv[2];
const apply = process.argv.includes("--apply");
if (!dir) throw new Error("ต้องระบุโฟลเดอร์ไฟล์คำขอ");

const files = [];
const walk = (d) => readdirSync(d).forEach((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : f.endsWith(".json") && files.push(join(d, f))));
walk(dir);
const edits = files
  .map((f) => {
    const j = JSON.parse(readFileSync(f, "utf8"));
    return { key: f.split("/").pop().replace(/\.json$/, ""), ...(j.data ?? j) };
  })
  .filter((e) => e.status === "pending" && e.productId && e.rateId);
console.log(`คำขอรอนำไปใช้ ${edits.length} รายการ${apply ? "" : " (ดูอย่างเดียว — ใส่ --apply เพื่อเขียน)"}`);

const SCREENS = ["cart", "admin", "work"];
const byProduct = Map.groupBy ? Map.groupBy(edits, (e) => e.productId) : edits.reduce((m, e) => m.set(e.productId, [...(m.get(e.productId) ?? []), e]), new Map());
const done = [];
for (const [pid, list] of byProduct) {
  const { data: row, error } = await sb.from("products").select("data").eq("id", pid).single();
  if (error) throw error;
  const d = row.data;
  for (const e of list) {
    const r = (d.priceRates ?? []).find((x) => x.id === e.rateId);
    if (!r) {
      console.log(`  ⚠ ${pid} ไม่เจอเรท ${e.rateId} (${e.rateLabel}) — ข้าม`);
      continue;
    }
    const ws = String(e.workSpec ?? "").trim();
    const on = Array.isArray(e.specOn) ? SCREENS.filter((s) => e.specOn.includes(s)) : null;
    console.log(`  ${d.name} [${r.label}] สเปค: ${ws || "(อัตโนมัติ)"} · จอ: ${on ? on.join(",") || "ไม่โชว์" : "ค่าเริ่มต้น"}`);
    if (ws) r.workSpec = ws;
    else delete r.workSpec;
    if (on) r.specOn = on;
    else delete r.specOn;
    done.push({ ...e, want: { ws, on } });
  }
  if (!apply) continue;
  d.savedAt = new Date().toISOString();
  const { data: out, error: e2 } = await sb.from("products").update({ data: d }).eq("id", pid).select("data");
  if (e2) throw e2;
  for (const e of done.filter((x) => x.productId === pid)) {
    const b = out?.[0]?.data.priceRates?.find((x) => x.id === e.rateId);
    const ok = (b?.workSpec ?? "") === e.want.ws && JSON.stringify(b?.specOn ?? null) === JSON.stringify(e.want.on);
    if (!ok) throw new Error(`อ่านกลับไม่ตรง ${pid} ${e.rateId}`);
  }
}
if (apply) console.log("✓ ลงแล้ว:", done.map((e) => e.key).join(" "));
