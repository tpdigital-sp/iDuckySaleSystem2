"use client";

/**
 * 🌈🧊 โมเดล 3D กระเป๋าโฮโลแกรม (ถุงซิปล็อก) — ลายที่ลูกค้าออกแบบบนถุงจริง ให้เห็นก่อนสั่ง
 * (เจ้าของร้านสั่ง 22 ต.ค. 69 "ทำ 3D ให้หน่อย" — hologram-bag · อ้างอิงรูปถุงจริง: ถุงพลาสติกโฮโลแกรมสีรุ้ง ลายพิมพ์เต็มหน้า
 *  ขอบโฮโลแกรมบาง ๆ รอบลาย + แถบโฮโลแกรมใต้ซิป + แถบซิปล็อกขาว/ดำด้านบน)
 *
 * three.js โหลดตอนกดปุ่มเท่านั้น (import()) · โครงเดียวกับ Folder3D (ลาก=หมุน · ล้อ/หยิก=ซูม · มุมมอง 4 ด้าน)
 * ลาย = ครอปตามกรอบเส้นตัดของเทมเพลต (ขอบถุง 204×147) · ส่วนโปร่งในผืน (ไม่มีหมึก) = เห็นโฮโลแกรมทะลุ
 * ถุงพองนิด ๆ ตรงกลาง แบนชิดกันที่ก้นถุง/ข้างถุง · ด้านหลัง = โฮโลแกรมล้วน
 */

import { useEffect, useRef, useState } from "react";
import type { TemplateCurve } from "@/lib/design-templates";
import { BAG_BAND_MM, BAG_BORDER_MM, BAG_VIEW_TH, BAG_ZIP_MM, type BagMock, type BagView } from "@/lib/bag-mock";

/** มุมกล้อง (เรเดียน รอบแกนตั้ง) — ด้านลายหันไป +z */
const VIEW_YAW: Record<BagView, number> = { front: 0, right: Math.PI / 2, left: -Math.PI / 2, back: Math.PI };

/** กรอบของเส้นตัด (มม.) — จุดเริ่ม + จุดปลายทุกช่วง (เส้นถุงเป็นสี่เหลี่ยมมุมมน พอ) */
function cutBox(cut?: TemplateCurve[] | null): { x: number; y: number; w: number; h: number } | null {
  if (!cut?.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of cut) {
    const pts: number[][] = [c.s, ...c.g.map((s) => [s[4], s[5]])];
    for (const [x, y] of pts) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  return Number.isFinite(x0) && x1 - x0 > 10 && y1 - y0 > 10 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

/** ครอปลายตามกรอบ (มม.) มุมมน r · นอกมุม = โปร่ง · k = พิกเซล/มม. */
function cropRounded(src: HTMLCanvasElement, k: number, b: { x: number; y: number; w: number; h: number }, r: number): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = Math.max(2, Math.round(b.w * k));
  out.height = Math.max(2, Math.round(b.h * k));
  const ctx = out.getContext("2d");
  if (!ctx) return src;
  ctx.beginPath();
  ctx.roundRect(0, 0, out.width, out.height, r * k);
  ctx.clip();
  ctx.drawImage(src, b.x * k, b.y * k, b.w * k, b.h * k, 0, 0, out.width, out.height);
  return out;
}

/** ลายโฮโลแกรม: ไล่สีรุ้งพาสเทลแนวทแยง + ริ้วแสงจาง ๆ (วนซ้ำได้ เลื่อนตามมุมกล้องให้ประกายเปลี่ยน) */
function holoCanvas(): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 512;
  const ctx = cv.getContext("2d");
  if (!ctx) return cv;
  // โทนทอง-พีช-ชมพู-ฟ้า ตามรูปถุงจริง (แถบใต้ซิปออกทองส้ม ขอบถุงรุ้ง)
  const stops = ["#f6c25e", "#ffad7a", "#ff96c8", "#c8a2ff", "#86d4ff", "#ffe27a", "#f6c25e"];
  const gr = ctx.createLinearGradient(0, 0, 512, 512);
  stops.forEach((c, i) => gr.addColorStop(i / (stops.length - 1), c));
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, 512, 512);
  ctx.globalAlpha = 0.18;
  for (let i = 0; i < 26; i++) {
    const x = (i * 97) % 512;
    const g2 = ctx.createLinearGradient(x, 0, x + 60, 512);
    g2.addColorStop(0, "rgba(255,255,255,0)");
    g2.addColorStop(0.5, i % 3 ? "#ffffff" : "#ffe7a3");
    g2.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g2;
    ctx.fillRect(x - 20, 0, 40 + (i % 4) * 10, 512);
  }
  ctx.globalAlpha = 1;
  return cv;
}

