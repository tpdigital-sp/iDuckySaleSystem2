"use client";

import RequirePerm from "@/components/RequirePerm";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Btn, CopyChip, Empty, PageHead, PageShell, Tag } from "@/components/admin/ui";
import { fmtCm, fmtMm, fromFile, groupBoards, kindOf, readDesignInfo, sizeText, type DesignInfo } from "@/lib/design-file-size";
import { zipStore } from "@/lib/zip-store";
import UnitConverter from "@/components/admin/UnitConverter";

/**
 * 📏 เช็คขนาดไฟล์งาน — ลาก .ai / .psd / .pdf / .eps (หรือทั้งโฟลเดอร์) มาวางทีเดียว เห็นขนาดทุกไฟล์ในตาราง
 *
 * ทำไมต้องมี: กราฟฟิก/แอดมินต้องเปิด Illustrator ทีละไฟล์แค่เพื่อดูว่างานกี่ซม. (เจ้าของร้าน 16 ก.ย. 69)
 * ทุกอย่างอ่านในเบราว์เซอร์ของคนใช้ ไฟล์ไม่ถูกอัปโหลดไปไหน — ไฟล์ 200MB ก็วางได้ (.psd อ่านแค่หัวไฟล์)
 * ตัวอ่านอยู่ที่ src/lib/design-file-size.ts (เทส: scripts/design-file-size-test.mts)
 */

type Item = {
  id: number;
  name: string;
  bytes: number;
  /** พาธย่อยเมื่อลากโฟลเดอร์มา (ไว้ให้รู้ว่าไฟล์อยู่ในโฟลเดอร์ไหน) */
  dir?: string;
  state: "wait" | "busy" | "done";
  info?: DesignInfo;
  previewUrl?: string;
  /** ภาพแต่ละอาร์ตบอร์ด (object URL) เรียงตาม info.boards — .ai/.pdf ทุกหน้า · รูป = ตัวไฟล์เอง */
  boardUrls?: (string | undefined)[];
  ms?: number;
};

const stem = (name: string) => name.replace(/\.[^.]+$/, "") || "artwork";
const pad2 = (n: number) => String(n).padStart(2, "0");
/** ชื่อไฟล์ภาพที่ดาวน์โหลด: ชื่อเดิม-บอร์ด01-66x91mm.png */
function boardFileName(item: Item, i: number): string {
  const b = item.info?.boards[i];
  const size = b ? `-${fmtMm(b.widthMm)}x${fmtMm(b.heightMm)}mm` : "";
  const many = (item.info?.boards.length ?? 0) > 1;
  const kind = item.info?.kind;
  const ext = kind === "jpg" ? "jpg" : kind === "webp" ? "webp" : kind === "psd" || kind === "psb" ? "jpg" : "png";
  return `${stem(item.name)}${many ? `-บอร์ด${pad2(i + 1)}` : ""}${size}.${ext}`;
}
function triggerDownload(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

const KIND_LABEL: Record<string, string> = { ai: "AI", pdf: "PDF", psd: "PSD", psb: "PSB", eps: "EPS", png: "PNG", jpg: "JPG", webp: "WEBP", other: "?" };

const fmtBytes = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** เดินโฟลเดอร์ที่ลากมาวาง (webkitGetAsEntry) — เก็บเฉพาะไฟล์ที่รองรับ · ข้ามไฟล์ซ่อน (.DS_Store ฯลฯ) */
async function collectDropped(dt: DataTransfer): Promise<{ file: File; dir?: string }[]> {
  const out: { file: File; dir?: string }[] = [];
  const items = Array.from(dt.items ?? []);
  const entries = items.map((it) => (typeof it.webkitGetAsEntry === "function" ? it.webkitGetAsEntry() : null));
  if (!entries.some(Boolean)) {
    for (const f of Array.from(dt.files ?? [])) out.push({ file: f });
    return out;
  }
  const walk = async (entry: FileSystemEntry, dir: string) => {
    if (entry.isFile) {
      const f = await new Promise<File | null>((res) => (entry as FileSystemFileEntry).file(res, () => res(null)));
      if (f && !f.name.startsWith(".")) out.push({ file: f, dir: dir || undefined });
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      // readEntries คืนทีละชุด (Chrome ชุดละ 100) ต้องวนจนกว่าจะว่าง
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((res) => reader.readEntries(res, () => res([])));
        if (!batch.length) break;
        for (const e of batch) await walk(e, dir ? `${dir}/${entry.name}` : entry.name);
      }
    }
  };
  for (const e of entries) if (e) await walk(e, "");
  return out;
}

