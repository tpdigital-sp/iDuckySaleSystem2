"use client";

import { useEffect, useRef, useState } from "react";
import { PRICE_LINK_ADD_PARAM, PRICE_LINK_PARAM, encodePriceLink, type PriceLinkSpec } from "@/lib/price-link";
import { checkArtworkFile, uploadArtworkFile } from "@/lib/artwork-upload";

/**
 * 🎨 วางไฟล์ลายได้ตั้งแต่บนการ์ดราคา แล้วกด "สั่งตามสเปคนี้" ทีเดียวจบ
 *
 * ทำไมต้องมี: ลูกค้าเปิดลิงก์ราคาจากไลน์ตอนที่ไฟล์ลายอยู่ในมือแล้ว
 * ถ้าไม่มีช่องตรงนี้ ต้องกดเข้าไปหน้าสินค้าแล้วค่อยไปหากล่องแนบลายอีกที (คนละหน้าจอ คนละจังหวะ)
 *
 * ไฟล์ยิงตรงเข้าสตอเรจด้วย uploadArtworkFile ตัวเดียวกับหน้าสินค้า (ได้ไฟล์ต้นฉบับ ไม่ผ่าน function)
 * แล้วส่ง URL ต่อไปกับลิงก์สเปค (`a`) — หน้าสินค้าติ๊กลายให้ครบเองตอนเปิด
 *
 * ⚠️ ปุ่มสั่งต้องอยู่ในคอมโพเนนต์นี้ด้วย เพราะ href ต้องคิดใหม่ทุกครั้งที่แนบ/ลบรูป
 */

type Art = { url: string; name: string; w: number; h: number; preview: string };

/** เท่ากับ MAX_SPEC_ARTS ฝั่ง price-link — ยัดเกินนี้ URL เริ่มยาวเกินจะปลอดภัย */
const MAX_FILES = 10;

