"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import RequirePerm from "@/components/RequirePerm";
import { useCan } from "@/lib/perm-context";
import RichEditor from "@/components/RichEditor";
import { PAGE_OVERRIDES, articleOf, blocksToHtml, isPageSlug, slugify, thaiDate, type Article } from "@/lib/articles";
import { PAGE_STARTERS } from "@/lib/page-starters";
import { btnNeutral, btnPrimary, btnSmDanger, btnSmGhost, card, faint, h1, muted, shortTime } from "@/lib/admin-ui";

/**
 * ✍️ เขียนบทความ — ทีมคอนเทนต์เขียนเอง ไม่ต้องรอโปรแกรมเมอร์
 * เนื้อหาเป็นท่อน ๆ (หัวข้อ + ข้อความ + รูป) แบบเดียวกับเนื้อหาสินค้า — คุ้นมือ
 */

const input =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100";

const EMPTY: Article = {
  slug: "",
  title: "",
  excerpt: "",
  blocks: [],
  html: "",
  tags: [],
  published: false,
  createdAt: "",
  updatedAt: "",
};

async function uploadImage(file: File): Promise<{ url?: string; error?: string }> {
  try {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("productId", "articles");
    const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
    const j = (await res.json()) as { url?: string; error?: string };
    return res.ok && j.url ? { url: j.url } : { error: j.error ?? "อัปโหลดไม่สำเร็จ" };
  } catch {
    return { error: "อัปโหลดไม่สำเร็จ" };
  }
}

/** ปุ่มอัปโหลดรูป (ปก/ในท่อน) */
function ImgBtn({ value, onChange, label }: { value?: string; onChange: (v: string | undefined) => void; label: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2">
      {value && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={value} alt="" className="h-12 w-20 rounded-lg object-cover ring-1 ring-slate-200" />
      )}
      <label className={`${btnNeutral} cursor-pointer text-xs`}>
        {busy ? "กำลังอัปโหลด…" : value ? `🖼 เปลี่ยน${label}` : `🖼 ${label}`}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          disabled={busy}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setBusy(true);
            setErr("");
            const r = await uploadImage(f);
            if (r.url) onChange(r.url);
            else setErr(r.error ?? "");
            setBusy(false);
          }}
        />
      </label>
      {value && (
        <button type="button" onClick={() => onChange(undefined)} className={btnSmDanger}>
          เอารูปออก
        </button>
      )}
      {err && <span className="text-xs font-semibold text-rose-600">{err}</span>}
    </div>
  );
}

