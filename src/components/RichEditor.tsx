"use client";

import { useEffect, useRef, useState } from "react";
import { ARTICLE_PROSE } from "@/components/ArticleHtml";

/**
 * ✍️ ตัวเขียนแบบ rich text หน้าตาเดียวกับบล็อก lnwshop (TinyMCE)
 * ปุ่มจัดกลุ่มเป็นกล่องขาว 2 แถว: จัดรูปแบบ/สี/จัดวาง/quote/รายการ แถวบน
 * ย่อหน้า/ฟอนต์/ขนาด/ลิงก์/รูป/อีโมจิ/ตาราง/ล้างรูปแบบ/โค้ด แถวล่าง
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

/* ── ชิ้นส่วน UI แบบ TinyMCE: กลุ่มปุ่มกล่องขาว + ปุ่มสี่เหลี่ยม ── */

function Group({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-stretch divide-x divide-slate-200 overflow-hidden rounded-lg border border-slate-300 bg-white shadow-[0_1px_1px_rgba(15,23,42,.04)]">
      {children}
    </span>
  );
}

const BTN = "grid min-w-9 place-items-center px-2.5 py-2 text-sm text-slate-700 transition hover:bg-slate-100 active:bg-slate-200";
const SEL = "cursor-pointer bg-white px-2 py-2 text-xs text-slate-700 outline-none transition hover:bg-slate-100";

/** ดรอปดาวน์เล็ก ๆ ใต้ปุ่ม (จานสี / อีโมจิ / ตาราง) */
function Drop({ label, title, children }: { label: React.ReactNode; title: string; children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button type="button" onClick={() => setOpen((v) => !v)} className={`${BTN} gap-0.5`} title={title}>
        {label}
        <span className="text-[8px] text-slate-400">▾</span>
      </button>
      {open && (
        <>
          <button type="button" aria-label="ปิด" onClick={() => setOpen(false)} className="fixed inset-0 z-30 cursor-default" />
          <span className="absolute left-0 top-full z-40 mt-1 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
            {children(() => setOpen(false))}
          </span>
        </>
      )}
    </span>
  );
}

/** ไอคอนเส้นแบบ TinyMCE — วาดเองด้วย SVG จะได้คมและหน้าตาเหมือนกันทุกเครื่อง */
function Ic({ d, children }: { d?: string; children?: React.ReactNode }) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d && <path d={d} />}
      {children}
    </svg>
  );
}
const IC = {
  alignL: "M2 3h12 M2 6.3h8 M2 9.7h12 M2 13h8",
  alignC: "M2 3h12 M4 6.3h8 M2 9.7h12 M4 13h8",
  alignR: "M2 3h12 M6 6.3h8 M2 9.7h12 M6 13h8",
  alignJ: "M2 3h12 M2 6.3h12 M2 9.7h12 M2 13h12",
  ul: "M2.2 3.5h.01 M5.5 3.5h8.5 M2.2 8h.01 M5.5 8h8.5 M2.2 12.5h.01 M5.5 12.5h8.5",
  outdent: "M7 3h7 M7 6.3h7 M7 9.7h7 M7 13h7 M4.5 6l-2 2 2 2",
  indent: "M7 3h7 M7 6.3h7 M7 9.7h7 M7 13h7 M2.5 6l2 2-2 2",
  undo: "M6.5 3.5L3.5 6.5l3 3 M3.5 6.5H10a3.5 3.5 0 010 7H7",
  redo: "M9.5 3.5l3 3-3 3 M12.5 6.5H6a3.5 3.5 0 000 7h3",
  link: "M6.5 9.5l3-3 M5.2 7.2l-1.9 1.9a2.6 2.6 0 003.6 3.6l1.9-1.9 M10.8 8.8l1.9-1.9a2.6 2.6 0 00-3.6-3.6L7.2 5.2",
  unlink: "M5.2 7.2l-1.9 1.9a2.6 2.6 0 003.6 3.6l1.9-1.9 M10.8 8.8l1.9-1.9a2.6 2.6 0 00-3.6-3.6L7.2 5.2 M3 13.5L13 2.5",
};

