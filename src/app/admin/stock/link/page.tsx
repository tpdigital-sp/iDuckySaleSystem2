"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useCan } from "@/lib/perm-context";
import { code as codeCls, input as inputCls, label as labelCls } from "@/lib/admin-ui";
import {
  Banner,
  Btn,
  Empty,
  FChip,
  FilterCard,
  HeroStat,
  ListHead,
  PageHead,
  PageShell,
  SearchBox,
  Stat,
  Stats,
  TabRow,
  Tag,
} from "@/components/admin/ui";

/**
 * ผูกตัวเลือกสินค้า → SKU ในคลัง (งานกวาดครั้งเดียว)
 *
 * แถวจาก "คลังตัวเลือกกลาง" ขึ้นก่อนเสมอ — ผูกครั้งเดียวมีผลกับทุกสินค้าที่ลิงก์คลังนั้น
 * คุ้มกว่าไล่ผูกรายสินค้าหลายเท่า (สีไหม 13 ค่า = 14 สินค้าได้ผลทันที)
 */

interface Choice {
  name: string;
  stockItemId: string | null;
}
interface PresetRow {
  kind: "preset";
  key: string;
  presetId: string;
  label: string;
  usedBy: number;
  choices: Choice[];
}
interface ProductRow {
  kind: "product";
  key: string;
  productId: string;
  productName: string;
  draft: boolean;
  label: string;
  choices: Choice[];
}
type Row = PresetRow | ProductRow;
interface Sku {
  id: string;
  code?: string;
  name: string;
  unit: string;
  family?: string;
  aliases?: string[];
}

const norm = (s: string) =>
  String(s || "").toLowerCase().replace(/เเ/g, "แ").replace(/\s+/g, "").replace(/[็่้๊๋์]/g, "");

