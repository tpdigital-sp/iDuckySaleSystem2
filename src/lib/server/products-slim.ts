import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { OptionPreset } from "@/lib/option-presets";
import type { Product } from "@/lib/products";

/**
 * ตารางสินค้าแบบ "ฟิลด์ที่หน้าคลังใช้" พร้อมแคชในหน่วยความจำ
 *
 * ทำไม: หน้าคลังสต๊อกต้องอ่านตัวเลือกของสินค้าทุกตัว (ผูก SKU อยู่ที่ choice) — ก้อนเต็ม ~7MB ใช้เวลา 3–5 วิ
 * ดึงเฉพาะฟิลด์เหลือ ~3.4MB แต่ก็ยัง 1–4.7 วิ ต่อครั้ง (วัด 18 ก.ย. 69) ทั้งที่สินค้าแทบไม่เปลี่ยนระหว่างวัน
 * → จำไว้ 60 วิ + รวมคำขอที่มาพร้อมกันเป็นคำขอเดียว · เส้นทางที่แก้สินค้าเรียก invalidateProductsSlim()
 *
 * ⚠️ แคชอยู่ในโปรเซส — บน Netlify แต่ละ function instance มีแคชของตัวเอง หลังแก้ข้อมูลอาจเห็นของเก่าได้ถึง 60 วิ
 *    หน้าจอที่เพิ่งกดแก้จึงส่ง ?fresh=1 มาข้ามแคชเอง
 */

export type SlimProduct = { id: string; data: Product & { hidden?: boolean } };
export type SlimPreset = { id: string; data: OptionPreset };
export type ProductsSlim = { products: SlimProduct[]; presets: SlimPreset[]; at: number };

const TTL_MS = 60_000;
const SELECT =
  "id,name:data->name,price:data->price,hidden:data->hidden,options:data->options,images:data->images,label:data->label,choices:data->choices,pid:data->id";

let cache: ProductsSlim | null = null;
let inflight: Promise<ProductsSlim> | null = null;

export function invalidateProductsSlim() {
  cache = null;
}

async function fetchSlim(): Promise<ProductsSlim> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("ยังไม่ได้ตั้งค่า Supabase");
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const res = await sb.from("products").select(SELECT);
  if (res.error) throw new Error(res.error.message);
  const rows = res.data ?? [];
  const products: SlimProduct[] = [];
  const presets: SlimPreset[] = [];
  for (const r of rows) {
    if (r.id.startsWith("__preset_")) {
      const p = { id: r.pid, label: r.label, choices: r.choices } as unknown as OptionPreset;
      if (p.id) presets.push({ id: r.id, data: p });
    } else if (!r.id.startsWith("__") && r.name && typeof r.price === "number") {
      products.push({ id: r.id, data: { name: r.name, price: r.price, hidden: r.hidden, options: r.options ?? [], images: r.images ?? [] } as unknown as SlimProduct["data"] });
    }
  }
  // ⚠️ ได้ว่างต้องถือว่าพัง ห้ามแคช/ห้ามคำนวณต่อ — เคยเกิด Supabase ตอบว่างชั่วคราว ทุก SKU กลายเป็น "สินค้าหายไป"
  if (!products.length) throw new Error("ดึงรายการสินค้าไม่สำเร็จ ลองโหลดใหม่");
  return { products, presets, at: Date.now() };
}

export async function getProductsSlim(opts?: { fresh?: boolean }): Promise<ProductsSlim> {
  if (!opts?.fresh && cache && Date.now() - cache.at < TTL_MS) return cache;
  if (!inflight)
    inflight = fetchSlim()
      .then((v) => (cache = v))
      .finally(() => (inflight = null));
  return inflight;
}