const COLORS = ["#1a3843", "#3fa1b6", "#e11d48", "#ea580c", "#ca8a04", "#16a34a", "#7c3aed", "#78716c", "#a8a29e", "#000000"];
const HILITES = ["#fff3c4", "#d6edf2", "#fee2e2", "#dcfce7", "#f3e8ff", "#fce7f3", "#ffffff"];
const EMOJI = ["😀","😍","🥰","😆","🥹","😅","🙏","👍","👏","💪","✨","🎉","🎁","💛","❤️","🔥","⭐","✅","❌","⚠️","📌","📞","🚚","🐥"];

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

  function insertTable(rows: number, cols: number) {
    const cell = '<td style="border:1px solid #d6d3d1;padding:8px;min-width:60px"><br></td>';
    const html = `<table style="border-collapse:collapse;width:100%;margin:12px 0">${Array.from({ length: rows })
      .map(() => `<tr>${cell.repeat(cols)}</tr>`)
      .join("")}</table><p><br></p>`;
    cmd("insertHTML", html);
  }

  function toggleSource() {
    if (!ref.current) return;
    if (srcMode) {
      ref.current.innerHTML = srcText;
      emit();
      setSrcMode(false);
    } else {
      setSrcText(ref.current.innerHTML);
      setSrcMode(true);
    }
  }

  return (
    <div className="overflow-visible rounded-2xl border border-slate-200 bg-white">
      {/* ── แถบเครื่องมือ 2 แถว แบบ TinyMCE ── */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-t-2xl border-b border-slate-200 bg-slate-50/80 px-2.5 py-2">
        <Group>
          <button type="button" onClick={() => cmd("bold")} className={`${BTN} font-extrabold`} title="ตัวหนา">B</button>
          <button type="button" onClick={() => cmd("italic")} className={`${BTN} italic`} title="ตัวเอียง">I</button>
          <button type="button" onClick={() => cmd("underline")} className={`${BTN} underline`} title="ขีดเส้นใต้">U</button>
          <button type="button" onClick={() => cmd("strikeThrough")} className={`${BTN} line-through`} title="ขีดฆ่า">S</button>
        </Group>

        <Group>
          <Drop label={<span className="border-b-[3px] border-rose-500 font-bold leading-none">A</span>} title="สีตัวอักษร">
            {(close) => (
              <span className="flex w-40 flex-wrap gap-1">
                {COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => { cmd("foreColor", c); close(); }}
                    className="h-6 w-6 rounded-md ring-1 ring-slate-200 transition hover:scale-110" style={{ backgroundColor: c }} aria-label={c} />
                ))}
              </span>
            )}
          </Drop>
          <Drop label={<span className="bg-yellow-200 px-1 font-bold leading-none">A</span>} title="ไฮไลต์ข้อความ">
            {(close) => (
              <span className="flex w-32 flex-wrap gap-1">
                {HILITES.map((c) => (
                  <button key={c} type="button" onClick={() => { cmd("hiliteColor", c); close(); }}
                    className="h-6 w-6 rounded-md ring-1 ring-slate-200 transition hover:scale-110" style={{ backgroundColor: c }} aria-label={c} />
                ))}
              </span>
            )}
          </Drop>
        </Group>

        <Group>
          <button type="button" onClick={() => cmd("justifyLeft")} className={BTN} title="ชิดซ้าย"><Ic d={IC.alignL} /></button>
          <button type="button" onClick={() => cmd("justifyCenter")} className={BTN} title="กึ่งกลาง"><Ic d={IC.alignC} /></button>
          <button type="button" onClick={() => cmd("justifyRight")} className={BTN} title="ชิดขวา"><Ic d={IC.alignR} /></button>
          <button type="button" onClick={() => cmd("justifyFull")} className={BTN} title="เต็มแนว"><Ic d={IC.alignJ} /></button>
        </Group>

        <Group>
          <button type="button" onClick={() => cmd("formatBlock", "<blockquote>")} className={`${BTN} font-serif text-lg leading-none`} title="คำพูด / ไฮไลต์ท่อน">
            &ldquo;
          </button>
          <button type="button" onClick={() => cmd("insertUnorderedList")} className={BTN} title="รายการจุด"><Ic d={IC.ul} /></button>
          <button type="button" onClick={() => cmd("insertOrderedList")} className={BTN} title="รายการตัวเลข">
            <Ic d="M5.5 3.5h8.5 M5.5 8h8.5 M5.5 12.5h8.5">
              <text x="1" y="5" fontSize="4.5" stroke="none" fill="currentColor">1</text>
              <text x="1" y="9.5" fontSize="4.5" stroke="none" fill="currentColor">2</text>
              <text x="1" y="14" fontSize="4.5" stroke="none" fill="currentColor">3</text>
            </Ic>
          </button>
          <button type="button" onClick={() => cmd("outdent")} className={BTN} title="ลดย่อหน้า"><Ic d={IC.outdent} /></button>
          <button type="button" onClick={() => cmd("indent")} className={BTN} title="เพิ่มย่อหน้า"><Ic d={IC.indent} /></button>
        </Group>

        {/* ── ขึ้นแถวที่ 2 ตายตัว (ไม่ปล่อยตัดบรรทัดตามดวง) ── */}
        <span className="basis-full" aria-hidden="true" />

        <Group>
          <select
            defaultValue=""
            onChange={(e) => { if (e.target.value) cmd("formatBlock", e.target.value); e.target.value = ""; }}
            className={SEL} title="รูปแบบย่อหน้า"
          >
            <option value="" disabled>ย่อหน้า</option>
            <option value="<p>">ข้อความปกติ</option>
            <option value="<h1>">หัวข้อหลัก (H1)</option>
            <option value="<h2>">หัวข้อใหญ่ (H2)</option>
            <option value="<h3>">หัวข้อรอง (H3)</option>
            <option value="<blockquote>">“ คำพูด</option>
          </select>
          <select
            defaultValue=""
            onChange={(e) => { if (e.target.value) cmd("fontName", e.target.value); e.target.value = ""; }}
            className={SEL} title="ฟอนต์"
          >
            <option value="" disabled>ฟอนต์</option>
            <option value="Prompt">Prompt (ของเว็บ)</option>
            <option value="Sarabun">Sarabun</option>
            <option value="Arial">Arial</option>
            <option value="Georgia">Georgia</option>
            <option value="monospace">Monospace</option>
          </select>
          <select
            defaultValue=""
            onChange={(e) => { if (e.target.value) cmd("fontSize", e.target.value); e.target.value = ""; }}
            className={SEL} title="ขนาดตัวอักษร"
          >
            <option value="" disabled>16px</option>
            <option value="1">10px</option>
            <option value="2">13px</option>
            <option value="3">16px</option>
            <option value="4">18px</option>
            <option value="5">24px</option>
            <option value="6">32px</option>
          </select>
        </Group>

        <Group>
          <button
            type="button"
            onClick={() => { const url = prompt("ลิงก์ไปที่ (เช่น /products หรือ https://…)"); if (url) cmd("createLink", url); }}
            className={BTN} title="แทรกลิงก์"
          >
            <Ic d={IC.link} />
          </button>
          <button type="button" onClick={() => cmd("unlink")} className={BTN} title="เอาลิงก์ออก"><Ic d={IC.unlink} /></button>
        </Group>

        <Group>
          <label className={`${BTN} cursor-pointer`} title="แทรกรูป (ลากมาวาง หรือ paste รูปในพื้นที่เขียนก็ได้)">
            {busy ? "⏳" : "🖼"}
            <input
              type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" disabled={busy}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void insertImage(f); }}
            />
          </label>
          <Drop label="😊" title="แทรกอีโมจิ">
            {(close) => (
              <span className="grid w-48 grid-cols-8 gap-0.5">
                {EMOJI.map((em) => (
                  <button key={em} type="button" onClick={() => { cmd("insertText", em); close(); }}
                    className="rounded p-1 text-base transition hover:bg-slate-100">{em}</button>
                ))}
              </span>
            )}
          </Drop>
          <Drop label="▦" title="แทรกตาราง">
            {(close) => (
              <span className="flex flex-col gap-1 text-xs">
                {[[2, 2], [3, 2], [3, 3], [4, 3]].map(([r, c]) => (
                  <button key={`${r}x${c}`} type="button" onClick={() => { insertTable(r, c); close(); }}
                    className="rounded-lg px-3 py-1.5 text-left font-semibold text-slate-600 transition hover:bg-slate-100">
                    ▦ {r} แถว × {c} ช่อง
                  </button>
                ))}
              </span>
            )}
          </Drop>
        </Group>

        <Group>
          <button type="button" onClick={() => cmd("undo")} className={BTN} title="ย้อนกลับ"><Ic d={IC.undo} /></button>
          <button type="button" onClick={() => cmd("redo")} className={BTN} title="ทำซ้ำ"><Ic d={IC.redo} /></button>
          <button type="button" onClick={() => cmd("removeFormat")} className={`${BTN} text-xs font-bold`} title="ล้างรูปแบบข้อความที่เลือก">
            <span className="italic">T</span>ₓ
          </button>
        </Group>

        <Group>
          <button type="button" onClick={toggleSource}
            className={`${BTN} text-xs font-bold ${srcMode ? "bg-slate-800 text-white hover:bg-slate-700" : ""}`} title="ดู/แก้โค้ด HTML">
            &lt;&gt;
          </button>
        </Group>
      </div>

      {/* ── โหมดโค้ด HTML ── */}
      {srcMode && (
        <textarea
          value={srcText}
          onChange={(e) => { setSrcText(e.target.value); onChange(e.target.value); }}
          rows={18}
          className="w-full resize-y bg-slate-900 px-4 py-3 font-mono text-xs leading-relaxed text-emerald-200 outline-none"
          spellCheck={false}
        />
      )}

      {/* ── พื้นที่เขียน (สไตล์เดียวกับหน้าเว็บจริง) ── */}
      <div
        ref={ref}
        contentEditable={!srcMode}
        suppressContentEditableWarning
        onInput={emit}
        onBlur={emit}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          const f = e.dataTransfer.files?.[0];
          if (f && f.type.startsWith("image/")) { e.preventDefault(); void insertImage(f); }
        }}
        onPaste={(e) => {
          const f = [...e.clipboardData.items].find((i) => i.type.startsWith("image/"))?.getAsFile();
          if (f) { e.preventDefault(); void insertImage(f); }
        }}
        className={`min-h-72 resize-y overflow-auto rounded-b-2xl px-4 py-3 outline-none ${ARTICLE_PROSE} ${srcMode ? "hidden" : ""}`}
        data-placeholder="พิมพ์เนื้อหาบทความที่นี่… เลือกข้อความแล้วกดปุ่มด้านบนเพื่อจัดรูปแบบ"
      />
    </div>
  );
}
