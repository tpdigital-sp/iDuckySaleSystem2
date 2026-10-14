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
  /**
   * ความสูงกรอบ = จากจุดเริ่มกรอบถึงขอบล่างจอพอดี (วัดจริง ไม่ใช่ค่าตายตัว)
   * เดิม calc(100vh - 210px) + ขั้นต่ำ 640px แต่หัวหน้าหลังบ้านสูงกว่า 210px → แถบรูป/ปุ่มล่างล้นจอ (13 ต.ค. 69)
   */
  const [height, setHeight] = useState<number | null>(null);

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

  /**
   * 🔄 สูตรสินค้า (products.py) จากโปรแกรมในเครื่อง → บันทึกขึ้นตั้งค่าร้าน
   * โปรแกรมส่ง postMessage ทุกครั้งที่โหลด/กด "บันทึกเป็นค่าเริ่มต้นของสินค้านี้" → จอออกแบบพวงกุญแจของลูกค้าใช้ค่าเดียวกัน (14 ต.ค. 69)
   */
  const [synced, setSynced] = useState<"" | "ok" | "err">("");
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== PY_CUTOUT_URL || e.data?.type !== "cutout-products" || !Array.isArray(e.data.products)) return;
      fetch("/api/admin/diecut-presets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ products: e.data.products }),
      })
        .then((r) => setSynced(r.ok ? "ok" : "err"))
        .catch(() => setSynced("err"));
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  useEffect(() => {
    if (!active || state !== "up") return;
    const measure = () => {
      const el = frame.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY; // ตำแหน่งในหน้า (ไม่ขึ้นกับการเลื่อน)
      const vh = window.innerHeight;
      // เว้นเท่าขอบล่างของหน้าหลังบ้าน (padding 32px) ให้กรอบจบพอดีขอบจอ ไม่ล้นลงไป
      setHeight(Math.max(420, Math.round(vh - top - 36)));
    };
    measure();
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    // ส่วนหัวด้านบนเปลี่ยนความสูงได้ (ฟอนต์โหลดเสร็จ · ข้อความยาวขึ้นบรรทัดใหม่) → วัดใหม่
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(document.body);
    return () => {
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
      ro?.disconnect();
    };
  }, [active, state]);

  if (state === "up")
    return (
      <>
      {synced && (
        <p className={`mt-3 text-[11px] font-semibold ${synced === "ok" ? "text-emerald-700" : "text-rose-600"}`}>
          {synced === "ok"
            ? "🔄 สูตรเส้นตัดตามชนิดงานซิงก์ขึ้นเว็บแล้ว — จอออกแบบพวงกุญแจของลูกค้าใช้ค่าชุดเดียวกับหน้านี้"
            : "⚠️ ซิงก์สูตรเส้นตัดขึ้นเว็บไม่สำเร็จ — จอออกแบบของลูกค้ายังใช้ค่าชุดเดิม"}
        </p>
      )}
      <iframe
        ref={frame}
        src={PY_CUTOUT_URL}
        title="ตัดพื้นหลัง AI"
        className="mt-3 block w-full rounded-2xl border"
        style={{ height: height ?? "calc(100vh - 260px)", minHeight: 420, borderColor: "var(--dk-line, #e4ddd0)", background: "#f4f1ea" }}
      />
      </>
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
