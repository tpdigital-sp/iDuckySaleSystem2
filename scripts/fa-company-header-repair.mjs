/**
 * 🏢 ซ่อมหัวกระดาษร้าน (ชื่อ/ที่อยู่/เลขผู้เสียภาษี บริษัท ทีพีดิจิตอล) ที่ว่างในใบแจ้งหนี้/ใบกำกับที่ระบบออกผ่าน API
 * (อัปเกรดต่อจาก QT ผ่าน Open API แล้ว FlowAccount ไม่เติม company ให้ · INV007722 OD-261012-2737 · 14 ต.ค. 69)
 * ใบใหม่ระบบเติมเองแล้ว (ensureCompanyHeader ใน flowaccount-api.ts) — สคริปต์นี้ไว้ไล่ใบเก่า
 *
 *   node --env-file=.env.local scripts/fa-company-header-repair.mjs                    (ดูรายการ ไม่แก้)
 *   node --env-file=.env.local scripts/fa-company-header-repair.mjs --apply            (แก้ทุกใบที่หัวกระดาษว่าง)
 *   node --env-file=.env.local scripts/fa-company-header-repair.mjs INV007722 --apply  (แก้เฉพาะใบ)
 *
 * แก้ = PUT เอกสารเดิมกลับไป + ช่อง company* จาก GET /company/info — รายการ/ยอด/วันที่คงเดิม · ตรวจซ้ำหลังแก้ทุกใบ
 */
const APPLY = process.argv.includes("--apply");
const only = process.argv.slice(2).filter((a) => !a.startsWith("--")).map((s) => s.toUpperCase());
const base = (process.env.FLOWACCOUNT_API_BASE || "https://openapi.flowaccount.com/v1").replace(/\/+$/, "");
const tk = await (
  await fetch(`${base}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: "flowaccount-api", client_id: process.env.FLOWACCOUNT_CLIENT_ID, client_secret: process.env.FLOWACCOUNT_CLIENT_SECRET }),
  })
).json();
const H = { Authorization: `Bearer ${tk.access_token}`, "Content-Type": "application/json" };
const get = async (p) => (await (await fetch(base + p, { headers: H })).json()).data;
const one = async (kind, id) => {
  const d = await get(`/${kind}/${id}`);
  return d?.list?.[0] ?? d;
};

const KEYS = ["companyName", "companyNameEn", "companyAddress", "companyAddressEn", "companyTaxId", "companyBranch", "companyBranchEn", "companyPhone", "companyMobile", "companyFax", "companyWebsite"];
const info = await get("/company/info");
const company = Object.fromEntries(KEYS.map((k) => [k, String(info?.[k] ?? "").trim()]));
if (!company.companyName) throw new Error("อ่าน /company/info ไม่ได้");

const sort = encodeURIComponent(JSON.stringify([{ name: "Id", sortOrder: "desc" }]));
let fixed = 0, failed = 0;
for (const kind of ["tax-invoices", "billing-notes"]) {
  const list = (await get(`/${kind}?currentPage=1&pageSize=100&sortBy=${sort}`))?.list ?? [];
  for (const row of list) {
    if (!/iDucky/.test(row.internalNotes || "")) continue;
    if (only.length && !only.includes(String(row.documentSerial).toUpperCase())) continue;
    const doc = await one(kind, row.recordId);
    if (String(doc?.company?.companyName ?? "").trim()) continue;
    const label = `${doc.documentSerial} (${doc.statusString}) ${doc.contactName}`;
    if (!APPLY) {
      console.log(`· ${label} — หัวกระดาษว่าง`);
      continue;
    }
    const body = {
      ...doc,
      ...company,
      documentStructureType: "UpdateSimpleDocument",
      recordId: Number(doc.recordId ?? row.recordId),
      useInlineVat: false,
      useInlineDiscount: String(doc.useInlineDiscount) === "true",
    };
    delete body.company;
    // ⚠️ items[].id ใน PUT = "รหัสสินค้าในคลัง FlowAccount" → FA เอาชื่อสินค้าคลังทับชื่อรายการ (INV007722 "CUP SLEEVE" กลายเป็น "cup sleeve" · 14 ต.ค. 69) — ตัดทิ้ง
    body.items = (doc.items ?? []).map(({ id: _id, ...it }) => it);
    const r = await fetch(`${base}/${kind}/${row.recordId}`, { method: "PUT", headers: H, body: JSON.stringify(body) });
    const j = await r.json().catch(() => null);
    const after = await one(kind, row.recordId);
    const ok = r.ok && j?.status !== false && String(after?.company?.companyName ?? "").trim();
    const same = Number(after?.grandTotal) === Number(doc.grandTotal) && after?.statusString === doc.statusString &&
      JSON.stringify((after?.items ?? []).map((i) => i.name)) === JSON.stringify((doc.items ?? []).map((i) => i.name));
    if (ok && same) fixed++;
    else failed++;
    console.log(`${ok ? (same ? "✅" : "⚠️ ยอด/รายการ/สถานะเปลี่ยน") : "❌"} ${label}${ok ? "" : ` — ${r.status} ${j?.message ?? ""}`}`);
  }
}
if (APPLY) console.log(`\nแก้แล้ว ${fixed} ใบ · ไม่สำเร็จ ${failed} ใบ (ไม่สำเร็จ = เปิดใบในแอป FlowAccount กดแก้ไข → บันทึก)`);
else console.log("\n(ดูอย่างเดียว — ใส่ --apply เพื่อแก้)");
