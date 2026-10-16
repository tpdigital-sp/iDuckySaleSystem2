"use client";

/**
 * ☕🧊 โมเดล 3D แก้วมัค — ลายที่ลูกค้าออกแบบพันรอบตัวแก้วให้เห็นของจริงก่อนสั่ง
 * (เจ้าของร้านสั่ง 16 ต.ค. 69 "ฉันต้องการให้มี 3D ด้วย" ที่จอออกแบบแก้วมัค MUG 11oz)
 *
 * three.js โหลดตอนกดปุ่มเท่านั้น (import() — ไม่ถ่วงหน้าสินค้า) · ตัวแก้ว = ทรงกระบอก + ผนังใน + ก้น + หูจับครึ่งวงแหวน
 * ลาย = แผ่นทรงกระบอกบางซ้อนนอกตัวแก้ว กว้างตามอาร์ตบอร์ดจริง (200 มม. บนเส้นรอบวง 258 = ~280°) กึ่งกลางตรงข้ามหูจับ
 * แสง = RoomEnvironment (เงาสะท้อนเซรามิกเงา) + ไฟหลักทอดเงาลงพื้น · ลากซ้าย-ขวา = หมุน · ขึ้น-ลง = เงย/ก้ม · ล้อเมาส์/หยิก = ซูม
 * ตัวแก้วตามตัวเลือก: ขาวเงา (clearcoat) · ขุ่น (ผิวด้าน) · ใส (transmission) — ดู lib/mug-mock
 */

import { useEffect, useRef, useState } from "react";
import { MUG_11OZ, MUG_BODY_TH, MUG_VIEW_TH, type MugMock, type MugView } from "@/lib/mug-mock";

/** 🫧 แปลงลายเป็นหมึกโปร่งแสงสำหรับแก้วใส: alpha = ความเข้มสี (1 − ค่าสีอ่อนสุดของพิกเซล) · สีคงเดิม */
function inkAlpha(src: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const sc = src.getContext("2d");
  const oc = out.getContext("2d");
  if (!sc || !oc) return src;
  const img = sc.getImageData(0, 0, src.width, src.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const light = Math.min(d[i], d[i + 1], d[i + 2]);
    d[i + 3] = Math.round(((255 - light) * d[i + 3]) / 255);
  }
  oc.putImageData(img, 0, 0);
  return out;
}

/** มุมกล้อง (เรเดียน รอบแกนตั้ง) ของแต่ละมุมมอง — หูจับอยู่ที่ +x (θ = π/2) · ลายกึ่งกลางที่ −x */
const VIEW_YAW: Record<MugView, number> = { front: -Math.PI / 2, right: 0, left: Math.PI };

