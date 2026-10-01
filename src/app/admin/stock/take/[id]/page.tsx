"use client";

/**
 * 📱 หน้าเบิกวัสดุจาก QR ป้ายชั้นวาง — /admin/stock/take/<skuId> (เจ้าของร้านสั่ง 1 ต.ค. 69)
 *
 * คนใช้: พนักงานยืนหน้าชั้น มือถือข้างเดียว เพิ่งแกะแพ็คใหม่ · ต้องจบใน 10 วินาที ไม่งั้นคนข้าม
 * โครง: ของตัวนี้คืออะไร/เหลือเท่าไหร่ → ใส่จำนวน (ปุ่มใหญ่ ± · สลับชิ้น/แพ็ค) → เหตุผล 2 ทาง → ปุ่มเบิกติดล่าง
 * หลังเบิก: บอกยอดใหม่ + เบิกอีกได้ทันที · ประวัติเบิกล่าสุดอยู่ท้ายหน้าให้เห็นว่าใครเบิกไปก่อน
 * ป้าย QR พิมพ์จาก /admin/stock/labels · API: /api/admin/stock/take (เบิกออกอย่างเดียว ทุกคนที่ล็อกอินได้)
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCan } from "@/lib/perm-context";
import {
  TONE,
  badge,
  code as codeCls,
  input as inputCls,
  metric,
} from "@/lib/admin-ui";
import { PageShell } from "@/components/admin/ui";

interface TakeItem {
  id: string;
  name: string;
  code?: string;
  family?: string;
  category?: string;
  unit: string;
  packUnit?: string;
  packSize?: number;
  balance: number;
  imageUrl?: string;
  manualOnly?: boolean;
  reorderPoint?: number;
}
interface TakeMove {
  id: string;
  qty: number;
  reason: string;
  note?: string;
  by: string;
  at: string;
  balanceAfter: number;
}

const fmtN = (n: number) => n.toLocaleString("th-TH");
const fmtAt = (iso: string) =>
  new Date(iso).toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
const hasPack = (it: { packSize?: number }) => (it.packSize ?? 0) > 1;
/** 340 แผ่น (1 แพ็ค = 100) → "3 แพ็ค + 40 แผ่น" — ชุดเดียวกับ packText ในหน้าคลัง */
function packText(it: TakeItem, n: number): string | null {
  if (!hasPack(it)) return null;
  const size = it.packSize!;
  const abs = Math.abs(n);
  const packs = Math.floor(abs / size);
  const rest = abs % size;
  const pu = it.packUnit || "แพ็ค";
  const s = packs
    ? `${fmtN(packs)} ${pu}${rest ? ` + ${fmtN(rest)} ${it.unit}` : ""}`
    : `${fmtN(rest)} ${it.unit}`;
  return n < 0 ? `−${s}` : s;
}

type Reason = "เบิกผลิต" | "เบิกทำเสีย";

