/**
 * 🎀📸 ภาพตัวอย่าง 2D Scrunchy — วางลายลูกค้าลงบนรูปยางรัดผมผ้าขาว 6 มุม (แบบงานปลอกคอหมา · lib/bandana-photo)
 * (เจ้าของร้านสั่ง 23 ต.ค. 69 "ทำเป็นภาพ 2D แทน · แบบงานปลอกคอหมา" + ส่งรูปผ้าขาวล้วน 6 มุม)
 *
 * รูป/มาสก์/วงรี อยู่ใน public/mock/scrunchy (เตรียมด้วย scripts/py/scrunchy-photo-prep.py)
 * พิกัดลายต่อพิกเซล (ผ้าเป็นวงแหวน):
 *   มุมรอบวง θ (ในพิกัดวงรีขอบนอก) → u = ตามยาวผ้า (กลางผืนอยู่ด้านหน้าสุดของวง · อ่านซ้าย→ขวาด้านหน้า · มุมล่างกลับด้าน)
 *   ตำแหน่งระหว่างขอบรู (t = 0) → ขอบนอก (t = 1) → v = ตามขวางผ้า (ช่วงกลาง 70% ของผืนในเส้นเย็บ · มุมล่างกลับด้าน)
 * ผสม: ลาย × เงาของผ้าขาว + ผิวผ้า + ประกายซาติน (satinShading) → เห็นรอยจีบ/เงา/ประกายของรูปจริงทะลุลาย
 */

export const SCRUNCHY_ASSET = "/mock/scrunchy";
export const SCRUNCHY_VIEWS = ["front", "top", "left", "right", "bottom", "low"] as const;
export type ScrunchyView = (typeof SCRUNCHY_VIEWS)[number];
export const SCRUNCHY_VIEW_TH: Record<ScrunchyView, string> = {
  front: "ด้านหน้า",
  top: "ด้านบน",
  left: "ด้านข้างซ้าย",
  right: "ด้านข้างขวา",
  bottom: "ด้านล่าง",
  low: "มุมต่ำ",
};

type Ell = { cx: number; cy: number; rx: number; ry: number };
export type ViewInfo = { w: number; h: number; outer: Ell; inner: Ell };

/** เส้นเย็บของเทมเพลตยางมัดผม (มม. จากขอบ) — นอกเส้นนี้อยู่ในตะเข็บ ไม่เห็นในงานจริง */
const SEAM = 9.7;

export function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, bad) => {
    const im = new Image();
    im.onload = () => ok(im);
    im.onerror = () => bad(new Error(`โหลดรูปไม่ได้ ${src}`));
    im.src = src;
  });
}

export function pixels(src: CanvasImageSource, w: number, h: number): Uint8ClampedArray {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(src, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h).data;
}

/**
 * 💡 แสงเงาจากรูปผ้าขาว → ตัวคูณสีลาย (shade) + ประกาย (spec) ต่อพิกเซล — ใช้ร่วม Scrunchy / ผ้าผูกผม
 *   shade = L / 0.9 · ประกาย = ส่วนสว่างจัด L > 0.93
 *   (ลองยืดความต่าง ×1.8 + high-pass ผิวผ้า 23 ต.ค. 69 — เจ้าของร้านว่า "ดูแย่ลง แสงเงาแย่ลง กลับไปแบบเดิม")
 */
export function satinShading(ph: Uint8ClampedArray, _mk: Uint8ClampedArray, w: number, h: number): { shade: Float32Array; spec: Float32Array } {
  const N = w * h;
  const shade = new Float32Array(N);
  const spec = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const L = (0.299 * ph[i * 4] + 0.587 * ph[i * 4 + 1] + 0.114 * ph[i * 4 + 2]) / 255;
    // 🎨 โทนสดนุ่ม (เจ้าของร้านส่งภาพตัวอย่าง 24 ต.ค. 69 "เป็นโทนแบบนี้ได้ไหม"): เงาเบาลง 40% · ประกายเหลือครึ่งและนุ่ม
    //   (เดิม shade = L/0.9 ตรง ๆ · ประกาย (L − 0.93)/0.07 × 0.55 → ร่องจีบเทาหม่น ประกายขาวทับสี)
    const base = Math.min(1.08, L / 0.9);
    shade[i] = base >= 1 ? base : 1 - (1 - base) * 0.6;
    spec[i] = Math.pow(Math.max(0, (L - 0.93) / 0.07), 1.4) * 0.28;
  }
  return { shade, spec };
}

