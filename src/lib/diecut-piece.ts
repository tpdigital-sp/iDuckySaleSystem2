/**
 * ✂️ งานไดคัทฝั่งลูกค้า (CalendarStudio รูปแบบ cut@…) — หาขอบงานของรูป + ภาพจำลองชิ้นงาน
 * หาขอบงานแบบเดียวกับ tools/cutout-py/engine.py: auto → alpha (PNG โปร่งใส) | solid (พื้นสีเรียบ) | ai (ภาพถ่าย) | none (ทั้งใบ)
 * เส้นตัดอยู่ที่ lib/diecut-engine (processCut)
 */

import { boxBlur, maskFromBackgroundColor } from "./cutout";
import { pathCurves, type CutResult } from "./diecut-engine";

export type BgMethod = "alpha" | "solid" | "ai" | "none";
export const BG_METHODS: { key: BgMethod | "auto"; label: string }[] = [
  { key: "auto", label: "อัตโนมัติ" },
  { key: "alpha", label: "ขอบโปร่งใส" },
  { key: "solid", label: "สีพื้น" },
  { key: "ai", label: "AI" },
  { key: "none", label: "ทั้งใบ" },
];

function sample(el: CanvasImageSource, w: number, h: number, maxSide: number) {
  const k = Math.min(1, maxSide / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * k));
  const ch = Math.max(1, Math.round(h * k));
  const cv = document.createElement("canvas");
  cv.width = cw;
  cv.height = ch;
  const ctx = cv.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(el, 0, 0, cw, ch);
  return ctx.getImageData(0, 0, cw, ch);
}

/** engine.detect: ดูภาพแล้วเลือกวิธีหาขอบงาน */
export function detectBg(el: CanvasImageSource, w: number, h: number): { method: Exclude<BgMethod, "none">; reason: string } {
  const id = sample(el, w, h, 512);
  const d = id.data;
  let clear = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 250) clear++;
  if (clear / (d.length / 4) > 0.005) return { method: "alpha", reason: "ไฟล์มีพื้นโปร่งใสอยู่แล้ว" };
  // ขอบภาพสีเดียว ≥ 93% + เหลือวัตถุพอสมควร = พื้นสีเรียบ
  const W = id.width;
  const H = id.height;
  const t = Math.max(2, Math.floor(Math.min(W, H) / 200));
  const ring: number[][] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (x < t || y < t || x >= W - t || y >= H - t) {
        const i = (y * W + x) * 4;
        ring.push([d[i], d[i + 1], d[i + 2]]);
      }
  const med = [0, 1, 2].map((c) => ring.map((p) => p[c]).sort((a, b) => a - b)[ring.length >> 1]);
  const close = ring.filter((p) => Math.hypot(p[0] - med[0], p[1] - med[1], p[2] - med[2]) < 22).length / ring.length;
  if (close > 0.93) {
    const m = maskFromBackgroundColor(d, W, H, 14);
    let c = 0;
    for (let i = 0; i < m.length; i++) if (m[i] >= 128) c++;
    const frac = c / m.length;
    if (frac > 0.02 && frac < 0.97) return { method: "solid", reason: "ขอบภาพเป็นสีพื้นเรียบ" };
  }
  return { method: "ai", reason: "ภาพถ่าย/พื้นหลังซับซ้อน ใช้ AI ตัด" };
}

/**
 * 🪄 ตัดพื้นหลังรูป → PNG พื้นใส (เพดานด้านยาว 3000)
 * solid = ไล่สีพื้นจากขอบ · ai = ISNet ในเบราว์เซอร์ (ครั้งแรกโหลด ~88 MB) · shrinkPx = หดขอบตัด halo (พิกเซลของรูปเต็ม)
 * คืน null = แบบ solid แยกไม่ออก
 */
