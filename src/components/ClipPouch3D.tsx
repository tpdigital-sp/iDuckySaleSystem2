"use client";

/**
 * 👛🧊 โมเดล 3D กระเป๋าต๊อบแต๊บ (Clip Pouch) — ลายที่ลูกค้าออกแบบบนกระเป๋าผ้าจริง ให้เห็นก่อนสั่ง
 * (เจ้าของร้านสั่ง 23 ต.ค. 69 "เพิ่ม 3D ให้ด้วย" — clip-pouch · กระเป๋าผ้าปากคลิปสปริง บีบข้างแล้วปากเปิด)
 *
 * three.js โหลดตอนกดปุ่มเท่านั้น (import()) · โครงเดียวกับ Bag3D (ลาก=หมุน · ล้อ/หยิก=ซูม · มุมมอง 4 ด้าน)
 * ผืน = ผ้ากางออกแนวตั้ง (โซนใน lib/pouch-mock): ด้านหน้า = ช่องตัวหนีบ + ตัวกระเป๋าครึ่งบน · ด้านหลัง = ครึ่งล่างวางกลับหัว (หมุน 180°)
 * ตัวกระเป๋าพองนิด ๆ แบนที่ตะเข็บข้าง/ก้นพับ · ช่องตัวหนีบหนาเท่าแถบสปริง · ขอบปากพับเข้าด้านในแยกหน้า-หลัง (ปากปิดด้วยคลิป)
 * ตะเข็บเย็บใต้ช่องตัวหนีบ = สีไหมที่เลือก · ปลายคลิปสปริงโลหะโผล่สองข้าง · เนื้อผ้าเงา/ด้านตาม "เนื้อผ้า"
 */

import { useEffect, useRef, useState } from "react";
import { POUCH_CLIP_MM, POUCH_FABRIC_TH, POUCH_SEAM_X_MM, POUCH_TOP_MM, POUCH_VIEW_TH, type PouchMock, type PouchView } from "@/lib/pouch-mock";

/** มุมกล้อง — yaw รอบแกนตั้ง (ด้านหน้าหันไป +z) · pitch ก้ม/เงย (บวก = มองจากบน · ลบ = มองจากล่าง) */
const VIEW_CAM: Record<PouchView, { yaw: number; pitch: number }> = {
  front: { yaw: 0, pitch: 0.14 },
  right: { yaw: Math.PI / 2, pitch: 0.14 },
  left: { yaw: -Math.PI / 2, pitch: 0.14 },
  back: { yaw: Math.PI, pitch: 0.14 },
  // 👀 ด้านบน/ล่าง (เจ้าของร้านสั่ง 23 ต.ค. 69 "3D สามารถดูด้านล่างได้") — เฉียงหน้านิด ๆ เห็นปากคลิป/ก้นพับต่อจากลายหน้า
  top: { yaw: 0.35, pitch: 1.05 },
  bottom: { yaw: 0.35, pitch: -1.05 },
};
/** ก้ม/เงยได้สุด (ใกล้ ±90° แต่ไม่ถึง — lookAt เสียทิศเมื่อตรงดิ่ง) */
const PITCH_MAX = 1.35;

/** ครอปผืน (มม.) เป็นผืนใหม่ · rot180 = หมุนกลับหัว (ด้านหลังในผืนวางกลับหัว) · k = พิกเซล/มม. */
function crop(src: HTMLCanvasElement, k: number, x: number, y: number, w: number, h: number, rot180 = false): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = Math.max(2, Math.round(w * k));
  out.height = Math.max(2, Math.round(h * k));
  const ctx = out.getContext("2d");
  if (!ctx) return src;
  if (rot180) {
    ctx.translate(out.width, out.height);
    ctx.rotate(Math.PI);
  }
  ctx.drawImage(src, x * k, y * k, w * k, h * k, 0, 0, out.width, out.height);
  return out;
}

