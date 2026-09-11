"use client";

/**
 * 📂 โยนโฟลเดอร์งานที่เข้าผลิต → จับคู่ออเดอร์ → ติ๊ก "ส่งเข้าผลิตแล้ว"
 *
 * ฝ่ายผลิตวางไฟล์งานไว้ที่ /Volumes/iDuckyShop/1.Order Today/<คน วันที่>/<หมวด>/<ชื่องาน>
 * โยนโฟลเดอร์ของวัน (หรือโฟลเดอร์งานทีละใบ) ลงตรงนี้ — อ่านแค่ "ชื่อโฟลเดอร์" ไม่อัปโหลดไฟล์
 * เซิร์ฟเวอร์ (/api/admin/orders/production-folders) จับคู่ชื่อกับออเดอร์ (ดู src/lib/production-match.ts)
 * ขั้นตอน: โยน → ดูผลจับคู่ก่อน (ยังไม่แตะ DB) → เลือกใบที่คลุมเครือเอง → กดยืนยัน
 *
 * ลากวางใช้ webkitGetAsEntry เดินโฟลเดอร์ (Chrome/Edge/Safari) · ปุ่มเลือกใช้ input webkitdirectory (โฟลเดอร์ว่างจะไม่ขึ้น เพราะเบราว์เซอร์ให้แต่ไฟล์)
 */

import { useCallback, useRef, useState, type DragEvent } from "react";
import { Btn } from "@/components/admin/ui";
import type { FolderAmbiguous, FolderMatch } from "@/lib/production-match";

interface MatchResp {
  ok?: boolean;
  error?: string;
  matched: FolderMatch[];
  ambiguous: FolderAmbiguous[];
  unmatchedIds: string[];
  skipped: number;
  skippedNames?: string[];
  scanned?: number;
  alreadySent: FolderMatch[];
  applied: number;
}

const MAX_DEPTH = 4;
/** ไฟล์ในโฟลเดอร์งานที่ชื่อมีเลขออเดอร์ ("OD-260909-1588.html" ที่ระบบสร้างให้กราฟฟิก) — ส่งพาธไปด้วย เซิร์ฟเวอร์ใช้เลขนี้จับคู่แบบชัวร์ ไม่ต้องเดาจากชื่อโฟลเดอร์ */
const OD_FILE_RE = /OD-\d{6}-\d{3,}/i;

/** เดินโฟลเดอร์ที่ลากมา → พาธของทุกโฟลเดอร์ย่อย + ไฟล์ที่ชื่อมีเลข OD (อ่านแค่ชื่อ ไม่อ่านเนื้อไฟล์) */
async function walkEntry(entry: FileSystemEntry, prefix: string, depth: number, out: string[]): Promise<void> {
  if (!entry.isDirectory) return;
  const path = prefix ? `${prefix}/${entry.name}` : entry.name;
  out.push(path);
  if (depth >= MAX_DEPTH) return;
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const kids: FileSystemEntry[] = [];
  // readEntries คืนทีละชุด (Chrome ชุดละ 100) ต้องวนจนได้ชุดว่าง
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
    if (!batch.length) break;
    kids.push(...batch);
  }
  for (const k of kids) {
    if (k.name.startsWith(".")) continue;
    if (k.isDirectory) await walkEntry(k, path, depth + 1, out);
    else if (OD_FILE_RE.test(k.name)) out.push(`${path}/${k.name}`);
  }
}

