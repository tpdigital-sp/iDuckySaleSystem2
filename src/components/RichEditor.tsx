"use client";

import { useEffect, useRef, useState } from "react";
import { ARTICLE_PROSE } from "@/components/ArticleHtml";

/**
 * ✍️ ตัวเขียนแบบ rich text (สไตล์เดียวกับบล็อก lnwshop)
 * — หนา/เอียง/ขีด · สี+ไฮไลต์ · จัดวางซ้าย-กลาง-ขวา · หัวข้อ/quote/ย่อหน้า
 *   รายการ · ลิงก์ · แทรกรูป (ปุ่ม/ลาก/paste) · ขนาดตัวอักษร · ดูโค้ด HTML
 * เก็บเป็น HTML (ฝั่งเซิร์ฟเวอร์กรองแท็กอันตรายก่อนบันทึกอีกชั้น)
 */

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
  "rounded-lg px-2 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-200 active:bg-slate-300";
const sel = "rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-700 focus:outline-none";

/** สีให้เลือกเร็ว (แบรนด์ + สีพื้นฐาน) */
const COLORS = ["#1a3843", "#3fa1b6", "#e11d48", "#ea580c", "#16a34a", "#7c3aed", "#78716c", "#000000"];
const HILITES = ["#fff3c4", "#d6edf2", "#fee2e2", "#dcfce7", "#f3e8ff", "#ffffff"];

/** ดรอปดาวน์จานสีเล็ก ๆ */
function ColorMenu({
  label,
  title,
  colors,
  onPick,
}: {
  label: React.ReactNode;
  title: string;
  colors: string[];
  onPick: (c: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className={btn} title={title}>
        {label}
      </button>
      {open && (
        <>
          <button type="button" aria-label="ปิด" onClick={() => setOpen(false)} className="fixed inset-0 z-30 cursor-default" />
          <span className="absolute left-0 top-full z-40 mt-1 flex w-36 flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
            {colors.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  onPick(c);
                  setOpen(false);
                }}
                className="h-6 w-6 rounded-md ring-1 ring-slate-200 transition hover:scale-110"
                style={{ backgroundColor: c }}
                aria-label={c}
              />
            ))}
          </span>
        </>
      )}
    </span>
  );
}

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
  // โหมดดูโค้ด HTML (แบบปุ่ม <> ของ lnwshop)
  const [srcMode, setSrcMode] = useState(false);
  const [srcText, setSrcText] = useState("");

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== initialHtml) ref.current.innerHTML = initialHtml;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emit = () => ref.current && onChange(ref.current.innerHTML);

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

  function toggleSource() {
    if (!ref.current) return;
    if (srcMode) {
      // กลับจากโหมดโค้ด → ใช้โค้ดที่แก้
      ref.current.innerHTML = srcText;
      emit();
      setSrcMode(false);
    } else {
      setSrcText(ref.current.innerHTML);
      setSrcMode(true);
    }
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
        <ColorMenu label={<span className="border-b-2 border-rose-500">A</span>} title="สีตัวอักษร" colors={COLORS} onPick={(c) => cmd("foreColor", c)} />
        <ColorMenu label={<span className="bg-yellow-200 px-0.5">A</span>} title="ไฮไลต์ข้อความ" colors={HILITES} onPick={(c) => cmd("hiliteColor", c)} />
        <span className="mx-1 h-5 w-px bg-slate-200" />

        <button type="button" onClick={() => cmd("justifyLeft")} className={btn} title="ชิดซ้าย">⇤</button>
        <button type="button" onClick={() => cmd("justifyCenter")} className={btn} title="กึ่งกลาง">↔</button>
        <button type="button" onClick={() => cmd("justifyRight")} className={btn} title="ชิดขวา">⇥</button>
        <span className="mx-1 h-5 w-px bg-slate-200" />

        <select
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) cmd("formatBlock", e.target.value);
            e.target.value = "";
          }}
          className={sel}
          title="รูปแบบย่อหน้า"
        >
          <option value="" disabled>ย่อหน้า</option>
          <option value="<p>">ข้อความปกติ</option>
          <option value="<h2>">หัวข้อใหญ่ (H2)</option>
          <option value="<h3>">หัวข้อรอง (H3)</option>
          <option value="<blockquote>">“ คำพูด/ไฮไลต์</option>
        </select>
        <select
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) cmd("fontSize", e.target.value);
            e.target.value = "";
          }}
          className={sel}
          title="ขนาดตัวอักษร"
        >
          <option value="" disabled>ขนาด</option>
          <option value="2">เล็ก</option>
          <option value="3">ปกติ</option>
          <option value="5">ใหญ่</option>
          <option value="6">ใหญ่มาก</option>
        </select>
        <span className="mx-1 h-5 w-px bg-slate-200" />

        <button type="button" onClick={() => cmd("insertUnorderedList")} className={btn} title="รายการจุด">
          • รายการ
        </button>
        <button type="button" onClick={() => cmd("insertOrderedList")} className={btn} title="รายการตัวเลข">
          1.
        </button>
        <button type="button" onClick={() => cmd("outdent")} className={btn} title="ลดย่อหน้า">⇦</button>
        <button type="button" onClick={() => cmd("indent")} className={btn} title="เพิ่มย่อหน้า">⇨</button>
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
          🔗
        </button>
        <button type="button" onClick={() => cmd("unlink")} className={btn} title="เอาลิงก์ออก">
          🔗✕
        </button>
        <label className={`${btn} cursor-pointer`} title="แทรกรูปตรงตำแหน่งที่พิมพ์ (ลากมาวาง หรือ paste รูปก็ได้)">
          {busy ? "⏳" : "🖼 รูป"}
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

        <button type="button" onClick={() => cmd("undo")} className={btn} title="ย้อนกลับ">↶</button>
        <button type="button" onClick={() => cmd("redo")} className={btn} title="ทำซ้ำ">↷</button>
        <button type="button" onClick={() => cmd("removeFormat")} className={btn} title="ล้างรูปแบบข้อความที่เลือก">
          Tx
        </button>
        <button
          type="button"
          onClick={toggleSource}
          className={`${btn} ${srcMode ? "bg-slate-800 text-white hover:bg-slate-700" : ""}`}
          title="ดู/แก้โค้ด HTML"
        >
          &lt;&gt;
        </button>
      </div>

      {/* ── โหมดโค้ด HTML ── */}
      {srcMode ? (
        <textarea
          value={srcText}
          onChange={(e) => {
            setSrcText(e.target.value);
            onChange(e.target.value);
          }}
          rows={18}
          className="w-full resize-y bg-slate-900 px-4 py-3 font-mono text-xs leading-relaxed text-emerald-200 outline-none"
          spellCheck={false}
        />
      ) : null}

      {/* ── พื้นที่เขียน (สไตล์เดียวกับหน้าเว็บจริง) — ซ่อนไว้ตอนอยู่โหมดโค้ด ── */}
      <div
        ref={ref}
        contentEditable={!srcMode}
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
          const f = [...e.clipboardData.items].find((i) => i.type.startsWith("image/"))?.getAsFile();
          if (f) {
            e.preventDefault();
            void insertImage(f);
          }
        }}
        className={`min-h-72 px-4 py-3 outline-none ${ARTICLE_PROSE} ${srcMode ? "hidden" : ""}`}
        data-placeholder="พิมพ์เนื้อหาบทความที่นี่… เลือกข้อความแล้วกดปุ่มด้านบนเพื่อจัดรูปแบบ"
      />
    </div>
  );
}
