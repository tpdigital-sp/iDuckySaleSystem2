"use client";

/**
 * รูปแบบสินค้าสั่งพิเศษ /admin/special-products  (ดีไซน์ "รางเบนโตะกระจก")
 *
 * คลังแม่แบบ "ชื่องาน + สเปค" ให้พนักงานเลือกตอนกด "เพิ่มรายการพิเศษ" ในออเดอร์
 * ⚠️ ไม่โชว์บนหน้าเว็บ — ลูกค้าสั่งเองไม่ได้ ต้องให้พนักงานคีย์ให้
 *
 * ของที่เพิ่มจากเดิม: กล่องสรุปบอกว่ามีกี่รายการที่ยังไม่ได้ตั้งชื่อ/ยังไม่ใส่สเปค
 * — คลัง 200+ รายการที่นำเข้ามาจากระบบเดิมมักมีของกลวงปนอยู่โดยไม่มีใครรู้
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import RequirePerm from "@/components/RequirePerm";
import { fetchProductsLite } from "@/lib/product-repo";
import type { Product } from "@/lib/products";
import { suggestImageProduct, type SpecialProduct } from "@/lib/special-product-image";
import { Banner, Btn, Empty, HeroStat, ListHead, PageHead, PageShell, Row, RowMain, RowSide, Rows, SearchBox, Stat, Stats, Tag } from "@/components/admin/ui";

type SP = SpecialProduct;

/** ภาพปกสินค้าร้านขนาดย่อ — ใช้ทั้งในแถวและช่องเลือกสินค้า */
function Thumb({ p, size = 36 }: { p?: Product; size?: number }) {
  const box = { width: size, height: size, borderRadius: 8, flex: "none" } as const;
  if (!p?.imageSrc)
    return (
      <span className="grid place-items-center text-[13px]" style={{ ...box, background: "var(--dk-sky)", color: "var(--dk-faint)" }}>
        {p?.emoji ?? "🖼️"}
      </span>
    );
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={p.imageSrc} alt="" loading="lazy" style={{ ...box, objectFit: "cover", boxShadow: "0 0 0 1px var(--dk-hair)" }} />;
}

