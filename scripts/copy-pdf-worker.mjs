/**
 * ก๊อป worker ของ pdf.js ไปไว้ใน /public ก่อน build
 *
 * ใช้ทำรูปตัวอย่างจากไฟล์ .ai/.pdf ในหน้าคลังเทมเพลต (ดู lib/ai-thumbnail.ts)
 * ต้องเสิร์ฟเป็นไฟล์สแตติก เพราะ Turbopack resolve `new URL("pdfjs-dist/...", import.meta.url)`
 * จาก bare specifier ไม่ได้ (ขึ้น "Expected module to match pattern")
 * ก๊อปทุกครั้งที่ build เพื่อให้เวอร์ชันในโฟลเดอร์ public ตรงกับที่ติดตั้งไว้เสมอ
 */
import { copyFileSync, existsSync } from "node:fs";

const from = "node_modules/pdfjs-dist/build/pdf.worker.min.mjs";
const to = "public/pdf.worker.min.mjs";

if (!existsSync(from)) {
  console.warn(`[copy-pdf-worker] ไม่เจอ ${from} — ข้ามไป (รูปตัวอย่างจาก .ai จะใช้ไม่ได้)`);
  process.exit(0);
}
copyFileSync(from, to);
console.log(`[copy-pdf-worker] ${from} → ${to}`);
