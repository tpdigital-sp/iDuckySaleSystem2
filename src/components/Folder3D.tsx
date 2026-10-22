"use client";

/**
 * 📁🧊 โมเดล 3D แฟ้มจิ๋ว (MiNi FOLDER) — ลายที่ลูกค้าออกแบบบนปกพลาสติกใสจริง ให้เห็นก่อนสั่ง
 * (เจ้าของร้านสั่ง 22 ต.ค. 69 "ทำ 3d ให้หน่อย" — mini-folder · อ้างอิงรูปสินค้าจริง: แฟ้ม PVC ใส ไส้ซองใสหลายแผ่น สายกระดุมแป๊ก โซ่ไข่ปลาที่มุมบนฝั่งสัน)
 *
 * three.js โหลดตอนกดปุ่มเท่านั้น (import()) · โครงเดียวกับ Cushion3D/Stand3D (ลาก=หมุน · ล้อ/หยิก=ซูม · มุมมอง 4 ด้าน)
 * ผืนเทมเพลต = ปกหลัง | สัน | ปกหน้า กางออก (lib/folder-mock) → ครอปแต่ละส่วนไปแปะปกหน้า/สัน/ปกหลังของแฟ้มที่ปิดอยู่
 * พิมพ์บนพลาสติกใส: พิกเซลขาวล้วนของงาน = ไม่มีหมึก (มองทะลุเห็นไส้ซอง) · ส่วนอื่นพิมพ์ทึบตามลาย
 */

import { useEffect, useRef, useState } from "react";
import { FOLDER_INSET_MM, FOLDER_SPINE_MM, FOLDER_VIEW_TH, type FolderMock, type FolderView } from "@/lib/folder-mock";

/** มุมกล้อง (เรเดียน รอบแกนตั้ง) — ปกหน้าหันไป +z · ด้านซ้าย = สัน */
const VIEW_YAW: Record<FolderView, number> = { front: 0, right: Math.PI / 2, left: -Math.PI / 2, back: Math.PI };

/** ครอปส่วนของผืน (มม.) · ขาวล้วน → โปร่ง (ไม่มีหมึกบนพลาสติกใส) · k = พิกเซล/มม. */
function cropInk(src: HTMLCanvasElement, k: number, x: number, y: number, w: number, h: number): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = Math.max(2, Math.round(w * k));
  out.height = Math.max(2, Math.round(h * k));
  const ctx = out.getContext("2d", { willReadFrequently: true });
  if (!ctx) return src;
  ctx.drawImage(src, x * k, y * k, w * k, h * k, 0, 0, out.width, out.height);
  try {
    const im = ctx.getImageData(0, 0, out.width, out.height);
    const d = im.data;
    for (let i = 0; i < d.length; i += 4) {
      const m = Math.min(d[i], d[i + 1], d[i + 2]);
      // ขาวล้วน (≥ 247) = โปร่งเต็ม · 232–247 ไล่จางให้ขอบลายไม่เป็นขั้น
      if (m >= 247) d[i + 3] = 0;
      else if (m > 232) d[i + 3] = Math.round(d[i + 3] * ((247 - m) / 15));
    }
    ctx.putImageData(im, 0, 0);
  } catch {
    /* ผ้าใบปนเปื้อน (cross-origin) — ใช้ลายทึบทั้งผืน */
  }
  return out;
}

