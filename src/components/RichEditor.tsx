"use client";

import { useEffect, useRef, useState } from "react";
import { ARTICLE_PROSE } from "@/components/ArticleHtml";

/**
 * ✍️ ตัวเขียนแบบ rich text หน้าตา/ลำดับปุ่มตามบล็อก lnwshop (TinyMCE)
 * แถว 1: B I U S · สี/ไฮไลต์ · จัดวาง 4 แบบ · “ quote · รายการจุด/ตัวเลข · ย่อหน้าออก-เข้า
 * แถว 2: ย่อหน้า · ฟอนต์ · ระยะบรรทัด · ขนาด · ลิงก์/เอาออก · รูปอัป/รูป URL/YouTube/อีโมจิ · เต็มจอ/ตาราง · Tx · <>
 * เก็บเป็น HTML (ฝั่งเซิร์ฟเวอร์กรองแท็กอันตราย — iframe อนุญาตเฉพาะ YouTube)
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

/* ── ปุ่มกล่องเดี่ยวแบบต้นแบบ: ขาว ขอบเทา เงาบาง ── */
const BOX =
  "grid h-10 min-w-10 place-items-center rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-700 shadow-[0_1px_1px_rgba(15,23,42,.05)] transition hover:bg-slate-100 active:bg-slate-200";
const SELBOX =
  "h-10 cursor-pointer rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700 shadow-[0_1px_1px_rgba(15,23,42,.05)] outline-none transition hover:bg-slate-50";

/** ไอคอนเส้น SVG — คมและหน้าตาเหมือนกันทุกเครื่อง */
function Ic({ d, children }: { d?: string; children?: React.ReactNode }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
  link: "M6.5 9.5l3-3 M5.2 7.2l-1.9 1.9a2.6 2.6 0 003.6 3.6l1.9-1.9 M10.8 8.8l1.9-1.9a2.6 2.6 0 00-3.6-3.6L7.2 5.2",
  unlink: "M5.2 7.2l-1.9 1.9a2.6 2.6 0 003.6 3.6l1.9-1.9 M10.8 8.8l1.9-1.9a2.6 2.6 0 00-3.6-3.6L7.2 5.2 M3 13.5L13 2.5",
  lineH: "M8.5 3.5h6 M8.5 8h6 M8.5 12.5h6 M3.5 3.2v9.6 M2 4.6l1.5-1.5L5 4.6 M2 11.4l1.5 1.5L5 11.4",
  full: "M2.5 5.5v-3h3 M10.5 2.5h3v3 M13.5 10.5v3h-3 M5.5 13.5h-3v-3",
};
/** ไอคอนรูปภาพ (ภูเขา+จุด) — link=true มีลูกศรมุมขวาบน (รูปจาก URL) */
const PicIcon = ({ link = false }: { link?: boolean }) => (
  <Ic>
    <rect x="1.8" y="2.8" width="12.4" height="10.4" rx="1.6" />
    <circle cx="5.6" cy="6.2" r="1" fill="currentColor" stroke="none" />
    <path d="M3 12l3.4-3.6 2.4 2.4 2.2-2.6 2.8 3.4" />
    {link && <path d="M10.3 5.2l3-3 M13.3 4.4V2.2h-2.2" strokeWidth="1.2" />}
  </Ic>
);
const VideoIcon = () => (
  <Ic>
    <rect x="1.8" y="3.3" width="12.4" height="9.4" rx="1.6" />
    <path d="M6.8 5.8l3.4 2.2-3.4 2.2z" fill="currentColor" stroke="none" />
  </Ic>
);
const SmileIcon = () => (
  <Ic>
    <circle cx="8" cy="8" r="6.2" />
    <circle cx="5.8" cy="6.5" r=".6" fill="currentColor" stroke="none" />
    <circle cx="10.2" cy="6.5" r=".6" fill="currentColor" stroke="none" />
    <path d="M5.3 9.6a3.4 3.4 0 005.4 0" />
  </Ic>
);
const TableIcon = () => (
  <Ic>
    <rect x="1.8" y="2.8" width="12.4" height="10.4" rx="1.2" />
    <path d="M1.8 7h12.4 M6 2.8v10.4 M10.2 2.8v10.4" />
  </Ic>
);

