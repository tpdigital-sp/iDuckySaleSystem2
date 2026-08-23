"use client";

import RequirePerm from "@/components/RequirePerm";
import { useCallback, useEffect, useRef, useState } from "react";
import { buildDiecut, exportFrame, toSvgPath, type DiecutResult, type RingTab } from "@/lib/diecut";
import { buildAiFile } from "@/lib/diecut-ai";
import { Banner, Btn, PageHead, PageShell } from "@/components/admin/ui";

/** ขนาดที่ใช้คำนวณเส้น (ยิ่งเล็กยิ่งไว) และขนาดรูปที่ฝังลงไฟล์ .ai */
const TRACE_MAX = 1200;
const EMBED_MAX = 2400;

const inputCls =
  "w-full rounded-xl bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-300";

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

function DiecutLabInner() {
  const [fileName, setFileName] = useState("");
  const [trace, setTrace] = useState<ImageData | null>(null);
  const [embed, setEmbed] = useState<ImageData | null>(null);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [dragOver, setDragOver] = useState(false);

  // ── ค่าตั้งงาน ──
  const [widthMm, setWidthMm] = useState("50");
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

  const [showAnchors, setShowAnchors] = useState(false);
  const [result, setResult] = useState<DiecutResult | null>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);

  const loadFile = useCallback(async (f: File) => {
    setErr("");
    if (!/^image\/(png|webp)$/.test(f.type)) {
      setErr("ไฟล์ลายต้องเป็น PNG (หรือ WEBP) ที่พื้นหลังโปร่งใส — JPG ไม่มีพื้นใส ตัดขอบไม่ได้");
      return;
    }
    setBusy(true);
    try {
      const bmp = await createImageBitmap(f);
      setNatural({ w: bmp.width, h: bmp.height });
      setTrace(toImageData(bmp, TRACE_MAX));
      setEmbed(toImageData(bmp, EMBED_MAX));
      setFileName(f.name);
      bmp.close();
    } catch {
      setErr("เปิดไฟล์รูปไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }, []);

  // คำนวณเส้นใหม่ทุกครั้งที่ลาย/ค่าตั้งเปลี่ยน
  useEffect(() => {
    if (!trace) {
      setResult(null);
      return;
    }
    const wMm = Number(widthMm);
    const oMm = Number(offsetMm);
    if (!(wMm > 0)) return;
    const t = setTimeout(() => {
      const ring: RingTab | undefined = ringOn
        ? {
            tabDiameterMm: Number(tabDia) || 0,
            holeDiameterMm: Number(ringDia) || 0,
            overlapMm: Number(ringOverlap) || 0,
            position: ringPos,
          }
        : undefined;
      setResult(
        buildDiecut(
          trace,
          {
            widthMm: wMm,
            offsetMm: Number.isFinite(oMm) ? oMm : 0,
            smoothMm: Number(smoothMm) || 0,
            curveTolMm: Number(curveTol) || 0.15,
            fillHoles,
            alphaThreshold: Number(alphaThreshold) || 128,
          },
          ring
        )
      );
    }, 120); // หน่วงสั้น ๆ กันคำนวณรัวตอนลากสไลเดอร์
    return () => clearTimeout(t);
  }, [trace, widthMm, offsetMm, smoothMm, curveTol, fillHoles, alphaThreshold, ringOn, tabDia, ringDia, ringOverlap, ringPos]);

  // วาดตัวอย่าง: ลาย + เส้นไดคัทสีบานเย็น
  useEffect(() => {
    const cv = previewRef.current;
    if (!cv || !embed || !result) return;
    // กรอบตัวอย่าง = กรอบไฟล์ส่งออก (เส้นตัด/แท็บหูร้อยล้นออกนอกลายได้ ต้องเห็นครบ)
    const frame = exportFrame(result, 3);
    // ขยายให้เต็มกรอบตัวอย่างเสมอ (งานจริงมักเล็กแค่ 5 ซม. — ถ้าวาดเท่าขนาดจริงจะจิ๋วจนดูไม่ออก)
    const pxPerMm = Math.min(24, 640 / Math.max(frame.pageWidthMm, frame.pageHeightMm));
    cv.width = Math.round(frame.pageWidthMm * pxPerMm);
    cv.height = Math.round(frame.pageHeightMm * pxPerMm);
    const padX = frame.artXMm * pxPerMm;
    const padY = frame.artYMm * pxPerMm;
    const ctx = cv.getContext("2d")!;
    ctx.clearRect(0, 0, cv.width, cv.height);
    // ตารางหมากรุก = พื้นโปร่งใส
    const sq = 10;
    for (let y = 0; y < cv.height; y += sq) {
      for (let x = 0; x < cv.width; x += sq) {
        ctx.fillStyle = ((x / sq + y / sq) & 1) === 0 ? "#f8fafc" : "#eef2f7";
        ctx.fillRect(x, y, sq, sq);
      }
    }
    const tmp = document.createElement("canvas");
    tmp.width = embed.width;
    tmp.height = embed.height;
    tmp.getContext("2d")!.putImageData(embed, 0, 0);
    ctx.drawImage(tmp, padX, padY, result.widthMm * pxPerMm, result.heightMm * pxPerMm);

    // วาดจากเส้นโค้งชุดเดียวกับที่จะเขียนลงไฟล์ — เห็นบนจอยังไง ได้ไฟล์อย่างนั้น
    ctx.strokeStyle = "#e2007a";
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    const CX = (mm: number) => padX + mm * pxPerMm;
    const CY = (mm: number) => padY + mm * pxPerMm;
    for (const c of result.curves) {
      if (!c.segs.length) continue;
      ctx.beginPath();
      ctx.moveTo(CX(c.start.x), CY(c.start.y));
      for (const s of c.segs) ctx.bezierCurveTo(CX(s.c1.x), CY(s.c1.y), CX(s.c2.x), CY(s.c2.y), CX(s.to.x), CY(s.to.y));
      ctx.closePath();
      ctx.stroke();
    }
    // จุดแองเคอร์ (เหมือนที่จะเห็นตอนเปิดใน Illustrator)
    if (showAnchors) {
      ctx.fillStyle = "#0ea5e9";
      for (const c of result.curves) for (const s of c.segs) {
        ctx.beginPath();
        ctx.arc(CX(s.to.x), CY(s.to.y), 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (result.hole) {
      ctx.beginPath();
      ctx.arc(padX + result.hole.cx * pxPerMm, padY + result.hole.cy * pxPerMm, result.hole.r * pxPerMm, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, [embed, result, showAnchors]);

  const download = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const baseName = (fileName.replace(/\.[^.]+$/, "") || "diecut") + `-cut${offsetMm}mm`;

  async function downloadAi() {
    if (!embed || !result) return;
    setBusy(true);
    try {
      const blob = await buildAiFile({
        rgba: embed.data,
        pxWidth: embed.width,
        pxHeight: embed.height,
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

  return (
    <PageShell>
      <PageHead
        group="สินค้า"
        title="เส้นไดคัท"
        count="ทดลอง"
        sub="ทำเส้นตัดจากลายลูกค้า → ไฟล์เข้าเครื่องตัด"
      />

      <div className="mt-4">
        <Banner
          tone="warm"
          title="โหมดทดลอง"
          detail="หน้านี้อยู่ในหลังบ้านอย่างเดียว ลูกค้าหน้าร้านยังไม่เห็นและยังไม่มีผลกับออเดอร์ใด ๆ"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        {/* ซ้าย: ลาย + ตัวอย่างเส้น */}
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
              const f = e.dataTransfer.files?.[0];
              if (f) void loadFile(f);
            }}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-6 text-center transition ${
              dragOver ? "border-[color:var(--dk-blue)] bg-white/80" : "border-[color:var(--dk-sky-300)] bg-white/50 hover:bg-white/80"
            }`}
          >
            <input
              type="file"
              accept="image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void loadFile(f);
              }}
            />
            <span className="dkb-h2 text-[0.98rem]">เลือกไฟล์ลาย · หรือลากมาวางตรงนี้</span>
            <span className="mt-1 text-[11.5px]" style={{ color: "var(--dk-faint)" }}>PNG พื้นใส (ไล่พื้นหลังออกแล้ว) · WEBP ก็ได้</span>
            {fileName && (
              <span className="dkb-tag mt-2" style={{ background: "var(--dk-sky)", color: "var(--dk-blue-deep)" }}>
                {fileName} · {natural.w}×{natural.h} px
              </span>
            )}
          </label>

          {err && (
            <p className="mt-3 rounded-[16px] px-3 py-2 text-[13px] font-semibold" style={{ background: "var(--dk-coral-wash)", color: "var(--dk-coral-ink)" }}>
              {err}
            </p>
          )}

          {result && (
            <div className="mt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="dkb-h2 text-[1.02rem]">ตัวอย่างเส้นตัด</h2>
                <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                  <input type="checkbox" checked={showAnchors} onChange={(e) => setShowAnchors(e.target.checked)} className="h-3.5 w-3.5" style={{ accentColor: "var(--dk-blue-deep)" }} />
                  โชว์จุดแองเคอร์
                </label>
                <span className="text-[11.5px]" style={{ color: "var(--dk-navy-soft)" }}>
                  งานจริง {result.widthMm.toFixed(1)} × {result.heightMm.toFixed(1)} มม. · เส้นสีบานเย็น = แนวตัด
                </span>
              </div>
              <div className="mt-2 overflow-auto rounded-[18px]" style={{ boxShadow: "inset 0 0 0 1px var(--dk-hair)" }}>
                <canvas ref={previewRef} className="block" />
              </div>
              {result.warnings.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {result.warnings.map((warn, i) => (
                    <li key={i} className="rounded-[14px] px-3 py-2 text-[12px] font-semibold" style={{ background: "var(--dk-yolk-wash)", color: "var(--dk-yolk-ink)" }}>
                      {warn}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* ขวา: ค่าตั้ง + ปุ่มโหลดไฟล์ */}
        <div className="space-y-4">
          <div className="dkb-g p-4">
            <h2 className="dkb-h2 text-[1.02rem]">ขนาด & ค่าตัดเผื่อ</h2>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="text-[11px] font-semibold text-slate-500">
                ความกว้างงานจริง (มม.)
                <input value={widthMm} onChange={(e) => setWidthMm(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" className={`mt-1 ${inputCls}`} />
              </label>
              <label className="text-[11px] font-semibold text-slate-500">
                ตัดเผื่อรอบลาย (มม.)
                <input value={offsetMm} onChange={(e) => setOffsetMm(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" className={`mt-1 ${inputCls}`} />
              </label>
            </div>
            <p className="mt-2 text-[11.5px]" style={{ color: "var(--dk-faint)" }}>
              สูงคำนวณให้เองตามสัดส่วนภาพ · ค่าตัดเผื่อมาตรฐานของร้าน = 2 มม.
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
                    <input value={tabDia} onChange={(e) => setTabDia(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" className={`mt-1 ${inputCls}`} />
                  </label>
                  <label className="text-[11px] font-semibold text-slate-500">
                    รูเจาะ (มม.)
                    <input value={ringDia} onChange={(e) => setRingDia(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" className={`mt-1 ${inputCls}`} />
                  </label>
                  <label className="text-[11px] font-semibold text-slate-500">
                    ซ้อนงาน (มม.)
                    <input value={ringOverlap} onChange={(e) => setRingOverlap(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" className={`mt-1 ${inputCls}`} />
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
