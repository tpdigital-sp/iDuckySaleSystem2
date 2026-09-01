"use client";

import { useState } from "react";
import { GIFT_ART_MAX, type GiftPromo } from "@/lib/gifts";
import { uploadArtworkFile } from "@/lib/artwork-upload";

/**
 * 🎨 กล่องเลือก "ลายที่จะพิมพ์บนของแถม" บนการ์ดของแถมในตะกร้า
 *
 * ของแถมไม่ใช่บรรทัดสินค้า (ตั้งใจไว้แต่แรก — ยัดเป็นสินค้า 0 บาทแล้วพัง cartItemKey)
 * ช่องแนบลายของสินค้าจึงเอื้อมไม่ถึง ลูกค้าที่ได้รองหลังฟรีเลยไม่มีทางส่งไฟล์เข้าระบบ
 * ต้องไล่ตามทาง LINE แล้วไฟล์ก็ไม่ขึ้นใบงาน
 *
 * 2 ทางเลือก (ค่าเริ่มต้นคือทางที่ลูกค้าส่วนใหญ่ใช้ — ไม่ต้องแตะอะไรเลย):
 *  ① ใช้ลายเดียวกับสินค้าที่สั่ง  → เก็บเป็นลิสต์ว่าง
 *  ② แนบลายอื่น                  → อัปไฟล์เข้า customer-artwork แล้วเก็บ URL
 *
 * ⚠️ ไฟล์ยิงตรงเข้า Supabase ผ่าน uploadArtworkFile (เส้นเดียวกับหน้าสินค้า)
 *    ไม่ผ่าน API route จึงไม่ติดเพดาน ~4.5MB ของ Netlify
 */
export default function GiftArtworkPicker({
  promo,
  urls,
  onChange,
}: {
  promo: GiftPromo;
  /** ลายที่แนบไว้แล้ว — ว่าง = ใช้ลายเดียวกับสินค้า */
  urls: string[];
  onChange: (urls: string[]) => void;
}) {
  /** เปิดโหมด "ลายอื่น" ไว้ค้างระหว่างที่ยังไม่มีไฟล์ ไม่งั้นกล่องอัปหุบหนีทันทีที่ลบรูปสุดท้าย */
  const [own, setOwn] = useState(urls.length > 0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [drag, setDrag] = useState(false);
  /** รูปย่อจากไฟล์ในเครื่อง (blob) — ขึ้นทันทีโดยไม่ต้องโหลดไฟล์ที่เพิ่งอัปกลับมาใหม่ */
  const [preview, setPreview] = useState<Record<string, string>>({});

  const useOwn = own || urls.length > 0;

  async function upload(list: FileList | null) {
    const files = [...(list ?? [])];
    if (!files.length) return;
    setBusy(true);
    setErr("");
    const added: string[] = [];
    const shots: Record<string, string> = {};
    for (const f of files) {
      if (urls.length + added.length >= GIFT_ART_MAX) {
        setErr(`แนบได้สูงสุด ${GIFT_ART_MAX} รูปต่อของแถม 1 อย่าง`);
        break;
      }
      try {
        const url = await uploadArtworkFile(f);
        added.push(url);
        shots[url] = URL.createObjectURL(f);
      } catch (e) {
        // ข้อความจริงจากตัวอัปโหลด (ไฟล์ใหญ่เกิน / HEIC / เน็ตหลุด) ไม่ใช่ "ไม่สำเร็จ" ลอย ๆ
        setErr(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง");
        break;
      }
    }
    if (added.length) {
      setPreview((cur) => ({ ...cur, ...shots }));
      onChange([...new Set([...urls, ...added])].slice(0, GIFT_ART_MAX));
      setOwn(true);
    }
    setBusy(false);
  }

  return (
    <div className="mt-2.5">
      <span className="ord-eyebrow block text-[11px]">ลายที่จะพิมพ์บนของแถม</span>

      <div className="mt-1 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => {
            setOwn(false);
            setErr("");
            onChange([]);
          }}
          className={`gift-opt${!useOwn ? " on" : ""}`}
        >
          ✅ ใช้ลายเดียวกับสินค้าที่สั่ง
        </button>
        <button
          type="button"
          onClick={() => {
            setOwn(true);
            setErr("");
          }}
          className={`gift-opt${useOwn ? " on" : ""}`}
        >
          🖼️ ใช้ลายอื่น (แนบไฟล์)
        </button>
      </div>

      {!useOwn ? (
        <p className="mt-1 text-[11px] leading-relaxed t-soft">
          ทางร้านจะใช้ลายเดียวกับที่แนบไว้ในสินค้าที่สั่ง — ไม่ต้องอัปซ้ำ
        </p>
      ) : (
        <div className="mt-1.5">
          {urls.length > 0 && (
            <div className="mb-1.5 flex flex-wrap gap-1.5">
              {urls.map((u) => (
                <span key={u} className="relative block">
                  <a href={u} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element -- ลายลูกค้าอยู่บนสตอเรจ (URL อิสระ) */}
                    <img
                      src={preview[u] ?? u}
                      alt="ลายของแถม"
                      className="h-14 w-14 rounded-xl object-cover"
                      style={{ boxShadow: "0 0 0 1.5px var(--gift-line)" }}
                    />
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      const p = preview[u];
                      if (p) URL.revokeObjectURL(p);
                      onChange(urls.filter((x) => x !== u));
                    }}
                    className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold text-white shadow"
                    style={{ background: "var(--rose, #E5484D)" }}
                    aria-label="ลบลายนี้"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}

          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDrag(false);
              void upload(e.dataTransfer.files);
            }}
            className="flex cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-dashed px-3 py-2.5 text-center transition"
            style={{
              borderColor: drag ? "var(--gift-line)" : "var(--sky-200)",
              background: drag ? "var(--gift-tint)" : "#fff",
            }}
          >
            {busy ? (
              <span className="text-[11px] font-bold" style={{ color: "var(--gift-ink)" }}>
                กำลังอัปโหลด…
              </span>
            ) : (
              <>
                <span className="text-[11px] font-extrabold" style={{ color: "var(--gift-ink)" }}>
                  🖼️ แตะเลือกไฟล์ · ลากมาวาง
                </span>
                <span className="text-[10px] t-faint">JPG / PNG / WEBP · ไฟล์ละไม่เกิน 15MB</span>
              </>
            )}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                void upload(e.target.files);
                e.target.value = "";
              }}
            />
          </label>

          {urls.length === 0 && !busy && !err && (
            <p className="ord-note warn mt-1 px-2.5 py-1.5 text-[11px] font-semibold">
              ⚠️ ยังไม่ได้แนบลาย — ถ้าไม่แนบ ทางร้านจะใช้ลายเดียวกับสินค้าที่สั่งให้
            </p>
          )}
          {err && (
            <p className="ord-note danger mt-1 px-2.5 py-1.5 text-[11px] font-semibold">
              ⚠️ {err}
            </p>
          )}
          {promo.sizes?.length ? (
            <p className="mt-1 text-[10px] leading-relaxed t-faint">
              ลายนี้ใช้กับ{promo.name}เท่านั้น — ไม่กระทบลายของสินค้าที่สั่ง
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
