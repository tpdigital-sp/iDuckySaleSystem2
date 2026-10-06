// กระดาษเย็บบน: บอก "ไม่มีซองให้" เป็นตัวแดงในกล่องราคา (Product.priceNote · เจ้าของร้านขอ 6 ต.ค. 69)
// รอบแรกใส่ท้าย description → เจ้าของร้านอยากให้อยู่ใต้ ฿45 / แผ่น A3 สีแดง จึงย้ายมา priceNote แล้วถอดออกจาก description
// รูปสินค้าเห็นการ์ดเย็บบนถุง ลูกค้าเข้าใจว่าได้ซองด้วย · รันซ้ำได้ · node scripts/staple-top-no-bag-note.mjs [--write]
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const die = (m) => { console.error("✗", m); process.exit(1); };
const ID = "package-staple-top";
const NOTE = "⚠️ ราคานี้เฉพาะตัวการ์ดเย็บบน ไม่มีซองให้ (ถุง/ซองในรูปใช้ประกอบเท่านั้น)";
const SEO_NOTE = " (เฉพาะการ์ด ไม่มีซองให้)";

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) die(error.message);
const d = row.data;
const desc = d.description.replace(" " + NOTE, "").replace(NOTE, "").trim();
const seoDesc = d.seo.description.includes("ไม่มีซอง") ? d.seo.description : d.seo.description.trim() + SEO_NOTE;
console.log("priceNote → " + NOTE + "\ndescription →\n" + desc + "\nseo.description →\n" + seoDesc);
if (desc === d.description && seoDesc === d.seo.description && d.priceNote === NOTE) { console.log("✓ มีครบแล้ว"); process.exit(0); }
if (!process.argv.includes("--write")) { console.log("(dry-run)"); process.exit(0); }

const next = { ...d, priceNote: NOTE, description: desc, seo: { ...d.seo, description: seoDesc }, savedAt: new Date().toISOString() };
const { data: upd, error: e2 } = await sb.from("products").update({ data: next }).eq("id", ID).select("data");
if (e2) die(e2.message);
if (upd?.length !== 1) die("อัปเดตได้ " + upd?.length + " แถว");
const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
if (typeof back.data.description !== "string" || back.data.description.includes(NOTE) || back.data.priceNote !== NOTE || !back.data.seo.description.includes("ไม่มีซอง")) die("อ่านกลับไม่ตรง");
if (JSON.stringify(back.data.priceRates?.length) !== JSON.stringify(d.priceRates?.length) || back.data.options.length !== d.options.length) die("ส่วนอื่นเปลี่ยน?");
console.log("✓ เขียนแล้ว อ่านกลับตรง");
