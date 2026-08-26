/**
 * การ์ดสเปรย์แอลกอฮอล์ (new-mt2s1we8-1325) — เรท 40 ml · สกรีนลงการ์ดโดยตรง (UV): กติกาคละลาย
 *
 * ผู้ใช้สั่ง 26 ส.ค. 69:
 *   • 1-10 ชิ้น คละได้อิสระ (ไม่ติดขั้นต่ำต่อลาย ไม่มีค่าคละ)
 *   • 11 ชิ้นขึ้นไป ลายละ 5 ชิ้น · เกินโควตาบวกลายละ 5 บาท
 *   → freeMixBelowQty: 11 (+ minPerDesign 5 / extraDesignFee 5 ที่มีอยู่แล้ว)
 *
 * เรท 20 ml ไม่แตะ (ขั้นต่ำ 5 ชิ้น ลายละ 5 ชิ้นตั้งแต่ชิ้นแรก ตามที่สั่งไว้ก่อนหน้า)
 *
 * รันซ้ำได้ — node scripts/spray-card-uv-freemix.mjs [--dry]
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const ID = "new-mt2s1we8-1325";
const RATE_UV = "40 ml · สกรีนลงการ์ดโดยตรง (UV)";
const FREE_BELOW = 11;
const DRY = process.argv.includes("--dry");

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) throw error;
const d = row.data;

const uv = (d.priceRates ?? []).find((r) => r.label === RATE_UV);
if (!uv) {
  console.error(`⛔ ไม่พบเรท "${RATE_UV}"`);
  process.exit(1);
}
uv.minPerDesign = 5;
uv.extraDesignFee = 5;
uv.freeMixBelowQty = FREE_BELOW;
uv.desc = "พิมพ์ UV ลงบนตัวการ์ดโดยตรง · แอลกอฮอล์ 40 ml · ไม่มีขั้นต่ำ · 1-10 ชิ้นคละลายอิสระ";

/* ── ข้อความ ────────────────────────────────────────────────────────────── */
const UV_MIX_LINE = `• คละลาย: 1-${FREE_BELOW - 1} ชิ้นคละได้อิสระ · ตั้งแต่ ${FREE_BELOW} ชิ้นขึ้นไป ลายละ 5 ชิ้น เกินโควตาบวกลายละ 5 บาท`;
for (const t of d.tabs ?? []) {
  if (!t?.text?.includes("::40 ml")) continue;
  t.text = t.text.replace(/\n• คละลาย: 1-\d+ ชิ้น[^\n]*/g, "");
  t.text = t.text.replace(/(• แอลกอฮอล์ 40 ml[^\n]*)/, `$1\n${UV_MIX_LINE}`);
}
// terms ท้ายหน้า: บรรทัดคละลายเดิมพูดรวมทั้งสองแบบ — แยกให้ตรงเรท
const TERMS_MIX = `คละลายได้ — แบบ 20 ml ลายละ 5 ชิ้นขึ้นไป · แบบ 40 ml สั่ง 1-${FREE_BELOW - 1} ชิ้นคละอิสระ ตั้งแต่ ${FREE_BELOW} ชิ้นขึ้นไปลายละ 5 ชิ้น · ทั้งสองแบบคละเกินโควตาคิดเพิ่มลายละ 5 บาท`;
if (typeof d.terms === "string") d.terms = d.terms.replace(/คละลายได้[^\n]*/, TERMS_MIX);

const FAQ_Q = "สั่ง การ์ดสเปรย์แอลกอฮอล์ คละลายได้ไหม?";
if (d.seo) {
  d.seo.faqs = (d.seo.faqs ?? []).map((f) =>
    f.q === FAQ_Q
      ? {
          q: FAQ_Q,
          a: `คละได้ครับ · แบบ 20 ml (สติ๊กเกอร์) คละได้ลายละ 5 ชิ้นขึ้นไป · แบบ 40 ml (สกรีน UV) สั่ง 1-${FREE_BELOW - 1} ชิ้นคละได้อิสระทุกชิ้นคนละลาย ตั้งแต่ ${FREE_BELOW} ชิ้นขึ้นไปคิดลายละ 5 ชิ้น — ทั้งสองแบบถ้าคละเกินโควตาที่จำนวนสั่งรองรับ คิดเพิ่มลายละ 5 บาท`,
        }
      : f
  );
}
d.savedAt = new Date().toISOString();

/* ── จำลองผลก่อนเขียน ───────────────────────────────────────────────────── */
const included = (q) => (q < FREE_BELOW ? q : Math.floor(q / 5));
const maxD = (q) => (q < FREE_BELOW ? q : q); // extraDesignFee เปิดอยู่ = คละเกินโควตาได้ถึงจำนวนชิ้น
console.log(`เรท "${RATE_UV}": minPerDesign=${uv.minPerDesign} extraDesignFee=${uv.extraDesignFee} freeMixBelowQty=${uv.freeMixBelowQty}`);
for (const q of [1, 5, 10, 11, 15, 20]) {
  const inc = included(q);
  console.log(`  สั่ง ${q} ชิ้น → ลายที่รวมในราคา ${inc} ลาย · คละได้ถึง ${maxD(q)} ลาย (ลายที่ ${inc + 1} เป็นต้นไป +฿5/ลาย)`);
}
const uvTab = (d.tabs ?? []).find((t) => t?.text?.includes("::40 ml"));
console.log("\nแท็บ 40 ml:\n" + (uvTab?.text.slice(uvTab.text.indexOf("::40 ml")).split("\n\n")[0] ?? "-"));
console.log("terms:", (d.terms ?? "").split("\n").find((l) => l.startsWith("คละลาย")));

if (DRY) {
  console.log("\n(dry run — ไม่ได้เขียนลง DB)");
  process.exit(0);
}
const { error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID);
if (e2) throw e2;
console.log("\n✅ เขียนลง DB แล้ว");
