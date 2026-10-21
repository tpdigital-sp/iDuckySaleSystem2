"use client";

/**
 * 📱🧊 โมเดล 3D ที่ตั้งโทรศัพท์ — ลายที่ลูกค้าออกแบบอยู่บนแผ่นจริงให้เห็นก่อนสั่ง
 * (เจ้าของร้านสั่ง 21 ต.ค. 69 "360° PHONE STAND / PHONE STAND 3 STEP สินค้า 2 ตัวนี้ ช่วยทำ 3D ให้หน่อย")
 *
 * three.js โหลดตอนกดปุ่มเท่านั้น (import()) · โครงเดียวกับ Mug3D (RoomEnvironment · ไฟตามกล้อง · ลาก=หมุน · ล้อ/หยิก=ซูม)
 * แผ่นพิมพ์ = ทรงตามเส้นไดคัทของเทมเพลต (cut · มม. พิกัดอาร์ตบอร์ด) — ลายครอปตามเส้นนั้นเหมือนไฟล์งาน
 *   stand360: แผ่น ABS ขาวทึบหนา 3 มม. (ExtrudeGeometry) + ลายด้านหน้า + ที่ตั้งโทรศัพท์ใส 2 ตัว + แกนหมุน + ฐาน (สี่เหลี่ยม/กลม)
 *   stand3:   แผ่น ABS ใสแผ่นเดียว พับ 2 รอย (PlaneGeometry ดัดตามโปรไฟล์) ลายพิมพ์ด้านเดียวมองทะลุได้ · ปุ่มกางระดับ 1-3
 */

import { useEffect, useRef, useState } from "react";
import type { TemplateCurve } from "@/lib/design-templates";
import { STAND_KIND_TH, STAND_VIEW_TH, type StandMock, type StandView } from "@/lib/stand-mock";

/** มุมกล้อง (เรเดียน รอบแกนตั้ง) — ด้านหน้าแผ่นหันไป +z */
const VIEW_YAW: Record<StandView, number> = { front: 0, right: Math.PI / 2, left: -Math.PI / 2, back: Math.PI };

/** รอยพับของ Phone Stand 3 step (สัดส่วนจากขอบบนแผ่น — ภาพขนาดสินค้า "รอยพับ" 2 เส้น) */
const FOLD_A = 0.55;
const FOLD_B = 0.75;
/** มุมแผ่นพนัก (A) เทียบพื้นโต๊ะ ตามระดับการกาง · แผ่นค้ำ (B) ชันคงที่ */
const LEVEL_DEG: Record<1 | 2 | 3, number> = { 1: 48, 2: 60, 3: 72 };
const SUPPORT_DEG = 58;

/** ครอปลายตามเส้นไดคัท (นอกเส้น = โปร่ง) · k = พิกเซล/มม. */
function clipCanvas(src: HTMLCanvasElement, cut: TemplateCurve[], k: number): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext("2d");
  if (!ctx) return src;
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = "destination-in";
  ctx.beginPath();
  for (const c of cut) {
    ctx.moveTo(c.s[0] * k, c.s[1] * k);
    for (const g of c.g) ctx.bezierCurveTo(g[0] * k, g[1] * k, g[2] * k, g[3] * k, g[4] * k, g[5] * k);
    ctx.closePath();
  }
  ctx.fillStyle = "#000";
  ctx.fill("evenodd");
  return out;
}

/** มาสก์ทรงแผ่น (ขาวใน / ดำนอก) สำหรับ alphaMap ของแผ่นใส */
function maskCanvas(w: number, h: number, cut: TemplateCurve[], k: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  ctx.beginPath();
  for (const cv of cut) {
    ctx.moveTo(cv.s[0] * k, cv.s[1] * k);
    for (const g of cv.g) ctx.bezierCurveTo(g[0] * k, g[1] * k, g[2] * k, g[3] * k, g[4] * k, g[5] * k);
    ctx.closePath();
  }
  ctx.fillStyle = "#fff";
  ctx.fill("evenodd");
  return c;
}

