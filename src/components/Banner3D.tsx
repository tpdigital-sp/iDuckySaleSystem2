"use client";

/**
 * 🪧🧊 โมเดล 3D ป้ายขาตั้ง — ลายที่ลูกค้าออกแบบอยู่บนป้ายไวนิลจริง (X-Stand / Roll UP) ให้เห็นก่อนสั่ง
 * (เจ้าของร้านสั่ง 22 ต.ค. 69 "ทำ 3D เพิ่มให้หน่อย" — ป้ายขาตั้ง x-stand + roll-up)
 *
 * three.js โหลดตอนกดปุ่มเท่านั้น (import()) · โครงเดียวกับ Cushion3D/Stand3D/Mug3D (RoomEnvironment · ไฟตามกล้อง · ลาก=หมุน · ล้อ/หยิก=ซูม)
 *   xstand: ผืนไวนิล = ทั้งอาร์ตบอร์ด (600×1600) + ตาไก่โลหะ 4 มุม (ตรงจุดเขียวในไฟล์ · 20 มม. จากขอบ) · โครงคาร์บอนดำไขว้ X ด้านหลัง เกี่ยวตาไก่ด้วยตะขอ
 *           + ขาค้ำหลัง (จากดุมกลางลงพื้น) · ผืนโค้งเว้าเล็กน้อยตามแรงดึงของโครง
 *   rollup: ผืน = ช่วง 100–1700 มม. ของอาร์ตบอร์ด 600×1800 (ส่วนบนอยู่ในรางหนีบ · ส่วนล่างม้วนอยู่ในฐาน) ตั้งตรงจากฐานอลูมิเนียม
 *           + เสาหลัง 3 ท่อน + รางหนีบบน + ตะขอ · ด้านหลังผืนเป็นไวนิลขาว (พิมพ์ด้านเดียว)
 */

import { useEffect, useRef, useState } from "react";
import { BANNER_ROLLUP_HIDE_MM, BANNER_STAND_TH, BANNER_VIEW_TH, type BannerMock, type BannerView } from "@/lib/banner-mock";

/** มุมกล้อง (เรเดียน รอบแกนตั้ง) — หน้าป้ายหันไป +z */
const VIEW_YAW: Record<BannerView, number> = { front: 0, right: Math.PI / 2, left: -Math.PI / 2, back: Math.PI };

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

