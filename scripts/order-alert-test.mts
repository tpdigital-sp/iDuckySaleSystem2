/**
 * 🔔 เทส "แจ้งเตือนเด้ง" (Order.alertNote) — npm run check:order-alert
 * ที่มา (เจ้าของร้านขอ 12 ต.ค. 69): popup ถึงแอดมิน/คนปริ้น/คนแพ็ค เด้งทุกหน้า จนจัดส่งแล้วหรือกดปิด
 * ไม่แตะ DB — เทสกติกา (order-alert.ts) + เรนเดอร์ popup/ช่องตั้งค่าจริงด้วย react-dom/server
 */
import * as React from "react";
import { createElement } from "react";
// tsconfig ตั้ง jsx: preserve → tsx แปลง JSX แบบ classic (React.createElement) ต้องมี React ใน global
(globalThis as { React?: typeof React }).React = React;
import { renderToStaticMarkup } from "react-dom/server";
import { orderAlertActive, type Order } from "../src/lib/admin-data";
import { applyOrderAlert, keepServerAlert } from "../src/lib/order-alert";
import { OrderAlertEditor, OrderAlertPopup } from "../src/components/admin/OrderAlertPopup";

let pass = 0;
const fails: string[] = [];
const eq = (name: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else fails.push(`${name}\n   ได้ ${JSON.stringify(got)}\n   ควรได้ ${JSON.stringify(want)}`);
};
const ok = (name: string, v: boolean) => eq(name, v, true);

const T1 = "2026-10-12T07:00:00.000Z";
const T2 = "2026-10-12T08:00:00.000Z";
const MSG = "ลูกค้าเปลี่ยนที่อยู่ ห้ามส่งตามใบเดิม";
const base = { id: "OD-TEST-ALERT", customer: "ทดสอบ", status: "กำลังผลิต", items: [], shippingCost: 0, log: [] } as unknown as Order;
const hasLog = (o: Order | null, needle: string) => JSON.stringify(o?.log ?? []).includes(needle);

// ── 1. ตั้งแจ้งเตือน ──
const set = applyOrderAlert(base, { text: `  ${MSG}  ` }, "แอดมิน A", T1);
eq("ตั้ง: ตัดช่องว่างหัวท้าย", set?.alertNote, { text: MSG, by: "แอดมิน A", at: T1 });
ok("ตั้ง: ลง log", hasLog(set, "ตั้งแจ้งเตือน"));
ok("ตั้งแล้ว = เด้ง", orderAlertActive(set));
eq("ไม่มีแจ้งเตือน = ไม่เด้ง", orderAlertActive(base), false);
eq("ข้อความว่างบนใบที่ไม่มี = ไม่ต้องเขียน", applyOrderAlert(base, { text: "   " }, "A", T1), null);
eq("ตั้งข้อความเดิมซ้ำ = ไม่ต้องเขียน", applyOrderAlert(set!, { text: MSG }, "B", T2), null);
eq("ยาวเกิน 1000 ตัวถูกตัด", applyOrderAlert(base, { text: "ก".repeat(1500) }, "A", T1)?.alertNote?.text.length, 1000);

// ── 2. เด้งจนจัดส่งแล้ว/เสร็จสิ้น/ยกเลิก ──
for (const st of ["รอชำระเงิน", "ชำระแล้ว", "อนุมัติแบบ", "กำลังผลิต"]) ok(`สถานะ ${st} = ยังเด้ง`, orderAlertActive({ ...set!, status: st as Order["status"] }));
for (const st of ["จัดส่งแล้ว", "เสร็จสิ้น", "ยกเลิก"]) eq(`สถานะ ${st} = หยุดเด้ง`, orderAlertActive({ ...set!, status: st as Order["status"] }), false);

// ── 3. กดปิด (ปิดถาวรทุกคน) ──
const off = applyOrderAlert(set!, { dismiss: true }, "คนแพ็ค B", T2);
eq("ปิด: ประทับคน+เวลา", [off?.alertNote?.dismissedBy, off?.alertNote?.dismissedAt], ["คนแพ็ค B", T2]);
eq("ปิด: ข้อความเดิมยังอยู่ (ดูย้อนหลังได้)", off?.alertNote?.text, MSG);
eq("ปิดแล้ว = ไม่เด้ง", orderAlertActive(off), false);
ok("ปิด: ลง log", hasLog(off, "ปิดแจ้งเตือน"));
eq("กดปิดซ้ำ (2 เครื่องพร้อมกัน) = ไม่ต้องเขียน", applyOrderAlert(off!, { dismiss: true }, "C", T2), null);
eq("กดปิดใบที่ไม่มีแจ้งเตือน = ไม่ต้องเขียน", applyOrderAlert(base, { dismiss: true }, "C", T2), null);

