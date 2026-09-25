"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useState } from "react";
import RequirePerm from "@/components/RequirePerm";
import { Btn, Field, ListHead, PageHead, PageShell, Switch, Tag } from "@/components/admin/ui";
import { fetchProductsLite } from "@/lib/product-repo";
import { formatPrice, priceRange, type Product } from "@/lib/products";
import {
  DEFAULT_SPOTLIGHT,
  MAX_CHIPS,
  MAX_STYLES,
  STYLE_TAG_TONES,
  clearSpotlightCache,
  spotlightOf,
  type SpotStyle,
  type Spotlight,
  type StyleTagTone,
} from "@/lib/spotlight";

/**
 * 🎯 จุดเชียร์ขายหน้าแรก — ส่วนใต้ป้ายประชาสัมพันธ์ เหนือ "สินค้ามาใหม่"
 *
 * "จุดที่ร้านเลือกสินค้ามาแสดงให้ลูกค้าเห็นผ่านตา" (เจ้าของร้าน 25 ก.ย. 69): หัวข้อสั้น ๆ + รางเลื่อนการ์ดสินค้าที่เลือกเอง (สูงสุด 12 ตัว เลื่อนเองเมื่อเกิน 4)
 * ราคา/รูป/ลิงก์บนการ์ดดึงจากสินค้าจริง ไม่ต้องพิมพ์ · ข้อมูล/กติกาอยู่ที่ src/lib/spotlight.ts · หน้าร้านวาดด้วย components/Spotlight.tsx
 */

const TONE: Record<StyleTagTone, { label: string; color: string; emoji: string }> = {
  hot: { label: "ส้มไฟ (แบบป้ายขายดี)", color: "#FF6F3C", emoji: "🔥" },
  new: { label: "ฟ้า (แบบป้าย NEW)", color: "#3E86E0", emoji: "✨" },
  mint: { label: "เขียว", color: "#2BB08A", emoji: "🌱" },
};

const MAX_MB = 4.5;

async function uploadImage(file: File): Promise<{ url?: string; error?: string }> {
  if (file.size > MAX_MB * 1024 * 1024) return { error: `ไฟล์ใหญ่เกิน ${MAX_MB}MB — บันทึกเป็น JPG/WEBP หรือย่อขนาดก่อนอัป` };
  try {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("productId", "spotlight");
    const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
    const j = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
    return res.ok && j?.url ? { url: j.url } : { error: j?.error ?? `อัปโหลดไม่สำเร็จ (รหัส ${res.status})` };
  } catch {
    return { error: "อัปโหลดไม่สำเร็จ — เช็คอินเทอร์เน็ตแล้วลองใหม่" };
  }
}

/** ช่องรูปการ์ด: ว่าง = ใช้รูปปกสินค้า (โชว์ให้ดูจาง ๆ) */
function ImageSlot({ value, fallback, onChange }: { value?: string; fallback?: string; onChange: (v: string | undefined) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const shown = value ?? fallback;
  return (
    <div>
      <p className="text-[0.72rem]" style={{ color: "var(--dk-navy-soft)" }}>
        รูปการ์ด {value ? "" : "(ใช้รูปปกสินค้า)"}
      </p>
      {shown && <img src={shown} alt="" className="mt-1.5 aspect-square w-full rounded-xl object-cover" style={{ background: "var(--dk-sky)", opacity: value ? 1 : 0.75 }} />}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <label className="dkb-btn dkb-btn-ghost dkb-btn-sm cursor-pointer" aria-disabled={busy}>
          {busy ? "อัป…" : value ? "เปลี่ยน" : "รูปเอง"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
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
              else setErr(r.error ?? "อัปโหลดไม่สำเร็จ");
              setBusy(false);
            }}
          />
        </label>
        {value && (
          <Btn small onClick={() => onChange(undefined)}>
            ใช้รูปปก
          </Btn>
        )}
      </div>
      {err && (
        <p className="mt-1.5 text-[0.76rem] font-semibold" style={{ color: "var(--dk-coral-ink)" }}>
          {err}
        </p>
      )}
    </div>
  );
}

