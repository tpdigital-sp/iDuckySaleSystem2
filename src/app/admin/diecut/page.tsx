"use client";

import RequirePerm from "@/components/RequirePerm";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildDiecut, exportFrame, toSvgPath, type DiecutResult, type RingTab } from "@/lib/diecut";
import { buildAiFile, buildSheetAiFile } from "@/lib/diecut-ai";
import {
  gridFit,
  layoutSheets,
  placementTransform,
  sheetSignature,
  type PieceBox,
  type Placement,
  type SheetSpec,
} from "@/lib/diecut-layout";
import { Banner, Btn, PageHead, PageShell } from "@/components/admin/ui";

/** ขนาดที่ใช้คำนวณเส้น (ยิ่งเล็กยิ่งไว) และขนาดรูปที่ฝังลงไฟล์ .ai */
const TRACE_MAX = 1200;
const EMBED_MAX = 2400;

const inputCls =
  "w-full rounded-xl bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-300";
const smallInputCls =
  "w-full rounded-lg bg-white px-2 py-1 text-[12px] ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-300";

/** แผ่นสำเร็จรูป (มม. · แนวนอน) — "ไดคัทร้าน" = พื้นที่วางที่ใช้คิดราคาไดคัทหน้าร้าน */
const SHEET_PRESETS = [
  { id: "shop", label: "พื้นที่ไดคัทร้าน 437.6×288.9", w: 437.6, h: 288.9, mx: 0, my: 0 },
  { id: "a3", label: "A3 420×297", w: 420, h: 297, mx: 5, my: 5 },
  { id: "a4", label: "A4 297×210", w: 297, h: 210, mx: 5, my: 5 },
  { id: "4x6", label: "4×6 นิ้ว", w: 152.4, h: 101.6, mx: 3, my: 3 },
] as const;

