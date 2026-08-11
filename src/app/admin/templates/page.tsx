"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import RequirePerm from "@/components/RequirePerm";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import SlotEditor from "@/components/admin/SlotEditor";
import {
  DEFAULT_BLEED_MM,
  DEFAULT_SAFE_MM,
  fileHref,
  fileReady,
  formatFileSize,
  groupByCategory,
  guessChoice,
  NO_CATEGORY,
  normalizeTemplate,
  slotsOf,
  templateCategories,
  templateFiles,
  TEMPLATE_MAX_MB,
  type DesignTemplate,
  type TemplateFile,
} from "@/lib/design-templates";
import {
  deleteTemplate,
  fetchTemplateCategories,
  fetchTemplates,
  persistTemplate,
  persistTemplateCategories,
  uploadTemplateFile,
} from "@/lib/template-repo";
import { fetchProduct, fetchProductNamesLite, fetchProductRaw, persistProduct } from "@/lib/product-repo";
import { canThumbnail, readDesignSizeMm, thumbnailFromDesignFile } from "@/lib/ai-thumbnail";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  badge,
  brandCard,
  brandHero,
  brandStrip,
  btnDucky,
  btnNeutral,
  btnPrimary,
  btnSmDanger,
  btnSmDucky,
  btnSmGhost,
  btnSmNeutral,
  card,
  categoryTone,
  chipBrand,
  chipDucky,
  chipMuted,
  faint,
  h1,
  muted,
  navItemActive,
  navItemIdle,
} from "@/lib/admin-ui";

const input =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-slate-100";
const inputSm =
  "rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 focus:border-amber-400 focus:outline-none";

type Draft = DesignTemplate & { _dirty?: boolean };

const rid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;

/**
 * ไอคอนประจำชุดเทมเพลต — "อาร์ตบอร์ด + เส้นตัดมุม" สื่อถึงไฟล์งานไดคัท
 * ใช้แทนรูปย่อจากไฟล์ .ai ตรงหัวการ์ด เพราะงานไดคัทเป็นเส้นบาง พอย่อเหลือ 40px แล้วจางจนไม่เห็น
 * (รูปจริงยังโชว์ในแถวไฟล์ที่ขนาดพอดี และบนหน้าสินค้า)
 * ระบายด้วยสีประจำหมวด → กวาดตาแยกหมวดได้จากไอคอนเลย
 */
function TemplateIcon({ tone, size = 40 }: { tone: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden
      className="shrink-0"
      style={{ color: tone }}
    >
      <rect width="40" height="40" rx="11" fill="currentColor" opacity="0.14" />
      {/* อาร์ตบอร์ด */}
      <rect x="11" y="9" width="18" height="22" rx="3" fill="#fff" stroke="currentColor" strokeWidth="1.6" />
      {/* พื้นที่พิมพ์ด้านใน (เส้นประ) */}
      <rect
        x="14.5"
        y="12.5"
        width="11"
        height="15"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeDasharray="2.4 2"
        opacity="0.75"
      />
      {/* เส้นตัดมุม */}
      <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.9">
        <path d="M7 9h2.5M8.2 7.8v2.4" />
        <path d="M30.5 9H33M31.8 7.8v2.4" />
        <path d="M7 31h2.5M8.2 29.8v2.4" />
        <path d="M30.5 31H33M31.8 29.8v2.4" />
      </g>
    </svg>
  );
}