/** ดรอปดาวน์ใต้ปุ่ม (จานสี / ระยะบรรทัด / อีโมจิ / ตาราง) */
function Drop({ label, title, children }: { label: React.ReactNode; title: string; children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button type="button" onClick={() => setOpen((v) => !v)} className={`${BOX} grid-flow-col gap-0.5`} title={title}>
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
  const [full, setFull] = useState(false);

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== initialHtml) ref.current.innerHTML = initialHtml;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // โหมดเต็มจอ: ล็อกสกรอลหน้าเบื้องหลังไว้
  useEffect(() => {
    document.body.style.overflow = full ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [full]);

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

  function insertYoutube() {
    const url = prompt("วางลิงก์วิดีโอ YouTube");
    if (!url) return;
    const m = url.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{6,})/);
    if (!m) {
      alert("ลิงก์ YouTube ไม่ถูกต้อง — วางลิงก์เต็มจากช่องแชร์ของ YouTube");
      return;
    }
    cmd(
      "insertHTML",
      `<iframe src="https://www.youtube-nocookie.com/embed/${m[1]}" style="width:100%;aspect-ratio:16/9;border:0;border-radius:16px;margin:12px 0" allowfullscreen></iframe><p><br></p>`
    );
  }

  /** ระยะบรรทัดของย่อหน้าที่เคอร์เซอร์อยู่ */
  function setLineHeight(v: string) {
    const sel = window.getSelection();
    if (!sel?.anchorNode || !ref.current) return;
    let el: HTMLElement | null =
      sel.anchorNode instanceof HTMLElement ? sel.anchorNode : sel.anchorNode.parentElement;
    while (el && el !== ref.current && !/^(P|H1|H2|H3|LI|BLOCKQUOTE|DIV|TD)$/.test(el.tagName)) el = el.parentElement;
    if (el && el !== ref.current) {
      el.style.lineHeight = v;
      emit();
    }
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
    <div
      className={
        full
          ? "fixed inset-2 z-[70] flex flex-col overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-2xl md:inset-6"
          : "rounded-2xl border border-slate-200 bg-white"
      }
    >
      {/* ── แถบเครื่องมือ: ปุ่มกล่องเดี่ยว 2 แถว เรียงตามต้นแบบ ── */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-t-2xl border-b border-slate-200 bg-slate-50/80 px-2.5 py-2">
        {/* แถว 1 */}
        <button type="button" onClick={() => cmd("bold")} className={`${BOX} font-extrabold`} title="ตัวหนา">B</button>
        <button type="button" onClick={() => cmd("italic")} className={`${BOX} italic`} title="ตัวเอียง">I</button>
        <button type="button" onClick={() => cmd("underline")} className={`${BOX} underline`} title="ขีดเส้นใต้">U</button>
        <button type="button" onClick={() => cmd("strikeThrough")} className={`${BOX} line-through`} title="ขีดฆ่า">S</button>

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
        <Drop label={<span className="bg-slate-300/80 px-1 font-bold leading-none underline">A</span>} title="ไฮไลต์ข้อความ">
          {(close) => (
            <span className="flex w-32 flex-wrap gap-1">
              {HILITES.map((c) => (
                <button key={c} type="button" onClick={() => { cmd("hiliteColor", c); close(); }}
                  className="h-6 w-6 rounded-md ring-1 ring-slate-200 transition hover:scale-110" style={{ backgroundColor: c }} aria-label={c} />
              ))}
            </span>
          )}
        </Drop>

        <button type="button" onClick={() => cmd("justifyLeft")} className={BOX} title="ชิดซ้าย"><Ic d={IC.alignL} /></button>
        <button type="button" onClick={() => cmd("justifyCenter")} className={BOX} title="กึ่งกลาง"><Ic d={IC.alignC} /></button>
        <button type="button" onClick={() => cmd("justifyRight")} className={BOX} title="ชิดขวา"><Ic d={IC.alignR} /></button>
        <button type="button" onClick={() => cmd("justifyFull")} className={BOX} title="เต็มแนว"><Ic d={IC.alignJ} /></button>

        <button type="button" onClick={() => cmd("formatBlock", "<blockquote>")} className={`${BOX} font-serif text-xl font-bold leading-none`} title="คำพูด / ไฮไลต์ท่อน">
          &ldquo;
        </button>
        <button type="button" onClick={() => cmd("insertUnorderedList")} className={BOX} title="รายการจุด"><Ic d={IC.ul} /></button>
        <button type="button" onClick={() => cmd("insertOrderedList")} className={BOX} title="รายการตัวเลข">
          <Ic d="M5.5 3.5h8.5 M5.5 8h8.5 M5.5 12.5h8.5">
            <text x="1" y="5" fontSize="4.5" stroke="none" fill="currentColor">1</text>
            <text x="1" y="9.5" fontSize="4.5" stroke="none" fill="currentColor">2</text>
            <text x="1" y="14" fontSize="4.5" stroke="none" fill="currentColor">3</text>
          </Ic>
        </button>
        <button type="button" onClick={() => cmd("outdent")} className={BOX} title="ลดย่อหน้า"><Ic d={IC.outdent} /></button>
        <button type="button" onClick={() => cmd("indent")} className={BOX} title="เพิ่มย่อหน้า"><Ic d={IC.indent} /></button>

        {/* ── ขึ้นแถวที่ 2 ตายตัว ── */}
        <span className="basis-full" aria-hidden="true" />

        <select defaultValue="" onChange={(e) => { if (e.target.value) cmd("formatBlock", e.target.value); e.target.value = ""; }} className={`${SELBOX} w-24`} title="รูปแบบย่อหน้า">
          <option value="" disabled>ย่อหน้า</option>
          <option value="<p>">ข้อความปกติ</option>
          <option value="<h1>">หัวข้อหลัก (H1)</option>
          <option value="<h2>">หัวข้อใหญ่ (H2)</option>
          <option value="<h3>">หัวข้อรอง (H3)</option>
          <option value="<blockquote>">“ คำพูด</option>
        </select>
        <select defaultValue="" onChange={(e) => { if (e.target.value) cmd("fontName", e.target.value); e.target.value = ""; }} className={`${SELBOX} w-24`} title="ฟอนต์">
          <option value="" disabled>Prompt</option>
          <option value="Prompt">Prompt (ของเว็บ)</option>
          <option value="Sarabun">Sarabun</option>
          <option value="Arial">Arial</option>
          <option value="Georgia">Georgia</option>
          <option value="monospace">Monospace</option>
        </select>
        <Drop label={<Ic d={IC.lineH} />} title="ระยะห่างบรรทัด">
          {(close) => (
            <span className="flex w-32 flex-col gap-0.5 text-xs">
              {[["1.4", "ชิด"], ["1.7", "ปกติ"], ["2", "ห่าง"], ["2.4", "ห่างมาก"]].map(([v, l]) => (
                <button key={v} type="button" onClick={() => { setLineHeight(v); close(); }}
                  className="rounded-lg px-3 py-1.5 text-left font-semibold text-slate-600 transition hover:bg-slate-100">
                  {l} ({v})
                </button>
              ))}
            </span>
          )}
        </Drop>
        <select defaultValue="" onChange={(e) => { if (e.target.value) cmd("fontSize", e.target.value); e.target.value = ""; }} className={`${SELBOX} w-20`} title="ขนาดตัวอักษร">
          <option value="" disabled>16px</option>
          <option value="1">10px</option>
          <option value="2">13px</option>
          <option value="3">16px</option>
          <option value="4">18px</option>
          <option value="5">24px</option>
          <option value="6">32px</option>
        </select>

        <button
          type="button"
          onClick={() => { const url = prompt("ลิงก์ไปที่ (เช่น /products หรือ https://…)"); if (url) cmd("createLink", url); }}
          className={BOX} title="แทรกลิงก์"
        >
          <Ic d={IC.link} />
        </button>
        <button type="button" onClick={() => cmd("unlink")} className={BOX} title="เอาลิงก์ออก"><Ic d={IC.unlink} /></button>

        <label className={`${BOX} cursor-pointer`} title="อัปโหลดรูปจากเครื่อง (ลากมาวาง หรือ paste รูปในพื้นที่เขียนก็ได้)">
          {busy ? "⏳" : <PicIcon />}
          <input
            type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" disabled={busy}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void insertImage(f); }}
          />
        </label>
        <button type="button" onClick={() => { const url = prompt("วางลิงก์รูป (URL)"); if (url) cmd("insertImage", url); }} className={BOX} title="แทรกรูปจากลิงก์ URL">
          <PicIcon link />
        </button>
        <button type="button" onClick={insertYoutube} className={BOX} title="ฝังวิดีโอ YouTube"><VideoIcon /></button>
        <Drop label={<SmileIcon />} title="แทรกอีโมจิ">
          {(close) => (
            <span className="grid w-48 grid-cols-8 gap-0.5">
              {EMOJI.map((em) => (
                <button key={em} type="button" onClick={() => { cmd("insertText", em); close(); }}
                  className="rounded p-1 text-base transition hover:bg-slate-100">{em}</button>
              ))}
            </span>
          )}
        </Drop>

        <button
          type="button"
          onClick={() => setFull((v) => !v)}
          className={`${BOX} ${full ? "bg-slate-800 text-white hover:bg-slate-700" : ""}`}
          title={full ? "ออกจากโหมดเต็มจอ" : "ขยายเต็มจอ"}
        >
          <Ic d={IC.full} />
        </button>
        <Drop label={<TableIcon />} title="แทรกตาราง">
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

        <button type="button" onClick={() => cmd("removeFormat")} className={`${BOX} text-xs font-bold`} title="ล้างรูปแบบข้อความที่เลือก">
          <span className="italic">T</span>ₓ
        </button>
        <button
          type="button"
          onClick={toggleSource}
          className={`${BOX} text-xs font-bold ${srcMode ? "bg-slate-800 text-white hover:bg-slate-700" : ""}`}
          title="ดู/แก้โค้ด HTML"
        >
          &lt;&gt;
        </button>
      </div>

      {/* ── โหมดโค้ด HTML ── */}
      {srcMode && (
        <textarea
          value={srcText}
          onChange={(e) => { setSrcText(e.target.value); onChange(e.target.value); }}
          rows={18}
          className={`w-full resize-y bg-slate-900 px-4 py-3 font-mono text-xs leading-relaxed text-emerald-200 outline-none ${full ? "flex-1 resize-none" : ""}`}
          spellCheck={false}
        />
      )}

      {/* ── พื้นที่เขียน (สไตล์เดียวกับหน้าเว็บจริง) — ลากมุมล่างขยายได้ ── */}
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
        className={`min-h-72 resize-y overflow-auto rounded-b-2xl px-4 py-3 outline-none ${ARTICLE_PROSE} ${srcMode ? "hidden" : full ? "flex-1 resize-none" : ""}`}
        data-placeholder="พิมพ์เนื้อหาบทความที่นี่… เลือกข้อความแล้วกดปุ่มด้านบนเพื่อจัดรูปแบบ"
      />
    </div>
  );
}