export default function OrderWithArtwork({
  productPath,
  spec,
  artRequired = false,
  children,
}: {
  productPath: string;
  spec: PriceLinkSpec;
  /**
   * สินค้าที่ต้องมีไฟล์ลายก่อนผลิต — บอกให้ชัดบนการ์ดว่างานนี้ต้องมีลาย แต่ "ไม่ล็อกปุ่ม"
   * เจ้าของร้านสั่ง (8 ก.ย. 69): ลูกค้าบางคนยังไม่อยากวางลายตอนกดตกลงราคา — ให้สั่งได้ก่อนแล้วส่งลายทางไลน์ทีหลัง
   * (หน้าสินค้าที่เปิดจากลิงก์ราคาไม่บังคับแนบลายเช่นกัน — ดู preArranged ใน ProductDetail)
   */
  artRequired?: boolean;
  /** คำอธิบายใต้ปุ่ม (วันยืนราคา) — เรนเดอร์มาจากฝั่งเซิร์ฟเวอร์ */
  children?: React.ReactNode;
}) {
  const [arts, setArts] = useState<Art[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [drag, setDrag] = useState(false);
  /** เก็บรูปย่อในเครื่องไว้คืนตอนออกจากหน้า (blob ที่ไม่ revoke = หน่วยความจำค้าง) */
  const artsRef = useRef<Art[]>([]);
  artsRef.current = arts;
  useEffect(() => () => artsRef.current.forEach((a) => URL.revokeObjectURL(a.preview)), []);

  // ?add=1 = หน้าสินค้าติ๊กสเปคเสร็จแล้วหย่อนลงตะกร้าให้เลย แล้วพาไปหน้าตะกร้า (ลูกค้ากดปุ่มเดียวจบ)
  const href = `${productPath}?${PRICE_LINK_PARAM}=${encodePriceLink(
    arts.length ? { ...spec, a: arts.map((a) => a.url) } : spec
  )}&${PRICE_LINK_ADD_PARAM}=1`;
  const tiny = arts.some((a) => a.w > 0 && Math.max(a.w, a.h) < 1500);
  /** งานต้องมีลายแต่ยังไม่ได้วาง — สั่งได้ แต่ต้องบอกชัดว่าจะส่งลายทีหลังทางไลน์ */
  const artLater = artRequired && arts.length === 0;

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setErr("");
    setBusy(true);
    const skipped: string[] = [];
    for (const f of Array.from(files)) {
      if (artsRef.current.length >= MAX_FILES) {
        skipped.push(`แนบได้สูงสุด ${MAX_FILES} รูปต่อครั้ง — ที่เหลือแนบต่อในหน้าสินค้าได้`);
        break;
      }
      const bad = checkArtworkFile(f);
      if (bad) {
        skipped.push(bad);
        continue;
      }
      // เปิดอ่านได้จริงไหม + ความละเอียดเท่าไร (ไว้เตือน "ภาพเล็ก" ตั้งแต่ตรงนี้)
      const dim = await new Promise<{ w: number; h: number }>((resolve) => {
        const img = new window.Image();
        const obj = URL.createObjectURL(f);
        img.onload = () => {
          URL.revokeObjectURL(obj);
          resolve({ w: img.naturalWidth, h: img.naturalHeight });
        };
        img.onerror = () => {
          URL.revokeObjectURL(obj);
          resolve({ w: 0, h: 0 });
        };
        img.src = obj;
      });
      if (!dim.w || !dim.h) {
        skipped.push(`“${f.name}” ไฟล์เสีย เปิดไม่ได้ — ลองบันทึกใหม่แล้วแนบอีกครั้ง`);
        continue;
      }
      try {
        const url = await uploadArtworkFile(f);
        // รูปย่อวาดจากไฟล์ในเครื่อง — ขึ้นทันที ไม่ต้องโหลดไฟล์ที่เพิ่งอัปกลับมาใหม่
        setArts((cur) => [...cur, { url, name: f.name, ...dim, preview: URL.createObjectURL(f) }]);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง");
        break;
      }
    }
    if (skipped.length) setErr((cur) => [cur, ...skipped].filter(Boolean).join(" · "));
    setBusy(false);
  }

  return (
    <>
      {/* ── กล่องแนบลาย ── */}
      <div
        id="pl-art-box"
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrag(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void upload(e.dataTransfer.files);
        }}
        className={`mb-4 rounded-2xl p-3.5 transition ${
          drag ? "bg-sky-100 ring-2 ring-dashed ring-sky-400" : "bg-sky-50/70 ring-1 ring-sky-200"
        }`}
      >
        {artRequired ? (
          <>
            <p className="text-xs font-bold text-stone-700">
              🎨 งานนี้ต้องมีไฟล์ลาย — มีแล้ววางตรงนี้ได้เลย{" "}
              <span className="font-normal text-stone-400">(ยังไม่มีก็สั่งก่อนได้)</span>
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-stone-500">
              ลายจะติดไปกับออเดอร์ให้เอง ไม่ต้องแนบซ้ำ · ถ้ายังไม่พร้อม สั่งไว้ก่อนแล้วค่อยส่งลายทางไลน์ทีหลังได้
            </p>
          </>
        ) : (
          <>
            <p className="text-xs font-bold text-stone-700">
              🎨 มีไฟล์ลายแล้ว? วางตรงนี้ได้เลย <span className="font-normal text-stone-400">(ไม่บังคับ)</span>
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-stone-500">
              ลายจะติดไปกับออเดอร์ให้เอง ไม่ต้องแนบซ้ำในหน้าถัดไป · ใช้เป็นแนวทางให้กราฟฟิกทำแบบ
            </p>
          </>
        )}

        {arts.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {arts.map((a, i) => (
              <div key={a.url} className="relative">
                <a href={a.url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.preview} alt={a.name} className="h-20 w-20 rounded-xl object-cover ring-1 ring-sky-200" />
                </a>
                <button
                  type="button"
                  onClick={() => {
                    URL.revokeObjectURL(a.preview);
                    setArts((cur) => cur.filter((_, j) => j !== i));
                  }}
                  className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow"
                  aria-label="ลบภาพนี้"
                >
                  ✕
                </button>
                {a.w > 0 && (
                  <p
                    className={`mt-0.5 w-20 text-center text-[9px] leading-tight ${
                      Math.max(a.w, a.h) < 1500 ? "font-bold text-amber-600" : "text-stone-400"
                    }`}
                  >
                    {a.w}×{a.h}
                    {Math.max(a.w, a.h) < 1500 ? " · ภาพเล็ก" : ""}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {tiny && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-semibold leading-relaxed text-amber-700 ring-1 ring-amber-200">
            ⚠️ มีภาพความละเอียดต่ำ — พิมพ์ออกมาอาจแตก/ไม่คม รบกวนส่งไฟล์ต้นฉบับทางไลน์ด้วยครับ
          </p>
        )}

        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDrop={(e) => {
            // หยุด bubble — กล่องนอกก็รับไฟล์ ถ้าไม่หยุดจะอัปซ้ำ 2 รอบ
            e.preventDefault();
            e.stopPropagation();
            setDrag(false);
            void upload(e.dataTransfer.files);
          }}
          className={`mt-2 flex cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-dashed px-3 py-3 text-center transition ${
            drag ? "border-sky-500 bg-sky-100" : "border-sky-300 bg-white hover:border-sky-400 hover:bg-sky-50"
          }`}
        >
          {busy ? (
            <span className="text-xs font-bold text-sky-700">กำลังอัปโหลด…</span>
          ) : drag ? (
            <span className="text-sm font-extrabold text-sky-700">⬇️ ปล่อยไฟล์ตรงนี้ได้เลย</span>
          ) : (
            <>
              <span className="text-xs font-extrabold text-sky-700">🖼️ แตะเลือกไฟล์ · ลากมาวาง</span>
              <span className="text-[10px] font-normal text-stone-400">JPG / PNG / WEBP · ไฟล์ละไม่เกิน 15MB</span>
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
        {err && <p className="mt-1.5 text-[11px] font-semibold text-rose-600">⚠️ {err}</p>}
        {/* ใบราคาแช่ราคาไว้ตามจำนวนลายที่ตกลงกัน — แนบมากกว่านั้นราคาจะขยับตามจริงในหน้าถัดไป */}
        {spec.d != null && arts.length > spec.d && (
          <p className="mt-1.5 text-[11px] font-semibold leading-relaxed text-amber-700">
            หมายเหตุ: ใบนี้ตีราคาไว้ที่ {spec.d} ลาย — แนบมา {arts.length} ลาย ราคาจะคิดตามจำนวนลายจริงในหน้าถัดไป
          </p>
        )}
      </div>

      <a
        href={href}
        className="block w-full rounded-full bg-amber-500 py-3.5 text-center text-sm font-extrabold text-white shadow-lg transition hover:bg-amber-600"
      >
        🛒 สั่งตามสเปคนี้
        {arts.length > 0 ? ` (แนบลาย ${arts.length} รูป)` : artLater ? " (ส่งลายทีหลัง)" : ""}
      </a>
      {artLater && (
        /* บอกก่อนกด ไม่ใช่หลังกด — ลูกค้าจะได้รู้ว่าออเดอร์เข้าตะกร้าแบบ "รอลาย" แล้วต้องส่งลายทางไลน์ต่อ */
        <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-center text-[11px] font-semibold leading-relaxed text-amber-700 ring-1 ring-amber-200">
          ยังไม่ได้วางลาย — สั่งได้เลย แล้วส่งไฟล์ลายให้ร้านทางไลน์ทีหลัง ทางร้านจะเริ่มทำแบบเมื่อได้ลายครับ
        </p>
      )}
      {children}
    </>
  );
}