export async function removeBackground(
  el: CanvasImageSource,
  natW: number,
  natH: number,
  mode: "solid" | "ai",
  shrinkPx = 1,
  onProgress?: (text: string) => void,
): Promise<Blob | null> {
  const k = Math.min(1, 3000 / Math.max(natW, natH));
  const W = Math.max(1, Math.round(natW * k));
  const H = Math.max(1, Math.round(natH * k));
  const full = document.createElement("canvas");
  full.width = W;
  full.height = H;
  const fctx = full.getContext("2d", { willReadFrequently: true })!;
  fctx.drawImage(el, 0, 0, W, H);
  const wk = Math.min(1, 1024 / Math.max(W, H));
  const ww = Math.max(1, Math.round(W * wk));
  const wh = Math.max(1, Math.round(H * wk));
  const work = document.createElement("canvas");
  work.width = ww;
  work.height = wh;
  const wctx = work.getContext("2d", { willReadFrequently: true })!;
  wctx.drawImage(full, 0, 0, ww, wh);
  const id = wctx.getImageData(0, 0, ww, wh);
  let mask: Uint8Array;
  if (mode === "ai") {
    const { aiMask } = await import("./cutout-ai");
    mask = (await aiMask(id, (p) => onProgress?.(p.text))).mask;
  } else {
    mask = boxBlur(maskFromBackgroundColor(id.data, ww, wh, 14), ww, wh, 1);
    let c = 0;
    for (let i = 0; i < mask.length; i++) if (mask[i] >= 128) c++;
    const cov = c / mask.length;
    if (cov < 0.02 || cov > 0.97) return null;
  }
  const m = new ImageData(ww, wh);
  for (let i = 0; i < mask.length; i++) m.data[i * 4 + 3] = mask[i];
  wctx.putImageData(m, 0, 0);
  fctx.globalCompositeOperation = "destination-in";
  fctx.imageSmoothingQuality = "high";
  fctx.drawImage(work, 0, 0, W, H);
  // หดขอบตัด halo: กันขอบสีพื้นเดิมติดมา (clean_mask shrink)
  const sp = Math.round(shrinkPx * k);
  if (sp > 0) {
    const a = fctx.getImageData(0, 0, W, H);
    const src = new Uint8Array(W * H);
    for (let i = 0; i < src.length; i++) src[i] = a.data[i * 4 + 3];
    // หดแบบ min-filter แนวนอน+แนวตั้ง
    const tmp = new Uint8Array(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        let v = 255;
        for (let d = -sp; d <= sp; d++) v = Math.min(v, src[y * W + Math.min(W - 1, Math.max(0, x + d))]);
        tmp[y * W + x] = v;
      }
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        let v = 255;
        for (let d = -sp; d <= sp; d++) v = Math.min(v, tmp[Math.min(H - 1, Math.max(0, y + d)) * W + x]);
        a.data[(y * W + x) * 4 + 3] = v;
      }
    fctx.putImageData(a, 0, 0);
  }
  return new Promise((res) => full.toBlob((b) => res(b), "image/png"));
}

/**
 * ภาพชิ้นงาน (มม.จริง): ขอบสี (stroke) → ลาย → เจาะรู → [เส้นตัดชมพู]
 * ctx ตั้งสเกลเป็นพิกเซลต่อ มม.จริง แล้ว · art = ลายครอปตามกรอบวัตถุ (r.box) ขนาด objW×objH มม.
 */
export function drawPiece(ctx: CanvasRenderingContext2D, r: CutResult, art: CanvasImageSource, strokeColor: string, withCut: boolean) {
  if (r.stroke.length) {
    ctx.save();
    ctx.beginPath();
    pathCurves(ctx, r.stroke);
    ctx.fillStyle = strokeColor;
    ctx.fill("evenodd");
    ctx.restore();
  }
  ctx.save();
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(art, 0, 0, r.objW, r.objH);
  ctx.restore();
  if (!withCut) return;
  ctx.save();
  ctx.lineWidth = 0.25;
  ctx.strokeStyle = "#ec4899";
  ctx.beginPath();
  pathCurves(ctx, r.cut);
  ctx.stroke();
  if (r.hole) {
    ctx.beginPath();
    ctx.arc(r.hole.cx, r.hole.cy, r.hole.r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}
