"use client";

/**
 * แท็บ "ตัดภาพ" — ตัดวัตถุออกจากพื้นหลังด้วยเส้นโค้งคมแบบ pen tool
 *
 * 1) คนชี้ว่าเอาอะไร (คลิกจุดเอา/ไม่เอา · ลากกรอบ) → AI (SAM 2.1) ตัดตามที่ชี้ ไม่ต้องเดาเอง
 *    + "เก็บขอบละเอียด" = ISNet ดูเฉพาะรอบวัตถุ แล้วเอามาแทนเฉพาะแถบขอบ
 * 2) เกลามาสก์เป็นเส้นเบซิเยร์ (lib/cutout) → แก้จุดแองเคอร์/ด้ามโค้ง หรือวาดเส้นเองได้แบบ Illustrator (lib/cutout-path)
 * 3) ใช้เส้นนั้นตัดรูปความละเอียดเต็ม = ขอบคมทุกขนาด
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Btn } from "@/components/admin/ui";
import {
  buildCutout,
  cutoutSvgPath,
  hasTransparency,
  maskBounds,
  maskFromAlphaChannel,
  maskFromBackgroundColor,
  refineEdges,
  type CutoutCurve,
  type CutoutResult,
} from "@/lib/cutout";
import { aiMask, aiMaskInBox } from "@/lib/cutout-ai";
import { samMask, samPrepare, type SamBox, type SamImage, type SamPoint } from "@/lib/cutout-sam";
import {
  anchorCount,
  clonePaths,
  curvesToPaths,
  hitTest,
  insertNode,
  isCorner,
  moveHandle,
  moveNode,
  pathsBounds,
  pathsToCurves,
  removeNode,
  toggleCorner,
  type EditPath,
} from "@/lib/cutout-path";
import { Choice, More, Slider, Step, StepNo } from "./parts";

/** ขนาดที่ใช้คำนวณมาสก์/เส้น (ด้านยาวสุด) — เส้นที่ได้ขยายไปตัดรูปเต็มความละเอียด */
const WORK_MAX = 2048;
/** ไฟล์ส่งออกใหญ่สุดต่อด้าน (กันแคนวาสเกินลิมิตเบราว์เซอร์) */
const EXPORT_MAX = 8000;
/** สีบนจอ (ไม่ใช่สีธีม — ต้องตัดกับทุกภาพ) */
const PATH_INK = "#e2007a";
const HANDLE_INK = "#0ea5e9";
const KEEP_INK = "#16a34a";
const DROP_INK = "#dc2626";
/** สีทับส่วนที่ "ตัดทิ้ง" ตอนเลือก/แก้มาสก์ */
const DROP_RGBA: [number, number, number, number] = [239, 68, 68, 120];
/** ระยะจับจุด/ด้าม (พิกเซลจอ) */
const HIT_PX = 9;
const UNDO_MAX = 15;

type Source = "sam" | "ai" | "color" | "alpha";
/** tapDrop/tapAdd = แตะชิ้นไหน AI ลบ/เอาคืนทั้งชิ้น (โหมดง่าย) */
type Tool = "tapDrop" | "tapAdd" | "pick" | "box" | "keep" | "erase" | "edit" | "pen" | "view";
type Bg = "checker" | "white" | "black";

interface Pic {
  name: string;
  bmp: ImageBitmap;
  work: ImageData;
  /** work.width / bmp.width */
  scale: number;
  transparent: boolean;
}

/** สำเนาสำหรับปุ่มย้อน — เก็บทุกอย่างที่แก้ได้ */
interface Snap {
  mask: Uint8Array | null;
  manual: EditPath[] | null;
  points: SamPoint[];
  box: SamBox | null;
}

