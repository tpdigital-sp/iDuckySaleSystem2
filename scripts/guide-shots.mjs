/**
 * ถ่ายภาพหน้าจอจริงสำหรับคู่มือ (/admin/guide) → public/guide/*.png
 *
 * ใช้ตอนหน้าจอเปลี่ยนแล้วภาพในคู่มือเก่า:
 *   1. สร้างออเดอร์ตัวอย่างที่ข้อมูลสมมติ แล้วเขียน id ลง /tmp/shot-id.txt
 *   2. เขียนคุกกี้แอดมินลง /tmp/shot-cookie.txt
 *   3. node scripts/guide-shots.mjs
 *   4. ลบออเดอร์ตัวอย่างทิ้ง
 *
 * ต้องมี Google Chrome ในเครื่อง · ไม่ต้องลง dependency เพิ่ม (ใช้ CDP ผ่าน WebSocket ของ Node)
 * ⚠️ อย่าถ่ายจากออเดอร์ลูกค้าจริง — ภาพจะถูก commit ลง repo
 */
import { spawn } from "node:child_process";
import fs from "node:fs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9333;
const cookie = fs.readFileSync("/tmp/shot-cookie.txt", "utf8").split("=");
const id = fs.readFileSync("/tmp/shot-id.txt", "utf8").trim();
const url = `http://localhost:3001/admin/orders/${id}/print`;

const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`,
  "--user-data-dir=/tmp/chrome-shot", "--no-first-run", "--disable-gpu",
  "--window-size=1400,2000", "--hide-scrollbars", "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cdp() {
  for (let i = 0; i < 40; i++) {
    try {
      const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
      return t.webSocketDebuggerUrl;
    } catch { await sleep(250); }
  }
  throw new Error("chrome ไม่ตอบ");
}

const ws = new WebSocket(await cdp());
await new Promise((r) => (ws.onopen = r));
let seq = 0;
const waiters = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m.result); waiters.delete(m.id); }
};
const send = (method, params = {}) =>
  new Promise((res) => { const i = ++seq; waiters.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });

await send("Page.enable");
await send("DOM.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 2000, deviceScaleFactor: 2, mobile: false });
await send("Network.enable");
await send("Network.setCookie", { name: cookie[0], value: cookie.slice(1).join("="), domain: "localhost", path: "/" });
await send("Page.navigate", { url });
await sleep(6000); // รอโหลดออเดอร์ + รูปแบบงาน

const { root } = await send("DOM.getDocument", { depth: 1 });
const { nodeId } = await send("DOM.querySelector", { nodeId: root.nodeId, selector: ".sheet" });
if (!nodeId) throw new Error("ไม่เจอใบงานในหน้า (อาจล็อกอินไม่ผ่าน)");
const { model } = await send("DOM.getBoxModel", { nodeId });
const [x1, y1, x2, , , y3] = model.border;
const clip = { x: x1, y: y1, width: x2 - x1, height: y3 - y1, scale: 1.5 };

const { data } = await send("Page.captureScreenshot", { format: "png", clip, captureBeyondViewport: true });
fs.writeFileSync("public/guide/print-sheet.png", Buffer.from(data, "base64"));
console.log("บันทึกแล้ว · ขนาดกล่อง", Math.round(clip.width), "x", Math.round(clip.height));
ws.close(); chrome.kill();
