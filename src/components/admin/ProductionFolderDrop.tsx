"use client";

/**
 * 📂 โยนโฟลเดอร์งานที่เข้าผลิต → จับคู่ออเดอร์ → ติ๊ก "ส่งเข้าผลิตแล้ว"
 *
 * ฝ่ายผลิตวางไฟล์งานไว้ที่ /Volumes/iDuckyShop/1.Order Today/<คน วันที่>/<หมวด>/<ชื่องาน>
 * โยนโฟลเดอร์ของวัน (หรือโฟลเดอร์งานทีละใบ) ลงตรงนี้ — อ่านแค่ "ชื่อโฟลเดอร์" ไม่อัปโหลดไฟล์
 * เซิร์ฟเวอร์ (/api/admin/orders/production-folders) จับคู่ชื่อกับออเดอร์ (ดู src/lib/production-match.ts)
 * ขั้นตอน: โยน → ดูผลจับคู่ก่อน (ยังไม่แตะ DB) → ติ๊กออกใบที่ยังไม่ส่งผลิต (แค่ทำตัวอย่างให้ลูกค้าดู) → เลือกใบที่คลุมเครือเอง → กดยืนยัน
 *
 * ลากวางใช้ webkitGetAsEntry เดินโฟลเดอร์ (Chrome/Edge/Safari) · ปุ่มเลือกใช้ input webkitdirectory (โฟลเดอร์ว่างจะไม่ขึ้น เพราะเบราว์เซอร์ให้แต่ไฟล์)
 */

import { useCallback, useRef, useState, type DragEvent } from "react";
import { Btn } from "@/components/admin/ui";
import { useCan } from "@/lib/perm-context";
import { isSampleFolderName } from "@/lib/admin-data";
import { SAMPLE_FILE_RE, type FolderAmbiguous, type FolderMatch } from "@/lib/production-match";

interface MatchResp {
  ok?: boolean;
  error?: string;
  matched: FolderMatch[];
  ambiguous: FolderAmbiguous[];
  unmatchedIds: string[];
  skipped: number;
  skippedNames?: string[];
  scanned?: number;
  /** จับคู่ได้แต่ติ๊กส่งผลิตไปแล้ว — บอกด้วยว่าใบอยู่กองไหนในคิวปริ้น */
  alreadySent: (FolderMatch & { status?: string; printed?: boolean; folderWas?: string })[];
  applied: number;
  /** 🎁 ใบที่ตั้งแผนรอบตัวอย่างจากชื่อไฟล์ให้แล้ว */
  sampleApplied?: number;
  /** ⛔ ใบที่ขอส่งเข้าผลิตแต่ถูกกันไว้เพราะแบบงานยังไม่ครบ (ไม่มีสิทธิ์ปลดล็อก) */
  heldBack?: { orderId: string; customer: string; waiting: string[]; contact?: boolean }[];
}

const MAX_DEPTH = 4;
/** ไฟล์ในโฟลเดอร์งานที่ชื่อมีเลขออเดอร์ ("OD-260909-1588.html" ที่ระบบสร้างให้กราฟฟิก) — ส่งพาธไปด้วย เซิร์ฟเวอร์ใช้เลขนี้จับคู่แบบชัวร์ ไม่ต้องเดาจากชื่อโฟลเดอร์ */
const OD_FILE_RE = /OD-\d{6}-\d{3,}/i;

/**
 * เดินโฟลเดอร์ที่ลากมา → พาธของทุกโฟลเดอร์ย่อย + ไฟล์ที่ชื่อมีเลข OD (อ่านแค่ชื่อ ไม่อ่านเนื้อไฟล์)
 * 🎁 โฟลเดอร์ "(…ตย)" เก็บชื่อไฟล์ jpg/png ลง sampleFiles ด้วย — เซิร์ฟเวอร์อ่านจำนวนตัวอย่างต่อลายจากชื่อไฟล์ ("…_2 ชิ้น-1.jpg")
 */
async function walkEntry(entry: FileSystemEntry, prefix: string, depth: number, out: string[], sampleFiles: string[]): Promise<void> {
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
  const sampleDir = isSampleFolderName(entry.name);
  for (const k of kids) {
    if (k.name.startsWith(".")) continue;
    if (k.isDirectory) await walkEntry(k, path, depth + 1, out, sampleFiles);
    else if (OD_FILE_RE.test(k.name)) out.push(`${path}/${k.name}`);
    else if (sampleDir && SAMPLE_FILE_RE.test(k.name)) sampleFiles.push(`${path}/${k.name}`);
  }
}

