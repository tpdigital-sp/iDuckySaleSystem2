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
import { Btn, PageHead, PageShell } from "@/components/admin/ui";

/** ขนาดที่ใช้คำนวณเส้น (ยิ่งเล็กยิ่งไว) และขนาดรูปที่ฝังลงไฟล์ .ai */
const TRACE_MAX = 1200;
const EMBED_MAX = 2400;
/** สีเส้นตัดบนจอ = สีเดียวกับ CutContour ในไฟล์ (ไม่ใช่สีธีม) */
const CUT_INK = "#e2007a";
/** ไฮไลต์ชิ้นที่ชี้ในแผงเลเยอร์ */
const HI_INK = "rgba(14,165,233,.85)";

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
  const [view, setView] = useState<"piece" | "sheet">("sheet");

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
  // ── แผงเลเยอร์ (แบบ Illustrator/VectorCraft) — ซ่อนบนจอเท่านั้น ไฟล์ที่โหลดมีครบทั้ง 2 เลเยอร์เสมอ ──
  const [layerArt, setLayerArt] = useState(true);
  const [layerCut, setLayerCut] = useState(true);
  const [hiPiece, setHiPiece] = useState<number | null>(null);
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
      if (art && layerArt) ctx.drawImage(art, 0, 0, result.widthMm, result.heightMm);
      // วาดจากเส้นโค้งชุดเดียวกับที่จะเขียนลงไฟล์ — เห็นบนจอยังไง ได้ไฟล์อย่างนั้น
      ctx.lineJoin = "round";
      if (hiPiece === 0) {
        ctx.strokeStyle = HI_INK;
        ctx.lineWidth = 5 / k;
        strokeCut(ctx, result);
      }
      if (layerCut) {
        ctx.strokeStyle = CUT_INK;
        ctx.lineWidth = 1.5 / k;
        strokeCut(ctx, result);
      }
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
    curSheet.forEach((p, idx) => {
      const r = results[p.id];
      if (!r) return;
      const map = placementTransform(p, boxOf(r));
      const o = map({ x: 0, y: 0 });
      const ex = map({ x: 1, y: 0 });
      const ey = map({ x: 0, y: 1 });
      ctx.setTransform((ex.x - o.x) * k, (ex.y - o.y) * k, (ey.x - o.x) * k, (ey.y - o.y) * k, o.x * k, o.y * k);
      const art = artCanvases.get(p.id);
      if (art && layerArt) ctx.drawImage(art, 0, 0, r.widthMm, r.heightMm);
      ctx.lineJoin = "round";
      // ชิ้นที่ชี้อยู่ในแผงเลเยอร์ — ขอบฟ้าหนารองใต้เส้นตัด
      if (hiPiece === idx) {
        ctx.strokeStyle = HI_INK;
        ctx.lineWidth = 4 / k;
        strokeCut(ctx, r);
      }
      if (layerCut) {
        ctx.strokeStyle = CUT_INK;
        ctx.lineWidth = 1 / k;
        strokeCut(ctx, r);
      }
      // ไฮไลต์ลายที่เลือกอยู่
      if (sel && p.id === sel.id && designs.length > 1) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.strokeStyle = "rgba(14,165,233,.55)";
        ctx.lineWidth = 1;
        ctx.strokeRect(p.x * k + 0.5, p.y * k + 0.5, p.w * k, p.h * k);
      }
    });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, cv.width - 1, cv.height - 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, sel, result, results, showAnchors, curSheet, artCanvases, sheetW, sheetH, marginX, marginY, layerArt, layerCut, hiPiece]);

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
  const totalPieces = layout ? layout.sheets.reduce((a, s) => a + s.length, 0) : 0;
  const sheetCount = layout?.sheets.length ?? 0;
  const curIdx = Math.min(sheetIdx, Math.max(0, sheetCount - 1));

  /** กล่องวางไฟล์ — ใช้ทั้งตอนยังว่าง (ใหญ่) และตอนเพิ่มลาย (เล็ก) */
  const dropZone = (big: boolean) => (
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
      className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed text-center transition ${
        big ? "min-h-[180px] px-4 py-8" : "min-h-[52px] px-3 py-2"
      } ${dragOver ? "border-[color:var(--dk-blue)] bg-white/90" : "border-[color:var(--dk-sky-300)] bg-white/50 hover:bg-white/80"}`}
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
      {big ? (
        <>
          <span className="dkb-h2 text-[1.2rem]" style={{ color: "var(--dk-navy)" }}>
            {busy ? "กำลังเปิดไฟล์…" : "เลือกไฟล์ลาย หรือลากมาวางตรงนี้"}
          </span>
          <span className="mt-1.5 text-[13px]" style={{ color: "var(--dk-navy-soft)" }}>
            PNG พื้นใส (ไล่พื้นหลังออกแล้ว) · เลือกหลายไฟล์พร้อมกันได้
          </span>
        </>
      ) : (
        <span className="text-[13px] font-bold" style={{ color: "var(--dk-navy-soft)" }}>
          {busy ? "กำลังเปิดไฟล์…" : "＋ เพิ่มลาย (เลือกหรือลากไฟล์มาวาง)"}
        </span>
      )}
    </label>
  );

  const errBox = err && (
    <p className="mt-3 rounded-[14px] px-3 py-2 text-[13px] font-semibold" style={{ background: "var(--dk-coral-wash)", color: "var(--dk-coral-ink)" }}>
      {err}
    </p>
  );

  return (
    <PageShell>
      <PageHead
        group="สินค้า"
        title="เส้นไดคัท"
        count="ทดลอง"
        sub="ใส่ลายลูกค้า → ตั้งขนาด/จำนวน → โหลดไฟล์ .ai เข้าเครื่องตัด · ยังไม่ผูกกับออเดอร์"
      />

      {/* ── ยังไม่มีลาย: บอกขั้นตอนทั้งหมดก่อน ── */}
      {!hasAny && (
        <div className="dkb-g mt-4 p-4 sm:p-6">
          {dropZone(true)}
          {errBox}
          <ol className="mt-5 grid gap-3 sm:grid-cols-3">
            {(
              [
                ["ใส่ลาย", "PNG พื้นใส ระบบลากเส้นตัดรอบลายให้เอง"],
                ["ตั้งขนาด + จำนวน", "บอกความกว้างงานจริง และจำนวนชิ้นต่อลาย"],
                ["โหลดไฟล์ .ai", "ได้ลาย + เส้นตัด CutContour จัดลงแผ่นพร้อมตัด"],
              ] as const
            ).map(([t, d], i) => (
              <li key={t} className="flex gap-3">
                <StepNo n={i + 1} />
                <span>
                  <b className="block text-[14px]" style={{ color: "var(--dk-navy)" }}>{t}</b>
                  <span className="text-[12.5px]" style={{ color: "var(--dk-navy-soft)" }}>{d}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {hasAny && (
        <>
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
            {/* ── ซ้าย: ภาพตัวอย่าง (ของที่จะได้จริง) ── */}
            <div className="dkb-g p-4 lg:sticky lg:top-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-xl p-0.5" style={{ background: "rgba(255,255,255,.6)", boxShadow: "inset 0 0 0 1px var(--dk-hair)" }}>
                  {(
                    [
                      ["sheet", "ทั้งแผ่น"],
                      ["piece", "ซูมทีละลาย"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setView(id)}
                      aria-pressed={view === id}
                      className={`min-h-[40px] rounded-[10px] px-4 text-[13px] font-bold transition ${
                        view === id ? "bg-[color:var(--dk-navy)] text-white" : "text-[color:var(--dk-navy-soft)]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {view === "sheet" && layout && (
                  <div className="ml-auto flex items-baseline gap-3 tabular-nums" style={{ color: "var(--dk-navy)" }}>
                    <span><b className="text-[1.15rem]">{totalPieces}</b> <small style={{ color: "var(--dk-faint)" }}>ชิ้น</small></span>
                    <span><b className="text-[1.15rem]">{sheetCount}</b> <small style={{ color: "var(--dk-faint)" }}>แผ่น</small></span>
                    <span><b className="text-[1.15rem]">{usePct.toFixed(0)}%</b> <small style={{ color: "var(--dk-faint)" }}>ใช้พื้นที่</small></span>
                  </div>
                )}
                {view === "piece" && result && (
                  <span className="ml-auto text-[12.5px] tabular-nums" style={{ color: "var(--dk-navy-soft)" }}>
                    <b style={{ color: "var(--dk-navy)" }}>{sel?.name}</b> · งานจริง {result.widthMm.toFixed(1)} × {result.heightMm.toFixed(1)} มม.
                  </span>
                )}
              </div>

              {view === "sheet" && sheetCount > 1 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {layout!.sheets.map((s, i) => (
                    <Choice key={i} on={curIdx === i} onClick={() => setSheetIdx(i)}>
                      แผ่น {i + 1} · {s.length} ชิ้น
                    </Choice>
                  ))}
                </div>
              )}

              <div
                className="mt-3 overflow-auto rounded-[18px]"
                style={{ boxShadow: "inset 0 0 0 1px var(--dk-hair)", background: view === "sheet" ? "var(--dk-sky)" : undefined, padding: view === "sheet" ? 12 : 0 }}
              >
                <canvas ref={previewRef} className="mx-auto block h-auto max-w-full" style={view === "sheet" ? { boxShadow: "0 2px 10px rgba(15,23,42,.12)" } : undefined} />
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]" style={{ color: "var(--dk-navy-soft)" }}>
                <span className="inline-flex items-center gap-1.5">
                  <i className="inline-block h-0.5 w-5 rounded" style={{ background: CUT_INK }} /> เส้นสีบานเย็น = แนวที่เครื่องจะตัด
                </span>
                {view === "piece" && (
                  <label className="inline-flex cursor-pointer items-center gap-1.5">
                    <input type="checkbox" checked={showAnchors} onChange={(e) => setShowAnchors(e.target.checked)} className="h-4 w-4" style={{ accentColor: "var(--dk-blue-deep)" }} />
                    โชว์จุดแองเคอร์
                  </label>
                )}
                {view === "piece" && result && (
                  <span className="tabular-nums">
                    {result.pieces} ชิ้น{result.innerHoles > 0 ? ` · รูตัดทะลุ ${result.innerHoles}` : ""} · {result.anchors.toLocaleString("th-TH")} จุด
                  </span>
                )}
              </div>

              <LayersPanel
                art={layerArt}
                cut={layerCut}
                onArt={() => setLayerArt(!layerArt)}
                onCut={() => setLayerCut(!layerCut)}
                hi={hiPiece}
                onHi={setHiPiece}
                items={
                  view === "sheet"
                    ? curSheet.map((p) => {
                        const d = designs.find((x) => x.id === p.id);
                        return { name: d?.name ?? "", thumb: d?.thumb ?? "", rot: p.rot, hole: !!results[p.id]?.hole };
                      })
                    : sel && result
                      ? [{ name: sel.name, thumb: sel.thumb, rot: false, hole: !!result.hole }]
                      : []
                }
              />

              {view === "piece" && result && result.warnings.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {result.warnings.map((warn, i) => (
                    <li key={i} className="rounded-[14px] px-3 py-2 text-[12.5px] font-semibold" style={{ background: "var(--dk-yolk-wash)", color: "var(--dk-yolk-ink)" }}>
                      {warn}
                    </li>
                  ))}
                </ul>
              )}
              {layout && layout.tooBig.length > 0 && (
                <p className="mt-3 rounded-[14px] px-3 py-2 text-[12.5px] font-semibold" style={{ background: "var(--dk-coral-wash)", color: "var(--dk-coral-ink)" }}>
                  ลายใหญ่กว่าแผ่น วางไม่ได้: {layout.tooBig.map((id) => designs.find((d) => d.id === id)?.name).join(", ")} — ลดความกว้างลาย หรือเลือกแผ่นที่ใหญ่ขึ้น
                </p>
              )}
            </div>

            {/* ── ขวา: ทำตามลำดับ 1 → 2 → 3 ── */}
            <div className="space-y-4">
              <Step n={1} title="ลายที่จะตัด" note={`${designs.length} ลาย`}>
                <ul className="space-y-2">
                  {designs.map((d) => {
                    const r = results[d.id];
                    const placed = layout?.placed[d.id];
                    const want = Number(d.qty) || 0;
                    const isSel = sel?.id === d.id;
                    const bw = r ? r.bounds.x1 - r.bounds.x0 : 0;
                    const bh = r ? r.bounds.y1 - r.bounds.y0 : 0;
                    const fit = r ? Math.max(gridFit(bw, bh, sheet), allowRotate ? gridFit(bh, bw, sheet) : 0) : 0;
                    const short = want > 0 && placed !== undefined && placed < want;
                    return (
                      <li
                        key={d.id}
                        onClick={() => setSelId(d.id)}
                        className="cursor-pointer rounded-[14px] p-2 transition"
                        style={{
                          background: isSel ? "var(--dk-sky)" : "rgba(255,255,255,.6)",
                          boxShadow: isSel ? "inset 0 0 0 1.5px var(--dk-blue)" : "inset 0 0 0 1px var(--dk-hair)",
                        }}
                      >
                        <div className="flex items-center gap-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={d.thumb} alt="" className="h-11 w-11 shrink-0 rounded-lg bg-white object-contain" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[13px] font-bold" style={{ color: "var(--dk-navy)" }}>{d.name}</div>
                            <div className="text-[11.5px] tabular-nums" style={{ color: "var(--dk-faint)" }}>
                              {r ? `${bw.toFixed(1)} × ${bh.toFixed(1)} มม. รวมเส้นตัด · เต็มแผ่นได้ ${fit} ชิ้น` : "กำลังคำนวณเส้น…"}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeDesign(d.id);
                            }}
                            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[18px] leading-none hover:bg-white"
                            style={{ color: "var(--dk-faint)" }}
                            title="เอาลายนี้ออก"
                            aria-label={`เอา ${d.name} ออก`}
                          >
                            ×
                          </button>
                        </div>
                        <div className="mt-2 grid grid-cols-[1fr_1fr_auto] items-end gap-2" onClick={(e) => e.stopPropagation()}>
                          <NumBox label="กว้างงานจริง" unit="มม." value={d.widthMm} onChange={(v) => patchDesign(d.id, { widthMm: v })} />
                          <NumBox
                            label="จำนวน"
                            unit="ชิ้น"
                            int
                            placeholder="เติมเต็ม"
                            value={d.qty === "0" ? "" : d.qty}
                            onChange={(v) => patchDesign(d.id, { qty: v || "0" })}
                          />
                          <span
                            className="mb-1 min-w-[64px] rounded-lg px-2 py-1.5 text-center text-[12px] font-bold tabular-nums"
                            style={
                              placed === undefined
                                ? { color: "var(--dk-faint)" }
                                : short || placed === 0
                                  ? { background: "var(--dk-coral-wash)", color: "var(--dk-coral-ink)" }
                                  : { background: "var(--dk-mint-wash)", color: "var(--dk-mint-ink)" }
                            }
                            title={want > 0 ? "วางได้ / ที่สั่ง" : "จำนวน 0 = เติมที่ว่างที่เหลือบนแผ่น"}
                          >
                            {placed === undefined ? "—" : want > 0 ? `${short ? "⚠ " : "✓ "}${placed}/${want}` : `✓ ${placed}`}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-2">{dropZone(false)}</div>
                {errBox}
                <p className="mt-2 text-[11.5px]" style={{ color: "var(--dk-faint)" }}>
                  จำนวนว่าง = เติมที่ว่างที่เหลือให้เต็มแผ่น · ใส่ตัวเลข = วางเท่านั้นชิ้น เกินแผ่นขึ้นแผ่นใหม่ให้เอง
                </p>
              </Step>

              <Step n={2} title="เส้นตัด" note="ใช้กับทุกลาย">
                <div className="text-[12px] font-semibold" style={{ color: "var(--dk-navy-soft)" }}>ตัดเผื่อรอบลาย</div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {["1", "1.5", "2", "3"].map((v) => (
                    <Choice key={v} on={offsetMm === v} onClick={() => setOffsetMm(v)}>
                      {v} มม.{v === "2" ? " (ร้าน)" : ""}
                    </Choice>
                  ))}
                  <span className="w-[86px]">
                    <NumBox value={offsetMm} unit="มม." onChange={setOffsetMm} />
                  </span>
                </div>

                <div className="mt-4 flex items-center justify-between gap-2">
                  <span className="text-[13px] font-bold" style={{ color: "var(--dk-navy)" }}>หูร้อยห่วง</span>
                  <button
                    type="button"
                    onClick={() => setRingOn(!ringOn)}
                    aria-pressed={ringOn}
                    className={`min-h-[40px] rounded-xl px-4 text-[13px] font-bold transition ${
                      ringOn ? "bg-[color:var(--dk-navy)] text-white" : "bg-white/70 text-[color:var(--dk-navy-soft)] ring-1 ring-[color:var(--dk-hair)]"
                    }`}
                  >
                    {ringOn ? "มีหูร้อย ✓" : "ไม่มีหูร้อย"}
                  </button>
                </div>
                {ringOn && (
                  <div className="mt-2 flex items-center gap-3">
                    <RingPicker pos={ringPos} onPick={setRingPos} />
                    <span className="text-[12px]" style={{ color: "var(--dk-navy-soft)" }}>
                      กดจุดรอบชิ้นงาน
                      <br />
                      เพื่อเลือกตำแหน่งหูร้อย
                      <br />
                      <b style={{ color: "var(--dk-navy)" }}>{RING_LABEL[ringPos]}</b>
                    </span>
                  </div>
                )}

                <More title="ปรับละเอียด (ไม่ต้องแตะก็ได้)">
                  <Slider
                    label={`เก็บขอบให้เรียบ: ${smoothMm} มม.`}
                    min={0}
                    max={5}
                    step={0.1}
                    value={smoothMm}
                    onChange={setSmoothMm}
                    hint="0 = วิ่งตามหยักลายเป๊ะ · มาก = ลื่น กลืนร่องแคบระหว่างตัวอักษร"
                  />
                  <Slider
                    label={`ความละเอียดเส้นโค้ง: ±${curveTol} มม.`}
                    min={0.03}
                    max={0.6}
                    step={0.01}
                    value={curveTol}
                    onChange={setCurveTol}
                    hint="น้อย = เกาะลายแน่นแต่จุดเยอะ · มาก = จุดน้อย แก้ต่อใน Illustrator ง่าย"
                  />
                  <Slider
                    label={`ความไวขอบลาย: alpha ≥ ${alphaThreshold}`}
                    min={1}
                    max={200}
                    step={1}
                    value={alphaThreshold}
                    onChange={setAlphaThreshold}
                    hint="ลายขอบฟุ้ง/มีเงา ถ้าเส้นตัดกินเงามาด้วย เลื่อนไปทางขวา"
                  />
                  <label className="flex cursor-pointer items-center gap-2 text-[12.5px] font-semibold" style={{ color: "var(--dk-navy-soft)" }}>
                    <input type="checkbox" checked={fillHoles} onChange={(e) => setFillHoles(e.target.checked)} className="h-4 w-4" style={{ accentColor: "var(--dk-blue-deep)" }} />
                    ปิดรูกลางลาย (ไม่ตัดทะลุช่องในตัวอักษร)
                  </label>
                  {ringOn && (
                    <>
                      <div className="grid grid-cols-3 gap-2">
                        <NumBox label="แท็บกลม" unit="มม." value={tabDia} onChange={setTabDia} />
                        <NumBox label="รูเจาะ" unit="มม." value={ringDia} onChange={setRingDia} />
                        <NumBox label="ซ้อนงาน" unit="มม." value={ringOverlap} onChange={setRingOverlap} />
                      </div>
                      <p className="text-[11.5px]" style={{ color: "var(--dk-faint)" }}>
                        แท็บกลม 0 = ไม่ทำแท็บ เจาะรูบนตัวงานเลย · ซ้อนงาน = แท็บทับตัวงานกี่ มม. ให้เป็นชิ้นเดียวกัน
                      </p>
                    </>
                  )}
                </More>
              </Step>

              <Step n={3} title="แผ่นงาน">
                <div className="grid grid-cols-2 gap-1.5">
                  {SHEET_PRESETS.map((p) => (
                    <Choice key={p.id} on={preset === p.id} onClick={() => applyPreset(p.id)}>
                      {p.label}
                    </Choice>
                  ))}
                </div>
                {preset === "custom" && (
                  <p className="mt-1.5 text-[12px] tabular-nums" style={{ color: "var(--dk-navy-soft)" }}>
                    ขนาดกำหนดเอง {sheetW} × {sheetH} มม.
                  </p>
                )}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <NumBox label="ห่างกัน (เส้นตัด↔เส้นตัด)" unit="มม." value={gap} onChange={setGap} />
                  <label className="flex min-h-[44px] cursor-pointer items-center gap-2 self-end rounded-xl px-2 text-[12.5px] font-semibold" style={{ color: "var(--dk-navy-soft)" }}>
                    <input type="checkbox" checked={allowRotate} onChange={(e) => setAllowRotate(e.target.checked)} className="h-4 w-4" style={{ accentColor: "var(--dk-blue-deep)" }} />
                    หมุน 90° ถ้าวางได้มากกว่า
                  </label>
                </div>
                <More title="กำหนดขนาดแผ่น / ขอบเอง">
                  <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                    <NumBox label="กว้างแผ่น" unit="มม." value={sheetW} onChange={(v) => { setSheetW(v); setPreset("custom"); }} />
                    <button
                      type="button"
                      onClick={() => {
                        setSheetW(sheetH);
                        setSheetH(sheetW);
                        setMarginX(marginY);
                        setMarginY(marginX);
                      }}
                      className="mb-0.5 h-11 rounded-xl bg-white/70 px-3 text-[15px] font-bold ring-1 ring-[color:var(--dk-hair)] hover:bg-white"
                      style={{ color: "var(--dk-navy-soft)" }}
                      title="สลับแนวตั้ง/แนวนอน"
                    >
                      ⇄
                    </button>
                    <NumBox label="สูงแผ่น" unit="มม." value={sheetH} onChange={(v) => { setSheetH(v); setPreset("custom"); }} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <NumBox label="ขอบซ้าย-ขวา" unit="มม." value={marginX} onChange={setMarginX} />
                    <NumBox label="ขอบบน-ล่าง" unit="มม." value={marginY} onChange={setMarginY} />
                  </div>
                </More>
              </Step>
            </div>
          </div>

          {/* ── แถบโหลดไฟล์ ติดล่างจอ — ปลายทางของทุกขั้น ── */}
          <div className="dkb-g sticky bottom-3 z-20 mt-4 flex flex-wrap items-center gap-2 p-3" style={{ boxShadow: "0 10px 30px rgba(15,23,42,.16)" }}>
            <div className="mr-auto flex min-w-0 items-center gap-3">
              <StepNo n={4} />
              <div className="min-w-0">
                <b className="block text-[14px]" style={{ color: "var(--dk-navy)" }}>โหลดไฟล์เข้าเครื่องตัด</b>
                <span className="hidden text-[11.5px] sm:block" style={{ color: "var(--dk-faint)" }}>
                  .ai = ลายขนาดจริง + เส้นตัดสี spot <b>CutContour</b> · เปิดใน Illustrator/FineCut ได้เลย
                </span>
              </div>
            </div>
            {sheetGroups.map((g) => (
              <Btn key={g.first} tone="yolk" onClick={() => downloadSheetAi(g.sheet, g.first + 1)} disabled={busy || !g.sheet.length}>
                {busy
                  ? "กำลังสร้าง…"
                  : `⬇ .ai ${sheetGroups.length > 1 || g.count > 1 ? `แผ่น ${g.first + 1}${g.count > 1 ? `–${g.first + g.count}` : ""}` : "ทั้งแผ่น"} · ${g.sheet.length} ชิ้น${g.count > 1 ? ` ×${g.count}` : ""}`}
              </Btn>
            ))}
            <div className="flex gap-2">
              <Btn small onClick={downloadAi} disabled={!result || busy} title="ไฟล์ .ai ของลายที่เลือกอยู่ ชิ้นเดียว">
                .ai ลายนี้ชิ้นเดียว
              </Btn>
              <Btn small onClick={downloadSvg} disabled={!result} title="เส้นตัดอย่างเดียว ไม่มีรูปลาย">
                .svg เส้นอย่างเดียว
              </Btn>
            </div>
          </div>
        </>
      )}
    </PageShell>
  );
}

