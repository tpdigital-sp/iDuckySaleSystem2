"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

/**
 * แท็บ "ตัดพื้นหลัง AI" — ฝังเว็บแอพ Python (tools/cutout-py: rembg BiRefNet + Potrace)
 * ที่รันบนเครื่องร้านพอร์ต 8777 ไว้ใน iframe · เซิร์ฟเวอร์ไม่ได้อยู่บน Netlify
 * ต้องเปิด tools/cutout-py/start.command บนเครื่องที่ใช้เบราว์เซอร์นี้ก่อน
 */
export const PY_CUTOUT_URL = "http://localhost:8777";

export type PyCutoutHandle = { addFiles: (files: File[]) => void };

type State = "checking" | "up" | "down";

const PyCutoutTab = forwardRef<PyCutoutHandle, { active: boolean }>(function PyCutoutTab({ active }, ref) {
  const [state, setState] = useState<State>("checking");
  const frame = useRef<HTMLIFrameElement>(null);

  useImperativeHandle(ref, () => ({
    addFiles: (files) => frame.current?.contentWindow?.postMessage({ type: "cutout-add-files", files }, PY_CUTOUT_URL),
  }));

  // เช็คว่าเปิดเซิร์ฟเวอร์อยู่ไหม — ตอนยังไม่เปิด ลองใหม่ทุก 3 วิ (กดเปิด start.command แล้วขึ้นเอง)
  useEffect(() => {
    if (!active || state === "up") return;
    let stop = false;
    const check = async () => {
      try {
        const r = await fetch(`${PY_CUTOUT_URL}/health`, { cache: "no-store" });
        const j = await r.json();
        if (!stop) setState(j.ok ? "up" : "down");
      } catch {
        if (!stop) setState("down");
      }
    };
    check();
    const t = window.setInterval(check, 3000);
    return () => {
      stop = true;
      window.clearInterval(t);
    };
  }, [active, state]);

  if (state === "up")
    return (
      <iframe
        ref={frame}
        src={PY_CUTOUT_URL}
        title="ตัดพื้นหลัง AI"
        className="mt-3 block w-full rounded-2xl border"
        style={{ height: "calc(100vh - 210px)", minHeight: 640, borderColor: "var(--dk-line, #e4ddd0)", background: "#f4f1ea" }}
      />
    );

  return (
    <div className="mt-3 rounded-2xl border p-6 text-[14px] leading-relaxed" style={{ borderColor: "var(--dk-line, #e4ddd0)", background: "#fff" }}>
      {state === "checking" ? (
        <p style={{ color: "var(--dk-navy-soft)" }}>กำลังเช็คโปรแกรมตัดพื้นหลัง…</p>
      ) : (
        <>
          <p className="text-[16px] font-bold" style={{ color: "var(--dk-navy)" }}>
            ยังไม่ได้เปิดโปรแกรมตัดพื้นหลังบนเครื่องนี้
          </p>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5" style={{ color: "var(--dk-navy-soft)" }}>
            <li>
              เปิดโฟลเดอร์ <code>iDuckySaleSystem2/tools/cutout-py</code> แล้วดับเบิลคลิก <b>start.command</b>
            </li>
            <li>รอจนหน้าต่าง Terminal ขึ้นว่า “✓ พร้อมใช้งาน” (ครั้งแรกโหลดโมเดล AI ~1 GB ใช้เวลาหลายนาที)</li>
            <li>หน้านี้จะเปิดเครื่องมือขึ้นมาเอง ไม่ต้องรีเฟรช</li>
          </ol>
          <p className="mt-3 text-[12.5px]" style={{ color: "var(--dk-faint)" }}>
            โปรแกรมทำงานบนเครื่องร้าน (AI BiRefNet + เส้น Potrace) รูปไม่ถูกส่งออกไปข้างนอก · ปิดหน้าต่าง Terminal = ปิดโปรแกรม
          </p>
        </>
      )}
    </div>
  );
});

export default PyCutoutTab;
