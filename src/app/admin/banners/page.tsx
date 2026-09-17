"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import RequirePerm from "@/components/RequirePerm";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import { Btn, CopyChip, Empty, Field, ListHead, PageHead, PageShell, Switch, Tag } from "@/components/admin/ui";
import {
  BANNER_SPEC,
  DEFAULT_BANNER_SET,
  MAX_BANNERS,
  bannerSetOf,
  bannerSpecText,
  bannerState,
  clearPromoBannersCache,
  type BannerState,
  type PromoBanner,
  type PromoBannerSet,
} from "@/lib/promo-banners";

/**
 * 📣 ป้ายประชาสัมพันธ์ — แถบบนหน้าแรก ใต้แบนเนอร์ใหญ่ เหนือ "สินค้ามาใหม่"
 *
 * ทีมร้านลงป้ายเองได้: ป้ายภาพ (ออกแบบมาแล้ว) หรือแถบข้อความ (พิมพ์หัวข้อ+รายละเอียด) · หลายใบ = สลับเอง
 * ตั้งวันเริ่ม/วันสิ้นสุดได้ — โปรหมดเขตแล้วป้ายหายจากหน้าร้านเอง ไม่ต้องจำมาลบ
 * ข้อมูล/กติกาอยู่ที่ src/lib/promo-banners.ts · หน้าร้านวาดด้วย components/PromoBanners.tsx
 */

const STATE: Record<BannerState, { tone: "mint" | "yolk" | "coral" | "quiet"; label: string; bar: string }> = {
  live: { tone: "mint", label: "กำลังแสดง", bar: "var(--dk-mint)" },
  scheduled: { tone: "yolk", label: "รอถึงวันเริ่ม", bar: "var(--dk-yolk-deep)" },
  expired: { tone: "coral", label: "หมดเขตแล้ว", bar: "var(--dk-coral-deep)" },
  hidden: { tone: "quiet", label: "ซ่อนอยู่", bar: "var(--dk-quiet)" },
};

/** จำนวนชิ้นลูกเล่นขยับของป้าย (จอคอม + มือถือ + แสงวิ่ง) */
const fxCount = (b: PromoBanner) => (b.layers?.length ?? 0) + (b.layersMobile?.length ?? 0) + (b.shine ? 1 : 0);

