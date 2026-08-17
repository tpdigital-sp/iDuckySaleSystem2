"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyleKit } from "@tiptap/extension-text-style";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import Youtube from "@tiptap/extension-youtube";
import { TableKit } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import { ARTICLE_PROSE } from "@/components/ArticleHtml";

/**
 * ✍️ ตัวเขียนบทความแบบ Rich Text (TipTap / ProseMirror) — หน้าตา/ลำดับปุ่มตามบล็อก lnwshop (TinyMCE)
 * แถว 1: B I U S · สี/ไฮไลต์ · จัดวาง 4 แบบ · “ quote · รายการจุด/ตัวเลข · ย่อหน้าออก-เข้า
 * แถว 2: ย่อหน้า · ฟอนต์ · ระยะบรรทัด · ขนาด · ลิงก์/เอาออก · รูปอัป/รูป URL/YouTube/อีโมจิ · เต็มจอ/ตาราง · Tx · <>
 * ปุ่มโชว์สถานะ active ตามตำแหน่งเคอร์เซอร์ · ดรอปดาวน์โชว์ค่าปัจจุบัน · undo/redo (Cmd+Z)
 * เก็บเป็น HTML เหมือนเดิม (ฝั่งเซิร์ฟเวอร์กรองแท็กอันตราย — iframe อนุญาตเฉพาะ YouTube)
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

/* ── ปุ่มกล่องเดี่ยวแบบต้นแบบ: ขาว ขอบเทา เงาบาง · on = กำลังใช้อยู่ ── */
const BOX =
  "grid h-10 min-w-10 place-items-center rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-700 shadow-[0_1px_1px_rgba(15,23,42,.05)] transition hover:bg-slate-100 active:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40";
const ON = "!border-sky-400 !bg-sky-50 !text-sky-700 ring-1 ring-sky-200";
const SELBOX =
  "h-10 cursor-pointer rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700 shadow-[0_1px_1px_rgba(15,23,42,.05)] outline-none transition hover:bg-slate-50";

