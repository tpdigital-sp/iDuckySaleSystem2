/**
 * 💸 ทดสอบตารางราคา/การคิดค่าใช้จ่าย AI (lib/ai-cost.ts) — ฟังก์ชันล้วน ไม่แตะฐานข้อมูล
 * รัน: npm run check:ai-cost
 */
import assert from "node:assert/strict";
import { costUsd, fmtThb, modelLabel, priceOf, tokensOf, MODEL_PRICES } from "../src/lib/ai-cost.ts";

// 1) นับโทเคนจาก usageMetadata — ค่าหาย/ติดลบ = 0 · cached ไม่เกิน input
const t = tokensOf({ promptTokenCount: 1200, candidatesTokenCount: 300, thoughtsTokenCount: 50, cachedContentTokenCount: 200, totalTokenCount: 1550 });
assert.deepEqual(t, { inTok: 1200, outTok: 300, thinkTok: 50, cachedTok: 200, totalTok: 1550 });
assert.deepEqual(tokensOf(undefined), { inTok: 0, outTok: 0, thinkTok: 0, cachedTok: 0, totalTok: 0 });
assert.equal(tokensOf({ promptTokenCount: 10, cachedContentTokenCount: 99 }).cachedTok, 10);
assert.equal(tokensOf({ promptTokenCount: 10, candidatesTokenCount: 5 }).totalTok, 15, "ไม่มี total → บวกเอง");

// 2) ราคา: flash-lite 1M เข้า + 1M ออก = $0.10 + $0.40
assert.equal(costUsd("gemini-2.5-flash-lite", { inTok: 1_000_000, outTok: 1_000_000, thinkTok: 0, cachedTok: 0, totalTok: 2_000_000 }), 0.5);
// โทเคนคิดราคาเท่า output · cached คิดส่วนลด
const flash = costUsd("gemini-2.5-flash", { inTok: 1000, outTok: 100, thinkTok: 100, cachedTok: 500, totalTok: 1200 });
const expect = (500 * 0.3 + 500 * 0.075 + 200 * 2.5) / 1e6;
assert.ok(Math.abs(flash - expect) < 1e-9, `flash ${flash} ≠ ${expect}`);
// 3) โมเดล preview/ชื่อยาว → หยิบตารางตัวที่เป็นคำนำหน้ายาวสุด · ไม่รู้จัก → เท่า 2.5 flash (ไม่ประเมินต่ำ)
assert.equal(priceOf("gemini-2.5-flash-lite-preview-09-2025"), MODEL_PRICES["gemini-2.5-flash-lite"]);
assert.equal(priceOf("models/gemini-2.5-pro"), MODEL_PRICES["gemini-2.5-pro"]);
assert.equal(priceOf("gemini-9-ultra"), MODEL_PRICES["gemini-2.5-flash"]);
// 4) n8n/ไม่มีโทเคน = 0
assert.equal(costUsd("n8n", tokensOf(undefined)), 0);
// 5) ป้าย
assert.equal(modelLabel("gemini-2.5-flash-lite"), "2.5 Flash-Lite");
assert.equal(fmtThb(0.004 * 33), "฿0.13");
assert.equal(fmtThb(12.345), "฿12.3");
assert.equal(fmtThb(1234.5), "฿1,235");

console.log("✅ ai-cost: ตารางราคา/การนับโทเคน/ป้าย ผ่านทั้งหมด");
