"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** ขนาดกรอบตัดบนจอ (px) — เล็กพอให้พอดีจอมือถือ 320px */
const BOX = 256;
/** ขนาดไฟล์ที่ตัดเสร็จ (จัตุรัส) */
const OUT = 512;
const MAX_ZOOM = 4;

/**
 * ตัดรูปโปรไฟล์เอง — ลากเลื่อนรูป + แถบซูม (หรือหมุนล้อเมาส์) แล้วกดบันทึก
 * คืนไฟล์ JPEG จัตุรัส 512px ให้ผู้เรียกเอาไปอัปโหลดต่อ
 * (ไม่ใช้ = ระบบตัดกลางภาพให้อัตโนมัติเหมือนเดิม — ดู shrinkImage ใน lib/avatar-upload)
 */
export default function AvatarCropper({
  file,
  busy,
  onCancel,
  onDone,
}: {
  file: File;
  busy?: boolean;
  onCancel: () => void;
  onDone: (blob: Blob) => void;
}) {
  const [url, setUrl] = useState("");
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  /** จุดตั้งต้นตอนเริ่มลาก (ตำแหน่งนิ้ว + ออฟเซ็ตของรูปตอนนั้น) */
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    // alive กันผลลัพธ์ของรอบที่ถูกยกเลิกแล้วมาเขียนทับ (React strict mode รันเอฟเฟกต์ซ้ำ
    // → URL เดิมถูก revoke → onerror ของรูปเก่าจะเด้ง "อ่านไฟล์ไม่สำเร็จ" ทั้งที่รูปใหม่โหลดได้)
    let alive = true;
    const u = URL.createObjectURL(file);
    setUrl(u);
    setError("");
    const im = new Image();
    im.onload = () => alive && setImg(im);
    im.onerror = () => alive && setError("อ่านไฟล์รูปไม่สำเร็จ");
    im.src = u;
    return () => {
      alive = false;
      URL.revokeObjectURL(u);
    };
  }, [file]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  /** อัตราส่วนที่ทำให้รูปเต็มกรอบพอดี (ด้านสั้นชนขอบ) */
  const base = img ? BOX / Math.min(img.width, img.height) : 1;
  const scale = base * zoom;

  /** ห้ามลากจนเห็นขอบว่าง — จำกัดออฟเซ็ตตามขนาดรูปที่ขยายแล้ว */
  const clamp = useCallback(
    (x: number, y: number, z: number) => {
      if (!img) return { x: 0, y: 0 };
      const s = base * z;
      const mx = Math.max(0, (img.width * s - BOX) / 2);
      const my = Math.max(0, (img.height * s - BOX) / 2);
      return { x: Math.min(mx, Math.max(-mx, x)), y: Math.min(my, Math.max(-my, y)) };
    },
    [img, base],
  );

  function changeZoom(z: number) {
    const next = Math.min(MAX_ZOOM, Math.max(1, z));
    setZoom(next);
    setOff((o) => clamp(o.x, o.y, next));
  }

  function save() {
    if (!img) return;
    // กรอบบนจอ = พื้นที่ในรูปจริงขนาด BOX/scale โดยมีจุดกึ่งกลางเลื่อนตามที่ผู้ใช้ลากไว้
    const side = BOX / scale;
    const sx = img.width / 2 - side / 2 - off.x / scale;
    const sy = img.height / 2 - side / 2 - off.y / scale;
    const c = document.createElement("canvas");
    c.width = c.height = OUT;
    const ctx = c.getContext("2d");
    if (!ctx) return setError("เบราว์เซอร์ไม่รองรับการตัดรูป");
    ctx.drawImage(img, sx, sy, side, side, 0, 0, OUT, OUT);
    c.toBlob((b) => (b ? onDone(b) : setError("แปลงรูปไม่สำเร็จ")), "image/jpeg", 0.88);
  }

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-stone-900/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="ปรับรูปโปรไฟล์"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-xl">
        <h2 className="text-center text-base font-extrabold text-amber-950">ปรับรูปโปรไฟล์</h2>
        <p className="mt-1 text-center text-xs text-stone-400">ลากรูปเพื่อเลื่อน · เลื่อนแถบด้านล่าง (หรือหมุนล้อเมาส์) เพื่อซูม</p>

        <div
          className="relative mx-auto mt-4 touch-none select-none overflow-hidden rounded-full bg-stone-100 ring-4 ring-white shadow-inner"
          style={{ width: BOX, height: BOX, cursor: drag.current ? "grabbing" : "grab" }}
          onPointerDown={(e) => {
            if (!img) return;
            drag.current = { px: e.clientX, py: e.clientY, ox: off.x, oy: off.y };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            setOff(clamp(d.ox + (e.clientX - d.px), d.oy + (e.clientY - d.py), zoom));
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onWheel={(e) => changeZoom(zoom - e.deltaY / 500)}
        >
          {img && url && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={url}
              alt=""
              draggable={false}
              className="absolute left-1/2 top-1/2 max-w-none"
              style={{
                width: img.width * scale,
                height: img.height * scale,
                transform: `translate(calc(-50% + ${off.x}px), calc(-50% + ${off.y}px))`,
              }}
            />
          )}
          {!img && !error && <span className="grid h-full w-full place-items-center text-sm text-stone-400">กำลังโหลดรูป…</span>}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <span className="text-sm text-stone-400">🔍−</span>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(e) => changeZoom(Number(e.target.value))}
            disabled={!img}
            aria-label="ซูมรูป"
            className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-amber-100 accent-amber-400"
          />
          <span className="text-base text-stone-400">🔍+</span>
        </div>

        {error && <p className="mt-3 text-center text-xs font-semibold text-rose-500">{error}</p>}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-full px-4 py-2.5 text-sm font-bold text-stone-500 ring-1 ring-stone-200 transition hover:bg-stone-50 disabled:opacity-50"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!img || busy}
            className="flex-1 rounded-full bg-amber-400 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-amber-500 disabled:opacity-50"
          >
            {busy ? "กำลังอัปโหลด…" : "ใช้รูปนี้"}
          </button>
        </div>
      </div>
    </div>
  );
}
