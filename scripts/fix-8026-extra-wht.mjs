#!/usr/bin/env node
/**
 * ซ่อมเรคอร์ด msVerify สลิปใบเพิ่มงวดหลังของ OD-260911-8026 (6 ต.ค. 69)
 * 2 ต.ค. แอดมินกด 💰 รับยอดเอง ตอนนั้นกล่องเติม "ยอดค้างตามบิล" 10,973.12 (ก่อนแก้ e625d9d)
 * เงินเข้าจริง 10,665.46 (หัก ณ ที่จ่าย 3% = 307.66) → msDaily จับคู่กับแถวโอนไม่ได้
 *   node scripts/fix-8026-extra-wht.mjs          # ดูอย่างเดียว
 *   node scripts/fix-8026-extra-wht.mjs --write  # เขียนจริง
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(new URL("../package.json", import.meta.url));
const { cert, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url),"utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const svc = JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64,"base64").toString("utf8"));
const db = getFirestore(initializeApp({credential:cert(svc)}), env.FIREBASE_DATABASE_ID||"tp-fixflow");
const WRITE = process.argv.includes("--write");
const ref = db.collection("iduckyPaidOrders").doc("OD-260911-8026-pmuqce0zkx48q");
const x = (await ref.get()).data();
console.log("ตอนนี้", { slipAmount: x.slipAmount, orderTotal: x.orderTotal, wht: x.wht, fee: x.fee });
if (Math.abs(x.slipAmount - 10973.12) > 0.01) { console.log("ยอดไม่ใช่ 10,973.12 แล้ว — ข้าม"); process.exit(0); }
const patch = {
  slipAmount: 10665.46, orderTotal: 10973.12, wht: 307.66, whtRate: 3, fee: 0,
  receivedUpdatedAt: new Date().toISOString(),
  amountFixNote: "6 ต.ค. 69: รับยอดเองตอนนั้นกล่องเติมยอดตามบิล 10,973.12 — เงินเข้าจริง 10,665.46 (หัก ณ ที่จ่าย 3% = 307.66)",
};
console.log(WRITE ? "✍ เขียน" : "→ จะเขียน (เติม --write)", patch);
if (WRITE) await ref.update(patch);
process.exit(0);
