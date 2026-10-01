/**
 * 🪝 ภาพตะขอ + สีตะขอ จากโปสเตอร์ "ตะขอ | อะไหล่เสริม" → คลังตัวเลือกกลาง (เจ้าของร้านขอ 1 ต.ค. 69)
 *
 *   npx tsx scripts/hook-images-from-poster.mts <โฟลเดอร์ครอป>            # ดูแผน
 *   npx tsx scripts/hook-images-from-poster.mts <โฟลเดอร์ครอป> --apply    # อัปโหลด + เขียนคลัง
 *
 * ไฟล์ในโฟลเดอร์: hook-<รหัส>.jpg = ภาพตะขอ · hook-<รหัส>-<n>.jpg = สีที่ n ตามลำดับสีของกลุ่มสีนั้น
 * เขียน:
 *   · preset-3 (ตะขอ): choice.imageSrc = ภาพตะขอ (จับคู่ด้วยรหัสนำหน้าชื่อ "K ตะขอแมว…" → K)
 *   · hook-color-metal (F/J/K/L/M/N/O) · hook-color-r (R/V): choice.imageWhen += {when:[{ตะขอ:[ชื่อตะขอ]}], imageSrc} ต่อสี
 *   · กลุ่มของสินค้าเอง "สีตะขอ · เงิน/ทอง (D/X)" (ทุกสินค้าที่มี): imageWhen เช่นกัน
 * หน้าร้าน/หน้าคลังอ่านผ่าน choiceImage() อยู่แล้ว → สีสลับภาพตามตะขอที่เลือก
 * อัปโหลดที่ storage product-images/presets/hooks/<ไฟล์> (upsert) — รันซ้ำได้ ไม่สร้างไฟล์ซ้ำ
 */
import { readFileSync, readdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { OptionPreset } from "../src/lib/option-presets";
import type { Product, ProductOptionChoice } from "../src/lib/products";

const dir = process.argv[2];
const APPLY = process.argv.includes("--apply");
if (!dir) throw new Error("ใส่โฟลเดอร์ครอป");
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const BUCKET = "product-images";
const HOOK_LABEL = "ตะขอ";
const files = readdirSync(dir).filter((f) => /^hook-[A-Z0-9]+(-\d+)?\.jpg$/.test(f));
const code = (name: string) => name.trim().split(/\s+/)[0] ?? "";

async function upload(file: string): Promise<string> {
  const path = `presets/hooks/${file}`;
  if (APPLY) {
    const { error } = await sb.storage.from(BUCKET).upload(path, readFileSync(`${dir}/${file}`), { contentType: "image/jpeg", upsert: true });
    if (error) throw new Error(`${file}: ${error.message}`);
  }
  return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
const urlOf = new Map<string, string>();
for (const f of files) urlOf.set(f.replace(/\.jpg$/, ""), await upload(f));
console.log(`${APPLY ? "อัปโหลดแล้ว" : "จะอัปโหลด"} ${files.length} ไฟล์`);

// ── ตะขอ (preset-3) ──
const { data: hookRow } = await sb.from("products").select("data").eq("id", "__preset_preset-3").maybeSingle();
const hooks = hookRow!.data as OptionPreset;
let hookHit = 0;
const nextHooks: OptionPreset = {
  ...hooks,
  choices: hooks.choices.map((c) => {
    const u = urlOf.get(`hook-${code(c.name)}`);
    if (!u) return c;
    hookHit++;
    return { ...c, imageSrc: u };
  }),
};
console.log(`ตะขอ: ใส่ภาพ ${hookHit}/${hooks.choices.length} · ไม่มีภาพ: ${hooks.choices.filter((c) => !urlOf.get(`hook-${code(c.name)}`)).map((c) => c.name).join(", ") || "-"}`);
const hookName = (cd: string) => hooks.choices.find((c) => code(c.name) === cd)?.name;

/** เติม imageWhen ให้ตัวเลือกสี (ลำดับสี i) ของตะขอรหัส cd */
function withWhen(choices: ProductOptionChoice[], hookCodes: string[]): { choices: ProductOptionChoice[]; added: number } {
  let added = 0;
  const out = choices.map((c, i) => {
    const alts = [...(c.imageWhen ?? [])];
    for (const cd of hookCodes) {
      const hn = hookName(cd);
      const u = urlOf.get(`hook-${cd}-${i + 1}`);
      if (!hn || !u) continue;
      const idx = alts.findIndex((a) => (a.when ?? []).some((w) => w.label === HOOK_LABEL && w.choices.includes(hn)));
      const alt = { when: [{ label: HOOK_LABEL, choices: [hn] }], imageSrc: u };
      if (idx >= 0) alts[idx] = alt;
      else alts.push(alt);
      added++;
    }
    return alts.length ? { ...c, imageWhen: alts } : c;
  });
  return { choices: out, added };
}

const colorPresets: [string, string[]][] = [
  ["hook-color-metal", ["F", "J", "K", "L", "M", "N", "O"]],
  ["hook-color-r", ["R", "V"]],
];
const writes: { id: string; data: unknown; note: string }[] = [{ id: "__preset_preset-3", data: nextHooks, note: `ตะขอ ${hookHit} ภาพ` }];
for (const [pid, codes] of colorPresets) {
  const { data: row } = await sb.from("products").select("data").eq("id", `__preset_${pid}`).maybeSingle();
  const pr = row!.data as OptionPreset;
  const r = withWhen(pr.choices, codes);
  writes.push({ id: `__preset_${pid}`, data: { ...pr, choices: r.choices }, note: `${pr.label}: imageWhen ${r.added} รายการ` });
}
// กลุ่ม D/X ของสินค้าเอง
const { data: prods } = await sb.from("products").select("id,data").neq("category", "__presets__");
for (const row of prods ?? []) {
  const p = row.data as Product;
  if (!p.options?.some((o) => o.presetId === "preset-3")) continue;
  let added = 0;
  const options = p.options.map((o) => {
    if (o.presetId || !/D\/X/.test(o.label)) return o;
    const r = withWhen(o.choices, ["D", "X"]);
    added += r.added;
    return { ...o, choices: r.choices };
  });
  if (added) writes.push({ id: row.id, data: { ...p, options, savedAt: new Date().toISOString() }, note: `${p.name}: สี D/X imageWhen ${added} รายการ` });
}
for (const w of writes) {
  console.log(`${APPLY ? "✓" : "→"} ${w.id} — ${w.note}`);
  if (APPLY) {
    const { error } = await sb.from("products").update({ data: w.data }).eq("id", w.id);
    if (error) throw new Error(`${w.id}: ${error.message}`);
  }
}
console.log(APPLY ? "เสร็จ" : "ยังไม่เขียน — ใส่ --apply");
process.exit(0);