export default function TakePage() {
  const { id } = useParams<{ id: string }>();
  const can = useCan();
  const [item, setItem] = useState<TakeItem | null>(null);
  const [moves, setMoves] = useState<TakeMove[]>([]);
  const [who, setWho] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const [raw, setRaw] = useState("1");
  const [inPack, setInPack] = useState(false);
  const [reason, setReason] = useState<Reason>("เบิกผลิต");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ qty: number; balance: number } | null>(
    null,
  );

  const load = useCallback(async () => {
    setErr("");
    try {
      const res = await fetch(
        `/api/admin/stock/take?id=${encodeURIComponent(id)}`,
        { cache: "no-store" },
      );
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) {
        setErr(j?.error ?? "โหลดไม่สำเร็จ");
        setItem(null);
      } else {
        setItem(j.item);
        setMoves(j.moves ?? []);
        setWho(j.by ?? "");
      }
    } catch {
      setErr("ต่อเซิร์ฟเวอร์ไม่ได้ — เช็คอินเทอร์เน็ตแล้วลองใหม่");
    }
    setLoading(false);
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  // แพ็คใช้ได้เฉพาะของที่ตั้ง packSize — เปิดโหมดแพ็คให้ก่อนเมื่อของนั้นมีแพ็ค (คนมักเบิกตอนแกะแพ็ค)
  useEffect(() => {
    if (item && hasPack(item)) setInPack(true);
  }, [item]);

  const packed = !!item && hasPack(item);
  const n = Math.max(0, Math.trunc(Number(raw) || 0));
  const base = packed && inPack ? n * item!.packSize! : n;
  const over = !!item && base > Math.max(0, item.balance);
  const after = item ? item.balance - base : 0;
  const unit = item?.unit ?? "ชิ้น";
  const pu = item?.packUnit || "แพ็ค";

  const bump = (d: number) => setRaw(String(Math.max(0, n + d)));

  const submit = async () => {
    if (!item || base <= 0 || busy) return;
    setBusy(true);
    setErr("");
    const packNote = packed && inPack ? `${fmtN(n)} ${pu}` : "";
    const res = await fetch("/api/admin/stock/take", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itemId: item.id,
        qty: base,
        reason,
        note: [packNote, note.trim()].filter(Boolean).join(" · "),
      }),
    });
    const j = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok || !j?.ok) return setErr(j?.error ?? "บันทึกไม่สำเร็จ");
    setDone({ qty: base, balance: j.balanceAfter });
    setNote("");
    setRaw("1");
    void load();
  };

  const recent = useMemo(() => moves.slice(0, 8), [moves]);

  if (loading)
    return (
      <PageShell>
        <div
          className="mx-auto max-w-md px-1 py-10 text-center text-sm text-slate-400"
          aria-busy
        >
          กำลังโหลดข้อมูลวัสดุ…
        </div>
      </PageShell>
    );
  if (!item)
    return (
      <PageShell>
        <div className="mx-auto max-w-md px-1 py-10 text-center">
          <p className="text-3xl" aria-hidden>
            🏷
          </p>
          <p className="mt-2 text-base font-semibold text-slate-800">
            เปิดป้ายนี้ไม่ได้
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {err || "ไม่พบวัสดุนี้"}
          </p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            ลองใหม่
          </button>
        </div>
      </PageShell>
    );

  return (
    <PageShell>
      <div className="mx-auto max-w-md pb-28">
        {/* ของตัวนี้คืออะไร เหลือเท่าไหร่ — อ่านจากระยะแขนได้ */}
        <header className="flex items-start gap-3">
          <span className="block h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200/70">
            {item.imageUrl && (
              <img
                src={item.imageUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
              เบิกวัสดุ
            </p>
            <h1 className="text-lg font-semibold leading-tight text-slate-900">
              {item.name}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              {item.code && <span className={codeCls}>{item.code}</span>}
              {item.family && (
                <span className="text-[11px] text-slate-400">
                  {item.family}
                </span>
              )}
              {item.manualOnly && (
                <span
                  className={`${badge} ${TONE.neutral.bg} ${TONE.neutral.text}`}
                >
                  เบิกเองอย่างเดียว
                </span>
              )}
            </p>
          </div>
        </header>

        <div className="mt-4 flex items-end justify-between gap-3 rounded-2xl border border-slate-200/70 bg-white px-4 py-3">
          <div>
            <p className="text-[11px] text-slate-500">คงเหลือในระบบ</p>
            <p
              className={`${metric} mt-0.5 ${item.balance < 0 ? TONE.danger.text : ""}`}
            >
              {fmtN(item.balance)}{" "}
              <span className="text-sm font-medium text-slate-400">{unit}</span>
            </p>
            {packText(item, item.balance) && (
              <p className="mt-0.5 text-xs tabular-nums text-slate-500">
                = {packText(item, item.balance)}
              </p>
            )}
          </div>
          {item.reorderPoint != null && item.reorderPoint > 0 && (
            <p
              className={`text-[11px] font-medium ${item.balance <= item.reorderPoint ? TONE.danger.text : "text-slate-400"}`}
            >
              จุดสั่ง ≤ {fmtN(item.reorderPoint)}
            </p>
          )}
        </div>

        {done && (
          <div
            className={`mt-3 flex items-center gap-3 rounded-2xl px-4 py-3 text-sm ${TONE.ok.bg} ${TONE.ok.text}`}
            role="status"
          >
            <span className="text-xl" aria-hidden>
              ✓
            </span>
            <span className="min-w-0 flex-1">
              เบิกแล้ว <b className="tabular-nums">{fmtN(done.qty)}</b> {unit} ·
              เหลือ <b className="tabular-nums">{fmtN(done.balance)}</b> {unit}
              {packText(item, done.balance)
                ? ` (${packText(item, done.balance)})`
                : ""}
            </span>
            <button
              type="button"
              onClick={() => setDone(null)}
              className="shrink-0 text-xs font-semibold underline underline-offset-2"
            >
              เบิกอีก
            </button>
          </div>
        )}

        {/* จำนวน — ปุ่มใหญ่กดนิ้วโป้ง · ของที่มีแพ็คเลือกกรอกเป็นแพ็คได้ (เบิกตอนแกะแพ็คใหม่ = นับง่ายสุด) */}
        <section className="mt-4">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold text-slate-800">
              เบิกกี่{packed && inPack ? pu : unit}
            </p>
            {packed && (
              <div
                className="inline-flex rounded-full bg-slate-100 p-0.5"
                role="radiogroup"
                aria-label="หน่วยที่กรอก"
              >
                {(
                  [
                    [true, pu],
                    [false, unit],
                  ] as [boolean, string][]
                ).map(([v, lb]) => (
                  <button
                    key={lb}
                    type="button"
                    role="radio"
                    aria-checked={inPack === v}
                    onClick={() => setInPack(v)}
                    className={`rounded-full px-3 py-1 text-[12px] font-medium transition ${inPack === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
                  >
                    {lb}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="mt-2 flex items-stretch gap-2">
            <button
              type="button"
              onClick={() => bump(-1)}
              aria-label="ลด 1"
              className="w-16 shrink-0 rounded-xl border border-slate-200 bg-white text-2xl font-semibold text-slate-700 hover:bg-slate-50"
            >
              −
            </button>
            <input
              value={raw}
              onChange={(e) => setRaw(e.target.value.replace(/\D/g, ""))}
              onFocus={(e) => e.target.select()}
              inputMode="numeric"
              aria-label="จำนวนที่เบิก"
              className={`${inputCls} !h-16 min-w-0 flex-1 text-center text-3xl font-semibold tabular-nums`}
            />
            <button
              type="button"
              onClick={() => bump(1)}
              aria-label="เพิ่ม 1"
              className="w-16 shrink-0 rounded-xl border border-slate-200 bg-white text-2xl font-semibold text-slate-700 hover:bg-slate-50"
            >
              ＋
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[1, 2, 5, 10].map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setRaw(String(q))}
                className={`rounded-full border px-3 py-1 text-[12px] font-medium transition ${n === q ? "border-amber-500 bg-amber-500 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
              >
                {q} {packed && inPack ? pu : unit}
              </button>
            ))}
          </div>
          <p
            className={`mt-2 text-xs ${over ? TONE.warn.text : "text-slate-500"}`}
          >
            {base > 0 ? (
              <>
                {packed && inPack
                  ? `${fmtN(n)} ${pu} = ${fmtN(base)} ${unit} · `
                  : ""}
                หลังเบิกเหลือ <b className="tabular-nums">{fmtN(after)}</b>{" "}
                {unit}
                {over
                  ? " — เกินยอดในระบบ ยอดจะติดลบ (บันทึกได้ แต่ควรแจ้งแอดมินนับจริง)"
                  : ""}
              </>
            ) : (
              "ใส่จำนวนที่เบิกก่อน"
            )}
          </p>
        </section>

        {/* เหตุผล 2 ทาง — การ์ดเลือกเห็นทั้งคู่ ไม่ต้องเปิด dropdown */}
        <section className="mt-4">
          <p className="text-[13px] font-semibold text-slate-800">
            เบิกไปทำอะไร
          </p>
          <div
            className="mt-2 grid grid-cols-2 gap-2"
            role="radiogroup"
            aria-label="เหตุผลที่เบิก"
          >
            {(
              [
                ["เบิกผลิต", "ใช้ผลิตงาน", "ของออกไปทำงานตามปกติ"],
                [
                  "เบิกทำเสีย",
                  "ทำเสีย / ทิ้ง",
                  "ของชำรุด ใช้ไม่ได้ ต้องสั่งเพิ่ม",
                ],
              ] as [Reason, string, string][]
            ).map(([v, t, d]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={reason === v}
                onClick={() => setReason(v)}
                className={`flex min-h-[64px] items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition ${
                  reason === v
                    ? "border-amber-500 bg-amber-500 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span className="mt-0.5 text-sm leading-none" aria-hidden>
                  {reason === v ? "●" : "○"}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold">{t}</span>
                  <span
                    className={`block text-[11px] leading-snug ${reason === v ? "text-white/80" : "text-slate-400"}`}
                  >
                    {d}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="ใช้กับงานอะไร (ไม่บังคับ)"
            className={`${inputCls} mt-2 !h-11`}
          />
        </section>

        {err && (
          <p
            className={`mt-3 rounded-xl px-3 py-2 text-xs ${TONE.danger.bg} ${TONE.danger.text}`}
            role="alert"
          >
            {err}
          </p>
        )}

        {/* เบิกล่าสุด — เห็นว่าใครเบิกไปก่อน จะได้ไม่เบิกซ้ำ/รู้ว่าของเหลือจริงไหม */}
        <section className="mt-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
            เคลื่อนไหวล่าสุด
          </p>
          {recent.length ? (
            <ul className="mt-1.5 divide-y divide-slate-100 rounded-xl border border-slate-200/70 bg-white">
              {recent.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center gap-2 px-3 py-2 text-xs"
                >
                  <span
                    className={`w-14 shrink-0 text-right font-semibold tabular-nums ${m.qty > 0 ? TONE.ok.text : TONE.danger.text}`}
                  >
                    {m.qty > 0 ? `+${fmtN(m.qty)}` : fmtN(m.qty)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-slate-600">
                    {m.reason}
                    {m.note ? ` · ${m.note}` : ""}{" "}
                    <span className="text-slate-400">· {m.by}</span>
                  </span>
                  <span className="shrink-0 text-slate-400">{fmtAt(m.at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 text-xs text-slate-400">
              ยังไม่มีใครเบิกตัวนี้ผ่านระบบ
            </p>
          )}
        </section>

        {can("orders.edit") && (
          <p className="mt-4 text-xs text-slate-400">
            <Link
              href="/admin/stock"
              className="underline underline-offset-2 hover:text-slate-700"
            >
              ← เปิดคลังวัสดุ
            </Link>{" "}
            · รับเข้า/นับจริงทำที่นั่น
          </p>
        )}

        {/* ปุ่มเบิกติดล่างจอ — นิ้วโป้งถึง */}
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur md:left-auto md:right-0 md:w-auto md:min-w-[28rem] md:rounded-tl-2xl md:border-l">
          <div className="mx-auto max-w-md">
            <button
              type="button"
              disabled={busy || base <= 0}
              onClick={() => void submit()}
              className="inline-flex min-h-[52px] w-full items-center justify-center rounded-xl text-base font-semibold bg-amber-500 text-white shadow-sm transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy
                ? "กำลังบันทึก…"
                : base > 0
                  ? `เบิก ${fmtN(base)} ${unit}${reason === "เบิกทำเสีย" ? " (ทำเสีย)" : ""}`
                  : "เบิกออก"}
            </button>
            {who && (
              <p className="mt-1 text-center text-[11px] text-slate-400">
                บันทึกในชื่อ {who}
              </p>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