/** สีเฉลี่ยของแถบผืน (มม.) — ใช้กับตะเข็บข้าง (แถบแคบเกินจะวางลาย) */
function avgColor(src: HTMLCanvasElement, k: number, x: number, y: number, w: number, h: number): string {
  const c = crop(src, k, x, y, w, h);
  const ctx = c.getContext("2d");
  if (!ctx) return "#ffffff";
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 16) {
    r += d[i];
    g += d[i + 1];
    b += d[i + 2];
    n++;
  }
  const hx = (v: number) => Math.round(v / Math.max(1, n)).toString(16).padStart(2, "0");
  return `#${hx(r)}${hx(g)}${hx(b)}`;
}

/** ลายทอผ้าแคนวาส (ใช้เป็น bumpMap ซ้ำทั้งผืน) */
function weaveCanvas(): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const ctx = cv.getContext("2d");
  if (!ctx) return cv;
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      const up = (i + j) % 2 === 0;
      const gr = up ? ctx.createLinearGradient(i * 8, 0, i * 8 + 8, 0) : ctx.createLinearGradient(0, j * 8, 0, j * 8 + 8);
      gr.addColorStop(0, "#5a5a5a");
      gr.addColorStop(0.5, "#c8c8c8");
      gr.addColorStop(1, "#5a5a5a");
      ctx.fillStyle = gr;
      ctx.fillRect(i * 8, j * 8, 8, 8);
    }
  }
  return cv;
}