/** ไอคอนตา เปิด/ปิดเลเยอร์ */
function Eye({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" />
      {on ? <circle cx="12" cy="12" r="3" /> : <path d="M4 4l16 16" />}
    </svg>
  );
}

/**
 * แผงเลเยอร์แบบ Illustrator/VectorCraft — ตรงกับเลเยอร์ในไฟล์ .ai ที่โหลด
 * (CutContour อยู่บน: เส้นตัดทีละชิ้น · Art อยู่ล่าง: รูปลาย) · ชี้/คลิกแถว = ไฮไลต์ชิ้นบนแผ่น
 */
function LayersPanel({
  art,
  cut,
  onArt,
  onCut,
  hi,
  onHi,
  items,
}: {
  art: boolean;
  cut: boolean;
  onArt: () => void;
  onCut: () => void;
  hi: number | null;
  onHi: (i: number | null) => void;
  items: { name: string; thumb: string; rot: boolean; hole: boolean }[];
}) {
  const [open, setOpen] = useState<{ cut: boolean; art: boolean }>({ cut: true, art: false });
  const layers = [
    { key: "cut" as const, name: "CutContour", color: CUT_INK, on: cut, toggle: onCut, kind: "<Path>", note: "เส้นตัด · สี spot" },
    { key: "art" as const, name: "Art", color: "var(--dk-blue)", on: art, toggle: onArt, kind: "<Image>", note: "รูปลาย" },
  ];
  return (
    <section className="mt-3 overflow-hidden rounded-[14px] bg-white/70" style={{ boxShadow: "inset 0 0 0 1px var(--dk-hair)" }}>
      <div className="flex items-center gap-2 px-3 py-2">
        <b className="text-[13px]" style={{ color: "var(--dk-navy)" }}>เลเยอร์</b>
        <span className="text-[11.5px]" style={{ color: "var(--dk-faint)" }}>
          เหมือนในไฟล์ .ai · ปิดตา = ซ่อนบนจออย่างเดียว ไฟล์ที่โหลดยังมีครบ
        </span>
      </div>
      <ul onMouseLeave={() => onHi(null)}>
        {layers.map((L) => (
          <li key={L.key} style={{ borderTop: "1px solid var(--dk-hair)" }}>
            <div className="flex min-h-[44px] items-center gap-1 pr-3" style={{ opacity: L.on ? 1 : 0.55 }}>
              <button
                type="button"
                onClick={L.toggle}
                aria-pressed={L.on}
                aria-label={`${L.on ? "ซ่อน" : "แสดง"}เลเยอร์ ${L.name}`}
                title={L.on ? "ซ่อนบนจอ" : "แสดง"}
                className="grid h-11 w-11 shrink-0 place-items-center"
                style={{ color: "var(--dk-navy-soft)" }}
              >
                <Eye on={L.on} />
              </button>
              <span className="h-6 w-1 shrink-0 rounded" style={{ background: L.color }} />
              <button
                type="button"
                onClick={() => setOpen((o) => ({ ...o, [L.key]: !o[L.key] }))}
                aria-expanded={open[L.key]}
                className="flex min-h-[44px] flex-1 items-center gap-2 pl-1 text-left"
              >
                <span className="w-3 text-[11px] transition" style={{ color: "var(--dk-faint)", transform: open[L.key] ? "rotate(90deg)" : undefined }}>▸</span>
                <b className="text-[13px]" style={{ color: "var(--dk-navy)" }}>{L.name}</b>
                <span className="text-[11.5px]" style={{ color: "var(--dk-faint)" }}>{L.note}</span>
                <span className="ml-auto text-[11.5px] tabular-nums" style={{ color: "var(--dk-navy-soft)" }}>{items.length} ชิ้น</span>
              </button>
            </div>
            {open[L.key] && (
              <ul className="max-h-[220px] overflow-auto pb-1">
                {items.map((it, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      onMouseEnter={() => onHi(i)}
                      onFocus={() => onHi(i)}
                      onClick={() => onHi(hi === i ? null : i)}
                      className="flex min-h-[36px] w-full items-center gap-2 py-1 pl-14 pr-3 text-left text-[12.5px] transition"
                      style={{ background: hi === i ? "var(--dk-sky)" : undefined, color: "var(--dk-navy)", opacity: L.on ? 1 : 0.55 }}
                    >
                      {L.key === "art" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={it.thumb} alt="" className="h-7 w-7 shrink-0 rounded bg-white object-contain" style={{ transform: it.rot ? "rotate(90deg)" : undefined }} />
                      ) : (
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded bg-white" style={{ boxShadow: `inset 0 0 0 1.5px ${CUT_INK}` }}>
                          <span className="block h-3.5 w-3.5 rounded-[4px]" style={{ boxShadow: `inset 0 0 0 1.5px ${CUT_INK}` }} />
                        </span>
                      )}
                      <span className="font-semibold">{L.kind}</span>
                      <span className="tabular-nums" style={{ color: "var(--dk-faint)" }}>#{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate" style={{ color: "var(--dk-navy-soft)" }}>{it.name}</span>
                      {it.rot && <span className="text-[11px]" style={{ color: "var(--dk-faint)" }}>หมุน 90°</span>}
                      {L.key === "cut" && it.hole && <span className="text-[11px]" style={{ color: "var(--dk-faint)" }}>+ รูร้อย</span>}
                    </button>
                  </li>
                ))}
                {!items.length && <li className="py-2 pl-14 text-[12px]" style={{ color: "var(--dk-faint)" }}>ยังไม่มีชิ้นงาน</li>}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

const RING_LABEL: Record<RingTab["position"], string> = {
  left: "ซ้าย",
  right: "ขวา",
  "top-center": "บนกลาง",
  "top-left": "มุมซ้ายบน",
  "top-right": "มุมขวาบน",
};

/** เลขขั้นตอนในวงกลม */
function StepNo({ n }: { n: number }) {
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[14px] font-bold text-white" style={{ background: "var(--dk-navy)" }}>
      {n}
    </span>
  );
}

/** การ์ดขั้นตอน — หัวเลข + ชื่อ */
function Step({ n, title, note, children }: { n: number; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="dkb-g p-4">
      <div className="flex items-center gap-2.5">
        <StepNo n={n} />
        <h2 className="dkb-h2 text-[1.08rem]" style={{ color: "var(--dk-navy)" }}>{title}</h2>
        {note && <span className="ml-auto text-[12px]" style={{ color: "var(--dk-faint)" }}>{note}</span>}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** ปุ่มตัวเลือก (เลือกได้ทีละอัน) */
function Choice({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`min-h-[40px] rounded-xl px-3 text-[12.5px] font-semibold transition ${
        on ? "bg-[color:var(--dk-navy)] text-white" : "bg-white/70 text-[color:var(--dk-navy-soft)] ring-1 ring-[color:var(--dk-hair)] hover:bg-white"
      }`}
    >
      {children}
    </button>
  );
}

/** ช่องตัวเลขสูง 44px + หน่วยต่อท้าย */
function NumBox({
  label,
  unit,
  value,
  onChange,
  int,
  placeholder,
}: {
  label?: string;
  unit?: string;
  value: string;
  onChange: (v: string) => void;
  int?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block min-w-0">
      {label && <span className="block truncate text-[11.5px] font-semibold" style={{ color: "var(--dk-navy-soft)" }}>{label}</span>}
      <span className="mt-1 flex h-11 items-center rounded-xl bg-white ring-1 ring-slate-200 focus-within:ring-2 focus-within:ring-amber-300">
        <input
          value={value}
          onChange={(e) => onChange(int ? e.target.value.replace(/\D/g, "") : num(e.target.value))}
          inputMode={int ? "numeric" : "decimal"}
          placeholder={placeholder}
          className="w-full min-w-0 bg-transparent px-3 text-[15px] tabular-nums focus:outline-none"
          style={{ color: "var(--dk-navy)" }}
        />
        {unit && <span className="shrink-0 pr-3 text-[12px]" style={{ color: "var(--dk-faint)" }}>{unit}</span>}
      </span>
    </label>
  );
}

function Slider({
  label,
  hint,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-[12px] font-semibold tabular-nums" style={{ color: "var(--dk-navy-soft)" }}>
      {label}
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 h-6 w-full" style={{ accentColor: "var(--dk-blue-deep)" }} />
      <span className="block text-[11.5px] font-normal" style={{ color: "var(--dk-faint)" }}>{hint}</span>
    </label>
  );
}

/** ส่วนพับเก็บ — ของที่นาน ๆ แตะที */
function More({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group mt-4 rounded-xl" style={{ boxShadow: "inset 0 0 0 1px var(--dk-hair)" }}>
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 px-3 text-[12.5px] font-semibold" style={{ color: "var(--dk-navy-soft)" }}>
        <span className="transition group-open:rotate-90">▸</span>
        {title}
      </summary>
      <div className="space-y-3 px-3 pb-3">{children}</div>
    </details>
  );
}

/** เลือกตำแหน่งหูร้อยจากภาพ — จุดรอบชิ้นงาน */
function RingPicker({ pos, onPick }: { pos: RingTab["position"]; onPick: (p: RingTab["position"]) => void }) {
  const spots: [RingTab["position"], string][] = [
    ["top-left", "left-0 top-0"],
    ["top-center", "left-1/2 top-0 -translate-x-1/2"],
    ["top-right", "right-0 top-0"],
    ["left", "left-0 top-1/2 -translate-y-1/2"],
    ["right", "right-0 top-1/2 -translate-y-1/2"],
  ];
  return (
    <div className="relative h-[112px] w-[150px] shrink-0">
      <div className="absolute inset-[18px] rounded-2xl" style={{ background: "var(--dk-sky)", boxShadow: "inset 0 0 0 1.5px var(--dk-sky-300)" }}>
        <span className="grid h-full place-items-center text-[11px] font-semibold" style={{ color: "var(--dk-faint)" }}>ชิ้นงาน</span>
      </div>
      {spots.map(([id, cls]) => (
        <button
          key={id}
          type="button"
          onClick={() => onPick(id)}
          aria-pressed={pos === id}
          aria-label={`หูร้อย${RING_LABEL[id]}`}
          title={RING_LABEL[id]}
          className={`absolute grid h-9 w-9 place-items-center rounded-full transition ${cls}`}
          style={
            pos === id
              ? { background: "var(--dk-navy)", boxShadow: "0 0 0 3px var(--dk-sky)" }
              : { background: "white", boxShadow: "inset 0 0 0 1.5px var(--dk-sky-300)" }
          }
        >
          <span className="block h-2.5 w-2.5 rounded-full" style={{ background: pos === id ? "white" : "var(--dk-sky-300)" }} />
        </button>
      ))}
    </div>
  );
}

export default function DiecutLabPage() {
  return (
    <RequirePerm perm="products.manage">
      <DiecutLabInner />
    </RequirePerm>
  );
}