/** เลือกสินค้าจากคลัง — พิมพ์ค้นหาชื่อ/รหัส แล้วกดเลือก */
function ProductPick({ products, value, onPick }: { products: Product[]; value: string; onPick: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const cur = products.find((p) => p.id === value);
  const hits = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!k) return [];
    return products.filter((p) => p.name.toLowerCase().includes(k) || p.id.toLowerCase().includes(k)).slice(0, 8);
  }, [q, products]);
  return (
    <div className="relative">
      <label className="dkb-g dkb-field">
        <span className="lb">สินค้าที่ผูก {cur ? `· เริ่ม ${formatPrice(priceRange(cur).min)}` : value ? `· ไม่พบ "${value}" ในคลัง` : "· พิมพ์ค้นหา"}</span>
        <input
          value={open ? q : (cur?.name ?? value)}
          placeholder="พิมพ์ชื่อสินค้า…"
          onFocus={() => {
            setOpen(true);
            setQ("");
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>
      {open && hits.length > 0 && (
        <ul className="dkb-g absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-auto p-1 shadow-lg">
          {hits.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[0.86rem] hover:bg-slate-50"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(p.id);
                  setOpen(false);
                }}
              >
                {p.imageSrc && <img src={p.imageSrc} alt="" className="h-8 w-8 flex-none rounded-md object-cover" />}
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <span className="dkb-num-sm flex-none" style={{ color: "var(--dk-blue-deep)" }}>
                  {formatPrice(priceRange(p).min)}+
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SpotlightInner() {
  const [s, setS] = useState<Spotlight>(DEFAULT_SPOTLIGHT);
  const [saved, setSaved] = useState(JSON.stringify(DEFAULT_SPOTLIGHT));
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadErr("");
    try {
      const res = await fetch("/api/spotlight", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const j = (await res.json()) as { spotlight?: Partial<Spotlight> };
      const d = spotlightOf(j.spotlight);
      setS(d);
      setSaved(JSON.stringify(d));
    } catch (e) {
      // โหลดไม่ผ่านห้ามปล่อยให้แก้ต่อ — กดบันทึกแล้วจะทับของจริงด้วยชุดเริ่มต้น
      setLoadErr(`โหลดข้อมูลไม่สำเร็จ (${e instanceof Error ? e.message : "เครือข่าย"})`);
    }
    setLoading(false);
  }, []);
  useEffect(() => void load(), [load]);
  useEffect(() => {
    void fetchProductsLite().then((ps) => setProducts(ps.filter((p) => !p.hidden)));
  }, []);

  const dirty = useMemo(() => JSON.stringify(s) !== saved, [s, saved]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    if (dirty) setMsg(null);
  }, [s, dirty]);

  const set = (p: Partial<Spotlight>) => setS((x) => ({ ...x, ...p }));
  const setStyle = (i: number, p: Partial<SpotStyle>) => setS((x) => ({ ...x, styles: x.styles.map((st, j) => (j === i ? { ...st, ...p } : st)) }));
  const moveStyle = (i: number, d: -1 | 1) =>
    setS((x) => {
      const styles = [...x.styles];
      const j = i + d;
      if (j < 0 || j >= styles.length) return x;
      [styles[i], styles[j]] = [styles[j], styles[i]];
      return { ...x, styles };
    });

  const save = async () => {
    setMsg(null);
    const noProduct = s.styles.findIndex((st) => !st.productId);
    if (noProduct >= 0) return setMsg({ ok: false, text: `การ์ดใบที่ ${noProduct + 1} ยังไม่ได้เลือกสินค้า — เลือกก่อน หรือลบใบนั้นทิ้ง` });
    setSaving(true);
    try {
      const res = await fetch("/api/spotlight", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spotlight: s }) });
      const j = (await res.json().catch(() => null)) as { spotlight?: Partial<Spotlight>; error?: string } | null;
      if (!res.ok || !j?.spotlight) {
        setMsg({ ok: false, text: j?.error ?? `บันทึกไม่สำเร็จ (รหัส ${res.status}) — หน้าร้านยังเป็นชุดเดิม` });
      } else {
        const d = spotlightOf(j.spotlight);
        setS(d);
        setSaved(JSON.stringify(d));
        clearSpotlightCache();
        setMsg({ ok: true, text: "บันทึกแล้ว — ลูกค้าจะเห็นบนหน้าแรกภายในประมาณ 1 นาที" });
      }
    } catch {
      setMsg({ ok: false, text: "บันทึกไม่สำเร็จ — เช็คอินเทอร์เน็ตแล้วกดบันทึกอีกครั้ง (ที่แก้ไว้ยังอยู่ในหน้านี้)" });
    }
    setSaving(false);
  };

  const missing = s.styles.filter((st) => st.productId && products.length && !products.some((p) => p.id === st.productId)).length;

  return (
    <PageShell>
      <PageHead
        group="ร้าน & ระบบ"
        title="🎯 จุดเชียร์ขายหน้าแรก"
        sub="แถวใต้ป้ายประชาสัมพันธ์ เหนือ “สินค้ามาใหม่” — เลือกสินค้าที่อยากให้ลูกค้าเห็นผ่านตา ราคา/รูป/ลิงก์ดึงจากสินค้าจริง"
        live={s.on ? { ok: true, text: "กำลังแสดงบนหน้าแรก" } : { ok: false, text: "ปิดอยู่ — หน้าแรกไม่แสดงส่วนนี้" }}
        tools={
          <Btn href="/#spotlight" title="เปิดหน้าแรกดูของจริง">
            ดูหน้าแรก ↗
          </Btn>
        }
      />

      {loading ? (
        <p className="px-2 py-10 text-center text-[0.9rem]" style={{ color: "var(--dk-faint)" }}>
          กำลังโหลด…
        </p>
      ) : loadErr ? (
        <div className="dkb-g mt-4 p-5 text-center">
          <p className="font-semibold" style={{ color: "var(--dk-coral-ink)" }}>
            {loadErr}
          </p>
          <p className="mt-1 text-[0.84rem]" style={{ color: "var(--dk-navy-soft)" }}>
            ปิดการแก้ไขไว้ก่อน กันบันทึกทับข้อมูลจริงด้วยชุดว่าง
          </p>
          <div className="mt-3">
            <Btn onClick={() => void load()}>โหลดใหม่</Btn>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
            <Switch label="แสดงส่วนนี้บนหน้าแรก" hint="ปิด = หน้าแรกเหมือนไม่มีส่วนนี้ (ข้อความที่ตั้งไว้ยังอยู่)" on={s.on} onToggle={() => set({ on: !s.on })} />
            <Btn
              onClick={() => {
                set({ ...DEFAULT_SPOTLIGHT, on: s.on });
                setMsg({ ok: true, text: "ใส่ชุดเริ่มต้นให้แล้ว — กดบันทึกถ้าต้องการใช้" });
              }}
              title="กลับไปใช้ข้อความ/การ์ดชุดที่ระบบเตรียมไว้"
            >
              ↺ ใช้ชุดเริ่มต้น
            </Btn>
          </div>

          {/* ── หัวข้อ ── */}
          <ListHead title="1) หัวข้อ" note="โครงเดียวกับหัวข้อ “สินค้ามาใหม่” — สั้น ๆ คำท้ายที่เน้นจะเป็นสีเหลือง" />
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="ป้ายเล็กเหนือหัวข้อ (มีไอคอน 📌 ขยับให้เอง)" value={s.kicker} onChange={(v) => set({ kicker: v })} placeholder="ร้านคัดมาให้" />
            <Field label="บรรทัดรอง (1 บรรทัด)" value={s.lead ?? ""} onChange={(v) => set({ lead: v })} placeholder="ทีมงานเลือกมาให้เห็นก่อนใคร — เลื่อนดูได้เลย" />
            <Field label="หัวข้อ" value={s.title} onChange={(v) => set({ title: v })} placeholder="สินค้าที่อยากให้ลองดู" />
            <Field label="คำท้ายหัวข้อที่เน้นสีเหลือง (ต้องเป็นคำท้ายของหัวข้อเป๊ะ ๆ)" value={s.accent ?? ""} onChange={(v) => set({ accent: v })} placeholder="ลองดู" />
          </div>
          <div className="dkb-g mt-3 p-3.5">
            <p className="text-[0.72rem]" style={{ color: "var(--dk-navy-soft)" }}>
              ชิปจุดเด่นใต้หัวข้อ (ไม่บังคับ · สูงสุด {MAX_CHIPS} ใบ · คำละ 2–4 คำ เช่น สั่ง 1 ชิ้นก็ทำ)
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 md:grid-cols-4">
              {s.chips.map((c, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <div className="min-w-0 flex-1">
                    <Field label={`ชิป ${i + 1}`} value={c} onChange={(v) => set({ chips: s.chips.map((x, j) => (j === i ? v : x)) })} />
                  </div>
                  <Btn small onClick={() => set({ chips: s.chips.filter((_, j) => j !== i) })} title="ลบชิปนี้">
                    ✕
                  </Btn>
                </div>
              ))}
            </div>
            {s.chips.length < MAX_CHIPS && (
              <div className="mt-2">
                <Btn small onClick={() => set({ chips: [...s.chips, ""] })}>
                  ＋ เพิ่มชิป
                </Btn>
              </div>
            )}
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Field label="ข้อความลิงก์ท้ายแถว" value={s.ctaLabel} onChange={(v) => set({ ctaLabel: v })} placeholder="ดูสินค้าทั้งหมด" />
            <Field label="กดแล้วไปหน้าไหน (path ภายใน หรือ https://)" value={s.ctaHref} onChange={(v) => set({ ctaHref: v })} placeholder="/products" />
          </div>

          {/* ── การ์ดสินค้า ── */}
          <ListHead
            title={`2) การ์ดสินค้า (${s.styles.length}/${MAX_STYLES})`}
            note={
              missing ? (
                <Tag tone="coral">{missing} ใบผูกสินค้าที่ไม่พบ/ถูกซ่อน — หน้าแรกจะข้ามใบนั้น</Tag>
              ) : (
                "ราคา “เริ่ม ฿” ลิงก์ และรูปที่สองที่สลับเอง ดึงจากสินค้าที่ผูก · เกิน 4 ใบ = รางเลื่อนเอง มีลูกศร"
              )
            }
          />
          <div className="grid gap-3 md:grid-cols-2">
            {s.styles.map((st, i) => {
              const p = products.find((x) => x.id === st.productId);
              return (
                <div key={i} className="dkb-g p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="dkb-num-sm" style={{ color: "var(--dk-faint)" }}>
                      ใบที่ {i + 1}
                    </span>
                    <div className="flex gap-1">
                      <Btn small onClick={() => moveStyle(i, -1)} disabled={i === 0} title="เลื่อนขึ้น">
                        ↑
                      </Btn>
                      <Btn small onClick={() => moveStyle(i, 1)} disabled={i === s.styles.length - 1} title="เลื่อนลง">
                        ↓
                      </Btn>
                      <Btn small onClick={() => set({ styles: s.styles.filter((_, j) => j !== i) })} title="ลบการ์ดนี้">
                        ✕
                      </Btn>
                    </div>
                  </div>
                  <div className="mt-2 grid gap-3 sm:grid-cols-[7rem_1fr]">
                    <ImageSlot value={st.image} fallback={p?.imageSrc} onChange={(v) => setStyle(i, { image: v })} />
                    <div className="grid content-start gap-2">
                      <ProductPick products={products} value={st.productId} onPick={(id) => setStyle(i, { productId: id })} />
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Field label="ชื่อที่โชว์ (ว่าง = ชื่อสินค้า)" value={st.name ?? ""} onChange={(v) => setStyle(i, { name: v })} placeholder={p?.name ?? ""} />
                        <Field label="บรรทัดเล็กเหนือชื่อ (ว่าง = ชื่อหมวด)" value={st.desc ?? ""} onChange={(v) => setStyle(i, { desc: v })} placeholder="สายหวาน ใส่กับยีนส์เอวสูง" />
                      </div>
                      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                        <Field label="ป้ายมุมการ์ด (ว่าง = ไม่มี)" value={st.tag ?? ""} onChange={(v) => setStyle(i, { tag: v })} placeholder="ฮิตสุด / มาใหม่ / ทีม" />
                        <div className="flex items-end gap-1 pb-1">
                          {STYLE_TAG_TONES.map((t) => (
                            <button
                              key={t}
                              type="button"
                              title={TONE[t].label}
                              aria-pressed={(st.tagTone ?? "hot") === t}
                              onClick={() => setStyle(i, { tagTone: t })}
                              className="grid h-8 w-8 place-items-center rounded-full border-2 text-[0.8rem]"
                              style={{ background: TONE[t].color, borderColor: (st.tagTone ?? "hot") === t ? "var(--dk-navy)" : "transparent" }}
                            >
                              {TONE[t].emoji}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {s.styles.length < MAX_STYLES && (
            <div className="mt-3">
              <Btn onClick={() => set({ styles: [...s.styles, { productId: "", tagTone: "hot" }] })}>＋ เพิ่มการ์ดสินค้า</Btn>
            </div>
          )}

          {/* แถบบันทึกติดขอบล่าง — เห็นตลอดว่ายังมีของค้างบันทึกไหม */}
          <div className="sticky bottom-3 z-10 mt-5">
            <div className="dkb-g flex flex-wrap items-center gap-3 px-4 py-3">
              <p
                className="min-w-0 flex-1 text-[0.86rem]"
                role="status"
                style={{
                  color: msg ? (msg.ok ? "var(--dk-mint-ink)" : "var(--dk-coral-ink)") : dirty ? "var(--dk-yolk-ink)" : "var(--dk-navy-soft)",
                  fontWeight: msg || dirty ? 600 : undefined,
                }}
              >
                {msg?.text ?? (dirty ? "มีการแก้ไขที่ยังไม่ได้บันทึก — หน้าร้านยังเป็นชุดเดิม" : "ไม่มีอะไรค้างบันทึก")}
              </p>
              <Btn tone="navy" onClick={() => void save()} disabled={saving || !dirty}>
                {saving ? "กำลังบันทึก…" : "บันทึก"}
              </Btn>
            </div>
          </div>
        </>
      )}
    </PageShell>
  );
}

export default function SpotlightPage() {
  return (
    <RequirePerm perm="settings.manage">
      <SpotlightInner />
    </RequirePerm>
  );
}