export default function Mug3D({
  sheet,
  sheetMm,
  mock,
  title,
  onClose,
}: {
  /** ลายทั้งอาร์ตบอร์ด (วาดจากตัววาดจริงของจอออกแบบ) */
  sheet: HTMLCanvasElement;
  sheetMm: { w: number; h: number };
  mock: MugMock;
  title: string;
  onClose: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [spin, setSpin] = useState(mock.spin);
  const [view, setView] = useState<MugView>(mock.view);
  const [zoom, setZoomState] = useState(1);
  const clampZ = (z: number) => Math.max(0.6, Math.min(3, z));
  /** ค่าที่ลูปวาดอ่านทุกเฟรม (ไม่ผ่าน state จะได้ไม่ re-render ตอนลาก) */
  const cam = useRef({ yaw: VIEW_YAW[mock.view], pitch: 0.22, zoom: 1, targetYaw: null as number | null, spin: mock.spin, dragging: false });
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; z: number } | null>(null);
  const setZoom = (fn: (z: number) => number) => {
    const z = clampZ(fn(cam.current.zoom));
    cam.current.zoom = z;
    setZoomState(z);
  };
  const goView = (v: MugView) => {
    setView(v);
    const cur = cam.current.yaw;
    // หมุนทางที่สั้นกว่าไปยังมุมเป้า
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
        const { heightMm: H, radiusMm: R, innerRadiusMm: RI } = MUG_11OZ;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        // 🎨 สีลายต้องตรงต้นฉบับ (เจ้าของร้านแจ้ง 16 ต.ค. 69 "ภาพ 3D สว่าง ขาวเกินไป ไม่เหมือนภาพต้นฉบับ"):
        // เดิม ACES (ยกสว่าง+ซีด) + ไฟสิ่งแวดล้อมเต็ม + ไฟหลัก 1.4 + เคลือบเงาสะท้อนขาวทั้งลาย → Neutral (คงสี) · ลดไฟทุกดวง · ลายเงาน้อยลง
        renderer.toneMapping = THREE.NeutralToneMapping;
        renderer.toneMappingExposure = 1;
        renderer.shadowMap.enabled = true;
        // three r186 ถอด PCFSoftShadowMap (เดิมเตือนทุกครั้งที่เปิด แล้วตกไปใช้ PCF เอง) — PCF + shadow.radius ให้ขอบเงานุ่มเหมือนเดิม
        renderer.shadowMap.type = THREE.PCFShadowMap;
        renderer.domElement.style.width = "100%";
        renderer.domElement.style.height = "100%";
        renderer.domElement.style.display = "block";
        box.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const pmrem = new THREE.PMREMGenerator(renderer);
        const room = new RoomEnvironment();
        const envTex = pmrem.fromScene(room, 0.04).texture;
        room.dispose(); // ใช้แค่สร้างแสงสะท้อนครั้งเดียว — คืนเรขาคณิต/วัสดุของห้องทันที
        scene.environment = envTex;
        scene.environmentIntensity = 0.45;

        const camera = new THREE.PerspectiveCamera(28, 1, 1, 3000);
        const BASE_DIST = 340;

        // ☀️ ไฟหลักตามกล้อง (อัปเดตทุกเฟรม) — เดิมตรึงที่ฝั่งหูจับ มุม "ด้านหน้า" จึงอยู่ในเงา ลายมืดกว่าต้นฉบับ
        // ค่าแสงจูนให้ลายหน้าตรงสว่างเท่าไฟล์ต้นฉบับ (ไฟใน three หาร π: ambient 1.0 ≈ 0.32 · sun 1.2·cos ≈ 0.38 · env 0.45 ≈ 0.3)
        const sun = new THREE.DirectionalLight(0xffffff, 1.2);
        sun.position.set(140, 260, 180);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        sun.shadow.camera.left = sun.shadow.camera.bottom = -140;
        sun.shadow.camera.right = sun.shadow.camera.top = 140;
        sun.shadow.camera.near = 10;
        sun.shadow.camera.far = 900;
        sun.shadow.bias = -0.0005;
        sun.shadow.radius = 4;
        scene.add(sun);
        scene.add(new THREE.AmbientLight(0xffffff, 1.0));

        const geos: { dispose(): void }[] = [];
        const mats: { dispose(): void }[] = [];
        const g = <T extends { dispose(): void }>(x: T) => (geos.push(x), x);
        const m = <T extends { dispose(): void }>(x: T) => (mats.push(x), x);

        // เงาพื้น — แก้วใสแสงทะลุ เงาจางกว่าแก้วทึบ
        const ground = new THREE.Mesh(g(new THREE.PlaneGeometry(900, 900)), m(new THREE.ShadowMaterial({ opacity: mock.body === "clear" ? 0.07 : 0.16 })));
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -H / 2;
        ground.receiveShadow = true;
        scene.add(ground);

        // 🏺 วัสดุตัวแก้วตามประเภท
        const bodyMat =
          mock.body === "clear"
            ? // 🫧 แก้วใส: เดิมใช้ transmission — three วาดฉากด้านหลังลงเรนเดอร์ทาร์เก็ตที่พื้นใส (canvas alpha) จึงได้สีดำโปร่ง
              // ตัวแก้วออกมาขุ่นเทาเหมือนกระจกฝ้า → ใช้ความโปร่ง (opacity) ต่ำ + เงาสะท้อนแรงแทน: เห็นพื้นหลังทะลุจริง ขอบ/ไฮไลต์บอกว่าเป็นแก้ว
              // depthWrite ปิด = ลายที่พันรอบและผนังฝั่งหลังไม่ถูกตัวแก้วบัง
              m(
                new THREE.MeshPhysicalMaterial({
                  color: 0xffffff,
                  roughness: 0.04,
                  metalness: 0,
                  clearcoat: 1,
                  clearcoatRoughness: 0.03,
                  envMapIntensity: 2.2,
                  transparent: true,
                  opacity: 0.16,
                  depthWrite: false,
                  side: THREE.DoubleSide,
                }),
              )
            : mock.body === "matte"
              ? m(new THREE.MeshStandardMaterial({ color: 0xf6f5f2, roughness: 0.78, metalness: 0 }))
              : m(new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.22, metalness: 0, clearcoat: 0.85, clearcoatRoughness: 0.12 }));
        const innerMat =
          mock.body === "clear"
            ? bodyMat
            : m(new THREE.MeshStandardMaterial({ color: mock.body === "matte" ? 0xe9e7e2 : 0xf2f1ee, roughness: mock.body === "matte" ? 0.8 : 0.35, side: THREE.BackSide }));

        const mug = new THREE.Group();
        scene.add(mug);
        const add = (mesh: InstanceType<typeof THREE.Mesh>, shadow = true) => {
          mesh.castShadow = shadow;
          mesh.receiveShadow = false;
          mug.add(mesh);
          return mesh;
        };
        // ตัวแก้ว (ผนังนอก) · ก้น · ขอบปาก · ผนังใน · ก้นใน
        add(new THREE.Mesh(g(new THREE.CylinderGeometry(R, R, H, 128, 1, true)), bodyMat));
        const bottom = add(new THREE.Mesh(g(new THREE.CircleGeometry(R, 128)), bodyMat));
        bottom.rotation.x = Math.PI / 2;
        bottom.position.y = -H / 2;
        const rim = add(new THREE.Mesh(g(new THREE.RingGeometry(RI, R, 128)), bodyMat), false);
        rim.rotation.x = -Math.PI / 2;
        rim.position.y = H / 2;
        if (mock.body !== "clear") {
          const inner = add(new THREE.Mesh(g(new THREE.CylinderGeometry(RI, RI, H - 4, 128, 1, true)), innerMat), false);
          inner.position.y = 2;
          const innerBottom = add(new THREE.Mesh(g(new THREE.CircleGeometry(RI, 128)), m(new THREE.MeshStandardMaterial({ color: 0xe6e4df, roughness: 0.6 }))), false);
          innerBottom.rotation.x = -Math.PI / 2;
          innerBottom.position.y = -H / 2 + 4;
        }
        // 🤏 หูจับ: ครึ่งวงแหวน (D) ฝังปลายในผนังที่ +x
        const handle = add(new THREE.Mesh(g(new THREE.TorusGeometry(23, 5.2, 24, 72, Math.PI)), bodyMat));
        handle.rotation.z = -Math.PI / 2;
        handle.scale.set(1, 1.06, 0.8);
        handle.position.set(R - 3.5, 0, 0);

        // 🖼 ลายพันรอบ: กว้างตามอาร์ตบอร์ด (เกินเส้นรอบวง 98% = ตัดเหลือมีรอยต่อ) · กึ่งกลางตรงข้ามหู (θ = 3π/2)
        const circ = 2 * Math.PI * R;
        const frac = Math.min(0.98, Math.max(0.1, sheetMm.w / circ));
        const thetaLen = frac * 2 * Math.PI;
        const printH = Math.min(H, Math.max(10, sheetMm.h));
        // 🫧 แก้วใส: หมึกซับลิเมชันบนแก้วเป็นสีโปร่งแสง ส่วนที่ขาวในไฟล์ = ไม่มีหมึก = เห็นแก้วใสทะลุ (ตรงคำอธิบายตัวเลือก "งานที่พิมพ์ออกมาเป็นสีโปร่ง")
        // → ความทึบของแต่ละพิกเซล = ความเข้มสี (ขาวล้วนโปร่ง 100% · ดำทึบ) · ลายสีอ่อนจึงเห็นจางเหมือนของจริง
        const tex = new THREE.CanvasTexture(mock.body === "clear" ? inkAlpha(sheet) : sheet);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        mats.push(tex);
        const printMat = m(
          mock.body === "matte"
            ? new THREE.MeshStandardMaterial({ map: tex, roughness: 0.72, metalness: 0 })
            : mock.body === "clear"
              ? new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.12, metalness: 0, transparent: true, alphaTest: 0.02, side: THREE.DoubleSide })
              : new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.45, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.35 }),
        );
        const print = add(
          new THREE.Mesh(g(new THREE.CylinderGeometry(R + 0.18, R + 0.18, printH, 192, 1, true, (3 * Math.PI) / 2 - thetaLen / 2, thetaLen)), printMat),
          false,
        );
        print.position.y = 0;

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
          camera.position.set(dist * Math.sin(c.yaw) * cp, dist * Math.sin(c.pitch) + 6, dist * Math.cos(c.yaw) * cp);
          camera.lookAt(0, -2, 0);
          // ไฟหลักอยู่ทางกล้อง เยื้องขึ้นบน-ขวาเล็กน้อย ให้มีมิติแต่ไม่ทิ้งเงาบนลายฝั่งที่มอง
          sun.position.set(camera.position.x, 0, camera.position.z).normalize().multiplyScalar(360);
          sun.position.y = 300;
          sun.position.x += 90 * Math.cos(c.yaw);
          sun.position.z -= 90 * Math.sin(c.yaw);
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
          // คืน WebGL context ทันที — dispose() อย่างเดียวไม่คืน เปิด-ปิดซ้ำ ~16 ครั้งเบราว์เซอร์ขึ้น "Too many active WebGL contexts" (ตรวจ 16 ต.ค. 69)
          renderer.forceContextLoss();
          renderer.domElement.remove();
        };
        if (dead) cleanup();
      } catch (e) {
        console.error("Mug3D", e);
        if (!dead) setStatus("error");
      }
    })();
    return () => {
      dead = true;
      cleanup?.();
    };
    // สร้างฉากครั้งเดียวต่อการเปิด — ลาย/ประเภทแก้วไม่เปลี่ยนระหว่างเปิดอยู่
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const viewLabel = MUG_VIEW_TH[view];

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-stone-900/55 p-3 backdrop-blur-[2px]" onClick={onClose}>
      <div className="relative flex w-full max-w-3xl flex-col rounded-3xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-3.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-500 text-lg shadow-[0_4px_12px_rgba(139,92,246,.35)]">
            ☕
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-extrabold leading-tight text-stone-800">ดูแบบ 3D</p>
            <p className="truncate text-xs text-stone-500">
              {title} · {MUG_BODY_TH[mock.body]} · ลาย {Math.round(sheetMm.w) / 10}×{Math.round(sheetMm.h) / 10} ซม.
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
            cam.current.pitch = Math.max(-0.35, Math.min(1.15, d.pitch + (e.clientY - d.y) * 0.006));
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
            <span className="whitespace-nowrap rounded-full bg-sky-600 px-2 py-0.5 text-[11px] font-extrabold text-white">☕ 11 oz</span>
            <span className="truncate text-xs font-bold text-stone-700">{spin ? "หมุนโชว์รอบตัว" : viewLabel}</span>
          </div>
          {/* 📱 จอแคบ: เหลือคำสั้น ๆ ไม่ให้แถบล้นกรอบ */}
          <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-3 whitespace-nowrap rounded-full bg-stone-900/70 px-3.5 py-1.5 text-[11px] font-semibold text-white backdrop-blur">
            <span className="hidden sm:inline">↔ ลาก = หมุนดูรอบแก้ว</span>
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
            <button
              type="button"
              onClick={() => setZoom((z) => z / 1.25)}
              className="grid h-8 w-8 place-items-center rounded-full text-lg font-bold text-stone-600 hover:bg-stone-100"
              aria-label="ซูมออก"
            >
              −
            </button>
            <button
              type="button"
              onClick={() => setZoom(() => 1)}
              className="min-w-[52px] rounded-full px-1 text-xs font-extrabold text-stone-700 hover:bg-stone-100"
              title="กลับขนาดปกติ"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => z * 1.25)}
              className="grid h-8 w-8 place-items-center rounded-full text-lg font-bold text-stone-600 hover:bg-stone-100"
              aria-label="ซูมเข้า"
            >
              +
            </button>
          </div>
        </div>

        <div className="space-y-2.5 px-4 pb-4 pt-3">
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
            <span className="flex items-center rounded-full bg-stone-100 p-0.5 ring-1 ring-stone-200/70" role="radiogroup" aria-label="มุมมอง">
              {(["left", "front", "right"] as MugView[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={!spin && view === v}
                  onClick={() => goView(v)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                    !spin && view === v ? "bg-sky-600 text-white shadow-sm" : "text-stone-500 hover:text-stone-800"
                  }`}
                >
                  {v === "front" ? "👁 ด้านหน้า" : v === "right" ? "หูจับขวา" : "หูจับซ้าย"}
                </button>
              ))}
            </span>
            <button
              type="button"
              aria-pressed={spin}
              onClick={() => setSpin((s) => !s)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-extrabold ring-1 transition ${
                spin ? "bg-violet-600 text-white ring-violet-600 shadow-sm" : "bg-white text-violet-700 ring-violet-200 hover:bg-violet-50"
              }`}
            >
              {spin ? "⏸ หยุดหมุน" : "🔄 หมุนโชว์รอบตัว"}
            </button>
          </div>
          <p className="text-center text-[11px] text-stone-400">
            ภาพจำลองโดยประมาณ — ลายพันรอบแก้วโดยกึ่งกลางลายอยู่ตรงข้ามหูจับ · สีจริงอาจต่างจากหน้าจอเล็กน้อย
          </p>
        </div>
      </div>
    </div>
  );
}
