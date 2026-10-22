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
        const BASE_H = rollup ? 78 : 0; // ฐานอลูมิเนียม Roll UP สูง 7.2 ซม. + ขาเหยียบ 6 มม.
        const LIFT = rollup ? BASE_H : 90; // X-Stand: ขอบล่างป้ายลอยจากพื้น ~9 ซม. (แขวนด้วยตาไก่ ขาหน้ายันพื้น)
        const TOTAL_H = LIFT + VH + (rollup ? 30 : 40);
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
        const plastic = m(new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.55, metalness: 0.1, envMapIntensity: 0.5 }));
        const steel = m(new THREE.MeshStandardMaterial({ color: 0x9a9da3, roughness: 0.35, metalness: 0.85, envMapIntensity: 1.0 }));
        const wire = m(new THREE.MeshStandardMaterial({ color: 0x6b6e74, roughness: 0.4, metalness: 0.8, envMapIntensity: 0.8 }));
        const rubber = m(new THREE.MeshStandardMaterial({ color: 0x202124, roughness: 0.9, metalness: 0, envMapIntensity: 0.2 }));

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
          /**
           * 🪧 X-Stand ตามรูปจริง (เจ้าของร้านส่งรูป 22 ต.ค. 69 "ปรับให้ 3D คล้ายของจริงหน่อย"):
           * · ดุมกลาง (body plate) พลาสติกดำ อยู่หลังป้าย ต่ำกว่ากึ่งกลาง (~40% จากขอบล่าง)
           * · ก้านไฟเบอร์กลาส 4 ก้านจากดุมไปมุมป้าย — ก้านบน 2 ก้าน "โค้งออกนอก/ถอยหลัง" (ก้านยาวกว่าระยะตรง ถูกดัด)
           *   ปลายก้านมีตะขอ (top hanger) เกี่ยวตาไก่ · ก้านล่าง 2 ก้านยาวเลยมุมล่างลงไปยันพื้นเป็นขาหน้า (foot hanger มีตะขอเกี่ยวตาไก่ล่าง)
           * · ขาหลัง 1 ขาจากดุมเอียงลงพื้นด้านหลัง + ลวดสลิง 2 เส้นตัว V จากเท้าขาหลังขึ้นตัวหนีบขาหน้า 2 ข้าง
           * · ป้ายแขวนด้วยตาไก่ 4 มุม ขอบล่างลอยจากพื้น ~9 ซม.
           */
          const EYE = 27;
          const sgn = [-1, 1] as const;
          // ดุมต่ำกว่ากลางป้าย ~44% จากพื้น (วัดจากรูปที่ 3 ที่เจ้าของร้านส่ง 22 ต.ค. 69) · อยู่หลังป้าย 8 ซม.
          const hubY = LIFT + VH * 0.44 - LIFT * 0.44;
          // ดุมถอยหลังป้าย ~28 ซม. (เจ้าของร้านส่งรูป Iron X Stand 22 ต.ค. 69 "ปรับให้โครงแบบในภาพที่ 1" — รอบก่อนดุมชิดป้าย 8 ซม. มองข้างแบนเป็นเส้นเดียว)
          const hubZ = -280;
          const hubV = new THREE.Vector3(0, hubY, hubZ);
          const up = new THREE.Vector3(0, 1, 0);
          const tube = (curve: InstanceType<typeof THREE.QuadraticBezierCurve3> | InstanceType<typeof THREE.CatmullRomCurve3>, r: number, mat: InstanceType<typeof THREE.MeshStandardMaterial>, segs = 28) =>
            add(new THREE.Mesh(g(new THREE.TubeGeometry(curve, segs, r, 10, false)), mat));
          const rod = (a: InstanceType<typeof THREE.Vector3>, b: InstanceType<typeof THREE.Vector3>, r: number, mat = carbon) => {
            const len = a.distanceTo(b);
            const mesh = add(new THREE.Mesh(g(new THREE.CylinderGeometry(r, r, len, 12)), mat));
            mesh.position.copy(a).lerp(b, 0.5);
            mesh.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize());
            return mesh;
          };
          const cap = (p: InstanceType<typeof THREE.Vector3>, r: number, h: number, dir?: InstanceType<typeof THREE.Vector3>) => {
            const c = add(new THREE.Mesh(g(new THREE.CylinderGeometry(r, r * 0.85, h, 14)), rubber), false);
            c.position.copy(p);
            if (dir) c.quaternion.setFromUnitVectors(up, dir.clone().normalize());
            return c;
          };
          const ringGeo = g(new THREE.TorusGeometry(7, 2.2, 10, 28));

          // ดุมกลาง: แผ่นพลาสติกดำทรงกล่องมุมมน + หัวกลมรับก้าน
          // body plate: แผ่นพลาสติกดำทรงถ้วยคว่ำ (กว้าง 7 สูง 9 ลึก 3.5 ซม.) + ปีกบนรับก้านบน 2 ก้าน
          const hub = add(new THREE.Mesh(g(new THREE.BoxGeometry(70, 88, 34)), plastic));
          hub.position.copy(hubV);
          const hubDome = add(new THREE.Mesh(g(new THREE.SphereGeometry(30, 20, 14)), plastic), false);
          hubDome.position.set(0, hubY + 30, hubZ - 6);
          hubDome.scale.set(1.25, 0.6, 0.75);

          for (const sx of sgn) {
            const cxEye = sx * (VW / 2 - EYE);
            // ตาไก่บน/ล่าง
            for (const cy of [LIFT + VH - EYE, LIFT + EYE]) {
              const ring = add(new THREE.Mesh(ringGeo, brass), false);
              ring.position.set(cxEye, cy, 1.5);
            }
            // 🎣 ก้านบน: เกือบตรงจากดุมไป "ข้างตาไก่บน" ปลายโผล่เหนือมุมป้าย ~3 ซม. แล้วตะขอ (top hanger) พับลงเสียบตาไก่
            //    (เจ้าของร้านมาร์กกรอบแดง 4 มุม 22 ต.ค. 69 "มันต้องเกี่ยวแบบนี้" — ก้านต้องมาชนมุมป้ายจริง ไม่ใช่ลอยอยู่ข้างหลัง)
            const eyeTop = new THREE.Vector3(cxEye, LIFT + VH - EYE, 2);
            const eyeBot = new THREE.Vector3(cxEye, LIFT + EYE, 2);
            const tipTop = new THREE.Vector3(cxEye + sx * 9, eyeTop.y + 30, -5);
            // ก้านไฟเบอร์ถูกดัดโก่ง "ไปข้างหลัง" (แรงดึงที่ทำให้ป้ายตึง) — มองหน้า/หลังยังเกือบตรง · มองข้างเห็นเป็นคันธนูแบบรูปจริง
            const ctlTop = hubV.clone().lerp(tipTop, 0.5).add(new THREE.Vector3(sx * 10, 0, -150));
            tube(new THREE.QuadraticBezierCurve3(hubV, ctlTop, tipTop), 5.5, carbon);
            cap(tipTop, 7, 16, tipTop.clone().sub(ctlTop));
            // ตะขอบน: แขนโลหะจากปลายก้านโค้งเข้าหาตาไก่ แล้วหมุดเสียบผ่านรูลงมา
            const hookElbowT = new THREE.Vector3(cxEye, eyeTop.y + 12, 2);
            rod(new THREE.Vector3(tipTop.x, tipTop.y - 8, tipTop.z), hookElbowT, 2.2, steel);
            rod(hookElbowT, new THREE.Vector3(cxEye, eyeTop.y - 4, 2), 2.2, steel);
            // 🦶 ก้านล่าง = ขาหน้า: จากดุมวิ่งผ่าน "ข้างตาไก่ล่าง" ลงไปยันพื้นเลยมุมป้ายนิดหน่อย · ตะขอ (foot hanger) บนก้านเกี่ยวตาไก่ล่าง
            //    ขาล่าง "ตรง" เส้นเดียว (เจ้าของร้านทัก 22 ต.ค. 69 "ขาด้านล่างต้องตรงๆ แบบในภาพ" — รอบก่อนโค้งหักที่ตาไก่): เท้า = จุดที่เส้นตรงดุม→ข้างตาไก่ล่างยาวต่อไปถึงพื้น
            const passBot = new THREE.Vector3(cxEye + sx * 9, eyeBot.y, -5);
            const foot = hubV.clone().lerp(passBot, hubV.y / (hubV.y - passBot.y));
            rod(hubV, foot, 5.5, carbon);
            cap(new THREE.Vector3(foot.x, 8, foot.z), 9, 16);
            const hookElbowB = new THREE.Vector3(cxEye, eyeBot.y - 10, 2);
            rod(new THREE.Vector3(passBot.x, passBot.y - 6, passBot.z), hookElbowB, 2.2, steel);
            rod(hookElbowB, new THREE.Vector3(cxEye, eyeBot.y + 4, 2), 2.2, steel);
            // 🧵 ลวดสลิง 2 เส้น "ตัว V" (เจ้าของร้านมาร์กรูป 22 ต.ค. 69 "เพิ่มลวด 2 เส้นแบบนี้ให้หน่อย"):
            //    ทั้ง 2 เส้นเริ่มที่ "เท้าขาหลัง" ขึ้นไปหาตัวหนีบบนขาหน้าแต่ละข้าง (~40% จากดุม) — กันขาหน้า/ขาหลังกางออก
            //    (รอบก่อน ๆ วางไขว้/ตัวหนีบบนขาหลัง ผิดจากของจริง)
            const rearFootW = new THREE.Vector3(0, 10, hubZ - VH * 0.36);
            const clampF = hubV.clone().lerp(foot, 0.4);
            rod(rearFootW, clampF, 1.1, wire);
            const clamp = add(new THREE.Mesh(g(new THREE.CylinderGeometry(8, 8, 16, 12)), plastic), false);
            clamp.position.copy(clampF);
            clamp.quaternion.setFromUnitVectors(up, foot.clone().sub(hubV).normalize());
          }
          // ขาหลัง: ท่อเดียวจากดุมเอียงลงพื้นด้านหลัง + แป้นเท้า
          // ขาหลังกางไปข้างหลังไกลกว่าเดิมให้สมดุลกับดุมที่ถอยหลัง
          const rearFoot = new THREE.Vector3(0, 0, hubZ - VH * 0.36);
          rod(hubV.clone().add(new THREE.Vector3(0, -30, -10)), rearFoot, 6.5, carbon);
          cap(new THREE.Vector3(0, 8, rearFoot.z), 11, 16);
        } else {
          /**
           * 🪧 Roll UP ตามรูปจริง: ฐานอลูมิเนียมโปรไฟล์มน (กว้างเกินผืนข้างละ 2 ซม. · สูง 7 ซม. · ลึก 7 ซม.) ฝาข้างดำ
           * + ขาเหยียบแบนพับออกใต้ฐาน 2 ข้าง · เสาเดี่ยว 3 ท่อนชิดหลังผืน เสียบตรงกลางฐาน · รางหนีบบน (snap rail) + ตะขอเกี่ยวเสา
           */
          const BW = VW + 40;
          const BH = 72;
          const BD = 70;
          const FOOT_T = 6;
          const prof = new THREE.Shape();
          const rTop = 24;
          const rBot = 8;
          // โปรไฟล์ฐาน (ระนาบ y-z): สี่เหลี่ยมมุมมน บนมนมาก ล่างมนน้อย
          prof.moveTo(-BD / 2 + rBot, 0);
          prof.lineTo(BD / 2 - rBot, 0);
          prof.quadraticCurveTo(BD / 2, 0, BD / 2, rBot);
          prof.lineTo(BD / 2, BH - rTop);
          prof.quadraticCurveTo(BD / 2, BH, BD / 2 - rTop, BH);
          prof.lineTo(-BD / 2 + rTop, BH);
          prof.quadraticCurveTo(-BD / 2, BH, -BD / 2, BH - rTop);
          prof.lineTo(-BD / 2, rBot);
          prof.quadraticCurveTo(-BD / 2, 0, -BD / 2 + rBot, 0);
          const baseGeo = g(new THREE.ExtrudeGeometry(prof, { depth: BW, bevelEnabled: false, curveSegments: 10 }));
          const base = add(new THREE.Mesh(baseGeo, alu));
          // extrude ไปตาม +z → หมุนให้ยาวตามแกน x · โปรไฟล์ x เดิม = ความลึก (z) · y = สูง
          base.rotation.y = Math.PI / 2;
          base.position.set(-BW / 2, FOOT_T, 0);
          // ฝาข้างดำ 2 ข้าง (ใหญ่กว่าโปรไฟล์นิดหน่อย)
          const capGeo = g(new THREE.ExtrudeGeometry(prof, { depth: 10, bevelEnabled: false, curveSegments: 10 }));
          for (const sx of [-1, 1]) {
            const c = add(new THREE.Mesh(capGeo, plastic), false);
            c.rotation.y = Math.PI / 2;
            c.scale.set(1.06, 1.05, 1);
            c.position.set(sx * (BW / 2) - (sx > 0 ? 0 : 10), FOOT_T - 1, 0);
          }
          // ร่องผืนบนฐาน (เส้นดำ) + ขาเหยียบแบนพับออกใต้ฐาน
          const slot = add(new THREE.Mesh(g(new THREE.BoxGeometry(VW + 8, 3, 8)), plastic), false);
          slot.position.set(0, FOOT_T + BH - 1, 0);
          for (const sx of [-1, 1]) {
            const ft = add(new THREE.Mesh(g(new THREE.BoxGeometry(34, FOOT_T, 190)), aluDark));
            ft.position.set(sx * (BW / 2 - 70), FOOT_T / 2, 0);
          }
          // 🧷 เสาเดี่ยว 3 ท่อน (เรียวขึ้น) ชิดหลังผืน เสียบจากกลางฐาน + เบ้ารับเสา
          const POLE_Z = -24;
          const socket = add(new THREE.Mesh(g(new THREE.CylinderGeometry(15, 17, 18, 18)), aluDark), false);
          socket.position.set(0, FOOT_T + BH + 6, POLE_Z);
          const poleTop = LIFT + VH + 10;
          const y0 = FOOT_T + BH;
          for (let i = 0; i < 3; i++) {
            const a = y0 + ((poleTop - y0) * i) / 3;
            const b = y0 + ((poleTop - y0) * (i + 1)) / 3;
            const r = 9.5 - i * 1.6;
            const seg = add(new THREE.Mesh(g(new THREE.CylinderGeometry(r, r, b - a + 8, 16)), i === 2 ? aluDark : alu));
            seg.position.set(0, (a + b) / 2, POLE_Z);
            if (i > 0) {
              // ข้อต่อระหว่างท่อน
              const joint = add(new THREE.Mesh(g(new THREE.CylinderGeometry(r + 2.5, r + 2.5, 22, 16)), plastic), false);
              joint.position.set(0, a, POLE_Z);
            }
          }
          // 📏 รางหนีบบน: แท่งอลูมิเนียมบางหนีบขอบบนผืน + สันหลังราง + ตะขอเกี่ยวจากเสา
          const rail = add(new THREE.Mesh(g(new THREE.BoxGeometry(VW + 16, 18, 10)), alu));
          rail.position.set(0, LIFT + VH + 2, -1);
          const railBack = add(new THREE.Mesh(g(new THREE.BoxGeometry(VW + 16, 10, 6)), aluDark), false);
          railBack.position.set(0, LIFT + VH + 2, -8);
          const hook = add(new THREE.Mesh(g(new THREE.TorusGeometry(9, 2.4, 10, 22, Math.PI)), aluDark), false);
          hook.position.set(0, poleTop + 2, POLE_Z + 10);
          hook.rotation.y = Math.PI / 2;
          const hookArm = add(new THREE.Mesh(g(new THREE.BoxGeometry(6, 6, 20)), aluDark), false);
          hookArm.position.set(0, LIFT + VH + 2, -14);
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