function ArticlesInner() {
  const mayManage = useCan()("products.manage");
  const [list, setList] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Article | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/articles", { cache: "no-store" }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
    setList(((r as { list?: Article[] } | null)?.list ?? []).map((a) => articleOf(a)!).filter(Boolean));
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  function startNew() {
    setEditing({ ...EMPTY });
    setIsNew(true);
    setMsg("");
  }
  function startEdit(a: Article) {
    const copy = JSON.parse(JSON.stringify(a)) as Article;
    // บทความเก่าแบบท่อน → แปลงเป็น rich text ให้แก้ต่อได้เลย
    if (!copy.html && copy.blocks.length) {
      copy.html = blocksToHtml(copy.blocks);
      copy.blocks = [];
    }
    setEditing(copy);
    setIsNew(false);
    setMsg("");
  }
  /** เริ่มเขียนทับหน้าเว็บหลัก — เปิดมาพร้อมเนื้อหาปัจจุบันของหน้านั้น แก้ต่อได้เลย */
  function startPage(slug: string, label: string) {
    setEditing({ ...EMPTY, slug, title: label, excerpt: "", html: PAGE_STARTERS[slug] ?? "" });
    setIsNew(true);
    setMsg("");
  }

  const patch = (p: Partial<Article>) => setEditing((a) => (a ? { ...a, ...p } : a));

  async function save(publish?: boolean) {
    if (!editing) return;
    const a: Article = {
      ...editing,
      blocks: [], // เขียนด้วย rich text แล้ว — เก็บ html อย่างเดียว
      slug: editing.slug.trim() || slugify(editing.title),
      published: publish ?? editing.published,
      createdAt: editing.createdAt || new Date().toISOString(),
    };
    if (!a.title.trim()) return setMsg("ใส่ชื่อเรื่องก่อน");
    setSaving(true);
    setMsg("");
    const res = await fetch("/api/admin/articles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ article: a }),
    });
    const j = (await res.json().catch(() => ({}))) as { error?: string; article?: Article };
    setSaving(false);
    if (!res.ok) return setMsg(j.error ?? "บันทึกไม่สำเร็จ");
    setEditing(null);
    setMsg(publish ? "เผยแพร่แล้ว ✓" : "บันทึกแล้ว ✓");
    void load();
  }

  async function remove(slug: string) {
    if (!confirm("ลบบทความนี้ถาวร?")) return;
    const res = await fetch(`/api/admin/articles?slug=${encodeURIComponent(slug)}`, { method: "DELETE" });
    if (res.ok) void load();
  }

  /* ── โหมดแก้ไข ── */
  if (editing) {
    return (
      <div className="mx-auto max-w-6xl pb-24">
        <div className="flex items-center justify-between">
          <h1 className={h1}>{isNew ? "✍️ เขียนบทความใหม่" : "✍️ แก้บทความ"}</h1>
          <button type="button" onClick={() => setEditing(null)} className={btnNeutral}>
            ← กลับรายการ
          </button>
        </div>

        <section className={`mt-4 space-y-4 p-5 ${card}`}>
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">ชื่อเรื่อง</span>
            <input
              value={editing.title}
              onChange={(e) => {
                const title = e.target.value;
                // ยังไม่เคยตั้ง slug เอง → เดาจากชื่อเรื่องให้ (เฉพาะบทความใหม่)
                patch(isNew && !editing.slug ? { title } : { title });
              }}
              placeholder="เช่น 5 เทคนิคเตรียมไฟล์ให้งานพิมพ์สีตรงใจ"
              className={`mt-1 text-base font-bold ${input}`}
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">ลิงก์ (slug) — a-z 0-9 ขีดกลาง</span>
              <div className="mt-1 flex items-center gap-1">
                <span className={`text-xs ${faint}`}>/articles/</span>
                <input
                  value={editing.slug}
                  onChange={(e) => patch({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
                  placeholder="print-file-tips"
                  className={input}
                  disabled={!isNew || isPageSlug(editing.slug)}
                  title={
                    isPageSlug(editing.slug)
                      ? "slug ของหน้าเว็บหลัก ถูกจองไว้ตายตัว"
                      : isNew
                        ? undefined
                        : "เปลี่ยน slug หลังเผยแพร่จะทำให้ลิงก์เดิมเสีย จึงล็อกไว้"
                  }
                />
              </div>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">แท็ก (คั่นด้วย ,)</span>
              <input
                value={editing.tags.join(", ")}
                onChange={(e) => patch({ tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })}
                placeholder="เตรียมไฟล์, สติกเกอร์"
                className={`mt-1 ${input}`}
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-semibold text-slate-600">เกริ่นสั้น ๆ (ขึ้นหน้ารวม + Google)</span>
            <textarea
              value={editing.excerpt}
              onChange={(e) => patch({ excerpt: e.target.value })}
              rows={2}
              placeholder="สรุป 1-2 ประโยคว่าบทความนี้ช่วยอะไรลูกค้า"
              className={`mt-1 ${input}`}
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <span className="text-xs font-semibold text-slate-600">รูปปก (ฟีเจอร์)</span>
              <div className="mt-1">
                <ImgBtn value={editing.cover} onChange={(v) => patch({ cover: v })} label="เลือกรูปภาพ" />
              </div>
            </div>
            <div>
              <span className="text-xs font-semibold text-slate-600">รูปปกสำหรับมือถือ</span>
              <p className={`text-[11px] ${faint}`}>ไม่ใส่ = ใช้รูปปกปกติ · แนะนำแนวตั้ง/จัตุรัสให้พอดีจอเล็ก</p>
              <div className="mt-1">
                <ImgBtn value={editing.coverMobile} onChange={(v) => patch({ coverMobile: v })} label="เลือกรูปภาพ" />
              </div>
            </div>
          </div>
        </section>

        {/* ── เนื้อหาแบบ rich text (สไตล์ lnwshop) ── */}
        <section className="mt-4">
          <p className={`mb-1.5 text-xs font-semibold text-slate-600`}>
            เนื้อหา <span className={`font-normal ${faint}`}>— เลือกข้อความแล้วกดปุ่มจัดรูปแบบ · แทรกรูปได้ทั้งกดปุ่ม ลากมาวาง หรือวาง (paste) จากคลิปบอร์ด</span>
          </p>
          <RichEditor
            key={`${editing.slug}|${isNew}`}
            initialHtml={editing.html ?? ""}
            onChange={(html) => patch({ html })}
          />
        </section>

        {/* ── SEO (แบบ lnwshop) ── */}
        <section className={`mt-4 p-5 ${card}`}>
          <h2 className="text-sm font-bold text-slate-800">🔎 SEO</h2>
          <p className={`mt-0.5 text-xs ${faint}`}>
            ไม่กรอก = ใช้ชื่อเรื่องกับเกริ่นอัตโนมัติ · กรอกเมื่ออยากคุมคำที่ขึ้นบน Google เอง
          </p>
          <div className="mt-3 space-y-3">
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">Title</span>
              <input
                value={editing.seo?.title ?? ""}
                onChange={(e) => patch({ seo: { ...editing.seo, title: e.target.value } })}
                placeholder={editing.title || "หัวข้อที่จะขึ้นบน Google"}
                className={`mt-1 ${input}`}
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">Description</span>
              <textarea
                value={editing.seo?.description ?? ""}
                onChange={(e) => patch({ seo: { ...editing.seo, description: e.target.value } })}
                rows={2}
                placeholder={editing.excerpt || "คำอธิบายใต้หัวข้อในผลค้นหา (~150 ตัวอักษร)"}
                className={`mt-1 ${input}`}
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">Keywords (คั่นด้วย ,)</span>
              <input
                value={editing.seo?.keywords ?? ""}
                onChange={(e) => patch({ seo: { ...editing.seo, keywords: e.target.value } })}
                placeholder="เช่น สั่งทำกระเป๋าปากบีบ, ของแจกงานแต่ง"
                className={`mt-1 ${input}`}
              />
            </label>
          </div>
        </section>

        {/* ── แถบบันทึกลอยล่าง ── */}
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-end gap-3">
            {msg && <span className="text-sm font-semibold text-rose-600">{msg}</span>}
            {editing.published && (
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">
                เผยแพร่อยู่
              </span>
            )}
            <button type="button" onClick={() => void save(false)} disabled={saving} className={btnNeutral}>
              {saving ? "กำลังบันทึก…" : editing.published ? "พักเป็นฉบับร่าง" : "💾 บันทึกร่าง"}
            </button>
            <button type="button" onClick={() => void save(true)} disabled={saving} className={btnPrimary}>
              {saving ? "กำลังบันทึก…" : "🚀 เผยแพร่"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── รายการ ── */
  const blogList = list.filter((a) => !isPageSlug(a.slug));
  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className={h1}>✍️ บทความ</h1>
          <p className={`mt-1 text-sm ${muted}`}>
            เขียนบทความขึ้นหน้าเว็บ <Link href="/articles" target="_blank" className="font-semibold text-amber-600 hover:underline">/articles ↗</Link> — ช่วย SEO ให้ลูกค้าหาร้านเจอ
          </p>
        </div>
        {mayManage && (
          <button type="button" onClick={startNew} className={btnPrimary}>
            ＋ เขียนบทความใหม่
          </button>
        )}
      </div>

      {msg && <p className="mt-3 text-sm font-semibold text-emerald-600">{msg}</p>}

      {/* ── หน้าเว็บหลักที่เขียนทับได้ ── */}
      <section className={`mt-5 p-4 ${card}`}>
        <h2 className="text-sm font-semibold text-slate-800">📄 หน้าเว็บหลัก (เขียนทับได้)</h2>
        <p className={`mt-0.5 text-xs ${faint}`}>
          เขียนเนื้อหาของตัวเองทับหน้าสำเร็จรูปได้ — เผยแพร่เมื่อไหร่หน้านั้นใช้เนื้อหาที่เขียน ·
          ลบทิ้ง = กลับไปใช้หน้าสำเร็จรูปเดิมทันที
        </p>
        <div className="mt-3 space-y-2">
          {PAGE_OVERRIDES.map((pg) => {
            const ov = list.find((a) => a.slug === pg.slug);
            return (
              <div key={pg.slug} className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-slate-800">{pg.label}</span>
                  <span className={`block text-xs ${faint}`}>{pg.path}</span>
                </span>
                {ov ? (
                  <>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${
                        ov.published
                          ? "bg-amber-50 text-amber-700 ring-amber-200"
                          : "bg-slate-100 text-slate-500 ring-slate-200"
                      }`}
                    >
                      {ov.published ? "✍️ ใช้ฉบับที่เขียนเอง" : "ร่าง (หน้าเดิมยังแสดงอยู่)"}
                    </span>
                    {mayManage && (
                      <>
                        <button type="button" onClick={() => startEdit(ov)} className={`${btnSmGhost} font-bold`}>
                          แก้ไข
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`ลบฉบับที่เขียนเอง แล้วกลับไปใช้หน้า ${pg.label} สำเร็จรูปเดิม?`))
                              void fetch(`/api/admin/articles?slug=${pg.slug}`, { method: "DELETE" }).then(() => load());
                          }}
                          className={btnSmDanger}
                        >
                          กลับหน้าเดิม
                        </button>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                      ใช้หน้าสำเร็จรูป
                    </span>
                    {mayManage && (
                      <button type="button" onClick={() => startPage(pg.slug, pg.label)} className={`${btnNeutral} text-xs`}>
                        ✍️ เขียนทับหน้านี้
                      </button>
                    )}
                  </>
                )}
                <a href={pg.path} target="_blank" rel="noopener noreferrer" className={btnSmGhost}>
                  ดู ↗
                </a>
              </div>
            );
          })}
        </div>
      </section>

      <div className={`mt-5 overflow-hidden ${card}`}>
        {loading ? (
          <p className="p-10 text-center text-sm text-slate-400">กำลังโหลด…</p>
        ) : blogList.length === 0 ? (
          <div className="p-12 text-center">
            <span className="text-5xl">✍️</span>
            <p className="mt-3 text-sm font-semibold text-slate-600">ยังไม่มีบทความ — เริ่มเขียนเรื่องแรกเลย</p>
            <p className={`mt-1 text-xs ${faint}`}>ไอเดีย: วิธีเตรียมไฟล์ · เลือกกระดาษยังไง · รีวิวงานที่เคยทำ</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {blogList.map((a) => (
              <li key={a.slug} className="flex flex-wrap items-center gap-3 p-4 transition hover:bg-slate-50/70">
                {a.cover ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={a.cover} alt="" className="h-12 w-20 shrink-0 rounded-lg object-cover ring-1 ring-slate-200" />
                ) : (
                  <span className="grid h-12 w-20 shrink-0 place-items-center rounded-lg bg-slate-100 text-xl">📝</span>
                )}
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => startEdit(a)}
                    className="block max-w-full truncate text-left text-sm font-bold text-slate-800 hover:text-amber-600 hover:underline"
                  >
                    {a.title}
                  </button>
                  <p className={`truncate text-xs ${faint}`}>
                    /articles/{a.slug} · {thaiDate(a.createdAt)} · แก้ล่าสุด {shortTime(a.updatedAt)}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${
                    a.published ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-slate-50 text-slate-500 ring-slate-200"
                  }`}
                >
                  {a.published ? "เผยแพร่" : "ฉบับร่าง"}
                </span>
                {a.published && (
                  <a
                    href={`/articles/${a.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={btnSmGhost}
                    title="เปิดหน้าจริง"
                  >
                    ดู ↗
                  </a>
                )}
                {mayManage && (
                  <>
                    <button type="button" onClick={() => startEdit(a)} className={`${btnSmGhost} font-bold`}>
                      แก้ไข
                    </button>
                    <button type="button" onClick={() => void remove(a.slug)} className={btnSmDanger}>
                      ลบ
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function AdminArticlesPage() {
  return (
    <RequirePerm perm="products.view">
      <ArticlesInner />
    </RequirePerm>
  );
}