export default function Folder3D({
  sheet,
  sheetMm,
  mock,
  title,
  onClose,
}: {
  /** ลายทั้งอาร์ตบอร์ด (วาดจากตัววาดจริงของจอออกแบบ) */
  sheet: HTMLCanvasElement;
  sheetMm: { w: number; h: number };
  mock: FolderMock;
  title: string;
  onClose: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [spin, setSpin] = useState(false);
  const [view, setView] = useState<FolderView>("front");
  const [zoom, setZoomState] = useState(1);
  const clampZ = (z: number) => Math.max(0.6, Math.min(3, z));
  const cam = useRef({ yaw: 0.14, pitch: 0.16, zoom: 1, targetYaw: null as number | null, spin: false, dragging: false });
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; z: number } | null>(null);
  const setZoom = (fn: (z: number) => number) => {
    const z = clampZ(fn(cam.current.zoom));
    cam.current.zoom = z;
    setZoomState(z);
  };
  const goView = (v: FolderView) => {
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
        // 📐 มิติแฟ้มที่ปิดอยู่ (มม.) จากผืน: ปกหลัง | สัน | ปกหน้า · ขอบตัดเข้าใน
        const IN = FOLDER_INSET_MM;
        const SP = FOLDER_SPINE_MM;
        const Fw = W - IN - (W / 2 + SP / 2); // กว้างปก
        const Fh = H - 2 * IN; // สูงปก
        const T = SP * 0.55; // ความหนาแฟ้ม — ของจริงบางกว่าความกว้างสันในผืน (สันโค้ง+เผื่อพับ) · เทียบรูปสินค้า 22 ต.ค. 69
        const CT = 0.6; // ความหนาพลาสติกปก
        // ลาย: ปกหน้า = ขวาของผืน · ปกหลัง = ซ้าย · สัน = กลาง
        const frontCv = cropInk(sheet, k, W / 2 + SP / 2, IN, Fw, Fh);
        const backCv = cropInk(sheet, k, IN, IN, Fw, Fh);
        const spineCv = cropInk(sheet, k, W / 2 - SP / 2, IN, SP, Fh);

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
        scene.environmentIntensity = 0.5;

        const camera = new THREE.PerspectiveCamera(28, 1, 1, 5000);
        const BASE_DIST = Math.max(Fh, Fw * 1.6) * 3.3;

        const sun = new THREE.DirectionalLight(0xffffff, 1.1);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        const sh = Math.max(Fw, Fh) * 1.6;
        sun.shadow.camera.left = sun.shadow.camera.bottom = -sh;
        sun.shadow.camera.right = sun.shadow.camera.top = sh;
        sun.shadow.camera.near = 5;
        sun.shadow.camera.far = 2000;
        sun.shadow.bias = -0.0005;
        sun.shadow.radius = 4;
        scene.add(sun);
        scene.add(new THREE.AmbientLight(0xffffff, 1.0));

        const geos: { dispose(): void }[] = [];
        const mats: { dispose(): void }[] = [];
        const g = <T extends { dispose(): void }>(x: T) => (geos.push(x), x);
        const m = <T extends { dispose(): void }>(x: T) => (mats.push(x), x);

        const ground = new THREE.Mesh(g(new THREE.PlaneGeometry(3000, 3000)), m(new THREE.ShadowMaterial({ opacity: 0.13 })));
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        scene.add(ground);

        const texOf = (cv: HTMLCanvasElement, w: number, h: number) => {
          const t = new THREE.CanvasTexture(cv);
          t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = renderer.capabilities.getMaxAnisotropy();
          t.repeat.set(1 / w, 1 / h); // ShapeGeometry uv = พิกัดมม. → 0..1
          mats.push(t);
          return t;
        };

        // 🧊 พลาสติก PVC ใส (ปก/สาย) · ขอบเชื่อม PVC หนากว่า (ขุ่นนิด ๆ สะท้อนแสงเป็นเส้น) · ไส้ซองสีเทาเงินจาง ๆ (ตามรูปจริงตอนกางแฟ้ม)
        const clear = m(
          new THREE.MeshPhysicalMaterial({
            color: 0xf4f8fb,
            roughness: 0.1,
            metalness: 0,
            clearcoat: 1,
            clearcoatRoughness: 0.06,
            envMapIntensity: 1.6,
            transparent: true,
            opacity: 0.24,
            depthWrite: false,
            side: THREE.DoubleSide,
          }),
        );
        const rimMat = m(
          new THREE.MeshPhysicalMaterial({
            color: 0xeef4f8,
            roughness: 0.18,
            metalness: 0,
            clearcoat: 1,
            clearcoatRoughness: 0.1,
            envMapIntensity: 1.8,
            transparent: true,
            opacity: 0.55,
            depthWrite: false,
          }),
        );
        const sleeve = m(
          new THREE.MeshPhysicalMaterial({
            color: 0xb7c3cf,
            roughness: 0.3,
            metalness: 0,
            envMapIntensity: 1.2,
            transparent: true,
            opacity: 0.2,
            depthWrite: false,
            side: THREE.DoubleSide,
          }),
        );
        const printMat = (map: InstanceType<typeof THREE.CanvasTexture>) =>
          // FrontSide: ลายปกหลังไม่ทะลุมาให้เห็นกลับด้านผ่านปกหน้า (ของจริงมีรูป/ไส้ซองบังอยู่)
          m(new THREE.MeshStandardMaterial({ map, roughness: 0.42, metalness: 0, transparent: true, alphaTest: 0.03 }));

        /** สี่เหลี่ยมมุมมน (มม. 0..w × 0..h) · rSpine = มุมฝั่งซ้าย · rOpen = มุมฝั่งขวา */
        const rounded = (w: number, h: number, rSpine: number, rOpen: number) => {
          const s = new THREE.Shape();
          s.moveTo(rSpine, 0);
          s.lineTo(w - rOpen, 0);
          s.quadraticCurveTo(w, 0, w, rOpen);
          s.lineTo(w, h - rOpen);
          s.quadraticCurveTo(w, h, w - rOpen, h);
          s.lineTo(rSpine, h);
          s.quadraticCurveTo(0, h, 0, h - rSpine);
          s.lineTo(0, rSpine);
          s.quadraticCurveTo(0, 0, rSpine, 0);
          return s;
        };

        const root = new THREE.Group();
        scene.add(root);
        const add = (mesh: InstanceType<typeof THREE.Mesh>, shadow = true, parent: InstanceType<typeof THREE.Object3D> = root) => {
          mesh.castShadow = shadow;
          mesh.receiveShadow = false;
          parent.add(mesh);
          return mesh;
        };

        // 📕 ปกหน้า/หลัง: แผ่นใสมุมมน + ลายพิมพ์ · ตั้งตรงบนโต๊ะ ขอบล่าง y = 0 · สันอยู่ x = -Fw/2
        const mkCover = (cv: HTMLCanvasElement, side: 1 | -1) => {
          // ปกหน้า: x ท้องถิ่น 0 = ฝั่งสัน · ปกหลัง (หมุน 180°): x ท้องถิ่น 0 = ฝั่งเปิด → สลับรัศมีมุม
          const rL = side === 1 ? 1.2 : 3.4;
          const rR = side === 1 ? 3.4 : 1.2;
          const coverShape = rounded(Fw, Fh, rL, rR);
          const grp = new THREE.Group();
          const slab = add(new THREE.Mesh(g(new THREE.ExtrudeGeometry(coverShape, { depth: CT, bevelEnabled: false, curveSegments: 16 })), clear), false, grp);
          slab.position.z = -CT / 2;
          // (เส้นขอบเชื่อมรอบปกถอดออกแล้ว — เจ้าของร้านสั่ง 22 ต.ค. 69 "เอาเส้นขอบออกให้หน่อย")
          const ink = add(new THREE.Mesh(g(new THREE.ShapeGeometry(coverShape, 16)), printMat(texOf(cv, Fw, Fh))), true, grp);
          ink.position.z = CT / 2 + 0.05;
          ink.renderOrder = 3;
          if (side === 1) {
            grp.position.set(-Fw / 2, 0, T / 2);
          } else {
            // ปกหลัง: หมุนรอบแกนตั้ง 180° — มองจากหลังลายอ่านถูกทิศ สันอยู่ขวามือ
            grp.rotation.y = Math.PI;
            grp.position.set(Fw / 2, 0, -T / 2);
          }
          root.add(grp);
          return grp;
        };
        mkCover(frontCv, 1);
        mkCover(backCv, -1);

        // 📐 สัน: แผ่นใสพับโค้งครึ่งวง + ลายสัน (แผ่นตรงด้านนอก) + แกนเกลียวขาวข้างใน (เห็นในรูปจริงตอนกาง)
        const spineR = T / 2;
        const spineShell = add(
          new THREE.Mesh(g(new THREE.CylinderGeometry(spineR, spineR, Fh - 1.2, 32, 1, true, Math.PI, Math.PI)), clear),
          false,
        );
        spineShell.position.set(-Fw / 2, Fh / 2, 0);
        // ลายสันพันโค้งตามสันครึ่งวง (เจ้าของร้านทัก 22 ต.ค. 69 "มันต้องติดกัน" — เดิมเป็นแผ่นแบนลอยห่างข้างแฟ้ม เห็นช่องระหว่างปกกับสัน)
        //   CylinderGeometry θ π→2π: u = 0 ที่ขอบติดปกหลัง (z = -r) · u = 1 ที่ขอบติดปกหน้า (z = +r) — ตรงกับลายสันในผืน (ซ้ายติดปกหลัง ขวาติดปกหน้า)
        const spineTex = texOf(spineCv, 1, 1);
        const spineInk = add(
          new THREE.Mesh(g(new THREE.CylinderGeometry(spineR + 0.06, spineR + 0.06, Fh, 40, 1, true, Math.PI, Math.PI)), printMat(spineTex)),
          true,
        );
        spineInk.position.set(-Fw / 2, Fh / 2, 0);
        spineInk.renderOrder = 3;
        {
          const coilR = Math.min(1.4, spineR * 0.35);
          const y0 = 4;
          const y1 = Fh - 7;
          const turns = Math.max(8, Math.round((y1 - y0) / 1.15));
          class Helix extends THREE.Curve<InstanceType<typeof THREE.Vector3>> {
            constructor() {
              super();
            }
            getPoint(t: number, out = new THREE.Vector3()) {
              const a = t * turns * Math.PI * 2;
              return out.set(Math.cos(a) * coilR, y0 + (y1 - y0) * t, Math.sin(a) * coilR);
            }
          }
          const coilMat = m(new THREE.MeshStandardMaterial({ color: 0xf2f4f6, roughness: 0.45, metalness: 0, transparent: true, opacity: 0.85 }));
          const coil = add(new THREE.Mesh(g(new THREE.TubeGeometry(new Helix(), turns * 14, 0.28, 5, false)), coilMat), false);
          coil.position.set(-Fw / 2 - spineR * 0.35, 0, 0);
        }

        // 🗂 ไส้ซองใส 8 แผ่น (เล็กกว่าปกนิด · สีเทาเงินจาง ๆ ซ้อนกันแล้วเห็นเป็นเงิน) เรียงระหว่างปก
        const SLEEVES = 8;
        for (let i = 0; i < SLEEVES; i++) {
          const z = -T / 2 + CT + ((T - 2 * CT) * (i + 0.5)) / SLEEVES;
          const sl = add(new THREE.Mesh(g(new THREE.ShapeGeometry(rounded(Fw - 2.6, Fh - 3, 0.8, 2.6), 8)), sleeve), false);
          sl.position.set(-Fw / 2 + 0.8, 1.5, z);
          sl.renderOrder = 1;
        }

        // 🔘 สายกระดุม (PVC สองชั้น ปลายมน): จากปกหลังอ้อมขอบเปิด (ขวา) มาติดปกหน้า + กระดุมแป๊กโลหะ
        const btnR = Math.min(5, Fw * 0.14);
        const btnX = Fw / 2 - Math.max(btnR + 2.5, Fw * 0.19); // จากกึ่งกลางปก (โลก)
        const btnY = Fh / 2;
        const strapH = btnR * 3;
        const ST = 1.0; // ความหนาสาย
        const wrapR = T / 2 + CT + ST / 2 + 0.1;
        const strapX0 = btnX - btnR * 1.75; // ปลายมนบนปกหน้า
        const strapX1 = Fw / 2 + 0.9; // ขอบเปิด (เริ่มโค้งอ้อม)
        const tab = rounded(strapX1 - strapX0, strapH, strapH * 0.48, 0.01);
        const strapF = add(new THREE.Mesh(g(new THREE.ExtrudeGeometry(tab, { depth: ST, bevelEnabled: true, bevelSize: 0.25, bevelThickness: 0.25, bevelSegments: 2, curveSegments: 18 })), rimMat), false);
        strapF.position.set(strapX0, btnY - strapH / 2, T / 2 + CT + 0.1);
        const strapWrap = add(new THREE.Mesh(g(new THREE.CylinderGeometry(wrapR, wrapR, strapH, 28, 1, true, 0, Math.PI)), rimMat), false);
        strapWrap.position.set(strapX1, btnY, 0);
        const backTab = rounded(btnR * 2.4, strapH, 0.01, 0.01);
        const strapB = add(new THREE.Mesh(g(new THREE.ExtrudeGeometry(backTab, { depth: ST, bevelEnabled: false })), rimMat), false);
        strapB.position.set(strapX1 - btnR * 2.4, btnY - strapH / 2, -T / 2 - CT - 0.1 - ST);
        const metal = m(new THREE.MeshStandardMaterial({ color: 0xe3e5e8, metalness: 1, roughness: 0.2, envMapIntensity: 1.3 }));
        const btnZ = T / 2 + CT + 0.1 + ST + 0.25;
        const washer = add(new THREE.Mesh(g(new THREE.CylinderGeometry(btnR * 1.02, btnR * 1.05, 0.6, 40)), metal), true);
        washer.rotation.x = Math.PI / 2;
        washer.position.set(btnX, btnY, btnZ + 0.3);
        const dome = add(new THREE.Mesh(g(new THREE.SphereGeometry(btnR * 0.92, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2)), metal), true);
        dome.rotation.x = Math.PI / 2;
        dome.scale.set(1, 0.5, 1);
        dome.position.set(btnX, btnY, btnZ + 0.6);
        const rim = add(new THREE.Mesh(g(new THREE.TorusGeometry(btnR * 0.98, btnR * 0.1, 12, 40)), metal), true);
        rim.position.set(btnX, btnY, btnZ + 0.6);

        // ⛓ โซ่ไข่ปลา: ร้อยผ่านตาไก่ที่หัวสัน แล้วห้อยลงตรง ๆ สองเส้นข้างสันหน้าปก ข้อต่อที่ปลายล่าง (ตามรูปสินค้า)
        const ex = -Fw / 2 - spineR * 0.55;
        const ey = Fh - 3.6;
        const eyelet = add(new THREE.Mesh(g(new THREE.TorusGeometry(2.1, 0.55, 10, 28)), rimMat), false);
        eyelet.rotation.y = Math.PI / 2;
        eyelet.position.set(ex, ey, 0);
        const zf = T / 2 + CT + 1.6; // ระนาบโซ่หน้าปก
        const xa = -Fw / 2 + 1.4; // เส้นใน (ทับขอบปก)
        const xb = -Fw / 2 - 2.2; // เส้นนอก (ข้างสัน)
        const yb = Math.max(5, Fh * 0.12); // ปลายล่าง (ข้อต่อ)
        const loop = new THREE.CatmullRomCurve3(
          [
            new THREE.Vector3(ex, ey, 0),
            new THREE.Vector3(ex + 1.2, ey + 3.2, zf * 0.45),
            new THREE.Vector3(xa, ey - 2, zf),
            new THREE.Vector3(xa + 0.4, (ey + yb) / 2, zf + 0.4),
            new THREE.Vector3(xa, yb + 3, zf + 0.6),
            new THREE.Vector3((xa + xb) / 2, yb, zf + 0.8),
            new THREE.Vector3(xb, yb + 3, zf + 0.6),
            new THREE.Vector3(xb - 0.4, (ey + yb) / 2, zf + 0.3),
            new THREE.Vector3(xb, ey - 2.5, zf * 0.7),
            new THREE.Vector3(ex - 1.4, ey + 2.6, zf * 0.25),
          ],
          true,
          "centripetal",
        );
        const ballR = 1.15;
        const count = Math.max(20, Math.floor(loop.getLength() / (ballR * 2.3)));
        const chainMat = mock.chain.metal
          ? metal
          : m(new THREE.MeshStandardMaterial({ color: new THREE.Color(mock.chain.color), metalness: 0.15, roughness: 0.4 }));
        const balls = new THREE.InstancedMesh(g(new THREE.SphereGeometry(ballR, 16, 12)), chainMat, count);
        const mtx = new THREE.Matrix4();
        for (let i = 0; i < count; i++) {
          const p = loop.getPointAt(i / count);
          mtx.makeTranslation(p.x, p.y, p.z);
          balls.setMatrixAt(i, mtx);
        }
        balls.castShadow = true;
        root.add(balls);
        // ข้อต่อโซ่ (แคปซูล) ที่ปลายล่าง — แนวตั้งข้างเส้นใน
        const clasp = add(new THREE.Mesh(g(new THREE.CapsuleGeometry(ballR * 1.3, ballR * 3.4, 6, 12)), chainMat), true);
        clasp.position.set(xa + 0.2, yb + 2.4, zf + 0.7);
        clasp.rotation.z = 0.12;

        // ✨ ปกกลิสเตอร์: ประกายเล็ก ๆ ในเนื้อปกทั้งหน้า/หลัง กะพริบเบา ๆ
        let sparkle: InstanceType<typeof THREE.PointsMaterial> | null = null;
        if (mock.cover === "glitter") {
          const N = Math.round(Fw * Fh * 0.35);
          const pos = new Float32Array(N * 3);
          const col = new Float32Array(N * 3);
          // เม็ดโฮโลแกรมหลากสี (ขาวล้วนมองไม่เห็นบนพื้นสว่าง)
          const pal = [0xff7fd0, 0x5fd8ff, 0xffc93a, 0xb38cff, 0x9fe8a8, 0xc9ced4].map((c) => new THREE.Color(c));
          for (let i = 0; i < N; i++) {
            const side = i % 2 ? 1 : -1;
            pos[i * 3] = -Fw / 2 + 1 + Math.random() * (Fw - 2);
            pos[i * 3 + 1] = 1 + Math.random() * (Fh - 2);
            pos[i * 3 + 2] = side * (T / 2 + CT * 0.2);
            const c = pal[i % pal.length];
            col[i * 3] = c.r;
            col[i * 3 + 1] = c.g;
            col[i * 3 + 2] = c.b;
          }
          const pg = g(new THREE.BufferGeometry());
          pg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
          pg.setAttribute("color", new THREE.BufferAttribute(col, 3));
          sparkle = m(new THREE.PointsMaterial({ size: 0.85, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, sizeAttenuation: true }));
          const pts3 = new THREE.Points(pg, sparkle);
          pts3.renderOrder = 4;
          root.add(pts3);
        }

        const lookY = Fh / 2;

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
          if (sparkle) sparkle.opacity = 0.55 + 0.4 * Math.abs(Math.sin(now / 380 + c.yaw * 4));
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
          balls.dispose();
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
        console.error("Folder3D", e);
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
            📁
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex min-w-0 items-center gap-2 text-[15px] font-extrabold leading-tight text-stone-800">
              <span className="shrink-0">ดูแบบ 3D</span>
              <span className="inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-[11px] font-extrabold text-stone-700 ring-1 ring-sky-200">
                <span className="truncate">แฟ้มจิ๋ว</span>
                {mock.label ? <span className="truncate text-stone-400">· {mock.label}</span> : null}
              </span>
            </p>
            <p className="truncate text-xs text-stone-500">
              {title} · {mock.cover === "glitter" ? "ปกใสกลิสเตอร์" : "ปกใส"} · {mock.chain.label}
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
            <span className="whitespace-nowrap rounded-full bg-sky-600 px-2 py-0.5 text-[11px] font-extrabold text-white">{mock.cover === "glitter" ? "✨ ปกกลิสเตอร์" : "📁 ปกใส"}</span>
            <span className="truncate text-xs font-bold text-stone-700">{spin ? "หมุนโชว์รอบตัว" : FOLDER_VIEW_TH[view]}</span>
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
              {(["left", "front", "right", "back"] as FolderView[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={!spin && view === v}
                  onClick={() => goView(v)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${!spin && view === v ? "bg-sky-600 text-white shadow-sm" : "text-stone-500 hover:text-stone-800"}`}
                >
                  {v === "front" ? "👁 ด้านหน้า" : FOLDER_VIEW_TH[v]}
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
            ภาพจำลองโดยประมาณ — ปกพลาสติกใส ส่วนที่เป็นสีขาวล้วนในลายจะไม่พิมพ์ (มองทะลุเห็นไส้ซอง) · สีจริงอาจต่างจากหน้าจอเล็กน้อย
          </p>
        </div>
      </div>
    </div>
  );
}
