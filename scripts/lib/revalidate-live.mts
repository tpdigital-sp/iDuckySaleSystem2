/**
 * ⏱️ ล้างแคชหน้าสินค้าบนเว็บจริงหลังสคริปต์เขียน DB ตรง (สินค้า/ชุดเทมเพลต) — หน้า /products/[id] แคช 1 ชม.
 * (16 ต.ค. 69 เปลี่ยนไฟล์เทมเพลตเข็มกลัด 2.5 ซม. แล้วหน้าเว็บจริงยังให้โหลด .ai เก่า 6.95 ซม.)
 *
 *   import { revalidateLive } from "./lib/revalidate-live.mts";
 *   await revalidateLive(env, { templateIds: ["tpl-xxx"] });   // หรือ { productIds: ["broochbadge-th"] }
 *
 * เซ็นคำขอด้วย HMAC-SHA256(SUPABASE_SERVICE_ROLE_KEY, `${ts}.${body}`) — คีย์ไม่ออกจากเครื่อง (ฝั่งรับ: src/lib/server/revalidate-products.ts)
 * ปลายทาง = REVALIDATE_SITE ใน env (ถ้ามี) ไม่งั้น https://iduckystore.com · ล้างไม่ได้ = แจ้งเตือน ไม่ทำให้สคริปต์ล้ม
 */
import { createHmac } from "node:crypto";

export async function revalidateLive(
  env: Record<string, string>,
  target: { productIds?: string[]; templateIds?: string[] },
): Promise<void> {
  const site = (env.REVALIDATE_SITE || process.env.REVALIDATE_SITE || "https://iduckystore.com").replace(/\/+$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return console.log("   ⚠️ ล้างแคชหน้าเว็บไม่ได้ (ไม่มี SUPABASE_SERVICE_ROLE_KEY)");
  const body = JSON.stringify(target);
  const ts = String(Date.now());
  const sig = createHmac("sha256", key).update(`${ts}.${body}`).digest("hex");
  try {
    const r = await fetch(`${site}/api/revalidate-products`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-revalidate-ts": ts, "x-revalidate-sig": sig },
      body,
      signal: AbortSignal.timeout(30_000),
    });
    const j = (await r.json().catch(() => null)) as { products?: string[]; error?: string } | null;
    if (r.ok) console.log(`   ⏱️ ล้างแคชหน้าสินค้าบน ${site.replace(/^https?:\/\//, "")} แล้ว: ${(j?.products ?? []).join(", ") || "-"}`);
    else if (r.status === 404) console.log(`   ⚠️ ${site} ยังไม่มีเส้นล้างแคช (ต้อง deploy ก่อน) — หน้าเว็บจริงจะสดเองภายใน 1 ชม. หรือบันทึกสินค้าจากหลังบ้าน 1 ครั้ง`);
    else console.log(`   ⚠️ ล้างแคชหน้าเว็บไม่สำเร็จ (${r.status} ${j?.error ?? ""}) — หน้าเว็บจริงจะสดเองภายใน 1 ชม.`);
  } catch (e) {
    console.log(`   ⚠️ ล้างแคชหน้าเว็บไม่สำเร็จ (${e instanceof Error ? e.message : String(e)}) — หน้าเว็บจริงจะสดเองภายใน 1 ชม.`);
  }
}