export default function ClipPouch3D({
  sheet,
  sheetMm,
  mock,
  title,
  onClose,
}: {
  /** ลายทั้งอาร์ตบอร์ด (ผืนกางออก · วาดจากตัววาดจริงของจอออกแบบ) */
  sheet: HTMLCanvasElement;
  sheetMm: { w: number; h: number };
  mock: PouchMock;
  title: string;
  onClose: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [spin, setSpin] = useState(false);
  const [view, setView] = useState<PouchView>("front");
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
  const goView = (v: PouchView) => {
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
        // 📐 กระเป๋าสำเร็จ: กว้าง = ผืน − ตะเข็บข้าง · สูง = จากขอบบน (หลังพับเข้าใน) ถึงกลางผืน (ก้นพับ)
        const SX = POUCH_SEAM_X_MM;
        const TOP = POUCH_TOP_MM;
        const PW = W - 2 * SX;
        const PH = H / 2 - TOP;
        const CH = Math.min(POUCH_CLIP_MM, PH * 0.4);
        const ZT = 2.2; // ครึ่งความหนาตรงช่องตัวหนีบ (ผ้า 2 ชั้น + แถบสปริง)
        const BULGE = Math.min(7, Math.max(3.2, PW * 0.04)); // พองกลางตัวกระเป๋า
        const LIFT = 6;
        const frontCv = crop(sheet, k, SX, TOP, PW, PH);
        const backCv = crop(sheet, k, SX, H / 2, PW, PH, true);

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.NeutralToneMapping;
        renderer.toneMappingExposure = 1.08;
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
        scene.environmentIntensity = 0.7;

        const camera = new THREE.PerspectiveCamera(28, 1, 5, 5000);
        const BASE_DIST = Math.max(PH + LIFT, PW * 0.9) * 3.2;

        const sun = new THREE.DirectionalLight(0xffffff, 1.15);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        const sh = Math.max(PW, PH) * 1.4;
        sun.shadow.camera.left = sun.shadow.camera.bottom = -sh;
        sun.shadow.camera.right = sun.shadow.camera.top = sh;
        sun.shadow.camera.near = 5;
        sun.shadow.camera.far = 3000;
        sun.shadow.bias = -0.0005;
        sun.shadow.radius = 5;
        scene.add(sun);
        scene.add(new THREE.AmbientLight(0xffffff, 0.85));
        // ไฟเติมตามกล้อง (ไม่ทอดเงา) — ผ้าด้านที่หันหากล้องไม่มืด
        const fill = new THREE.DirectionalLight(0xffffff, 0.45);
        scene.add(fill);

        const geos: { dispose(): void }[] = [];
        const mats: { dispose(): void }[] = [];
        const g = <T extends { dispose(): void }>(x: T) => (geos.push(x), x);
        const m = <T extends { dispose(): void }>(x: T) => (mats.push(x), x);

        const ground = new THREE.Mesh(g(new THREE.PlaneGeometry(4000, 4000)), m(new THREE.ShadowMaterial({ opacity: 0.12 })));
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        scene.add(ground);

        const smooth = (a: number, b: number, v: number) => {
          const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
          return t * t * (3 - 2 * t);
        };
        const Y_CH = PH - CH; // ขอบล่างช่องตัวหนีบ (แนวตะเข็บเย็บ)
        /** ความหนาครึ่งหนึ่งของกระเป๋า (มม. จากแกนกลาง) ที่ (x, y) · ข้าง/ก้นแบน · ช่องตัวหนีบหนาเท่าสปริง */
        const thick = (x: number, y: number) => {
          const u = Math.min(1, Math.abs((2 * x) / PW));
          const ch = smooth(Y_CH - 5, Y_CH + 1, y);
          const vb = Math.max(0, Math.min(1, y / Y_CH));
          const body = BULGE * Math.pow(Math.sin((Math.PI / 2) * vb), 0.75) * (1 - Math.pow(u, 6));
          const chan = ZT * (1 - Math.pow(u, 16));
          return 0.45 + (1 - ch) * body + ch * chan;
        };
        /** แผ่นผ้าตามความหนา: เต็มกว้าง × สูง · side +1 หน้า / −1 หลัง (หมุน 180° รอบแกนตั้ง) · lift = ยกออกจากผิว */
        const panelGeo = (side: 1 | -1, lift = 0) => {
          const geo = new THREE.PlaneGeometry(PW, PH, 80, 80);
          const p = geo.attributes.position as InstanceType<typeof THREE.BufferAttribute>;
          for (let i = 0; i < p.count; i++) {
            const x = p.getX(i);
            const y = p.getY(i) + PH / 2;
            p.setXYZ(i, side === 1 ? x : -x, y, side * (thick(x, y) + lift));
          }
          geo.computeVertexNormals();
          return g(geo);
        };
        /**
         * ขอบพับโค้ง (ปากบน/ก้นล่าง) ตามแนวกว้าง: ครึ่งวงจาก z = zFrom(x) ไป z = zTo(x) โค้งพ้นขอบ y0 ไปทาง dir
         * ลาย = แถบผืนแนวนอน (sheetY0 → sheetY1 ตามความยาวโค้ง) · x ผืน = x กระเป๋า (พับตามแนวนอน ไม่กลับข้าง)
         */
        const foldMesh = (y0: number, dir: 1 | -1, zFrom: (x: number) => number, zTo: (x: number) => number, sheetY0: number, sheetY1: number, mat: InstanceType<typeof THREE.Material>) => {
          const NX = 80;
          const NA = 10;
          const pos: number[] = [];
          const uv: number[] = [];
          const idx: number[] = [];
          for (let i = 0; i <= NX; i++) {
            const x = -PW / 2 + (PW * i) / NX;
            const a = zFrom(x);
            const b = zTo(x);
            const zc = (a + b) / 2;
            const r = Math.abs(a - b) / 2;
            for (let j = 0; j <= NA; j++) {
              const th = (Math.PI * j) / NA;
              pos.push(x, y0 + dir * r * Math.sin(th), zc + (a - zc) * Math.cos(th));
              uv.push(i / NX, j / NA);
            }
          }
          for (let i = 0; i < NX; i++)
            for (let j = 0; j < NA; j++) {
              const q = i * (NA + 1) + j;
              const q2 = q + NA + 1;
              idx.push(q, q2, q + 1, q + 1, q2, q2 + 1);
            }
          const geo = new THREE.BufferGeometry();
          geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
          geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
          geo.setIndex(idx);
          geo.computeVertexNormals();
          g(geo);
          // ลายของโค้ง: แถว v=0 = sheetY0 · v=1 = sheetY1 (flipY ปิด ให้แถวบนของผืนเล็กตรงกับ v=0)
          const y0s = Math.min(sheetY0, sheetY1);
          const hs = Math.max(0.6, Math.abs(sheetY1 - sheetY0));
          const cv = crop(sheet, k, SX, Math.max(0, Math.min(H - hs, y0s)), PW, hs);
          const t = new THREE.CanvasTexture(cv);
          t.colorSpace = THREE.SRGBColorSpace;
          t.flipY = sheetY1 < sheetY0;
          mats.push(t);
          const mm = (mat as InstanceType<typeof THREE.MeshPhysicalMaterial>).clone();
          mm.map = t;
          mm.side = THREE.DoubleSide;
          mats.push(mm);
          return new THREE.Mesh(geo, mm);
        };

        // 🧵 เนื้อผ้า: ซาติน/ดัชเชส เงาลื่น (sheen) · บาร์บี้ เงานิด ๆ · แคนวาส ด้าน + ลายทอ
        const fab = mock.fabric;
        const fabricOpts = {
          satin: { roughness: 0.36, sheen: 1, sheenRoughness: 0.3 },
          duchess: { roughness: 0.42, sheen: 0.85, sheenRoughness: 0.38 },
          barbie: { roughness: 0.62, sheen: 0.45, sheenRoughness: 0.55 },
          canvas: { roughness: 0.92, sheen: 0.15, sheenRoughness: 0.8 },
        }[fab];
        const weave = fab === "canvas" ? new THREE.CanvasTexture(weaveCanvas()) : null;
        if (weave) {
          weave.wrapS = weave.wrapT = THREE.RepeatWrapping;
          weave.repeat.set(PW / 2.2, PH / 2.2);
          mats.push(weave);
        }
        const fabricMat = (cv: HTMLCanvasElement) => {
          const t = new THREE.CanvasTexture(cv);
          t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = renderer.capabilities.getMaxAnisotropy();
          mats.push(t);
          return m(
            new THREE.MeshPhysicalMaterial({
              map: t,
              metalness: 0,
              roughness: fabricOpts.roughness,
              sheen: fabricOpts.sheen,
              sheenRoughness: fabricOpts.sheenRoughness,
              sheenColor: new THREE.Color(0xffffff),
              envMapIntensity: 0.55,
              ...(weave ? { bumpMap: weave, bumpScale: 0.6 } : {}),
              side: THREE.FrontSide,
            }),
          );
        };
        const frontMat = fabricMat(frontCv);
        const backMat = fabricMat(backCv);

        const root = new THREE.Group();
        root.position.y = LIFT;
        scene.add(root);
        const add = (mesh: InstanceType<typeof THREE.Mesh>, shadow = true) => {
          mesh.castShadow = shadow;
          mesh.receiveShadow = false;
          root.add(mesh);
          return mesh;
        };

        // 👛 ตัวกระเป๋า หน้า + หลัง
        add(new THREE.Mesh(panelGeo(1), frontMat));
        add(new THREE.Mesh(panelGeo(-1), backMat));
        // 👄 ปากกระเป๋า: ขอบบนของแต่ละด้านพับเข้าด้านใน (โค้งจากผิวนอกเข้าหาแกนกลาง) — หน้า/หลังแยกกัน ปากปิดด้วยคลิป
        //   ลายโค้ง = แถบ "พับเข้าด้านใน" ต่อจากขอบบน (ผืน y = TOP ถอยขึ้น / ด้านหลัง y = H − TOP ถอยลง)
        const lip = (x: number) => thick(x, PH);
        const arcLen = (Math.PI * (ZT + 0.45)) / 2;
        add(foldMesh(PH, 1, (x) => lip(x), () => 0.02, TOP, TOP - arcLen, frontMat));
        add(foldMesh(PH, 1, (x) => -lip(x), () => -0.02, H - TOP, H - TOP + arcLen, backMat));
        // ก้นกระเป๋า = พับกลางผืน (หน้าต่อหลัง)
        add(foldMesh(0, -1, (x) => thick(x, 0), (x) => -thick(x, 0), H / 2 - 0.7, H / 2 + 0.7, frontMat));
        // ตะเข็บข้าง (เย็บกลับด้านใน เห็นเป็นขอบผ้าบาง ๆ) — สีเฉลี่ยของขอบลาย
        for (const s of [1, -1] as const) {
          const col = avgColor(sheet, k, s === 1 ? W - SX - 2 : SX, TOP, 2, PH);
          const sideMat = m(new THREE.MeshPhysicalMaterial({ color: col, roughness: fabricOpts.roughness, sheen: fabricOpts.sheen, sheenRoughness: fabricOpts.sheenRoughness }));
          const NY = 60;
          const pos: number[] = [];
          const idx: number[] = [];
          for (let j = 0; j <= NY; j++) {
            const y = (PH * j) / NY;
            const t = thick(s * PW * 0.499, y) + 0.05;
            pos.push(s * PW / 2, y, t, s * PW / 2, y, -t);
          }
          for (let j = 0; j < NY; j++) {
            const q = j * 2;
            idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2);
          }
          const geo = g(new THREE.BufferGeometry());
          geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
          geo.setIndex(idx);
          geo.computeVertexNormals();
          sideMat.side = THREE.DoubleSide;
          add(new THREE.Mesh(geo, sideMat));
        }

        // 🧵 ตะเข็บเย็บใต้ช่องตัวหนีบ (เส้นประตามสีไหม) ทั้งหน้า-หลัง
        const threadMat = m(new THREE.MeshStandardMaterial({ color: mock.thread, roughness: 0.55 }));
        const DASH = 2.2;
        const GAP = 1.1;
        const ySt = Y_CH + 0.2;
        for (const side of [1, -1] as const)
          for (let x = -PW / 2 + 2.5; x + DASH <= PW / 2 - 2.5; x += DASH + GAP) {
            const cx = x + DASH / 2;
            const d = add(new THREE.Mesh(g(new THREE.BoxGeometry(DASH, 0.55, 0.35)), threadMat), false);
            d.position.set(cx, ySt, side * (thick(cx, ySt) + 0.12));
          }

        // 🔩 คลิปสปริง = บานพับแกนตั้งที่ปลายสองข้าง (เจ้าของร้านส่งรูปสินค้าจริง 23 ต.ค. 69 "คลิปเป็นแบบภาพตัวอย่างที่ส่งให้"):
        //   แถบเหล็ก 2 แผ่น (หน้า/หลัง) ในช่องตัวหนีบ โผล่พ้นตะเข็บข้างมาเป็นข้อบานพับทรงกระบอกตั้ง 3 ข้อ (บน-ล่าง = แผ่นหน้า · กลาง = แผ่นหลัง)
        //   มีร่องคั่นระหว่างข้อ + หมุดแกนโผล่หัว-ท้าย · สูงเกือบเต็มช่องตัวหนีบ ชิดขอบปาก
        const steel = m(new THREE.MeshStandardMaterial({ color: 0xe4e7eb, metalness: 1, roughness: 0.22, envMapIntensity: 1.5 }));
        const steelDark = m(new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 1, roughness: 0.35, envMapIntensity: 1.2 }));
        const KR = Math.max(1.1, Math.min(1.6, CH * 0.075)); // รัศมีข้อบานพับ
        const KH = Math.min(15, CH * 0.78); // ความสูงบานพับทั้งชุด
        const KGAP = 0.35; // ร่องคั่นข้อ
        const seg = (KH - 2 * KGAP) / 3;
        const yTop = PH - CH * 0.08; // ชิดขอบปากนิด ๆ แบบรูปจริง
        const yBot = yTop - KH;
        const LEAF = 2.6; // แผ่นเหล็กโผล่จากผ้าถึงข้อ
        for (const s of [1, -1] as const) {
          const bx = s * (PW / 2 + LEAF + KR * 0.6);
          for (let i = 0; i < 3; i++) {
            const k0 = yTop - i * (seg + KGAP);
            const kn = add(new THREE.Mesh(g(new THREE.CylinderGeometry(KR, KR, seg, 28)), steel));
            kn.position.set(bx, k0 - seg / 2, 0);
            // แผ่นติดข้อ: ข้อบน/ล่าง = แผ่นหน้า (+z) · ข้อกลาง = แผ่นหลัง (−z) — แผ่นโค้งเข้าหาผ้า
            const side = i === 1 ? -1 : 1;
            const leaf = add(new THREE.Mesh(g(new THREE.BoxGeometry(LEAF + KR, seg, 0.55)), steel));
            leaf.position.set(s * (PW / 2 + (LEAF + KR) / 2 - 0.3), k0 - seg / 2, side * (KR - 0.35));
          }
          // แผ่นเหล็กยาวเต็มช่วงบานพับเข้าไปใต้ผ้า (หน้า/หลัง) — เห็นเป็นแถบตรงขอบผ้า
          for (const side of [1, -1] as const) {
            const strip = add(new THREE.Mesh(g(new THREE.BoxGeometry(1.6, KH, 0.5)), steelDark));
            strip.position.set(s * (PW / 2 + 0.5), yTop - KH / 2, side * (Math.min(ZT, KR) - 0.3));
          }
          // หมุดแกนโผล่หัว-ท้าย
          for (const y of [yTop + 0.35, yBot - 0.35]) {
            const pin = add(new THREE.Mesh(g(new THREE.CylinderGeometry(KR * 0.55, KR * 0.55, 0.7, 16)), steelDark), false);
            pin.position.set(bx, y, 0);
          }
        }

        const lookY = LIFT + PH / 2;
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
          fill.position.copy(camera.position);
          fill.target.position.set(0, lookY, 0);
          fill.target.updateMatrixWorld();
          // มองจากบน = แดดพอแล้ว · ก้มลงต่ำกว่าพื้นยิ่งเติมแรง (ก้นกระเป๋าไม่มืด)
          fill.intensity = c.pitch < 0 ? 0.45 + Math.min(0.6, -c.pitch * 0.6) : 0.45;
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
        console.error("ClipPouch3D", e);
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
            👛
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex min-w-0 items-center gap-2 text-[15px] font-extrabold leading-tight text-stone-800">
              <span className="shrink-0">ดูแบบ 3D</span>
              <span className="inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-[11px] font-extrabold text-stone-700 ring-1 ring-sky-200">
                <span className="truncate">กระเป๋าต๊อบแต๊บ</span>
                {mock.label ? <span className="truncate text-stone-400">· {mock.label}</span> : null}
              </span>
            </p>
            <p className="truncate text-xs text-stone-500">
              {title} · {POUCH_FABRIC_TH[mock.fabric]}{mock.threadName ? ` · ไหม${mock.threadName}` : ""}
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
            // ↕ ก้มดูด้านล่างได้ (เดิมจำกัด −0.15 · เจ้าของร้านสั่ง 23 ต.ค. 69 "3D สามารถดูด้านล่างได้")
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
            <span className="whitespace-nowrap rounded-full bg-sky-600 px-2 py-0.5 text-[11px] font-extrabold text-white">{`👛 ${POUCH_FABRIC_TH[mock.fabric]}`}</span>
            <span className="truncate text-xs font-bold text-stone-700">{spin ? "หมุนโชว์รอบตัว" : POUCH_VIEW_TH[view]}</span>
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
              {(["left", "front", "right", "back"] as PouchView[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={!spin && view === v}
                  onClick={() => goView(v)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${!spin && view === v ? "bg-sky-600 text-white shadow-sm" : "text-stone-500 hover:text-stone-800"}`}
                >
                  {v === "front" ? "👁 ด้านหน้า" : POUCH_VIEW_TH[v]}
                </button>
              ))}
            </span>
            <span className="flex items-center rounded-full bg-stone-100 p-0.5 ring-1 ring-stone-200/70" role="radiogroup" aria-label="มุมบน-ล่าง">
              {(["top", "bottom"] as PouchView[]).map((v) => (
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
            ภาพจำลองโดยประมาณ — กระเป๋าผ้าปากคลิปสปริง ด้านหลัง = ครึ่งล่างของผืน (กลับหัวในไฟล์) · ตะเข็บข้าง/ส่วนพับเข้าด้านในไม่เห็นในงานจริง · สีผ้าจริงอาจต่างจากหน้าจอเล็กน้อย
          </p>
        </div>
      </div>
    </div>
  );
}