export default function Bag3D({
  sheet,
  sheetMm,
  cut,
  mock,
  title,
  onClose,
}: {
  /** ลายทั้งอาร์ตบอร์ด (วาดจากตัววาดจริงของจอออกแบบ) */
  sheet: HTMLCanvasElement;
  sheetMm: { w: number; h: number };
  /** เส้นตัดของเทมเพลต (ขอบถุง) — ไม่มี = ขอบเข้าใน 3 มม. */
  cut?: TemplateCurve[] | null;
  mock: BagMock;
  title: string;
  onClose: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [spin, setSpin] = useState(false);
  const [view, setView] = useState<BagView>("front");
  const [zoom, setZoomState] = useState(1);
  const clampZ = (z: number) => Math.max(0.6, Math.min(3, z));
  const cam = useRef({ yaw: 0.22, pitch: 0.12, zoom: 1, targetYaw: null as number | null, spin: false, dragging: false });
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; z: number } | null>(null);
  const setZoom = (fn: (z: number) => number) => {
    const z = clampZ(fn(cam.current.zoom));
    cam.current.zoom = z;
    setZoomState(z);
  };
  const goView = (v: BagView) => {
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
        // 📐 พื้นที่พิมพ์ = กรอบเส้นตัด (ขอบถุง) · ถุงจริง = พื้นที่พิมพ์ + ขอบโฮโลแกรม + แถบใต้ซิป + ซิป
        const pb = cutBox(cut) ?? { x: 3, y: 3, w: W - 6, h: H - 6 };
        const PW = pb.w;
        const PH = pb.h;
        const R = 3; // มุมมนของลาย/ถุง
        const BD = BAG_BORDER_MM;
        const BW = PW + 2 * BD; // กว้างถุง
        const BH = BD + PH + BAG_BAND_MM; // สูงตัวถุง (ใต้ซิป)
        const ZH = BAG_ZIP_MM;
        const TOT = BH + ZH;
        const ZT = 1.2; // ครึ่งความหนาตรงซิป
        const BULGE = 3.2; // พองกลางถุง
        const LIFT = 8; // ลอยเหนือพื้นนิดหน่อย (ถุงตั้งเองไม่ได้ — โชว์แบบภาพสินค้า)
        const printCv = cropRounded(sheet, k, pb, R);

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
        scene.environmentIntensity = 0.75;

        const camera = new THREE.PerspectiveCamera(28, 1, 1, 5000);
        const RING_EXTRA = 22; // ห่วงดึงซิปตั้งเหนือถุง
        const BASE_DIST = Math.max(TOT + RING_EXTRA + LIFT, BW * 0.85) * 3.1;

        const sun = new THREE.DirectionalLight(0xffffff, 1.1);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        const sh = Math.max(BW, TOT) * 1.4;
        sun.shadow.camera.left = sun.shadow.camera.bottom = -sh;
        sun.shadow.camera.right = sun.shadow.camera.top = sh;
        sun.shadow.camera.near = 5;
        sun.shadow.camera.far = 3000;
        sun.shadow.bias = -0.0005;
        sun.shadow.radius = 5;
        scene.add(sun);
        scene.add(new THREE.AmbientLight(0xffffff, 0.9));

        const geos: { dispose(): void }[] = [];
        const mats: { dispose(): void }[] = [];
        const g = <T extends { dispose(): void }>(x: T) => (geos.push(x), x);
        const m = <T extends { dispose(): void }>(x: T) => (mats.push(x), x);

        const ground = new THREE.Mesh(g(new THREE.PlaneGeometry(4000, 4000)), m(new THREE.ShadowMaterial({ opacity: 0.12 })));
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        scene.add(ground);

        /** ความพองของแผ่นถุง (มม. จากแกนกลาง) ที่ (x, y) · ก้น/ข้างแบนชิดกัน · บนสุดเท่าความหนาซิป */
        const bulge = (x: number, y: number) => {
          const u = Math.min(1, Math.abs((2 * x) / BW));
          const v = Math.max(0, Math.min(1, y / BH));
          const gx = 1 - Math.pow(u, 6);
          const gy = 1 - Math.pow(Math.abs(2 * v - 1), 4);
          return 0.15 + ZT * Math.pow(v, 3) + BULGE * gx * gy;
        };
        /** แผ่นโค้งตามความพอง: x0..x1 × y0..y1 (มม. พิกัดถุง) · side +1 หน้า / −1 หลัง · lift = ยกออกจากผิว */
        const sheetGeo = (x0: number, x1: number, y0: number, y1: number, side: 1 | -1, lift = 0) => {
          const geo = new THREE.PlaneGeometry(x1 - x0, y1 - y0, 72, 52);
          const p = geo.attributes.position as InstanceType<typeof THREE.BufferAttribute>;
          for (let i = 0; i < p.count; i++) {
            const x = p.getX(i) + (x0 + x1) / 2;
            const y = p.getY(i) + (y0 + y1) / 2;
            p.setXYZ(i, side === 1 ? x : -x, y, side * (bulge(x, y) + lift));
          }
          // ด้านหลัง (x → −x, z → −z) = หมุน 180° รอบแกนตั้ง ทิศหน้าแผ่นหันออกนอกถุงเองแล้ว — ห้ามกลับลำดับจุด (เคยกลับแล้วด้านหลังหายทั้งแผ่น)
          geo.computeVertexNormals();
          return g(geo);
        };
        /** มาสก์มุมมน (alphaMap ใช้ช่องเขียว) */
        const roundMask = (w: number, h: number, r: number) => {
          const cv = document.createElement("canvas");
          const s = 4;
          cv.width = Math.round(w * s);
          cv.height = Math.round(h * s);
          const ctx = cv.getContext("2d")!;
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, cv.width, cv.height);
          ctx.fillStyle = "#fff";
          ctx.beginPath();
          ctx.roundRect(0, 0, cv.width, cv.height, r * s);
          ctx.fill();
          const t = new THREE.CanvasTexture(cv);
          mats.push(t);
          return t;
        };

        // 🌈 เนื้อโฮโลแกรม: ไล่สีรุ้ง + โลหะเงา + iridescence (สีเปลี่ยนตามมุม) · map เลื่อนตามมุมกล้อง
        const holoTex = new THREE.CanvasTexture(holoCanvas());
        holoTex.colorSpace = THREE.SRGBColorSpace;
        holoTex.wrapS = holoTex.wrapT = THREE.MirroredRepeatWrapping; // สะท้อนต่อกัน — ไม่เห็นรอยต่อเป็นตาราง
        holoTex.repeat.set(1.6, 1.2);
        mats.push(holoTex);
        const holo = m(
          new THREE.MeshPhysicalMaterial({
            map: holoTex,
            color: 0xffffff,
            metalness: 0.7,
            roughness: 0.18,
            iridescence: 0.9,
            iridescenceIOR: 1.8,
            iridescenceThicknessRange: [200, 760],
            clearcoat: 1,
            clearcoatRoughness: 0.1,
            envMapIntensity: 1.25,
            alphaMap: roundMask(BW, BH + 2, R),
            alphaTest: 0.5,
            side: THREE.FrontSide,
          }),
        );
        const printTex = new THREE.CanvasTexture(printCv);
        printTex.colorSpace = THREE.SRGBColorSpace;
        printTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        mats.push(printTex);
        // หมึกบนถุงพลาสติก: ด้านกึ่งเงา · ส่วนโปร่งในผืน = ไม่มีหมึก เห็นโฮโลแกรมข้างใต้
        const ink = m(new THREE.MeshPhysicalMaterial({ map: printTex, roughness: 0.5, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.3, envMapIntensity: 0.55, transparent: true, alphaTest: 0.02 }));

        const root = new THREE.Group();
        root.position.y = LIFT;
        scene.add(root);
        const add = (mesh: InstanceType<typeof THREE.Mesh>, shadow = true) => {
          mesh.castShadow = shadow;
          mesh.receiveShadow = false;
          root.add(mesh);
          return mesh;
        };

        // 👜 ตัวถุง หน้า + หลัง (โฮโลแกรม) — สูงเกินใต้ซิปนิดหน่อยให้ซ่อนรอยต่อ
        add(new THREE.Mesh(sheetGeo(-BW / 2, BW / 2, 0, BH + 2, 1), holo));
        add(new THREE.Mesh(sheetGeo(-BW / 2, BW / 2, 0, BH + 2, -1), holo));
        // 🖨 ลายพิมพ์ด้านหน้า (ตามพื้นที่พิมพ์ · โค้งตามถุง)
        const inkMesh = add(new THREE.Mesh(sheetGeo(-PW / 2, PW / 2, BD, BD + PH, 1, 0.06), ink), false);
        inkMesh.renderOrder = 2;
        // ขอบซีลข้าง/ก้นถุง (เส้นเชื่อมบาง ๆ แบนชิดกัน)
        const sealMat = m(new THREE.MeshPhysicalMaterial({ map: holoTex, metalness: 0.8, roughness: 0.22, iridescence: 1, iridescenceIOR: 1.9, envMapIntensity: 1.3 }));
        const seal = (w: number, h: number, x: number, y: number) => {
          const s = add(new THREE.Mesh(g(new THREE.BoxGeometry(w, h, 0.5)), sealMat), true);
          s.position.set(x, y, 0);
        };
        seal(BW - 2 * R, 0.8, 0, 0.4);
        seal(0.8, BH - R, -BW / 2 + 0.4, (BH + R) / 2);
        seal(0.8, BH - R, BW / 2 - 0.4, (BH + R) / 2);

        // 🤐 ซิปแบบหัวสไลด์ + ห่วงดึง (เจ้าของร้านส่งรูปถุงจริง 22 ต.ค. 69 "ให้ซิปเหมือนของจริงหน่อย"):
        //   แถบซิป PVC สีเดียว (ดำเงา / ขาวขุ่นโปร่งนิด ๆ) · ฟันซิปเป็นริ้วแถบล่างทั้งหน้า-หลัง (ทองคู่ซิปดำ · ฟ้าอ่อนคู่ซิปขาว)
        //   หัวซิปสี่เหลี่ยมที่ปลายขวา + ห่วงวงกลมตั้งขึ้นเหนือถุง สีเดียวกับซิป
        const black = mock.zip === "black";
        const zipMat = m(
          new THREE.MeshPhysicalMaterial({
            color: black ? 0x18191b : 0xf4f6f8,
            roughness: black ? 0.22 : 0.42,
            metalness: 0,
            clearcoat: 1,
            clearcoatRoughness: black ? 0.08 : 0.3,
            envMapIntensity: 1,
            ...(black ? {} : { transparent: true, opacity: 0.9 }),
          }),
        );
        const zr = 0.8;
        const zipShape = new THREE.Shape();
        zipShape.moveTo(-BW / 2, 0);
        zipShape.lineTo(BW / 2, 0);
        zipShape.lineTo(BW / 2, ZH - zr);
        zipShape.quadraticCurveTo(BW / 2, ZH, BW / 2 - zr, ZH);
        zipShape.lineTo(-BW / 2 + zr, ZH);
        zipShape.quadraticCurveTo(-BW / 2, ZH, -BW / 2, ZH - zr);
        zipShape.lineTo(-BW / 2, 0);
        const zip = add(
          new THREE.Mesh(g(new THREE.ExtrudeGeometry(zipShape, { depth: ZT * 2, bevelEnabled: true, bevelSize: 0.3, bevelThickness: 0.3, bevelSegments: 2, curveSegments: 8 })), zipMat),
          true,
        );
        zip.position.set(0, BH, -ZT);
        // ฟันซิป: ริ้วแนวตั้งถี่ ๆ (ทุก ~0.8 มม.) แถบสูง ~1.8 มม. ชิดขอบล่างของแถบซิป
        {
          const cv = document.createElement("canvas");
          cv.width = 64;
          cv.height = 16;
          const ctx = cv.getContext("2d")!;
          const [c1, c2] = black ? ["#e2b456", "#8a6420"] : ["#bfe6fb", "#6fb3dc"];
          const gr = ctx.createLinearGradient(0, 0, 64, 0);
          for (let i = 0; i <= 8; i++) gr.addColorStop(i / 8, i % 2 ? c2 : c1);
          ctx.fillStyle = gr;
          ctx.fillRect(0, 0, 64, 16);
          const t = new THREE.CanvasTexture(cv);
          t.colorSpace = THREE.SRGBColorSpace;
          t.wrapS = THREE.RepeatWrapping;
          t.repeat.set(BW / 3.2, 1); // 4 ริ้วต่อช่วงลาย 64px → ริ้วละ 0.8 มม.
          mats.push(t);
          const teethMat = m(new THREE.MeshStandardMaterial({ map: t, metalness: black ? 0.65 : 0.1, roughness: 0.35, envMapIntensity: 1.2 }));
          const TH = 1.8;
          for (const side of [1, -1] as const) {
            const te = add(new THREE.Mesh(g(new THREE.PlaneGeometry(BW - 1, TH)), teethMat), false);
            te.position.set(0, BH + TH / 2 + 0.15, side * (ZT + 0.32));
            if (side === -1) te.rotation.y = Math.PI;
          }
        }
        // หัวซิปสไลด์ (ปลายขวา) + คอ + ห่วงดึงวงกลม
        const sliderMat = m(new THREE.MeshPhysicalMaterial({ color: black ? 0x111113 : 0xf7f8fa, roughness: black ? 0.28 : 0.4, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.2 }));
        const sw = 7;
        const sx = BW / 2 - sw / 2 - 0.6;
        const slider = add(new THREE.Mesh(g(new THREE.BoxGeometry(sw, ZH + 1.2, ZT * 2 + 2.6)), sliderMat), true);
        slider.position.set(sx, BH + (ZH + 1.2) / 2 - 0.2, 0);
        // ร่องกันลื่นบนหัวซิป (ขีดแนวนอน 4 เส้น ด้านหน้า)
        const grooveMat = m(new THREE.MeshStandardMaterial({ color: black ? 0x2c2d31 : 0xd5d9df, roughness: 0.5 }));
        for (let i = 0; i < 4; i++) {
          const gv = add(new THREE.Mesh(g(new THREE.BoxGeometry(sw * 0.7, 0.35, 0.2)), grooveMat), false);
          gv.position.set(sx, BH + ZH * 0.3 + i * 1.5, ZT + 1.35);
        }
        const neck = add(new THREE.Mesh(g(new THREE.BoxGeometry(3.4, 4.5, 1.8)), sliderMat), true);
        neck.position.set(sx, BH + ZH + 1 + 2.25, 0);
        const RING_R = 7.5;
        const ring = add(new THREE.Mesh(g(new THREE.TorusGeometry(RING_R, 1.35, 16, 48)), sliderMat), true);
        ring.position.set(sx, BH + ZH + 1 + 4.5 + RING_R - 0.6, 0);

        const lookY = LIFT + (TOT + RING_EXTRA) / 2;

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
          // ✨ ประกายโฮโลแกรมไหลตามมุมมอง
          holoTex.offset.set(c.yaw * 0.35 + now / 60000, c.pitch * 0.4);
          const dist = BASE_DIST / c.zoom;
          const cp2 = Math.cos(c.pitch);
          camera.position.set(dist * Math.sin(c.yaw) * cp2, dist * Math.sin(c.pitch) + lookY, dist * Math.cos(c.yaw) * cp2);
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
        console.error("Bag3D", e);
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
            🌈
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex min-w-0 items-center gap-2 text-[15px] font-extrabold leading-tight text-stone-800">
              <span className="shrink-0">ดูแบบ 3D</span>
              <span className="inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-[11px] font-extrabold text-stone-700 ring-1 ring-sky-200">
                <span className="truncate">กระเป๋าโฮโลแกรม</span>
                {mock.label ? <span className="truncate text-stone-400">· {mock.label}</span> : null}
              </span>
            </p>
            <p className="truncate text-xs text-stone-500">
              {title} · ถุงซิปล็อกโฮโลแกรม · {mock.zip === "black" ? "ซิปดำ" : "ซิปขาว"}
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
          className="relative mx-3 h-[min(60vh,500px)] cursor-grab touch-none select-none overflow-hidden rounded-2xl bg-[radial-gradient(ellipse_at_50%_38%,#f8fafc_0%,#e2e8f0_55%,#cbd5e1_100%)] ring-1 ring-stone-200/70 active:cursor-grabbing"
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
            <span className="whitespace-nowrap rounded-full bg-sky-600 px-2 py-0.5 text-[11px] font-extrabold text-white">{mock.zip === "black" ? "🌈 ซิปดำ" : "🌈 ซิปขาว"}</span>
            <span className="truncate text-xs font-bold text-stone-700">{spin ? "หมุนโชว์รอบตัว" : BAG_VIEW_TH[view]}</span>
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
              {(["left", "front", "right", "back"] as BagView[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={!spin && view === v}
                  onClick={() => goView(v)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${!spin && view === v ? "bg-sky-600 text-white shadow-sm" : "text-stone-500 hover:text-stone-800"}`}
                >
                  {v === "front" ? "👁 ด้านหน้า" : BAG_VIEW_TH[v]}
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
            ภาพจำลองโดยประมาณ — ถุงพลาสติกโฮโลแกรม ส่วนที่ไม่ได้วางลายจะเห็นเนื้อโฮโลแกรม · ประกายสีรุ้งเปลี่ยนตามมุมมอง · สีจริงอาจต่างจากหน้าจอเล็กน้อย
          </p>
        </div>
      </div>
    </div>
  );
}
