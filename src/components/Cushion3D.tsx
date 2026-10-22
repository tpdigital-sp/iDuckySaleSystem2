"use client";

/**
 * 🛋🧊 โมเดล 3D ปลอกหมอนอิง — ลายที่ลูกค้าออกแบบอยู่บนหมอนจริง (ยัดไส้พอง) ให้เห็นก่อนสั่ง
 * (เจ้าของร้านสั่ง 22 ต.ค. 69 "ช่วยสร้าง 3D ให้หน่อย" — ปลอกหมอนอิง pillowcases-5)
 *
 * three.js โหลดตอนกดปุ่มเท่านั้น (import()) · โครงเดียวกับ Stand3D/Mug3D (RoomEnvironment · ไฟตามกล้อง · ลาก=หมุน · ล้อ/หยิก=ซูม)
 * ผืนเทมเพลต = หน้า (ครึ่งซ้าย) + หลัง (ครึ่งขวา) กางออก → ครอปสี่เหลี่ยมขนาดสำเร็จจากกึ่งกลางแต่ละครึ่งไปเป็นผิวหน้า/หลัง
 * ทรงหมอน = PlaneGeometry 2 แผ่นดัดโป่ง (superellipse: กลางพอง ขอบแบนมาบรรจบกันเป็นตะเข็บ) + ตะเข็บรอบ + ซิปขอบขวา
 */

import { useEffect, useRef, useState } from "react";
import { CUSHION_VIEW_TH, type CushionMock, type CushionView } from "@/lib/cushion-mock";

/** มุมกล้อง (เรเดียน รอบแกนตั้ง) — ด้านหน้าหมอนหันไป +z */
const VIEW_YAW: Record<CushionView, number> = { front: 0, right: Math.PI / 2, left: -Math.PI / 2, back: Math.PI };

/** ครอปส่วนของผืน (มม.) เป็นผ้าใบใหม่ · k = พิกเซล/มม. */
function cropCanvas(src: HTMLCanvasElement, k: number, x: number, y: number, w: number, h: number): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = Math.max(2, Math.round(w * k));
  out.height = Math.max(2, Math.round(h * k));
  const ctx = out.getContext("2d");
  if (!ctx) return src;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(src, x * k, y * k, w * k, h * k, 0, 0, out.width, out.height);
  return out;
}