/** ไอคอนเส้น SVG — คมและหน้าตาเหมือนกันทุกเครื่อง */
function Ic({ d, children }: { d?: string; children?: ReactNode }) {
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
  undo: "M5 6H2.5V3.5 M2.8 6.2A5.2 5.2 0 1 1 3.5 10.5",
  redo: "M11 6h2.5V3.5 M13.2 6.2A5.2 5.2 0 1 0 12.5 10.5",
};
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
function Drop({ label, title, on, children }: { label: ReactNode; title: string; on?: boolean; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen((v) => !v)} className={`${BOX} grid-flow-col gap-0.5 ${on ? ON : ""}`} title={title}>
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
const FONTS = [["Prompt", "Prompt (ของเว็บ)"], ["Sarabun", "Sarabun"], ["Arial", "Arial"], ["Georgia", "Georgia"], ["monospace", "Monospace"]];
const SIZES = ["10px", "13px", "16px", "18px", "24px", "32px"];
const LINE_H = [["1.4", "ชิด"], ["1.7", "ปกติ"], ["2", "ห่าง"], ["2.4", "ห่างมาก"]];

/** ปุ่ม toolbar — onMouseDown preventDefault กัน editor เสีย selection ตอนกด */
function TB({ on, title, onClick, className = "", disabled, children }: { on?: boolean; title: string; onClick: () => void; className?: string; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" title={title} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={onClick} aria-pressed={on} className={`${BOX} ${className} ${on ? ON : ""}`}>
      {children}
    </button>
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
  const [busy, setBusy] = useState(false);
  const [srcMode, setSrcMode] = useState(false);
  const [srcText, setSrcText] = useState("");
  const [full, setFull] = useState(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor({
    immediatelyRender: false, // Next.js: ไม่ render ฝั่งเซิร์ฟเวอร์ กัน hydration mismatch
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true, defaultProtocol: "https", HTMLAttributes: { rel: "noopener noreferrer" } },
      }),
      TextStyleKit, // สี · ฟอนต์ · ขนาด · ระยะบรรทัด · พื้นหลัง (เก็บเป็น <span style="…">)
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Highlight.configure({ multicolor: true }),
      Image.configure({ inline: false, allowBase64: false }),
      Youtube.configure({ nocookie: true, width: 640, height: 360, HTMLAttributes: { style: "width:100%;aspect-ratio:16/9;height:auto;border:0;border-radius:16px" } }),
      TableKit.configure({ table: { resizable: false } }),
      Placeholder.configure({ placeholder: "พิมพ์เนื้อหาบทความที่นี่… เลือกข้อความแล้วกดปุ่มด้านบนเพื่อจัดรูปแบบ" }),
    ],
    content: initialHtml || "",
    editorProps: {
      attributes: {
        class: `tiptap min-h-72 px-4 py-3 outline-none ${ARTICLE_PROSE}`,
      },
      // ลากรูป/วางรูปจากคลิปบอร์ด → อัปโหลดแล้วแทรกเป็นรูป (ไม่เอา base64 ยัดในบทความ)
      handleDrop: (_view, e) => {
        const f = e.dataTransfer?.files?.[0];
        if (f && f.type.startsWith("image/")) {
          e.preventDefault();
          void insertImage(f);
          return true;
        }
        return false;
      },
      handlePaste: (_view, e) => {
        const f = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith("image/"))?.getAsFile();
        if (f) {
          e.preventDefault();
          void insertImage(f);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => onChangeRef.current(editor.isEmpty ? "" : editor.getHTML()),
  });

  // สถานะปุ่ม/ค่าดรอปดาวน์ตามตำแหน่งเคอร์เซอร์ — re-render เฉพาะตอนค่าที่สนใจเปลี่ยน
  const st = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      if (!e) return null;
      const attrs = e.getAttributes("textStyle") as { fontFamily?: string; fontSize?: string; lineHeight?: string; color?: string };
      return {
        bold: e.isActive("bold"),
        italic: e.isActive("italic"),
        underline: e.isActive("underline"),
        strike: e.isActive("strike"),
        left: e.isActive({ textAlign: "left" }),
        center: e.isActive({ textAlign: "center" }),
        right: e.isActive({ textAlign: "right" }),
        justify: e.isActive({ textAlign: "justify" }),
        quote: e.isActive("blockquote"),
        ul: e.isActive("bulletList"),
        ol: e.isActive("orderedList"),
        link: e.isActive("link"),
        highlight: e.isActive("highlight"),
        color: !!attrs.color,
        inTable: e.isActive("table"),
        canUndo: e.can().undo(),
        canRedo: e.can().redo(),
        block: e.isActive("heading", { level: 1 }) ? "h1" : e.isActive("heading", { level: 2 }) ? "h2" : e.isActive("heading", { level: 3 }) ? "h3" : e.isActive("blockquote") ? "quote" : "p",
        font: attrs.fontFamily ?? "",
        size: attrs.fontSize ?? "",
        lineH: attrs.lineHeight ?? "",
      };
    },
  });

  // โหมดเต็มจอ: ล็อกสกรอลหน้าเบื้องหลังไว้
  useEffect(() => {
    document.body.style.overflow = full ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [full]);

  async function insertImage(f: File) {
    if (!f.type.startsWith("image/") || !editor) return;
    setBusy(true);
    const url = await uploadImage(f);
    setBusy(false);
    if (url) editor.chain().focus().setImage({ src: url }).run();
    else alert("อัปโหลดรูปไม่สำเร็จ ลองใหม่อีกครั้ง");
  }

  function insertYoutube() {
    const url = prompt("วางลิงก์วิดีโอ YouTube");
    if (!url || !editor) return;
    if (!/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{6,})/.test(url)) {
      alert("ลิงก์ YouTube ไม่ถูกต้อง — วางลิงก์เต็มจากช่องแชร์ของ YouTube");
      return;
    }
    editor.chain().focus().setYoutubeVideo({ src: url }).run();
  }

  function setLink() {
    if (!editor) return;
    const prev = (editor.getAttributes("link") as { href?: string }).href ?? "";
    const url = prompt("ลิงก์ไปที่ (เช่น /products หรือ https://…)", prev);
    if (url === null) return;
    if (!url.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }

  function toggleSource() {
    if (!editor) return;
    if (srcMode) {
      editor.commands.setContent(srcText, { emitUpdate: true });
      setSrcMode(false);
    } else {
      setSrcText(editor.getHTML());
      setSrcMode(true);
    }
  }

  const E = (): Editor | null => editor;
  const c = () => E()?.chain().focus();

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
        <TB on={st?.bold} title="ตัวหนา (⌘B)" onClick={() => c()?.toggleBold().run()} className="font-extrabold">B</TB>
        <TB on={st?.italic} title="ตัวเอียง (⌘I)" onClick={() => c()?.toggleItalic().run()} className="italic">I</TB>
        <TB on={st?.underline} title="ขีดเส้นใต้ (⌘U)" onClick={() => c()?.toggleUnderline().run()} className="underline">U</TB>
        <TB on={st?.strike} title="ขีดฆ่า" onClick={() => c()?.toggleStrike().run()} className="line-through">S</TB>

        <Drop label={<span className="border-b-[3px] border-rose-500 font-bold leading-none">A</span>} title="สีตัวอักษร" on={st?.color}>
          {(close) => (
            <span className="flex w-40 flex-wrap gap-1">
              {COLORS.map((col) => (
                <button key={col} type="button" onClick={() => { c()?.setColor(col).run(); close(); }}
                  className="h-6 w-6 rounded-md ring-1 ring-slate-200 transition hover:scale-110" style={{ backgroundColor: col }} aria-label={col} />
              ))}
              <button type="button" onClick={() => { c()?.unsetColor().run(); close(); }} className="mt-1 w-full rounded-lg px-2 py-1 text-left text-[11px] font-semibold text-slate-500 hover:bg-slate-100">ล้างสี</button>
            </span>
          )}
        </Drop>
        <Drop label={<span className="bg-slate-300/80 px-1 font-bold leading-none underline">A</span>} title="ไฮไลต์ข้อความ" on={st?.highlight}>
          {(close) => (
            <span className="flex w-32 flex-wrap gap-1">
              {HILITES.map((col) => (
                <button key={col} type="button" onClick={() => { c()?.setHighlight({ color: col }).run(); close(); }}
                  className="h-6 w-6 rounded-md ring-1 ring-slate-200 transition hover:scale-110" style={{ backgroundColor: col }} aria-label={col} />
              ))}
              <button type="button" onClick={() => { c()?.unsetHighlight().run(); close(); }} className="mt-1 w-full rounded-lg px-2 py-1 text-left text-[11px] font-semibold text-slate-500 hover:bg-slate-100">เอาไฮไลต์ออก</button>
            </span>
          )}
        </Drop>

        <TB on={st?.left} title="ชิดซ้าย" onClick={() => c()?.setTextAlign("left").run()}><Ic d={IC.alignL} /></TB>
        <TB on={st?.center} title="กึ่งกลาง" onClick={() => c()?.setTextAlign("center").run()}><Ic d={IC.alignC} /></TB>
        <TB on={st?.right} title="ชิดขวา" onClick={() => c()?.setTextAlign("right").run()}><Ic d={IC.alignR} /></TB>
        <TB on={st?.justify} title="เต็มแนว" onClick={() => c()?.setTextAlign("justify").run()}><Ic d={IC.alignJ} /></TB>

        <TB on={st?.quote} title="คำพูด / ไฮไลต์ท่อน" onClick={() => c()?.toggleBlockquote().run()} className="font-serif text-xl font-bold leading-none">&ldquo;</TB>
        <TB on={st?.ul} title="รายการจุด" onClick={() => c()?.toggleBulletList().run()}><Ic d={IC.ul} /></TB>
        <TB on={st?.ol} title="รายการตัวเลข" onClick={() => c()?.toggleOrderedList().run()}>
          <Ic d="M5.5 3.5h8.5 M5.5 8h8.5 M5.5 12.5h8.5">
            <text x="1" y="5" fontSize="4.5" stroke="none" fill="currentColor">1</text>
            <text x="1" y="9.5" fontSize="4.5" stroke="none" fill="currentColor">2</text>
            <text x="1" y="14" fontSize="4.5" stroke="none" fill="currentColor">3</text>
          </Ic>
        </TB>
        <TB title="ลดย่อหน้า (ออกจากรายการย่อย)" onClick={() => c()?.liftListItem("listItem").run()}><Ic d={IC.outdent} /></TB>
        <TB title="เพิ่มย่อหน้า (ทำเป็นรายการย่อย)" onClick={() => c()?.sinkListItem("listItem").run()}><Ic d={IC.indent} /></TB>
        <TB title="ย้อนกลับ (⌘Z)" onClick={() => c()?.undo().run()} disabled={!st?.canUndo}><Ic d={IC.undo} /></TB>
        <TB title="ทำซ้ำ (⇧⌘Z)" onClick={() => c()?.redo().run()} disabled={!st?.canRedo}><Ic d={IC.redo} /></TB>

        {/* ── ขึ้นแถวที่ 2 ตายตัว ── */}
        <span className="basis-full" aria-hidden="true" />

        <select
          value={st?.block ?? "p"}
          onChange={(e) => {
            const v = e.target.value;
            const ch = c();
            if (!ch) return;
            if (v === "p") ch.setParagraph().run();
            else if (v === "quote") ch.toggleBlockquote().run();
            else ch.toggleHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 }).run();
          }}
          className={`${SELBOX} w-28`}
          title="รูปแบบย่อหน้า"
        >
          <option value="p">ข้อความปกติ</option>
          <option value="h1">หัวข้อหลัก (H1)</option>
          <option value="h2">หัวข้อใหญ่ (H2)</option>
          <option value="h3">หัวข้อรอง (H3)</option>
          <option value="quote">“ คำพูด</option>
        </select>
        <select
          value={st?.font ?? ""}
          onChange={(e) => (e.target.value ? c()?.setFontFamily(e.target.value).run() : c()?.unsetFontFamily().run())}
          className={`${SELBOX} w-28`}
          title="ฟอนต์"
        >
          <option value="">Prompt (ของเว็บ)</option>
          {FONTS.filter(([v]) => v !== "Prompt").map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <Drop label={<Ic d={IC.lineH} />} title="ระยะห่างบรรทัด" on={!!st?.lineH}>
          {(close) => (
            <span className="flex w-32 flex-col gap-0.5 text-xs">
              {LINE_H.map(([v, l]) => (
                <button key={v} type="button" onClick={() => { c()?.setLineHeight(v).run(); close(); }}
                  className={`rounded-lg px-3 py-1.5 text-left font-semibold transition hover:bg-slate-100 ${st?.lineH === v ? "bg-sky-50 text-sky-700" : "text-slate-600"}`}>
                  {l} ({v})
                </button>
              ))}
              <button type="button" onClick={() => { c()?.unsetLineHeight().run(); close(); }} className="rounded-lg px-3 py-1.5 text-left text-[11px] font-semibold text-slate-500 hover:bg-slate-100">ค่าเริ่มต้น</button>
            </span>
          )}
        </Drop>
        <select
          value={st?.size ?? ""}
          onChange={(e) => (e.target.value ? c()?.setFontSize(e.target.value).run() : c()?.unsetFontSize().run())}
          className={`${SELBOX} w-20`}
          title="ขนาดตัวอักษร"
        >
          <option value="">16px</option>
          {SIZES.filter((s) => s !== "16px").map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <TB on={st?.link} title="แทรก/แก้ลิงก์" onClick={setLink}><Ic d={IC.link} /></TB>
        <TB title="เอาลิงก์ออก" onClick={() => c()?.extendMarkRange("link").unsetLink().run()} disabled={!st?.link}><Ic d={IC.unlink} /></TB>

        <label className={`${BOX} cursor-pointer`} title="อัปโหลดรูปจากเครื่อง (ลากมาวาง หรือ paste รูปในพื้นที่เขียนก็ได้)">
          {busy ? "⏳" : <PicIcon />}
          <input
            type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" disabled={busy}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void insertImage(f); }}
          />
        </label>
        <TB title="แทรกรูปจากลิงก์ URL" onClick={() => { const url = prompt("วางลิงก์รูป (URL)"); if (url) c()?.setImage({ src: url.trim() }).run(); }}>
          <PicIcon link />
        </TB>
        <TB title="ฝังวิดีโอ YouTube" onClick={insertYoutube}><VideoIcon /></TB>
        <Drop label={<SmileIcon />} title="แทรกอีโมจิ">
          {(close) => (
            <span className="grid w-48 grid-cols-8 gap-0.5">
              {EMOJI.map((em) => (
                <button key={em} type="button" onClick={() => { c()?.insertContent(em).run(); close(); }}
                  className="rounded p-1 text-base transition hover:bg-slate-100">{em}</button>
              ))}
            </span>
          )}
        </Drop>

        <TB title={full ? "ออกจากโหมดเต็มจอ" : "ขยายเต็มจอ"} onClick={() => setFull((v) => !v)} className={full ? "!bg-slate-800 !text-white hover:!bg-slate-700" : ""}>
          <Ic d={IC.full} />
        </TB>
        <Drop label={<TableIcon />} title="ตาราง" on={st?.inTable}>
          {(close) => (
            <span className="flex w-44 flex-col gap-0.5 text-xs">
              {st?.inTable ? (
                <>
                  {[
                    ["+ แถวด้านล่าง", () => c()?.addRowAfter().run()],
                    ["+ คอลัมน์ด้านขวา", () => c()?.addColumnAfter().run()],
                    ["− ลบแถวนี้", () => c()?.deleteRow().run()],
                    ["− ลบคอลัมน์นี้", () => c()?.deleteColumn().run()],
                    ["สลับหัวตาราง", () => c()?.toggleHeaderRow().run()],
                    ["✕ ลบตารางทั้งหมด", () => c()?.deleteTable().run()],
                  ].map(([l, fn]) => (
                    <button key={l as string} type="button" onClick={() => { (fn as () => void)(); close(); }}
                      className="rounded-lg px-3 py-1.5 text-left font-semibold text-slate-600 transition hover:bg-slate-100">{l as string}</button>
                  ))}
                </>
              ) : (
                [[2, 2], [3, 2], [3, 3], [4, 3]].map(([r, cl]) => (
                  <button key={`${r}x${cl}`} type="button" onClick={() => { c()?.insertTable({ rows: r, cols: cl, withHeaderRow: true }).run(); close(); }}
                    className="rounded-lg px-3 py-1.5 text-left font-semibold text-slate-600 transition hover:bg-slate-100">
                    ▦ {r} แถว × {cl} ช่อง
                  </button>
                ))
              )}
            </span>
          )}
        </Drop>

        <TB title="ล้างรูปแบบข้อความที่เลือก" onClick={() => c()?.unsetAllMarks().clearNodes().run()} className="text-xs font-bold">
          <span className="italic">T</span>ₓ
        </TB>
        <TB title="ดู/แก้โค้ด HTML" onClick={toggleSource} on={srcMode} className="text-xs font-bold">&lt;&gt;</TB>
      </div>

      {/* ── โหมดโค้ด HTML ── */}
      {srcMode ? (
        <textarea
          value={srcText}
          onChange={(e) => { setSrcText(e.target.value); onChange(e.target.value); }}
          rows={18}
          className={`w-full resize-y rounded-b-2xl bg-slate-900 px-4 py-3 font-mono text-xs leading-relaxed text-emerald-200 outline-none ${full ? "flex-1 resize-none" : ""}`}
          spellCheck={false}
        />
      ) : (
        /* ── พื้นที่เขียน (สไตล์เดียวกับหน้าเว็บจริง) — ลากมุมล่างขยายได้ ── */
        <div className={`resize-y overflow-auto rounded-b-2xl ${full ? "flex-1 resize-none" : "max-h-[75vh]"}`}>
          <EditorContent editor={editor} className="min-h-72" />
        </div>
      )}
    </div>
  );
}