/** ย่อรูปลงแคนวาสตามด้านยาวสุดที่กำหนด แล้วอ่านพิกเซลออกมา */
function toImageData(bmp: ImageBitmap, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d", { willReadFrequently: true })!;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

/** ลายหนึ่งแบบในงานนี้ (หลายลายวางรวมแผ่นเดียวกันได้) */
interface Design {
  id: string;
  name: string;
  trace: ImageData;
  embed: ImageData;
  natural: { w: number; h: number };
  /** ความกว้างงานจริง (มม.) */
  widthMm: string;
  /** จำนวนชิ้นบนแผ่น · 0 = เติมที่ว่างที่เหลือ */
  qty: string;
  /** รูปย่อสำหรับรายการ */
  thumb: string;
}

const num = (v: string) => v.replace(/[^\d.]/g, "");

/** กรอบชิ้นงาน = กรอบเส้นตัด (รวมหูร้อย) · ใช้วัดระยะห่างระหว่างชิ้นจากเส้นตัดถึงเส้นตัด */
const boxOf = (r: DiecutResult): PieceBox => r.bounds;

/** วาดเส้นตัดของลายหนึ่งชิ้นลงแคนวาส (พิกัดมม. ของลาย ผ่าน transform ที่ตั้งไว้แล้ว) */
function strokeCut(ctx: CanvasRenderingContext2D, r: DiecutResult) {
  for (const c of r.curves) {
    if (!c.segs.length) continue;
    ctx.beginPath();
    ctx.moveTo(c.start.x, c.start.y);
    for (const s of c.segs) ctx.bezierCurveTo(s.c1.x, s.c1.y, s.c2.x, s.c2.y, s.to.x, s.to.y);
    ctx.closePath();
    ctx.stroke();
  }
  if (r.hole) {
    ctx.beginPath();
    ctx.arc(r.hole.cx, r.hole.cy, r.hole.r, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function DiecutLabInner() {
  const [designs, setDesigns] = useState<Design[]>([]);
  const [selId, setSelId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [view, setView] = useState<"piece" | "sheet">("piece");

  // ── ค่าตั้งเส้นตัด (ใช้ร่วมทุกลาย) ──
  const [offsetMm, setOffsetMm] = useState("2"); // ค่าที่ร้านใช้ประจำ
  const [smoothMm, setSmoothMm] = useState("1.2"); // เก็บขอบให้ลื่นแบบงานจริง
  const [curveTol, setCurveTol] = useState("0.15"); // ความละเอียดตอนแปลงเป็นเส้นโค้ง
  const [fillHoles, setFillHoles] = useState(true);
  const [alphaThreshold, setAlphaThreshold] = useState("128");
  const [ringOn, setRingOn] = useState(true);
  const [tabDia, setTabDia] = useState("9"); // แท็บกลมยื่นออกมา
  const [ringDia, setRingDia] = useState("4");
  const [ringOverlap, setRingOverlap] = useState("2.5");
  const [ringPos, setRingPos] = useState<RingTab["position"]>("left");

  // ── ค่าตั้งแผ่น (จัดวางหลายชิ้น) ──
  const [preset, setPreset] = useState<string>("shop");
  const [sheetW, setSheetW] = useState("437.6");
  const [sheetH, setSheetH] = useState("288.9");
  const [marginX, setMarginX] = useState("0");
  const [marginY, setMarginY] = useState("0");
  const [gap, setGap] = useState("2"); // กติการ้าน: วางลายห่างกัน 2 มม.ขึ้นไป
  const [allowRotate, setAllowRotate] = useState(true);
  const [sheetIdx, setSheetIdx] = useState(0);

  const [showAnchors, setShowAnchors] = useState(false);
  const [results, setResults] = useState<Record<string, DiecutResult>>({});
  const previewRef = useRef<HTMLCanvasElement>(null);

  const sel = designs.find((d) => d.id === selId) ?? designs[0];
  const result = sel ? results[sel.id] : undefined;

  const loadFiles = useCallback(async (files: File[]) => {
    setErr("");
    const ok = files.filter((f) => /^image\/(png|webp)$/.test(f.type));
    if (ok.length < files.length) {
      setErr("ไฟล์ลายต้องเป็น PNG (หรือ WEBP) ที่พื้นหลังโปร่งใส — JPG ไม่มีพื้นใส ตัดขอบไม่ได้");
    }
    if (!ok.length) return;
    setBusy(true);
    try {
      const added: Design[] = [];
      for (const f of ok) {
        const bmp = await createImageBitmap(f);
        const thumbCv = document.createElement("canvas");
        const ts = Math.min(1, 96 / Math.max(bmp.width, bmp.height));
        thumbCv.width = Math.max(1, Math.round(bmp.width * ts));
        thumbCv.height = Math.max(1, Math.round(bmp.height * ts));
        thumbCv.getContext("2d")!.drawImage(bmp, 0, 0, thumbCv.width, thumbCv.height);
        added.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: f.name,
          trace: toImageData(bmp, TRACE_MAX),
          embed: toImageData(bmp, EMBED_MAX),
          natural: { w: bmp.width, h: bmp.height },
          widthMm: "50",
          qty: "0",
          thumb: thumbCv.toDataURL(),
        });
        bmp.close();
      }
      setDesigns((prev) => {
        // ลายแรก = เติมเต็มแผ่น · ลายที่เพิ่มทีหลังเริ่มที่ 10 ชิ้น (ไม่งั้นลายแรกกินที่หมด ลายหลังได้ 0)
        const next = [...prev, ...added.map((d, i) => (prev.length + i > 0 ? { ...d, qty: "10" } : d))];
        return next;
      });
      setSelId(added[0].id);
    } catch {
      setErr("เปิดไฟล์รูปไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }, []);

  const patchDesign = (id: string, p: Partial<Design>) =>
    setDesigns((prev) => prev.map((d) => (d.id === id ? { ...d, ...p } : d)));
  const removeDesign = (id: string) => {
    setDesigns((prev) => prev.filter((d) => d.id !== id));
    setResults((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  // คำนวณเส้นใหม่ทุกครั้งที่ลาย/ค่าตั้งเปลี่ยน (ทุกลาย — แผ่นต้องใช้ขนาดเส้นตัดของทุกลาย)
  const widthKey = designs.map((d) => `${d.id}:${d.widthMm}`).join("|");
  useEffect(() => {
    if (!designs.length) {
      setResults({});
      return;
    }
    const t = setTimeout(() => {
      const ring: RingTab | undefined = ringOn
        ? {
            tabDiameterMm: Number(tabDia) || 0,
            holeDiameterMm: Number(ringDia) || 0,
            overlapMm: Number(ringOverlap) || 0,
            position: ringPos,
          }
        : undefined;
      const oMm = Number(offsetMm);
      const next: Record<string, DiecutResult> = {};
      for (const d of designs) {
        const wMm = Number(d.widthMm);
        if (!(wMm > 0)) continue;
        next[d.id] = buildDiecut(
          d.trace,
          {
            widthMm: wMm,
            offsetMm: Number.isFinite(oMm) ? oMm : 0,
            smoothMm: Number(smoothMm) || 0,
            curveTolMm: Number(curveTol) || 0.15,
            fillHoles,
            alphaThreshold: Number(alphaThreshold) || 128,
          },
          ring
        );
      }
      setResults(next);
    }, 150); // หน่วงสั้น ๆ กันคำนวณรัวตอนลากสไลเดอร์
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- widthKey แทน designs (เปลี่ยนจำนวนชิ้นไม่ต้องคำนวณเส้นใหม่)
  }, [widthKey, offsetMm, smoothMm, curveTol, fillHoles, alphaThreshold, ringOn, tabDia, ringDia, ringOverlap, ringPos]);

  // ── จัดลงแผ่น ──
  const sheet: SheetSpec = {
    widthMm: Number(sheetW) || 0,
    heightMm: Number(sheetH) || 0,
    marginXMm: Number(marginX) || 0,
    marginYMm: Number(marginY) || 0,
    gapMm: Number(gap) || 0,
    allowRotate,
  };
  const layoutDesigns = designs.filter((d) => results[d.id]?.curves.length);
  const layout = useMemo(
    () =>
      sheet.widthMm > 0 && sheet.heightMm > 0
        ? layoutSheets(
            layoutDesigns.map((d) => ({ id: d.id, box: boxOf(results[d.id]), qty: Math.floor(Number(d.qty) || 0) })),
            sheet
          )
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [results, designs, sheetW, sheetH, marginX, marginY, gap, allowRotate]
  );
  /** แผ่นที่วางเหมือนกันรวมกลุ่ม — ตัด/พิมพ์ซ้ำได้ ไม่ต้องโหลดแยก */
  const sheetGroups = useMemo(() => {
    if (!layout) return [];
    const groups: { first: number; count: number; sheet: Placement[] }[] = [];
    const bySig = new Map<string, number>();
    layout.sheets.forEach((s, i) => {
      const sig = sheetSignature(s);
      const g = bySig.get(sig);
      if (g !== undefined) groups[g].count++;
      else {
        bySig.set(sig, groups.length);
        groups.push({ first: i, count: 1, sheet: s });
      }
    });
    return groups;
  }, [layout]);
  const curSheet = layout?.sheets[Math.min(sheetIdx, (layout?.sheets.length ?? 1) - 1)] ?? [];
  const usedArea = curSheet.reduce((a, p) => a + p.w * p.h, 0);
  const usePct = sheet.widthMm * sheet.heightMm > 0 ? (usedArea / (sheet.widthMm * sheet.heightMm)) * 100 : 0;

  // รูปลายเป็นแคนวาส (ใช้วาดซ้ำหลายชิ้นบนแผ่น)
  const artCanvases = useMemo(() => {
    const m = new Map<string, HTMLCanvasElement>();
    for (const d of designs) {
      const c = document.createElement("canvas");
      c.width = d.embed.width;
      c.height = d.embed.height;
      c.getContext("2d")!.putImageData(d.embed, 0, 0);
      m.set(d.id, c);
    }
    return m;
  }, [designs.map((d) => d.id).join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  // วาดตัวอย่าง
  useEffect(() => {
    const cv = previewRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d")!;
    const checker = () => {
      const sq = 10;
      for (let y = 0; y < cv.height; y += sq)
        for (let x = 0; x < cv.width; x += sq) {
          ctx.fillStyle = ((x / sq + y / sq) & 1) === 0 ? "#f8fafc" : "#eef2f7";
          ctx.fillRect(x, y, sq, sq);
        }
    };

    if (view === "piece") {
      if (!sel || !result) return;
      // กรอบตัวอย่าง = กรอบไฟล์ส่งออก (เส้นตัด/แท็บหูร้อยล้นออกนอกลายได้ ต้องเห็นครบ)
      const frame = exportFrame(result, 3);
      // ขยายให้เต็มกรอบตัวอย่างเสมอ (งานจริงมักเล็กแค่ 5 ซม. — ถ้าวาดเท่าขนาดจริงจะจิ๋วจนดูไม่ออก)
      const k = Math.min(24, 640 / Math.max(frame.pageWidthMm, frame.pageHeightMm));
      cv.width = Math.round(frame.pageWidthMm * k);
      cv.height = Math.round(frame.pageHeightMm * k);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      checker();
      ctx.setTransform(k, 0, 0, k, frame.artXMm * k, frame.artYMm * k);
      const art = artCanvases.get(sel.id);
      if (art) ctx.drawImage(art, 0, 0, result.widthMm, result.heightMm);
      // วาดจากเส้นโค้งชุดเดียวกับที่จะเขียนลงไฟล์ — เห็นบนจอยังไง ได้ไฟล์อย่างนั้น
      ctx.strokeStyle = "#e2007a";
      ctx.lineWidth = 1.5 / k;
      ctx.lineJoin = "round";
      strokeCut(ctx, result);
      // จุดแองเคอร์ (เหมือนที่จะเห็นตอนเปิดใน Illustrator)
      if (showAnchors) {
        ctx.fillStyle = "#0ea5e9";
        for (const c of result.curves)
          for (const s of c.segs) {
            ctx.beginPath();
            ctx.arc(s.to.x, s.to.y, 2.2 / k, 0, Math.PI * 2);
            ctx.fill();
          }
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      return;
    }

    // ── มุมมองแผ่น ──
    if (!(sheet.widthMm > 0 && sheet.heightMm > 0)) return;
    const k = Math.min(4, 760 / sheet.widthMm, 560 / sheet.heightMm);
    cv.width = Math.round(sheet.widthMm * k);
    cv.height = Math.round(sheet.heightMm * k);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cv.width, cv.height);
    // พื้นที่วาง (หักขอบแผ่น)
    if (sheet.marginXMm > 0 || sheet.marginYMm > 0) {
      ctx.strokeStyle = "#94a3b8";
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.strokeRect(
        sheet.marginXMm * k + 0.5,
        sheet.marginYMm * k + 0.5,
        (sheet.widthMm - sheet.marginXMm * 2) * k,
        (sheet.heightMm - sheet.marginYMm * 2) * k
      );
      ctx.setLineDash([]);
    }
    for (const p of curSheet) {
      const r = results[p.id];
      if (!r) continue;
      const map = placementTransform(p, boxOf(r));
      const o = map({ x: 0, y: 0 });
      const ex = map({ x: 1, y: 0 });
      const ey = map({ x: 0, y: 1 });
      ctx.setTransform((ex.x - o.x) * k, (ex.y - o.y) * k, (ey.x - o.x) * k, (ey.y - o.y) * k, o.x * k, o.y * k);
      const art = artCanvases.get(p.id);
      if (art) ctx.drawImage(art, 0, 0, r.widthMm, r.heightMm);
      ctx.strokeStyle = "#e2007a";
      ctx.lineWidth = 1 / k;
      ctx.lineJoin = "round";
      strokeCut(ctx, r);
      // ไฮไลต์ลายที่เลือกอยู่
      if (sel && p.id === sel.id && designs.length > 1) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.strokeStyle = "rgba(14,165,233,.55)";
        ctx.lineWidth = 1;
        ctx.strokeRect(p.x * k + 0.5, p.y * k + 0.5, p.w * k, p.h * k);
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, cv.width - 1, cv.height - 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, sel, result, results, showAnchors, curSheet, artCanvases, sheetW, sheetH, marginX, marginY]);

  const download = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const baseName = ((sel?.name ?? "").replace(/\.[^.]+$/, "") || "diecut") + `-cut${offsetMm}mm`;

  async function downloadAi() {
    if (!sel || !result) return;
    setBusy(true);
    try {
      const blob = await buildAiFile({
        rgba: sel.embed.data,
        pxWidth: sel.embed.width,
        pxHeight: sel.embed.height,
        widthMm: result.widthMm,
        heightMm: result.heightMm,
        curves: result.curves,
        hole: result.hole,
        ...exportFrame(result, 5),
        title: baseName,
      });
      download(blob, `${baseName}.ai`);
    } catch {
      setErr("สร้างไฟล์ .ai ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  function downloadSvg() {
    if (!result) return;
    const d = toSvgPath(result.curves, result.hole);
    const f = exportFrame(result, 5);
    // viewBox เริ่มที่มุมซ้ายบนของกรอบ (พิกัดเส้นตัดติดลบได้ จึงเลื่อนด้วย artX/artY)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${f.pageWidthMm.toFixed(2)}mm" height="${f.pageHeightMm.toFixed(2)}mm" viewBox="${(-f.artXMm).toFixed(2)} ${(-f.artYMm).toFixed(2)} ${f.pageWidthMm.toFixed(2)} ${f.pageHeightMm.toFixed(2)}">
  <g id="CutContour" fill="none" stroke="#e2007a" stroke-width="0.25"><path d="${d}"/></g>
</svg>`;
    download(new Blob([svg], { type: "image/svg+xml" }), `${baseName}.svg`);
  }

  /** โหลดไฟล์ .ai ทั้งแผ่น — ลาย + เส้นตัด CutContour ทุกชิ้น ขนาดเท่าแผ่นจริง */
  async function downloadSheetAi(s: Placement[], no: number) {
    if (!s.length) return;
    setBusy(true);
    try {
      const ids = [...new Set(s.map((p) => p.id))];
      const arts = ids.map((id) => {
        const d = designs.find((x) => x.id === id)!;
        const r = results[id];
        return {
          rgba: d.embed.data,
          pxWidth: d.embed.width,
          pxHeight: d.embed.height,
          widthMm: r.widthMm,
          heightMm: r.heightMm,
          curves: r.curves,
          hole: r.hole,
        };
      });
      const name = `diecut-sheet${no}-${s.length}pcs`;
      const blob = await buildSheetAiFile({
        pageWidthMm: sheet.widthMm,
        pageHeightMm: sheet.heightMm,
        arts,
        placements: s.map((p) => ({ art: ids.indexOf(p.id), map: placementTransform(p, boxOf(results[p.id])) })),
        title: name,
      });
      download(blob, `${name}.ai`);
    } catch {
      setErr("สร้างไฟล์ .ai ทั้งแผ่นไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const applyPreset = (id: string) => {
    setPreset(id);
    const p = SHEET_PRESETS.find((x) => x.id === id);
    if (!p) return;
    setSheetW(String(p.w));
    setSheetH(String(p.h));
    setMarginX(String(p.mx));
    setMarginY(String(p.my));
    setSheetIdx(0);
  };

  const hasAny = designs.length > 0;

  return (
    <PageShell>
      <PageHead
        group="สินค้า"
        title="เส้นไดคัท"
        count="ทดลอง"
        sub="ทำเส้นตัดจากลายลูกค้า → จัดลงแผ่น → ไฟล์เข้าเครื่องตัด"
      />

      <div className="mt-4">
        <Banner
          tone="warm"
          title="โหมดทดลอง"
          detail="หน้านี้อยู่ในหลังบ้านอย่างเดียว ลูกค้าหน้าร้านยังไม่เห็นและยังไม่มีผลกับออเดอร์ใด ๆ"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        {/* ซ้าย: ลาย + ตัวอย่าง */}
        <div className="dkb-g p-4">
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const fs = Array.from(e.dataTransfer.files ?? []);
              if (fs.length) void loadFiles(fs);
            }}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-5 text-center transition ${
              dragOver ? "border-[color:var(--dk-blue)] bg-white/80" : "border-[color:var(--dk-sky-300)] bg-white/50 hover:bg-white/80"
            }`}
          >
            <input
              type="file"
              accept="image/png,image/webp"
              multiple
              className="hidden"
              onChange={(e) => {
                const fs = Array.from(e.target.files ?? []);
                e.target.value = "";
                if (fs.length) void loadFiles(fs);
              }}
            />
            <span className="dkb-h2 text-[0.98rem]">{hasAny ? "＋ เพิ่มลาย" : "เลือกไฟล์ลาย · หรือลากมาวางตรงนี้"}</span>
            <span className="mt-1 text-[11.5px]" style={{ color: "var(--dk-faint)" }}>
              PNG พื้นใส (ไล่พื้นหลังออกแล้ว) · เลือกหลายไฟล์ได้ = วางหลายลายรวมแผ่นเดียว
            </span>
          </label>

          {err && (
            <p className="mt-3 rounded-[16px] px-3 py-2 text-[13px] font-semibold" style={{ background: "var(--dk-coral-wash)", color: "var(--dk-coral-ink)" }}>
              {err}
            </p>
          )}

          {/* รายการลาย: ขนาด + จำนวนชิ้นบนแผ่น */}
          {hasAny && (
            <ul className="mt-3 space-y-1.5">
              {designs.map((d) => {
                const r = results[d.id];
                const placed = layout?.placed[d.id];
                const isSel = sel?.id === d.id;
                const fit = r ? Math.max(gridFit(r.bounds.x1 - r.bounds.x0, r.bounds.y1 - r.bounds.y0, sheet), allowRotate ? gridFit(r.bounds.y1 - r.bounds.y0, r.bounds.x1 - r.bounds.x0, sheet) : 0) : 0;
                return (
                  <li
                    key={d.id}
                    onClick={() => setSelId(d.id)}
                    className="flex cursor-pointer flex-wrap items-center gap-2 rounded-[14px] px-2 py-1.5 transition"
                    style={{
                      background: isSel ? "var(--dk-sky)" : "rgba(255,255,255,.55)",
                      boxShadow: isSel ? "inset 0 0 0 1.5px var(--dk-blue)" : "inset 0 0 0 1px var(--dk-hair)",
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={d.thumb} alt="" className="h-10 w-10 shrink-0 rounded-lg object-contain" style={{ background: "#eef2f7" }} />
                    <div className="min-w-[150px] flex-1">
                      <div className="truncate text-[12.5px] font-bold" style={{ color: "var(--dk-navy)" }}>{d.name}</div>
                      <div className="text-[11px]" style={{ color: "var(--dk-faint)" }}>
                        {r ? `${(r.bounds.x1 - r.bounds.x0).toFixed(1)} × ${(r.bounds.y1 - r.bounds.y0).toFixed(1)} มม. (รวมเส้นตัด)` : "กำลังคำนวณ…"}
                        {r && ` · เต็มแผ่นได้ ${fit} ชิ้น`}
                      </div>
                    </div>
                    <label className="w-[74px] text-[10.5px] font-semibold text-slate-500" onClick={(e) => e.stopPropagation()}>
                      กว้าง มม.
                      <input value={d.widthMm} onChange={(e) => patchDesign(d.id, { widthMm: num(e.target.value) })} inputMode="decimal" className={smallInputCls} />
                    </label>
                    <label className="w-[74px] text-[10.5px] font-semibold text-slate-500" onClick={(e) => e.stopPropagation()}>
                      จำนวน
                      <input
                        value={d.qty}
                        onChange={(e) => patchDesign(d.id, { qty: e.target.value.replace(/\D/g, "") })}
                        inputMode="numeric"
                        placeholder="0"
                        className={smallInputCls}
                        title="0 = เติมที่ว่างที่เหลือบนแผ่น"
                      />
                    </label>
                    <span className="w-[64px] text-right text-[11px] font-bold" style={{ color: placed ? "var(--dk-navy-soft)" : "var(--dk-coral-ink)" }}>
                      {placed === undefined ? "" : Number(d.qty) > 0 ? `วาง ${placed}/${d.qty}` : `เติม ${placed}`}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeDesign(d.id);
                      }}
                      className="rounded-lg px-1.5 text-[15px] leading-none text-slate-400 hover:text-[color:var(--dk-coral-ink)]"
                      title="เอาลายนี้ออก"
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {hasAny && (
            <p className="mt-1.5 text-[11px]" style={{ color: "var(--dk-faint)" }}>
              จำนวน 0 = เติมที่ว่างที่เหลือบนแผ่น · ใส่ตัวเลข = วางเท่านั้นชิ้น (เกินแผ่นขึ้นแผ่นใหม่ให้เอง)
            </p>
          )}

          {hasAny && (
            <div className="mt-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-xl p-0.5" style={{ background: "rgba(255,255,255,.6)", boxShadow: "inset 0 0 0 1px var(--dk-hair)" }}>
                  {(
                    [
                      ["piece", "ชิ้นเดียว"],
                      ["sheet", "จัดลงแผ่น"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setView(id)}
                      className={`rounded-[10px] px-3 py-1 text-[12px] font-bold transition ${
                        view === id ? "bg-[color:var(--dk-navy)] text-white" : "text-[color:var(--dk-navy-soft)]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {view === "piece" && (
                  <>
                    <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                      <input type="checkbox" checked={showAnchors} onChange={(e) => setShowAnchors(e.target.checked)} className="h-3.5 w-3.5" style={{ accentColor: "var(--dk-blue-deep)" }} />
                      โชว์จุดแองเคอร์
                    </label>
                    {result && (
                      <span className="ml-auto text-[11.5px]" style={{ color: "var(--dk-navy-soft)" }}>
                        งานจริง {result.widthMm.toFixed(1)} × {result.heightMm.toFixed(1)} มม. · เส้นสีบานเย็น = แนวตัด
                      </span>
                    )}
                  </>
                )}
                {view === "sheet" && layout && (
                  <span className="ml-auto text-[11.5px]" style={{ color: "var(--dk-navy-soft)" }}>
                    แผ่นนี้ {curSheet.length} ชิ้น · ใช้พื้นที่ ~{usePct.toFixed(0)}% · ทั้งหมด {layout.sheets.length} แผ่น
                  </span>
                )}
              </div>

              {view === "sheet" && layout && layout.sheets.length > 1 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {layout.sheets.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSheetIdx(i)}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                        Math.min(sheetIdx, layout.sheets.length - 1) === i ? "bg-[color:var(--dk-navy)] text-white" : "bg-white/70 text-[color:var(--dk-navy-soft)] hover:bg-white"
                      }`}
                    >
                      แผ่น {i + 1} · {s.length} ชิ้น
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-2 overflow-auto rounded-[18px]" style={{ boxShadow: "inset 0 0 0 1px var(--dk-hair)", background: view === "sheet" ? "#e2e8f0" : undefined, padding: view === "sheet" ? 12 : 0 }}>
                <canvas ref={previewRef} className="mx-auto block h-auto max-w-full" style={view === "sheet" ? { boxShadow: "0 2px 10px rgba(15,23,42,.12)" } : undefined} />
              </div>

              {view === "piece" && result && result.warnings.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {result.warnings.map((warn, i) => (
                    <li key={i} className="rounded-[14px] px-3 py-2 text-[12px] font-semibold" style={{ background: "var(--dk-yolk-wash)", color: "var(--dk-yolk-ink)" }}>
                      {warn}
                    </li>
                  ))}
                </ul>
              )}
              {view === "sheet" && layout && layout.tooBig.length > 0 && (
                <p className="mt-3 rounded-[14px] px-3 py-2 text-[12px] font-semibold" style={{ background: "var(--dk-coral-wash)", color: "var(--dk-coral-ink)" }}>
                  ลายใหญ่กว่าพื้นที่วางของแผ่น (วางไม่ได้เลย):{" "}
                  {layout.tooBig.map((id) => designs.find((d) => d.id === id)?.name).join(", ")}
                </p>
              )}
            </div>
          )}
        </div>

        {/* ขวา: ค่าตั้ง + ปุ่มโหลดไฟล์ */}
        <div className="space-y-4">
          {view === "sheet" && (
            <div className="dkb-g p-4">
              <h2 className="dkb-h2 text-[1.02rem]">แผ่นงาน</h2>
              <div className="mt-3 grid grid-cols-2 gap-1.5">
                {SHEET_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyPreset(p.id)}
                    className={`rounded-lg px-2 py-1.5 text-[11px] font-semibold transition ${
                      preset === p.id ? "bg-[color:var(--dk-navy)] text-white" : "bg-white/70 text-[color:var(--dk-navy-soft)] hover:bg-white"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                <label className="text-[11px] font-semibold text-slate-500">
                  กว้างแผ่น (มม.)
                  <input value={sheetW} onChange={(e) => { setSheetW(num(e.target.value)); setPreset("custom"); }} inputMode="decimal" className={`mt-1 ${inputCls}`} />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setSheetW(sheetH);
                    setSheetH(sheetW);
                    setMarginX(marginY);
                    setMarginY(marginX);
                  }}
                  className="mb-1 rounded-lg bg-white/70 px-2 py-1.5 text-[13px] font-bold text-[color:var(--dk-navy-soft)] hover:bg-white"
                  title="สลับแนวตั้ง/แนวนอน"
                >
                  ⇄
                </button>
                <label className="text-[11px] font-semibold text-slate-500">
                  สูงแผ่น (มม.)
                  <input value={sheetH} onChange={(e) => { setSheetH(num(e.target.value)); setPreset("custom"); }} inputMode="decimal" className={`mt-1 ${inputCls}`} />
                </label>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <label className="text-[11px] font-semibold text-slate-500">
                  ขอบซ้าย-ขวา
                  <input value={marginX} onChange={(e) => setMarginX(num(e.target.value))} inputMode="decimal" className={`mt-1 ${inputCls}`} />
                </label>
                <label className="text-[11px] font-semibold text-slate-500">
                  ขอบบน-ล่าง
                  <input value={marginY} onChange={(e) => setMarginY(num(e.target.value))} inputMode="decimal" className={`mt-1 ${inputCls}`} />
                </label>
                <label className="text-[11px] font-semibold text-slate-500">
                  ห่างกัน
                  <input value={gap} onChange={(e) => setGap(num(e.target.value))} inputMode="decimal" className={`mt-1 ${inputCls}`} />
                </label>
              </div>
              <p className="mt-1.5 text-[11.5px]" style={{ color: "var(--dk-faint)" }}>
                หน่วย มม. · ห่างกัน = จากเส้นตัดถึงเส้นตัด (ร้านใช้ 2 มม.ขึ้นไป)
              </p>
              <label className="mt-3 flex cursor-pointer items-center gap-2 text-[12px] font-semibold text-slate-600">
                <input type="checkbox" checked={allowRotate} onChange={(e) => setAllowRotate(e.target.checked)} className="h-4 w-4" style={{ accentColor: "var(--dk-blue-deep)" }} />
                หมุน 90° ได้ถ้าวางได้มากกว่า
              </label>
            </div>
          )}

          <div className="dkb-g p-4">
            <h2 className="dkb-h2 text-[1.02rem]">เส้นตัด</h2>
            <label className="mt-3 block text-[11px] font-semibold text-slate-500">
              ตัดเผื่อรอบลาย (มม.)
              <input value={offsetMm} onChange={(e) => setOffsetMm(num(e.target.value))} inputMode="decimal" className={`mt-1 ${inputCls}`} />
            </label>
            <p className="mt-2 text-[11.5px]" style={{ color: "var(--dk-faint)" }}>
              ใช้กับทุกลาย · ค่าตัดเผื่อมาตรฐานของร้าน = 2 มม. · ความกว้างแต่ละลายตั้งในรายการลาย
            </p>
            <label className="mt-3 block text-[11px] font-semibold text-slate-500">
              เก็บขอบให้เรียบ: {smoothMm} มม.
              <input
                type="range"
                min={0}
                max={5}
                step={0.1}
                value={smoothMm}
                onChange={(e) => setSmoothMm(e.target.value)}
                className="mt-1 w-full" style={{ accentColor: "var(--dk-blue-deep)" }}
              />
              <span className="text-[11.5px]" style={{ color: "var(--dk-faint)" }}>
                0 = วิ่งตามหยักของลายเป๊ะ · ยิ่งมากยิ่งลื่น (กลืนร่องแคบ ๆ ระหว่างตัวอักษรให้เป็นเส้นเดียว)
              </span>
            </label>
            <label className="mt-3 block text-[11px] font-semibold text-slate-500">
              ความละเอียดเส้นโค้ง: ±{curveTol} มม.
              <input
                type="range"
                min={0.03}
                max={0.6}
                step={0.01}
                value={curveTol}
                onChange={(e) => setCurveTol(e.target.value)}
                className="mt-1 w-full" style={{ accentColor: "var(--dk-blue-deep)" }}
              />
              <span className="text-[11.5px]" style={{ color: "var(--dk-faint)" }}>
                เส้นถูกแปลงเป็นโค้งเบซิเยร์แบบโปรแกรมตัด · น้อย = เกาะลายแน่นแต่จุดเยอะ · มาก = จุดน้อย เส้นลื่น แก้ต่อง่ายใน Illustrator
              </span>
            </label>
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-[12px] font-semibold text-slate-600">
              <input type="checkbox" checked={fillHoles} onChange={(e) => setFillHoles(e.target.checked)} className="h-4 w-4" style={{ accentColor: "var(--dk-blue-deep)" }} />
              ปิดรูกลางลาย (ไม่ตัดทะลุช่องว่างในตัวอักษร)
            </label>
            <label className="mt-3 block text-[11px] font-semibold text-slate-500">
              ความไวขอบลาย (alpha ≥ {alphaThreshold})
              <input
                type="range"
                min={1}
                max={200}
                value={alphaThreshold}
                onChange={(e) => setAlphaThreshold(e.target.value)}
                className="mt-1 w-full" style={{ accentColor: "var(--dk-blue-deep)" }}
              />
              <span className="text-[11.5px]" style={{ color: "var(--dk-faint)" }}>ลายที่ขอบฟุ้ง/มีเงา ถ้าเส้นตัดกินเงามาด้วยให้เลื่อนไปทางขวา</span>
            </label>
          </div>

          <div className="dkb-g p-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-slate-700">
              <input type="checkbox" checked={ringOn} onChange={(e) => setRingOn(e.target.checked)} className="h-4 w-4" style={{ accentColor: "var(--dk-blue-deep)" }} />
              🔗 หูร้อยห่วง
            </label>
            {ringOn && (
              <>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <label className="text-[11px] font-semibold text-slate-500">
                    แท็บกลม (มม.)
                    <input value={tabDia} onChange={(e) => setTabDia(num(e.target.value))} inputMode="decimal" className={`mt-1 ${inputCls}`} />
                  </label>
                  <label className="text-[11px] font-semibold text-slate-500">
                    รูเจาะ (มม.)
                    <input value={ringDia} onChange={(e) => setRingDia(num(e.target.value))} inputMode="decimal" className={`mt-1 ${inputCls}`} />
                  </label>
                  <label className="text-[11px] font-semibold text-slate-500">
                    ซ้อนงาน (มม.)
                    <input value={ringOverlap} onChange={(e) => setRingOverlap(num(e.target.value))} inputMode="decimal" className={`mt-1 ${inputCls}`} />
                  </label>
                </div>
                <p className="mt-1.5 text-[11.5px]" style={{ color: "var(--dk-faint)" }}>
                  แท็บกลม = วงกลมยื่นออกจากตัวงานสำหรับร้อยห่วง (ใส่ 0 = ไม่ทำแท็บ เจาะรูบนตัวงานเลย) · ซ้อนงาน = ให้แท็บทับตัวงานกี่ มม. จะได้เป็นชิ้นเดียว
                </p>
                <div className="mt-3 grid grid-cols-3 gap-1.5">
                  {(
                    [
                      ["left", "◀ ซ้าย"],
                      ["top-center", "▲ บนกลาง"],
                      ["right", "▶ ขวา"],
                      ["top-left", "◤ ซ้ายบน"],
                      ["top-right", "◥ ขวาบน"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setRingPos(id)}
                      className={`rounded-lg px-2 py-1.5 text-[11px] font-semibold transition ${
                        ringPos === id ? "bg-[color:var(--dk-navy)] text-white" : "bg-white/70 text-[color:var(--dk-navy-soft)] hover:bg-white"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="dkb-g p-4">
            <h2 className="dkb-h2 text-[1.02rem]">ไฟล์ส่งเข้าเครื่องตัด</h2>
            <p className="mt-1 text-[11.5px]" style={{ color: "var(--dk-faint)" }}>
              ไฟล์ .ai เปิดใน Illustrator ได้เลย — ในไฟล์มีรูปลายขนาดจริง + เส้นตัดเป็นเวกเตอร์สี spot ชื่อ <b>CutContour</b>
            </p>
            {view === "piece" ? (
              <>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Btn tone="yolk" onClick={downloadAi} disabled={!result || busy}>
                    {busy ? "กำลังสร้าง…" : "ดาวน์โหลด .ai"}
                  </Btn>
                  <Btn onClick={downloadSvg} disabled={!result}>
                    .svg (เส้นอย่างเดียว)
                  </Btn>
                </div>
                {result && (
                  <p className="mt-3 text-[11.5px]" style={{ color: "var(--dk-navy-soft)" }}>
                    ชิ้นงาน {result.pieces} ชิ้น
                    {result.innerHoles > 0 ? ` · รูตัดทะลุ ${result.innerHoles} รู` : ""} · จุดแองเคอร์{" "}
                    {result.anchors.toLocaleString("th-TH")} จุด
                    {result.hole ? " · มีหูร้อยห่วง" : ""}
                  </p>
                )}
              </>
            ) : (
              <div className="mt-3 space-y-2">
                {sheetGroups.map((g) => (
                  <div key={g.first} className="flex flex-wrap items-center gap-2">
                    <Btn tone="yolk" onClick={() => downloadSheetAi(g.sheet, g.first + 1)} disabled={busy || !g.sheet.length}>
                      {busy ? "กำลังสร้าง…" : `.ai แผ่น ${g.first + 1}${g.count > 1 ? `–${g.first + g.count}` : ""}`}
                    </Btn>
                    <span className="text-[11.5px]" style={{ color: "var(--dk-navy-soft)" }}>
                      {g.sheet.length} ชิ้น{g.count > 1 ? ` · ใช้ไฟล์เดียวกัน ×${g.count} แผ่น` : ""}
                    </span>
                  </div>
                ))}
                {layout && (
                  <p className="text-[11.5px]" style={{ color: "var(--dk-faint)" }}>
                    ไฟล์ขนาดเท่าแผ่น {sheet.widthMm} × {sheet.heightMm} มม. · รวม {layout.sheets.reduce((a, s) => a + s.length, 0)} ชิ้น
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
}

export default function DiecutLabPage() {
  return (
    <RequirePerm perm="products.manage">
      <DiecutLabInner />
    </RequirePerm>
  );
}