export default function Stand3D({
  sheet,
  sheetMm,
  cut,
  mock,
  title,
  onClose,
}: {
  /** ลายทั้งอาร์ตบอร์ด (วาดจากตัววาดจริงของจอออกแบบ · ยังไม่ครอป) */
  sheet: HTMLCanvasElement;
  sheetMm: { w: number; h: number };
  /** เส้นไดคัทของเทมเพลต (มม. พิกัดอาร์ตบอร์ด) · ไม่มี = ใช้ทั้งสี่เหลี่ยม */
  cut?: TemplateCurve[] | null;
  mock: StandMock;
  title: string;
  onClose: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [spin, setSpin] = useState(false);
  const [view, setView] = useState<StandView>("front");
  const [level, setLevel] = useState<1 | 2 | 3>(mock.level);
  const [zoom, setZoomState] = useState(1);
  const clampZ = (z: number) => Math.max(0.6, Math.min(3, z));
  const cam = useRef({ yaw: 0, pitch: 0.28, zoom: 1, targetYaw: null as number | null, spin: false, dragging: false });
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; z: number } | null>(null);
  /** แผ่น 3 step: ฟังก์ชันดัดแผ่นใหม่ตามระดับ (ตั้งตอนสร้างฉาก) */
  const bendRef = useRef<((lv: 1 | 2 | 3) => void) | null>(null);
  const setZoom = (fn: (z: number) => number) => {
    const z = clampZ(fn(cam.current.zoom));
    cam.current.zoom = z;
    setZoomState(z);
  };
  const goView = (v: StandView) => {
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
    bendRef.current?.(level);
  }, [level]);

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
        const cutCs: TemplateCurve[] = cut?.length ? cut : [{ s: [0, 0], g: [[W, 0, W, 0, W, 0], [W, H, W, H, W, H], [0, H, 0, H, 0, H], [0, 0, 0, 0, 0, 0]] }];

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
        scene.environmentIntensity = 0.45;

        const camera = new THREE.PerspectiveCamera(28, 1, 1, 5000);
        // ระยะกล้องเริ่มต้น — 3 step พับแล้วเตี้ยกว่าแผ่นจริง เข้าใกล้กว่า 360° ที่ยืนเต็มความสูง
        const BASE_DIST = Math.max(W, H) * (mock.kind === "stand3" ? 2.2 : 2.9);

        const sun = new THREE.DirectionalLight(0xffffff, 1.15);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        const sh = Math.max(W, H) * 1.6;
        sun.shadow.camera.left = sun.shadow.camera.bottom = -sh;
        sun.shadow.camera.right = sun.shadow.camera.top = sh;
        sun.shadow.camera.near = 10;
        sun.shadow.camera.far = 2500;
        sun.shadow.bias = -0.0005;
        sun.shadow.radius = 4;
        scene.add(sun);
        scene.add(new THREE.AmbientLight(0xffffff, 1.0));

        const geos: { dispose(): void }[] = [];
        const mats: { dispose(): void }[] = [];
        const g = <T extends { dispose(): void }>(x: T) => (geos.push(x), x);
        const m = <T extends { dispose(): void }>(x: T) => (mats.push(x), x);

        const ground = new THREE.Mesh(g(new THREE.PlaneGeometry(3000, 3000)), m(new THREE.ShadowMaterial({ opacity: 0.14 })));
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = 0;
        ground.receiveShadow = true;
        scene.add(ground);

        // 🖼 ลาย (ครอปตามเส้นไดคัท) — repeat 1/W,1/H ให้พิกัดมม.ของทรงกลายเป็น uv ตรง ๆ
        const printed = clipCanvas(sheet, cutCs, k);
        const tex = new THREE.CanvasTexture(printed);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        mats.push(tex);

        const clearMat = () =>
          m(
            new THREE.MeshPhysicalMaterial({
              color: 0xffffff,
              roughness: 0.06,
              metalness: 0,
              clearcoat: 1,
              clearcoatRoughness: 0.04,
              envMapIntensity: 1.8,
              transparent: true,
              opacity: 0.22,
              depthWrite: false,
              side: THREE.DoubleSide,
            }),
          );

        /** ทรงแผ่นจาก cutCurves (y กลับด้าน: อาร์ตบอร์ด y ลง → โลก y ขึ้น) · เส้นใหญ่สุด = ขอบนอก ที่เหลือ = รู */
        const toShape = () => {
          const area = (c: TemplateCurve) => {
            let a = 0;
            let px = c.s[0];
            let py = c.s[1];
            for (const s of c.g) {
              a += px * s[5] - s[4] * py;
              px = s[4];
              py = s[5];
            }
            return Math.abs(a / 2);
          };
          const sorted = [...cutCs].sort((a, b) => area(b) - area(a));
          const path = (c: TemplateCurve, p: InstanceType<typeof THREE.Path>) => {
            p.moveTo(c.s[0], H - c.s[1]);
            for (const s of c.g) p.bezierCurveTo(s[0], H - s[1], s[2], H - s[3], s[4], H - s[5]);
            p.closePath();
          };
          const shape = new THREE.Shape();
          path(sorted[0], shape);
          for (const h of sorted.slice(1)) {
            const hp = new THREE.Path();
            path(h, hp);
            shape.holes.push(hp);
          }
          return shape;
        };

        const root = new THREE.Group();
        scene.add(root);
        const add = (mesh: InstanceType<typeof THREE.Mesh>, shadow = true) => {
          mesh.castShadow = shadow;
          mesh.receiveShadow = false;
          root.add(mesh);
          return mesh;
        };
        let lookY = H / 2;

        if (mock.kind === "stand360") {
          // ── 360°: แผ่นขาวทึบ 3 มม. เอียงหลัง 10° บนแกนหมุน + ฐาน ──
          const shape = toShape();
          const T = 3;
          const plate = new THREE.Group();
          const white = m(new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.3 }));
          const body = add(new THREE.Mesh(g(new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false, curveSegments: 24 })), white));
          body.position.z = -T / 2;
          plate.add(body);
          // ลายด้านหน้า (ShapeGeometry uv = พิกัดมม. → repeat 1/W,1/H)
          const decalTex = tex;
          decalTex.repeat.set(1 / W, 1 / H);
          const decal = new THREE.Mesh(
            g(new THREE.ShapeGeometry(shape, 24)),
            m(new THREE.MeshPhysicalMaterial({ map: decalTex, roughness: 0.5, metalness: 0, clearcoat: 0.2, clearcoatRoughness: 0.4, transparent: true, alphaTest: 0.02 })),
          );
          decal.position.z = T / 2 + 0.06;
          plate.add(decal);
          // 📱 ที่ตั้งโทรศัพท์ใส 2 ตัว ด้านล่างแผ่น
          const hw = Math.min(16, W * 0.2);
          const hd = 9;
          const hh = Math.min(18, H * 0.16);
          for (const sx of [-1, 1]) {
            const holder = add(new THREE.Mesh(g(new THREE.BoxGeometry(hw, hh, hd)), clearMat()), false);
            holder.position.set(W / 2 + sx * W * 0.2, hh / 2 + 2, T / 2 + hd / 2);
            plate.add(holder);
            const lip = add(new THREE.Mesh(g(new THREE.BoxGeometry(hw, 2.2, hd + 1)), clearMat()), false);
            lip.position.set(W / 2 + sx * W * 0.2, 2.6, T / 2 + hd / 2);
            plate.add(lip);
          }
          // วางแผ่น: จุดหมุนที่ขอบล่างกลาง เอียงหลัง 10°
          plate.position.set(-W / 2, 0, 0);
          const tilt = new THREE.Group();
          tilt.add(plate);
          tilt.rotation.x = -0.17;
          tilt.position.y = 9;
          root.add(tilt);
          // แกนหมุน + ฐาน (ตามตัวเลือกขนาด)
          const dark = m(new THREE.MeshStandardMaterial({ color: 0xe9eef2, roughness: 0.5 }));
          const pivot = add(new THREE.Mesh(g(new THREE.CylinderGeometry(9, 11, 6, 48)), dark));
          pivot.position.y = 6;
          const hinge = add(new THREE.Mesh(g(new THREE.BoxGeometry(W * 0.36, 8, 6)), dark));
          hinge.position.set(0, 9, -1);
          if (mock.base === "square") {
            const bw = W * 1.15;
            const bd = W * 0.9;
            const base = add(new THREE.Mesh(g(new THREE.BoxGeometry(bw, 3, bd)), clearMat()), true);
            base.position.set(0, 1.5, -bd * 0.12);
          } else {
            const base = add(new THREE.Mesh(g(new THREE.CylinderGeometry(W * 0.5, W * 0.52, 3, 64)), white), true);
            base.position.set(0, 1.5, 0);
          }
          lookY = H * 0.5 + 6;
        } else {
          // ── 3 step: แผ่นใสแผ่นเดียว พับ 2 รอย — PlaneGeometry ดัดตามโปรไฟล์ (t = ระยะจากขอบล่างแผ่น) ──
          const SEG = 180;
          const geo = g(new THREE.PlaneGeometry(W, H, 1, SEG));
          const base0 = geo.attributes.position.array.slice() as Float32Array;
          const mask = new THREE.CanvasTexture(maskCanvas(sheet.width, sheet.height, cutCs, k));
          mats.push(mask);
          const sheetMat = clearMat();
          sheetMat.alphaMap = mask;
          sheetMat.alphaTest = 0.5;
          sheetMat.opacity = 0.3;
          const printMat = m(
            new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.4, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.4, transparent: true, alphaTest: 0.04, side: THREE.DoubleSide }),
          );
          const plastic = add(new THREE.Mesh(geo, sheetMat), true);
          const print = add(new THREE.Mesh(geo, printMat), false);
          print.renderOrder = 1;
          const bend = (lv: 1 | 2 | 3) => {
            const aDeg = LEVEL_DEG[lv];
            const Lc = H * (1 - FOLD_B);
            const Lb = H * (FOLD_B - FOLD_A);
            const La = H * FOLD_A;
            const tb = (SUPPORT_DEG * Math.PI) / 180;
            const ta = (aDeg * Math.PI) / 180;
            // จุดเริ่ม: C นอนราบจากหน้า (z=0) ไปหลัง · B ชันขึ้นมาข้างหน้า · A พนักเอียงกลับไปข้างหลัง
            const bz0 = -Lc;
            const by0 = 0;
            const az0 = bz0 + Lb * Math.cos(tb);
            const ay0 = by0 + Lb * Math.sin(tb);
            const pos = geo.attributes.position;
            for (let i = 0; i < pos.count; i++) {
              const x = base0[i * 3];
              const y = base0[i * 3 + 1];
              const t = y + H / 2; // 0 = ขอบล่าง (ปลาย C) · H = ขอบบน (ปลาย A)
              let pz: number;
              let py: number;
              if (t <= Lc) {
                pz = -t;
                py = 0.6;
              } else if (t <= Lc + Lb) {
                const s = t - Lc;
                pz = bz0 + s * Math.cos(tb);
                py = by0 + s * Math.sin(tb) + 0.6;
              } else {
                const s = t - Lc - Lb;
                pz = az0 - s * Math.cos(ta);
                py = ay0 + s * Math.sin(ta) + 0.6;
              }
              pos.setXYZ(i, x, py, pz);
            }
            pos.needsUpdate = true;
            geo.computeVertexNormals();
            geo.computeBoundingSphere();
            void La;
          };
          bend(mock.level);
          bendRef.current = bend;
          // ให้ส่วนพนักอยู่กลางภาพ
          root.position.z = H * 0.25;
          lookY = H * 0.32;
        }

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
          bendRef.current = null;
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
        console.error("Stand3D", e);
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

  const is360 = mock.kind === "stand360";

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-stone-900/55 p-3 backdrop-blur-[2px]" onClick={onClose}>
      <div className="relative flex w-full max-w-3xl flex-col rounded-3xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-3.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-500 text-lg shadow-[0_4px_12px_rgba(139,92,246,.35)]">
            📱
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex min-w-0 items-center gap-2 text-[15px] font-extrabold leading-tight text-stone-800">
              <span className="shrink-0">ดูแบบ 3D</span>
              <span className="inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-[11px] font-extrabold text-stone-700 ring-1 ring-sky-200">
                <span className="truncate">{STAND_KIND_TH[mock.kind]}</span>
                {mock.label ? <span className="truncate text-stone-400">· {mock.label}</span> : null}
              </span>
            </p>
            <p className="truncate text-xs text-stone-500">
              {title} · ลาย {Math.round(sheetMm.w) / 10}×{Math.round(sheetMm.h) / 10} ซม.
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
            <span className="whitespace-nowrap rounded-full bg-sky-600 px-2 py-0.5 text-[11px] font-extrabold text-white">
              {is360 ? (mock.base === "square" ? "📱 ฐานสี่เหลี่ยม" : "📱 ฐานกลม") : `📱 กางระดับ ${level}`}
            </span>
            <span className="truncate text-xs font-bold text-stone-700">{spin ? "หมุนโชว์รอบตัว" : STAND_VIEW_TH[view]}</span>
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
              {(["left", "front", "right", "back"] as StandView[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={!spin && view === v}
                  onClick={() => goView(v)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${!spin && view === v ? "bg-sky-600 text-white shadow-sm" : "text-stone-500 hover:text-stone-800"}`}
                >
                  {v === "front" ? "👁 ด้านหน้า" : STAND_VIEW_TH[v]}
                </button>
              ))}
            </span>
            {!is360 && (
              <span className="flex items-center rounded-full bg-stone-100 p-0.5 ring-1 ring-stone-200/70" role="radiogroup" aria-label="ระดับการกาง">
                {([1, 2, 3] as const).map((lv) => (
                  <button
                    key={lv}
                    type="button"
                    role="radio"
                    aria-checked={level === lv}
                    onClick={() => setLevel(lv)}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${level === lv ? "bg-emerald-600 text-white shadow-sm" : "text-stone-500 hover:text-stone-800"}`}
                  >
                    กาง {lv}
                  </button>
                ))}
              </span>
            )}
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
            {is360
              ? "ภาพจำลองโดยประมาณ — แผ่นพิมพ์ทรงตามเทมเพลต ตั้งบนฐานหมุน 360° · สีจริงอาจต่างจากหน้าจอเล็กน้อย"
              : "ภาพจำลองโดยประมาณ — แผ่นใสพับ 2 รอย กางตั้งได้ 3 ระดับ ลายพิมพ์ด้านเดียวมองทะลุได้ · สีจริงอาจต่างจากหน้าจอเล็กน้อย"}
          </p>
        </div>
      </div>
    </div>
  );
}