export default function StockLinkPage() {
  const can = useCan();
  const mayEdit = can("orders.edit");
  const [rows, setRows] = useState<Row[]>([]);
  const [items, setItems] = useState<Sku[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/stock/link");
    const j = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok || !j?.ok) {
      setErr(j?.error ?? "โหลดข้อมูลไม่สำเร็จ");
      return;
    }
    setRows([...j.presetRows, ...j.productRows]);
    setItems(j.items);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function setLink(row: Row, choice: string, stockItemId: string | null) {
    const tag = `${row.key}|${choice}`;
    setSaving(tag);
    setErr("");
    const body =
      row.kind === "preset"
        ? { presetId: row.presetId, choice, stockItemId }
        : { productId: row.productId, label: row.label, choice, stockItemId };
    const res = await fetch("/api/admin/stock/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => null);
    setSaving(null);
    if (!res.ok || !j?.ok) {
      setErr(j?.error ?? "บันทึกไม่สำเร็จ");
      return;
    }
    // อัปเดตในจอทันที ไม่ต้องโหลดใหม่ทั้งตาราง (แถวเยอะ)
    setRows((prev) =>
      prev.map((r) =>
        r.key !== row.key ? r : { ...r, choices: r.choices.map((c) => (c.name === choice ? { ...c, stockItemId } : c)) }
      )
    );
  }

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .map((r) => ({ ...r, choices: onlyOpen ? r.choices.filter((c) => !c.stockItemId) : r.choices }))
      .filter((r) => r.choices.length > 0)
      .filter(
        (r) =>
          !needle ||
          r.label.toLowerCase().includes(needle) ||
          (r.kind === "product" && r.productName.toLowerCase().includes(needle)) ||
          r.choices.some((c) => c.name.toLowerCase().includes(needle))
      )
      .sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "preset" ? -1 : 1; // คลังกลางก่อน คุ้มกว่า
        if (a.kind === "preset" && b.kind === "preset") return b.usedBy - a.usedBy;
        return b.choices.length - a.choices.length;
      });
  }, [rows, q, onlyOpen]);

  const totalChoices = rows.reduce((s, r) => s + r.choices.length, 0);
  const doneChoices = rows.reduce((s, r) => s + r.choices.filter((c) => c.stockItemId).length, 0);
  const pct = totalChoices ? Math.round((doneChoices / totalChoices) * 100) : 0;

  if (!mayEdit) {
    return (
      <PageShell>
        <Empty title="บัญชีนี้ไม่มีสิทธิ์จัดการสต๊อก" body="ติดต่อผู้ดูแลระบบให้เปลี่ยนแผนกหรือบทบาทให้ก่อน" />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHead
        group="สินค้า"
        title="ผูกตัวเลือกกับคลัง"
        count={`${totalChoices.toLocaleString("th-TH")} ค่า`}
        sub="ลูกค้าเลือกค่าไหน = ตัดวัสดุตัวไหน · แถวจากคลังตัวเลือกกลางขึ้นก่อน เพราะผูกครั้งเดียวมีผลหลายสินค้า"
        tools={
          <>
            <SearchBox value={q} onChange={setQ} placeholder="ค้นชื่อสินค้า มิติ หรือค่าตัวเลือก" />
            <Btn href="/admin/stock">กลับหน้าคลัง</Btn>
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
          n={(totalChoices - doneChoices).toLocaleString("th-TH")}
          label="ยังไม่ผูก"
          detail="ค่าพวกนี้ขายแล้วสต๊อกไม่ถูกตัด — ผิดเงียบ ๆ โดยไม่มีใครรู้"
          pct={100 - pct}
        />
        <Stat label="ผูกแล้ว" value={doneChoices.toLocaleString("th-TH")} hint={`${pct}% ของทั้งหมด`} />
        <Stat label="SKU ที่ใช้อยู่" value={new Set(rows.flatMap((r) => r.choices.map((c) => c.stockItemId).filter(Boolean))).size} hint={`จาก ${items.length} SKU`} />
      </Stats>

      <FilterCard>
        <TabRow>
          <FChip on={onlyOpen} onClick={() => setOnlyOpen(true)} label="เฉพาะที่ยังไม่ผูก" count={totalChoices - doneChoices} />
          <FChip on={!onlyOpen} onClick={() => setOnlyOpen(false)} label="ทั้งหมด" count={totalChoices} />
        </TabRow>
      </FilterCard>

      <ListHead title="ตัวเลือก" note="คลังกลางขึ้นก่อน — ผูกครั้งเดียวมีผลหลายสินค้า" />

      {loading ? (
        <Empty title="กำลังโหลด…" body="ดึงตัวเลือกกับ SKU จากเซิร์ฟเวอร์" />
      ) : shown.length === 0 ? (
        <Empty
          title={onlyOpen ? "ผูกครบทุกค่าแล้ว" : "ไม่พบรายการที่ค้นหา"}
          body={onlyOpen ? "ขายแล้วสต๊อกตัดครบทุกค่า — ไม่ต้องทำอะไรต่อ" : "ลองค้นด้วยชื่อสินค้าหรือค่าตัวเลือกแทน"}
        />
      ) : (
        <div className="grid gap-3">
          {shown.map((row) => {
            const open = row.choices.filter((c) => !c.stockItemId).length;
            return (
              <section
                key={row.key}
                className="dkb-g relative overflow-hidden"
                style={{ ["--dk-tone" as string]: open ? "var(--dk-coral-deep)" : "var(--dk-mint)" }}
              >
                <span className="absolute inset-y-0 left-0 w-[6px]" style={{ background: "var(--dk-tone)" }} />
                <header className="flex flex-wrap items-center gap-2 border-b px-4 py-3 pl-5" style={{ borderColor: "var(--dk-hair)" }}>
                  {row.kind === "preset" ? (
                    <>
                      <Tag tone="mint">คลังกลาง</Tag>
                      <span className="dkb-display text-[0.98rem]">{row.label}</span>
                      <span className="text-[12px]" style={{ color: "var(--dk-navy-soft)" }}>
                        มีผลกับสินค้า {row.usedBy} ตัว
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="dkb-display text-[0.98rem]">{row.label}</span>
                      <span className="truncate text-[12px]" style={{ color: "var(--dk-faint)" }}>
                        {row.productName}
                      </span>
                      {row.draft && <Tag tone="yolk">ร่าง</Tag>}
                    </>
                  )}
                  <span className="ml-auto flex items-center gap-2">
                    {open > 0 && <Tag tone="solid">ยังไม่ผูก {open}</Tag>}
                    <span className="text-[12px]" style={{ color: "var(--dk-faint)" }}>
                      {row.choices.length} ค่า
                    </span>
                  </span>
                </header>
                <ul>
                  {/* key ต้องมีลำดับด้วย — ข้อมูลเก่ามีชื่อตัวเลือกซ้ำในกลุ่มเดียวกัน ("เคลือบพิเศษ" 2 ครั้ง) */}
                  {row.choices.map((c, ci) => (
                    <li key={`${ci}-${c.name}`} className="dkb-row !min-h-[52px] !rounded-none px-4 pl-5">
                      <span className="min-w-0 flex-1 truncate text-[14px]">{c.name}</span>
                      <ChoiceLink
                        items={items}
                        choiceName={c.name}
                        value={c.stockItemId}
                        busy={saving === `${row.key}|${c.name}`}
                        onPick={(id) => setLink(row, c.name, id)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}

/** ช่องผูก SKU ต่อหนึ่งค่า — เดาให้จากชื่อ/alias แต่ไม่ผูกให้เอง ต้องกดยืนยัน */
function ChoiceLink({
  items,
  choiceName,
  value,
  busy,
  onPick,
}: {
  items: Sku[];
  choiceName: string;
  value: string | null;
  busy: boolean;
  onPick: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const picked = value ? items.find((i) => i.id === value) : null;

  /** ตัวที่น่าจะใช่ — ชื่อหรือ alias ตรงกับค่าตัวเลือก · แสดงเป็นปุ่มลัด ไม่ผูกอัตโนมัติ */
  const suggest = useMemo(() => {
    const n = norm(choiceName);
    if (n.length < 2) return null;
    return (
      items.find((i) => norm(i.name) === n) ??
      items.find((i) => (i.aliases ?? []).some((a) => norm(a) === n)) ??
      items.find((i) => norm(i.name).includes(n) && n.length >= 3) ??
      null
    );
  }, [items, choiceName]);

  const hits = useMemo(() => {
    const needle = norm(q);
    if (!needle) return items.slice(0, 40);
    return items
      .filter((i) => norm(i.name).includes(needle) || norm(i.code ?? "").includes(needle) || (i.aliases ?? []).some((a) => norm(a).includes(needle)))
      .slice(0, 40);
  }, [items, q]);

  if (picked) {
    return (
      <span className="flex shrink-0 items-center gap-2">
        <span className="text-right">
          <span className="block text-[14px] font-medium">{picked.name}</span>
          {picked.code && <span className={codeCls}>{picked.code}</span>}
        </span>
        <button type="button" disabled={busy} onClick={() => onPick(null)} className="dkb-btn dkb-btn-ghost dkb-btn-sm">
          ถอด
        </button>
      </span>
    );
  }

  return (
    <span ref={boxRef} className="relative flex shrink-0 items-center gap-2">
      {suggest && !open && (
        <button type="button" disabled={busy} onClick={() => onPick(suggest.id)} className="dkb-btn dkb-btn-navy dkb-btn-sm" title={suggest.code}>
          ใช้ “{suggest.name.slice(0, 22)}”
        </button>
      )}
      <button type="button" disabled={busy} onClick={() => setOpen((v) => !v)} className="dkb-btn dkb-btn-ghost dkb-btn-sm">
        {busy ? "กำลังบันทึก…" : "เลือก SKU"}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-80 rounded-[18px] border border-white/90 bg-white p-2 shadow-[0_20px_44px_rgba(23,58,107,.22)]">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นชื่อ รหัส หรือชื่อที่เคยเรียก…"
            className={inputCls}
          />
          <ul className="mt-1 max-h-64 overflow-y-auto">
            {hits.map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(i.id);
                    setOpen(false);
                  }}
                  className="dkb-row !min-h-0 w-full gap-2 px-2 py-1.5 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px]">{i.name}</span>
                    <span className="flex gap-2">
                      {i.code && <span className={codeCls}>{i.code}</span>}
                      {i.family && <span className="text-[11px]" style={{ color: "var(--dk-faint)" }}>{i.family}</span>}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {hits.length === 0 && <li className={`${labelCls} px-2 py-3 text-center`}>ไม่พบ SKU</li>}
          </ul>
        </div>
      )}
    </span>
  );
}
