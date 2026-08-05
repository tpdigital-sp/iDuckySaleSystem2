"use client";

import { useEffect, useRef, useState } from "react";
import { ARTICLE_PROSE } from "@/components/ArticleHtml";

/**
 * ✍️ ตัวเขียนแบบ rich text (สไตล์เดียวกับบล็อก lnwshop)
 * — พิมพ์แล้วจัดรูปแบบได้เลย: หนา/เอียง/ขีดเส้น หัวข้อ รายการ ลิงก์ แทรกรูปในเนื้อหา
 * เก็บเป็น HTML (ฝั่งเซิร์ฟเวอร์กรองแท็กอันตรายก่อนบันทึกอีกชั้น)
 */

/** อัปโหลดรูปเข้าโฟลเดอร์บทความ → URL */
async function uploadImage(file: File): Promise<string | null> {
  try {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("productId", "articles");
    const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
    const j = (await res.json()) as { url?: string };
    return res.ok && j.url ? j.url : null;
  } catch {
    return null;
  }
}

const btn =
  "rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-200 active:bg-slate-300";

export default function RichEditor({
  initialHtml,
  onChange,
}: {
  /** ค่าเริ่มต้น — ใส่ครั้งเดียวตอนเปิด (พิมพ์ต่อไม่กระตุก) */
  initialHtml: string;
  onChange: (html: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  // ใส่เนื้อหาเริ่มต้นครั้งเดียว — ไม่ sync ทุก render ไม่งั้น caret เด้ง
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== initialHtml) ref.current.innerHTML = initialHtml;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emit = () => ref.current && onChange(ref.current.innerHTML);

  /** สั่งจัดรูปแบบ ณ ตำแหน่ง cursor (execCommand เก่าแต่ใช้ได้ทุกเบราว์เซอร์) */
  function cmd(name: string, value?: string) {
    ref.current?.focus();
    document.execCommand(name, false, value);
    emit();
  }

  async function insertImage(f: File) {
    if (!f.type.startsWith("image/")) return;
    setBusy(true);
    const url = await uploadImage(f);
    setBusy(false);
    if (url) cmd("insertImage", url);
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {/* ── แถบเครื่องมือ ── */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-slate-50 px-2 py-1.5">
        <button type="button" onClick={() => cmd("bold")} className={btn} title="ตัวหนา">
          <b>B</b>
        </button>
        <button type="button" onClick={() => cmd("italic")} className={`${btn} italic`} title="ตัวเอียง">
          I
        </button>
        <button type="button" onClick={() => cmd("underline")} className={`${btn} underline`} title="ขีดเส้นใต้">
          U
        </button>
        <button type="button" onClick={() => cmd("strikeThrough")} className={`${btn} line-through`} title="ขีดฆ่า">
          S
        </button>
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <button type="button" onClick={() => cmd("formatBlock", "<h2>")} className={btn} title="หัวข้อใหญ่">
          H2
        </button>
        <button type="button" onClick={() => cmd("formatBlock", "<h3>")} className={btn} title="หัวข้อรอง">
          H3
        </button>
        <button type="button" onClick={() => cmd("formatBlock", "<p>")} className={btn} title="ข้อความปกติ">
          ¶
        </button>
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <button type="button" onClick={() => cmd("insertUnorderedList")} className={btn} title="รายการจุด">
          • รายการ
        </button>
        <button type="button" onClick={() => cmd("insertOrderedList")} className={btn} title="รายการตัวเลข">
          1. รายการ
        </button>
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <button
          type="button"
          onClick={() => {
            const url = prompt("ลิงก์ไปที่ (เช่น /products หรือ https://…)");
            if (url) cmd("createLink", url);
          }}
          className={btn}
          title="แทรกลิงก์"
        >
          🔗 ลิงก์
        </button>
        <label className={`${btn} cursor-pointer`} title="แทรกรูปตรงตำแหน่งที่พิมพ์อยู่ (ลากรูปมาวางในพื้นที่เขียนก็ได้)">
          {busy ? "⏳ กำลังอัป…" : "🖼 แทรกรูป"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void insertImage(f);
            }}
          />
        </label>
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <button type="button" onClick={() => cmd("undo")} className={btn} title="ย้อนกลับ">
          ↶
        </button>
        <button type="button" onClick={() => cmd("redo")} className={btn} title="ทำซ้ำ">
          ↷
        </button>
        <button type="button" onClick={() => cmd("removeFormat")} className={btn} title="ล้างรูปแบบข้อความที่เลือก">
          ⌫ ล้างรูปแบบ
        </button>
      </div>

      {/* ── พื้นที่เขียน (สไตล์เดียวกับหน้าเว็บจริง) ── */}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onBlur={emit}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          const f = e.dataTransfer.files?.[0];
          if (f && f.type.startsWith("image/")) {
            e.preventDefault();
            void insertImage(f);
          }
        }}
        onPaste={(e) => {
          // วางรูปจากคลิปบอร์ดได้เลย (เช่น screenshot)
          const f = [...e.clipboardData.items].find((i) => i.type.startsWith("image/"))?.getAsFile();
          if (f) {
            e.preventDefault();
            void insertImage(f);
          }
        }}
        className={`min-h-72 px-4 py-3 outline-none ${ARTICLE_PROSE}`}
        data-placeholder="พิมพ์เนื้อหาบทความที่นี่… เลือกข้อความแล้วกดปุ่มด้านบนเพื่อจัดรูปแบบ"
      />
    </div>
  );
}
