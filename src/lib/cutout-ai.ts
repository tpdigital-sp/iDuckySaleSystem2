/**
 * AI แยกวัตถุออกจากพื้นหลัง (ISNet general-use · DIS · Apache-2.0) — รันในเบราว์เซอร์ล้วน ไม่ส่งรูปออกนอกเครื่อง
 *
 * โหลด onnxruntime-web จาก CDN ตอนกดใช้ครั้งแรกเท่านั้น (ไม่ถ่วง bundle หน้าอื่น)
 * ตัวโมเดล ~88 MB ดาวน์โหลดครั้งแรกครั้งเดียว เก็บใน Cache Storage ของเบราว์เซอร์ ครั้งต่อไปเปิดทันที
 * มีการ์ดจอ (WebGPU) ≈ 1 วิ · ไม่มี = CPU ≈ 5–15 วิ
 *
 * ⚠️ ลอง BiRefNet (transformers.js) แล้ว 12 ต.ค. 69: รันไม่ผ่านทั้ง webgpu/wasm (หน่วยความจำ wasm ไม่พอที่ 1024 px)
 */

const ORT_VER = "1.22.0";
const ORT_URL = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VER}/dist/ort.all.min.mjs`;
const MODEL_URL = "https://huggingface.co/Ko033/isnet-general-use-onnx/resolve/main/onnx/model_fp16.onnx";
const CACHE_NAME = "idk-cutout-models-v1";
/** ขนาดภาพที่โมเดลกิน (ตายตัว) */
const S = 1024;

/* eslint-disable @typescript-eslint/no-explicit-any -- ไลบรารีโหลดจาก CDN ไม่มี type */
type Loaded = { ort: any; session: any; device: string };
let loading: Promise<Loaded> | null = null;

export type AiProgress = (p: { stage: "lib" | "model" | "run"; pct?: number; text: string }) => void;

/** โหลดไฟล์โมเดล (เก็บแคชไว้ใช้รอบหน้า) พร้อมรายงาน % */
async function fetchModel(onProgress?: AiProgress): Promise<ArrayBuffer> {
  let cache: Cache | null = null;
  try {
    cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(MODEL_URL);
    if (hit) return await hit.arrayBuffer();
  } catch {
    cache = null; // บางเบราว์เซอร์/โหมดส่วนตัวไม่มี Cache Storage — โหลดสดทุกครั้ง
  }
  const res = await fetch(MODEL_URL);
  if (!res.ok || !res.body) throw new Error(`model ${res.status}`);
  const total = Number(res.headers.get("content-length")) || 88e6;
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.length;
    onProgress?.({ stage: "model", pct: (got / total) * 100, text: `โหลดโมเดล AI ${Math.round(got / 1e6)}/${Math.round(total / 1e6)} MB (ครั้งแรกครั้งเดียว)` });
  }
  const buf = new Uint8Array(got);
  let o = 0;
  for (const p of parts) {
    buf.set(p, o);
    o += p.length;
  }
  try {
    await cache?.put(MODEL_URL, new Response(buf, { headers: { "content-type": "application/octet-stream" } }));
  } catch {
    // ที่เก็บเต็ม — ใช้รอบนี้ได้ รอบหน้าโหลดใหม่
  }
  return buf.buffer;
}

async function load(onProgress?: AiProgress): Promise<Loaded> {
  onProgress?.({ stage: "lib", text: "กำลังเปิดตัวช่วย AI…" });
  const ort = await import(/* webpackIgnore: true */ ORT_URL);
  ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VER}/dist/`;
  ort.env.logLevel = "error"; // ไม่งั้นคอนโซลเต็มไปด้วยคำเตือน initializer ที่ไม่ได้ใช้
  const model = await fetchModel(onProgress);
  onProgress?.({ stage: "model", text: "กำลังเตรียมโมเดล AI…" });
  const gpu = typeof navigator !== "undefined" && "gpu" in navigator && !!(await (navigator as any).gpu?.requestAdapter?.().catch(() => null));
  let lastErr: unknown;
  for (const ep of gpu ? ["webgpu", "wasm"] : ["wasm"]) {
    try {
      const session = await ort.InferenceSession.create(model, { executionProviders: [ep] });
      return { ort, session, device: ep };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("load failed");
}

/**
 * แยกวัตถุจากรูป → มาสก์ 0–255 ขนาดเท่ารูปที่ส่งเข้ามา
 * (โมเดลคิดที่ 1024×1024 แล้วขยายกลับ — ขอบจะนุ่ม ไปเกลาเป็นเส้นคมทีหลังด้วย buildCutout)
 */
export async function aiMask(img: ImageData, onProgress?: AiProgress): Promise<{ mask: Uint8Array; device: string }> {
  if (!loading)
    loading = load(onProgress).catch((e) => {
      loading = null; // พลาดแล้วให้กดลองใหม่ได้
      throw e;
    });
  const { ort, session, device } = await loading;
  onProgress?.({ stage: "run", text: device === "webgpu" ? "AI กำลังแยกวัตถุ (การ์ดจอ)…" : "AI กำลังแยกวัตถุ (CPU · อาจใช้ 5–15 วิ)…" });
  await new Promise((r) => setTimeout(r, 30)); // ให้ UI วาดข้อความก่อนเครื่องไม่ว่าง

  // ยืดภาพเป็น 1024×1024 (แบบที่โมเดลเทรนมา) · พื้นโปร่งถือเป็นขาว
  const src = document.createElement("canvas");
  src.width = img.width;
  src.height = img.height;
  src.getContext("2d")!.putImageData(img, 0, 0);
  const sq = document.createElement("canvas");
  sq.width = S;
  sq.height = S;
  const sctx = sq.getContext("2d", { willReadFrequently: true })!;
  sctx.fillStyle = "#ffffff";
  sctx.fillRect(0, 0, S, S);
  sctx.imageSmoothingQuality = "high";
  sctx.drawImage(src, 0, 0, S, S);
  const d = sctx.getImageData(0, 0, S, S).data;
  const n = S * S;
  const input = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    input[i] = d[i * 4] / 255 - 0.5;
    input[n + i] = d[i * 4 + 1] / 255 - 0.5;
    input[2 * n + i] = d[i * 4 + 2] / 255 - 0.5;
  }
  const out = await session.run({ [session.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, S, S]) });
  const prob: Float32Array = out[session.outputNames[0]].data;

  // ยืดค่าให้เต็มช่วง 0–1 (แบบ rembg) แล้วย่อ/ขยายกลับเท่ารูป
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < n; i++) {
    if (prob[i] < lo) lo = prob[i];
    if (prob[i] > hi) hi = prob[i];
  }
  const span = hi - lo || 1;
  const mid = sctx.createImageData(S, S);
  for (let i = 0; i < n; i++) {
    const v = Math.round(((prob[i] - lo) / span) * 255);
    mid.data[i * 4] = v;
    mid.data[i * 4 + 1] = v;
    mid.data[i * 4 + 2] = v;
    mid.data[i * 4 + 3] = 255;
  }
  sctx.putImageData(mid, 0, 0);
  const back = document.createElement("canvas");
  back.width = img.width;
  back.height = img.height;
  const bctx = back.getContext("2d", { willReadFrequently: true })!;
  bctx.imageSmoothingQuality = "high";
  bctx.drawImage(sq, 0, 0, img.width, img.height);
  const r = bctx.getImageData(0, 0, img.width, img.height).data;
  const mask = new Uint8Array(img.width * img.height);
  for (let i = 0; i < mask.length; i++) mask[i] = r[i * 4];
  return { mask, device };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * ตัดเฉพาะในกรอบ — ครอปส่วนนั้นก่อนส่งเข้าโมเดล AI จึงเห็นรายละเอียดชัดขึ้นมาก (ผม/ขอบเล็ก ๆ)
 * คืนมาสก์ขนาดเท่ารูปเต็ม (นอกกรอบ = 0)
 */
export async function aiMaskInBox(
  img: ImageData,
  box: { x0: number; y0: number; x1: number; y1: number },
  onProgress?: AiProgress
): Promise<Uint8Array> {
  const x0 = Math.max(0, Math.floor(box.x0));
  const y0 = Math.max(0, Math.floor(box.y0));
  const x1 = Math.min(img.width, Math.ceil(box.x1));
  const y1 = Math.min(img.height, Math.ceil(box.y1));
  const cw = Math.max(1, x1 - x0);
  const ch = Math.max(1, y1 - y0);
  const crop = new ImageData(cw, ch);
  for (let y = 0; y < ch; y++) {
    const s = ((y + y0) * img.width + x0) * 4;
    crop.data.set(img.data.subarray(s, s + cw * 4), y * cw * 4);
  }
  const { mask: m } = await aiMask(crop, onProgress);
  const out = new Uint8Array(img.width * img.height);
  for (let y = 0; y < ch; y++) out.set(m.subarray(y * cw, y * cw + cw), (y + y0) * img.width + x0);
  return out;
}