export default function ProductionFolderDrop({ onApplied }: { onApplied: () => void }) {
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState<"scan" | "apply" | null>(null);
  const [paths, setPaths] = useState<string[]>([]);
  const [res, setRes] = useState<MatchResp | null>(null);
  const [err, setErr] = useState("");
  /** ใบที่คนเลือกให้โฟลเดอร์คลุมเครือ: folder → orderId ("" = ข้าม) */
  const [pick, setPick] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const scan = useCallback(async (list: string[]) => {
    const uniq = [...new Set(list)].filter(Boolean);
    setPaths(uniq);
    setRes(null);
    setPick({});
    setErr("");
    if (!uniq.length) {
      setErr("ไม่เจอโฟลเดอร์ในสิ่งที่โยนมา — โยนโฟลเดอร์ของวัน (เช่น Donut 10-09-69) หรือโฟลเดอร์งานทีละใบ");
      return;
    }
    setBusy("scan");
    try {
      const r = await fetch("/api/admin/orders/production-folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths: uniq }),
      });
      const j = (await r.json().catch(() => ({}))) as MatchResp;
      if (!r.ok) setErr(j.error || `จับคู่ไม่สำเร็จ (${r.status})`);
      else setRes(j);
    } catch {
      setErr("ติดต่อเซิร์ฟเวอร์ไม่ได้ — ลองใหม่อีกครั้ง");
    } finally {
      setBusy(null);
    }
  }, []);

  const onDrop = useCallback(
    async (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setOver(false);
      const items = Array.from(e.dataTransfer.items ?? []);
      const out: string[] = [];
      for (const it of items) {
        const entry = typeof it.webkitGetAsEntry === "function" ? it.webkitGetAsEntry() : null;
        if (entry) await walkEntry(entry, "", 1, out);
      }
      await scan(out);
    },
    [scan]
  );

  const onPickFiles = useCallback(
    async (files: FileList | null) => {
      const out = new Set<string>();
      Array.from(files ?? []).forEach((f) => {
        const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || "";
        const parts = rel.split("/").filter(Boolean);
        const fileName = parts.pop() ?? ""; // ตัดชื่อไฟล์ เหลือโฟลเดอร์
        for (let i = 1; i <= Math.min(parts.length, MAX_DEPTH); i++) out.add(parts.slice(0, i).join("/"));
        if (OD_FILE_RE.test(fileName) && parts.length) out.add([...parts, fileName].join("/"));
      });
      await scan([...out]);
    },
    [scan]
  );

  const apply = useCallback(async () => {
    if (!res) return;
    setBusy("apply");
    setErr("");
    try {
      const picks = Object.entries(pick)
        .filter(([, id]) => id)
        .map(([folder, orderId]) => ({ folder, orderId }));
      const r = await fetch("/api/admin/orders/production-folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths, apply: true, pick: picks }),
      });
      const j = (await r.json().catch(() => ({}))) as MatchResp;
      if (!r.ok) {
        setErr(j.error || `บันทึกไม่สำเร็จ (${r.status})`);
        return;
      }
      setRes({ ...j, matched: [], ambiguous: [], unmatchedIds: j.unmatchedIds ?? [], alreadySent: [] });
      onApplied();
    } catch {
      setErr("ติดต่อเซิร์ฟเวอร์ไม่ได้ — ลองใหม่อีกครั้ง");
    } finally {
      setBusy(null);
    }
  }, [res, pick, paths, onApplied]);

  const pickedCount = Object.values(pick).filter(Boolean).length;
  const toApply = (res?.matched.length ?? 0) + pickedCount;

  return (
    <div className="dkb-g rounded-2xl p-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-dashed px-4 py-3 transition"
        style={{ borderColor: over ? "var(--dk-mint)" : "var(--dk-hair)", background: over ? "var(--dk-mint-wash)" : "transparent" }}
      >
        <span className="text-[26px]">📂</span>
        <span className="min-w-0 flex-1">
          <b className="block text-[14px]">โยนโฟลเดอร์งานที่เข้าผลิตลงตรงนี้</b>
          <span className="block text-[12px]" style={{ color: "var(--dk-faint)" }}>
            โยนโฟลเดอร์ของวัน (เช่น “Donut 10-09-69”) หรือโฟลเดอร์งานทีละใบจาก 1.Order Today — อ่านแค่ชื่อโฟลเดอร์ ไม่อัปโหลดไฟล์ · ระบบจับคู่ชื่อกับออเดอร์แล้วให้ดูก่อนยืนยัน
          </span>
        </span>
        <Btn small onClick={() => fileRef.current?.click()} disabled={busy !== null}>
          {busy === "scan" ? "กำลังจับคู่…" : "เลือกโฟลเดอร์"}
        </Btn>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          // @ts-expect-error webkitdirectory ไม่อยู่ใน typing ของ React แต่ Chrome/Safari รองรับ
          webkitdirectory=""
          multiple
          onChange={(e) => {
            void onPickFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {err && (
        <p className="mt-2 text-[12.5px] font-bold" style={{ color: "var(--dk-coral-deep)" }}>
          ⚠️ {err}
        </p>
      )}

      {res && (
        <div className="mt-3 space-y-2 text-[13px]">
          {res.applied > 0 && (
            <p className="font-bold" style={{ color: "var(--dk-mint-ink)" }}>
              ✅ ติ๊กส่งเข้าผลิตแล้ว {res.applied} ใบ — ย้ายไปกอง “ส่งผลิตแล้ว รอปริ้น”
            </p>
          )}
          {res.matched.length > 0 && (
            <div>
              <b>จับคู่ได้ {res.matched.length} ใบ</b>
              <ul className="mt-1 space-y-0.5">
                {res.matched.map((m) => (
                  <li key={m.orderId} className="flex flex-wrap gap-x-2">
                    <span className="dkb-num font-bold">{m.orderId}</span>
                    <span>{m.customer}</span>
                    <span style={{ color: "var(--dk-faint)" }}>
                      ← {m.folder} {m.how === "file" ? "(จากไฟล์ OD ในโฟลเดอร์)" : m.how === "name" ? "(จับด้วยชื่อลูกค้า)" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {res.ambiguous.length > 0 && (
            <div>
              <b style={{ color: "var(--dk-yolk-ink)" }}>ชื่อซ้ำ/ไม่ชัด {res.ambiguous.length} โฟลเดอร์ — เลือกใบที่ใช่เอง</b>
              <ul className="mt-1 space-y-1">
                {res.ambiguous.map((a) => (
                  <li key={a.folder} className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 truncate" title={a.folder}>
                      📁 {a.folder}
                    </span>
                    <select
                      className="rounded-lg border px-2 py-1 text-[12.5px]"
                      style={{ borderColor: "var(--dk-hair)" }}
                      value={pick[a.folder] ?? ""}
                      onChange={(e) => setPick((p) => ({ ...p, [a.folder]: e.target.value }))}
                    >
                      <option value="">— ข้าม —</option>
                      {a.candidates.map((c) => (
                        <option key={c.orderId} value={c.orderId}>
                          {c.orderId} · {c.customer} · {c.status}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {res.unmatchedIds.length > 0 && (
            <div>
              <b style={{ color: "var(--dk-coral-deep)" }}>โฟลเดอร์ (ids) ที่หาออเดอร์ไม่เจอ {res.unmatchedIds.length}</b>
              <span style={{ color: "var(--dk-faint)" }}> — เปิดใบนั้นแล้วกด “🏭 ติ๊กว่าส่งเข้าผลิตแล้ว” เอง</span>
              <ul className="mt-1 space-y-0.5">
                {res.unmatchedIds.map((n) => (
                  <li key={n}>📁 {n}</li>
                ))}
              </ul>
            </div>
          )}
          {res.alreadySent.length > 0 && (
            <p style={{ color: "var(--dk-faint)" }}>ติ๊กไว้แล้วก่อนหน้า {res.alreadySent.length} ใบ (ไม่ทับ)</p>
          )}
          {res.skipped > 0 && (
            <details>
              <summary className="cursor-pointer" style={{ color: "var(--dk-faint)" }}>
                ไม่ตรงกับใบไหนที่รอผลิต {res.skipped} โฟลเดอร์ (งานหน้าร้าน/ชื่อไม่ตรง) — ข้าม · กดดูชื่อ
              </summary>
              <ul className="mt-1 space-y-0.5 pl-4" style={{ color: "var(--dk-faint)" }}>
                {(res.skippedNames ?? []).map((n) => (
                  <li key={n}>📁 {n}</li>
                ))}
              </ul>
            </details>
          )}
          {typeof res.scanned === "number" && (
            <p className="text-[12px]" style={{ color: "var(--dk-faint)" }}>
              อ่านเจอโฟลเดอร์งาน {res.scanned} โฟลเดอร์ จากที่โยนมา {paths.length} รายการ
              {res.scanned === 0 ? " — ถ้าโยนโฟลเดอร์ของวันแล้วได้ 0 ลองกด “เลือกโฟลเดอร์” แทน หรือโยนโฟลเดอร์งานทีละใบ" : ""}
            </p>
          )}
          {toApply > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Btn tone="navy" onClick={apply} disabled={busy !== null}>
                {busy === "apply" ? "กำลังบันทึก…" : `🏭 ยืนยันส่งเข้าผลิต ${toApply} ใบ`}
              </Btn>
              <Btn small onClick={() => setRes(null)} disabled={busy !== null}>
                ยกเลิก
              </Btn>
            </div>
          )}
          {toApply === 0 && res.applied === 0 && res.ambiguous.length === 0 && (
            <p style={{ color: "var(--dk-faint)" }}>ไม่มีใบใหม่ให้ติ๊กจากโฟลเดอร์ชุดนี้</p>
          )}
        </div>
      )}
    </div>
  );
}
