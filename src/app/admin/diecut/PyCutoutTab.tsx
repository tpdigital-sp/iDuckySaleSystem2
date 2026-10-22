"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

/**
 * แท็บ "ตัดพื้นหลัง AI" — ฝังเว็บแอพ Python (tools/cutout-py: rembg BiRefNet + Potrace) ไว้ใน iframe
 * 1) โปรแกรมในเครื่องนี้ (localhost:8777 · start.command) — ถ้าเปิดอยู่ใช้ตัวนี้ก่อน (เร็ว + Illustrator ในเครื่อง)
 * 2) 🐳 เซิร์ฟเวอร์ Hugging Face Space (/api/admin/cutout-endpoint) — พนักงานไม่ต้องติดตั้งอะไร (22 ต.ค. 69)
 */
export const PY_CUTOUT_URL = "http://localhost:8777";

type Endpoint = { origin: string; src: string };
const LOCAL: Endpoint = { origin: PY_CUTOUT_URL, src: PY_CUTOUT_URL };

async function healthy(base: string): Promise<boolean> {
  try {
    const r = await fetch(`${base}/health`, { cache: "no-store" });
    return !!(await r.json()).ok; // Space หลับอยู่ = ได้หน้า HTML ของ Hugging Face → อ่าน JSON ไม่ได้ = ยังไม่พร้อม
  } catch {
    return false;
  }
}

export type PyCutoutHandle = { addFiles: (files: File[]) => void };

type State = "checking" | "up" | "down" | "waking";

const PyCutoutTab = forwardRef<PyCutoutHandle, { active: boolean }>(function PyCutoutTab({ active }, ref) {
  const [state, setState] = useState<State>("checking");
  const [ep, setEp] = useState<Endpoint>(LOCAL);
  const remote = useRef<Endpoint | null | undefined>(undefined); // undefined = ยังไม่ได้ถาม · null = ไม่ได้ตั้ง Space
  const frame = useRef<HTMLIFrameElement>(null);
  /**
   * ความสูงกรอบ = จากจุดเริ่มกรอบถึงขอบล่างจอพอดี (วัดจริง ไม่ใช่ค่าตายตัว)
   * เดิม calc(100vh - 210px) + ขั้นต่ำ 640px แต่หัวหน้าหลังบ้านสูงกว่า 210px → แถบรูป/ปุ่มล่างล้นจอ (13 ต.ค. 69)
   */
  const [height, setHeight] = useState<number | null>(null);

  useImperativeHandle(ref, () => ({
    addFiles: (files) => frame.current?.contentWindow?.postMessage({ type: "cutout-add-files", files }, ep.origin),
  }));

  // เช็คว่าเปิดเซิร์ฟเวอร์อยู่ไหม — เครื่องนี้ก่อน แล้วค่อย Space · ยังไม่พร้อม ลองใหม่ทุก 3 วิ (Space ตื่นจากหลับ ~1 นาที)
  useEffect(() => {
    if (!active || state === "up") return;
    let stop = false;
    const check = async () => {
      if (await healthy(PY_CUTOUT_URL)) {
        if (!stop) {
          setEp(LOCAL);
          setState("up");
        }
        return;
      }
      if (remote.current === undefined) {
        try {
          const j = (await (await fetch("/api/admin/cutout-endpoint", { cache: "no-store" })).json()) as { url?: string; key?: string };
          remote.current = j.url ? { origin: new URL(j.url).origin, src: `${j.url}/?key=${encodeURIComponent(j.key || "")}` } : null;
        } catch {
          remote.current = null;
        }
      }
      const r = remote.current;
      if (r && (await healthy(r.origin))) {
        if (!stop) {
          setEp(r);
          setState("up");
        }
        return;
      }
      if (!stop) setState(r ? "waking" : "down");
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
      if (e.origin !== ep.origin || e.data?.type !== "cutout-products" || !Array.isArray(e.data.products)) return;
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
  }, [ep.origin]);

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
        src={ep.src}
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
      ) : state === "waking" ? (
        <>
          <p className="text-[16px] font-bold" style={{ color: "var(--dk-navy)" }}>
            กำลังปลุกเซิร์ฟเวอร์ตัดพื้นหลัง…
          </p>
          <p className="mt-2" style={{ color: "var(--dk-navy-soft)" }}>
            ไม่มีคนใช้นานเซิร์ฟเวอร์จะหลับ ครั้งแรกของวันรอประมาณ 1–2 นาที หน้านี้จะเปิดเครื่องมือขึ้นมาเอง ไม่ต้องรีเฟรช
          </p>
        </>
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
