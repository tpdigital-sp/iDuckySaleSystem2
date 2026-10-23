"use client";

/**
 * 🖼🪵🧊 โมเดล 3D กรอบรูปแคนวาส (Canvas Frame) — ผ้าใบขึงโครงไม้สน พิมพ์ UV ต่อเนื่องอ้อมขอบด้านข้าง ให้ลูกค้าเห็นก่อนสั่ง
 * (เจ้าของร้านสั่ง 23 ต.ค. 69 "เพิ่ม 3D ให้หน่อย" — canvas-frame · โซนจากไฟล์เทมเพลตร้าน: หน้างาน (กรอบแดง) · "ขอบข้าง" 30 มม. · "ขอบเย็บ" 30 มม.)
 *
 * three.js โหลดตอนกดปุ่มเท่านั้น (import()) · โครงเดียวกับ Folder3D/Cushion3D (ลาก=หมุน · ล้อ/หยิก=ซูม · มุมมอง 4 ด้าน)
 * ผืน = อาร์ตบอร์ดทั้งแผ่น (lib/canvas-mock): กลาง = หน้างาน · แถบถัดออกไป = ขอบข้าง 4 ด้าน (ความหนากรอบ) · แถบนอกสุด = ขอบเย็บ พับไปด้านหลังทับโครงไม้
 * ด้านหลัง: โครงไม้สน 4 ด้าน (+ คานกลางเมื่อใหญ่) · ขอบเย็บผ้าใบ + ลวดเย็บ · ช่องกลางเห็นหลังผ้าใบดิบ
 */

import { useEffect, useRef, useState } from "react";
import { CANVAS_VIEW_TH, CANVAS_WRAP_MM, type CanvasMock, type CanvasView } from "@/lib/canvas-mock";

/** มุมกล้อง — yaw รอบแกนตั้ง (หน้างานหันไป +z) · pitch ก้ม/เงย (บวก = มองจากบน · ลบ = มองจากล่าง) */
const VIEW_CAM: Record<CanvasView, { yaw: number; pitch: number }> = {
  front: { yaw: 0, pitch: 0.14 },
  right: { yaw: Math.PI / 2, pitch: 0.14 },
  left: { yaw: -Math.PI / 2, pitch: 0.14 },
  back: { yaw: Math.PI, pitch: 0.14 },
  // 👀 ด้านบน/ล่าง (เจ้าของร้านสั่ง 23 ต.ค. 69 "ให้ดูข้างล่างได้") — เฉียงหน้านิด ๆ ให้เห็นลายอ้อมขอบต่อจากหน้างาน
  top: { yaw: 0.35, pitch: 1.05 },
  bottom: { yaw: 0.35, pitch: -1.05 },
};
/** ก้ม/เงยได้สุด (ใกล้ ±90° แต่ไม่ถึง — lookAt เสียทิศเมื่อตรงดิ่ง) */
const PITCH_MAX = 1.35;

/**
 * ครอปส่วนของผืน (มม.) ลงผ้าใบ: พื้นขาว (ผ้าใบ) + ลาย + ลายทอผ้าใบจาง ๆ · k = พิกเซล/มม.
 * flipY = พลิกบน-ล่าง (ขอบเย็บบน/ล่างที่พับไปด้านหลัง)
 */
function cropCanvas(src: HTMLCanvasElement, k: number, x: number, y: number, w: number, h: number, flipY = false): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = Math.max(2, Math.round(w * k));
  out.height = Math.max(2, Math.round(h * k));
  const ctx = out.getContext("2d");
  if (!ctx) return src;
  ctx.fillStyle = "#f7f4ee";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.save();
  if (flipY) {
    ctx.translate(0, out.height);
    ctx.scale(1, -1);
  }
  ctx.drawImage(src, x * k, y * k, w * k, h * k, 0, 0, out.width, out.height);
  ctx.restore();
  // 🧵 ลายทอผ้าใบ: เส้นตารางถี่ ~1.2 มม. จาง ๆ (multiply) ให้เนื้อดูเป็นผ้า ไม่ใช่กระดาษเรียบ
  const pitch = Math.max(2, 1.2 * k);
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = "#1f1a14";
  for (let yy = 0; yy < out.height; yy += pitch) ctx.fillRect(0, yy, out.width, 1);
  for (let xx = 0; xx < out.width; xx += pitch) ctx.fillRect(xx, 0, 1, out.height);
  ctx.restore();
  return out;
}