// ── 4. เปิดเด้งอีกครั้ง / แก้ข้อความหลังปิด ──
const re = applyOrderAlert(off!, { reopen: true }, "แอดมิน A", "2026-10-12T09:00:00.000Z");
ok("เปิดใหม่ = เด้งอีก", orderAlertActive(re));
eq("เปิดใหม่: ล้างคนปิด + เวลาตั้งใหม่ (เด้งให้คนที่กดรับทราบไปแล้วด้วย)", [re?.alertNote?.dismissedAt, re?.alertNote?.at], [undefined, "2026-10-12T09:00:00.000Z"]);
const edited = applyOrderAlert(off!, { text: MSG }, "แอดมิน A", T2);
ok("ตั้งข้อความเดิมบนใบที่ปิดไปแล้ว = เด้งใหม่", orderAlertActive(edited));
const edit2 = applyOrderAlert(set!, { text: "ใส่ของแถม 2 ชิ้น" }, "แอดมิน A", T2);
eq("แก้ข้อความ: ข้อความ+เวลาใหม่", [edit2?.alertNote?.text, edit2?.alertNote?.at], ["ใส่ของแถม 2 ชิ้น", T2]);
ok("แก้ข้อความ: ลง log ว่าแก้", hasLog(edit2, "แก้แจ้งเตือน"));

// ── 5. ลบทิ้ง ──
const del = applyOrderAlert(set!, { text: "" }, "แอดมิน A", T2);
eq("ลบ: ไม่มี alertNote แล้ว", "alertNote" in (del ?? {}), false);
ok("ลบ: ลง log พร้อมข้อความเดิม", hasLog(del, "ลบแจ้งเตือน") && hasLog(del, MSG));

// ── 6. PATCH ทั้งก้อนห้ามทับ (หน้าจอเปิดค้างก่อนตั้ง/ปิด) ──
eq("หน้าจอเก่าไม่มี alertNote → ยังเก็บของใน DB", keepServerAlert(set!, base).alertNote, set!.alertNote);
eq("หน้าจอเก่ายังไม่เห็นว่าถูกปิด → ยึดค่าที่ปิดแล้ว", keepServerAlert(off!, set!).alertNote?.dismissedAt, T2);
eq("หน้าจอแอบส่ง alertNote มาเองบนใบที่ DB ไม่มี → ตัดทิ้ง", "alertNote" in keepServerAlert(base, set!), false);
eq("ไม่มีทั้งคู่ = ไม่แตะ", keepServerAlert(base, base), base);

// ── 7. เรนเดอร์ popup จริง ──
const popup = (orders: Order[]) => renderToStaticMarkup(createElement(OrderAlertPopup, { orders }));
const h1 = popup([set!]);
ok("popup: มีข้อความ", h1.includes(MSG));
ok("popup: มีเลขออเดอร์", h1.includes("OD-TEST-ALERT"));
ok("popup: มีปุ่มรับทราบ + ปิดแจ้งเตือน", h1.includes("รับทราบ") && h1.includes("ปิดแจ้งเตือน"));
ok("popup: ไม่ติดลงกระดาษตอนปริ้น (print:hidden)", h1.includes("print:hidden"));
eq("popup: ไม่มีแจ้งเตือน = ไม่เรนเดอร์อะไร", popup([base]), "");
eq("popup: ปิดแล้ว = ไม่เรนเดอร์", popup([off!]), "");
eq("popup: จัดส่งแล้ว = ไม่เรนเดอร์", popup([{ ...set!, status: "จัดส่งแล้ว" }]), "");
const second = applyOrderAlert({ ...base, id: "OD-TEST-ALERT-2" }, { text: "ใบที่สอง" }, "A", T1)!;
const h2 = popup([base, set!, second]);
ok("popup ปริ้นรวม: โชว์ใบแรกที่มีแจ้งเตือน + บอกว่ามีอีก 1 ใบ", h2.includes(MSG) && h2.includes("อีก 1 ใบมีแจ้งเตือน"));

// ── 8. เรนเดอร์ช่องตั้งค่าในหน้าออเดอร์ ──
const editor = (o: Order, canEdit: boolean) => renderToStaticMarkup(createElement(OrderAlertEditor, { order: o, canEdit, onChanged: () => {} }));
ok("ช่องตั้งค่า (แอดมิน): มี textarea", editor(base, true).includes("<textarea"));
ok("ช่องตั้งค่า: กำลังเด้ง → ปุ่มปิด", editor(set!, true).includes("กำลังเด้ง") && editor(set!, true).includes("ปิดแจ้งเตือน"));
ok("ช่องตั้งค่า: ปิดแล้ว → บอกคนปิด + ปุ่มเปิดอีกครั้ง", editor(off!, true).includes("คนแพ็ค B") && editor(off!, true).includes("เปิดเด้งอีกครั้ง"));
eq("ช่องตั้งค่า (ไม่ใช่แอดมิน + ไม่มีแจ้งเตือน) = ไม่โชว์", editor(base, false), "");
eq("ช่องตั้งค่า (ไม่ใช่แอดมิน) = ไม่มี textarea", editor(set!, false).includes("<textarea"), false);

console.log(`🔔 แจ้งเตือนเด้ง: ผ่าน ${pass} ข้อ${fails.length ? ` · ❌ ตก ${fails.length} ข้อ` : ""}`);
for (const f of fails) console.log(`❌ ${f}`);
if (fails.length) process.exit(1);