function FileSizeInner() {
  const [items, setItems] = useState<Item[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [unit, setUnit] = useState<"cm" | "mm">("cm");
  const nextId = useRef(1);
  const queue = useRef<{ id: number; file: File }[]>([]);
  const running = useRef(false);
  const urls = useRef<string[]>([]);

  // ล้าง object URL ตอนออกจากหน้า
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const pump = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    while (queue.current.length) {
      const { id, file } = queue.current.shift()!;
      setItems((xs) => xs.map((x) => (x.id === id ? { ...x, state: "busy" } : x)));
      const t0 = performance.now();
      const info = await readDesignInfo(file.name, fromFile(file));
      let previewUrl: string | undefined;
      if (info.preview) {
        previewUrl = URL.createObjectURL(info.preview);
        urls.current.push(previewUrl);
      }
      // ภาพต่ออาร์ตบอร์ด: .ai/.pdf มี board.image · รูป/psd ใช้ preview (ตัวไฟล์เอง/รูปย่อ) เป็นภาพเดียว
      const boardUrls = info.boards.map((b, i) => {
        if (b.image) {
          const u = i === 0 && info.preview === b.image && previewUrl ? previewUrl : URL.createObjectURL(b.image);
          if (u !== previewUrl) urls.current.push(u);
          return u;
        }
        return i === 0 ? previewUrl : undefined;
      });
      const ms = Math.round(performance.now() - t0);
      setItems((xs) => xs.map((x) => (x.id === id ? { ...x, state: "done", info, previewUrl, boardUrls, ms } : x)));
    }
    running.current = false;
  }, []);

  const addFiles = useCallback(
    (list: { file: File; dir?: string }[]) => {
      // ทุกไฟล์เข้าคิวหมด — ตัวอ่านสืบชนิดจากหัวไฟล์เองเมื่อไม่มีนามสกุล (ไฟล์จาก Google Drive มักหลุดนามสกุล)
      const fresh: Item[] = [];
      for (const { file, dir } of list) {
        if (file.name.startsWith(".")) continue;
        const id = nextId.current++;
        fresh.push({ id, name: file.name, bytes: file.size, dir, state: "wait" });
        queue.current.push({ id, file });
      }
      if (!fresh.length) return;
      setItems((xs) => [...xs, ...fresh]);
      void pump();
    },
    [pump]
  );

  const [zipping, setZipping] = useState<number | null>(null);
  /** รวมภาพทุกอาร์ตบอร์ดของไฟล์นี้เป็น .zip เดียว (store · ไม่บีบซ้ำ) */
  const downloadAll = async (x: Item) => {
    if (!x.info || zipping !== null) return;
    setZipping(x.id);
    try {
      const files = x.info.boards
        .map((b, i) => ({ name: boardFileName(x, i), blob: b.image ?? (i === 0 ? x.info!.preview : undefined) }))
        .filter((f): f is { name: string; blob: Blob } => !!f.blob);
      if (!files.length) return;
      const zip = await zipStore(files);
      const url = URL.createObjectURL(zip);
      triggerDownload(url, `${stem(x.name)}-อาร์ตบอร์ด.zip`);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } finally {
      setZipping(null);
    }
  };

  const clearAll = () => {
    queue.current = [];
    urls.current.forEach((u) => URL.revokeObjectURL(u));
    urls.current = [];
    setItems([]);
  };

  const done = items.filter((x) => x.state === "done");
  const okN = done.filter((x) => x.info?.ok).length;
  const badN = done.length - okN;
  const pending = items.length - done.length;

  // อ่านไม่ได้ขึ้นก่อน (ต้องตามลูกค้า) · ที่เหลือตามลำดับที่วาง
  const sorted = useMemo(() => {
    const bad = items.filter((x) => x.state === "done" && !x.info?.ok);
    const rest = items.filter((x) => !(x.state === "done" && !x.info?.ok));
    return [...bad, ...rest];
  }, [items]);

  const allText = () =>
    items
      .filter((x) => x.state === "done")
      .map((x) => `${x.name} — ${x.info ? sizeText(x.info) : "-"}`)
      .join("\n");

  const dim = (mm: number) => (unit === "cm" ? fmtCm(mm) : fmtMm(mm));
  const unitLabel = unit === "cm" ? "ซม." : "มม.";

  return (
    <PageShell>
      <PageHead
        group="กราฟฟิก"
        title="เช็คขนาดไฟล์งาน"
        count={items.length ? `${items.length} ไฟล์` : undefined}
        sub="ลากไฟล์ .ai .psd .pdf .eps หรือทั้งโฟลเดอร์มาวาง เห็นขนาดชิ้นงานทุกไฟล์ทีเดียว ไม่ต้องเปิดโปรแกรม · อ่านในเครื่องนี้ ไม่อัปโหลด"
        tools={
          items.length ? (
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex overflow-hidden rounded-full ring-1 ring-slate-200">
                {(["cm", "mm"] as const).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setUnit(u)}
                    className={`min-h-[34px] px-3 text-[12px] font-bold ${unit === u ? "bg-slate-900 text-white" : "bg-white text-slate-600"}`}
                  >
                    {u === "cm" ? "ซม." : "มม."}
                  </button>
                ))}
              </div>
              <CopyChip label="คัดลอกทุกไฟล์" text={allText} />
              <Btn small onClick={clearAll}>
                ล้างรายการ
              </Btn>
            </div>
          ) : undefined
        }
      />

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void collectDropped(e.dataTransfer).then(addFiles);
        }}
        className={`mt-4 flex min-h-[112px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-5 text-center transition ${
          dragOver ? "border-[color:var(--dk-blue)] bg-white/80" : "border-[color:var(--dk-sky-300)] bg-white/50 hover:bg-white/80"
        }`}
      >
        <input
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const fs = Array.from(e.target.files ?? []).map((file) => ({ file }));
            e.target.value = "";
            addFiles(fs);
          }}
        />
        <span className="dkb-h2 text-[0.98rem]">วางไฟล์หรือโฟลเดอร์ตรงนี้ · หรือกดเลือกไฟล์</span>
        <span className="mt-1 text-[12.5px]" style={{ color: "var(--dk-faint)" }}>
          รองรับ .ai .pdf .psd .psb .eps และรูป PNG/JPG · ไฟล์ใหญ่ก็วางได้ (.psd อ่านแค่หัวไฟล์)
        </span>
      </label>

      {/* 📐 ลูกค้าบอกขนาดเป็นนิ้ว/หลา/เมตร → ตอบเป็นซม. ได้จากหน้าเดียวกัน */}
      <div className="mt-3">
        <UnitConverter />
      </div>

      {items.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 px-1 text-[13px]">
          {badN > 0 && <Tag tone="coral">อ่านไม่ได้ {badN} ไฟล์ — ต้องตามลูกค้า</Tag>}
          <Tag tone="mint">อ่านได้ {okN} ไฟล์</Tag>
          {pending > 0 && <Tag tone="quiet">กำลังอ่านอีก {pending} ไฟล์…</Tag>}
        </div>
      )}

      {items.length === 0 ? (
        <div className="mt-4">
          <Empty title="ยังไม่มีไฟล์" body="ลากไฟล์งานจากโฟลเดอร์ 1.Order Today หรือจากที่ลูกค้าส่งมาวางด้านบน — วางทีเดียวได้หลายไฟล์" />
        </div>
      ) : (
        <div className="dkb-rows mt-3">
          {sorted.map((x) => {
            const info = x.info;
            const bad = x.state === "done" && !info?.ok;
            const tone = x.state !== "done" ? "var(--dk-faint)" : bad ? "var(--dk-coral-deep)" : "var(--dk-mint-ink)";
            const groups = info?.ok ? groupBoards(info.boards) : [];
            return (
              <div key={x.id} className="dkb-g dkb-lrow" style={{ ["--dk-tone" as string]: tone } as React.CSSProperties}>
                <span className="dkb-main">
                  <span className="dkb-who flex items-start gap-3">
                    <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white ring-1 ring-slate-200">
                      {x.previewUrl ? (
                        // กดเปิดรูปเต็มในแท็บใหม่ — พอให้เช็คว่าไฟล์ไหนคือลายไหนโดยไม่ต้องเปิดโปรแกรม
                        <a href={x.previewUrl} target="_blank" rel="noreferrer" title="เปิดรูปตัวอย่างขนาดเต็ม" className="block h-full w-full">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={x.previewUrl} alt="" className="h-full w-full object-contain" />
                        </a>
                      ) : (
                        <span className="text-[11px] font-black text-slate-400">{x.state === "busy" ? "…" : KIND_LABEL[info?.kind ?? kindOf(x.name)]}</span>
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="nm block break-all">{x.name}</span>
                      <span className="dkb-meta block">
                        {x.dir ? `${x.dir} · ` : ""}
                        {KIND_LABEL[info?.kind ?? kindOf(x.name)]} · {fmtBytes(x.bytes)}
                        {info?.px ? ` · ${info.px.w} × ${info.px.h} px${info.dpi ? ` @ ${info.dpi} DPI` : ""}` : ""}
                        {info?.ok && info.boards.length > 1 ? ` · ${info.boards.length} อาร์ตบอร์ด` : ""}
                      </span>
                      {info?.note && (
                        <span className="mt-1 block text-[12.5px] font-semibold" style={{ color: bad ? "var(--dk-coral-ink)" : "var(--dk-yolk-ink)" }}>
                          {info.note}
                        </span>
                      )}
                    </span>
                  </span>
                  {/* แถบภาพทุกอาร์ตบอร์ด — เลื่อนซ้ายขวา · กดรูปเปิดเต็ม · ⬇ โหลดทีละภาพ */}
                  {info?.ok && x.boardUrls?.some(Boolean) && (
                    <span className="mt-2 block">
                      <span className="flex items-center gap-2">
                        <span className="text-[12px] font-bold" style={{ color: "var(--dk-faint)" }}>
                          {info.boards.length > 1 ? `ภาพ ${x.boardUrls.filter(Boolean).length}/${info.boards.length} อาร์ตบอร์ด` : "ภาพ"}
                        </span>
                        {x.boardUrls.filter(Boolean).length > 1 && (
                          <Btn small onClick={() => void downloadAll(x)} disabled={zipping !== null}>
                            {zipping === x.id ? "กำลังรวมไฟล์…" : "⬇ โหลดทั้งหมด (.zip)"}
                          </Btn>
                        )}
                      </span>
                      <span className="mt-1 flex gap-2 overflow-x-auto pb-1">
                        {info.boards.map((b, i) => {
                          const u = x.boardUrls?.[i];
                          if (!u) return null;
                          return (
                            <span key={i} className="flex w-[104px] shrink-0 flex-col items-center gap-1">
                              <a href={u} target="_blank" rel="noreferrer" title="เปิดรูปเต็ม" className="flex h-24 w-full items-center justify-center overflow-hidden rounded-lg bg-white ring-1 ring-slate-200">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={u} alt="" loading="lazy" className="max-h-full max-w-full object-contain" />
                              </a>
                              <span className="text-center text-[11px] leading-tight tabular-nums" style={{ color: "var(--dk-faint)" }}>
                                {info.boards.length > 1 ? `${i + 1} · ` : ""}
                                {dim((b.object ?? b).widthMm)} × {dim((b.object ?? b).heightMm)}
                              </span>
                              <button
                                type="button"
                                onClick={() => triggerDownload(u, boardFileName(x, i))}
                                className="min-h-[30px] w-full rounded-full bg-white text-[11px] font-bold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                              >
                                ⬇ โหลด
                              </button>
                            </span>
                          );
                        })}
                      </span>
                    </span>
                  )}
                </span>
                <span className="dkb-side items-end gap-1">
                  {x.state !== "done" ? (
                    <span className="text-[12px]" style={{ color: "var(--dk-faint)" }}>
                      {x.state === "busy" ? "กำลังอ่าน…" : "รอคิว"}
                    </span>
                  ) : info?.ok ? (
                    <>
                      {groups.slice(0, 4).map(({ board: b, count }, i) => {
                        // ชิ้นงาน (ส่วนไม่โปร่งใส) เป็นตัวหลัก — ตรงกับ W/H ใน Illustrator · ผืน/อาร์ตบอร์ดเป็นตัวรอง
                        const main = b.object ?? b;
                        return (
                          <span key={i} className="flex flex-col items-end whitespace-nowrap text-right tabular-nums">
                            <span>
                              <b className="text-[1.05rem]">
                                {dim(main.widthMm)} × {dim(main.heightMm)}
                              </b>{" "}
                              <span className="text-[12px]" style={{ color: "var(--dk-faint)" }}>
                                {unitLabel}
                                {count > 1 ? ` × ${count}` : ""}
                              </span>
                            </span>
                            <span className="text-[11.5px]" style={{ color: "var(--dk-faint)" }}>
                              {b.object
                                ? `ชิ้นงาน · ${info.kind === "ai" || info.kind === "pdf" ? "อาร์ตบอร์ด" : "ผืน"} ${dim(b.widthMm)} × ${dim(b.heightMm)}`
                                : info.kind === "ai" || info.kind === "pdf"
                                  ? "อาร์ตบอร์ด"
                                  : "ผืน (งานเต็มผืน)"}
                              {b.trim ? ` · ตัดจริง ${dim(b.trim.widthMm)} × ${dim(b.trim.heightMm)}` : ""}
                            </span>
                          </span>
                        );
                      })}
                      {groups.length > 4 && (
                        <span className="text-[12px]" style={{ color: "var(--dk-faint)" }}>
                          และอีก {groups.length - 4} ขนาด
                        </span>
                      )}
                      <CopyChip label="คัดลอก" text={() => sizeText(info)} />
                    </>
                  ) : (
                    <b className="text-[0.95rem]" style={{ color: "var(--dk-coral-ink)" }}>
                      {info?.px ? `${info.px.w} × ${info.px.h} px` : "อ่านขนาดไม่ได้"}
                    </b>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}

export default function FileSizePage() {
  return (
    <RequirePerm perm="admin.access">
      <FileSizeInner />
    </RequirePerm>
  );
}