export default function Banner3D({
  sheet,
  sheetMm,
  mock,
  title,
  onClose,
}: {
  /** ลายทั้งอาร์ตบอร์ด (วาดจากตัววาดจริงของจอออกแบบ) */
  sheet: HTMLCanvasElement;
  sheetMm: { w: number; h: number };
  mock: BannerMock;
  title: string;
  onClose: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const rollup = mock.stand === "rollup";
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [spin, setSpin] = useState(false);
  const [view, setView] = useState<BannerView>("front");
  const [zoom, setZoomState] = useState(1);
  const clampZ = (z: number) => Math.max(0.5, Math.min(4, z));
  const cam = useRef({ yaw: 0.3, pitch: 0.12, zoom: 1, targetYaw: null as number | null, spin: false, dragging: false });
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; z: number } | null>(null);
  const setZoom = (fn: (z: number) => number) => {
    const z = clampZ(fn(cam.current.zoom));
    cam.current.zoom = z;
    setZoomState(z);
  };
  const goView = (v: BannerView) => {
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
        // 🖼 ผืนที่มองเห็น: X-Stand = ทั้งอาร์ตบอร์ด · Roll UP = ตัดส่วนที่ซ่อนในหัวหนีบ/ฐานออก (100 มม. บน-ล่าง)
        const hide = rollup ? Math.min(BANNER_ROLLUP_HIDE_MM, H / 4) : 0;
        const VW = W;
        const VH = H - hide * 2;
        const faceCv = hide ? cropCanvas(sheet, k, 0, hide, VW, VH) : sheet;

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

        // ความสูงรวมของชิ้นงาน (ป้าย + ฐาน/โครง) ใช้ตั้งกล้องและเงา
        const BASE_H = rollup ? 70 : 0; // ฐานอลูมิเนียม Roll UP สูง ~7 ซม.
        const LIFT = rollup ? BASE_H : 60; // X-Stand: ขอบล่างป้ายลอยจากพื้น ~6 ซม. (ขาโครงยันพื้น)
        const TOTAL_H = LIFT + VH + (rollup ? 30 : 20);
        const camera = new THREE.PerspectiveCamera(28, 1, 1, 20000);
        // ระยะกล้อง: FOV 28° แนวตั้ง เห็นสูง ≈ 0.5×ระยะ → ×2.6 เห็นทั้งต้น (ป้าย+ฐาน) มีที่ว่างบน-ล่าง (รอบแรก ×1.55 ป้ายล้นกรอบ)
        const BASE_DIST = TOTAL_H * 2.6;

        const sun = new THREE.DirectionalLight(0xffffff, 1.15);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        const sh = TOTAL_H * 0.75;
        sun.shadow.camera.left = sun.shadow.camera.bottom = -sh;
        sun.shadow.camera.right = sun.shadow.camera.top = sh;
        sun.shadow.camera.near = 10;
        sun.shadow.camera.far = TOTAL_H * 6;
        sun.shadow.bias = -0.0004;
        sun.shadow.radius = 4;
        scene.add(sun);
        scene.add(new THREE.AmbientLight(0xffffff, 0.95));

        const geos: { dispose(): void }[] = [];
        const mats: { dispose(): void }[] = [];
        const g = <T extends { dispose(): void }>(x: T) => (geos.push(x), x);
        const m = <T extends { dispose(): void }>(x: T) => (mats.push(x), x);

        const ground = new THREE.Mesh(g(new THREE.PlaneGeometry(TOTAL_H * 8, TOTAL_H * 8)), m(new THREE.ShadowMaterial({ opacity: 0.13 })));
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        scene.add(ground);

        const texOf = (cv: HTMLCanvasElement) => {
          const t = new THREE.CanvasTexture(cv);
          t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = renderer.capabilities.getMaxAnisotropy();
          mats.push(t);
          return t;
        };
        const root = new THREE.Group();
        scene.add(root);
        const add = (mesh: InstanceType<typeof THREE.Mesh>, shadow = true) => {
          mesh.castShadow = shadow;
          mesh.receiveShadow = false;
          root.add(mesh);
          return mesh;
        };

        // 🎨 ไวนิล 400 แกรม: ผิวกึ่งด้าน · หน้าพิมพ์ลาย · หลังขาว (พิมพ์ด้านเดียว) — วาดเป็น 2 แผ่นประกบ ไม่ให้เห็นลายกลับด้านจากข้างหลัง
        const vinylFront = m(new THREE.MeshStandardMaterial({ map: texOf(faceCv), roughness: 0.62, metalness: 0, envMapIntensity: 0.35, side: THREE.FrontSide }));
        const vinylBack = m(new THREE.MeshStandardMaterial({ color: 0xf4f4f2, roughness: 0.75, metalness: 0, envMapIntensity: 0.25, side: THREE.BackSide }));
        const carbon = m(new THREE.MeshStandardMaterial({ color: 0x1c1d20, roughness: 0.35, metalness: 0.55, envMapIntensity: 0.9 }));
        const alu = m(new THREE.MeshStandardMaterial({ color: 0xc9ccd1, roughness: 0.32, metalness: 0.85, envMapIntensity: 1.0 }));
        const aluDark = m(new THREE.MeshStandardMaterial({ color: 0x8e9196, roughness: 0.4, metalness: 0.8, envMapIntensity: 0.9 }));
        const brass = m(new THREE.MeshStandardMaterial({ color: 0xb9b9bd, roughness: 0.3, metalness: 0.9, envMapIntensity: 1.1 }));

        /**
         * ผืนป้าย: PlaneGeometry กว้าง VW สูง VH · X-Stand ดัดเว้าเข้าหาโครงเล็กน้อย (แรงดึงจากตาไก่ 4 มุม ทำให้กลางผืนโก่งไปข้างหลัง)
         * Roll UP ตึงตรง (ม้วนสปริงดึงลง) · แผ่นหลังขาวซ้อนห่าง 0.6 มม.
         */
        const SEG = 40;
        const bannerGeo = (zOff: number) => {
          const geo = g(new THREE.PlaneGeometry(VW, VH, SEG, SEG));
          const pos = geo.attributes.position;
          for (let i = 0; i < pos.count; i++) {
            const u = pos.getX(i) / (VW / 2);
            const v = pos.getY(i) / (VH / 2);
            // X-Stand: กลางผืนถอยหลัง ~12 มม. (มุมคงที่เพราะถูกเกี่ยว) · Roll UP: โค้งนิดเดียวตามการม้วน (กลางยื่นหน้า 2 มม.)
            const bow = rollup ? 2 * (1 - v * v) * (1 - 0.3 * u * u) : -12 * (1 - u * u) * (1 - v * v * 0.85);
            pos.setZ(i, bow + zOff);
          }
          pos.needsUpdate = true;
          geo.computeVertexNormals();
          return geo;
        };
        const banner = new THREE.Group();
        const face = new THREE.Mesh(bannerGeo(0), vinylFront);
        const backSide = new THREE.Mesh(bannerGeo(-0.6), vinylBack);
        face.castShadow = backSide.castShadow = true;
        banner.add(face, backSide);
        banner.position.y = LIFT + VH / 2;
        root.add(banner);

        if (!rollup) {
          // 🔩 ตาไก่ 4 มุม (ตรงจุดเขียวในไฟล์ r7 ที่ 27 มม. จากขอบ) = วงแหวนโลหะ + รูโปร่ง (ไม่ต้องเจาะผืนจริง ใช้วงแหวนทับพอ)
          const EYE = 27;
          const corners: [number, number][] = [
            [-VW / 2 + EYE, VH / 2 - EYE],
            [VW / 2 - EYE, VH / 2 - EYE],
            [-VW / 2 + EYE, -VH / 2 + EYE],
            [VW / 2 - EYE, -VH / 2 + EYE],
          ];
          const ringGeo = g(new THREE.TorusGeometry(7, 2.2, 10, 28));
          const hubY = LIFT + VH / 2; // ดุมกลางโครง X อยู่หลังกึ่งกลางป้าย
          const hubZ = -34;
          for (const [cx, cy] of corners) {
            const ring = add(new THREE.Mesh(ringGeo, brass), false);
            ring.position.set(cx, LIFT + VH / 2 + cy, 1.5);
            // ตะขอโครง: ท่อนสั้นจากหลังตาไก่ไปหาแขนโครง
            const hook = add(new THREE.Mesh(g(new THREE.TorusGeometry(9, 1.8, 8, 20, Math.PI)), carbon), false);
            hook.position.set(cx, LIFT + VH / 2 + cy, -6);
            hook.rotation.x = Math.PI / 2;
            // 🦴 แขนโครง X: จากดุมกลาง (หลังป้าย) ไปแต่ละมุม — ท่อคาร์บอน ⌀10
            const from = new THREE.Vector3(0, hubY, hubZ);
            const to = new THREE.Vector3(cx, LIFT + VH / 2 + cy, -14);
            const len = from.distanceTo(to);
            const arm = add(new THREE.Mesh(g(new THREE.CylinderGeometry(5, 5, len, 14)), carbon));
            arm.position.copy(from).lerp(to, 0.5);
            arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
          }
          // ดุมกลาง + ขาค้ำหลัง (ท่อนเอียงจากดุมลงพื้นด้านหลัง) + แป้นเท้าสั้น ๆ ที่ปลาย
          const hub = add(new THREE.Mesh(g(new THREE.CylinderGeometry(16, 16, 22, 20)), carbon));
          hub.position.set(0, hubY, hubZ);
          hub.rotation.x = Math.PI / 2;
          const foot = new THREE.Vector3(0, 0, -VH * 0.42);
          const hubV = new THREE.Vector3(0, hubY, hubZ);
          const legLen = hubV.distanceTo(foot);
          const leg = add(new THREE.Mesh(g(new THREE.CylinderGeometry(6, 6, legLen, 14)), carbon));
          leg.position.copy(hubV).lerp(foot, 0.5);
          leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), foot.clone().sub(hubV).normalize());
          const pad = add(new THREE.Mesh(g(new THREE.CylinderGeometry(22, 26, 8, 20)), carbon));
          pad.position.set(0, 4, foot.z);
          // ขาหน้า 2 ขาจากดุมลงมาถึงใต้ขอบล่างป้าย (ท่อคู่ของโครง X ส่วนล่างยันพื้น)
          for (const sx of [-1, 1]) {
            const ft = new THREE.Vector3(sx * VW * 0.36, 0, -22);
            const l2 = hubV.distanceTo(ft);
            const lg = add(new THREE.Mesh(g(new THREE.CylinderGeometry(4.5, 4.5, l2, 12)), carbon));
            lg.position.copy(hubV).lerp(ft, 0.5);
            lg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), ft.clone().sub(hubV).normalize());
            const p2 = add(new THREE.Mesh(g(new THREE.CylinderGeometry(16, 20, 6, 18)), carbon));
            p2.position.set(ft.x, 3, ft.z);
          }
        } else {
          // 🥫 ฐานอลูมิเนียม: กล่องมุมมน กว้างเกินผืนข้างละ 25 มม. · ลึก 110 · สูง BASE_H · ผืนโผล่จากร่องกึ่งกลางฐาน
          const BW = VW + 50;
          const BD = 110;
          const base = add(new THREE.Mesh(g(new THREE.CapsuleGeometry(BASE_H / 2, BW - BASE_H, 6, 18)), alu));
          base.rotation.z = Math.PI / 2;
          base.position.set(0, BASE_H / 2, 0);
          base.scale.z = BD / BASE_H;
          // ฝาข้างสีเข้ม 2 ข้าง (ปลายม้วน)
          for (const sx of [-1, 1]) {
            const cap = add(new THREE.Mesh(g(new THREE.CylinderGeometry(BASE_H / 2 + 1, BASE_H / 2 + 1, 10, 24)), aluDark), false);
            cap.rotation.z = Math.PI / 2;
            cap.position.set(sx * (BW / 2 - 4), BASE_H / 2, 0);
            cap.scale.z = BD / BASE_H;
          }
          // ขาเหยียบ 2 ขา (ยื่นหลังฐาน) กันล้ม
          for (const sx of [-1, 1]) {
            const ft = add(new THREE.Mesh(g(new THREE.BoxGeometry(24, 10, 120)), aluDark));
            ft.position.set(sx * (BW / 2 - 60), 5, -70);
          }
          // 📏 รางหนีบบน: แท่งอลูมิเนียมกว้างเกินผืนข้างละ 10 มม. หนีบขอบบนป้าย
          const topBar = add(new THREE.Mesh(g(new THREE.BoxGeometry(VW + 20, 24, 14)), alu));
          topBar.position.set(0, LIFT + VH + 6, -2);
          // 🧷 เสาหลัง 3 ท่อน (เรียวขึ้น) จากฐานถึงรางบน + ตะขอเกี่ยว
          const poleTop = LIFT + VH + 14;
          const segs = 3;
          for (let i = 0; i < segs; i++) {
            const y0 = BASE_H * 0.6 + ((poleTop - BASE_H * 0.6) * i) / segs;
            const y1 = BASE_H * 0.6 + ((poleTop - BASE_H * 0.6) * (i + 1)) / segs;
            const r = 9 - i * 1.8;
            const seg = add(new THREE.Mesh(g(new THREE.CylinderGeometry(r, r + 0.4, y1 - y0 + 6, 16)), i === 0 ? aluDark : alu));
            seg.position.set(0, (y0 + y1) / 2, -40);
          }
          const hookTop = add(new THREE.Mesh(g(new THREE.TorusGeometry(12, 3, 10, 24, Math.PI)), aluDark), false);
          hookTop.position.set(0, poleTop + 4, -22);
          hookTop.rotation.y = Math.PI / 2;
          const hookArm = add(new THREE.Mesh(g(new THREE.BoxGeometry(8, 8, 40)), aluDark), false);
          hookArm.position.set(0, LIFT + VH + 6, -22);
        }

        const lookY = TOTAL_H * 0.5;

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
        console.error("Banner3D", e);
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

  const shownH = rollup ? sheetMm.h - 2 * Math.min(BANNER_ROLLUP_HIDE_MM, sheetMm.h / 4) : sheetMm.h;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-stone-900/55 p-3 backdrop-blur-[2px]" onClick={onClose}>
      <div className="relative flex w-full max-w-3xl flex-col rounded-3xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-3.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-500 text-lg shadow-[0_4px_12px_rgba(139,92,246,.35)]">
            🪧
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex min-w-0 items-center gap-2 text-[15px] font-extrabold leading-tight text-stone-800">
              <span className="shrink-0">ดูแบบ 3D</span>
              <span className="inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-[11px] font-extrabold text-stone-700 ring-1 ring-sky-200">
                <span className="truncate">{BANNER_STAND_TH[mock.stand]}</span>
                {mock.label ? <span className="truncate text-stone-400">· {mock.label}</span> : null}
              </span>
            </p>
            <p className="truncate text-xs text-stone-500">
              {title} · ป้าย {Math.round(sheetMm.w) / 10}×{Math.round(shownH) / 10} ซม.{" "}
              {rollup ? "(ส่วนบน/ล่างของผืนอยู่ในรางหนีบและฐาน)" : "(ตาไก่ 4 มุม เกี่ยวโครง X)"}
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
          className="relative mx-3 h-[min(64vh,560px)] cursor-grab touch-none select-none overflow-hidden rounded-2xl bg-[radial-gradient(ellipse_at_50%_38%,#ffffff_0%,#f1f5f9_55%,#e2e8f0_100%)] ring-1 ring-stone-200/70 active:cursor-grabbing"
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
            // ป้ายตั้งพื้น: เงยได้ถึงมุมสูง · ก้มได้นิดเดียว (ใต้พื้นไม่มีอะไรให้ดู)
            cam.current.pitch = Math.max(-0.12, Math.min(1.2, d.pitch + (e.clientY - d.y) * 0.006));
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
            <span className="whitespace-nowrap rounded-full bg-sky-600 px-2 py-0.5 text-[11px] font-extrabold text-white">{rollup ? "🪧 ตั้งบนฐาน" : "🪧 ขึงบนโครง X"}</span>
            <span className="truncate text-xs font-bold text-stone-700">{spin ? "หมุนโชว์รอบตัว" : BANNER_VIEW_TH[view]}</span>
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
              {(["left", "front", "right", "back"] as BannerView[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={!spin && view === v}
                  onClick={() => goView(v)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${!spin && view === v ? "bg-sky-600 text-white shadow-sm" : "text-stone-500 hover:text-stone-800"}`}
                >
                  {v === "front" ? "👁 ด้านหน้า" : BANNER_VIEW_TH[v]}
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
            ภาพจำลองโดยประมาณ —{" "}
            {rollup
              ? "ส่วนบน 10 ซม. ของผืนอยู่ในรางหนีบ ส่วนล่าง 10 ซม. ม้วนอยู่ในฐาน (ไม่เห็นเมื่อตั้งใช้งาน) · โครงฐาน/เสาจำลอง"
              : "ผืนขึงบนโครง X เกี่ยวตาไก่ 4 มุม กลางผืนโก่งเล็กน้อยตามแรงดึง · โครงจำลอง"}{" "}
            · สีจริงอาจต่างจากหน้าจอเล็กน้อย
          </p>
        </div>
      </div>
    </div>
  );
}
