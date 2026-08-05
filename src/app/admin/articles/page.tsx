"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import RequirePerm from "@/components/RequirePerm";
import { useCan } from "@/lib/perm-context";
import { articleOf, slugify, thaiDate, type Article, type ArticleBlock } from "@/lib/articles";
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
  blocks: [{ heading: "", text: "" }],
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
    setEditing({ ...EMPTY, blocks: [{ heading: "", text: "" }] });
    setIsNew(true);
    setMsg("");
  }
  function startEdit(a: Article) {
    setEditing(JSON.parse(JSON.stringify(a)) as Article);
    setIsNew(false);
    setMsg("");
  }

  const patch = (p: Partial<Article>) => setEditing((a) => (a ? { ...a, ...p } : a));
  const patchBlock = (i: number, p: Partial<ArticleBlock>) =>
    setEditing((a) => (a ? { ...a, blocks: a.blocks.map((b, j) => (j === i ? { ...b, ...p } : b)) } : a));

  async function save(publish?: boolean) {
    if (!editing) return;
    const a: Article = {
      ...editing,
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
      <div className="mx-auto max-w-3xl pb-24">
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
                  disabled={!isNew}
                  title={isNew ? undefined : "เปลี่ยน slug หลังเผยแพร่จะทำให้ลิงก์เดิมเสีย จึงล็อกไว้"}
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

          <div>
            <span className="text-xs font-semibold text-slate-600">รูปปก</span>
            <div className="mt-1">
              <ImgBtn value={editing.cover} onChange={(v) => patch({ cover: v })} label="อัปโหลดรูปปก" />
            </div>
          </div>
        </section>

        {/* ── เนื้อหาเป็นท่อน ๆ ── */}
        <section className="mt-4 space-y-3">
          {editing.blocks.map((b, i) => (
            <div key={i} className={`p-4 ${card}`}>
              <div className="flex items-center justify-between gap-2">
                <span className={`text-xs font-bold ${muted}`}>ท่อนที่ {i + 1}</span>
                <span className="flex gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      setEditing((a) => {
                        if (!a || i === 0) return a;
                        const bs = [...a.blocks];
                        [bs[i - 1], bs[i]] = [bs[i], bs[i - 1]];
                        return { ...a, blocks: bs };
                      })
                    }
                    disabled={i === 0}
                    className={`${btnSmGhost} disabled:opacity-30`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setEditing((a) => {
                        if (!a || i === a.blocks.length - 1) return a;
                        const bs = [...a.blocks];
                        [bs[i], bs[i + 1]] = [bs[i + 1], bs[i]];
                        return { ...a, blocks: bs };
                      })
                    }
                    disabled={i === editing.blocks.length - 1}
                    className={`${btnSmGhost} disabled:opacity-30`}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing((a) => (a ? { ...a, blocks: a.blocks.filter((_, j) => j !== i) } : a))}
                    className={btnSmDanger}
                  >
                    ลบท่อน
                  </button>
                </span>
              </div>
              <input
                value={b.heading}
                onChange={(e) => patchBlock(i, { heading: e.target.value })}
                placeholder="หัวข้อท่อนนี้ (เว้นว่างได้)"
                className={`mt-2 font-bold ${input}`}
              />
              <textarea
                value={b.text}
                onChange={(e) => patchBlock(i, { text: e.target.value })}
                rows={5}
                placeholder="เนื้อหา… กด Enter ขึ้นบรรทัดใหม่ได้เลย หน้าเว็บจะขึ้นตาม"
                className={`mt-2 leading-relaxed ${input}`}
              />
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <ImgBtn value={b.image} onChange={(v) => patchBlock(i, { image: v })} label="แนบรูปท่อนนี้" />
                {b.image && (
                  <label className="flex items-center gap-1.5 text-xs text-slate-600">
                    รูปอยู่
                    <select
                      value={b.align ?? "left"}
                      onChange={(e) => patchBlock(i, { align: e.target.value as "left" | "right" })}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                    >
                      <option value="left">ซ้ายของข้อความ</option>
                      <option value="right">ขวาของข้อความ</option>
                    </select>
                  </label>
                )}
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setEditing((a) => (a ? { ...a, blocks: [...a.blocks, { heading: "", text: "" }] } : a))}
            className={btnNeutral}
          >
            ＋ เพิ่มท่อนเนื้อหา
          </button>
        </section>

        {/* ── แถบบันทึกลอยล่าง ── */}
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-end gap-3">
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
  return (
    <div className="mx-auto max-w-4xl">
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

      <div className={`mt-5 overflow-hidden ${card}`}>
        {loading ? (
          <p className="p-10 text-center text-sm text-slate-400">กำลังโหลด…</p>
        ) : list.length === 0 ? (
          <div className="p-12 text-center">
            <span className="text-5xl">✍️</span>
            <p className="mt-3 text-sm font-semibold text-slate-600">ยังไม่มีบทความ — เริ่มเขียนเรื่องแรกเลย</p>
            <p className={`mt-1 text-xs ${faint}`}>ไอเดีย: วิธีเตรียมไฟล์ · เลือกกระดาษยังไง · รีวิวงานที่เคยทำ</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {list.map((a) => (
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
