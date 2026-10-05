/**
 * ♻️ กู้ลายลูกค้า + แบบงานกราฟฟิกของ OD-261001-8513 ที่หายตอน "ดึงรายการตามเอกสาร FlowAccount" (5 ต.ค. 69 03:40 UTC)
 *
 *   npx tsx --conditions=react-server --tsconfig tsconfig.json scripts/restore-od-261001-8513-art.mts           (ดูเฉย ๆ)
 *   npx tsx --conditions=react-server --tsconfig tsconfig.json scripts/restore-od-261001-8513-art.mts --apply
 *
 * ต้นเหตุ: ฟอร์มใบกำกับภาษีสร้างรายการใหม่ทั้งชุดจากเอกสาร (แก้แล้วใน lib/doc-items-merge.ts)
 * ไฟล์ในคลังยังอยู่ครบ — ประกอบกลับจาก storage + log ของใบ:
 *   · แบบงาน order-proofs/OD-261001-8513/<รายการ>-<uuid>.jpg 21 ไฟล์ · qty/รายละเอียดจาก log "อัปโหลดแบบให้ลูกค้าตรวจ" (เวลาตรงกันทีละไฟล์)
 *   · ลายลูกค้า customer-artwork/art/2026-10/ ตามเวลาของ log "แนบภาพลาย" (+2 · +4 +2 · +3 · +8 +1) · จำนวนต่อลายจาก log "แก้จำนวนต่อลาย"
 *   · ผลตรวจลูกค้า: Card PVC อนุมัติ (แน่นอน) · โปสการ์ด 3 รายการ log บอกแค่ "อนุมัติ 2 · ขอแก้ 1" ไม่บอกว่ารายการไหน
 *     → ตั้งทั้ง 3 รายการเป็น "ขอแก้ไข" พร้อมคำขอของลูกค้า (ไม่เดาว่าอันไหนอนุมัติ กันส่งผลิตงานที่ลูกค้ายังไม่ผ่าน)
 * ไม่แตะยอดเงิน/สถานะ/ค่าส่ง — รายการที่ 5 (สั่งเพิ่ม) คงเดิม
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { withLog, type Order, type OrderItem, type Proof } from "../src/lib/admin-data";
import { updateOrder } from "../src/lib/server/order-write";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes("--apply");
const ID = "OD-261001-8513";
const pub = (bucket: string, path: string) => sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;

const { data: row } = await sb.from("orders").select("data").eq("id", ID).single();
const order = row!.data as Order;
if (order.items.slice(0, 4).some((it) => it.proofs?.length || it.artworkUrls?.length)) {
  console.log("รายการ 1–4 มีแบบ/ลายอยู่แล้ว — ไม่กู้ทับ");
  process.exit(0);
}

// ── แบบงาน: ไฟล์ใน storage จับคู่กับ log อัปโหลดตามลำดับเวลา ──
const { data: files } = await sb.storage.from("order-proofs").list(ID, { limit: 200, sortBy: { column: "created_at", order: "asc" } });
const upLogs = (order.log ?? []).filter((l) => l.action === "อัปโหลดแบบให้ลูกค้าตรวจ").sort((a, b) => (a.at < b.at ? -1 : 1));
if (!files || files.length !== upLogs.length) throw new Error(`ไฟล์แบบ ${files?.length} ไม่เท่ากับ log ${upLogs.length}`);
const proofsBy: Record<number, Proof[]> = {};
files.forEach((f, k) => {
  const l = upLogs[k];
  const lag = Date.parse(l.at) - Date.parse(f.created_at!);
  if (lag < 0 || lag > 5000) throw new Error(`เวลาไม่ตรง ${f.name} ↔ ${l.at}`);
  const idx = Number(f.name.split("-")[0]);
  // detail = "<ชื่อรายการ> · [<n> ชิ้น · ]<รายละเอียด>"
  const parts = (l.detail ?? "").split(" · ").slice(1);
  const q = parts[0]?.match(/^(\d+) ชิ้น$/);
  const note = (q ? parts.slice(1) : parts).join(" · ");
  (proofsBy[idx] ??= []).push({
    url: pub("order-proofs", `${ID}/${f.name}`),
    at: f.created_at!,
    by: l.by,
    ...(q ? { qty: Number(q[1]), unit: "ชิ้น" } : {}),
    ...(note ? { note } : {}),
  });
});

// ── ลายลูกค้า: ตามเวลาอัปโหลด (ชุดละ log "แนบภาพลาย") ──
const art = (names: string[]) => names.map((n) => pub("customer-artwork", `art/2026-10/${n}`));
const ART: Record<number, string[]> = {
  0: art(["62d28b30-798c-4c25-99a9-7b2c353dbf5e.jpg", "e7fe3ebc-c20a-4f2a-a191-a0ed42fa4eba.jpg"]),
  1: art([
    "b2c26267-6bfa-457c-9a01-515a3ab13b23.jpg",
    "6adb07a7-6f69-4e53-9b6a-3ff89c465dcf.jpg",
    "972da3aa-1835-4b78-9507-03e8cfce1be2.jpg",
    "ae4d885e-6dd0-4a73-8ea3-9c78bdc4427e.jpg",
    "02bf0fce-2c4c-4446-b3a6-183020ec5136.jpg",
    "c2ae0963-5a16-4ba2-9554-82eee7fc94a2.jpg",
  ]),
  2: art(["a7098056-d598-4232-8716-c842d3771854.jpg", "39322441-ad58-4ef9-b59b-8cd74899d498.jpg", "a36d4b6b-86e5-4d31-9ece-bcd05923dd32.jpg"]),
  3: art([
    "e5ca4c4b-49a1-4adb-ad98-96d613db202b.jpg",
    "e41ef94b-83a1-4a19-a08a-839086efa6de.jpg",
    "9dff75fa-53a2-4ed0-92f6-a39ebda34a04.jpg",
    "2b5a8cd5-9257-48a9-ae65-3ac4e16e4c6d.jpg",
    "996b17e0-2509-4541-992c-bd2e3bb9a355.jpg",
    "2f01411f-bfc1-4511-8a4f-4586ca5ebb86.jpg",
    "991724f1-6ac4-40c5-8c02-4deb6c3e21de.jpg",
    "1f5963b7-6514-4464-a009-4cc8babff82c.jpg",
    "dd263218-853e-4a16-9f92-4d3aa9c4d5ea.jpg",
  ]),
};
const QTY: Record<number, number[]> = { 1: [16, 16, 16, 16, 16, 16], 2: [8, 8, 8], 3: [40, 40, 40, 25, 15, 25, 5, 5, 25] };

// ── ผลตรวจลูกค้า ──
const approveAt = (order.log ?? []).find((l) => l.by === "ลูกค้า" && l.action === "อนุมัติแบบ" && l.detail === order.items[3].name)?.at;
const edit = (order.log ?? []).find((l) => l.by === "ลูกค้า" && l.action === "ขอแก้ไขแบบ");
const editNote = edit?.detail?.split(" — ").slice(1).join(" — ") ?? "";
const editMemo = `(กู้คืนข้อมูล 5 ต.ค. 69 — ลูกค้าอนุมัติโปสการ์ด 2 ใน 3 รายการ ขอแก้ 1 รายการ แต่ระบบไม่ได้จำว่ารายการไหน ให้กราฟฟิกเช็คกับลูกค้า) ${editNote}`;

const items: OrderItem[] = order.items.map((it, i) => {
  if (i > 3) return it;
  const proofs = proofsBy[i] ?? [];
  const isCard = i === 3;
  const urls = ART[i];
  const qty = QTY[i];
  const reviewed = proofs.map((p) =>
    isCard ? { ...p, review: "อนุมัติ" as const, reviewAt: approveAt } : { ...p, review: "ขอแก้ไข" as const, reviewNote: editMemo, reviewAt: edit?.at }
  );
  return {
    ...it,
    artworkUrls: urls,
    ...(qty ? { artworkQty: Object.fromEntries(urls.map((u, k) => [u, qty[k]])) } : {}),
    proofs: reviewed,
    proofStatus: isCard ? "อนุมัติ" : "ขอแก้ไข",
    ...(isCard ? {} : { proofNote: editMemo }),
    proofUpdatedAt: proofs.at(-1)?.at,
    proofReviewedAt: isCard ? approveAt : edit?.at,
  };
});

for (const [i, it] of items.slice(0, 4).entries())
  console.log(`${i + 1}. ${it.name} ×${it.qty} · ลาย ${it.artworkUrls?.length} · แบบ ${it.proofs?.length} · ${it.proofStatus} · qty ${(it.proofs ?? []).map((p) => p.qty ?? "-").join(",")}`);

if (!APPLY) {
  console.log("\n(ดูเฉย ๆ — ใส่ --apply เพื่อบันทึก)");
  process.exit(0);
}
const next = withLog(
  { ...order, items },
  "ระบบ",
  "กู้ลาย/แบบงานคืน",
  "รายการ 1–4: ลายลูกค้า 20 รูป + แบบงาน 21 รูป ที่หายตอนดึงรายการตามเอกสาร FlowAccount (5 ต.ค. 69) · Card PVC อนุมัติแล้ว · โปสการ์ด 3 รายการตั้งเป็นขอแก้ไข (log ไม่บอกว่ารายการไหนอนุมัติ)"
);
const r = await updateOrder(sb as never, next, { prev: order, by: "ระบบ" });
console.log(r.error ? `❌ ${r.error.message}` : "✅ บันทึกแล้ว");