const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
/** "2026-09-17" → "17 ก.ย. 2569" (ทีมคุยกันเป็น พ.ศ.) */
const thaiYmd = (v?: string) => {
  const m = v?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${Number(m[3])} ${TH_MONTHS[Number(m[2]) - 1]} ${Number(m[1]) + 543}` : "";
};

async function uploadImage(file: File): Promise<{ url?: string; error?: string }> {
  // Netlify รับไฟล์ผ่าน API ได้ราว 4.5MB — ดักก่อนส่ง จะได้ไม่เจอหน้า error ที่อ่านไม่ออก
  if (file.size > BANNER_SPEC.maxMB * 1024 * 1024) return { error: `ไฟล์ใหญ่เกิน ${BANNER_SPEC.maxMB}MB — บันทึกเป็น JPG/WEBP หรือย่อขนาดก่อนอัป` };
  try {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("productId", "banners");
    const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
    const j = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
    return res.ok && j?.url ? { url: j.url } : { error: j?.error ?? `อัปโหลดไม่สำเร็จ (รหัส ${res.status})` };
  } catch {
    return { error: "อัปโหลดไม่สำเร็จ — เช็คอินเทอร์เน็ตแล้วลองใหม่" };
  }
}

/** ช่องรูป: ตัวอย่าง + ปุ่มอัป/เปลี่ยน/เอาออก */
function ImageSlot({
  label,
  spec,
  hint,
  value,
  onChange,
}: {
  label: string;
  /** ขนาดที่กราฟฟิกต้องทำ — โชว์เป็นป้ายตัวเลขชัด ๆ + เทียบกับไฟล์ที่อัปจริง */
  spec: { w: number; h: number };
  hint: string;
  value?: string;
  onChange: (v: string | undefined) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // ขนาดจริงของไฟล์ที่อัป (อ่านจากรูปตอนโหลดเสร็จ) — กราฟฟิก/แอดมินเห็นทันทีว่าตรงสเปคไหม
  const [dim, setDim] = useState<{ w: number; h: number } | null>(null);
  const exact = dim && dim.w === spec.w && dim.h === spec.h;
  const tooSmall = dim && dim.w < spec.w * 0.85;
  return (
    <div className="dkb-g p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="text-[0.72rem]" style={{ color: "var(--dk-navy-soft)" }}>
          {label}
        </p>
        <span className="dkb-num rounded-full px-2.5 py-1 text-[0.8rem]" style={{ background: "var(--dk-sky)", color: "var(--dk-blue-deep)" }}>
          {spec.w} × {spec.h} px
        </span>
      </div>
      {value && (
        <img
          src={value}
          alt=""
          className="mt-2 max-h-40 w-full rounded-xl object-contain"
          style={{ background: "var(--dk-sky)" }}
          onLoad={(e) => setDim({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
        />
      )}
      {value && dim && (
        <p
          className="mt-1.5 text-[0.78rem] font-semibold"
          style={{ color: exact ? "var(--dk-mint-ink)" : tooSmall ? "var(--dk-coral-ink)" : "var(--dk-yolk-ink)" }}
        >
          ไฟล์นี้ {dim.w} × {dim.h} px —{" "}
          {exact
            ? "ตรงสเปค"
            : tooSmall
              ? `เล็กกว่าสเปค (กว้างควรได้ ${spec.w}px) ขึ้นเว็บแล้วจะเบลอ ให้กราฟฟิกส่งไฟล์ใหม่`
              : `ไม่ตรงสเปค ${spec.w} × ${spec.h} — ใช้ได้ แต่ถ้าสูงไม่เท่าป้ายใบอื่น สไลด์จะมีขอบขาวบนล่าง`}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="dkb-btn dkb-btn-ghost dkb-btn-sm cursor-pointer" aria-disabled={busy}>
          {busy ? "กำลังอัปโหลด…" : value ? "เปลี่ยนรูป" : "เลือกรูป"}
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
              else setErr(r.error ?? "อัปโหลดไม่สำเร็จ");
              setBusy(false);
            }}
          />
        </label>
        {value && (
          <Btn
            small
            onClick={() => {
              setDim(null);
              onChange(undefined);
            }}
          >
            เอารูปออก
          </Btn>
        )}
      </div>
      <p className="mt-1.5 text-[0.72rem]" style={{ color: err ? "var(--dk-coral-ink)" : "var(--dk-faint)", fontWeight: err ? 600 : undefined }}>
        {err || hint}
      </p>
    </div>
  );
}

/** 📐 สเปคไฟล์สำหรับกราฟฟิก — อยู่บนหน้าเสมอ (ไม่ต้องกดเพิ่มป้ายก่อนถึงจะเห็น) + คัดลอกส่ง LINE ได้ */
function SpecCard() {
  const rows: { k: string; d: string; m: string }[] = [
    { k: "แสดงจริงบนเว็บ", d: BANNER_SPEC.desktop.shownAs, m: BANNER_SPEC.mobile.shownAs },
    { k: "ตัวหนังสือเล็กสุดในไฟล์", d: `${BANNER_SPEC.desktop.minText} px`, m: `${BANNER_SPEC.mobile.minText} px` },
    { k: "เว้นขอบ (ห้ามวางข้อความ)", d: `${BANNER_SPEC.desktop.margin} px รอบด้าน`, m: `${BANNER_SPEC.mobile.margin} px รอบด้าน` },
  ];
  return (
    <section className="dkb-g mt-4 p-4" aria-label="ขนาดไฟล์สำหรับกราฟฟิก">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="dkb-h2 text-[1rem]">ขนาดไฟล์สำหรับกราฟฟิก</h2>
        <CopyChip label="คัดลอกสเปคส่งกราฟฟิก" text={bannerSpecText} />
      </div>
      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
        {(
          [
            ["จอคอม", BANNER_SPEC.desktop, "d"],
            ["มือถือ", BANNER_SPEC.mobile, "m"],
          ] as const
        ).map(([name, sp, key]) => (
          <div key={key} className="rounded-2xl p-3.5" style={{ background: "var(--dk-sky)" }}>
            <p className="text-[0.78rem]" style={{ color: "var(--dk-navy-soft)" }}>
              ไฟล์{name}
            </p>
            <p className="dkb-num mt-1 text-[1.55rem]" style={{ color: "var(--dk-navy)" }}>
              {sp.w} × {sp.h} <span className="text-[0.9rem]">px</span>
            </p>
            <dl className="mt-2 space-y-0.5 text-[0.8rem]">
              {rows.map((r) => (
                <div key={r.k} className="flex justify-between gap-3">
                  <dt style={{ color: "var(--dk-navy-soft)" }}>{r.k}</dt>
                  <dd className="dkb-num-sm text-right">{r[key]}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
      <ul className="mt-3 list-disc space-y-0.5 pl-5 text-[0.8rem]" style={{ color: "var(--dk-navy-soft)" }}>
        <li>1 ป้าย = 2 ไฟล์ (จอคอม + มือถือ) · JPG / PNG / WEBP · RGB · ไม่เกิน {BANNER_SPEC.maxMB}MB ต่อไฟล์</li>
        <li>ระบบตัดมุมโค้งและใส่เงาให้เอง — ไม่ต้องทำมาในไฟล์ และอย่าวางข้อความ/โลโก้ชิดมุม</li>
        <li>ป้ายที่ลงสไลด์ชุดเดียวกันให้สูงเท่ากันทุกใบ ไม่งั้นใบที่เตี้ยกว่าจะมีขอบขาวบนล่าง</li>
      </ul>
    </section>
  );
}

function BannersInner() {
  const [set, setSet] = useState<PromoBannerSet>(DEFAULT_BANNER_SET);
  const [saved, setSaved] = useState(JSON.stringify(DEFAULT_BANNER_SET));
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const { confirm, dialog } = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadErr("");
    try {
      const res = await fetch("/api/promo-banners", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const j = (await res.json()) as { banners?: Partial<PromoBannerSet> };
      const s = bannerSetOf(j.banners);
      setSet(s);
      setSaved(JSON.stringify(s));
    } catch (e) {
      // โหลดไม่ผ่านห้ามปล่อยให้แก้ต่อ — กดบันทึกแล้วจะทับป้ายจริงด้วยรายการว่าง
      setLoadErr(`โหลดป้ายไม่สำเร็จ (${e instanceof Error ? e.message : "เครือข่าย"})`);
    }
    setLoading(false);
  }, []);
  useEffect(() => void load(), [load]);

  const dirty = useMemo(() => JSON.stringify(set) !== saved, [set, saved]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // แก้อะไรต่อ = ข้อความรอบก่อน ("บันทึกแล้ว"/แจ้งผิด) หมดความหมาย เอาออกให้แถบล่างบอกสถานะจริง
  useEffect(() => {
    if (dirty) setMsg(null);
  }, [set, dirty]);

  const patch = (id: string, p: Partial<PromoBanner>) =>
    setSet((s) => ({ ...s, items: s.items.map((b) => (b.id === id ? { ...b, ...p } : b)) }));
  const move = (i: number, d: -1 | 1) =>
    setSet((s) => {
      const items = [...s.items];
      const j = i + d;
      if (j < 0 || j >= items.length) return s;
      [items[i], items[j]] = [items[j], items[i]];
      return { ...s, items };
    });
  const add = () => {
    setMsg(null);
    setSet((s) => ({ ...s, items: [...s.items, { id: `b${Date.now().toString(36)}`, title: "" }] }));
  };
  const remove = async (b: PromoBanner) => {
    const ok = await confirm({
      icon: "🗑",
      title: `ลบป้าย "${b.title || "ยังไม่ตั้งชื่อ"}"?`,
      detail: "ถ้าแค่อยากพักไว้ก่อน ใช้สวิตช์ซ่อนแทนได้ — ลบแล้วต้องลงรูปใหม่\nป้ายจะหายจากหน้าร้านหลังกด บันทึก",
      confirmLabel: "ลบป้ายนี้",
      danger: true,
    });
    if (ok === true) setSet((s) => ({ ...s, items: s.items.filter((x) => x.id !== b.id) }));
  };

  const save = async () => {
    setMsg(null);
    const blank = set.items.findIndex((b) => !b.title.trim() && !b.image);
    if (blank >= 0) return setMsg({ ok: false, text: `ป้ายใบที่ ${blank + 1} ยังว่างอยู่ — ใส่รูปหรือพิมพ์หัวข้อก่อน (หรือลบทิ้ง)` });
    const noAlt = set.items.findIndex((b) => b.image && !b.title.trim());
    if (noAlt >= 0) return setMsg({ ok: false, text: `ป้ายใบที่ ${noAlt + 1} ยังไม่มีชื่อ — พิมพ์สั้น ๆ ว่าป้ายนี้บอกอะไร (ใช้อ่านให้คนตาบอด/Google ฟัง)` });

    setSaving(true);
    try {
      const res = await fetch("/api/promo-banners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ banners: set }),
      });
      const j = (await res.json().catch(() => null)) as { banners?: Partial<PromoBannerSet>; error?: string } | null;
      if (!res.ok || !j?.banners) {
        setMsg({ ok: false, text: j?.error ?? `บันทึกไม่สำเร็จ (รหัส ${res.status}) — ป้ายบนหน้าร้านยังเป็นชุดเดิม` });
      } else {
        const s = bannerSetOf(j.banners);
        setSet(s);
        setSaved(JSON.stringify(s));
        clearPromoBannersCache();
        setMsg({ ok: true, text: "บันทึกแล้ว — ลูกค้าจะเห็นบนหน้าแรกภายในประมาณ 1 นาที" });
      }
    } catch {
      setMsg({ ok: false, text: "บันทึกไม่สำเร็จ — เช็คอินเทอร์เน็ตแล้วกดบันทึกอีกครั้ง (ที่แก้ไว้ยังอยู่ในหน้านี้)" });
    }
    setSaving(false);
  };

  const liveCount = set.on ? set.items.filter((b) => bannerState(b) === "live").length : 0;
  const full = set.items.length >= MAX_BANNERS;

  return (
    <PageShell>
      <PageHead
        group="ร้าน & ระบบ"
        title="ป้ายประชาสัมพันธ์"
        count={loading || loadErr ? undefined : `แสดงอยู่ ${liveCount} จาก ${set.items.length} ใบ`}
        sub="แถบบนหน้าแรก ใต้แบนเนอร์ใหญ่ เหนือ “สินค้ามาใหม่” — ลงโปร ประกาศวันหยุด หรือแจ้งข่าวร้าน"
        tools={
          <>
            <Btn href="/" title="เปิดหน้าแรกของร้าน">
              ดูหน้าร้าน
            </Btn>
            <Btn tone="yolk" onClick={add} disabled={loading || !!loadErr || full} title={full ? `ลงได้สูงสุด ${MAX_BANNERS} ใบ` : undefined}>
              เพิ่มป้าย
            </Btn>
          </>
        }
      />

      {loading ? (
        <div className="mt-5">
          <Empty title="กำลังโหลด…" body="ดึงป้ายจากเซิร์ฟเวอร์" />
        </div>
      ) : loadErr ? (
        <div className="mt-5 space-y-3">
          <Empty title={loadErr} body="ยังแก้ไขไม่ได้จนกว่าจะโหลดผ่าน — กันบันทึกทับป้ายจริงด้วยรายการว่าง" />
          <Btn tone="navy" onClick={() => void load()}>
            ลองโหลดอีกครั้ง
          </Btn>
        </div>
      ) : (
        <>
          <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
            <Switch
              label="แสดงแถบป้ายบนหน้าแรก"
              hint={set.on ? "ปิดสวิตช์นี้ = ซ่อนทุกป้ายชั่วคราว ไม่ต้องลบ" : "ปิดอยู่ — ลูกค้าไม่เห็นป้ายใดเลย"}
              on={set.on}
              onToggle={() => setSet((s) => ({ ...s, on: !s.on }))}
            />
            <Field
              label="มีหลายป้าย — สลับทุกกี่วินาที (3–20)"
              type="number"
              value={String(set.seconds)}
              onChange={(v) => setSet((s) => ({ ...s, seconds: Math.min(20, Math.max(0, Math.round(Number(v) || 0))) }))}
            />
          </div>

          <SpecCard />

          <ListHead title="ป้ายทั้งหมด" note="เรียงตามลำดับที่ลูกค้าเห็น · ใบบนสุดขึ้นก่อน" />

          {set.items.length === 0 ? (
            <Empty title="ยังไม่มีป้าย" body="กด “เพิ่มป้าย” แล้วใส่รูปที่ออกแบบไว้ หรือพิมพ์เป็นข้อความก็ได้ — ยังไม่มีป้าย หน้าแรกจะไม่มีแถบนี้" />
          ) : (
            <div className="space-y-3.5">
              {set.items.map((b, i) => {
                const st = STATE[bannerState(b)];
                const wrongRange = !!(b.startAt && b.endAt && b.startAt > b.endAt);
                return (
                  <section
                    key={b.id}
                    className="dkb-g overflow-hidden p-4"
                    style={{ borderLeft: "5px solid var(--bar)", ["--bar" as string]: st.bar } as CSSProperties}
                    aria-label={`ป้ายใบที่ ${i + 1}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="dkb-num text-[1.05rem]" style={{ color: "var(--dk-navy-soft)" }}>
                        {i + 1}
                      </span>
                      <b className="dkb-h2 min-w-0 flex-1 truncate text-[1rem]">{b.title || "ป้ายใหม่ (ยังไม่ตั้งชื่อ)"}</b>
                      <Tag tone={st.tone}>{st.label}</Tag>
                      <Tag tone="sky">{b.image ? "ป้ายภาพ" : "แถบข้อความ"}</Tag>
                      {fxCount(b) > 0 && <Tag tone="lilac">{b.still ? "ลูกเล่นหยุดนิ่ง" : `ลูกเล่นขยับ ${fxCount(b)} ชิ้น`}</Tag>}
                    </div>

                    <div className="mt-3 grid gap-2.5 lg:grid-cols-2">
                      <div className="space-y-2.5">
                        <Field
                          label={b.image ? "ชื่อป้าย (บอกสั้น ๆ ว่าป้ายนี้แจ้งอะไร)" : "หัวข้อ (ตัวใหญ่บนแถบ)"}
                          value={b.title}
                          onChange={(v) => patch(b.id, { title: v })}
                          placeholder="เช่น ร้านหยุดสงกรานต์ 12–16 เม.ย."
                        />
                        {!b.image && (
                          <Field
                            label="รายละเอียด (บรรทัดรอง · เว้นว่างได้)"
                            value={b.body ?? ""}
                            onChange={(v) => patch(b.id, { body: v })}
                            placeholder="เช่น ออเดอร์ที่สั่งช่วงนี้ เริ่มผลิต 17 เม.ย."
                            rows={2}
                          />
                        )}
                        <Field
                          label="กดป้ายแล้วไปที่ (เว้นว่าง = กดไม่ได้)"
                          value={b.href ?? ""}
                          onChange={(v) => patch(b.id, { href: v })}
                          placeholder="/products หรือ https://…"
                        />
                        {b.href && !/^(\/(?!\/)|https?:\/\/)/.test(b.href.trim()) && (
                          <p className="px-1 text-[0.78rem] font-semibold" style={{ color: "var(--dk-coral-ink)" }}>
                            ลิงก์ต้องขึ้นต้นด้วย / (หน้าในเว็บ) หรือ https:// — แบบอื่นจะถูกตัดทิ้งตอนบันทึก
                          </p>
                        )}
                        {!b.image && b.href && (
                          <Field
                            label="ข้อความบนปุ่ม (เว้นว่าง = ดูรายละเอียด)"
                            value={b.btnLabel ?? ""}
                            onChange={(v) => patch(b.id, { btnLabel: v })}
                            placeholder="ดูรายละเอียด"
                          />
                        )}
                        <div className="dkb-inline">
                          <Field label="เริ่มแสดงวันที่ (เว้นว่าง = เลย)" type="date" value={b.startAt ?? ""} onChange={(v) => patch(b.id, { startAt: v || undefined })} />
                          <Field label="แสดงถึงวันที่ (เว้นว่าง = ตลอด)" type="date" value={b.endAt ?? ""} onChange={(v) => patch(b.id, { endAt: v || undefined })} />
                        </div>
                        {(b.startAt || b.endAt) && (
                          <p
                            className="px-1 text-[0.78rem]"
                            style={{ color: wrongRange ? "var(--dk-coral-ink)" : "var(--dk-navy-soft)", fontWeight: wrongRange ? 600 : undefined }}
                          >
                            {wrongRange
                              ? "วันเริ่มอยู่หลังวันสิ้นสุด — แก้ก่อนบันทึก"
                              : `แสดง ${b.startAt ? `ตั้งแต่ ${thaiYmd(b.startAt)}` : "ทันที"} ${b.endAt ? `ถึงสิ้นวัน ${thaiYmd(b.endAt)}` : "ไม่มีวันหมด"} (เวลาไทย)`}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2.5">
                        <ImageSlot
                          label="รูปป้าย (จอคอม) — ไม่ใส่รูป = เป็นแถบข้อความ"
                          spec={BANNER_SPEC.desktop}
                          hint={`JPG / PNG / WEBP ไม่เกิน ${BANNER_SPEC.maxMB}MB · ระบบแสดงเต็มใบไม่ครอป`}
                          value={b.image}
                          onChange={(v) =>
                            // ลูกเล่นขยับวางตำแหน่งตามรูปเดิม — เปลี่ยนรูปแล้วต้องถอด ไม่งั้นเป็ด/ดาวลอยผิดที่
                            patch(b.id, v ? { image: v, layers: undefined } : { image: undefined, imageMobile: undefined, layers: undefined, layersMobile: undefined })
                          }
                        />
                        {b.image && (
                          <ImageSlot
                            label="รูปสำหรับมือถือ (ไม่ใส่ = ใช้รูปเดียวกัน)"
                            spec={BANNER_SPEC.mobile}
                            hint="ป้ายจอคอมย่อลงมือถือแล้วตัวหนังสือเล็กจนอ่านไม่ออก — ให้กราฟฟิกจัดเลย์เอาต์มือถือแยกอีกใบ"
                            value={b.imageMobile}
                            onChange={(v) => patch(b.id, { imageMobile: v, layersMobile: undefined })}
                          />
                        )}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3" style={{ borderColor: "var(--dk-hair)" }}>
                      <Btn small onClick={() => move(i, -1)} disabled={i === 0} title="เลื่อนขึ้น (แสดงก่อน)">
                        ↑ ขึ้น
                      </Btn>
                      <Btn small onClick={() => move(i, 1)} disabled={i === set.items.length - 1} title="เลื่อนลง (แสดงทีหลัง)">
                        ↓ ลง
                      </Btn>
                      <Btn small onClick={() => patch(b.id, { hidden: !b.hidden || undefined })}>
                        {b.hidden ? "กลับมาแสดง" : "ซ่อนไว้ก่อน"}
                      </Btn>
                      {fxCount(b) > 0 && (
                        <Btn small onClick={() => patch(b.id, { still: !b.still || undefined })} title="เป็ดโยกตัว · ดาววิบวับ · เมฆลอย — เปลี่ยนรูปเมื่อไหร่ลูกเล่นของรูปนั้นจะถูกถอด">
                          {b.still ? "เปิดลูกเล่นขยับ" : "หยุดลูกเล่นขยับ"}
                        </Btn>
                      )}
                      <span className="flex-1" />
                      <Btn small onClick={() => void remove(b)}>
                        ลบป้าย
                      </Btn>
                    </div>
                  </section>
                );
              })}
            </div>
          )}

          {/* แถบบันทึกติดขอบล่าง — อยู่ในระยะนิ้วโป้งบนมือถือ และเห็นตลอดว่ายังมีของค้างบันทึกไหม */}
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
                {saving ? "กำลังบันทึก…" : "บันทึกป้าย"}
              </Btn>
            </div>
          </div>
        </>
      )}
      {dialog}
    </PageShell>
  );
}

export default function BannersPage() {
  return (
    <RequirePerm perm="settings.manage">
      <BannersInner />
    </RequirePerm>
  );
}