function SpecialProductsInner() {
  const [list, setList] = useState<SP[] | null>(null);
  const [q, setQ] = useState("");
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");
  /** สินค้าในร้าน (ชื่อ+ภาพปก) — ไว้เลือกว่ารายการพิเศษนี้ "ยืมภาพ" จากสินค้าตัวไหน */
  const [products, setProducts] = useState<Product[]>([]);
  const [pq, setPq] = useState("");
  const [onlyNoPic, setOnlyNoPic] = useState(false);

  useEffect(() => {
    fetch("/api/admin/special-products", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setList(j.list ?? []))
      .catch(() => setErr("โหลดคลังไม่สำเร็จ"));
    fetchProductsLite()
      .then(setProducts)
      .catch(() => {});
  }, []);
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  /** คู่ที่น่าจะใช่ของรายการที่ยังไม่ผูกภาพ — แค่แนะนำ ต้องมีคนกดรับ (ชื่อจากระบบเก่าไม่ตรงชื่อสินค้าร้าน เดาเองเสี่ยงภาพผิด) */
  const suggestByIdx = useMemo(() => {
    const m = new Map<number, Product>();
    if (!products.length) return m;
    (list ?? []).forEach((sp, i) => {
      if (sp.imageProductId || !sp.name.trim()) return;
      const hit = suggestImageProduct(sp.name, products);
      if (hit) m.set(i, hit);
    });
    return m;
  }, [list, products]);

  const patch = (i: number, p: Partial<SP>) => {
    setList((xs) => (xs ? xs.map((x, j) => (j === i ? { ...x, ...p } : x)) : xs));
    setDirty(true);
    setSaved(false);
  };
  const remove = (i: number) => {
    if (!confirm(`ลบ "${list?.[i]?.name}" ออกจากคลัง?`)) return;
    setList((xs) => (xs ? xs.filter((_, j) => j !== i) : xs));
    setOpenIdx(null);
    setDirty(true);
    setSaved(false);
  };
  const add = () => {
    setList((xs) => (xs ? [{ name: "", detail: "" }, ...xs] : xs));
    setOpenIdx(0);
    setQ("");
    setDirty(true);
    setSaved(false);
  };

  async function save() {
    if (!list) return;
    setSaving(true);
    setErr("");
    const res = await fetch("/api/admin/special-products", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ list: list.filter((p) => p.name.trim()) }),
    });
    const j = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return setErr(j.error ?? "บันทึกไม่สำเร็จ");
    setList((xs) => (xs ? xs.filter((p) => p.name.trim()) : xs));
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const kw = q.trim().toLowerCase();
  const shown = (list ?? [])
    .map((p, i) => ({ ...p, i }))
    .filter((p) => !kw || p.name.toLowerCase().includes(kw) || p.detail.toLowerCase().includes(kw))
    .filter((p) => !onlyNoPic || !p.imageProductId || p.i === openIdx);

  /** ของกลวงในคลัง — คลังที่นำเข้ามามักมีรายการที่ไม่มีสเปคปนอยู่ */
  const hollow = useMemo(() => (list ?? []).filter((p) => !p.detail.trim()).length, [list]);
  const unnamed = useMemo(() => (list ?? []).filter((p) => !p.name.trim()).length, [list]);
  const noPic = useMemo(() => (list ?? []).filter((p) => !p.imageProductId).length, [list]);
  const pkw = pq.trim().toLowerCase();
  const pickList = pkw ? products.filter((p) => p.name.toLowerCase().includes(pkw) || p.id.toLowerCase().includes(pkw)).slice(0, 8) : [];

  return (
    <PageShell>
      <PageHead
        group="สินค้า"
        title="สินค้าสั่งพิเศษ"
        count={list ? `${list.length} รายการ` : undefined}
        sub="แม่แบบงานสั่งทำ — ไม่โชว์บนหน้าเว็บ พนักงานเลือกใช้ตอนกด “เพิ่มรายการพิเศษ” ในออเดอร์"
        tools={
          <>
            <SearchBox value={q} onChange={setQ} placeholder="ค้นชื่อ / สเปค" />
            <Btn tone="yolk" onClick={add}>
              เพิ่มรายการพิเศษ
            </Btn>
          </>
        }
      />

      {err && (
        <div className="mt-4">
          <Banner tone="hot" title={err} />
        </div>
      )}

      <Stats cols={4}>
        <HeroStat
          n={list?.length ?? 0}
          label="รายการในคลัง"
          detail={hollow ? `ในนี้ยังไม่ใส่สเปค ${hollow} รายการ — พนักงานเลือกไปแล้วต้องพิมพ์เองทุกครั้ง` : "ใส่สเปคครบทุกรายการ"}
          pct={list?.length ? ((list.length - hollow) / list.length) * 100 : 0}
        />
        <Stat label="ยังไม่ใส่สเปค" value={hollow} hint={hollow ? "รายการ — ควรเติม" : "รายการ"} tone={hollow ? "due" : undefined} />
        <Stat label="ยังไม่ตั้งชื่อ" value={unnamed} hint="ไม่บันทึกถ้าไม่มีชื่อ" />
        <Stat
          label="ยังไม่ผูกภาพสินค้า"
          value={noPic}
          hint={onlyNoPic ? "กำลังกรอง — กดอีกครั้งเพื่อดูทั้งหมด" : "กดเพื่อดูเฉพาะที่ยังไม่ผูก"}
          onClick={() => setOnlyNoPic((v) => !v)}
          active={onlyNoPic}
        />
      </Stats>

      {/* สินค้า vs สินค้าสั่งพิเศษ ต่างกันยังไง — เขียนให้จบไม่ต้องถาม */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="dkb-g p-4">
          <p className="dkb-h2 text-[0.95rem]">สินค้า (เมนู “สินค้า”)</p>
          <ul className="mt-2 space-y-1 text-[12.5px] leading-relaxed" style={{ color: "var(--dk-navy-soft)" }}>
            <li>· โชว์บนหน้าเว็บ — ลูกค้ากดสั่งเองได้เลย</li>
            <li>· มีตัวเลือก (ขนาด/วัสดุ) และราคาขั้นบันได คิดราคาอัตโนมัติ</li>
            <li>· เหมาะกับของที่ขายประจำ สเปคตายตัว</li>
          </ul>
        </div>
        <div className="dkb-g p-4" style={{ background: "rgba(255,244,212,.7)" }}>
          <p className="dkb-h2 text-[0.95rem]">สินค้าสั่งพิเศษ (หน้านี้)</p>
          <ul className="mt-2 space-y-1 text-[12.5px] leading-relaxed" style={{ color: "var(--dk-yolk-ink)" }}>
            <li>
              · <b>ไม่โชว์บนหน้าเว็บ</b> — ลูกค้าสั่งเองไม่ได้ ต้องให้พนักงานคีย์ให้
            </li>
            <li>· เป็นแค่แม่แบบชื่องาน+สเปค — พนักงานกรอกจำนวน/ราคาเองเป็นงาน ๆ ไป</li>
            <li>· เหมาะกับงานสั่งทำ/ตีราคาเป็นเคส เช่น ป้าย งานเย็บ งานตามแบบลูกค้า</li>
            <li>
              · <b>ผูกภาพจากสินค้าในร้าน</b>ได้ — หน้าออเดอร์จะโชว์ภาพสินค้านั้นแทนกรอบเปล่า ระหว่างที่ยังไม่มีแบบ/ลายลูกค้า
            </li>
          </ul>
        </div>
      </div>

      <ListHead title="รายการ" note={kw ? `พบ ${shown.length} รายการ` : "กดเพื่อแก้ไข"} />

      {list === null ? (
        <Empty title="กำลังโหลดคลัง…" body="ดึงแม่แบบงานสั่งทำจากเซิร์ฟเวอร์" />
      ) : shown.length === 0 ? (
        <Empty
          title={kw ? "ไม่พบรายการที่ค้นหา" : "คลังยังว่าง"}
          body={kw ? "ลองค้นด้วยคำอื่น หรือล้างคำค้น" : "กดปุ่ม “เพิ่มรายการพิเศษ” มุมขวาบนเพื่อสร้างแม่แบบแรก"}
        />
      ) : (
        <Rows>
          {shown.map((p) =>
            openIdx === p.i ? (
              <div key={p.i} className="dkb-g relative overflow-hidden p-4 pl-5" style={{ ["--dk-tone" as string]: "var(--dk-blue)" }}>
                <span className="absolute inset-y-0 left-0 w-[6px]" style={{ background: "var(--dk-tone)" }} />
                <div className="grid gap-2.5">
                  <label className="dkb-g dkb-field">
                    <span className="lb">ชื่อสินค้าสั่งพิเศษ</span>
                    <input value={p.name} onChange={(e) => patch(p.i, { name: e.target.value })} placeholder="เช่น ป้ายอะคริลิคตามแบบ" autoFocus />
                  </label>
                  <label className="dkb-g dkb-field">
                    <span className="lb">สเปค / รายละเอียด (ขึ้นบรรทัดใหม่ได้)</span>
                    <textarea
                      value={p.detail}
                      onChange={(e) => patch(p.i, { detail: e.target.value })}
                      rows={Math.min(12, Math.max(4, p.detail.split("\n").length + 1))}
                      placeholder="เช่น อะคริลิกใส 3 มม. · ตัดตามแบบ · ติดสติกเกอร์ด้านหลัง"
                      style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "13px" }}
                    />
                  </label>
                  {/* 🖼 ยืมภาพปกจากสินค้าในร้าน — หน้าออเดอร์ใช้แทนกรอบเปล่าเมื่อยังไม่มีแบบ/ลายลูกค้า */}
                  <div className="dkb-g p-3">
                    <p className="text-[12px] font-semibold" style={{ color: "var(--dk-navy-soft)" }}>
                      ภาพในหน้าออเดอร์ — ใช้ภาพจากสินค้าในร้าน
                    </p>
                    {p.imageProductId ? (
                      <div className="mt-2 flex items-center gap-2.5">
                        <Thumb p={productById.get(p.imageProductId)} size={56} />
                        <span className="min-w-0 flex-1 text-[13px] font-semibold" style={{ color: "var(--dk-navy)" }}>
                          {productById.get(p.imageProductId)?.name ?? (products.length ? `ไม่พบสินค้า (${p.imageProductId}) — อาจถูกลบ เลือกใหม่ได้` : "กำลังโหลด…")}
                        </span>
                        <Btn small onClick={() => patch(p.i, { imageProductId: undefined })}>
                          เอาออก
                        </Btn>
                      </div>
                    ) : (
                      <p className="mt-1 text-[12px]" style={{ color: "var(--dk-faint)" }}>
                        ยังไม่ผูก — หน้าออเดอร์จะเป็นกรอบเปล่าจนกว่าจะมีแบบหรือลายลูกค้า
                      </p>
                    )}
                    {!p.imageProductId && suggestByIdx.get(p.i) && (
                      <div className="mt-2 flex items-center gap-2.5 rounded-xl p-2" style={{ background: "var(--dk-yolk-wash)" }}>
                        <Thumb p={suggestByIdx.get(p.i)} size={44} />
                        <span className="min-w-0 flex-1 text-[12.5px]" style={{ color: "var(--dk-yolk-ink)" }}>
                          น่าจะเป็น <b>{suggestByIdx.get(p.i)!.name}</b> — ดูภาพแล้วใช่ค่อยกดใช้
                        </span>
                        <Btn tone="yolk" small onClick={() => patch(p.i, { imageProductId: suggestByIdx.get(p.i)!.id })}>
                          ใช้ภาพนี้
                        </Btn>
                      </div>
                    )}
                    <label className="dkb-g dkb-field mt-2">
                      <span className="lb">{p.imageProductId ? "เปลี่ยนเป็นสินค้าอื่น" : "ค้นสินค้าในร้าน"}</span>
                      <input value={pq} onChange={(e) => setPq(e.target.value)} placeholder="พิมพ์ชื่อสินค้า เช่น การ์ดโฮลเดอร์" />
                    </label>
                    {pkw && (
                      <div className="mt-1.5 grid gap-1">
                        {pickList.length === 0 ? (
                          <p className="px-1 text-[12px]" style={{ color: "var(--dk-faint)" }}>
                            ไม่พบสินค้าชื่อนี้
                          </p>
                        ) : (
                          pickList.map((sp) => (
                            <button
                              key={sp.id}
                              type="button"
                              onClick={() => {
                                patch(p.i, { imageProductId: sp.id });
                                setPq("");
                              }}
                              className="flex items-center gap-2.5 rounded-xl p-1.5 text-left transition hover:bg-white/70"
                            >
                              <Thumb p={sp} size={40} />
                              <span className="min-w-0 flex-1 truncate text-[13px]" style={{ color: "var(--dk-navy)" }}>
                                {sp.name}
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 border-t pt-2.5" style={{ borderColor: "var(--dk-hair)" }}>
                    <Btn tone="navy" small onClick={() => setOpenIdx(null)}>
                      ปิด
                    </Btn>
                    <span className="ml-auto">
                      <Btn small onClick={() => remove(p.i)}>
                        ลบรายการนี้
                      </Btn>
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <Row
                key={p.i}
                tone={p.detail.trim() ? "var(--dk-sky-300)" : "var(--dk-yolk-deep)"}
                onClick={() => {
                  setOpenIdx(p.i);
                  setPq("");
                }}
              >
                <RowMain
                  name={p.name || "(ยังไม่ตั้งชื่อ)"}
                  tags={!p.detail.trim() ? <Tag tone="yolk">ยังไม่ใส่สเปค</Tag> : undefined}
                  meta={<span title={p.detail}>{p.detail.split("\n")[0] || "—"}</span>}
                />
                <RowSide>
                  {p.imageProductId ? (
                    <Thumb p={productById.get(p.imageProductId)} />
                  ) : suggestByIdx.get(p.i) ? (
                    /* แถวเป็น <button> อยู่แล้ว ซ้อนปุ่มจริงไม่ได้ → span กดได้ + กันไม่ให้ไปกางแถว */
                    <span
                      role="button"
                      tabIndex={0}
                      title={`ใช้ภาพจาก "${suggestByIdx.get(p.i)!.name}" — ดูภาพแล้วใช่ค่อยกด`}
                      onClick={(e) => {
                        e.stopPropagation();
                        patch(p.i, { imageProductId: suggestByIdx.get(p.i)!.id });
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" && e.key !== " ") return;
                        e.preventDefault();
                        e.stopPropagation();
                        patch(p.i, { imageProductId: suggestByIdx.get(p.i)!.id });
                      }}
                      className="flex items-center gap-1.5 rounded-xl py-1 pl-1 pr-2 text-[11.5px] font-semibold"
                      style={{ background: "var(--dk-yolk-wash)", color: "var(--dk-yolk-ink)" }}
                    >
                      <Thumb p={suggestByIdx.get(p.i)} size={30} />
                      <span className="max-w-[9rem] truncate">ใช่ {suggestByIdx.get(p.i)!.name}?</span>
                    </span>
                  ) : null}
                  <span style={{ color: "var(--dk-faint)" }}>›</span>
                </RowSide>
              </Row>
            )
          )}
        </Rows>
      )}

      {/* แถบบันทึกลอยติดขอบล่าง — เห็นตลอด ไม่ต้องเลื่อนหา */}
      <div className="dkb-g sticky bottom-3 z-20 mt-5 flex items-center justify-between gap-3 px-4 py-2.5">
        {dirty ? (
          <p className="text-[12.5px] font-semibold" style={{ color: "var(--dk-coral-ink)" }}>
            มีการแก้ไขที่ยังไม่ได้บันทึก
          </p>
        ) : (
          <p className="text-[12.5px]" style={{ color: "var(--dk-faint)" }}>
            แก้เสร็จแล้วกดบันทึก — มีผลกับปุ่ม “เพิ่มรายการพิเศษ” ทันที
          </p>
        )}
        <Btn tone={saved ? "ghost" : "navy"} onClick={() => void save()} disabled={!dirty || saving}>
          {saving ? "กำลังบันทึก…" : saved ? "บันทึกแล้ว" : "บันทึก"}
        </Btn>
      </div>

      <p className="mt-4 text-center text-[12px]" style={{ color: "var(--dk-faint)" }}>
        ใช้งานคลังนี้ได้ที่{" "}
        <Link href="/admin/orders" className="font-semibold underline-offset-4 hover:underline" style={{ color: "var(--dk-blue-deep)" }}>
          คำสั่งซื้อ
        </Link>{" "}
        → เปิดออเดอร์ → “เพิ่มรายการพิเศษ”
      </p>
    </PageShell>
  );
}

/** กันคนไม่มีสิทธิ์เข้าตรง ๆ (ของจริงบังคับที่ API อีกชั้น) */
export default function SpecialProductsPage() {
  return (
    <RequirePerm perm="orders.edit">
      <SpecialProductsInner />
    </RequirePerm>
  );
}
