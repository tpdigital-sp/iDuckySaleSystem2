/**
 * 🔔 เทส "แจ้งเตือนเด้ง" (Order.alertNote) — npm run check:order-alert
 * ที่มา (เจ้าของร้านขอ 12 ต.ค. 69): popup ถึงแอดมิน/คนปริ้น/คนแพ็ค เด้งทุกหน้า จนเสร็จสิ้นหรือคนตั้งกดปิด
 * 16 ต.ค. 69 พนักงานขอ: ปิดได้เฉพาะคนตั้ง/ผู้ดูแลระบบ · คนอื่นกด "รับทราบ" อย่างเดียว · หยุดเองเมื่อสถานะเสร็จสิ้น
 * ไม่แตะ DB — เทสกติกา (order-alert.ts) + เรนเดอร์ popup/ช่องตั้งค่าจริงด้วย react-dom/server
 */
import * as React from "react";
import { createElement } from "react";
// tsconfig ตั้ง jsx: preserve → tsx แปลง JSX แบบ classic (React.createElement) ต้องมี React ใน global
(globalThis as { React?: typeof React }).React = React;
import { renderToStaticMarkup } from "react-dom/server";
import { orderAlertActive, type Order } from "../src/lib/admin-data";
import { applyOrderAlert, isAlertOwner, keepServerAlert, mayDismissAlert, type AlertWho } from "../src/lib/order-alert";
import { OrderAlertEditor, OrderAlertPopup } from "../src/components/admin/OrderAlertPopup";
import { PermProvider } from "../src/lib/perm-context";

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
const set = applyOrderAlert(base, { text: `  ${MSG}  ` }, "แอดมิน A", T1, "admin_a");
eq("ตั้ง: ตัดช่องว่างหัวท้าย + จด byUser", set?.alertNote, { text: MSG, by: "แอดมิน A", byUser: "admin_a", at: T1 });
ok("ตั้ง: ลง log", hasLog(set, "ตั้งแจ้งเตือน"));
ok("ตั้งแล้ว = เด้ง", orderAlertActive(set));
eq("ไม่มีแจ้งเตือน = ไม่เด้ง", orderAlertActive(base), false);
eq("ข้อความว่างบนใบที่ไม่มี = ไม่ต้องเขียน", applyOrderAlert(base, { text: "   " }, "A", T1), null);
eq("ตั้งข้อความเดิมซ้ำ = ไม่ต้องเขียน", applyOrderAlert(set!, { text: MSG }, "B", T2), null);
eq("ยาวเกิน 1000 ตัวถูกตัด", applyOrderAlert(base, { text: "ก".repeat(1500) }, "A", T1)?.alertNote?.text.length, 1000);

// ── 2. เด้งจนเสร็จสิ้น/ยกเลิก (จัดส่งแล้วยังเด้ง — พนักงานขอ 16 ต.ค. 69) ──
for (const st of ["รอชำระเงิน", "ชำระแล้ว", "อนุมัติแบบ", "กำลังผลิต", "จัดส่งแล้ว"]) ok(`สถานะ ${st} = ยังเด้ง`, orderAlertActive({ ...set!, status: st as Order["status"] }));
for (const st of ["เสร็จสิ้น", "ยกเลิก"]) eq(`สถานะ ${st} = หยุดเด้ง`, orderAlertActive({ ...set!, status: st as Order["status"] }), false);

// ── 2b. ใครปิดได้ ──
const OWNER: AlertWho = { username: "admin_a", name: "แอดมิน A" };
const OTHER: AlertWho = { username: "pack_b", name: "คนแพ็ค B" };
const SAME_NAME: AlertWho = { username: "someone", name: "แอดมิน A" };
const BOSS: AlertWho = { username: "owner", name: "เจ้าของร้าน", isAdministrator: true };
ok("คนตั้ง = ปิดได้", mayDismissAlert(set!.alertNote, OWNER));
eq("คนอื่น = ปิดไม่ได้", mayDismissAlert(set!.alertNote, OTHER), false);
eq("ชื่อซ้ำแต่คนละ username = ปิดไม่ได้ (ใบใหม่เทียบ byUser)", mayDismissAlert(set!.alertNote, SAME_NAME), false);
ok("ผู้ดูแลระบบ = ปิดได้", mayDismissAlert(set!.alertNote, BOSS));
const legacy = { text: MSG, by: "แอดมิน A", at: T1 };
ok("ใบเก่าไม่มี byUser → เทียบชื่อ", isAlertOwner(legacy, SAME_NAME));
eq("ใบเก่าไม่มี byUser → ชื่อไม่ตรง = ไม่ใช่เจ้าของ", isAlertOwner(legacy, OTHER), false);
eq("หน้าจอยังไม่รู้ตัวตน (username/name ว่าง) = ปิดไม่ได้", mayDismissAlert(set!.alertNote, { username: "", name: "" }), false);
eq("ไม่มีแจ้งเตือน = ไม่มีอะไรให้ปิด", mayDismissAlert(undefined, BOSS), false);