export default function Cushion3D({
  sheet,
  sheetMm,
  mock,
  title,
  onClose,
}: {
  /** ลายทั้งอาร์ตบอร์ด (วาดจากตัววาดจริงของจอออกแบบ) */
  sheet: HTMLCanvasElement;
  sheetMm: { w: number; h: number };
  mock: CushionMock;
  title: string;
  onClose: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [spin, setSpin] = useState(false);
  const [view, setView] = useState<CushionView>("front");
  const [zoom, setZoomState] = useState(1);
  const clampZ = (z: number) => Math.max(0.6, Math.min(3, z));
  const cam = useRef({ yaw: 0, pitch: 0.22, zoom: 1, targetYaw: null as number | null, spin: false, dragging: false });
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; z: number } | null>(null);
  const setZoom = (fn: (z: number) => number) => {
    const z = clampZ(fn(cam.current.zoom));
    cam.current.zoom = z;
    setZoomState(z);
  };
  const goView = (v: CushionView) => {
    setView(v);
    const cur = cam.current.yaw;
    let t = VIEW_YAW[v];
    while (t - cur > Math.PI) t -= 2 * Math.PI;
    while (t - cur < -Math.PI) t += 2 * Math.PI;
    cam.current.targetYaw = t;
    cam.current.spin = false;
    setSpin(false);
  };
  useEffect(() => {
    cam.current.spin = spin;
  }, [spin]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    let dead = false;
    let cleanup: (() => void) | null = null;
    (async () => {
      try {
        const THREE = await import("three");
        const { RoomEnvironment } = await import("three/examples/jsm/environments/RoomEnvironment.js");
        if (dead) return;
        const W = sheetMm.w;
        const H = sheetMm.h;
        const k = sheet.width / W;
        // ขนาดสำเร็จ: จากตัวเลือก · ไม่รู้ = ครึ่งผืน - เผื่อเย็บ (ไม่เกินความสูงผืน)
        const S = Math.min(H - 6, mock.sizeMm > 0 ? Math.min(mock.sizeMm, W / 2 - 4) : W / 2 - 36);
        const D = S * 0.34; // ความหนาตอนยัดไส้
        // 🖼 ผิวหน้า = กึ่งกลางครึ่งซ้าย · ผิวหลัง = กึ่งกลางครึ่งขวา (ผืน "Cushion Zip": หน้า | หลัง | แถบซิป)
        const frontCv = cropCanvas(sheet, k, W / 4 - S / 2, H / 2 - S / 2, S, S);
        const backCv = cropCanvas(sheet, k, (3 * W) / 4 - S / 2, H / 2 - S / 2, S, S);

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.NeutralToneMapping;
        renderer.toneMappingExposure = 1;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFShadowMap;
        renderer.domElement.style.width = "100%";
        renderer.domElement.style.height = "100%";
        renderer.domElement.style.display = "block";
        box.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const pmrem = new THREE.PMREMGenerator(renderer);
        const room = new RoomEnvironment();
        const envTex = pmrem.fromScene(room, 0.04).texture;
        room.dispose();
        scene.environment = envTex;
        scene.environmentIntensity = 0.4;

        const camera = new THREE.PerspectiveCamera(28, 1, 1, 8000);
        const BASE_DIST = S * 2.7;

        const sun = new THREE.DirectionalLight(0xffffff, 1.1);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        const sh = S * 1.4;
        sun.shadow.camera.left = sun.shadow.camera.bottom = -sh;
        sun.shadow.camera.right = sun.shadow.camera.top = sh;
        sun.shadow.camera.near = 10;
        sun.shadow.camera.far = 4000;
        sun.shadow.bias = -0.0005;
        sun.shadow.radius = 4;
        scene.add(sun);
        scene.add(new THREE.AmbientLight(0xffffff, 1.0));

        const geos: { dispose(): void }[] = [];
        const mats: { dispose(): void }[] = [];
        const g = <T extends { dispose(): void }>(x: T) => (geos.push(x), x);
        const m = <T extends { dispose(): void }>(x: T) => (mats.push(x), x);

        const ground = new THREE.Mesh(g(new THREE.PlaneGeometry(5000, 5000)), m(new THREE.ShadowMaterial({ opacity: 0.14 })));
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = 0;
        ground.receiveShadow = true;
        scene.add(ground);

        const texOf = (cv: HTMLCanvasElement) => {
          const t = new THREE.CanvasTexture(cv);
          t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = renderer.capabilities.getMaxAnisotropy();
          mats.push(t);
          return t;
        };
        // 🧵 ผิวผ้า: ลายทอละเอียดเป็น bump (ผ้าใบสุ่มเกรน) + sheen ให้สะท้อนแสงนุ่มแบบผ้า ไม่ใช่พลาสติกเงา
        const weave = document.createElement("canvas");
        weave.width = weave.height = 256;
        const wx = weave.getContext("2d");
        if (wx) {
          const im = wx.createImageData(256, 256);
          for (let i = 0; i < im.data.length; i += 4) {
            const px = (i / 4) % 256;
            const py = Math.floor(i / 4 / 256);
            // เส้นทอแนวตั้ง/นอนสลับ + เกรนสุ่ม
            const v = 128 + 26 * Math.sin(px * 1.6) * Math.sin(py * 1.6) + (Math.random() - 0.5) * 36;
            im.data[i] = im.data[i + 1] = im.data[i + 2] = Math.max(0, Math.min(255, v));
            im.data[i + 3] = 255;
          }
          wx.putImageData(im, 0, 0);
        }
        const weaveTex = new THREE.CanvasTexture(weave);
        weaveTex.wrapS = weaveTex.wrapT = THREE.RepeatWrapping;
        weaveTex.repeat.set(S / 14, S / 14);
        mats.push(weaveTex);
        const fabric = (map: InstanceType<typeof THREE.CanvasTexture>) =>
          m(
            new THREE.MeshPhysicalMaterial({
              map,
              roughness: 0.88,
              metalness: 0,
              envMapIntensity: 0.55,
              sheen: 0.55,
              sheenRoughness: 0.75,
              sheenColor: new THREE.Color(0xffffff),
              bumpMap: weaveTex,
              bumpScale: 0.35,
            }),
          );

        /**
         * แผ่นดัดโป่งแบบหมอนยัดไส้ (ปรับตามรูปสินค้าจริง · เจ้าของร้านขอ 22 ต.ค. 69 "ทำให้ทรงคล้ายของจริงมากกว่านี้"):
         * · ขอบโค้งเว้าเข้า — ไส้ดันกลางผืนพอง ขอบกลางด้านถูกดึงเข้า ~4.5% · มุมคงที่จึงดูแหลมยื่นออก
         * · โปรไฟล์โป่ง: กลางสูง D/2 ไล่ลงนุ่ม ๆ (e^0.62) · มุมถูกตะเข็บดึงแบน
         * · รอยย่นผ้าเบา ๆ หนาแน่นใกล้ขอบ/มุม (คลื่น sin ซ้อนกัน) ให้ผิวไม่เรียบเหมือนพลาสติก
         */
        const puffPlane = () => {
          const SEG = 110;
          const geo = g(new THREE.PlaneGeometry(S, S, SEG, SEG));
          const pos = geo.attributes.position;
          const h = S / 2;
          for (let i = 0; i < pos.count; i++) {
            const u = pos.getX(i) / h;
            const v = pos.getY(i) / h;
            const au = Math.abs(u);
            const av = Math.abs(v);
            // ขอบเว้า: จุดบนขอบขวา (au=1) ขยับเข้าตามความใกล้กลางขอบ (1-av²) · มุม (av=1) ไม่ขยับ
            const inset = 0.045;
            const x = u * h * (1 - inset * (1 - av * av) * Math.pow(au, 2.2));
            const y = v * h * (1 - inset * (1 - au * au) * Math.pow(av, 2.2));
            const e = Math.max(0, (1 - Math.pow(au, 2.7)) * (1 - Math.pow(av, 2.7)));
            const corner = 1 - 0.5 * Math.pow(au * av, 1.6);
            let z = (D / 2) * Math.pow(e, 0.62) * corner;
            // รอยย่น: แรงขึ้นเมื่อเข้าใกล้ขอบ (1-e) · สองคลื่นซ้อนทิศต่างกัน + คลื่นเฉียงจากมุม
            const w1 = Math.sin(u * 9.3 + v * 2.1) * Math.sin(v * 7.7 - u * 1.4);
            const w2 = Math.sin((u + v) * 11.0) * 0.5;
            const w3 = Math.sin((au - av) * 13.0 + 1.3) * Math.pow(au * av, 1.2);
            z += S * 0.0075 * (0.6 + 0.8 * (1 - e)) * (w1 + w2) + S * 0.012 * w3;
            pos.setXYZ(i, x, y, Math.max(0, z));
          }
          pos.needsUpdate = true;
          geo.computeVertexNormals();
          return geo;
        };

        const root = new THREE.Group();
        scene.add(root);
        const add = (mesh: InstanceType<typeof THREE.Mesh>, shadow = true) => {
          mesh.castShadow = shadow;
          mesh.receiveShadow = false;
          root.add(mesh);
          return mesh;
        };

        const front = add(new THREE.Mesh(puffPlane(), fabric(texOf(frontCv))));
        const back = add(new THREE.Mesh(puffPlane(), fabric(texOf(backCv))));
        back.rotation.y = Math.PI; // หันโป่งไปทาง -z · มองจากด้านหลังลายอ่านถูกทิศ

        // 🧵 ตะเข็บรอบ (ริมผ้าเย็บ) + ซิปขอบขวา (แถบ "พับทำสายซิป" ของเทมเพลต)
        // ตะเข็บ = แนวที่แผ่นหน้า/หลังบรรจบกัน (ไม่ต้องวาดเส้นเพิ่ม) · ซิปวิ่งตามขอบขวาที่โค้งเว้า (TubeGeometry ตามสูตร inset เดียวกับแผ่น)
        const zipMat = m(new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.5, metalness: 0.45 }));
        const zipW = Math.max(2.2, S * 0.012);
        const edgeX = (v: number) => (S / 2) * (1 - 0.045 * (1 - v * v));
        const zipPts: InstanceType<typeof THREE.Vector3>[] = [];
        for (let t = -0.84; t <= 0.84; t += 0.06) zipPts.push(new THREE.Vector3(edgeX(t) - zipW * 0.3, t * (S / 2), 0));
        const zipCurve = new THREE.CatmullRomCurve3(zipPts);
        const zip = add(new THREE.Mesh(g(new THREE.TubeGeometry(zipCurve, 40, zipW / 2, 8, false)), zipMat), false);
        void zip;
        const slider = add(new THREE.Mesh(g(new THREE.BoxGeometry(zipW * 1.6, zipW * 2.6, zipW * 1.8)), zipMat), false);
        slider.position.set(edgeX(-0.6) - zipW * 0.3, -0.6 * (S / 2), 0);

        // วางหมอน: ตั้งพิงเอียงหลังเล็กน้อยเหมือนวางบนโซฟา · ขอบล่างแตะพื้น
        root.rotation.x = -0.2;
        root.position.y = S / 2 + 2;
        const lookY = S / 2;

        const place = () => {
          const w = box.clientWidth || 1;
          const h = box.clientHeight || 1;
          renderer.setSize(w, h, false);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
        };
        place();
        const ro = new ResizeObserver(place);
        ro.observe(box);

        let raf = 0;
        let last = performance.now();
        const tick = (now: number) => {
          raf = requestAnimationFrame(tick);
          const dt = Math.min(0.05, (now - last) / 1000);
          last = now;
          const c = cam.current;
          if (c.targetYaw != null) {
            const d = c.targetYaw - c.yaw;
            if (Math.abs(d) < 0.004) {
              c.yaw = c.targetYaw;
              c.targetYaw = null;
            } else c.yaw += d * Math.min(1, dt * 7);
          } else if (c.spin && !c.dragging) c.yaw += dt * 0.55;
          const dist = BASE_DIST / c.zoom;
          const cp = Math.cos(c.pitch);
          camera.position.set(dist * Math.sin(c.yaw) * cp, dist * Math.sin(c.pitch) + lookY, dist * Math.cos(c.yaw) * cp);
          camera.lookAt(0, lookY, 0);
          sun.position.set(camera.position.x, 0, camera.position.z).normalize().multiplyScalar(BASE_DIST * 1.1);
          sun.position.y = BASE_DIST * 0.9;
          sun.position.x += BASE_DIST * 0.25 * Math.cos(c.yaw);
          sun.position.z -= BASE_DIST * 0.25 * Math.sin(c.yaw);
          renderer.render(scene, camera);
        };
        raf = requestAnimationFrame(tick);
        setStatus("ready");

        cleanup = () => {
          cancelAnimationFrame(raf);
          ro.disconnect();
          geos.forEach((x) => x.dispose());
          mats.forEach((x) => x.dispose());
          envTex.dispose();
          pmrem.dispose();
          renderer.dispose();
          renderer.forceContextLoss();
          renderer.domElement.remove();
        };
        if (dead) cleanup();
      } catch (e) {
        console.error("Cushion3D", e);
        if (!dead) setStatus("error");
      }
    })();
    return () => {
      dead = true;
      cleanup?.();
    };
    // สร้างฉากครั้งเดียวต่อการเปิด
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-stone-900/55 p-3 backdrop-blur-[2px]" onClick={onClose}>
      <div className="relative flex w-full max-w-3xl flex-col rounded-3xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-3.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-500 text-lg shadow-[0_4px_12px_rgba(139,92,246,.35)]">
            🛋
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex min-w-0 items-center gap-2 text-[15px] font-extrabold leading-tight text-stone-800">
              <span className="shrink-0">ดูแบบ 3D</span>
              <span className="inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-[11px] font-extrabold text-stone-700 ring-1 ring-sky-200">
                <span className="truncate">ปลอกหมอนอิง</span>
                {mock.label ? <span className="truncate text-stone-400">· {mock.label}</span> : null}
              </span>
            </p>
            <p className="truncate text-xs text-stone-500">
              {title} · ลาย {Math.round(sheetMm.w) / 10}×{Math.round(sheetMm.h) / 10} ซม. (หน้า+หลังกางออก)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full text-lg text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
            aria-label="ปิด"
          >
            ✕
          </button>
        </div>

        <div
          ref={boxRef}
          className="relative mx-3 h-[min(60vh,500px)] cursor-grab touch-none select-none overflow-hidden rounded-2xl bg-[radial-gradient(ellipse_at_50%_38%,#ffffff_0%,#f1f5f9_55%,#e2e8f0_100%)] ring-1 ring-stone-200/70 active:cursor-grabbing"
          onWheel={(e) => setZoom((z) => z * Math.exp(-e.deltaY * 0.0015))}
          onDoubleClick={() => setZoom((z) => (z > 1.05 ? 1 : 2))}
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (pts.current.size === 2) {
              const [a, b] = [...pts.current.values()];
              pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), z: cam.current.zoom };
              drag.current = null;
              cam.current.dragging = false;
              return;
            }
            drag.current = { x: e.clientX, y: e.clientY, yaw: cam.current.yaw, pitch: cam.current.pitch };
            cam.current.targetYaw = null;
            cam.current.dragging = true;
          }}
          onPointerMove={(e) => {
            if (pts.current.has(e.pointerId)) pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (pinch.current && pts.current.size === 2) {
              const [a, b] = [...pts.current.values()];
              const p = pinch.current;
              setZoom(() => (p.z * Math.hypot(a.x - b.x, a.y - b.y)) / Math.max(1, p.d));
              return;
            }
            const d = drag.current;
            if (!d) return;
            cam.current.yaw = d.yaw + (e.clientX - d.x) * 0.011;
            cam.current.pitch = Math.max(-0.15, Math.min(1.2, d.pitch + (e.clientY - d.y) * 0.006));
          }}
          onPointerUp={(e) => {
            pts.current.delete(e.pointerId);
            if (pts.current.size < 2) pinch.current = null;
            drag.current = null;
            cam.current.dragging = false;
          }}
          onPointerCancel={(e) => {
            pts.current.delete(e.pointerId);
            pinch.current = null;
            drag.current = null;
            cam.current.dragging = false;
          }}
        >
          {status !== "ready" && (
            <div className="absolute inset-0 z-20 grid place-items-center">
              {status === "loading" ? (
                <div className="flex flex-col items-center gap-2 text-stone-500">
                  <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-violet-200 border-t-violet-600" />
                  <span className="text-xs font-bold">กำลังสร้างโมเดล 3D…</span>
                </div>
              ) : (
                <p className="max-w-xs rounded-2xl bg-white/90 p-4 text-center text-xs font-bold text-rose-600 ring-1 ring-rose-200">
                  เบราว์เซอร์นี้แสดงภาพ 3D ไม่ได้ (ต้องรองรับ WebGL) — ลองเปิดใน Chrome/Safari รุ่นใหม่
                </p>
              )}
            </div>
          )}
          <div className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[calc(100%-170px)] items-center gap-2 rounded-full bg-white/90 py-1.5 pl-1.5 pr-3.5 shadow-sm ring-1 ring-stone-200 backdrop-blur">
            <span className="whitespace-nowrap rounded-full bg-sky-600 px-2 py-0.5 text-[11px] font-extrabold text-white">🛋 ยัดไส้แล้ว</span>
            <span className="truncate text-xs font-bold text-stone-700">{spin ? "หมุนโชว์รอบตัว" : CUSHION_VIEW_TH[view]}</span>
          </div>
          <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-3 whitespace-nowrap rounded-full bg-stone-900/70 px-3.5 py-1.5 text-[11px] font-semibold text-white backdrop-blur">
            <span className="hidden sm:inline">↔ ลาก = หมุนดูรอบตัว</span>
            <span className="sm:hidden">↔ หมุน</span>
            <span className="h-3 w-px bg-white/30" />
            <span className="hidden sm:inline">↕ ลาก = เงย/ก้ม</span>
            <span className="sm:hidden">↕ เงย/ก้ม</span>
            <span className="h-3 w-px bg-white/30" />
            <span className="hidden sm:inline">🔍 ล้อเมาส์/หยิก = ซูม</span>
            <span className="sm:hidden">🔍 หยิก = ซูม</span>
          </div>
          <div
            className="absolute right-3 top-3 z-10 flex items-center rounded-full bg-white/90 p-0.5 shadow-sm ring-1 ring-stone-200 backdrop-blur"
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <button type="button" onClick={() => setZoom((z) => z / 1.25)} className="grid h-8 w-8 place-items-center rounded-full text-lg font-bold text-stone-600 hover:bg-stone-100" aria-label="ซูมออก">
              −
            </button>
            <button type="button" onClick={() => setZoom(() => 1)} className="min-w-[52px] rounded-full px-1 text-xs font-extrabold text-stone-700 hover:bg-stone-100" title="กลับขนาดปกติ">
              {Math.round(zoom * 100)}%
            </button>
            <button type="button" onClick={() => setZoom((z) => z * 1.25)} className="grid h-8 w-8 place-items-center rounded-full text-lg font-bold text-stone-600 hover:bg-stone-100" aria-label="ซูมเข้า">
              +
            </button>
          </div>
        </div>

        <div className="space-y-2.5 px-4 pb-4 pt-3">
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
            <span className="flex items-center rounded-full bg-stone-100 p-0.5 ring-1 ring-stone-200/70" role="radiogroup" aria-label="มุมมอง">
              {(["left", "front", "right", "back"] as CushionView[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={!spin && view === v}
                  onClick={() => goView(v)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${!spin && view === v ? "bg-sky-600 text-white shadow-sm" : "text-stone-500 hover:text-stone-800"}`}
                >
                  {v === "front" ? "👁 ด้านหน้า" : CUSHION_VIEW_TH[v]}
                </button>
              ))}
            </span>
            <button
              type="button"
              aria-pressed={spin}
              onClick={() => setSpin((s) => !s)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-extrabold ring-1 transition ${spin ? "bg-violet-600 text-white ring-violet-600 shadow-sm" : "bg-white text-violet-700 ring-violet-200 hover:bg-violet-50"}`}
            >
              {spin ? "⏸ หยุดหมุน" : "🔄 หมุนโชว์รอบตัว"}
            </button>
          </div>
          <p className="text-center text-[11px] text-stone-400">
            ภาพจำลองโดยประมาณ — ด้านหน้า/หลังจากครึ่งซ้าย/ขวาของผืนเทมเพลต ขอบที่เผื่อเย็บหายเข้าตะเข็บ · สีจริงอาจต่างจากหน้าจอเล็กน้อย
          </p>
        </div>
      </div>
    </div>
  );
}