/** ผสมสีลาย 1 พิกเซลกับแสงเงาผ้า — อิ่มสีขึ้น 15% (โทนสดแบบภาพตัวอย่าง) แล้วคูณเงา + ประกาย · เขียนลง out[o … o+2] */
export function mixSatin(r: number, g: number, b: number, shade: number, spec: number, out: Uint8ClampedArray, o: number) {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const SAT = spec || shade !== 1 ? 1.15 : 1;
  const rgb = [r, g, b];
  for (let ch = 0; ch < 3; ch++) {
    let v = (y + (rgb[ch] - y) * SAT) * shade;
    v += (255 - v) * spec;
    out[o + ch] = v;
  }
}

/** วาดภาพสำเร็จ 1 มุม: รูปผ้าขาว + ลายลูกค้า (พื้นโปร่งนอกผ้า) */
export function renderScrunchyView(
  key: ScrunchyView,
  info: ViewInfo,
  photo: HTMLImageElement,
  mask: HTMLImageElement,
  sheet: HTMLCanvasElement,
  sheetMm: { w: number; h: number },
  lit = false,
): HTMLCanvasElement {
  const { w, h, outer: o, inner: n } = info;
  const ph = pixels(photo, w, h);
  const mk = pixels(mask, w, h);
  // lit = false → สีตรงลาย ไม่แต่งแสงเงา (ลองแล้ว 23 ต.ค. 69 — เจ้าของร้านเลือกแบบมีแสงเงา · หน้าต่างส่ง true)
  const sh = lit ? satinShading(ph, mk, w, h) : null;
  const SW = sheet.width;
  const SH = sheet.height;
  const sp = pixels(sheet, SW, SH);
  const k = SW / sheetMm.w;
  // ช่วงผืนในเส้นเย็บ (พิกเซลของลาย)
  const x0 = SEAM * k;
  const xw = (sheetMm.w - 2 * SEAM) * k;
  const y0 = SEAM * k;
  const yh = (sheetMm.h - 2 * SEAM) * k;
  const flip = key === "bottom";
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const octx = out.getContext("2d");
  if (!octx) return out;
  const img = octx.createImageData(w, h);
  const d = img.data;
  const sample = (fx: number, fy: number, c: number) => {
    // bilinear
    const x = Math.max(0, Math.min(SW - 1.001, fx));
    const y = Math.max(0, Math.min(SH - 1.001, fy));
    const xi = x | 0;
    const yi = y | 0;
    const tx = x - xi;
    const ty = y - yi;
    const i00 = (yi * SW + xi) * 4 + c;
    const a = sp[i00] + (sp[i00 + 4] - sp[i00]) * tx;
    const b = sp[i00 + SW * 4] + (sp[i00 + SW * 4 + 4] - sp[i00 + SW * 4]) * tx;
    return a + (b - a) * ty;
  };
  for (let py = 0; py < h; py++)
    for (let px = 0; px < w; px++) {
      const i = (py * w + px) * 4;
      const al = mk[i];
      if (al < 4) continue;
      // มุมรอบวง (พิกัดวงรีขอบนอก) · จุดขอบรู/ขอบนอกที่มุมเดียวกัน
      const th = Math.atan2((py - o.cy) / o.ry, (px - o.cx) / o.rx);
      const c = Math.cos(th);
      const s = Math.sin(th);
      const pox = o.cx + o.rx * c;
      const poy = o.cy + o.ry * s;
      const pix = n.cx + n.rx * c;
      const piy = n.cy + n.ry * s;
      const ex = pox - pix;
      const ey = poy - piy;
      const t = Math.max(0, Math.min(1, ((px - pix) * ex + (py - piy) * ey) / (ex * ex + ey * ey || 1)));
      // u: ด้านหน้าสุดของวง (θ = π/2 · ล่างของรูป) = กลางผืน · เดินซ้าย→ขวา · มุมล่าง (มองจากใต้) กลับด้าน
      let u = flip ? 0.25 + th / (2 * Math.PI) : 0.75 - th / (2 * Math.PI);
      u -= Math.floor(u);
      const v = flip ? 0.85 - 0.7 * t : 0.15 + 0.7 * t;
      const fx = x0 + u * xw;
      const fy = y0 + v * yh;
      const shade = sh ? sh.shade[i >> 2] : 1;
      const spec = sh ? sh.spec[i >> 2] : 0;
      const la = sample(fx, fy, 3) / 255; // ส่วนโปร่งของลาย = ผ้าขาวตามรูป
      const dc = (ch: number) => sample(fx, fy, ch) * la + 255 * (1 - la);
      mixSatin(dc(0), dc(1), dc(2), shade, spec, d, i);
      d[i + 3] = al;
    }
  octx.putImageData(img, 0, 0);
  return out;
}
