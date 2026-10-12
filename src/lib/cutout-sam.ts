/**
 * "คลิกเลือกวัตถุ" ด้วย SAM 2.1 (Segment Anything · hiera-tiny · Apache-2.0) — รันในเบราว์เซอร์ล้วน
 *
 * คนชี้ (จุดเอา / จุดไม่เอา / กรอบ) → AI ตัดตามที่ชี้ ไม่ต้องเดาเองว่าอะไรคือวัตถุหลัก
 * ภาพหนึ่งรูปเข้ารหัสครั้งเดียว (การ์ดจอ ~0.2 วิ · CPU ~6 วิ) แล้วทุกคลิกถอดมาสก์ใหม่ ~0.1 วิ
 *
 * ⚠️ ทดสอบ 12 ต.ค. 69: ตัวถอดมาสก์ (prompt_encoder_mask_decoder) บน WebGPU ให้ผลเพี้ยน (มาสก์ล้นนอกกรอบ)
 *    ทั้ง fp16/fp32 → บังคับรันบน wasm เสมอ · ตัวเข้ารหัสภาพบน WebGPU ถูกต้อง
 * ⚠️ SlimSAM (SAM รุ่นแรก) ใช้กรอบไม่ได้ใน transformers.js (decoder ไม่มี input_boxes)
 */

const LIB_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js";
const MODEL_ID = "onnx-community/sam2.1-hiera-tiny-ONNX";

/* eslint-disable @typescript-eslint/no-explicit-any -- ไลบรารีโหลดจาก CDN ไม่มี type */
type Loaded = { lib: any; model: any; processor: any; gpu: boolean };
let loading: Promise<Loaded> | null = null;

export type SamProgress = (text: string) => void;

export interface SamPoint {
  x: number;
  y: number;
  /** true = เอาตรงนี้ · false = ไม่เอา */
  keep: boolean;
}
export interface SamBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

async function load(onProgress?: SamProgress): Promise<Loaded> {
  onProgress?.("กำลังเปิดตัวช่วย AI เลือกวัตถุ…");
  const lib = await import(/* webpackIgnore: true */ LIB_URL);
  lib.env.allowLocalModels = false;
  const files = new Map<string, { loaded: number; total: number }>();
  const progress_callback = (e: any) => {
    if (e?.status !== "progress" || !e.file) return;
    files.set(e.file, { loaded: e.loaded ?? 0, total: e.total ?? 0 });
    let l = 0;
    let t = 0;
    for (const f of files.values()) {
      l += f.loaded;
      t += f.total;
    }
    if (t > 1e6) onProgress?.(`โหลด AI เลือกวัตถุ ${Math.round(l / 1e6)}/${Math.round(t / 1e6)} MB (ครั้งแรกครั้งเดียว)`);
  };
  const gpu = typeof navigator !== "undefined" && "gpu" in navigator && !!(await (navigator as any).gpu?.requestAdapter?.().catch(() => null));
  const tries = gpu ? [true, false] : [false];
  let lastErr: unknown;
  for (const g of tries) {
    try {
      const model = await lib.Sam2Model.from_pretrained(MODEL_ID, {
        dtype: { vision_encoder: "fp16", prompt_encoder_mask_decoder: "fp32" },
        device: { vision_encoder: g ? "webgpu" : "wasm", prompt_encoder_mask_decoder: "wasm" },
        progress_callback,
      });
      const processor = await lib.AutoProcessor.from_pretrained(MODEL_ID);
      return { lib, model, processor, gpu: g };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("load failed");
}

/** ภาพที่เข้ารหัสแล้ว (ใช้ซ้ำทุกคลิก) */
export interface SamImage {
  raw: any;
  emb: any;
  width: number;
  height: number;
}

export async function samPrepare(img: ImageData, onProgress?: SamProgress): Promise<SamImage> {
  if (!loading)
    loading = load(onProgress).catch((e) => {
      loading = null;
      throw e;
    });
  const { lib, model, processor, gpu } = await loading;
  onProgress?.(gpu ? "AI กำลังอ่านภาพ…" : "AI กำลังอ่านภาพ (CPU · ~5–10 วิ ครั้งเดียวต่อรูป)…");
  await new Promise((r) => setTimeout(r, 30));
  const raw = new lib.RawImage(new Uint8ClampedArray(img.data), img.width, img.height, 4).rgb();
  const base = await processor(raw);
  const emb = await model.get_image_embeddings(base);
  return { raw, emb, width: img.width, height: img.height };
}

/**
 * ถอดมาสก์ตามจุด/กรอบ → ค่า 0–255 (ขอบนุ่ม · 128 = เส้นขอบ) ขนาดเท่าภาพ
 * pick: เลือกขนาดจาก 3 ทางที่ AI เสนอ (0 ใหญ่สุด … 2 เล็กสุด) · "best" = คะแนนสูงสุด
 */
export async function samMask(
  si: SamImage,
  points: SamPoint[],
  box: SamBox | null,
  pick: number | "best"
): Promise<{ mask: Uint8Array; scores: number[]; picked: number; areas: number[] }> {
  const { model, processor } = await loading!;
  const opts: Record<string, unknown> = {};
  if (points.length) {
    opts.input_points = [[points.map((p) => [p.x, p.y])]];
    opts.input_labels = [[points.map((p) => (p.keep ? 1 : 0))]];
  }
  if (box) opts.input_boxes = [[[box.x0, box.y0, box.x1, box.y1]]];
  const inp = await processor(si.raw, opts);
  const feed: Record<string, unknown> = { ...si.emb };
  for (const k of ["input_points", "input_labels", "input_boxes"]) if (inp[k]) feed[k] = inp[k];
  const out = await model(feed);
  const masks = await processor.post_process_masks(out.pred_masks, inp.original_sizes, inp.reshaped_input_sizes, { binarize: false });
  const m = masks[0]; // [1, 3, H, W] ค่า logit
  const n = si.width * si.height;
  const k = m.dims[1] as number;
  const scores: number[] = Array.from(out.iou_scores.data as ArrayLike<number>).slice(0, k);
  const areas: number[] = [];
  for (let c = 0; c < k; c++) {
    let a = 0;
    for (let i = 0; i < n; i++) if (m.data[c * n + i] > 0) a++;
    areas.push(a / n);
  }
  // เรียงตามพื้นที่ (ใหญ่ → เล็ก) ให้ปุ่ม ใหญ่/กลาง/เล็ก ตรงความหมายเสมอ
  const order = areas.map((_, i) => i).sort((a, b) => areas[b] - areas[a]);
  let ch: number;
  if (pick === "best") ch = scores.indexOf(Math.max(...scores));
  else ch = order[Math.min(pick, order.length - 1)];
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const v = m.data[ch * n + i];
    mask[i] = Math.round(255 / (1 + Math.exp(-v * 4))); // ×4 = ขอบคมขึ้นนิดแต่ยังนุ่มพอไล่เส้นละเอียดกว่าพิกเซล
  }
  return { mask, scores: order.map((i) => scores[i]), picked: order.indexOf(ch), areas: order.map((i) => areas[i]) };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