export default function CutoutTab({ onSendToDiecut }: { onSendToDiecut: (f: File) => void }) {
  const [pic, setPic] = useState<Pic | null>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const [source, setSource] = useState<Source | null>(null);
  const [colorTol, setColorTol] = useState("18");
  /** มาสก์ (ค่า 0–255 ขนาดเท่า work) — เก็บใน ref เพราะแปรงแก้ทีละพิกเซล */
  const maskRef = useRef<Uint8Array | null>(null);
  const [maskVer, setMaskVer] = useState(0);

  // ── คลิกเลือก (SAM) ──
  const samRef = useRef<{ pic: Pic; img: Promise<SamImage> } | null>(null);
  const samSeq = useRef(0);
  const [points, setPoints] = useState<SamPoint[]>([]);
  const [box, setBox] = useState<SamBox | null>(null);
  const [pickKeep, setPickKeep] = useState(true);
  const [pickSize, setPickSize] = useState<number | "auto">("auto");
  const [samInfo, setSamInfo] = useState<{ scores: number[]; picked: number } | null>(null);
  const [dragBox, setDragBox] = useState<SamBox | null>(null);

  // ── เส้นที่แก้เอง (null = ใช้เส้นอัตโนมัติจากมาสก์) ──
  const manualRef = useRef<EditPath[] | null>(null);
  const [manualVer, setManualVer] = useState(0);
  const [sel, setSel] = useState<{ pi: number; ni: number } | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);

  // ── แตะลบ/แตะเอาคืน: จำการแตะล่าสุดไว้ เปลี่ยนขนาดชิ้นที่ AI เลือกได้โดยไม่ต้องแตะใหม่ ──
  const lastTap = useRef<{ pt: SamPoint; add: boolean; base: Uint8Array | null } | null>(null);
  const [tapInfo, setTapInfo] = useState<{ picked: number; add: boolean } | null>(null);
  /** โหมดละเอียด = เครื่องมือ pen tool + ค่าเกลาเส้น (คนทั่วไปไม่ต้องเห็น) */
  const [pro, setProState] = useState(false);
  useEffect(() => {
    try {
      setProState(localStorage.getItem("cutout.pro") === "1");
    } catch {}
  }, []);
  const setPro = (v: boolean) => {
    setProState(v);
    try {
      localStorage.setItem("cutout.pro", v ? "1" : "0");
    } catch {}
  };

  // ── ย้อน ──
  const undoRef = useRef<Snap[]>([]);
  const [undoCount, setUndoCount] = useState(0);

  // ── ค่าเกลาเส้น ──
  const [level, setLevel] = useState("128");
  const [inset, setInset] = useState("1");
  const [smooth, setSmooth] = useState("1");
  const [tol, setTol] = useState("0.8");
  const [corners, setCorners] = useState(true);
  const [cornerDeg, setCornerDeg] = useState("55");
  const [fillHoles, setFillHoles] = useState(false);

  // ── มุมมอง ──
  const [tool, setTool] = useState<Tool>("pick");
  const [brush, setBrush] = useState("28");
  const [bg, setBg] = useState<Bg>("checker");
  const [showPath, setShowPath] = useState(true);
  const [showAnchors, setShowAnchors] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [cropTight, setCropTight] = useState(true);
  const [padPx, setPadPx] = useState("0");

  const [result, setResult] = useState<CutoutResult | null>(null);
  const cvRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [fitW, setFitW] = useState(800);

  /* ───────── ย้อน ───────── */

  const snap = useCallback(
    (): Snap => ({
      mask: maskRef.current ? Uint8Array.from(maskRef.current) : null,
      manual: manualRef.current ? clonePaths(manualRef.current) : null,
      points,
      box,
    }),
    [points, box]
  );
  const pushUndo = useCallback(() => {
    undoRef.current.push(snap());
    if (undoRef.current.length > UNDO_MAX) undoRef.current.shift();
    setUndoCount(undoRef.current.length);
  }, [snap]);
  const undo = useCallback(() => {
    const s = undoRef.current.pop();
    setUndoCount(undoRef.current.length);
    if (!s) return;
    lastTap.current = null;
    setTapInfo(null);
    maskRef.current = s.mask;
    manualRef.current = s.manual;
    setPoints(s.points);
    setBox(s.box);
    setSel(null);
    setMaskVer((v) => v + 1);
    setManualVer((v) => v + 1);
  }, []);

  /** มาสก์กำลังจะเปลี่ยน — เส้นที่แก้เองไว้จะใช้ไม่ได้แล้ว (ถามก่อนถ้าแก้ไปเยอะ) */
  const dropManual = useCallback((): boolean => {
    if (!manualRef.current) return true;
    if (!window.confirm("ทิ้งเส้นที่แก้จุดเองไว้ แล้วคำนวณเส้นใหม่จากที่เลือก? (กด ↶ ย้อน กลับมาได้)")) return false;
    manualRef.current = null;
    setSel(null);
    setManualVer((v) => v + 1);
    return true;
  }, []);

  /* ───────── เปิดไฟล์ ───────── */

  const openFile = async (f: File) => {
    setErr("");
    if (!/^image\//.test(f.type)) {
      setErr("ไฟล์นี้ไม่ใช่รูป — ใช้ JPG, PNG หรือ WEBP");
      return;
    }
    setBusy("กำลังเปิดรูป…");
    try {
      const bmp = await createImageBitmap(f);
      const scale = Math.min(1, WORK_MAX / Math.max(bmp.width, bmp.height));
      const w = Math.max(1, Math.round(bmp.width * scale));
      const h = Math.max(1, Math.round(bmp.height * scale));
      const cv = document.createElement("canvas");
      cv.width = w;
      cv.height = h;
      const ctx = cv.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(bmp, 0, 0, w, h);
      const work = ctx.getImageData(0, 0, w, h);
      const transparent = hasTransparency(work.data);
      const np: Pic = { name: f.name, bmp, work, scale: w / bmp.width, transparent };
      setPic((old) => {
        old?.bmp.close();
        return np;
      });
      samRef.current = null;
      undoRef.current = [];
      setUndoCount(0);
      manualRef.current = null;
      setManualVer((v) => v + 1);
      setSel(null);
      setPoints([]);
      setBox(null);
      setSamInfo(null);
      setPickSize("auto");
      setZoom(1);
      lastTap.current = null;
      setTapInfo(null);
      setTool("tapDrop");
      if (transparent) {
        // PNG ที่ไล่พื้นมาแล้ว แต่ขอบยังหยัก/ฟุ้ง → เกลาขอบใหม่จากช่องโปร่งเลย
        maskRef.current = maskFromAlphaChannel(work.data);
        setSource("alpha");
        setMaskVer((v) => v + 1);
        setBusy("");
        return;
      }
      maskRef.current = null;
      setSource(null);
      setMaskVer((v) => v + 1);
      // เปิดรูปแล้วลบพื้นหลังให้เลย — พื้นสีเรียบใช้วิธีสี (ทันที) · ภาพอื่นให้ AI
      const plain = plainBackground(work);
      if (plain) {
        const m = maskFromBackgroundColor(work.data, w, h, Number(colorTol) || 18);
        const fg = m.reduce((a, v) => a + (v >= 128 ? 1 : 0), 0) / m.length;
        if (fg > 0.01 && fg < 0.97) {
          maskRef.current = m;
          setSource("color");
          setMaskVer((v) => v + 1);
          setBusy("");
          return;
        }
      }
      setBusy("");
      void runAi(np, true);
    } catch {
      setErr("เปิดรูปไม่สำเร็จ — ลองบันทึกเป็น PNG/JPG ใหม่แล้วใส่อีกครั้ง");
      setBusy("");
    }
  };

  /* ───────── คลิกเลือก (SAM) ───────── */

  /** มาสก์ถูกแก้ทางอื่นแล้ว — ปุ่มเปลี่ยนขนาดชิ้นของการแตะล่าสุดใช้ไม่ได้ */
  const forgetTap = () => {
    lastTap.current = null;
    setTapInfo(null);
  };

  /** AI เลือกวัตถุ — อ่านภาพครั้งเดียวต่อรูป แล้วใช้ซ้ำทุกคลิก */
  const getSam = async (): Promise<SamImage> => {
    if (!pic) throw new Error("no pic");
    if (!samRef.current || samRef.current.pic !== pic) {
      const p = samPrepare(pic.work, (t) => setBusy(t));
      samRef.current = { pic, img: p };
      p.catch(() => {
        if (samRef.current?.img === p) samRef.current = null;
      });
    }
    const si = await samRef.current.img;
    setBusy("");
    return si;
  };

  /**
   * แตะลบ/แตะเอาคืน: AI หาชิ้นที่แตะ แล้วหักออกจาก (หรือรวมเข้า) มาสก์เดิม
   * size = ขนาดชิ้น (0 ใหญ่ … 2 เล็ก) · "best" = ให้ AI เลือก
   */
  async function applyTap(size: number | "best") {
    const t = lastTap.current;
    if (!pic || !t) return;
    const seq = ++samSeq.current;
    setErr("");
    try {
      const si = await getSam();
      if (seq !== samSeq.current) return;
      const r = await samMask(si, [{ ...t.pt, keep: true }], null, size);
      if (seq !== samSeq.current) return;
      const n = r.mask.length;
      const out = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        const b = t.base ? t.base[i] : t.add ? 0 : 255;
        out[i] = t.add ? Math.max(b, r.mask[i]) : Math.min(b, 255 - r.mask[i]);
      }
      maskRef.current = out;
      setSource((s) => s ?? "sam");
      setTapInfo({ picked: r.picked, add: t.add });
      setMaskVer((v) => v + 1);
    } catch (e) {
      console.error(e);
      setErr("AI หาชิ้นที่แตะไม่สำเร็จ (โหลดไม่ได้/เน็ตหลุด) — แตะอีกครั้ง หรือใช้ 🧽 ระบายลบ แทน");
    } finally {
      if (seq === samSeq.current) setBusy("");
    }
  }

  /** ถอดมาสก์ใหม่ตามจุด/กรอบชุดล่าสุด (คลิกรัว ๆ เอาผลของคำขอล่าสุดเท่านั้น) */
  const runSam = useCallback(
    async (pts: SamPoint[], bx: SamBox | null, size: number | "auto") => {
      if (!pic) return;
      const seq = ++samSeq.current;
      if (!pts.length && !bx) {
        maskRef.current = null;
        setSamInfo(null);
        setMaskVer((v) => v + 1);
        return;
      }
      setErr("");
      try {
        const si = await getSam();
        if (seq !== samSeq.current) return;
        // จุดเดียวไม่มีกรอบ = กำกวม (ทั้งชิ้น/บางส่วน) → เริ่มที่ "ใหญ่สุด" ให้เลือกเล็กลงได้ · จุดหลายจุด/มีกรอบ = เชื่อคะแนน AI
        const pick = size !== "auto" ? size : pts.length === 1 && !bx ? 0 : "best";
        const r = await samMask(si, pts, bx, pick);
        if (seq !== samSeq.current) return;
        maskRef.current = r.mask;
        setSamInfo({ scores: r.scores, picked: r.picked });
        setSource("sam");
        setMaskVer((v) => v + 1);
      } catch (e) {
        console.error(e);
        setErr("AI เลือกวัตถุทำงานไม่สำเร็จ (โหลดไม่ได้/เน็ตหลุด) — ลองคลิกอีกครั้ง หรือใช้ “AI ทั้งภาพ” แทน");
      } finally {
        if (seq === samSeq.current) setBusy("");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- getSam ผูกกับ pic อยู่แล้ว
    [pic]
  );

  const setSelection = (pts: SamPoint[], bx: SamBox | null, size: number | "auto" = pickSize) => {
    if (!dropManual()) return;
    pushUndo();
    forgetTap();
    setPoints(pts);
    setBox(bx);
    void runSam(pts, bx, size);
  };

  /* ───────── วิธีอื่น ๆ ───────── */

  async function runAi(p: Pic | null = pic, auto = false) {
    if (!p || (!auto && !dropManual())) return;
    setErr("");
    try {
      const { mask } = await aiMask(p.work, (pr) => setBusy(pr.text));
      if (!auto) pushUndo();
      forgetTap();
      maskRef.current = mask;
      setPoints([]);
      setBox(null);
      setSamInfo(null);
      setSource("ai");
      setMaskVer((v) => v + 1);
    } catch (e) {
      console.error(e);
      setErr("AI ลบพื้นหลังไม่สำเร็จ (โหลดไม่ได้ หรือเน็ตหลุดระหว่างโหลด) — กด 🪄 ลบพื้นหลังอัตโนมัติ อีกครั้ง หรือแตะส่วนที่จะลบทีละชิ้น");
    } finally {
      setBusy("");
    }
  }

  /** ขอบละเอียด: ISNet ดูเฉพาะรอบวัตถุ (ครอปมาใกล้ ๆ) แล้วแทนเฉพาะแถบขอบของมาสก์เดิม */
  async function refine() {
    const m = maskRef.current;
    if (!pic || !m || !dropManual()) return;
    const { width: w, height: h } = pic.work;
    const b = maskBounds(m, w, h);
    if (!b) return;
    setErr("");
    try {
      const pad = Math.max(16, Math.max(b.x1 - b.x0, b.y1 - b.y0) * 0.08);
      const detail = await aiMaskInBox(pic.work, { x0: b.x0 - pad, y0: b.y0 - pad, x1: b.x1 + pad, y1: b.y1 + pad }, (p) => setBusy(p.text));
      pushUndo();
      const band = Math.max(4, Math.round(Math.max(b.x1 - b.x0, b.y1 - b.y0) * 0.015));
      maskRef.current = refineEdges(m, detail, w, h, band);
      setMaskVer((v) => v + 1);
    } catch (e) {
      console.error(e);
      setErr("เก็บขอบละเอียดไม่สำเร็จ — ลองใหม่อีกครั้ง");
    } finally {
      setBusy("");
    }
  }

  function runColor(tolStr = colorTol) {
    if (!pic || !dropManual()) return;
    pushUndo();
    forgetTap();
    maskRef.current = maskFromBackgroundColor(pic.work.data, pic.work.width, pic.work.height, Number(tolStr) || 0);
    setPoints([]);
    setBox(null);
    setSamInfo(null);
    setSource("color");
    setMaskVer((v) => v + 1);
  }

  function runAlpha() {
    if (!pic || !dropManual()) return;
    pushUndo();
    forgetTap();
    maskRef.current = maskFromAlphaChannel(pic.work.data);
    setPoints([]);
    setBox(null);
    setSamInfo(null);
    setSource("alpha");
    setMaskVer((v) => v + 1);
  }

  /* ───────── คำนวณเส้นอัตโนมัติ ───────── */

  useEffect(() => {
    const m = maskRef.current;
    if (!pic || !m) {
      setResult(null);
      return;
    }
    const t = setTimeout(() => {
      setResult(
        buildCutout(m, pic.work.width, pic.work.height, {
          level: Number(level) || 128,
          insetPx: Number(inset) || 0,
          smoothPx: Number(smooth) || 0,
          tolPx: Number(tol) || 0.8,
          cornerDeg: corners ? Number(cornerDeg) || 55 : 180,
          fillHoles,
          // เศษ/รูเล็กกว่า 0.02% ของภาพ = ฝุ่นจาก AI ทิ้งไป (ภาพ 2048² ≈ 840 พิกเซล)
          minAreaPx: Math.max(40, pic.work.width * pic.work.height * 0.0002),
          // รูกลางวัตถุเล็กกว่า 0.25% ของภาพ = ปิดทิ้ง (รูจริง เช่น ห่วง/หูจับ ใหญ่กว่านี้)
          minHolePx: pic.work.width * pic.work.height * 0.0025,
        })
      );
    }, 120);
    return () => clearTimeout(t);
  }, [pic, maskVer, level, inset, smooth, tol, corners, cornerDeg, fillHoles]);

  /** เส้นที่ใช้จริง: แก้เอง > อัตโนมัติ */
  const manual = manualRef.current;
  const curves: CutoutCurve[] = useMemo(
    () => (manual ? pathsToCurves(manual) : (result?.curves ?? [])),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- manualVer = สัญญาณว่า manualRef ถูกแก้
    [manual, manualVer, result]
  );
  const bounds = useMemo(
    () => (manual ? pathsBounds(manual) : (result?.bounds ?? null)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [manual, manualVer, result]
  );
  const anchors = manual ? anchorCount(manual) : (result?.anchors ?? 0);
  const ready = curves.length > 0 && !!bounds;

  /** เปลี่ยนเครื่องมือ — เข้าโหมดเส้นครั้งแรกแปลงเส้นอัตโนมัติเป็นเส้นแก้ได้ · ออกจากปากกากลางคัน = ปิดเส้น */
  const pickTool = (t: Tool) => {
    const ps = manualRef.current;
    if (ps && tool === "pen" && t !== "pen") finishPen(false);
    if ((t === "edit" || t === "pen") && !manualRef.current) {
      manualRef.current = result?.curves.length ? curvesToPaths(result.curves) : [];
      setManualVer((v) => v + 1);
    }
    if ((t === "keep" || t === "erase") && !maskRef.current && pic) {
      // ยังไม่ได้ลบอะไร = เริ่มจากเก็บทั้งภาพ แล้วระบายลบเอง
      maskRef.current = new Uint8Array(pic.work.width * pic.work.height).fill(255);
      setMaskVer((v) => v + 1);
    }
    setSel(null);
    setTool(t);
  };

  /** จบเส้นที่กำลังวาดด้วยปากกา: ≥3 จุด = ปิดเส้น · น้อยกว่า = ทิ้ง */
  const finishPen = (cancel: boolean) => {
    const ps = manualRef.current;
    const last = ps?.[ps.length - 1];
    if (!ps || !last?.open) return;
    if (cancel || last.nodes.length < 3) ps.pop();
    else last.open = false;
    setManualVer((v) => v + 1);
  };

  const backToAuto = () => {
    if (!manualRef.current) return;
    pushUndo();
    manualRef.current = null;
    setSel(null);
    setManualVer((v) => v + 1);
    if (tool === "edit" || tool === "pen") setTool("view");
  };

  /* ───────── วาดตัวอย่าง ───────── */

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFitW(Math.max(200, Math.min(1100, el.clientWidth))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [pic]);

  const viewW = pic ? Math.round(Math.min(fitW, pic.work.width * 2) * zoom) : 0;
  const viewH = pic ? Math.round((viewW * pic.work.height) / pic.work.width) : 0;
  /** โหมดที่ต้องเห็นรูปเต็มพร้อมสีแดงทับส่วนที่ตัดทิ้ง */
  const maskView = tool === "tapDrop" || tool === "tapAdd" || tool === "pick" || tool === "box" || tool === "keep" || tool === "erase";
  const vectorView = tool === "edit" || tool === "pen";

  /** ชั้นสีแดงทับส่วนที่จะตัดทิ้ง (ขนาด work) — แปรงวาดทับตรงนี้ระหว่างลาก */
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const rebuildOverlay = useCallback(() => {
    const m = maskRef.current;
    if (!pic || !m) {
      overlayRef.current = null;
      return;
    }
    const { width: w, height: h } = pic.work;
    const c = overlayRef.current?.width === w && overlayRef.current?.height === h ? overlayRef.current : document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d")!;
    const id = ctx.createImageData(w, h);
    for (let i = 0; i < m.length; i++) {
      if (m[i] >= 128) continue;
      const k = i * 4;
      id.data[k] = DROP_RGBA[0];
      id.data[k + 1] = DROP_RGBA[1];
      id.data[k + 2] = DROP_RGBA[2];
      id.data[k + 3] = DROP_RGBA[3];
    }
    ctx.putImageData(id, 0, 0);
    overlayRef.current = c;
  }, [pic]);

  const kView = pic ? viewW / pic.work.width : 1;
  const pathView = useMemo(() => (curves.length ? new Path2D(cutoutSvgPath(curves, kView)) : null), [curves, kView]);

  const draw = useCallback(() => {
    const cv = cvRef.current;
    if (!cv || !pic) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(viewW * dpr);
    cv.height = Math.round(viewH * dpr);
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingQuality = "high";
    if (bg === "checker") {
      const sq = 10;
      for (let y = 0; y < viewH; y += sq)
        for (let x = 0; x < viewW; x += sq) {
          ctx.fillStyle = ((x / sq + y / sq) & 1) === 0 ? "#f8fafc" : "#e2e8f0";
          ctx.fillRect(x, y, sq, sq);
        }
    } else {
      ctx.fillStyle = bg === "white" ? "#ffffff" : "#0f172a";
      ctx.fillRect(0, 0, viewW, viewH);
    }
    const k = kView;
    const hasMask = !!maskRef.current;
    if (maskView || (!pathView && !vectorView)) {
      // เลือก/แก้มาสก์ = เห็นรูปเต็ม + สีแดงทับส่วนที่จะตัดทิ้ง
      ctx.drawImage(pic.bmp, 0, 0, viewW, viewH);
      if (hasMask && overlayRef.current && !manualRef.current) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(overlayRef.current, 0, 0, viewW, viewH);
        ctx.imageSmoothingEnabled = true;
      }
    } else {
      // แก้เส้น = รูปเต็มจาง ๆ ไว้ดูแนว + ส่วนที่ตัดได้ชัด
      if (vectorView) {
        ctx.globalAlpha = 0.35;
        ctx.drawImage(pic.bmp, 0, 0, viewW, viewH);
        ctx.globalAlpha = 1;
      }
      if (pathView) {
        ctx.save();
        ctx.clip(pathView, "evenodd");
        ctx.drawImage(pic.bmp, 0, 0, viewW, viewH);
        ctx.restore();
      }
    }
    if (pathView && (showPath || maskView || vectorView)) {
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(255,255,255,.85)";
      ctx.lineWidth = 3;
      ctx.stroke(pathView);
      ctx.strokeStyle = PATH_INK;
      ctx.lineWidth = 1.25;
      ctx.stroke(pathView);
    }

    const ps = manualRef.current;
    // เส้นที่กำลังวาดด้วยปากกา (ยังไม่ปิด)
    const open = ps?.[ps.length - 1]?.open ? ps[ps.length - 1] : null;
    if (open && open.nodes.length) {
      ctx.strokeStyle = PATH_INK;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const n0 = open.nodes[0];
      ctx.moveTo(n0.p.x * k, n0.p.y * k);
      for (let i = 1; i < open.nodes.length; i++) {
        const a = open.nodes[i - 1];
        const b = open.nodes[i];
        ctx.bezierCurveTo(a.hout.x * k, a.hout.y * k, b.hin.x * k, b.hin.y * k, b.p.x * k, b.p.y * k);
      }
      ctx.stroke();
      if (hover && tool === "pen") {
        const l = open.nodes[open.nodes.length - 1];
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(l.p.x * k, l.p.y * k);
        ctx.bezierCurveTo(l.hout.x * k, l.hout.y * k, hover.x * k, hover.y * k, hover.x * k, hover.y * k);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // จุดแองเคอร์ + ด้าม
    if (vectorView && ps) {
      ps.forEach((q, pi) =>
        q.nodes.forEach((nd, ni) => {
          const on = sel?.pi === pi && sel.ni === ni;
          if (on) {
            ctx.strokeStyle = HANDLE_INK;
            ctx.fillStyle = "#ffffff";
            ctx.lineWidth = 1;
            for (const hh of [nd.hin, nd.hout]) {
              if (Math.hypot(hh.x - nd.p.x, hh.y - nd.p.y) < 0.01) continue;
              ctx.beginPath();
              ctx.moveTo(nd.p.x * k, nd.p.y * k);
              ctx.lineTo(hh.x * k, hh.y * k);
              ctx.stroke();
              ctx.beginPath();
              ctx.arc(hh.x * k, hh.y * k, 4, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
            }
          }
          const s = on ? 9 : 7;
          ctx.fillStyle = on ? PATH_INK : "#ffffff";
          ctx.strokeStyle = PATH_INK;
          ctx.lineWidth = 1.5;
          // จุดโค้ง = กลม · มุมหัก = สี่เหลี่ยม (แบบ Illustrator แยกด้วยรูปทรง ไม่ใช่สีอย่างเดียว)
          ctx.beginPath();
          if (isCorner(nd)) ctx.rect(nd.p.x * k - s / 2, nd.p.y * k - s / 2, s, s);
          else ctx.arc(nd.p.x * k, nd.p.y * k, s / 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        })
      );
    } else if (showAnchors && curves.length) {
      ctx.fillStyle = HANDLE_INK;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      for (const c of curves)
        for (const s of c.segs) {
          ctx.beginPath();
          ctx.rect(s.to.x * k - 2.5, s.to.y * k - 2.5, 5, 5);
          ctx.fill();
          ctx.stroke();
        }
    }

    // จุดเอา/ไม่เอา + กรอบ
    if (tool === "pick" || tool === "box") {
      const bx = dragBox ?? box;
      if (bx) {
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 3;
        ctx.strokeRect(bx.x0 * k, bx.y0 * k, (bx.x1 - bx.x0) * k, (bx.y1 - bx.y0) * k);
        ctx.strokeStyle = HANDLE_INK;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(bx.x0 * k, bx.y0 * k, (bx.x1 - bx.x0) * k, (bx.y1 - bx.y0) * k);
        ctx.setLineDash([]);
      }
      for (const p of points) {
        ctx.beginPath();
        ctx.arc(p.x * k, p.y * k, 8, 0, Math.PI * 2);
        ctx.fillStyle = p.keep ? KEEP_INK : DROP_INK;
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(p.x * k - 4, p.y * k);
        ctx.lineTo(p.x * k + 4, p.y * k);
        if (p.keep) {
          ctx.moveTo(p.x * k, p.y * k - 4);
          ctx.lineTo(p.x * k, p.y * k + 4);
        }
        ctx.stroke();
      }
    }

    // วงแปรง — เห็นก่อนป้ายว่าจะโดนแค่ไหน
    if (hover && (tool === "keep" || tool === "erase")) {
      const rr = (Number(brush) || 20) / 2;
      ctx.beginPath();
      ctx.arc(hover.x * k, hover.y * k, rr, 0, Math.PI * 2);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = tool === "keep" ? KEEP_INK : DROP_INK;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }, [pic, viewW, viewH, bg, kView, maskView, vectorView, pathView, showPath, showAnchors, curves, tool, sel, hover, points, box, dragBox, brush]);

  useEffect(() => {
    rebuildOverlay();
    draw();
  }, [maskVer, rebuildOverlay]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(draw, [draw, manualVer]);

  /* ───────── นิ้ว/เมาส์บนภาพ ───────── */

  const toWork = (e: { clientX: number; clientY: number }) => {
    const cv = cvRef.current!;
    const rect = cv.getBoundingClientRect();
    const k = pic!.work.width / rect.width;
    return { x: (e.clientX - rect.left) * k, y: (e.clientY - rect.top) * k, k };
  };

  const gesture = useRef<
    | { kind: "brush"; last: { x: number; y: number } | null }
    | { kind: "box"; x0: number; y0: number; cur: SamBox }
    | { kind: "node" | "hin" | "hout"; pi: number; ni: number; moved: boolean }
    | { kind: "penDrag"; pi: number; ni: number }
    | null
  >(null);
  const lastSegClick = useRef<{ t: number; x: number; y: number } | null>(null);

  /** แปรงป้ายเก็บ/ลบ ลงมาสก์ + ชั้นสีแดง */
  const paintAt = (x: number, y: number, kk: number) => {
    const m = maskRef.current;
    const g = gesture.current;
    if (!m || !pic || g?.kind !== "brush") return;
    const r = ((Number(brush) || 20) / 2) * kk;
    const { width: w, height: h } = pic.work;
    const val = tool === "keep" ? 255 : 0;
    const from = g.last ?? { x, y };
    const steps = Math.max(1, Math.ceil(Math.hypot(x - from.x, y - from.y) / Math.max(1, r / 3)));
    const oc = overlayRef.current?.getContext("2d");
    for (let s = 1; s <= steps; s++) {
      const cx = from.x + ((x - from.x) * s) / steps;
      const cy = from.y + ((y - from.y) * s) / steps;
      const x0 = Math.max(0, Math.floor(cx - r));
      const x1 = Math.min(w - 1, Math.ceil(cx + r));
      const y0 = Math.max(0, Math.floor(cy - r));
      const y1 = Math.min(h - 1, Math.ceil(cy + r));
      for (let yy = y0; yy <= y1; yy++)
        for (let xx = x0; xx <= x1; xx++) if ((xx + 0.5 - cx) ** 2 + (yy + 0.5 - cy) ** 2 <= r * r) m[yy * w + xx] = val;
      if (oc) {
        oc.save();
        oc.beginPath();
        oc.arc(cx, cy, r, 0, Math.PI * 2);
        // ล้างวงก่อนเสมอ (กันสีแดงซ้อนจนเข้ม) แล้วค่อยลงสีใหม่ถ้าเป็นแปรงลบ
        oc.globalCompositeOperation = "destination-out";
        oc.fillStyle = "#000";
        oc.fill();
        if (!val) {
          oc.globalCompositeOperation = "source-over";
          oc.fillStyle = `rgba(${DROP_RGBA[0]},${DROP_RGBA[1]},${DROP_RGBA[2]},${DROP_RGBA[3] / 255})`;
          oc.fill();
        }
        oc.restore();
      }
    }
    g.last = { x, y };
    draw();
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pic || tool === "view" || busy) return;
    e.preventDefault();
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    const { x, y, k } = toWork(e);
    const r = HIT_PX * k;

    if (tool === "tapDrop" || tool === "tapAdd") {
      if (!dropManual()) return;
      pushUndo();
      const add = tool === "tapAdd" ? !(e.shiftKey || e.altKey) : e.shiftKey || e.altKey;
      lastTap.current = { pt: { x, y, keep: true }, add, base: maskRef.current ? Uint8Array.from(maskRef.current) : null };
      void applyTap("best");
      return;
    }
    if (tool === "pick") {
      // คลิกซ้ำบนจุดเดิม = ลบจุดนั้น
      const hit = points.findIndex((p) => Math.hypot(p.x - x, p.y - y) <= r);
      if (hit >= 0) setSelection(points.filter((_, i) => i !== hit), box, "auto");
      else setSelection([...points, { x, y, keep: pickKeep !== (e.shiftKey || e.altKey) }], box, points.length ? "auto" : pickSize);
      return;
    }
    if (tool === "box") {
      const b0 = { x0: x, y0: y, x1: x, y1: y };
      gesture.current = { kind: "box", x0: x, y0: y, cur: b0 };
      setDragBox(b0);
      return;
    }
    if (tool === "keep" || tool === "erase") {
      if (!maskRef.current) return;
      if (!dropManual()) return;
      pushUndo();
      forgetTap();
      gesture.current = { kind: "brush", last: null };
      paintAt(x, y, k);
      return;
    }
    const ps = manualRef.current;
    if (!ps) return;
    if (tool === "pen") {
      let q = ps[ps.length - 1];
      // คลิกจุดแรกของเส้นที่วาดอยู่ = ปิดเส้น
      if (q?.open && q.nodes.length >= 3 && Math.hypot(q.nodes[0].p.x - x, q.nodes[0].p.y - y) <= r) {
        pushUndo();
        finishPen(false);
        return;
      }
      pushUndo();
      if (!q?.open) {
        q = { nodes: [], open: true };
        ps.push(q);
      }
      q.nodes.push({ p: { x, y }, hin: { x, y }, hout: { x, y } });
      gesture.current = { kind: "penDrag", pi: ps.length - 1, ni: q.nodes.length - 1 };
      setManualVer((v) => v + 1);
      return;
    }
    // tool === "edit"
    const hit = hitTest(ps, { x, y }, r, sel);
    if (!hit) {
      setSel(null);
      return;
    }
    if (hit.kind === "seg") {
      const now = Date.now();
      const lc = lastSegClick.current;
      lastSegClick.current = { t: now, x, y };
      // ดับเบิลคลิกบนเส้น = เพิ่มจุด (ตรงตำแหน่งนั้น รูปเส้นไม่เปลี่ยน)
      if (lc && now - lc.t < 400 && Math.hypot(lc.x - x, lc.y - y) <= r) {
        pushUndo();
        const ni = insertNode(ps[hit.pi], hit.si, hit.t);
        setSel({ pi: hit.pi, ni });
        setManualVer((v) => v + 1);
        lastSegClick.current = null;
      } else setSel(null);
      return;
    }
    setSel({ pi: hit.pi, ni: hit.ni });
    gesture.current = { kind: hit.kind, pi: hit.pi, ni: hit.ni, moved: false };
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pic) return;
    const g = gesture.current;
    const { x, y, k } = toWork(e);
    if (tool === "pen" || tool === "keep" || tool === "erase") setHover({ x, y });
    if (!g) return;
    if (g.kind === "brush") paintAt(x, y, k);
    else if (g.kind === "box") {
      g.cur = { x0: Math.min(g.x0, x), y0: Math.min(g.y0, y), x1: Math.max(g.x0, x), y1: Math.max(g.y0, y) };
      setDragBox(g.cur);
    }
    else if (g.kind === "penDrag") {
      // กดค้างแล้วลาก = ดึงด้ามโค้งออกมา (สองข้างสมมาตร)
      const nd = manualRef.current?.[g.pi]?.nodes[g.ni];
      if (!nd) return;
      nd.hout = { x, y };
      nd.hin = { x: 2 * nd.p.x - x, y: 2 * nd.p.y - y };
      setManualVer((v) => v + 1);
    } else {
      const nd = manualRef.current?.[g.pi]?.nodes[g.ni];
      if (!nd) return;
      if (!g.moved) {
        pushUndo();
        g.moved = true;
      }
      if (g.kind === "node") moveNode(nd, { x, y });
      else moveHandle(nd, g.kind, { x, y }, e.altKey);
      setManualVer((v) => v + 1);
    }
  };

  const onUp = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (g.kind === "brush") setMaskVer((v) => v + 1); // ปล่อยนิ้วแล้วค่อยเกลาเส้นใหม่
    if (g.kind === "box") {
      const b = g.cur; // อ่านจาก gesture (state อาจยังไม่อัปเดตถ้าปล่อยนิ้วเร็ว)
      setDragBox(null);
      if (b && b.x1 - b.x0 > 6 && b.y1 - b.y0 > 6) setSelection(points, b, "auto");
    }
  };

  // คีย์ลัด: Delete ลบจุด · Enter ปิดเส้น · Esc ยกเลิกเส้นที่วาด · ⌘Z ย้อน (เฉพาะตอนแท็บนี้แสดงอยู่)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!pic || !wrapRef.current || wrapRef.current.offsetParent === null) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
        return;
      }
      if (tool === "edit" && sel && (e.key === "Delete" || e.key === "Backspace") && manualRef.current) {
        e.preventDefault();
        pushUndo();
        removeNode(manualRef.current, sel.pi, sel.ni);
        setSel(null);
        setManualVer((v) => v + 1);
      }
      if (tool === "pen" && (e.key === "Enter" || e.key === "Escape")) {
        e.preventDefault();
        finishPen(e.key === "Escape");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* ───────── ส่งออก ───────── */

  const baseName = (pic?.name ?? "cutout").replace(/\.[^.]+$/, "") + "-cut";

  /** ตัดรูปเต็มความละเอียดด้วยเส้น pen tool → PNG พื้นใส */
  async function renderPng(): Promise<Blob | null> {
    if (!pic || !bounds || !curves.length) return null;
    const lim = Math.min(1, EXPORT_MAX / Math.max(pic.bmp.width, pic.bmp.height));
    const k = (1 / pic.scale) * lim; // พิกเซล work → พิกเซลไฟล์
    const pad = Math.max(0, Number(padPx) || 0);
    const b = bounds;
    const ox = cropTight ? Math.floor(b.x0 * k) - pad : 0;
    const oy = cropTight ? Math.floor(b.y0 * k) - pad : 0;
    const W = cropTight ? Math.ceil(b.x1 * k) - Math.floor(b.x0 * k) + pad * 2 : Math.round(pic.bmp.width * lim);
    const H = cropTight ? Math.ceil(b.y1 * k) - Math.floor(b.y0 * k) + pad * 2 : Math.round(pic.bmp.height * lim);
    const cv = document.createElement("canvas");
    cv.width = Math.max(1, W);
    cv.height = Math.max(1, H);
    const ctx = cv.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.clip(new Path2D(cutoutSvgPath(curves, k, -ox, -oy)), "evenodd");
    ctx.drawImage(pic.bmp, -ox, -oy, pic.bmp.width * lim, pic.bmp.height * lim);
    return await new Promise((res) => cv.toBlob((bl) => res(bl), "image/png"));
  }

  const download = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  async function downloadPng() {
    setBusy("กำลังตัดรูปเต็มความละเอียด…");
    try {
      const blob = await renderPng();
      if (blob) download(blob, `${baseName}.png`);
    } catch {
      setErr("สร้างไฟล์ PNG ไม่สำเร็จ — รูปอาจใหญ่เกินไป ลองย่อรูปก่อน");
    } finally {
      setBusy("");
    }
  }

  /** เส้น pen tool เป็น SVG ขนาดเท่ารูปต้นฉบับ — เปิดใน Illustrator วางทับรูปเดิมแล้วทำ Clipping Mask ได้ */
  function downloadSvg() {
    if (!pic || !curves.length) return;
    const k = 1 / pic.scale;
    const W = pic.bmp.width;
    const H = pic.bmp.height;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <path id="CutPath" fill="none" stroke="#e2007a" stroke-width="${Math.max(1, Math.round(W / 800))}" fill-rule="evenodd" d="${cutoutSvgPath(curves, k)}"/>
</svg>`;
    download(new Blob([svg], { type: "image/svg+xml" }), `${baseName}-path.svg`);
  }

  async function sendToDiecut() {
    setBusy("กำลังส่งไปแท็บเส้นไดคัท…");
    try {
      const blob = await renderPng();
      if (blob) onSendToDiecut(new File([blob], `${baseName}.png`, { type: "image/png" }));
    } finally {
      setBusy("");
    }
  }

  /* ───────── หน้าจอ ───────── */

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
        const f = e.dataTransfer.files?.[0];
        if (f) void openFile(f);
      }}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed text-center transition ${
        big ? "min-h-[180px] px-4 py-8" : "min-h-[44px] px-3 py-2"
      } ${dragOver ? "border-[color:var(--dk-blue)] bg-white/90" : "border-[color:var(--dk-sky-300)] bg-white/50 hover:bg-white/80"}`}
    >
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void openFile(f);
        }}
      />
      {big ? (
        <>
          <span className="dkb-h2 text-[1.2rem]" style={{ color: "var(--dk-navy)" }}>
            {busy || "เลือกรูป หรือลากมาวางตรงนี้"}
          </span>
          <span className="mt-1.5 text-[13px]" style={{ color: "var(--dk-navy-soft)" }}>
            JPG / PNG / WEBP · รูปถ่ายสินค้า รูปคน สัตว์เลี้ยง หรือ PNG ที่ไล่พื้นมาแล้วแต่ขอบยังหยาบ
          </span>
        </>
      ) : (
        <span className="text-[13px] font-bold" style={{ color: "var(--dk-navy-soft)" }}>
          ↺ เปลี่ยนรูป (เลือกหรือลากมาวาง)
        </span>
      )}
    </label>
  );

  const errBox = err && (
    <p className="mt-3 rounded-[14px] px-3 py-2 text-[13px] font-semibold" style={{ background: "var(--dk-coral-wash)", color: "var(--dk-coral-ink)" }}>
      {err}
    </p>
  );

  if (!pic) {
    return (
      <div className="dkb-g mt-4 p-4 sm:p-6">
        {dropZone(true)}
        {errBox}
        <ol className="mt-5 grid gap-3 sm:grid-cols-3">
          {(
            [
              ["ใส่รูป", "ระบบลบพื้นหลังให้เองทันที"],
              ["แตะส่วนที่ยังเกิน", "แตะชิ้นไหน AI ลบทั้งชิ้น · ลบผิดแตะเอาคืนได้"],
              ["โหลด PNG พื้นใส", "ขอบคมเต็มความละเอียด · ส่งไปทำเส้นไดคัทต่อได้"],
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
    );
  }

  const hasMask = !!maskRef.current;
  const selNode = sel && manual ? manual[sel.pi]?.nodes[sel.ni] : null;
  const penOpen = !!manual?.[manual.length - 1]?.open;

  const TOOL_HINT: Record<Tool, string> = {
    tapDrop: "แตะตรงที่ยังติดมา (พื้นหลัง/ของที่ไม่เอา) → AI ลบทั้งชิ้นให้ · สีแดง = ส่วนที่ถูกลบ",
    tapAdd: "แตะตรงที่โดนลบไปผิด → AI เอาคืนทั้งชิ้น",
    pick: pickKeep
      ? "เริ่มเลือกใหม่: คลิกบนสิ่งที่จะเอา (จุดเขียว) · Shift+คลิก = ไม่เอา (จุดแดง) · คลิกจุดเดิม = ลบจุด"
      : "คลิกตรงส่วนที่ไม่เอา (จุดแดง) · Shift+คลิก = ส่วนที่เอา",
    box: "ลากกรอบรอบสิ่งที่จะเอา — AI ดูเฉพาะในกรอบ (เริ่มเลือกใหม่)",
    keep: "ระบายทับตรงที่จะเอาคืน — ใช้กับจุดเล็ก ๆ ที่แตะแล้วไม่ติด",
    erase: "ระบายทับตรงที่จะลบ — ใช้กับจุดเล็ก ๆ ที่แตะแล้วไม่ติด",
    edit: "ลากจุด/ด้ามโค้ง · ดับเบิลคลิกบนเส้น = เพิ่มจุด · Delete = ลบจุด · Alt+ลากด้าม = หักมุม",
    pen: penOpen
      ? "คลิก = จุดมุม · กดค้างแล้วลาก = จุดโค้ง · คลิกจุดแรก/Enter = ปิดเส้น · Esc = ยกเลิก"
      : "คลิกทีละจุดรอบสิ่งที่จะเอา (กดค้างลาก = โค้ง) · วาดในวัตถุ = เจาะรู",
    view: "ผลที่ตัดแล้ว — ใช้ได้ก็โหลด PNG ทางขวาได้เลย",
  };

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      {/* ── ตัวอย่าง ── */}
      <section className="dkb-g min-w-0 p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <b className="min-w-0 flex-1 truncate text-[14px]" style={{ color: "var(--dk-navy)" }} title={pic.name}>
            {pic.name}
          </b>
          <span className="text-[12px] tabular-nums" style={{ color: "var(--dk-faint)" }}>
            {pic.bmp.width}×{pic.bmp.height} px
            {pro && ready && ` · ${anchors} จุดแองเคอร์ · ${curves.length} เส้น`}
            {manual && " · แก้เส้นเอง"}
          </span>
        </div>

        {/* แถบเครื่องมือหลัก — ลบ/เอาคืน ด้วยการแตะ หรือระบาย */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <ToolBtn on={tool === "tapDrop"} tone="drop" onClick={() => pickTool("tapDrop")}>👆 แตะเพื่อลบ</ToolBtn>
          <ToolBtn on={tool === "tapAdd"} tone="keep" onClick={() => pickTool("tapAdd")}>👆 แตะเพื่อเอาคืน</ToolBtn>
          <span className="mx-0.5 h-6 w-px" style={{ background: "var(--dk-hair)" }} />
          <ToolBtn on={tool === "erase"} tone="drop" onClick={() => pickTool("erase")}>🧽 ระบายลบ</ToolBtn>
          <ToolBtn on={tool === "keep"} tone="keep" onClick={() => pickTool("keep")}>🖌 ระบายคืน</ToolBtn>
          <span className="mx-0.5 h-6 w-px" style={{ background: "var(--dk-hair)" }} />
          <ToolBtn on={tool === "view"} onClick={() => pickTool("view")}>👁 ดูผล</ToolBtn>
          <button
            type="button"
            onClick={undo}
            disabled={!undoCount}
            className="min-h-[44px] rounded-xl px-3 text-[13px] font-bold ring-1 ring-[color:var(--dk-hair)] disabled:opacity-40"
            style={{ color: "var(--dk-navy)" }}
            title="ย้อน (⌘Z / Ctrl+Z)"
          >
            ↶ ย้อน
          </button>
          <span className="ml-auto flex items-center gap-1">
            <span className="text-[12px] font-semibold" style={{ color: "var(--dk-faint)" }}>ซูม</span>
            {([1, 2, 4] as const).map((z) => (
              <Choice key={z} on={zoom === z} onClick={() => setZoom(z)}>
                {z}×
              </Choice>
            ))}
          </span>
        </div>
        {pro && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[12px] font-semibold" style={{ color: "var(--dk-faint)" }}>โหมดละเอียด</span>
            <Choice on={tool === "pick"} onClick={() => pickTool("pick")}>🎯 เลือกใหม่ด้วยจุด</Choice>
            <Choice on={tool === "box"} onClick={() => pickTool("box")}>⬚ ลากกรอบ</Choice>
            <Choice on={tool === "edit"} onClick={() => pickTool("edit")}>✒️ แก้จุดเส้น</Choice>
            <Choice on={tool === "pen"} onClick={() => pickTool("pen")}>🖊 วาดเส้นเอง</Choice>
          </div>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl px-3 py-2" style={{ background: "var(--dk-sky)" }}>
          <span className="min-w-0 flex-1 text-[12.5px] font-semibold" style={{ color: "var(--dk-navy)" }}>
            {TOOL_HINT[tool]}
          </span>
          {(tool === "tapDrop" || tool === "tapAdd") && tapInfo && lastTap.current && (
            <span className="flex flex-wrap items-center gap-1">
              <span className="text-[12px] font-semibold" style={{ color: "var(--dk-navy-soft)" }}>
                {tapInfo.add ? "ชิ้นที่เอาคืน" : "ชิ้นที่ลบ"}
              </span>
              {(["ใหญ่", "กลาง", "เล็ก"] as const).map((l, i) => (
                <Choice key={l} on={tapInfo.picked === i} onClick={() => void applyTap(i)}>
                  {l}
                </Choice>
              ))}
            </span>
          )}
          {tool === "pick" && (
            <span className="flex gap-1">
              <Choice on={pickKeep} onClick={() => setPickKeep(true)}>➕ เอา</Choice>
              <Choice on={!pickKeep} onClick={() => setPickKeep(false)}>➖ ไม่เอา</Choice>
            </span>
          )}
          {(tool === "keep" || tool === "erase") && (
            <label className="flex items-center gap-2 text-[12px] tabular-nums" style={{ color: "var(--dk-navy-soft)" }}>
              ขนาดแปรง
              <input type="range" min={4} max={120} value={brush} onChange={(e) => setBrush(e.target.value)} className="h-6 w-28" style={{ accentColor: "var(--dk-blue-deep)" }} />
              {brush}px
            </label>
          )}
          {tool === "edit" && selNode && sel && manual && (
            <span className="flex flex-wrap gap-1">
              <Choice
                on={false}
                onClick={() => {
                  pushUndo();
                  toggleCorner(manual[sel.pi], sel.ni);
                  setManualVer((v) => v + 1);
                }}
              >
                {isCorner(selNode) ? "⌒ ทำเป็นโค้ง" : "∠ ทำเป็นมุม"}
              </Choice>
              <Choice
                on={false}
                onClick={() => {
                  pushUndo();
                  removeNode(manual, sel.pi, sel.ni);
                  setSel(null);
                  setManualVer((v) => v + 1);
                }}
              >
                🗑 ลบจุด
              </Choice>
              <Choice
                on={false}
                onClick={() => {
                  pushUndo();
                  manual.splice(sel.pi, 1);
                  setSel(null);
                  setManualVer((v) => v + 1);
                }}
              >
                🗑 ลบทั้งเส้น
              </Choice>
            </span>
          )}
          {tool === "pen" && penOpen && (
            <span className="flex gap-1">
              <Choice on={false} onClick={() => finishPen(false)}>✔ ปิดเส้น</Choice>
              <Choice on={false} onClick={() => finishPen(true)}>✕ ยกเลิก</Choice>
            </span>
          )}
        </div>

        <div ref={wrapRef} className="mt-3 max-h-[72vh] overflow-auto rounded-xl" style={{ boxShadow: "inset 0 0 0 1px var(--dk-hair)" }}>
          <canvas
            ref={cvRef}
            style={{
              width: viewW,
              height: viewH,
              touchAction: tool === "view" ? "auto" : "none",
              cursor: tool === "view" ? "default" : tool === "edit" ? "default" : "crosshair",
            }}
            className="block"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onPointerLeave={() => setHover(null)}
          />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] font-semibold" style={{ color: "var(--dk-faint)" }}>พื้นตรวจขอบ</span>
          <Choice on={bg === "checker"} onClick={() => setBg("checker")}>ตาราง</Choice>
          <Choice on={bg === "white"} onClick={() => setBg("white")}>ขาว</Choice>
          <Choice on={bg === "black"} onClick={() => setBg("black")}>ดำ</Choice>
          <label className="ml-auto flex min-h-[40px] items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: "var(--dk-navy-soft)" }}>
            <input type="checkbox" checked={showPath} onChange={(e) => setShowPath(e.target.checked)} /> เส้น
          </label>
          <label className="flex min-h-[40px] items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: "var(--dk-navy-soft)" }}>
            <input type="checkbox" checked={showAnchors} onChange={(e) => setShowAnchors(e.target.checked)} /> จุดแองเคอร์
          </label>
        </div>
        {busy && (
          <p className="mt-2 rounded-xl px-3 py-2 text-[13px] font-semibold" style={{ background: "var(--dk-sky)", color: "var(--dk-navy)" }}>
            ⏳ {busy}
          </p>
        )}
        {errBox}
      </section>

      {/* ── แผงคุม ── */}
      <div className="space-y-4">
        <Step n={1} title="ลบพื้นหลัง" note={busy ? "กำลังทำ…" : source ? SOURCE_LABEL[source] : "ยังไม่ได้ลบ"}>
          <div className="grid gap-2">
            <p className="text-[12.5px]" style={{ color: "var(--dk-navy-soft)" }}>
              เปิดรูปแล้วระบบลบให้เอง · <b style={{ color: "var(--dk-coral-ink)" }}>สีแดง</b> บนรูป = ส่วนที่จะถูกตัดทิ้ง
            </p>
            <div className="flex flex-wrap gap-2">
              <Btn small onClick={() => void runAi()} disabled={!!busy} title="AI หาวัตถุหลักแล้วลบพื้นหลังทั้งภาพ">
                🪄 ลบพื้นหลังอัตโนมัติ
              </Btn>
              <Btn small onClick={() => void refine()} disabled={!hasMask || !!busy} title="AI ดูเฉพาะรอบวัตถุแบบซูมใกล้ แล้วเกลาขอบใหม่ (ผม/ขน/ขอบเล็ก ๆ)">
                ✨ เก็บขอบละเอียด
              </Btn>
            </div>
            <More title="พื้นหลังสีเรียบ / ไฟล์พื้นใส">
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Slider
                    label={`ลบพื้นสีเดียว · ความต่างสี ${colorTol}`}
                    hint="รูปพื้นขาว/พื้นสี · มากขึ้น = กินพื้นได้กว้างขึ้น"
                    min={2}
                    max={60}
                    step={1}
                    value={colorTol}
                    onChange={(v) => {
                      setColorTol(v);
                      if (source === "color") runColor(v);
                    }}
                  />
                </div>
                <Btn small onClick={() => runColor()} disabled={!!busy}>
                  ใช้
                </Btn>
              </div>
              {pic.transparent && (
                <Btn small onClick={runAlpha} disabled={!!busy}>
                  ใช้พื้นใสของไฟล์เดิม
                </Btn>
              )}
            </More>
          </div>
        </Step>

        <Step n={2} title="แก้ตรงที่ยังไม่ถูก">
          <ul className="grid gap-1.5 text-[12.5px]" style={{ color: "var(--dk-navy-soft)" }}>
            <li><b style={{ color: "var(--dk-navy)" }}>ยังมีของเกิน</b> → กด 👆 แตะเพื่อลบ แล้วแตะบนชิ้นนั้น</li>
            <li><b style={{ color: "var(--dk-navy)" }}>โดนลบไปผิด</b> → กด 👆 แตะเพื่อเอาคืน แล้วแตะตรงนั้น</li>
            <li><b style={{ color: "var(--dk-navy)" }}>AI กินเยอะ/น้อยไป</b> → กด ใหญ่ / กลาง / เล็ก ข้างคำแนะนำ</li>
            <li><b style={{ color: "var(--dk-navy)" }}>จุดเล็ก ๆ แตะไม่ติด</b> → 🧽 ระบายลบ / 🖌 ระบายคืน (ซูม 2× ช่วยได้)</li>
            <li><b style={{ color: "var(--dk-navy)" }}>พลาด</b> → ↶ ย้อน (⌘Z)</li>
          </ul>
          <Slider label={`หดขอบเข้า ${inset} px`} hint="มีขอบขาว/ขอบพื้นหลังติดรอบวัตถุ ให้เพิ่ม" min={0} max={8} step={1} value={inset} onChange={setInset} />
          <label className="mt-3 flex min-h-[44px] items-center gap-2 rounded-xl px-3 text-[13px] font-semibold ring-1 ring-[color:var(--dk-hair)]" style={{ color: "var(--dk-navy)" }}>
            <input type="checkbox" checked={pro} onChange={(e) => {
              setPro(e.target.checked);
              if (!e.target.checked && (tool === "pick" || tool === "box" || tool === "edit" || tool === "pen")) pickTool("tapDrop");
            }} />
            🛠 โหมดละเอียด (pen tool · ปรับเส้น)
          </label>
          {pro && (
            <div className="mt-3 space-y-3">
              {source === "sam" && samInfo && points.length === 1 && !box && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[12px] font-semibold" style={{ color: "var(--dk-faint)" }}>ขนาดที่เลือก</span>
                {(["ทั้งชิ้น", "กลาง", "ส่วนย่อย"] as const).map((l, i) => (
                  <Choice
                    key={l}
                    on={samInfo.picked === i}
                    onClick={() => {
                      setPickSize(i);
                      void runSam(points, box, i);
                    }}
                  >
                    {l}
                  </Choice>
                ))}
              </div>
            )}
              {(points.length > 0 || !!box) && (
                <Btn small onClick={() => setSelection([], null, "auto")} disabled={!!busy}>
                  ล้างจุด/กรอบ
                </Btn>
              )}
          {manual ? (
            <div className="grid gap-2">
              <p className="rounded-xl px-3 py-2 text-[12.5px] font-semibold" style={{ background: "var(--dk-sky)", color: "var(--dk-navy)" }}>
                กำลังใช้เส้นที่แก้จุดเอง — ค่าเกลาขอบด้านล่างจะไม่มีผลจนกว่าจะกลับไปใช้เส้นอัตโนมัติ
              </p>
              <Btn small onClick={backToAuto}>
                ↺ กลับไปใช้เส้นอัตโนมัติ
              </Btn>
            </div>
          ) : (
            <div className="space-y-3">
              <Slider label={`หดขอบเข้า ${inset} px`} hint="กันขอบพื้นหลังติดมา (ขอบขาว/ขอบดำรอบวัตถุ)" min={0} max={8} step={1} value={inset} onChange={setInset} />
              <Slider label={`ความลื่นของเส้น ${tol}`} hint="น้อย = เกาะขอบแน่น จุดเยอะ · มาก = เส้นลื่น จุดน้อย แบบลากมือ" min={0.3} max={4} step={0.1} value={tol} onChange={setTol} />
              <label className="flex min-h-[40px] items-center gap-2 text-[13px] font-semibold" style={{ color: "var(--dk-navy)" }}>
                <input type="checkbox" checked={corners} onChange={(e) => setCorners(e.target.checked)} />
                เก็บมุมแหลม (ขอบกล่อง/ปลายแหลม)
              </label>
              {corners && (
                <Slider label={`มุมที่ถือว่าหัก ≥ ${cornerDeg}°`} hint="น้อย = เจอมุมง่าย · มาก = โค้งเกือบหมด" min={25} max={120} step={5} value={cornerDeg} onChange={setCornerDeg} />
              )}
              <label className="flex min-h-[40px] items-center gap-2 text-[13px] font-semibold" style={{ color: "var(--dk-navy)" }}>
                <input type="checkbox" checked={fillHoles} onChange={(e) => setFillHoles(e.target.checked)} />
                ปิดรูกลางวัตถุ (ไม่ตัดทะลุ)
              </label>
              <More title="ตั้งค่าละเอียด">
                <Slider label={`ลบรอยหยัก ${smooth} px`} hint="ขอบมาสก์ขรุขระ (ขน/ผม/JPG แตก) ให้เพิ่ม" min={0} max={6} step={1} value={smooth} onChange={setSmooth} />
                <Slider label={`ระดับขอบ ${level}`} hint="ขอบโปร่งครึ่ง ๆ: มาก = เส้นเข้าในวัตถุ · น้อย = ออกนอก" min={30} max={225} step={1} value={level} onChange={setLevel} />
              </More>
            </div>
          )}
            </div>
          )}
        </Step>

        <section className="dkb-g p-4">
          <div className="flex items-center gap-2.5">
            <StepNo n={3} />
            <h2 className="dkb-h2 text-[1.08rem]" style={{ color: "var(--dk-navy)" }}>เอาไปใช้</h2>
          </div>
          <label className="mt-3 flex min-h-[40px] items-center gap-2 text-[13px] font-semibold" style={{ color: "var(--dk-navy)" }}>
            <input type="checkbox" checked={cropTight} onChange={(e) => setCropTight(e.target.checked)} />
            ครอปชิดวัตถุ
            {cropTight && (
              <span className="ml-auto flex items-center gap-1 text-[12px] font-normal" style={{ color: "var(--dk-navy-soft)" }}>
                เว้นขอบ
                <input
                  value={padPx}
                  onChange={(e) => setPadPx(e.target.value.replace(/\D/g, ""))}
                  inputMode="numeric"
                  className="h-9 w-14 rounded-lg bg-white px-2 text-right tabular-nums ring-1 ring-slate-200"
                />
                px
              </span>
            )}
          </label>
          <div className="mt-2 grid gap-2">
            <Btn tone="navy" onClick={() => void downloadPng()} disabled={!ready || !!busy}>
              ⬇ PNG พื้นใส (ขอบคม เต็มความละเอียด)
            </Btn>
            <Btn tone="yolk" onClick={() => void sendToDiecut()} disabled={!ready || !!busy}>
              ✂️ ส่งไปทำเส้นไดคัทต่อ
            </Btn>
            <Btn small onClick={downloadSvg} disabled={!ready} title="เส้นอย่างเดียว ขนาดเท่ารูปต้นฉบับ วางทับรูปใน Illustrator แล้วทำ Clipping Mask">
              .svg เส้น pen tool อย่างเดียว
            </Btn>
          </div>
          {!ready && (
            <p className="mt-2 text-[12px]" style={{ color: "var(--dk-faint)" }}>
              เลือกสิ่งที่จะเอาในขั้นที่ 1 ก่อน (หรือวาดเส้นเองด้วย 🖊)
            </p>
          )}
        </section>

        {dropZone(false)}
      </div>
    </div>
  );
}

const SOURCE_LABEL: Record<Source, string> = {
  sam: "AI ตามที่คลิก",
  ai: "AI ทั้งภาพ",
  color: "พื้นสีเรียบ",
  alpha: "พื้นใสของไฟล์",
};

/** ขอบรูปเป็นสีเดียวกันเกือบหมด (รูปสินค้าพื้นขาว/พื้นสี) → ลบพื้นด้วยสีได้ทันทีไม่ต้องรอ AI */
function plainBackground(img: ImageData): boolean {
  const { width: w, height: h, data } = img;
  const px: number[] = [];
  const step = Math.max(1, Math.floor((w + h) / 400));
  for (let x = 0; x < w; x += step) px.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y += step) px.push(y * w, y * w + w - 1);
  let r = 0, g = 0, b = 0;
  for (const i of px) {
    r += data[i * 4];
    g += data[i * 4 + 1];
    b += data[i * 4 + 2];
  }
  r /= px.length;
  g /= px.length;
  b /= px.length;
  let near = 0;
  for (const i of px) if (Math.abs(data[i * 4] - r) + Math.abs(data[i * 4 + 1] - g) + Math.abs(data[i * 4 + 2] - b) < 36) near++;
  return near / px.length > 0.92;
}

/** ปุ่มเครื่องมือหลัก — ใหญ่พอกดด้วยนิ้ว · ลบ = ขอบแดง · เอาคืน = ขอบเขียว (แยกด้วยขอบ ไม่ใช่สีอย่างเดียว) */
function ToolBtn({ on, tone, onClick, children }: { on: boolean; tone?: "drop" | "keep"; onClick: () => void; children: React.ReactNode }) {
  const ink = tone === "drop" ? DROP_INK : tone === "keep" ? KEEP_INK : "var(--dk-navy)";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className="min-h-[44px] rounded-xl px-3.5 text-[13px] font-bold transition"
      style={
        on
          ? { background: ink, color: "#fff", boxShadow: `inset 0 0 0 2px ${ink}` }
          : { background: "rgba(255,255,255,.8)", color: "var(--dk-navy)", boxShadow: `inset 0 0 0 1.5px ${tone ? ink : "var(--dk-hair)"}` }
      }
    >
      {children}
    </button>
  );
}