// ── 2c. รับทราบ (จดชื่อ ยังเด้งต่อ) ──
const ack1 = applyOrderAlert(set!, { ack: true }, "คนแพ็ค B", T2, "pack_b");
eq("รับทราบ: จดชื่อ+username+เวลา", ack1?.alertNote?.acks, [{ by: "คนแพ็ค B", user: "pack_b", at: T2 }]);
ok("รับทราบแล้วยังเด้งอยู่", orderAlertActive(ack1));
ok("รับทราบ: ลง log", hasLog(ack1, "รับทราบแจ้งเตือน"));
eq("คนเดิมกดรับทราบซ้ำ = ไม่ต้องเขียน", applyOrderAlert(ack1!, { ack: true }, "คนแพ็ค B", "2026-10-12T09:00:00.000Z", "pack_b"), null);
eq("คนที่สองรับทราบ = ต่อท้าย", applyOrderAlert(ack1!, { ack: true }, "คนปริ้น C", T2, "print_c")?.alertNote?.acks?.length, 2);
eq("รับทราบใบที่ไม่มีแจ้งเตือน = ไม่ต้องเขียน", applyOrderAlert(base, { ack: true }, "X", T2, "x"), null);
eq("รับทราบใบที่เสร็จสิ้นแล้ว = ไม่ต้องเขียน", applyOrderAlert({ ...set!, status: "เสร็จสิ้น" }, { ack: true }, "X", T2, "x"), null);

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
eq("เปิดใหม่: ล้างรายชื่อรับทราบ", applyOrderAlert(applyOrderAlert(ack1!, { dismiss: true }, "แอดมิน A", T2)!, { reopen: true }, "แอดมิน A", T2)?.alertNote?.acks, undefined);
eq("เปิดใหม่: คนตั้งเดิมยังเป็นเจ้าของ", re?.alertNote?.byUser, "admin_a");
eq("เปิดใหม่: ล้างคนปิด + เวลาตั้งใหม่ (เด้งให้คนที่กดรับทราบไปแล้วด้วย)", [re?.alertNote?.dismissedAt, re?.alertNote?.at], [undefined, "2026-10-12T09:00:00.000Z"]);
const edited = applyOrderAlert(off!, { text: MSG }, "แอดมิน A", T2);
ok("ตั้งข้อความเดิมบนใบที่ปิดไปแล้ว = เด้งใหม่", orderAlertActive(edited));
const edit2 = applyOrderAlert(set!, { text: "ใส่ของแถม 2 ชิ้น" }, "แอดมิน A", T2);
eq("แก้ข้อความ: ข้อความ+เวลาใหม่", [edit2?.alertNote?.text, edit2?.alertNote?.at], ["ใส่ของแถม 2 ชิ้น", T2]);
eq("แก้ข้อความโดยแอดมินอีกคน = เจ้าของเปลี่ยนเป็นคนแก้ + ล้างรับทราบ", applyOrderAlert(ack1!, { text: "ข้อความใหม่" }, "แอดมิน D", T2, "admin_d")?.alertNote, { text: "ข้อความใหม่", by: "แอดมิน D", byUser: "admin_d", at: T2 });
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

// ── 7. เรนเดอร์ popup จริง (ใส่ตัวตนผ่าน PermProvider เหมือน AdminShell) ──
const asWho = (who: AlertWho, el: React.ReactElement) =>
  renderToStaticMarkup(
    createElement(PermProvider, { value: { perms: [], role: "", name: who.name, username: who.username, isAdministrator: !!who.isAdministrator, ready: true } }, el)
  );