/** ลายไม้สน (แผ่นเล็กซ้ำ) — เส้นเสี้ยนตามแนวยาว */
function woodTile(): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = 256;
  cv.height = 256;
  const ctx = cv.getContext("2d");
  if (!ctx) return cv;
  ctx.fillStyle = "#dcc096";
  ctx.fillRect(0, 0, 256, 256);
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 90; i++) {
    const y = rnd() * 256;
    const a = 0.05 + rnd() * 0.12;
    ctx.strokeStyle = `rgba(120, 82, 40, ${a})`;
    ctx.lineWidth = 0.6 + rnd() * 1.6;
    ctx.beginPath();
    ctx.moveTo(-10, y);
    ctx.bezierCurveTo(80, y + (rnd() - 0.5) * 6, 180, y + (rnd() - 0.5) * 6, 270, y + (rnd() - 0.5) * 4);
    ctx.stroke();
  }
  // ตาไม้เล็ก ๆ
  for (let i = 0; i < 2; i++) {
    const x = 40 + rnd() * 176;
    const y = 40 + rnd() * 176;
    for (let r = 10; r > 1; r -= 2.5) {
      ctx.strokeStyle = `rgba(110, 72, 34, ${0.12 - r * 0.006})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(x, y, r * 1.6, r, 0.3, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  return cv;
}

export default function CanvasFrame3D({
  sheet,
  sheetMm,
  mock,
  title,
  onClose,
}: {
  /** ลายทั้งอาร์ตบอร์ด (วาดจากตัววาดจริงของจอออกแบบ) */
  sheet: HTMLCanvasElement;
  sheetMm: { w: number; h: number };
  mock: CanvasMock;
  title: string;
  onClose: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [spin, setSpin] = useState(false);
  const [view, setView] = useState<CanvasView>("front");
  const [zoom, setZoomState] = useState(1);
  const clampZ = (z: number) => Math.max(0.6, Math.min(3, z));
  const cam = useRef({ yaw: 0.32, pitch: 0.14, zoom: 1, targetYaw: null as number | null, targetPitch: null as number | null, spin: false, dragging: false });
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; z: number } | null>(null);
  const setZoom = (fn: (z: number) => number) => {
    const z = clampZ(fn(cam.current.zoom));
    cam.current.zoom = z;
    setZoomState(z);
  };
  const goView = (v: CanvasView) => {
    setView(v);
    const cur = cam.current.yaw;
    let t = VIEW_CAM[v].yaw;
    while (t - cur > Math.PI) t -= 2 * Math.PI;
    while (t - cur < -Math.PI) t += 2 * Math.PI;
    cam.current.targetYaw = t;
    cam.current.targetPitch = VIEW_CAM[v].pitch;
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
        // 📐 โซนบนผืน (มม.): หน้างาน fw×fh กลางผืน · ขอบรวมข้างละ mx/my = ขอบข้าง (ความหนา D) + ขอบเย็บ (r) อย่างละครึ่ง
        const fin = mock.finishedMm && mock.finishedMm.w < W && mock.finishedMm.h < H ? mock.finishedMm : null;
        const fw = fin ? fin.w : Math.max(W * 0.5, W - CANVAS_WRAP_MM * 2);
        const fh = fin ? fin.h : Math.max(H * 0.5, H - CANVAS_WRAP_MM * 2);
        const mx = (W - fw) / 2;
        const my = (H - fh) / 2;
        const D = Math.min(mx, my) / 2; // ความหนากรอบ = ขอบข้าง (ไฟล์ร้าน 30 มม.)
        const rx = mx - D; // ขอบเย็บซ้าย/ขวา
        const ry = my - D; // ขอบเย็บบน/ล่าง

        // 🎨 ผ้าใบแต่ละด้าน (ครอปจากผืน · ทิศตรงกับที่มองจากนอกชิ้นงาน — ดูคำอธิบายการวางระนาบด้านล่าง)
        const frontCv = cropCanvas(sheet, k, mx, my, fw, fh);
        const rightCv = cropCanvas(sheet, k, mx + fw, my, D, fh);
        const leftCv = cropCanvas(sheet, k, mx - D, my, D, fh);
        const topCv = cropCanvas(sheet, k, mx, my - D, fw, D);
        const bottomCv = cropCanvas(sheet, k, mx, my + fh, fw, D);
        const foldL = cropCanvas(sheet, k, mx - D - rx, my, rx, fh);
        const foldR = cropCanvas(sheet, k, mx + fw + D, my, rx, fh);
        const foldT = cropCanvas(sheet, k, mx, my - D - ry, fw, ry, true);
        const foldB = cropCanvas(sheet, k, mx, my + fh + D, fw, ry, true);

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

        const camera = new THREE.PerspectiveCamera(28, 1, 1, 20000);
        const BASE_DIST = Math.max(fh, fw * 1.25) * 2.7;

        const sun = new THREE.DirectionalLight(0xffffff, 1.05);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        const sh = Math.max(fw, fh) * 1.3;
        sun.shadow.camera.left = sun.shadow.camera.bottom = -sh;
        sun.shadow.camera.right = sun.shadow.camera.top = sh;
        sun.shadow.camera.near = 5;
        sun.shadow.camera.far = BASE_DIST * 4;
        sun.shadow.bias = -0.0006;
        sun.shadow.radius = 4;
        scene.add(sun);
        scene.add(new THREE.AmbientLight(0xffffff, 0.95));
        // 🔦 ไฟเติมตามกล้อง (ไม่ทอดเงา) — มองจากด้านล่างแล้วผิวล่างไม่มืด (แดดอยู่บนเสมอ · 23 ต.ค. 69 "ให้ดูข้างล่างได้")
        const fill = new THREE.DirectionalLight(0xffffff, 0.45);
        scene.add(fill);

        const geos: { dispose(): void }[] = [];
        const mats: { dispose(): void }[] = [];
        const g = <T extends { dispose(): void }>(x: T) => (geos.push(x), x);
        const m = <T extends { dispose(): void }>(x: T) => (mats.push(x), x);

        const ground = new THREE.Mesh(g(new THREE.PlaneGeometry(fw * 12, fw * 12)), m(new THREE.ShadowMaterial({ opacity: 0.14 })));
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
        // 🧵 ผ้าใบ: ด้าน ไม่เงา · ลายพิมพ์ UV สีตรงตามแบบ
        // shadowSide DoubleSide: แผ่นผ้าบาง (Plane) ต้องทอดเงาเต็ม — ค่าเริ่ม (หน้าหลังของ FrontSide) ทำให้เงาบนพื้นเป็นกรอบกลวง (23 ต.ค. 69)
        const fabric = (cv: HTMLCanvasElement) =>
          m(new THREE.MeshStandardMaterial({ map: texOf(cv), roughness: 0.9, metalness: 0, shadowSide: THREE.DoubleSide }));
        const woodTex = texOf(woodTile());
        woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping;
        woodTex.repeat.set(3, 3);
        const wood = m(new THREE.MeshStandardMaterial({ map: woodTex, color: 0xf0e2c8, roughness: 0.72, metalness: 0 }));
        const rawBack = m(new THREE.MeshStandardMaterial({ color: 0xe9e2d3, roughness: 0.96, metalness: 0, side: THREE.DoubleSide }));
        const staple = m(new THREE.MeshStandardMaterial({ color: 0xc9ccd0, roughness: 0.35, metalness: 0.9 }));

        const root = new THREE.Group();
        scene.add(root);
        const add = (mesh: InstanceType<typeof THREE.Mesh>, shadow = true) => {
          mesh.castShadow = shadow;
          mesh.receiveShadow = true;
          root.add(mesh);
          return mesh;
        };

        // 🧱 กล่องผ้าใบ: ตั้งตรง ขอบล่าง y = 0 · หน้างานหันไป +z (z = +D/2) · หลัง z = −D/2
        //   ระนาบด้านข้างหมุนให้ "ซ้ายของภาพ = ด้านที่ติดหน้างาน" ตรงกับแถบบนผืน:
        //   ขวา (rotation.y +90°): ซ้ายของผู้มอง = +z (หน้างาน) · ซ้าย (−90°): ขวาของผู้มอง = +z · บน (x −90°): ล่างของภาพ = +z · ล่าง (x +90°): บนของภาพ = +z
        const plane = (w: number, h: number, cv: HTMLCanvasElement) => add(new THREE.Mesh(g(new THREE.PlaneGeometry(w, h)), fabric(cv)));
        const front = plane(fw, fh, frontCv);
        front.position.set(0, fh / 2, D / 2);
        const right = plane(D, fh, rightCv);
        right.rotation.y = Math.PI / 2;
        right.position.set(fw / 2, fh / 2, 0);
        const left = plane(D, fh, leftCv);
        left.rotation.y = -Math.PI / 2;
        left.position.set(-fw / 2, fh / 2, 0);
        const top = plane(fw, D, topCv);
        top.rotation.x = -Math.PI / 2;
        top.position.set(0, fh, 0);
        const bottom = plane(fw, D, bottomCv);
        bottom.rotation.x = Math.PI / 2;
        bottom.position.set(0, 0, 0);

        // 🪵 โครงไม้สนด้านหลัง: 4 ด้าน (กว้างตามขนาดชิ้นงาน) + คานกลางเมื่อใหญ่ · แผ่นหลังผ้าใบดิบลึกเข้าไปติดหน้างาน
        //   ⚠️ ถอยเข้าในจากผิวผ้าใบ FI มม. ทุกด้าน — เดิมผิวคานทับระนาบผ้าข้างพอดี (z-fighting) ไม้ทะลุผ้าเป็นลายแถบ (เจ้าของร้านทัก 23 ต.ค. 69)
        const FI = 1.5;
        const ow = fw - 2 * FI; // กรอบนอกของโครง
        const oh = fh - 2 * FI;
        const bw = Math.max(32, Math.min(60, fw * 0.11));
        const bd = D - FI - 0.6; // ลึกคาน (หน้าคานถอยจากผ้าหน้า FI · หลังคานเสมอขอบหลัง)
        const bz = -D / 2 + bd / 2;
        const bar = (w: number, h: number, x: number, y: number) => {
          const bx = add(new THREE.Mesh(g(new THREE.BoxGeometry(w, h, bd)), wood));
          bx.position.set(x, y, bz);
          return bx;
        };
        bar(ow, bw, 0, fh - FI - bw / 2);
        bar(ow, bw, 0, FI + bw / 2);
        bar(bw, oh - 2 * bw, -ow / 2 + bw / 2, fh / 2);
        bar(bw, oh - 2 * bw, ow / 2 - bw / 2, fh / 2);
        if (fh >= 700) bar(ow - 2 * bw, bw * 0.8, 0, fh / 2);
        if (fw >= 700) bar(bw * 0.8, oh - 2 * bw, 0, fh / 2);
        const backSheet = add(new THREE.Mesh(g(new THREE.PlaneGeometry(ow - 2 * bw + 1, oh - 2 * bw + 1)), rawBack), false);
        backSheet.rotation.y = Math.PI;
        backSheet.position.set(0, fh / 2, D / 2 - 0.6);

        // 🧵 ขอบเย็บ: ผ้าใบพับทับหลังโครงไม้ 4 ด้าน (ระนาบหันไป −z · local +x = โลก −x = ขวาของผู้มองจากหลัง) + ลวดเย็บเป็นแถว
        const zBack = -D / 2 - 0.15;
        const fold = (w: number, h: number, cv: HTMLCanvasElement, x: number, y: number, dz = 0) => {
          const p = plane(w, h, cv);
          p.rotation.y = Math.PI;
          p.position.set(x, y, zBack - dz);
          p.castShadow = false;
          return p;
        };
        fold(rx, fh, foldL, -fw / 2 + rx / 2, fh / 2);
        fold(rx, fh, foldR, fw / 2 - rx / 2, fh / 2);
        fold(fw, ry, foldT, 0, fh - ry / 2, 0.12);
        fold(fw, ry, foldB, 0, ry / 2, 0.12);
        {
          const stapleGeo = g(new THREE.BoxGeometry(9, 1.3, 0.7));
          const gap = 45;
          const nV = Math.max(2, Math.floor((fh - 2 * ry) / gap));
          const nH = Math.max(2, Math.floor((fw - 2 * rx) / gap));
          const inst = new THREE.InstancedMesh(stapleGeo, staple, nV * 2 + nH * 2);
          const mtx = new THREE.Matrix4();
          const q = new THREE.Quaternion();
          const s = new THREE.Vector3(1, 1, 1);
          let i = 0;
          const put = (x: number, y: number, vertical: boolean) => {
            q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), vertical ? Math.PI / 2 : 0);
            mtx.compose(new THREE.Vector3(x, y, zBack - 0.6), q, s);
            inst.setMatrixAt(i++, mtx);
          };
          for (let j = 0; j < nV; j++) {
            const y = ry + ((fh - 2 * ry) * (j + 0.5)) / nV;
            put(-fw / 2 + rx * 0.45, y, true);
            put(fw / 2 - rx * 0.45, y, true);
          }
          for (let j = 0; j < nH; j++) {
            const x = -fw / 2 + rx + ((fw - 2 * rx) * (j + 0.5)) / nH;
            put(x, fh - ry * 0.45, false);
            put(x, ry * 0.45, false);
          }
          inst.castShadow = false;
          root.add(inst);
          geos.push(inst);
        }

        const lookY = fh / 2;
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
          if (c.targetPitch != null) {
            const d = c.targetPitch - c.pitch;
            if (Math.abs(d) < 0.004) {
              c.pitch = c.targetPitch;
              c.targetPitch = null;
            } else c.pitch += d * Math.min(1, dt * 7);
          }
          const dist = BASE_DIST / c.zoom;
          const cp2 = Math.cos(c.pitch);
          camera.position.set(dist * Math.sin(c.yaw) * cp2, dist * Math.sin(c.pitch) + lookY, dist * Math.cos(c.yaw) * cp2);
          camera.lookAt(0, lookY, 0);
          sun.position.set(camera.position.x, 0, camera.position.z).normalize().multiplyScalar(BASE_DIST * 1.1);
          sun.position.y = BASE_DIST * 0.9;
          sun.position.x += BASE_DIST * 0.3 * Math.cos(c.yaw);
          sun.position.z -= BASE_DIST * 0.3 * Math.sin(c.yaw);
          fill.position.copy(camera.position);
          fill.target.position.set(0, lookY, 0);
          fill.target.updateMatrixWorld();
          // มองจากบน = แดดพอแล้ว · ก้มลงต่ำกว่าพื้นยิ่งเติมแรง
          fill.intensity = c.pitch < 0 ? 0.35 + Math.min(0.6, -c.pitch * 0.6) : 0.25;
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
        console.error("CanvasFrame3D", e);
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
            🖼
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex min-w-0 items-center gap-2 text-[15px] font-extrabold leading-tight text-stone-800">
              <span className="shrink-0">ดูแบบ 3D</span>
              <span className="inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-[11px] font-extrabold text-stone-700 ring-1 ring-sky-200">
                <span className="truncate">กรอบรูปแคนวาส</span>
                {mock.label ? <span className="truncate text-stone-400">· {mock.label}</span> : null}
              </span>
            </p>
            <p className="truncate text-xs text-stone-500">{title} · ผ้าใบขึงโครงไม้สน พิมพ์อ้อมขอบข้าง</p>
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
            cam.current.targetPitch = null;
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
            // ↕ ก้มดูด้านล่างได้ (เดิมจำกัด −0.15 · เจ้าของร้านสั่ง 23 ต.ค. 69 "ให้ดูข้างล่างได้")
            cam.current.pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, d.pitch + (e.clientY - d.y) * 0.006));
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
            <span className="whitespace-nowrap rounded-full bg-sky-600 px-2 py-0.5 text-[11px] font-extrabold text-white">🖼 ผ้าใบขึงโครงไม้</span>
            <span className="truncate text-xs font-bold text-stone-700">{spin ? "หมุนโชว์รอบตัว" : CANVAS_VIEW_TH[view]}</span>
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
              {(["left", "front", "right", "back"] as CanvasView[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={!spin && view === v}
                  onClick={() => goView(v)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${!spin && view === v ? "bg-sky-600 text-white shadow-sm" : "text-stone-500 hover:text-stone-800"}`}
                >
                  {v === "front" ? "👁 ด้านหน้า" : CANVAS_VIEW_TH[v]}
                </button>
              ))}
            </span>
            <span className="flex items-center rounded-full bg-stone-100 p-0.5 ring-1 ring-stone-200/70" role="radiogroup" aria-label="มุมบน-ล่าง">
              {(["top", "bottom"] as CanvasView[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={!spin && view === v}
                  onClick={() => goView(v)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${!spin && view === v ? "bg-sky-600 text-white shadow-sm" : "text-stone-500 hover:text-stone-800"}`}
                >
                  {v === "top" ? "⬆ ด้านบน" : "⬇ ด้านล่าง"}
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
            ภาพจำลองโดยประมาณ — ลายพิมพ์ต่อเนื่องอ้อมขอบข้าง 3 ซม. ส่วนขอบเย็บ 3 ซม. พับไปด้านหลังโครงไม้ · สีจริงอาจต่างจากหน้าจอเล็กน้อย
          </p>
        </div>
      </div>
    </div>
  );
}