export default function ProductionFolderDrop({ onApplied }: { onApplied: () => void }) {
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState<"scan" | "apply" | null>(null);
  const [paths, setPaths] = useState<string[]>([]);
  /** ชื่อไฟล์ jpg ในโฟลเดอร์ (…ตย) — ส่งไปให้เซิร์ฟเวอร์อ่านจำนวนตัวอย่าง */
  const [sampleFiles, setSampleFiles] = useState<string[]>([]);
  /** 🎁 ใบที่จะตั้งแผนรอบตัวอย่างจากชื่อไฟล์: orderId → true = คนติ๊กออก · false = คนติ๊กเข้า · ไม่มีคีย์ = ค่าเริ่มต้นตาม sample.needsRound (ดู planOn) */
  const [samplePlanOff, setSamplePlanOff] = useState<Record<string, boolean>>({});
  const [res, setRes] = useState<MatchResp | null>(null);
  const [err, setErr] = useState("");
  /** ใบที่คนเลือกให้โฟลเดอร์คลุมเครือ: folder → orderId ("" = ข้าม) */
  const [pick, setPick] = useState<Record<string, string>>({});
  /** ใบที่จับคู่ได้แต่คนติ๊กออก (แค่ทำตัวอย่างให้ลูกค้าดู ยังไม่ส่งผลิต): orderId → true */
  const [skip, setSkip] = useState<Record<string, boolean>>({});
  /** ใบที่เจอหลายโฟลเดอร์ (ขึ้นตัวอย่าง + งานจริง) คนเลือกว่าอันไหนคืองานจริง: orderId → ชื่อโฟลเดอร์ */
  const [folderFor, setFolderFor] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  /** ⛔ ใบที่แบบงานยังไม่ครบ ติ๊กกลับเข้าได้เฉพาะคนมีสิทธิ์แก้ออเดอร์ (เซิร์ฟเวอร์ตรวจซ้ำ) */
  const canForceHold = useCan()("orders.edit");

  const scan = useCallback(async (list: string[], files: string[] = []) => {
    const uniq = [...new Set(list)].filter(Boolean);
    const uniqFiles = [...new Set(files)].filter(Boolean);
    setPaths(uniq);
    setSampleFiles(uniqFiles);
    setRes(null);
    setPick({});
    setSkip({});
    setFolderFor({});
    setSamplePlanOff({});
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
        body: JSON.stringify({ paths: uniq, sampleFiles: uniqFiles }),
      });
      const j = (await r.json().catch(() => ({}))) as MatchResp;
      if (!r.ok) setErr(j.error || `จับคู่ไม่สำเร็จ (${r.status})`);
      else {
        setRes(j);
        // ⛔ ใบที่แบบงานยังไม่ครบ = ติ๊กออกให้ก่อน (แอ๋มโยนทั้งโฟลเดอร์โดยไม่รู้ว่าลูกค้าสั่งเพิ่ม — OD-260916-4693)
        setSkip(Object.fromEntries((j.matched ?? []).filter((m) => m.proofHold?.length || m.contactHold?.length).map((m) => [m.orderId, true])));
      }
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
      const files: string[] = [];
      for (const it of items) {
        const entry = typeof it.webkitGetAsEntry === "function" ? it.webkitGetAsEntry() : null;
        if (entry) await walkEntry(entry, "", 1, out, files);
      }
      await scan(out, files);
    },
    [scan]
  );

  const onPickFiles = useCallback(
    async (files: FileList | null) => {
      const out = new Set<string>();
      const sample: string[] = [];
      Array.from(files ?? []).forEach((f) => {
        const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || "";
        const parts = rel.split("/").filter(Boolean);
        const fileName = parts.pop() ?? ""; // ตัดชื่อไฟล์ เหลือโฟลเดอร์
        for (let i = 1; i <= Math.min(parts.length, MAX_DEPTH); i++) out.add(parts.slice(0, i).join("/"));
        if (OD_FILE_RE.test(fileName) && parts.length) out.add([...parts, fileName].join("/"));
        else if (parts.length && isSampleFolderName(parts[parts.length - 1]) && SAMPLE_FILE_RE.test(fileName)) sample.push([...parts, fileName].join("/"));
      });
      await scan([...out], sample);
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
      const skipIds = Object.entries(skip)
        .filter(([, off]) => off)
        .map(([orderId]) => orderId);
      const samplePlan = [...(res.matched ?? []), ...(res.alreadySent ?? [])]
        .filter((m) => m.sample && (samplePlanOff[m.orderId] === undefined ? m.sample.needsRound : !samplePlanOff[m.orderId]))
        .map((m) => m.orderId);
      const r = await fetch("/api/admin/orders/production-folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paths,
          apply: true,
          pick: picks,
          skip: skipIds,
          folderFor,
          sampleFiles,
          samplePlan,
          allowHold: (res.matched ?? []).filter((m) => m.proofHold?.length && !skip[m.orderId]).map((m) => m.orderId),
        }),
      });
      const j = (await r.json().catch(() => ({}))) as MatchResp;
      if (!r.ok) {
        setErr(j.error || `บันทึกไม่สำเร็จ (${r.status})`);
        return;
      }
      setRes({ ...j, matched: [], ambiguous: [], unmatchedIds: j.unmatchedIds ?? [], alreadySent: [] });
      setSkip({});
      onApplied();
    } catch {
      setErr("ติดต่อเซิร์ฟเวอร์ไม่ได้ — ลองใหม่อีกครั้ง");
    } finally {
      setBusy(null);
    }
  }, [res, pick, skip, folderFor, paths, sampleFiles, samplePlanOff, onApplied]);

  const pickedCount = Object.values(pick).filter(Boolean).length;
  const matchedList = res?.matched ?? [];
  /** ใบที่ยังติ๊กอยู่ = ใบที่จะถูกส่งเข้าผลิตจริง */
  const chosen = matchedList.filter((m) => !skip[m.orderId]);
  const freeList = matchedList.filter((m) => !m.proofHold?.length);
  const allOn = freeList.length > 0 && freeList.every((m) => !skip[m.orderId]);
  /**
   * 🎁 ใบนี้จะตั้งแผนรอบตัวอย่างไหม — ยังไม่ได้แตะ = ติ๊กไว้ก่อนเฉพาะใบที่ "ต้องแยกกล่อง" จริง (ยังมียอดค้าง · sample.needsRound)
   * ใบที่เก็บเงินครบแล้วตัวอย่างไปกล่องเดียวกับล็อตหลักได้ ตั้งแผนให้เอง = ฝ่ายแพ็คโดนบังคับให้ยิงเป็น "ส่งบางส่วน" (OD-260914-5746)
   */
  const planOn = (m: FolderMatch) => !!m.sample && (samplePlanOff[m.orderId] === undefined ? m.sample.needsRound : !samplePlanOff[m.orderId]);
  /** 🎁 ใบที่จะตั้งแผนรอบตัวอย่าง (ใบใหม่ + ใบที่ติ๊กส่งผลิตไปแล้ว) */
  const sampleCount = [...matchedList, ...(res?.alreadySent ?? [])].filter(planOn).length;
  const toApply = chosen.length + pickedCount + sampleCount;

  /** กล่อง 🎁 ใต้แถวใบ — เสนอแผนรอบตัวอย่างที่อ่านจากชื่อไฟล์ ให้คนติ๊กออกได้ */
  const SampleBox = ({ m }: { m: FolderMatch }) => {
    if (!m.sample) return null;
    const on = planOn(m);
    return (
      <div className="ml-7 mb-1.5 rounded-lg px-2 py-1.5" style={{ background: "#f5f3ff", border: "1px solid #ddd6fe" }}>
        <label className="flex min-h-[32px] cursor-pointer items-start gap-2 text-[12.5px]">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 shrink-0 accent-violet-700"
            checked={on}
            onChange={(e) => setSamplePlanOff((v) => ({ ...v, [m.orderId]: !e.target.checked }))}
          />
          <span className="min-w-0">
            <b style={{ color: "#6d28d9" }}>
              🎁 ตั้งแผนส่งตัวอย่างก่อน {m.sample.qty} ชิ้น / {m.sample.designs} ลาย — จำนวนตามชื่อไฟล์ jpg ในโฟลเดอร์ “{m.sample.folder}”
            </b>
            <span className="block" style={{ color: "var(--dk-faint)" }}>
              {m.sample.lines.join(" · ")}
            </span>
            <span className="block" style={{ color: "var(--dk-faint)" }}>
              {m.sample.needsRound
                ? "ติ๊ก 🎁 มีชิ้นงานตัวอย่างให้ด้วย → ใบมัดจำพิมพ์ใบปะหน้า/ยิงรอบตัวอย่างได้โดยยังไม่ครบ 100%"
                : "ใบนี้เก็บเงินครบแล้ว — ตัวอย่างใส่กล่องเดียวกับล็อตหลักได้ ไม่ต้องแบ่งส่ง · ติ๊กเองเฉพาะกรณีลูกค้าขอรับตัวอย่างไปดูก่อนจริง ๆ"}
              {m.sample.replacesPlan ? " · ⚠️ จะแทนแผนรอบที่ยังไม่ส่งเดิมของใบนี้" : ""}
            </span>
            {m.sample.unmatchedFiles.length > 0 && (
              <span className="block font-bold" style={{ color: "var(--dk-coral-deep)" }}>
                อ่านจำนวนไม่ได้/หาลายไม่เจอ {m.sample.unmatchedFiles.length} ไฟล์: {m.sample.unmatchedFiles.join(", ")}
              </span>
            )}
          </span>
        </label>
      </div>
    );
  };

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
            โยนโฟลเดอร์ของวัน (เช่น “Donut 10-09-69”) หรือโฟลเดอร์งานทีละใบจาก 1.Order Today — อ่านแค่ชื่อโฟลเดอร์ ไม่อัปโหลดไฟล์ · ระบบจับคู่ชื่อกับออเดอร์แล้วให้ติ๊กออกใบที่ยังไม่ส่งผลิตก่อนยืนยัน
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
          {(res.heldBack?.length ?? 0) > 0 && (
            <p className="font-bold" style={{ color: "var(--dk-coral-deep)" }}>
              ⛔ ไม่ได้ส่งเข้าผลิต {res.heldBack!.length} ใบ —{" "}
              {res.heldBack!.some((h) => h.contact) ? "เบอร์โทร/ที่อยู่ไม่ครบ (พิมพ์เอกสารไม่ได้) / แบบงานยังไม่ครบ" : "แบบงานยังไม่ครบ"}:{" "}
              {res.heldBack!.map((h) => `${h.orderId} (${h.waiting.join(" · ")})`).join(" , ")}
            </p>
          )}
          {(res.sampleApplied ?? 0) > 0 && (
            <p className="font-bold" style={{ color: "#6d28d9" }}>
              🎁 ตั้งแผนส่งตัวอย่างจากชื่อไฟล์ให้แล้ว {res.sampleApplied} ใบ — ดูรอบที่ตั้งได้ในหน้าออเดอร์ (📋 แผนแบ่งส่ง)
            </p>
          )}
          {matchedList.length > 0 && (
            <div>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <b>
                  จับคู่ได้ {matchedList.length} ใบ
                  {chosen.length < matchedList.length ? ` — ติ๊กออก ${matchedList.length - chosen.length} ใบ` : ""}
                </b>
                <span className="text-[12px]" style={{ color: "var(--dk-faint)" }}>
                  ติ๊กออกได้ ถ้าโฟลเดอร์ไหนแค่ทำตัวอย่างให้ลูกค้าดู ยังไม่ส่งผลิต
                </span>
                <button
                  type="button"
                  className="ml-auto min-h-[32px] px-1 text-[12.5px] font-bold underline"
                  style={{ color: "var(--dk-navy)" }}
                  onClick={() =>
                    setSkip(
                      Object.fromEntries(matchedList.filter((m) => allOn || m.proofHold?.length).map((m) => [m.orderId, true]))
                    )
                  }
                >
                  {allOn ? "ติ๊กออกทั้งหมด" : "เลือกทั้งหมด"}
                </button>
              </div>
              <ul className="mt-1">
                {matchedList.map((m) => {
                  const on = !skip[m.orderId];
                  return (
                    <li key={m.orderId}>
                      <label
                        className="flex min-h-[44px] cursor-pointer flex-wrap items-center gap-x-2 rounded-lg px-1.5 py-1.5"
                        style={{ background: on ? "transparent" : "var(--dk-hair)", opacity: on ? 1 : 0.65 }}
                      >
                        <input
                          type="checkbox"
                          className="h-5 w-5 shrink-0 accent-slate-700"
                          checked={on}
                          disabled={!!m.contactHold?.length || (!!m.proofHold?.length && !canForceHold)}
                          onChange={(e) => setSkip((v) => ({ ...v, [m.orderId]: !e.target.checked }))}
                        />
                        <span className="dkb-num font-bold" style={{ textDecoration: on ? "none" : "line-through" }}>
                          {m.orderId}
                        </span>
                        <span>{m.customer}</span>
                        <span style={{ color: "var(--dk-faint)" }}>
                          ← {m.folder} {m.how === "file" ? "(จากไฟล์ OD ในโฟลเดอร์)" : m.how === "name" ? "(จับด้วยชื่อลูกค้า)" : ""}
                        </span>
                        {!on && <b style={{ color: "var(--dk-faint)" }}>— ไม่ส่งผลิตรอบนี้</b>}
                      </label>
                      {/* 📞📍 เบอร์/ที่อยู่ไม่ครบ — ใบนี้พิมพ์เอกสารไม่ได้เลย จึงไม่ให้เข้าไลน์ผลิต ติ๊กกลับเข้าไม่ได้ */}
                      {(m.contactHold?.length ?? 0) > 0 && (
                        <div className="ml-7 mb-1.5 rounded-lg px-2 py-1.5" style={{ background: "var(--dk-coral-wash)", border: "1px solid var(--dk-coral)" }}>
                          <p className="text-[12.5px] font-bold" style={{ color: "var(--dk-coral-ink)" }}>
                            🔒 เบอร์โทร/ที่อยู่ไม่ครบ — ใบนี้พิมพ์เอกสารไม่ได้ จึงยังไม่ส่งเข้าผลิต
                          </p>
                          <ul className="text-[12.5px]" style={{ color: "var(--dk-coral-ink)" }}>
                            {m.contactHold!.map((w) => (
                              <li key={w}>• {w}</li>
                            ))}
                          </ul>
                          <p className="mt-0.5 text-[12px]" style={{ color: "var(--dk-faint)" }}>
                            แก้ในหน้าออเดอร์{" "}
                            <a href={`/admin/orders/${encodeURIComponent(m.orderId)}`} target="_blank" rel="noreferrer" className="underline">
                              {m.orderId}
                            </a>{" "}
                            (กล่อง 👤 ลูกค้า / จัดส่ง) แล้วโยนโฟลเดอร์ใหม่อีกรอบ
                          </p>
                        </div>
                      )}
                      {/* ⛔ แบบงานยังไม่ครบ — ติ๊กออกให้ก่อน บอกว่าค้างรายการไหน (ลูกค้าสั่งเพิ่มทีหลัง/รอลูกค้าตรวจ) */}
                      {(m.proofHold?.length ?? 0) > 0 && (
                        <div className="ml-7 mb-1.5 rounded-lg px-2 py-1.5" style={{ background: "var(--dk-coral-wash)", border: "1px solid var(--dk-coral)" }}>
                          <p className="text-[12.5px] font-bold" style={{ color: "var(--dk-coral-ink)" }}>
                            ⛔ แบบงานยังไม่ครบ — ยังไม่ส่งเข้าผลิต/เข้าคิวปริ้น
                          </p>
                          <ul className="text-[12.5px]" style={{ color: "var(--dk-coral-ink)" }}>
                            {m.proofHold!.map((w) => (
                              <li key={w}>• {w}</li>
                            ))}
                          </ul>
                          <p className="mt-0.5 text-[12px]" style={{ color: "var(--dk-faint)" }}>
                            {on
                              ? "ติ๊กส่งเข้าผลิตทั้งที่แบบไม่ครบ — ใบงานจะปริ้นได้เฉพาะแบบ “ปริ้นเฉพาะที่พร้อม” และลงประวัติไว้"
                              : canForceHold
                                ? "รอแบบครบแล้วโยนโฟลเดอร์ใหม่ · งานเร่งที่ต้องเดินรายการที่พร้อมก่อน ติ๊กกลับเข้าได้ · รายการที่ไม่ต้องทำแบบให้ติ๊ก “ไม่ต้องทำแบบ” ในหน้าออเดอร์"
                                : "รอแบบครบแล้วโยนโฟลเดอร์ใหม่ · งานเร่งให้แอดมิน (สิทธิ์แก้ออเดอร์) เป็นคนติ๊ก · รายการที่ไม่ต้องทำแบบให้ติ๊ก “ไม่ต้องทำแบบ” ในหน้าออเดอร์"}
                          </p>
                        </div>
                      )}
                      {/* ใบเดียวเจอหลายโฟลเดอร์ (ขึ้นตัวอย่าง + งานจริง) — เดิมอันที่ 2 หายเงียบ คนโยนไม่รู้ว่างานจริงเข้ามาด้วยหรือยัง */}
                      {(m.alsoFolders?.length ?? 0) > 0 && (
                        <div className="ml-7 mb-1.5 rounded-lg px-2 py-1.5" style={{ background: "var(--dk-yolk-wash)" }}>
                          <p className="text-[12px] font-bold" style={{ color: "var(--dk-yolk-ink)" }}>
                            ใบนี้เจอ {1 + (m.alsoFolders?.length ?? 0)} โฟลเดอร์ — เลือกอันที่เป็นงานจริงที่จะส่งผลิต
                          </p>
                          {[m.folder, ...(m.alsoFolders ?? [])].map((f) => (
                            <label key={f} className="flex min-h-[32px] cursor-pointer items-center gap-2 text-[12.5px]">
                              <input
                                type="radio"
                                name={`folder-${m.orderId}`}
                                className="h-4 w-4 shrink-0"
                                checked={(folderFor[m.orderId] ?? m.folder) === f}
                                onChange={() => setFolderFor((v) => ({ ...v, [m.orderId]: f }))}
                                disabled={!on}
                              />
                              <span className="min-w-0 truncate" title={f}>
                                📁 {f}
                              </span>
                            </label>
                          ))}
                        </div>
                      )}
                      <SampleBox m={m} />
                    </li>
                  );
                })}
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
            <div>
              <b>ใบนี้เข้าคิวไปแล้ว {res.alreadySent.length} ใบ</b>
              <span style={{ color: "var(--dk-faint)" }}> — โยนซ้ำไม่ต้องทำอะไร ใบยังอยู่ในคิวปริ้น (ไม่ทับของเดิม)</span>
              <ul className="mt-1 space-y-0.5">
                {res.alreadySent.map((m) => (
                  <li key={`${m.folder}-${m.orderId}`} title={m.folderWas ? `โฟลเดอร์ที่ติ๊กไว้ครั้งแรก: ${m.folderWas}` : undefined}>
                    {m.printed ? "🖨" : "🏭"} {m.orderId} · {m.customer} —{" "}
                    <b style={{ color: m.printed ? "var(--dk-faint)" : "var(--dk-navy)" }}>
                      {m.printed ? "ปริ้นใบงานแล้ว — อยู่แท็บ “ปริ้นแล้ว”" : "รอปริ้น — อยู่แท็บ “🏭 ส่งผลิตแล้ว รอปริ้น”"}
                    </b>
                    <SampleBox m={m} />
                  </li>
                ))}
              </ul>
            </div>
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
          {(toApply > 0 || matchedList.length > 0) && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Btn tone="navy" onClick={apply} disabled={busy !== null || toApply === 0}>
                {busy === "apply"
                  ? "กำลังบันทึก…"
                  : chosen.length + pickedCount > 0
                    ? `🏭 ยืนยันส่งเข้าผลิต ${chosen.length + pickedCount} ใบ${sampleCount ? ` + 🎁 แผนตัวอย่าง ${sampleCount} ใบ` : ""}`
                    : `🎁 ยืนยันตั้งแผนตัวอย่าง ${sampleCount} ใบ`}
              </Btn>
              <Btn small onClick={() => setRes(null)} disabled={busy !== null}>
                ยกเลิก
              </Btn>
              {toApply === 0 && (
                <span className="font-bold" style={{ color: "var(--dk-faint)" }}>
                  ติ๊กออกครบทุกใบแล้ว — ติ๊กกลับอย่างน้อย 1 ใบ ถึงจะยืนยันได้
                </span>
              )}
              {/* ใบที่ติ๊กส่งผลิตไปแล้ว: ปกติไม่มีปุ่ม แต่ถ้ามีแผนตัวอย่างให้ตั้ง ต้องกดได้ */}
            </div>
          )}
          {toApply === 0 && matchedList.length === 0 && res.applied === 0 && (res.sampleApplied ?? 0) === 0 && res.ambiguous.length === 0 && (
            <p style={{ color: "var(--dk-faint)" }}>ไม่มีใบใหม่ให้ติ๊กจากโฟลเดอร์ชุดนี้</p>
          )}
        </div>
      )}
    </div>
  );
}