const popup = (orders: Order[], who: AlertWho = OWNER) => asWho(who, createElement(OrderAlertPopup, { orders }));
const h1 = popup([set!]);
ok("popup: มีข้อความ", h1.includes(MSG));
ok("popup: มีเลขออเดอร์", h1.includes("OD-TEST-ALERT"));
ok("popup (คนตั้ง): มีปุ่มรับทราบ + ปิดแจ้งเตือน", h1.includes("รับทราบ") && h1.includes("✓ ปิดแจ้งเตือน"));
const hOther = popup([set!], OTHER);
ok("popup (คนอื่น): มีปุ่มรับทราบ แต่ไม่มีปุ่มปิด", hOther.includes("✓ รับทราบ") && !hOther.includes("✓ ปิดแจ้งเตือน"));
ok("popup (คนอื่น): บอกว่าใครปิดได้", hOther.includes("ปิดแจ้งเตือนได้เฉพาะ แอดมิน A"));
ok("popup (ผู้ดูแลระบบ): มีปุ่มปิด", popup([set!], BOSS).includes("✓ ปิดแจ้งเตือน"));
ok("popup (ไม่รู้ตัวตน): ไม่มีปุ่มปิด", !renderToStaticMarkup(createElement(OrderAlertPopup, { orders: [set!] })).includes("✓ ปิดแจ้งเตือน"));
ok("popup: โชว์รายชื่อคนรับทราบแล้ว", popup([ack1!]).includes("รับทราบแล้ว 1 คน: คนแพ็ค B"));
ok("popup: ไม่ติดลงกระดาษตอนปริ้น (print:hidden)", h1.includes("print:hidden"));
eq("popup: ไม่มีแจ้งเตือน = ไม่เรนเดอร์อะไร", popup([base]), "");
eq("popup: ปิดแล้ว = ไม่เรนเดอร์", popup([off!]), "");
ok("popup: จัดส่งแล้ว = ยังเรนเดอร์ (เด้งจนเสร็จสิ้น)", popup([{ ...set!, status: "จัดส่งแล้ว" }]).includes(MSG));
eq("popup: เสร็จสิ้น = ไม่เรนเดอร์", popup([{ ...set!, status: "เสร็จสิ้น" }]), "");
const second = applyOrderAlert({ ...base, id: "OD-TEST-ALERT-2" }, { text: "ใบที่สอง" }, "A", T1)!;
const h2 = popup([base, set!, second]);
ok("popup ปริ้นรวม: โชว์ใบแรกที่มีแจ้งเตือน + บอกว่ามีอีก 1 ใบ", h2.includes(MSG) && h2.includes("อีก 1 ใบมีแจ้งเตือน"));

// ── 8. เรนเดอร์ช่องตั้งค่าในหน้าออเดอร์ ──
const editor = (o: Order, canEdit: boolean, who: AlertWho = OWNER) => asWho(who, createElement(OrderAlertEditor, { order: o, canEdit, onChanged: () => {} }));
ok("ช่องตั้งค่า (แอดมิน): มี textarea", editor(base, true).includes("<textarea"));
ok("ช่องตั้งค่า (คนตั้ง): กำลังเด้ง → ปุ่มปิด", editor(set!, true).includes("กำลังเด้ง") && editor(set!, true).includes("✓ ปิดแจ้งเตือน"));
const edOther = editor(set!, true, OTHER);
ok("ช่องตั้งค่า (แอดมินคนอื่น): ไม่มีปุ่มปิด + บอกว่าใครปิดได้", !edOther.includes("✓ ปิดแจ้งเตือน") && edOther.includes("ปิดแจ้งเตือนได้เฉพาะ แอดมิน A"));
ok("ช่องตั้งค่า: โชว์รายชื่อคนรับทราบ", editor(ack1!, true).includes("รับทราบแล้ว 1 คน"));
ok("ช่องตั้งค่า: ปิดแล้ว → บอกคนปิด + ปุ่มเปิดอีกครั้ง", editor(off!, true).includes("คนแพ็ค B") && editor(off!, true).includes("เปิดเด้งอีกครั้ง"));
eq("ช่องตั้งค่า (ไม่ใช่แอดมิน + ไม่มีแจ้งเตือน) = ไม่โชว์", editor(base, false), "");
eq("ช่องตั้งค่า (ไม่ใช่แอดมิน) = ไม่มี textarea", editor(set!, false).includes("<textarea"), false);

console.log(`🔔 แจ้งเตือนเด้ง: ผ่าน ${pass} ข้อ${fails.length ? ` · ❌ ตก ${fails.length} ข้อ` : ""}`);
for (const f of fails) console.log(`❌ ${f}`);
if (fails.length) process.exit(1);