function AdminTemplatesInner() {
  /** กล่องยืนยันของระบบเอง — แทน confirm() ของเบราว์เซอร์ */
  const { confirm: askConfirm, dialog: confirmDialog } = useConfirm();
  const [list, setList] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  /** เทมเพลตที่กำลังอัปโหลดอยู่ → "3 ไฟล์" ฯลฯ */
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  /** การ์ดที่กางอยู่ (คลังไฟล์เยอะ — ค่าเริ่มต้นยุบหมด เห็นภาพรวมก่อน) */
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [dropOn, setDropOn] = useState<string | null>(null);
  /** ปุ่มสกินที่กำลังถูกลากไฟล์มาจ่ออยู่ — "<template>:<file|set>" */
  const [skinDrop, setSkinDrop] = useState<string | null>(null);
  const [usedBy, setUsedBy] = useState<Record<string, { id: string; name: string }[]>>({});
  /** รายชื่อสินค้าทั้งร้าน (id + ชื่อ) — ให้เลือก "สินค้าอ้างอิง" ตอนผูกไฟล์กับตัวเลือก */
  const [productList, setProductList] = useState<{ id: string; name: string }[]>([]);
  /**
   * ตัวเลือกของ "สินค้าอ้างอิง" แต่ละตัว (โหลดทีละสินค้าเมื่อเลือก — เบากว่าดึงทั้งร้าน)
   * productId → [{ label, choices }]
   */
  const [prodOpts, setProdOpts] = useState<Record<string, { label: string; choices: string[] }[]>>({});
  const [optsBusy, setOptsBusy] = useState<string | null>(null);
  /** ช่องค้นหาสินค้าในการ์ด (สินค้ามี 300+ ตัว เลื่อนหาในดรอปดาวน์ไม่ไหว) */
  const [prodQ, setProdQ] = useState<Record<string, string>>({});
  /** การ์ดที่กำลังเปิดลิสต์ค้นหาสินค้าอยู่ */
  const [prodOpen, setProdOpen] = useState<string | null>(null);
  /** ไฟล์ที่ระบบกำลังทำรูปตัวอย่างให้อยู่ — โชว์เป็นช่องกะพริบแทนรูป ไม่มีปุ่มให้กด */
  const [thumbBusy, setThumbBusy] = useState<string | null>(null);
  /** ชุดที่กำลังเปิดหน้าต่างตั้งค่า Theme อยู่ (เก็บเป็น id — ข้อมูลอ่านสด ๆ จาก list) */
  const [themeOn, setThemeOn] = useState<string | null>(null);
  /**
   * ไฟล์ (= ด้าน) ที่กำลังตั้งช่องอยู่ในหน้าต่าง Theme
   * null = ตั้งของ "ทั้งชุด" ซึ่งไฟล์ที่ไม่ได้ตั้งของตัวเองจะใช้ผังนี้
   */
  const [themeFile, setThemeFile] = useState<string | null>(null);
  /** ชุดที่ไล่เติมรูปย้อนหลังไปแล้ว — กันทำซ้ำทุกครั้งที่กางการ์ด */
  const backfilled = useRef<Set<string>>(new Set());
  /** ความคืบหน้าตอนโยนไฟล์ทีเดียวหลายไฟล์ */
  const [bulk, setBulk] = useState<{ done: number; total: number; name: string } | null>(null);
  const [bulkDrag, setBulkDrag] = useState(false);
  /** ชุดที่เติม "ขนาดงานจริง" ย้อนหลังไปแล้ว (ทำครั้งเดียวต่อรอบเปิดหน้า) */
  const sizeFilled = useRef<Set<string>>(new Set());
  /** รูปที่กำลังเปิดดูขนาดใหญ่ */
  const [zoom, setZoom] = useState<{ src: string; name: string } | null>(null);
  /** ชุดที่กำลังลากจัดลำดับ (เก็บเป็น id — ลิสต์ที่เห็นถูกกรอง/จัดกลุ่ม ใช้ index ไม่ได้) */
  const dragId = useRef<string | null>(null);
  const [dragAt, setDragAt] = useState<string | null>(null);
  /** ตัวกรองหมวด ("" = ทุกหมวด) */
  const [cat, setCat] = useState("");
  /** รายชื่อหมวดที่แอดมินตั้งไว้ (จัดลำดับเองได้ · หมวดว่างก็เก็บไว้ได้) */
  const [catList, setCatList] = useState<string[]>([]);
  /** แท็บบนสุด — แยก "เทมเพลต" กับ "หมวดหมู่" ออกจากกัน (เดิมพาเนลหมวดกางทับดันเนื้อหาลงไปทั้งหน้า) */
  const [tab, setTab] = useState<"templates" | "cats">("templates");
  const [newCat, setNewCat] = useState("");

  async function refresh() {
    setLoading(true);
    const [tpls, products, cats] = await Promise.all([
      fetchTemplates(),
      fetchProductNamesLite(),
      fetchTemplateCategories(),
    ]);
    setList(tpls.map((t) => ({ ...normalizeTemplate(t) })));
    setCatList(cats);
    const by: Record<string, { id: string; name: string }[]> = {};
    for (const p of products)
      for (const id of p.templateIds ?? []) (by[id] ??= []).push({ id: p.id, name: p.name });
    setUsedBy(by);
    setProductList(products.map((p) => ({ id: p.id, name: p.name })));
    setLoading(false);
  }
  useEffect(() => {
    void refresh();
  }, []);

  /** กด Esc ปิดรูปที่เปิดดูอยู่ */
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoom(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);

  useEffect(() => {
    if (!themeOn) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setThemeOn(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [themeOn]);

  /** โหลดตัวเลือกของสินค้าอ้างอิงตัวหนึ่ง (ครั้งเดียวต่อสินค้า) */
  async function ensureProductOptions(pid: string) {
    if (!pid || prodOpts[pid] || optsBusy === pid) return;
    setOptsBusy(pid);
    const p = await fetchProduct(pid);
    const groups = (p?.options ?? [])
      .map((o) => ({
        label: o.label?.trim() ?? "",
        choices: (o.choices ?? []).map((c) => c.name?.trim()).filter((n): n is string => !!n),
      }))
      .filter((g) => g.label && g.choices.length);
    setProdOpts((cur) => ({ ...cur, [pid]: groups }));
    setOptsBusy(null);
  }
  /** โหลดตัวเลือกของสินค้าอ้างอิงที่ชุดต่าง ๆ ตั้งไว้แล้ว (ตอนกางการ์ด) */
  useEffect(() => {
    for (const t of list) if (t.optionProductId) void ensureProductOptions(t.optionProductId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.length]);

  function patch(id: string, p: Partial<Draft>) {
    setList((cur) => cur.map((t) => (t.id === id ? { ...t, ...p, _dirty: true } : t)));
  }

  // ── จัดการหมวดหมู่ ──
  async function saveCats(next: string[]) {
    setCatList(next);
    const res = await persistTemplateCategories(next);
    if (!res.ok) setError(res.error ?? "บันทึกหมวดไม่สำเร็จ");
  }
  async function addCat() {
    const name = newCat.trim();
    if (!name) return;
    if (catList.includes(name)) return setError(`มีหมวด “${name}” อยู่แล้ว`);
    setNewCat("");
    await saveCats([...catList, name]);
  }
  /** เปลี่ยนชื่อหมวด — ต้องไล่อัปเดตทุกชุดที่ใช้ชื่อเดิมด้วย ไม่งั้นชุดจะหลุดไปกองรวม */
  async function renameCat(from: string) {
    const to = prompt(`เปลี่ยนชื่อหมวด “${from}” เป็น`, from)?.trim();
    if (!to || to === from) return;
    if (catList.includes(to)) return setError(`มีหมวด “${to}” อยู่แล้ว`);
    await saveCats(catList.map((c) => (c === from ? to : c)));
    const affected = list.filter((t) => t.category?.trim() === from);
    setList((cur) => cur.map((t) => (t.category?.trim() === from ? { ...t, category: to } : t)));
    for (const t of affected) {
      const { _dirty, ...clean } = t;
      void _dirty;
      await persistTemplate({ ...clean, category: to });
    }
  }
  async function removeCat(name: string) {
    const affected = list.filter((t) => t.category?.trim() === name);
    const ok = await askConfirm({
      icon: "🗂",
      title: `ลบหมวด “${name}”?`,
      detail: affected.length
        ? `${affected.length} ชุดที่อยู่ในหมวดนี้จะย้ายไปหมวด “${NO_CATEGORY}”\nตัวชุดและไฟล์ข้างในไม่หาย`
        : "หมวดนี้ยังไม่มีชุดเทมเพลตอยู่",
      confirmLabel: "ลบหมวด",
      danger: true,
    });
    if (!ok) return;
    await saveCats(catList.filter((c) => c !== name));
    if (affected.length) {
      setList((cur) => cur.map((t) => (t.category?.trim() === name ? { ...t, category: undefined } : t)));
      for (const t of affected) {
        const { _dirty, ...clean } = t;
        void _dirty;
        await persistTemplate({ ...clean, category: undefined });
      }
    }
    if (cat === name) setCat("");
  }
  async function moveCat(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= catList.length) return;
    const next = [...catList];
    [next[i], next[j]] = [next[j], next[i]];
    await saveCats(next);
  }
  function patchFile(tid: string, fid: string, p: Partial<TemplateFile>) {
    setList((cur) =>
      cur.map((t) =>
        t.id === tid
          ? // ชุดรุ่นเก่ายังไม่มี files[] จริง — ต้องกาง normalizeTemplate ก่อน ไม่งั้นแก้แล้วหายเงียบ ๆ
            { ...t, files: templateFiles(t).map((f) => (f.id === fid ? { ...f, ...p } : f)), _dirty: true }
          : t
      )
    );
  }

  async function save(t: Draft) {
    setSaving(t.id);
    setError("");
    const { _dirty, fileUrl, fileName, fileSize, linkUrl, ...clean } = t;
    void _dirty;
    void fileUrl;
    void fileName;
    void fileSize;
    void linkUrl; // ฟิลด์รุ่นเก่า — แปลงเข้า files[] แล้ว ไม่ต้องเก็บซ้ำ
    const res = await persistTemplate(clean);
    setSaving(null);
    if (!res.ok) return setError(res.error ?? "บันทึกไม่สำเร็จ");
    setList((cur) => cur.map((x) => (x.id === t.id ? { ...x, _dirty: false } : x)));
  }

  async function remove(t: Draft) {
    const used = usedBy[t.id] ?? [];
    const files = templateFiles(t).length;
    const ok = await askConfirm({
      icon: "🗑",
      title: `ลบชุด “${t.name || "(ยังไม่ตั้งชื่อ)"}”?`,
      detail: [
        files ? `ไฟล์ในชุด ${files} ไฟล์จะถูกลบออกจากคลังถาวร (รวมรูปตัวอย่างและสกิน)` : "ชุดนี้ยังไม่มีไฟล์",
        used.length
          ? `⚠️ มี ${used.length} สินค้าผูกชุดนี้อยู่ — ${used
              .slice(0, 3)
              .map((u) => u.name)
              .join(" · ")}${used.length > 3 ? " …" : ""}\nหน้าสินค้าจะไม่มีเทมเพลตให้ลูกค้าโหลดอีก`
          : "",
        "กู้คืนไม่ได้",
      ]
        .filter(Boolean)
        .join("\n\n"),
      confirmLabel: "ลบชุดนี้",
      danger: true,
    });
    if (!ok) return;
    const res = await deleteTemplate(t.id);
    if (!res.ok) return setError(res.error ?? "ลบไม่สำเร็จ");
    setList((cur) => cur.filter((x) => x.id !== t.id));
  }

  /**
   * 🔗 ผูกชุดนี้เข้ากับ "สินค้าที่เลือกไว้ในช่อง 1️⃣" ให้เลย
   *
   * ทำไมต้องมี: เลือกสินค้าตรงนั้นเป็นแค่การ "ยืมกลุ่มตัวเลือก" มาแยกไฟล์ ไม่ได้แปลว่าผูกกับสินค้า
   * ทีมงานเลยตั้งค่าครบแล้วแต่หน้าสินค้าไม่ขึ้นเทมเพลต ต้องไปกดติ๊กในหน้าแก้ไขสินค้าอีกที
   * ปุ่มนี้ย่อขั้นตอนนั้นให้เหลือคลิกเดียว (เขียน templateIds ลงในตัวสินค้า)
   */
  async function linkToProduct(t: Draft) {
    const pid = t.optionProductId;
    if (!pid) return;
    if (t._dirty) await save(t); // ชุดที่ยังไม่บันทึกยังไม่มีในฐาน ผูกไปก็ชี้ไม่เจอ
    setBusy((b) => ({ ...b, [t.id]: "ผูกสินค้า" }));
    const clear = () =>
      setBusy((b) => {
        const n = { ...b };
        delete n[t.id];
        return n;
      });
    const p = await fetchProductRaw(pid);
    if (!p) {
      clear();
      return setError("โหลดข้อมูลสินค้าไม่สำเร็จ");
    }
    const ids = p.templateIds ?? [];
    if (ids.includes(t.id)) {
      clear();
      setUsedBy((u) => ({ ...u, [t.id]: [...(u[t.id] ?? []), { id: p.id, name: p.name }] }));
      return;
    }
    const res = await persistProduct({ ...p, templateIds: [...ids, t.id] }, p.savedAt);
    clear();
    if (!res.ok) return setError(res.error ?? "ผูกกับสินค้าไม่สำเร็จ");
    setUsedBy((u) => ({ ...u, [t.id]: [...(u[t.id] ?? []), { id: p.id, name: p.name }] }));
  }

  /** เอาชุดนี้ออกจากสินค้าตัวนั้น (ตรงข้ามกับ linkToProduct) */
  async function unlinkFromProduct(t: Draft, productId: string) {
    setBusy((b) => ({ ...b, [t.id]: "ปลดสินค้า" }));
    const clear = () =>
      setBusy((b) => {
        const n = { ...b };
        delete n[t.id];
        return n;
      });
    const p = await fetchProductRaw(productId);
    if (!p) {
      clear();
      return setError("โหลดข้อมูลสินค้าไม่สำเร็จ");
    }
    const res = await persistProduct({ ...p, templateIds: (p.templateIds ?? []).filter((x) => x !== t.id) }, p.savedAt);
    clear();
    if (!res.ok) return setError(res.error ?? "ปลดออกจากสินค้าไม่สำเร็จ");
    setUsedBy((u) => ({ ...u, [t.id]: (u[t.id] ?? []).filter((x) => x.id !== productId) }));
  }

  /** อัปหลายไฟล์รวดเดียว (ลากวาง/เลือกหลายไฟล์) — เดารุ่นจากชื่อไฟล์ให้ด้วย */
  async function addFiles(t: Draft, files: File[]) {
    if (!files.length) return;
    setError("");
    const label = t.optionLabel?.trim();
    const choices =
      label && t.optionProductId
        ? (prodOpts[t.optionProductId] ?? []).find((g) => g.label === label)?.choices ?? []
        : [];
    const added: TemplateFile[] = [];
    for (let i = 0; i < files.length; i++) {
      setBusy((b) => ({ ...b, [t.id]: `${i + 1}/${files.length}` }));
      const res = await uploadTemplateFile(files[i], "file");
      if (!res.ok) {
        setError(`${files[i].name}: ${res.error ?? "อัปโหลดไม่สำเร็จ"}`);
        continue;
      }
      // 📏 ขนาดอาร์ตบอร์ดจริง — ใช้เป็นกรอบตอนลูกค้าวางลายบนเว็บ (อ่านจากไฟล์ ไม่ต้องพิมพ์เอง)
      const size = await readDesignSizeMm(files[i]);
      added.push({
        id: rid("f"),
        fileUrl: res.url,
        fileName: res.name,
        fileSize: res.size,
        ...(size ?? {}),
        ...(choices.length ? { choice: guessChoice(res.name ?? "", choices) || undefined } : {}),
      });
    }
    setBusy((b) => {
      const n = { ...b };
      delete n[t.id];
      return n;
    });
    if (!added.length) return;
    setList((cur) =>
      cur.map((x) =>
        x.id === t.id
          ? {
              ...x,
              files: [...(x.files ?? []), ...added],
              // ชุดยังไม่มีชื่อ → ใช้ชื่อไฟล์แรกตั้งให้
              ...(x.name.trim() ? {} : { name: (added[0].fileName ?? "").replace(/\.[^.]+$/, "") }),
              _dirty: true,
            }
          : x
      )
    );
    setOpen((o) => ({ ...o, [t.id]: true }));
    // 🖼 ทำรูปตัวอย่างให้ทุกไฟล์ที่เพิ่งอัป (ไฟล์ .ai/.pdf) — เห็นหน้าตาแต่ละรุ่นได้เลยไม่ต้องเปิดไฟล์
    for (let i = 0; i < added.length; i++) {
      const src = files.find((f) => f.name === added[i].fileName);
      if (src && canThumbnail(src.name)) {
        setBusy((b) => ({ ...b, [t.id]: `รูป ${i + 1}/${added.length}` }));
        await makePreviewFrom(t.id, src, added[i].id, true);
      }
    }
    setBusy((b) => {
      const n = { ...b };
      delete n[t.id];
      return n;
    });
  }

  /**
   * เรนเดอร์หน้าแรกของไฟล์งานเป็นรูปตัวอย่าง แล้วอัปขึ้น storage
   * fileId = ใส่เป็นรูปของไฟล์นั้น (โชว์ในแถวไฟล์) · ชุดที่ยังไม่มีรูปปก จะใช้รูปนี้เป็นปกให้ด้วย
   */
  async function makePreviewFrom(tid: string, file: File, fileId?: string, quiet = false) {
    if (!quiet) setBusy((b) => ({ ...b, [tid]: "ทำรูปตัวอย่าง" }));
    const png = await thumbnailFromDesignFile(file);
    const done = () =>
      setBusy((b) => {
        const n = { ...b };
        delete n[tid];
        return n;
      });
    if (!png) {
      if (!quiet) done();
      // .ai ที่ปิด PDF compatibility เปิดไม่ได้ — บอกทางออกไปเลย ไม่ปล่อยให้งง
      setError(
        `ทำรูปตัวอย่างจาก “${file.name}” ไม่ได้ — ไฟล์ .ai ต้องเซฟแบบ Create PDF Compatible File · ใช้ปุ่ม 🖼 รูปตัวอย่าง อัปรูปเองแทนได้`
      );
      return;
    }
    const res = await uploadTemplateFile(png, "preview");
    if (!quiet) done();
    if (!res.ok) return setError(res.error ?? "อัปรูปตัวอย่างไม่สำเร็จ");
    if (fileId) patchFile(tid, fileId, { previewUrl: res.url });
    // ชุดยังไม่มีรูปปก → ใช้รูปแรกที่ทำได้เป็นปกไปเลย
    setList((cur) =>
      cur.map((x) => (x.id === tid && !x.previewUrl ? { ...x, previewUrl: res.url, _dirty: true } : x))
    );
  }

  /** ดึงไฟล์ที่อัปไว้แล้วกลับมาทำรูปตัวอย่าง (ปุ่มในแถวไฟล์) */
  async function previewFromUploaded(tid: string, f: TemplateFile) {
    if (!f.fileUrl || !f.fileName) return;
    setThumbBusy(f.id);
    try {
      const blob = await fetch(f.fileUrl).then((r) => r.blob());
      await makePreviewFrom(tid, new File([blob], f.fileName, { type: blob.type }), f.id, true);
    } catch {
      setError("โหลดไฟล์มาทำรูปตัวอย่างไม่สำเร็จ");
    } finally {
      setThumbBusy((c) => (c === f.id ? null : c));
    }
  }

  /**
   * เติมรูปตัวอย่างย้อนหลังให้ไฟล์ที่ยังไม่มี — ทำเองอัตโนมัติตอนกางการ์ด
   * (ไฟล์ที่อัปไว้ก่อนมีฟีเจอร์นี้จะได้รูปโดยไม่ต้องให้แอดมินไปกดทีละไฟล์)
   * เสร็จแล้วบันทึกให้เลย จะได้ไม่ค้างเป็น "ยังไม่บันทึก" ทั้งที่ผู้ใช้ไม่ได้แก้อะไร
   */
  async function backfillPreviews(t: Draft) {
    if (backfilled.current.has(t.id)) return;
    const need = (t.files ?? []).filter((f) => f.fileUrl && !f.previewUrl && canThumbnail(f.fileName ?? ""));
    if (!need.length) return;
    backfilled.current.add(t.id);
    for (const f of need) await previewFromUploaded(t.id, f);
    // อ่านสถานะล่าสุดแล้วบันทึก (ระหว่างทำรูป state ถูกอัปเดตไปหลายรอบ)
    setList((cur) => {
      const latest = cur.find((x) => x.id === t.id);
      if (latest) {
        const { _dirty, fileUrl, fileName, fileSize, linkUrl, ...clean } = latest;
        void _dirty;
        void fileUrl;
        void fileName;
        void fileSize;
        void linkUrl;
        void persistTemplate(clean);
      }
      return cur.map((x) => (x.id === t.id ? { ...x, _dirty: false } : x));
    });
  }

  /**
   * 📏 เติม "ขนาดงานจริง" ย้อนหลังให้ไฟล์ที่อัปไว้ก่อนมีฟีเจอร์วางลายบนเว็บ
   * โหลดไฟล์กลับมาอ่านขนาดอาร์ตบอร์ด แล้วบันทึกให้เลย (ทำครั้งเดียวต่อชุด)
   */
  async function backfillSizes(t: Draft) {
    if (sizeFilled.current.has(t.id)) return;
    const need = (t.files ?? []).filter((f) => f.fileUrl && !f.widthMm && canThumbnail(f.fileName ?? ""));
    if (!need.length) return;
    sizeFilled.current.add(t.id);
    let got = false;
    for (const f of need) {
      try {
        const blob = await fetch(f.fileUrl!).then((r) => r.blob());
        const size = await readDesignSizeMm(new File([blob], f.fileName!, { type: blob.type }));
        if (size) {
          patchFile(t.id, f.id, size);
          got = true;
        }
      } catch {
        /* อ่านไม่ได้ก็ปล่อย — แอดมินพิมพ์ขนาดเองได้ในแถวไฟล์ */
      }
    }
    if (!got) return;
    setList((cur) => {
      const latest = cur.find((x) => x.id === t.id);
      if (latest) {
        const { _dirty, ...clean } = latest;
        void _dirty;
        void persistTemplate(clean);
      }
      return cur.map((x) => (x.id === t.id ? { ...x, _dirty: false } : x));
    });
  }

  /** ทำรูปตัวอย่างจากไฟล์งานแล้วคืน url (ไม่ยุ่งกับ state — ใช้ตอนสร้างชุดทีละหลายไฟล์) */
  async function previewUrlOf(file: File): Promise<string | undefined> {
    if (!canThumbnail(file.name)) return undefined;
    const png = await thumbnailFromDesignFile(file);
    if (!png) return undefined;
    const res = await uploadTemplateFile(png, "preview");
    return res.ok ? res.url : undefined;
  }

  /**
   * 📥 โยนไฟล์ทีเดียวหลายไฟล์ — ได้ "ชุดใหม่ไฟล์ละชุด" เข้าหมวดที่กำลังกรองอยู่
   * (เทมเพลตของร้านมักเป็นไฟล์ละขนาด/ละรุ่น = คนละชุดกัน ไม่ใช่หลายไฟล์ในชุดเดียว)
   * ตั้งชื่อชุดจากชื่อไฟล์ · อ่านขนาดอาร์ตบอร์ด · ทำรูปตัวอย่าง · บันทึกให้เลยทีละไฟล์
   */
  async function bulkAdd(fileList: FileList | File[] | null) {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;
    setError("");
    const category = cat && cat !== NO_CATEGORY ? cat : undefined;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setBulk({ done: i, total: files.length, name: file.name });
      const up = await uploadTemplateFile(file, "file");
      if (!up.ok) {
        setError(`${file.name}: ${up.error ?? "อัปโหลดไม่สำเร็จ"}`);
        continue;
      }
      const size = await readDesignSizeMm(file);
      const previewUrl = await previewUrlOf(file);
      const t: DesignTemplate = {
        id: rid("tpl"),
        name: (up.name ?? file.name).replace(/\.[^.]+$/, ""),
        ...(category ? { category } : {}),
        ...(previewUrl ? { previewUrl } : {}),
        sort: list.length + i,
        files: [
          {
            id: rid("f"),
            fileUrl: up.url,
            fileName: up.name,
            fileSize: up.size,
            ...(size ?? {}),
            ...(previewUrl ? { previewUrl } : {}),
          },
        ],
      };
      setList((cur) => [...cur, t]);
      const res = await persistTemplate(t);
      if (!res.ok) setError(res.error ?? "บันทึกไม่สำเร็จ");
    }
    setBulk(null);
  }

  async function pickPreview(t: Draft, f: File) {
    setBusy((b) => ({ ...b, [t.id]: "รูป" }));
    const res = await uploadTemplateFile(f, "preview");
    setBusy((b) => {
      const n = { ...b };
      delete n[t.id];
      return n;
    });
    if (!res.ok) return setError(res.error ?? "อัปโหลดรูปไม่สำเร็จ");
    patch(t.id, { previewUrl: res.url });
  }

  /**
   * ปุ่มสกินรับไฟล์แบบ "ลากมาวาง" ได้ด้วย
   * ⚠️ ต้อง stopPropagation ทุกอีเวนต์ — ไม่งั้นการ์ดชั้นนอกจะคว้าไฟล์ไปเพิ่มเป็น "ไฟล์เทมเพลต" แทน
   */
  function skinDropProps(t: Draft, fileId?: string) {
    const key = `${t.id}:${fileId ?? "set"}`;
    return {
      on: skinDrop === key,
      handlers: {
        onDragOver: (e: React.DragEvent) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          e.stopPropagation();
          setDropOn(null);
          setSkinDrop(key);
        },
        onDragLeave: () => setSkinDrop((c) => (c === key ? null : c)),
        onDrop: (e: React.DragEvent) => {
          const img = [...(e.dataTransfer.files ?? [])][0];
          if (!img) return;
          e.preventDefault();
          e.stopPropagation();
          setSkinDrop(null);
          void pickSkin(t, img, fileId);
        },
      },
    };
  }

  /**
   * 👕 สกินสินค้า — PNG พื้นโปร่งใสที่วางทับลายในจอวางลายของลูกค้า
   * fileId = ตั้งเฉพาะไฟล์นั้น (เช่น เคสแต่ละรุ่นรูกล้องไม่เหมือนกัน) · ไม่ใส่ = ตั้งให้ทั้งชุด
   */
  async function pickSkin(t: Draft, f: File, fileId?: string) {
    if (!/\.png$/i.test(f.name)) return setError("สกินต้องเป็นไฟล์ .png ที่พื้นหลังโปร่งใส (ไม่งั้นจะบังลายจนมองไม่เห็น)");
    setBusy((b) => ({ ...b, [t.id]: "สกิน" }));
    const res = await uploadTemplateFile(f, "preview");
    setBusy((b) => {
      const n = { ...b };
      delete n[t.id];
      return n;
    });
    if (!res.ok) return setError(res.error ?? "อัปโหลดสกินไม่สำเร็จ");
    if (fileId) patchFile(t.id, fileId, { skinUrl: res.url });
    else patch(t.id, { skinUrl: res.url });
  }

  /**
   * เพิ่มชุดใหม่ — ใส่หมวดให้เลยถ้ากำลังดูหมวดใดหมวดหนึ่งอยู่
   * (ไม่งั้นชุดใหม่จะไปโผล่ใน "ยังไม่จัดหมวด" แล้วต้องมาเลือกหมวดซ้ำ)
   */
  function add(category?: string) {
    const c = category?.trim();
    const t: Draft = {
      id: rid("tpl"),
      name: "",
      files: [],
      sort: list.length,
      _dirty: true,
      ...(c && c !== NO_CATEGORY ? { category: c } : {}),
    };
    setList((cur) => [...cur, t]);
    setOpen((o) => ({ ...o, [t.id]: true }));
    // เลื่อนไปที่การ์ดใหม่ให้เห็นเลย (คลังใหญ่ ๆ ชุดใหม่อยู่ท้ายสุด)
    setTimeout(() => {
      document.getElementById(`tpl-${t.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
  }

  /** วางชุดที่ลากไว้ลงตำแหน่งของชุดเป้าหมาย (อ้างด้วย id — ปลอดภัยแม้ลิสต์ถูกกรอง/จัดกลุ่ม) */
  async function dropOnTemplate(targetId: string) {
    const from = dragId.current;
    dragId.current = null;
    setDragAt(null);
    if (!from || from === targetId) return;
    const fi = list.findIndex((t) => t.id === from);
    const ti = list.findIndex((t) => t.id === targetId);
    if (fi < 0 || ti < 0) return;
    const next = [...list];
    const [moved] = next.splice(fi, 1);
    // ลากข้ามหมวด = ย้ายหมวดตามปลายทางไปด้วย (ตรงกับที่ตาเห็น)
    const targetCat = list[ti].category;
    next.splice(ti, 0, { ...moved, category: targetCat });
    const renumbered = next.map((t, i) => ({ ...t, sort: i }));
    setList(renumbered);
    for (const t of renumbered) {
      const { _dirty, ...clean } = t;
      void _dirty;
      await persistTemplate(clean);
    }
  }

  const q = query.trim().toLowerCase();
  const shown = list
    .filter((t) => !cat || (cat === NO_CATEGORY ? !t.category?.trim() : t.category?.trim() === cat))
    .filter(
      (t) =>
        !q ||
        (
          t.name +
          " " +
          (t.note ?? "") +
          " " +
          (t.category ?? "") +
          " " +
          (t.files ?? []).map((f) => `${f.fileName ?? ""} ${f.choice ?? ""}`).join(" ")
        )
          .toLowerCase()
          .includes(q)
    );
  const totalFiles = list.reduce((n, t) => n + (t.files?.length ?? 0), 0);
  /** หมวดที่ตั้งไว้ (ตามลำดับที่จัด) + หมวดที่ชุดใช้อยู่แต่ยังไม่ได้ตั้ง (ข้อมูลเก่า) ต่อท้าย */
  const cats = [...catList, ...templateCategories(list).filter((c) => !catList.includes(c))];
  const noCatCount = list.filter((t) => !t.category?.trim()).length;
  /** จัดกลุ่มตามหมวดเมื่อดูรวมทุกหมวด · เลือกหมวดเดียวอยู่แล้วไม่ต้องมีหัวกลุ่มซ้ำ */
  const catGroups = cat
    ? [{ category: cat, items: shown }]
    : groupByCategory(shown).sort((a, b) => {
        // เรียงตามลำดับหมวดที่แอดมินจัดไว้ · "ยังไม่จัดหมวด" ท้ายสุดเสมอ
        if (a.category === NO_CATEGORY) return 1;
        if (b.category === NO_CATEGORY) return -1;
        return cats.indexOf(a.category) - cats.indexOf(b.category);
      });

  return (
    <div className="mx-auto w-full max-w-[112rem] px-4 py-6">
      {/* ── หัวหน้า (โทนแบรนด์ฟ้า-เหลืองเป็ด ให้เข้ากับหน้าร้าน) ── */}
      <div className={brandHero}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className={h1}>📐 คลังเทมเพลตไฟล์งาน</h1>
            <p className={`mt-1 max-w-2xl text-sm ${muted}`}>
              <strong>ลากไฟล์ .ai มาวางได้เลย</strong> (ทีละหลายไฟล์) — 1 ชุดมีหลายไฟล์ได้
              แล้วผูกแต่ละไฟล์กับ<strong>ตัวเลือกสินค้า</strong> เช่น เคสมือถือ ผูกไฟล์กับ &ldquo;รุ่น&rdquo; ·
              ลูกค้าเลือกรุ่นไหน ก็เห็นไฟล์ของรุ่นนั้น
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* เลือกหมวดอยู่ = เพิ่มเข้าหมวดนั้นเลย ไม่ต้องมาเลือกหมวดทีหลัง */}
            <button
              type="button"
              onClick={() => add(cat)}
              className={btnDucky}
              title={cat && cat !== NO_CATEGORY ? `เพิ่มชุดใหม่ในหมวด ${cat}` : "เพิ่มชุดใหม่"}
            >
              ＋ เพิ่มชุดเทมเพลต
              {cat && cat !== NO_CATEGORY ? <span className="font-normal opacity-90"> ใน &ldquo;{cat}&rdquo;</span> : ""}
            </button>
          </div>
        </div>
        {/* สรุปตัวเลข — เห็นภาพรวมคลังทันทีโดยไม่ต้องเลื่อน */}
        {list.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            <span className={chipBrand}>📦 {list.length} ชุด</span>
            <span className={chipBrand}>📎 {totalFiles} ไฟล์</span>
            <span className={chipDucky}>🗂 {cats.length} หมวด</span>
            {noCatCount > 0 && <span className={chipMuted}>ยังไม่จัดหมวด {noCatCount}</span>}
            {list.some((t) => t._dirty) && (
              <span className={`${badge} bg-rose-50 text-rose-600 ring-1 ring-rose-200`}>
                ● มีชุดที่ยังไม่บันทึก
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── แท็บ: เทมเพลต | หมวดหมู่ ── */}
      <div className="mt-4 flex gap-1 border-b border-slate-200">
        {(
          [
            ["templates", `📐 เทมเพลต${list.length ? ` (${list.length})` : ""}`],
            ["cats", `🗂 หมวดหมู่${catList.length ? ` (${catList.length})` : ""}`],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`-mb-px rounded-t-xl border-b-2 px-4 py-2 text-sm font-bold transition ${
              tab === k
                ? "border-amber-500 text-amber-700"
                : "border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── ตั้งค่าหมวดหมู่: เพิ่ม / เปลี่ยนชื่อ / ลบ / จัดลำดับ ── */}
      {tab === "cats" && (
        <div className={`mt-3 ${card} p-4`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold text-slate-800">🗂 หมวดหมู่ของคลังเทมเพลต</p>
            <button type="button" onClick={() => setTab("templates")} className={btnSmNeutral}>
              ← กลับไปหน้าเทมเพลต
            </button>
          </div>
          <p className={`mt-1 text-xs ${muted}`}>
            ตั้งไว้ที่นี่แล้วในแต่ละชุดจะเลือกจากรายการนี้ได้เลย ไม่ต้องพิมพ์ซ้ำ ·
            เปลี่ยนชื่อหมวด ระบบไล่อัปเดตชุดที่ใช้อยู่ให้เอง · ลำดับที่จัดไว้ = ลำดับกลุ่มในหน้าคลัง
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <input
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void addCat();
                }
              }}
              placeholder="ชื่อหมวดใหม่ เช่น เคสมือถือ"
              className={`${input} max-w-xs`}
            />
            <button type="button" onClick={() => void addCat()} disabled={!newCat.trim()} className={btnPrimary}>
              ＋ เพิ่มหมวด
            </button>
          </div>

          {catList.length === 0 ? (
            <p className={`mt-3 rounded-xl bg-slate-50 p-3 text-center text-xs ${faint}`}>
              ยังไม่มีหมวด — เพิ่มหมวดแรกได้เลย
            </p>
          ) : (
            <ul className="mt-3 space-y-1">
              {catList.map((c, i) => {
                const n = list.filter((t) => t.category?.trim() === c).length;
                return (
                  <li key={c} className="flex items-center gap-2 rounded-lg px-2 py-1.5 ring-1 ring-slate-100 hover:bg-slate-50">
                    <span className="flex flex-col">
                      <button
                        type="button"
                        onClick={() => void moveCat(i, -1)}
                        disabled={i === 0}
                        className="h-3.5 text-[9px] leading-none text-slate-400 disabled:opacity-20"
                        aria-label={`เลื่อน ${c} ขึ้น`}
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => void moveCat(i, 1)}
                        disabled={i === catList.length - 1}
                        className="h-3.5 text-[9px] leading-none text-slate-400 disabled:opacity-20"
                        aria-label={`เลื่อน ${c} ลง`}
                      >
                        ▼
                      </button>
                    </span>
                    <span className="min-w-0 flex-1 break-words text-sm font-semibold leading-snug text-slate-700">🗂 {c}</span>
                    <span className={`text-[11px] ${faint}`}>{n} ชุด</span>
                    <button type="button" onClick={() => void renameCat(c)} className={btnSmNeutral}>
                      ✏️ เปลี่ยนชื่อ
                    </button>
                    <button type="button" onClick={() => void removeCat(c)} className={btnSmDanger}>
                      🗑 ลบ
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {!isSupabaseConfigured && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
          ⚠️ ยังไม่ได้ตั้งค่าฐานข้อมูล — ตอนนี้เก็บไว้ในเบราว์เซอร์เครื่องนี้เท่านั้น (อัปไฟล์จริงไม่ได้ ใช้ลิงก์แทนได้)
        </p>
      )}
      {error && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 ring-1 ring-rose-200">
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError("")} className="shrink-0 text-rose-400 hover:text-rose-600">
            ✕
          </button>
        </p>
      )}

      {/* ══ แท็บเทมเพลต — สองคอลัมน์: เมนูหมวดด้านซ้าย (ค้างไว้) + เนื้อหาด้านขวา ══ */}
      <div
        className={`mt-4 gap-4 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start ${
          tab === "templates" ? "grid" : "hidden"
        }`}
      >
        {/* ── เมนูหมวดหมู่ — ทำงานทีละหมวดได้แม้คลังใหญ่ (มือถือ = เลื่อนแนวนอน) ── */}
        {list.length > 0 && (
          <aside className={`${brandCard} p-2 lg:sticky lg:top-20`}>
            <p className="px-2 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">หมวดหมู่</p>
            <nav className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
              <button
                type="button"
                onClick={() => setCat("")}
                className={`${cat === "" ? navItemActive : navItemIdle} shrink-0`}
              >
                <span className="flex-1 whitespace-nowrap lg:whitespace-normal lg:break-words lg:leading-snug">📚 ทั้งหมด</span>
                <span className={`text-[11px] ${cat === "" ? "text-white/80" : "text-slate-400"}`}>{list.length}</span>
              </button>
              {cats.map((c) => {
                const n = list.filter((t) => t.category?.trim() === c).length;
                const nf = list
                  .filter((t) => t.category?.trim() === c)
                  .reduce((s, t) => s + (t.files?.length ?? 0), 0);
                const on = c === cat;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCat(on ? "" : c)}
                    title={`${n} ชุด · ${nf} ไฟล์`}
                    className={`${on ? navItemActive : navItemIdle} shrink-0`}
                  >
                    {/* จุดสีประจำหมวด — กวาดตาหาหมวดได้เร็วเวลาหมวดเยอะ */}
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white/60"
                      style={{ backgroundColor: categoryTone(c) }}
                    />
                    <span className="flex-1 whitespace-nowrap lg:whitespace-normal lg:break-words lg:leading-snug">{c}</span>
                    <span className={`text-[11px] ${on ? "text-white/80" : "text-slate-400"}`}>{n}</span>
                  </button>
                );
              })}
              {noCatCount > 0 && (
                <button
                  type="button"
                  onClick={() => setCat(cat === NO_CATEGORY ? "" : NO_CATEGORY)}
                  className={`${cat === NO_CATEGORY ? navItemActive : navItemIdle} shrink-0`}
                >
                  <span className={`flex-1 whitespace-nowrap lg:whitespace-normal lg:break-words lg:leading-snug ${cat === NO_CATEGORY ? "" : "text-slate-400"}`}>
                    📂 {NO_CATEGORY}
                  </span>
                  <span className={`text-[11px] ${cat === NO_CATEGORY ? "text-white/80" : "text-slate-400"}`}>
                    {noCatCount}
                  </span>
                </button>
              )}
            </nav>
            <button
              type="button"
              onClick={() => setTab("cats")}
              className={`${btnSmNeutral} mt-2 w-full justify-center`}
            >
              ⚙️ จัดการหมวด
            </button>
          </aside>
        )}

        {/* ── เนื้อหา ── */}
        <div className="min-w-0">
      {list.length > 0 && (
        <div className={`mb-3 flex flex-wrap items-center gap-2 ${brandStrip}`}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="🔍 ค้นหาชื่อชุด · ชื่อไฟล์ · รุ่น · หมวด…"
            className={`${input} flex-1 sm:max-w-sm`}
          />
          <span className="text-xs font-semibold text-amber-800">
            {cat ? `🗂 ${cat}` : "📚 ทุกหมวด"}
            <span className="ml-1 font-normal text-amber-700/70">
              · {shown.length} ชุด
              {q ? " (ตรงคำค้น)" : ""}
            </span>
          </span>
          <div className="ml-auto flex gap-2">
            {cat && (
              <button
                type="button"
                onClick={() => add(cat)}
                className={btnSmDucky}
                title={cat === NO_CATEGORY ? "เพิ่มชุดใหม่แบบยังไม่จัดหมวด" : `เพิ่มชุดใหม่ในหมวด ${cat}`}
              >
                {cat === NO_CATEGORY ? "＋ เพิ่มชุดใหม่" : "＋ เพิ่มชุดในหมวดนี้"}
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(Object.fromEntries(shown.map((t) => [t.id, true])))}
              className={btnSmNeutral}
            >
              กางทั้งหมด
            </button>
            <button type="button" onClick={() => setOpen({})} className={btnSmNeutral}>
              ยุบทั้งหมด
            </button>
          </div>
        </div>
      )}

      {/* ── โยนไฟล์ทีเดียวหลายไฟล์ = ได้ชุดใหม่ไฟล์ละชุด (เข้าหมวดที่กรองอยู่) ── */}
      <div
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setBulkDrag(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setBulkDrag(false);
        }}
        onDrop={(e) => {
          if (!e.dataTransfer.files?.length) return;
          e.preventDefault();
          setBulkDrag(false);
          void bulkAdd(e.dataTransfer.files);
        }}
        className={`mb-3 rounded-2xl border-2 border-dashed p-4 text-center transition ${
          bulkDrag ? "border-sky-400 bg-sky-50" : "border-amber-200 bg-amber-50/40"
        }`}
      >
        {bulk ? (
          <p className="text-sm font-bold text-slate-700">
            ⏳ กำลังเพิ่ม {bulk.done + 1}/{bulk.total} — {bulk.name}
          </p>
        ) : (
          <>
            <label className="cursor-pointer text-sm font-bold text-slate-700">
              📥 ลากไฟล์ .ai มาวางตรงนี้ทีเดียวหลายไฟล์ — ได้ชุดใหม่ <u>ไฟล์ละชุด</u>
              <input
                type="file"
                accept=".ai,.pdf,.eps,.svg,.psd,.zip"
                multiple
                className="hidden"
                onChange={(e) => {
                  void bulkAdd(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            <p className={`mt-0.5 text-[11px] ${faint}`}>
              ตั้งชื่อชุดจากชื่อไฟล์ · อ่านขนาดงานจากไฟล์ · ทำรูปตัวอย่างให้เอง
              {cat && cat !== NO_CATEGORY ? (
                <>
                  {" "}
                  · เข้าหมวด <span className="font-bold text-amber-700">{cat}</span> อัตโนมัติ
                </>
              ) : (
                <> · เลือกหมวดทางซ้ายก่อน ชุดใหม่จะเข้าหมวดนั้นให้เลย</>
              )}
              {" "}· อยากได้หลายไฟล์ในชุดเดียว ให้ลากไปวางบนการ์ดของชุดนั้นแทน
            </p>
          </>
        )}
      </div>

      {loading ? (
        <p className={`mt-6 text-sm ${faint}`}>กำลังโหลด…</p>
      ) : list.length === 0 ? (
        <div className={`mt-6 ${card} p-8 text-center`}>
          <p className="text-4xl">📐</p>
          <p className="mt-2 text-sm font-semibold text-slate-700">ยังไม่มีเทมเพลตในคลัง</p>
          <p className={`mt-1 text-xs ${muted}`}>กด &ldquo;＋ เพิ่มชุดเทมเพลต&rdquo; แล้วลากไฟล์ .ai มาวางได้เลย</p>
        </div>
      ) : (
        <div className="space-y-5">
          {shown.length === 0 && (
            <div className={`${brandCard} p-6 text-center`}>
              <p className={`text-sm ${faint}`}>
                {q
                  ? "ไม่มีชุดที่ตรงกับคำค้น"
                  : cat === NO_CATEGORY
                    ? "ทุกชุดจัดหมวดไว้ครบแล้ว"
                    : cat
                      ? `ยังไม่มีชุดในหมวด “${cat}”`
                      : "ไม่มีชุดที่ตรงกับที่กรองไว้"}
              </p>
              {cat && !q && (
                <button type="button" onClick={() => add(cat)} className={`${btnDucky} mt-3`}>
                  {cat === NO_CATEGORY ? "＋ เพิ่มชุดใหม่" : "＋ เพิ่มชุดแรกในหมวดนี้"}
                </button>
              )}
            </div>
          )}
          {catGroups.map((grp) => (
        <div key={grp.category}>
          {/* หัวกลุ่มหมวด — โผล่เฉพาะตอนดูรวมทุกหมวดและมีมากกว่า 1 กลุ่ม */}
          {!cat && catGroups.length > 1 && (
            <p className="mb-2 flex items-center gap-2 text-xs font-bold text-amber-800">
              <span className={grp.category === NO_CATEGORY ? "text-slate-400" : ""}>
                {grp.category === NO_CATEGORY ? "📂" : "🗂"} {grp.category}
              </span>
              <span className={`font-normal ${faint}`}>({grp.items.length})</span>
              <span className="h-px flex-1 bg-amber-100" />
            </p>
          )}
          {/* ยุบอยู่ = การ์ดเรียงเป็นกริด (เห็นได้เยอะต่อหน้าจอ) · กางแล้วขยายเต็มแถวให้พื้นที่แก้ไข */}
          <div className="grid gap-2.5 xl:grid-cols-2 2xl:grid-cols-3">
          {grp.items.map((t) => {
            const used = usedBy[t.id] ?? [];
            const files = t.files ?? [];
            const label = t.optionLabel?.trim();
            const prodGroups = t.optionProductId ? prodOpts[t.optionProductId] ?? [] : [];
            const groupChoices = label ? prodGroups.find((g) => g.label === label)?.choices ?? [] : [];
            const pickedProduct = productList.find((p) => p.id === t.optionProductId);
            /** ผลค้นหาสินค้า — ที่ผูกชุดนี้อยู่ขึ้นก่อน แล้วค่อยชื่อที่ขึ้นต้นตรงคำค้น */
            const pq = (prodQ[t.id] ?? "").trim().toLowerCase();
            const prodHits = productList
              .filter((p) => !pq || p.name.toLowerCase().includes(pq))
              .sort((a, b) => {
                const ua = used.some((u) => u.id === a.id) ? 0 : 1;
                const ub = used.some((u) => u.id === b.id) ? 0 : 1;
                if (ua !== ub) return ua - ub;
                if (pq) {
                  const sa = a.name.toLowerCase().startsWith(pq) ? 0 : 1;
                  const sb = b.name.toLowerCase().startsWith(pq) ? 0 : 1;
                  if (sa !== sb) return sa - sb;
                }
                return a.name.localeCompare(b.name, "th");
              });
            const prodMatches = prodHits.slice(0, 40);
            const prodMoreCount = prodHits.length - prodMatches.length;
            const expanded = !!open[t.id];
            const missing = files.filter((f) => !fileReady(f)).length;
            const uploading = busy[t.id];
            return (
              <div
                key={t.id}
                id={`tpl-${t.id}`}
                draggable={!expanded}
                onDragStart={() => {
                  dragId.current = t.id;
                  setDragAt(t.id);
                }}
                onDragEnd={() => {
                  dragId.current = null;
                  setDragAt(null);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.types.includes("Files")) setDropOn(t.id);
                }}
                onDragLeave={() => setDropOn((c) => (c === t.id ? null : c))}
                onDrop={(e) => {
                  const dropped = [...(e.dataTransfer.files ?? [])];
                  if (dropped.length) {
                    e.preventDefault();
                    setDropOn(null);
                    void addFiles(t, dropped);
                  } else {
                    void dropOnTemplate(t.id);
                  }
                }}
                className={`${brandCard} transition ${expanded ? "xl:col-span-2 2xl:col-span-3" : ""} ${
                  dragAt === t.id ? "opacity-40" : ""
                } ${dropOn === t.id ? "ring-2 ring-amber-400 ring-offset-1" : ""} ${
                  t.hidden ? "bg-slate-50" : ""
                } border-l-4`}
                /* แถบสีซ้าย = สีประจำหมวด (ดูรวมทุกหมวดแล้วยังแยกออกว่าใบไหนหมวดอะไร) */
                style={{ borderLeftColor: categoryTone(t.category?.trim() ?? "") }}
              >
                {/* ── หัวการ์ด: อ่านภาพรวมได้โดยไม่ต้องกาง ── */}
                <div className="flex items-center gap-3 p-3">
                  {!expanded && (
                    <span className="cursor-grab select-none text-slate-300" title="ลากเพื่อจัดลำดับ">
                      ⋮⋮
                    </span>
                  )}
                  <TemplateIcon tone={categoryTone(t.category?.trim() ?? "")} />
                  <button
                    type="button"
                    onClick={() => {
                      void backfillPreviews(t); // กางการ์ด = เติมรูปให้ไฟล์ที่ยังไม่มีเอง
                      void backfillSizes(t); // + อ่านขนาดงานจริงจากไฟล์ (ใช้ตอนลูกค้าวางลายบนเว็บ)
                      setOpen((o) => ({ ...o, [t.id]: !o[t.id] }));
                    }}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate text-sm font-bold text-slate-800">
                      {t.name.trim() || <span className="text-slate-400">(ยังไม่ตั้งชื่อ)</span>}
                    </span>
                    <span className={`block truncate text-[11px] ${faint}`}>
                      {files.length} ไฟล์
                      {label ? ` · แยกตาม “${label}”` : ""}
                      {used.length ? ` · ใช้ใน ${used.length} สินค้า` : " · ยังไม่มีสินค้าผูกไว้"}
                      {t.hidden ? " · 🚫 ซ่อน" : ""}
                    </span>
                  </button>
                  {uploading && (
                    <span className={`${badge} bg-sky-50 text-sky-700 ring-1 ring-sky-200`}>⬆️ {uploading}</span>
                  )}
                  {missing > 0 && (
                    <span className={`${badge} bg-amber-50 text-amber-700 ring-1 ring-amber-200`}>⚠️ {missing} ไฟล์ว่าง</span>
                  )}
                  {t._dirty && <span className={`${badge} bg-amber-100 text-amber-800`}>ยังไม่บันทึก</span>}
                  <button
                    type="button"
                    onClick={() => {
                      void backfillPreviews(t); // กางการ์ด = เติมรูปให้ไฟล์ที่ยังไม่มีเอง
                      void backfillSizes(t); // + อ่านขนาดงานจริงจากไฟล์ (ใช้ตอนลูกค้าวางลายบนเว็บ)
                      setOpen((o) => ({ ...o, [t.id]: !o[t.id] }));
                    }}
                    className={`${btnSmNeutral} shrink-0`}
                  >
                    {expanded ? "▲ ยุบ" : "▼ แก้ไข"}
                  </button>
                </div>

                {expanded && (
                  /*
                    การ์ดที่กางกินเต็มแถว → เนื้อในแบ่งเป็น 2 คอลัมน์บนจอกว้าง
                    ซ้าย = ชื่อ/หมวด/ตัวเลือก/ไฟล์ (ของที่ต้องกรอกเป็นลำดับ)
                    ขวา = ค่าที่ใช้ตอนลูกค้าวางลายบนเว็บ + ช่องใส่รูป (ของที่ต้องเห็นภาพ)
                    ไม่งั้นการ์ดจะยาวเป็นหางว่าว ต้องเลื่อนหาทีละส่วน
                  */
                  <div className="border-t border-slate-100 p-3">
                    <div className="grid gap-3 2xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] 2xl:items-start">
                      <div className="space-y-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input
                        value={t.name}
                        onChange={(e) => patch(t.id, { name: e.target.value })}
                        placeholder="ชื่อชุด เช่น เทมเพลตเคสมือถือ (ทุกรุ่น)"
                        className={`${input} font-semibold`}
                      />
                      <input
                        value={t.note ?? ""}
                        onChange={(e) => patch(t.id, { note: e.target.value })}
                        placeholder="คำแนะนำสั้น ๆ เช่น โหมดสี CMYK · create outline"
                        className={input}
                      />
                    </div>
                    {/* หมวดหมู่ — เลือกจากรายการที่ตั้งไว้ (เพิ่มหมวดใหม่ที่ปุ่ม 🗂 ตั้งค่าหมวดหมู่ ด้านบน) */}
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="text-xs font-semibold text-slate-600">🗂 หมวดหมู่</label>
                      <select
                        value={t.category?.trim() ?? ""}
                        onChange={(e) => patch(t.id, { category: e.target.value || undefined })}
                        className={`${inputSm} max-w-[16rem] py-2`}
                      >
                        <option value="">— {NO_CATEGORY} —</option>
                        {cats.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setTab("cats")}
                        className={`${btnSmNeutral} shrink-0`}
                        title="เพิ่ม/แก้ชื่อ/ลบหมวด"
                      >
                        ⚙️ ตั้งค่าหมวด
                      </button>
                    </div>

                    {/* ── ผูกไฟล์กับตัวเลือกสินค้า: เลือกสินค้าก่อน → ค่อยเลือกกลุ่มตัวเลือกของสินค้านั้น ── */}
                    <div className="space-y-2 rounded-xl bg-slate-50 p-2.5 ring-1 ring-slate-200">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-slate-600">🎛️ แยกไฟล์ตามตัวเลือก</span>
                        <span className={`text-[11px] ${faint}`}>
                          เลือกสินค้าก่อน แล้วเลือกว่าจะแยกตามกลุ่มไหนของสินค้านั้น (เช่น เคสมือถือ → รุ่น)
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-semibold text-slate-500">1️⃣ สินค้า</span>
                        {/* ช่องค้นหาสินค้า — ร้านมี 300+ ตัว ดรอปดาวน์ธรรมดาเลื่อนหาไม่ไหว */}
                        <div className="relative">
                          <input
                            value={prodOpen === t.id ? prodQ[t.id] ?? "" : pickedProduct?.name ?? ""}
                            onFocus={() => {
                              setProdOpen(t.id);
                              setProdQ((q) => ({ ...q, [t.id]: "" }));
                            }}
                            onBlur={() => setTimeout(() => setProdOpen((c) => (c === t.id ? null : c)), 150)}
                            onChange={(e) => setProdQ((q) => ({ ...q, [t.id]: e.target.value }))}
                            placeholder="🔍 พิมพ์ชื่อสินค้าเพื่อค้นหา…"
                            className={`${inputSm} w-64 py-1.5`}
                            aria-label="ค้นหาสินค้าอ้างอิง"
                          />
                          {prodOpen === t.id && (
                            <ul className="absolute z-20 mt-1 max-h-64 w-72 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                              {prodMatches.length === 0 ? (
                                <li className={`px-3 py-2 text-xs ${faint}`}>ไม่เจอสินค้าที่ตรงกับคำค้น</li>
                              ) : (
                                prodMatches.map((p) => (
                                  <li key={p.id}>
                                    <button
                                      type="button"
                                      // onMouseDown มาก่อน onBlur ของช่องค้นหา — ไม่งั้นลิสต์ปิดก่อนคลิกติด
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        void ensureProductOptions(p.id);
                                        // เปลี่ยนสินค้า = กลุ่มเดิมอาจไม่มีในสินค้าใหม่ → ล้างกลุ่มไว้ก่อน
                                        patch(t.id, { optionProductId: p.id, optionLabel: undefined });
                                        setProdOpen(null);
                                      }}
                                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-amber-50 ${
                                        p.id === t.optionProductId ? "font-bold text-amber-700" : "text-slate-700"
                                      }`}
                                    >
                                      <span className="min-w-0 flex-1 truncate">{p.name}</span>
                                      {used.some((u) => u.id === p.id) && (
                                        <span className="shrink-0 rounded-full bg-slate-100 px-1.5 text-[10px] text-slate-500">
                                          ผูกอยู่
                                        </span>
                                      )}
                                    </button>
                                  </li>
                                ))
                              )}
                              {prodMoreCount > 0 && (
                                <li className={`px-3 py-1.5 text-[11px] ${faint}`}>
                                  …อีก {prodMoreCount} รายการ — พิมพ์เพิ่มเพื่อกรองให้แคบลง
                                </li>
                              )}
                            </ul>
                          )}
                        </div>
                        {t.optionProductId && (
                          <button
                            type="button"
                            onClick={() => patch(t.id, { optionProductId: undefined, optionLabel: undefined })}
                            className={btnSmDanger}
                            title="ล้างสินค้าที่เลือก"
                          >
                            ✕ ล้าง
                          </button>
                        )}
                        {optsBusy === t.optionProductId && (
                          <span className={`text-[11px] ${faint}`}>กำลังโหลดตัวเลือก…</span>
                        )}
                        {/*
                          เลือกสินค้าตรงนี้ = ยืมกลุ่มตัวเลือกมาแยกไฟล์เท่านั้น ยังไม่ได้ผูกกับสินค้า
                          ถ้ายังไม่ผูก หน้าสินค้าจะไม่ขึ้นเทมเพลตเลย — บอกให้ชัดแล้วให้กดผูกได้จากตรงนี้
                        */}
                        {t.optionProductId &&
                          (used.some((u) => u.id === t.optionProductId) ? (
                            <span className={`${badge} bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200`}>
                              🔗 ผูกกับสินค้านี้แล้ว
                            </span>
                          ) : (
                            <>
                              <span className="text-[11px] font-semibold text-rose-600">
                                ⚠️ ยังไม่ได้ผูกกับสินค้านี้ — หน้าสินค้าจะไม่ขึ้นเทมเพลต
                              </span>
                              <button
                                type="button"
                                onClick={() => void linkToProduct(t)}
                                disabled={!!busy[t.id]}
                                className={`${btnSmDucky} disabled:opacity-50`}
                                title="ผูกชุดนี้เข้ากับสินค้าที่เลือกไว้ — เท่ากับไปติ๊กในหน้าแก้ไขสินค้า"
                              >
                                🔗 ผูกกับสินค้านี้เลย
                              </button>
                            </>
                          ))}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-semibold text-slate-500">2️⃣ กลุ่มตัวเลือก</span>
                        <select
                          value={label ?? ""}
                          disabled={!t.optionProductId}
                          onChange={(e) => patch(t.id, { optionLabel: e.target.value || undefined })}
                          className={`${inputSm} max-w-[16rem] disabled:bg-slate-100 disabled:text-slate-400`}
                        >
                          <option value="">— ไม่แยก (โชว์ทุกไฟล์) —</option>
                          {label && !prodGroups.some((g) => g.label === label) && (
                            <option value={label}>{label} (ไม่มีในสินค้านี้แล้ว)</option>
                          )}
                          {prodGroups.map((g) => (
                            <option key={g.label} value={g.label}>
                              {g.label} ({g.choices.length})
                            </option>
                          ))}
                        </select>
                        {!t.optionProductId && <span className={`text-[11px] ${faint}`}>← เลือกสินค้าก่อน</span>}
                        {t.optionProductId && prodGroups.length === 0 && optsBusy !== t.optionProductId && (
                          <span className="text-[11px] font-semibold text-amber-600">
                            สินค้านี้ยังไม่มีกลุ่มตัวเลือก
                          </span>
                        )}
                      </div>
                    </div>

                    {/* ── กล่องลากวาง ── */}
                    <label
                      className={`flex cursor-pointer flex-wrap items-center justify-center gap-2 rounded-xl border-2 border-dashed px-3 py-4 text-center text-xs transition ${
                        dropOn === t.id
                          ? "border-sky-400 bg-sky-50 text-sky-700"
                          : "border-slate-300 bg-white text-slate-500 hover:border-amber-300 hover:bg-amber-50/40"
                      }`}
                    >
                      <span className="text-lg">⬆️</span>
                      <span>
                        <strong>ลากไฟล์มาวางตรงนี้</strong> หรือกดเพื่อเลือก · เลือกได้ทีละหลายไฟล์ ·
                        <span className={faint}> .ai .pdf .eps .svg .psd .zip · สูงสุด {TEMPLATE_MAX_MB}MB/ไฟล์</span>
                      </span>
                      <input
                        type="file"
                        multiple
                        accept=".ai,.pdf,.eps,.svg,.psd,.zip"
                        className="hidden"
                        onChange={(e) => {
                          const fs = [...(e.target.files ?? [])];
                          e.target.value = "";
                          void addFiles(t, fs);
                        }}
                      />
                    </label>

                    {/* ── ตารางไฟล์ (แถวกระชับ เลื่อนได้เมื่อไฟล์เยอะ) ── */}
                    {files.length > 0 && (
                      <div className="max-h-[26rem] space-y-1 overflow-y-auto rounded-xl bg-white p-1 ring-1 ring-slate-200">
                        {files.map((f, fi) => (
                          <div key={f.id} className="flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                            <span className={`w-6 shrink-0 text-right text-[11px] ${faint}`}>{fi + 1}</span>
                            {/* รูปตัวอย่างของไฟล์นี้ — ระบบทำให้เองตอนอัป · กดที่รูปเพื่อขยาย */}
                            {f.previewUrl ? (
                              <button
                                type="button"
                                onClick={() => setZoom({ src: f.previewUrl!, name: f.fileName ?? t.name })}
                                className="shrink-0 rounded-md ring-1 ring-slate-200 transition hover:ring-amber-400"
                                title="กดเพื่อดูรูปใหญ่"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={f.previewUrl}
                                  alt={`ตัวอย่าง ${f.fileName ?? ""}`}
                                  className="h-9 w-9 rounded-md bg-white object-contain"
                                />
                              </button>
                            ) : thumbBusy === f.id ? (
                              <span className="grid h-9 w-9 shrink-0 animate-pulse place-items-center rounded-md bg-amber-50 text-xs text-amber-500">
                                ⏳
                              </span>
                            ) : (
                              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-slate-100 text-xs text-slate-400">
                                📄
                              </span>
                            )}
                            {label ? (
                              <select
                                value={f.choice ?? ""}
                                onChange={(e) => patchFile(t.id, f.id, { choice: e.target.value || undefined })}
                                className={`${inputSm} w-44 shrink-0 ${f.choice ? "" : "text-slate-400"}`}
                                aria-label={`${label} ของไฟล์ที่ ${fi + 1}`}
                              >
                                <option value="">— ทุกตัวเลือก —</option>
                                {f.choice && !groupChoices.includes(f.choice) && <option value={f.choice}>{f.choice}</option>}
                                {groupChoices.map((c) => (
                                  <option key={c} value={c}>
                                    {c}
                                  </option>
                                ))}
                              </select>
                            ) : null}
                            {/*
                              🔄 ด้าน — ไฟล์ที่ตัวเลือกเดียวกันแต่คนละด้าน = งานชิ้นเดียวหลายด้าน
                              ลูกค้าจะได้กระดานแยกคนละแท็บ แต่ยังนับเป็นสินค้าชิ้นเดียว
                            */}
                            <input
                              value={f.side ?? ""}
                              onChange={(e) => patchFile(t.id, f.id, { side: e.target.value || undefined })}
                              placeholder="ด้าน…"
                              title="งานสกรีน 2 ด้าน: ทำสองไฟล์ที่ตัวเลือกเดียวกัน แล้วใส่ 'ด้านหน้า' กับ 'ด้านหลัง' ที่ช่องนี้ · เว้นว่าง = งานด้านเดียว"
                              className={`${inputSm} w-24 shrink-0`}
                              aria-label={`ด้านของไฟล์ที่ ${fi + 1}`}
                            />
                            {f.fileUrl ? (
                              <a
                                href={fileHref(f)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="min-w-0 flex-1 truncate text-xs font-semibold text-sky-700 underline underline-offset-2"
                              >
                                {f.fileName ?? "ไฟล์"}
                              </a>
                            ) : (
                              <input
                                value={f.linkUrl ?? ""}
                                onChange={(e) => patchFile(t.id, f.id, { linkUrl: e.target.value.trim() || undefined })}
                                placeholder="🔗 วางลิงก์ Google Drive (ไฟล์ใหญ่เกิน 50MB)"
                                className={`${inputSm} min-w-0 flex-1`}
                              />
                            )}
                            <span className={`shrink-0 text-[11px] ${faint}`}>{formatFileSize(f.fileSize)}</span>
                            {/* 📏 ขนาดงานจริง — อ่านจากอาร์ตบอร์ดให้เอง แก้เองได้ถ้าไฟล์อ่านไม่ออก */}
                            <span
                              className="flex shrink-0 items-center gap-1 rounded-lg bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-500"
                              title="ขนาดงานจริง (มม.) — ใช้เป็นกรอบตอนลูกค้าวางลายบนเว็บ"
                            >
                              📏
                              <input
                                value={f.widthMm ?? ""}
                                onChange={(e) =>
                                  patchFile(t.id, f.id, { widthMm: Number(e.target.value) || undefined })
                                }
                                inputMode="decimal"
                                placeholder="กว้าง"
                                className="w-12 bg-transparent text-center outline-none placeholder:text-slate-300"
                              />
                              ×
                              <input
                                value={f.heightMm ?? ""}
                                onChange={(e) =>
                                  patchFile(t.id, f.id, { heightMm: Number(e.target.value) || undefined })
                                }
                                inputMode="decimal"
                                placeholder="สูง"
                                className="w-12 bg-transparent text-center outline-none placeholder:text-slate-300"
                              />
                              มม.
                            </span>
                            {/* 👕 สกินเฉพาะไฟล์นี้ — ทับสกินของทั้งชุด (เคสคนละรุ่นรูกล้องไม่เท่ากัน) */}
                            <label
                              {...skinDropProps(t, f.id).handlers}
                              className={`${btnSmNeutral} shrink-0 cursor-pointer ${
                                skinDropProps(t, f.id).on
                                  ? "!border-emerald-500 !bg-emerald-50 !text-emerald-700 ring-2 ring-emerald-300"
                                  : f.skinUrl
                                    ? "!border-emerald-300 !text-emerald-700"
                                    : ""
                              }`}
                              title={
                                f.skinUrl
                                  ? "ไฟล์นี้มีสกินของตัวเอง — กดหรือลากรูปมาวางเพื่อเปลี่ยน"
                                  : "ใส่สกินเฉพาะไฟล์นี้ (PNG พื้นโปร่งใส) — กดเลือกหรือลากไฟล์มาวางก็ได้ · ไม่ใส่ = ใช้สกินของทั้งชุด"
                              }
                            >
                              {skinDropProps(t, f.id).on ? "👕 วางเลย" : f.skinUrl ? "👕 มีสกิน" : "👕 สกิน"}
                              <input
                                type="file"
                                accept="image/png"
                                className="hidden"
                                onChange={(e) => {
                                  const img = e.target.files?.[0];
                                  e.target.value = "";
                                  if (img) void pickSkin(t, img, f.id);
                                }}
                              />
                            </label>
                            {f.skinUrl && (
                              <button
                                type="button"
                                onClick={() => patchFile(t.id, f.id, { skinUrl: undefined })}
                                className={`${btnSmGhost} shrink-0`}
                                title="เอาสกินของไฟล์นี้ออก (กลับไปใช้สกินของทั้งชุด)"
                              >
                                ↺
                              </button>
                            )}
                            {/* ใช้ไฟล์นี้ทำรูปตัวอย่างของชุด (เรนเดอร์หน้าแรกในเบราว์เซอร์) */}
                            <button
                              type="button"
                              onClick={() =>
                                patch(t.id, { files: files.filter((x) => x.id !== f.id) })
                              }
                              className={`${btnSmDanger} shrink-0`}
                              title="เอาไฟล์นี้ออกจากชุด"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                      </div>

                      {/* ── คอลัมน์ขวา: ค่าที่ใช้ตอนลูกค้าวางลายบนเว็บ + ช่องใส่รูป ── */}
                      <div className="space-y-3">
                    {/* ── ค่าที่ใช้ตอนลูกค้า "วางลายบนเว็บ" ── */}
                    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-sky-50/70 px-3 py-2 ring-1 ring-sky-100">
                      <span className="text-[11px] font-bold text-sky-800">🖼 ตอนลูกค้าวางลายบนเว็บ</span>
                      {/* 👕 สกินสินค้าของทั้งชุด — วางทับลายให้ลูกค้าเห็นเป็นสินค้าจริง (ไม่ติดไปกับไฟล์พิมพ์) */}
                      <span className="flex items-center gap-1.5">
                        {t.skinUrl && (
                          <button
                            type="button"
                            onClick={() => setZoom({ src: t.skinUrl!, name: `สกิน ${t.name}` })}
                            className="rounded-md ring-1 ring-slate-200 transition hover:ring-amber-400"
                            title="กดเพื่อดูสกินแบบเต็ม"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={t.skinUrl}
                              alt="สกินสินค้า"
                              className="h-7 w-7 rounded-md bg-[repeating-conic-gradient(#e2e8f0_0_25%,#fff_0_50%)] bg-[length:8px_8px] object-contain"
                            />
                          </button>
                        )}
                        <label
                          {...skinDropProps(t).handlers}
                          className={`${btnSmNeutral} cursor-pointer ${
                            skinDropProps(t).on ? "!border-emerald-500 !bg-emerald-50 !text-emerald-700 ring-2 ring-emerald-300" : ""
                          }`}
                          title="PNG พื้นโปร่งใส วางทับลายให้เห็นเป็นสินค้าจริง — กดเลือกหรือลากไฟล์มาวางก็ได้ · เป็นภาพพรีวิว ไม่ติดไปกับไฟล์ที่ส่งพิมพ์"
                        >
                          {skinDropProps(t).on
                            ? "👕 วางเลย"
                            : t.skinUrl
                              ? "👕 เปลี่ยนสกิน"
                              : "👕 สกินสินค้า (PNG) · ลากวางได้"}
                          <input
                            type="file"
                            accept="image/png"
                            className="hidden"
                            onChange={(e) => {
                              const img = e.target.files?.[0];
                              e.target.value = "";
                              if (img) void pickSkin(t, img);
                            }}
                          />
                        </label>
                        {t.skinUrl && (
                          <button type="button" onClick={() => patch(t.id, { skinUrl: undefined })} className={btnSmDanger}>
                            ลบสกิน
                          </button>
                        )}
                      </span>
                      <label className="flex items-center gap-1 text-[11px] text-slate-600">
                        ตัดตก
                        <input
                          value={t.bleedMm ?? ""}
                          onChange={(e) => patch(t.id, { bleedMm: Number(e.target.value) || undefined })}
                          inputMode="decimal"
                          placeholder={String(DEFAULT_BLEED_MM)}
                          className={`${inputSm} w-14 text-center`}
                        />
                        มม.
                      </label>
                      <label className="flex items-center gap-1 text-[11px] text-slate-600">
                        เขตปลอดภัย
                        <input
                          value={t.safeMm ?? ""}
                          onChange={(e) => patch(t.id, { safeMm: Number(e.target.value) || undefined })}
                          inputMode="decimal"
                          placeholder={String(DEFAULT_SAFE_MM)}
                          className={`${inputSm} w-14 text-center`}
                        />
                        มม.
                      </label>
                      {/* งานรวมแผ่น เช่น สติกเกอร์วงกลม 4 ดวง/แผ่น — ใบงานจะสรุปให้ทีมผลิตว่าเท่ากับกี่แผ่น */}
                      <label
                        className="flex items-center gap-1 text-[11px] text-slate-600"
                        title="1 แผ่นพิมพ์ได้กี่ชิ้น — ลูกค้ายังสั่งเป็นชิ้นเหมือนเดิม แต่ใบงานจะบอกว่าเท่ากับกี่แผ่น · เว้นว่าง = งานชิ้นต่อแผ่น"
                      >
                        ชิ้นต่อแผ่น
                        <input
                          value={t.perSheet ?? ""}
                          onChange={(e) => patch(t.id, { perSheet: Number(e.target.value) || undefined })}
                          inputMode="numeric"
                          placeholder="—"
                          className={`${inputSm} w-14 text-center`}
                        />
                      </label>
                      <span className={`text-[11px] ${faint}`}>
                        ไฟล์ที่ยังไม่มีขนาด 📏 ลูกค้าจะวางลายบนเว็บไม่ได้ (ระบบเดาจากชื่อตัวเลือกให้แทน)
                      </span>
                    </div>

                    {/*
                      🧩 ช่องใส่รูป (Theme) — กำหนดที่ระดับชุด ใช้กับทุกไฟล์ในชุด
                      งานที่ต้องวางหลายรูปบนแผ่นเดียว (สติกเกอร์ 4 ดวง · photobooth strip · สกรีน 2 ด้าน)
                      ตัวจัดช่องต้องใช้พื้นที่กว้าง เลยแยกไปเปิดเป็นหน้าต่างเต็ม ๆ แทนการฝังในการ์ด
                    */}
                    {(() => {
                      const list = slotsOf(t);
                      const names = list.map((sl, i) => sl.label?.trim() || `${i + 1}`).join(" · ");
                      return (
                        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-violet-50/60 px-3 py-2.5 ring-1 ring-violet-100">
                          <span className="text-[11px] font-bold text-violet-800">🧩 ช่องใส่รูป (Theme)</span>
                          <span className={`min-w-0 flex-1 truncate text-[11px] ${faint}`}>
                            {files.length > 1 && (
                              <span className="mr-1 font-semibold text-violet-700">
                                {files.length} ด้าน ({files.map((f, i) => f.side?.trim() || `ด้านที่ ${i + 1}`).join(" · ")}) ·
                              </span>
                            )}
                            {list.length ? (
                              <>
                                <span className="font-semibold text-violet-700">{list.length} ช่อง</span> · {names}
                                {t.slotsRequired ? " · ต้องใส่ครบทุกช่อง" : ""}
                              </>
                            ) : (
                              "ยังไม่ได้ตั้งช่อง — ลูกค้าจะวางลายเดียวเต็มกรอบตามปกติ"
                            )}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setThemeFile(null);
                              setThemeOn(t.id);
                            }}
                            className={btnSmDucky}
                          >
                            {list.length ? "🧩 แก้ไข Theme" : "🧩 ตั้งค่า Theme"}
                          </button>
                        </div>
                      );
                    })()}

                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                      <button
                        type="button"
                        onClick={() => patch(t.id, { files: [...files, { id: rid("f") }] })}
                        className={btnSmNeutral}
                      >
                        ＋ เพิ่มแถวลิงก์
                      </button>
                      <label className={`${btnSmNeutral} cursor-pointer`}>
                        🖼 รูปตัวอย่าง
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.target.value = "";
                            if (f) void pickPreview(t, f);
                          }}
                        />
                      </label>
                      {t.previewUrl && (
                        <button type="button" onClick={() => patch(t.id, { previewUrl: undefined })} className={btnSmDanger}>
                          ลบรูป
                        </button>
                      )}
                      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
                        <input
                          type="checkbox"
                          checked={!!t.hidden}
                          onChange={(e) => patch(t.id, { hidden: e.target.checked || undefined })}
                          className="h-4 w-4 accent-slate-500"
                        />
                        ซ่อนทั้งชุด
                      </label>
                      {/* สินค้าที่ผูกชุดนี้อยู่ — กด ✕ เพื่อปลดออกได้จากตรงนี้เลย */}
                      {used.map((u) => (
                        <span
                          key={u.id}
                          className={`${badge} gap-1 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200`}
                          title={`${u.name} ใช้ชุดนี้อยู่`}
                        >
                          🔗 <span className="max-w-[10rem] truncate">{u.name}</span>
                          <button
                            type="button"
                            onClick={() => void unlinkFromProduct(t, u.id)}
                            disabled={!!busy[t.id]}
                            className="text-emerald-500 transition hover:text-rose-600 disabled:opacity-40"
                            title="ปลดชุดนี้ออกจากสินค้าตัวนี้"
                          >
                            ✕
                          </button>
                        </span>
                      ))}

                      <div className="ml-auto flex items-center gap-2">
                        <button type="button" onClick={() => remove(t)} className={btnSmDanger}>
                          🗑 ลบทั้งชุด
                        </button>
                        <button
                          type="button"
                          onClick={() => save(t)}
                          disabled={saving === t.id || !t.name.trim()}
                          className={t._dirty ? btnPrimary : btnNeutral}
                        >
                          {saving === t.id ? "กำลังบันทึก…" : t._dirty ? "💾 บันทึก" : "บันทึกแล้ว"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          </div>
        </div>
          ))}
        </div>
      )}
        </div>
      </div>

      {/* ── หน้าต่างตั้งค่า Theme — กว้างเกือบเต็มจอ เพราะต้องลากช่องบนรูปจริง ── */}
      {(() => {
        const t = list.find((x) => x.id === themeOn);
        if (!t) return null;
        const files = templateFiles(t);
        return (
          <div
            role="dialog"
            aria-label={`ตั้งค่า Theme ${t.name}`}
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/70 p-3 backdrop-blur-sm sm:p-6"
          >
            <div className="w-full max-w-6xl rounded-2xl bg-white p-4 shadow-2xl sm:p-5">
              {(() => {
                /**
                 * ไฟล์ในชุดที่ถือว่าเป็น "ด้าน" — งานสกรีน 2 ด้านจะมีมากกว่าหนึ่ง
                 * ผังช่องตั้งได้ทั้งระดับชุด (ใช้ร่วมทุกไฟล์) และระดับไฟล์ (เฉพาะด้านนั้น)
                 */
                const multi = files.length > 1;
                const cur = themeFile ? files.find((f) => f.id === themeFile) : null;
                const choiceOf = (f: TemplateFile) => (f.choice ?? "").trim();
                /**
                 * ไฟล์ในชุดแยกกันด้วยอะไร — "ด้านของชิ้นเดียวกัน" กับ "คนละค่าตัวเลือก" คนละเรื่องกัน
                 * ชุดที่ผูกกลุ่มตัวเลือก (เช่นแยกตาม “ขนาด”) ลูกค้าหยิบไปแค่ไฟล์ของค่าที่เลือก —
                 * เอาช่องไปแจกข้ามค่าตัวเลือกไม่ได้ ไม่งั้นแต่ละขนาดจะเหลือช่องเดียว
                 */
                const byChoice = !!t.optionLabel?.trim() && files.some((f) => choiceOf(f));
                const oneChoice = files.every((f) => choiceOf(f) === choiceOf(files[0]));
                /** ป้ายของแต่ละไฟล์ — ต้องบอกทั้งค่าตัวเลือกและชื่อด้าน ไม่งั้นแอดมินแยกไม่ออกว่ากำลังตั้งของอะไร */
                const tabLabel = (f: TemplateFile, i: number) =>
                  [byChoice ? choiceOf(f) || "(ไม่ระบุค่า)" : "", f.side?.trim()].filter(Boolean).join(" · ") ||
                  (byChoice ? `ไฟล์ที่ ${i + 1}` : `ด้านที่ ${i + 1}`);
                const own = cur?.slots ?? [];
                /** ผังที่ด้านนี้ใช้จริง (ไม่มีของตัวเอง = ตกไปใช้ของทั้งชุด) */
                const shown = cur ? (own.length ? own : slotsOf(t)) : slotsOf(t);
                const inherited = !!cur && !own.length && slotsOf(t).length > 0;
                /** ทุกด้านมีผังของตัวเองแล้ว → ผังกลางไม่ถูกใช้งาน ไม่ต้องให้แก้ */
                const centralIdle = multi && !slotsOf(t).length && files.every((f) => (f.slots ?? []).length > 0);
                const sizeOf = (f?: TemplateFile) =>
                  f?.widthMm && f?.heightMm ? f.widthMm / f.heightMm : undefined;

                return (
                  <>
                    <div className="mb-3 flex items-start gap-3 border-b border-slate-100 pb-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-extrabold text-slate-800">
                          🧩 ตั้งค่า Theme — ช่องใส่รูป
                          {cur && (
                            <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-700">
                              {tabLabel(cur, files.findIndex((f) => f.id === cur.id))}
                            </span>
                          )}
                        </p>
                        <p className={`mt-0.5 truncate text-xs ${faint}`}>
                          {t.name} ·{" "}
                          {cur
                            ? `ผังนี้ใช้เฉพาะไฟล์นี้ (ลูกค้าเห็นเป็นหน้าของตัวเอง)`
                            : multi
                              ? `ผังกลาง — ไฟล์ที่ไม่ได้ตั้งของตัวเองจะใช้ผังนี้ (${files.length} ไฟล์ในชุด)`
                              : `ใช้กับทุกไฟล์ในชุดนี้ (${files.length} ไฟล์)`}
                        </p>
                      </div>
                      <button type="button" onClick={() => setThemeOn(null)} className={btnSmNeutral}>
                        ✕ ปิด
                      </button>
                    </div>

                    {/*
                      ── เลือกด้านที่จะตั้งช่อง ──
                      ชุดที่มีหลายไฟล์ = งานหลายด้าน แต่ละด้านเป็นคนละหน้าฝั่งลูกค้า
                      ตรงนี้คือที่เดียวที่บอกได้ว่ากำลังตั้งของด้านไหนอยู่
                    */}
                    {/* ค่าระดับชุด — ต้องเห็นได้เสมอ ไม่ผูกกับว่าหน้าไหนมีช่องกี่ช่อง */}
                    <label
                      className="mb-2 flex w-fit cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-slate-600"
                      title="ติ๊กแล้วลูกค้าต้องใส่รูปให้ครบทุกช่อง (ทุกด้าน) ถึงจะกดใช้ลายได้"
                    >
                      <input
                        type="checkbox"
                        checked={!!t.slotsRequired}
                        onChange={(e) => patch(t.id, { slotsRequired: e.target.checked || undefined })}
                        className="h-3.5 w-3.5 accent-violet-500"
                      />
                      ต้องใส่ครบทุกช่อง{multi ? " (ทุกด้าน)" : ""}
                    </label>

                    {multi && (
                      <div className="mb-3 flex flex-wrap items-center gap-1.5">
                        <span className={`text-[11px] ${faint}`}>ตั้งช่องของ:</span>
                        <button
                          type="button"
                          onClick={() => setThemeFile(null)}
                          className={`rounded-full px-3 py-1 text-[11px] font-bold transition ${
                            !cur ? "bg-violet-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          }`}
                        >
                          ผังกลาง (ทั้งชุด) · {centralIdle ? "ไม่ได้ใช้" : `${slotsOf(t).length} ช่อง`}
                        </button>
                        {files.map((f, fi) => {
                          const n = (f.slots ?? []).length;
                          return (
                            <button
                              key={f.id}
                              type="button"
                              onClick={() => setThemeFile(f.id)}
                              className={`rounded-full px-3 py-1 text-[11px] font-bold transition ${
                                cur?.id === f.id ? "bg-violet-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                              }`}
                              title={f.fileName}
                            >
                              {tabLabel(f, fi)} · {n ? `${n} ช่อง` : `ใช้ผังกลาง (${slotsOf(t).length})`}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/*
                      ชุดไฟล์เดียว = งานหน้าเดียว · ช่องหลายช่องบนหน้าเดียว ≠ งาน 2 ด้าน
                      กดปุ่มนี้แล้วได้แถวไฟล์ที่สองพร้อมชื่อด้าน เหลือแค่อัปไฟล์ .ai ของด้านหลัง
                    */}
                    {!multi && (
                      <div className="mb-2 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
                        <span className={`min-w-0 flex-1 text-[11px] ${faint}`}>
                          ชุดนี้มีไฟล์เดียว = <strong className="font-bold text-slate-700">งานหน้าเดียว</strong> — ช่องหลายช่องจะอยู่บนหน้าเดียวกันหมด ·
                          งานสกรีน 2 ด้านต้องมีไฟล์ของแต่ละด้าน ลูกค้าถึงจะได้กระดานคนละหน้า
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const first = files[0];
                            const back = {
                              id: rid("f"),
                              side: "ด้านหลัง",
                              choice: first?.choice,
                              // ยืมขนาดจากด้านแรกไว้ก่อน (งาน 2 ด้านส่วนใหญ่ขนาดเท่ากัน) แก้ทีหลังได้
                              widthMm: first?.widthMm,
                              heightMm: first?.heightMm,
                            };
                            patch(t.id, {
                              files: [
                                ...files.map((f, i) => (i === 0 && !f.side?.trim() ? { ...f, side: "ด้านหน้า" } : f)),
                                back,
                              ],
                            });
                            setThemeFile(back.id);
                          }}
                          className={btnSmDucky}
                        >
                          ➕ ทำเป็นงาน 2 ด้าน
                        </button>
                      </div>
                    )}

                    {/*
                      ผังกลางที่มีหลายช่อง + ชุดหลายด้าน = สับสนที่สุด
                      (ทุกด้านไปหยิบผังเดียวกันมาใช้ ทั้งที่ควรเป็นด้านละหน้า)
                      ปุ่มนี้แจกช่องที่ 1 ให้ด้านที่ 1 · ช่องที่ 2 ให้ด้านที่ 2 · ตำแหน่งเดิมทุกช่อง
                    */}
                    {!cur && multi && slotsOf(t).length > 1 && (
                      <div className="mb-2 flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 ring-1 ring-amber-200">
                        <span className="min-w-0 flex-1 text-[11px] font-semibold text-amber-900">
                          ผังกลางมี {slotsOf(t).length} ช่องอยู่บน<strong>หน้าเดียวกัน</strong> และทุกด้านหยิบผังนี้ไปใช้เหมือนกันหมด —
                          งานหลายด้านควรเป็นด้านละหน้า
                          {byChoice && !oneChoice && (
                            <>
                              <br />
                              ⚠️ ชุดนี้แยกไฟล์ตาม “{t.optionLabel?.trim()}” — ไฟล์คนละค่าไม่ใช่คนละหน้าของชิ้นเดียวกัน
                              แยกอัตโนมัติให้ไม่ได้ ให้กดเลือกไฟล์ด้านบนแล้วตั้งช่องของไฟล์นั้นเอง
                            </>
                          )}
                        </span>
                        {(!byChoice || oneChoice) && (
                        <button
                          type="button"
                          onClick={async () => {
                            const central = slotsOf(t);
                            // ช่องที่ i → หน้าที่ i · ช่องที่เกินจำนวนหน้า ยกไปไว้หน้าสุดท้าย
                            const per = files.map((_, i) =>
                              central.filter((_, k) => k === i || (i === files.length - 1 && k > i))
                            );
                            /** ช่องน้อยกว่าหน้า = มีหน้าที่ไม่ได้อะไรเลย — ห้ามล้างผังกลาง ไม่งั้นหน้านั้นกลายเป็นกระดานว่าง */
                            const allCovered = per.every((m) => m.length > 0);
                            if (
                              !(await askConfirm({
                                icon: "✂️",
                                title: `แยกผังกลาง ${central.length} ช่อง ออกเป็น ${files.length} หน้า?`,
                                detail: [
                                  files
                                    .map((f, i) =>
                                      per[i].length
                                        ? `${tabLabel(f, i)} ← ${per[i].length} ช่อง`
                                        : `${tabLabel(f, i)} ← ไม่ได้ช่อง (ใช้ผังกลางต่อ)`
                                    )
                                    .join("\n"),
                                  "ตำแหน่ง/ขนาดของทุกช่องเหมือนเดิม",
                                  allCovered
                                    ? "แล้วผังกลางจะว่าง"
                                    : "ผังกลางยังเก็บไว้ให้หน้าที่ไม่ได้ช่องใช้ต่อ",
                                ].join("\n\n"),
                                confirmLabel: "แยกเป็นหน้า ๆ",
                              }))
                            )
                              return;
                            patch(t.id, {
                              ...(allCovered ? { slots: undefined } : {}),
                              files: files.map((f, i) => {
                                const mine = per[i];
                                const side = f.side?.trim();
                                return {
                                  ...f,
                                  slots: mine.length
                                    ? // ชื่อช่องที่ซ้ำกับชื่อด้านไม่มีประโยชน์แล้ว (หน้าบอกอยู่แล้วว่าด้านไหน)
                                      mine.map((sl) => (sl.label?.trim() === side ? { ...sl, label: undefined } : sl))
                                    : f.slots,
                                };
                              }),
                            });
                            setThemeFile(files[0]?.id ?? null);
                          }}
                          className={btnSmDucky}
                        >
                          ✂️ แยกผังกลางเป็นหน้า ๆ
                        </button>
                        )}
                      </div>
                    )}

                    {inherited && (
                      <p className="mb-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200">
                        ด้านนี้ยังไม่มีผังของตัวเอง — ที่เห็นคือผังกลาง แก้ตรงนี้แล้วจะกลายเป็นผังเฉพาะด้านนี้ทันที
                      </p>
                    )}

                    {!cur && centralIdle ? (
                      <div className="rounded-xl bg-slate-50 px-4 py-6 text-center ring-1 ring-slate-200">
                        <p className="text-sm font-bold text-slate-700">ผังกลางไม่ได้ใช้งานแล้ว</p>
                        <p className={`mx-auto mt-1 max-w-xl text-[12px] ${faint}`}>
                          ทุกด้านมีผังช่องของตัวเองครบแล้ว — ผังกลางมีไว้เผื่อด้านที่ยังไม่ได้ตั้งเท่านั้น
                          เลือกด้านที่ปุ่มด้านบนเพื่อแก้ผังของด้านนั้น
                        </p>
                        <div className="mt-3 flex flex-wrap justify-center gap-2">
                          {files.map((f, fi) => (
                            <button key={f.id} type="button" onClick={() => setThemeFile(f.id)} className={btnSmDucky}>
                              ไปที่ {tabLabel(f, fi)}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                    <SlotEditor
                      key={cur?.id ?? "set"}
                      slots={shown}
                      previewUrl={cur?.previewUrl || t.previewUrl || files.find((f) => f.previewUrl)?.previewUrl}
                      // ทรงของเวทีลากต้องเท่างานจริงของด้านนั้น ไม่งั้นตำแหน่งที่ลากไม่ตรงกับที่ลูกค้าเห็น
                      ratio={sizeOf(cur ?? undefined) ?? sizeOf(files.find((x) => x.widthMm && x.heightMm))}
                      required={t.slotsRequired}
                      onChange={(next) =>
                        cur
                          ? patchFile(t.id, cur.id, { slots: next.length ? next : undefined })
                          : patch(t.id, { slots: next.length ? next : undefined })
                      }
                      onRequiredChange={(v) => patch(t.id, { slotsRequired: v || undefined })}
                    />
                    )}
                  </>
                );
              })()}

              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                <span className={`min-w-0 flex-1 text-[11px] ${faint}`}>
                  {t._dirty ? "ยังไม่บันทึก — กดเสร็จแล้วจะบันทึกให้เลย" : "บันทึกแล้ว"}
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    if (t._dirty) await save(t);
                    setThemeOn(null);
                  }}
                  disabled={saving === t.id}
                  className={`${btnSmDucky} disabled:opacity-50`}
                >
                  {saving === t.id ? "กำลังบันทึก…" : "✓ เสร็จแล้ว"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── ดูรูปตัวอย่างขนาดใหญ่ (กดพื้นหลัง/ปุ่มปิด/Esc เพื่อออก) ── */}
      {zoom && (
        <div
          role="dialog"
          aria-label={`รูปตัวอย่าง ${zoom.name}`}
          onClick={() => setZoom(null)}
          className="fixed inset-0 z-50 grid place-items-center bg-slate-900/70 p-4 backdrop-blur-sm"
        >
          <div className="max-h-full w-full max-w-2xl overflow-auto rounded-2xl bg-white p-3 shadow-2xl">
            <div className="mb-2 flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-700">{zoom.name}</span>
              <a
                href={zoom.src}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className={btnSmNeutral}
              >
                เปิดแท็บใหม่
              </a>
              <button type="button" onClick={() => setZoom(null)} className={btnSmNeutral}>
                ✕ ปิด
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={zoom.src}
              alt={`รูปตัวอย่าง ${zoom.name}`}
              onClick={(e) => e.stopPropagation()}
              className="mx-auto max-h-[70vh] w-auto rounded-xl bg-white object-contain ring-1 ring-slate-200"
            />
          </div>
        </div>
      )}

      <p className={`mt-6 text-xs ${faint}`}>
        ผูกชุดเทมเพลตกับสินค้าได้ที่ <Link href="/admin/products" className="underline">หน้าแก้ไขสินค้า</Link> →
        หัวข้อ <strong>📐 เทมเพลตไฟล์งาน</strong>
      </p>

      {confirmDialog}
    </div>
  );
}

export default function AdminTemplatesPage() {
  return (
    <RequirePerm perm="products.manage">
      <AdminTemplatesInner />
    </RequirePerm>
  );
}
