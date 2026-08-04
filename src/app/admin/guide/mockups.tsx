/**
 * ตัวอย่างหน้าจอสำหรับคู่มือ — จำลองหน้าตาจริงด้วยโค้ด (ไม่ใช่ภาพถ่ายหน้าจอ) เพราะ
 * 1) ภาพถ่ายจะมีชื่อ/ออเดอร์ลูกค้าจริงติดไปด้วย   2) พอหน้าจอเปลี่ยน ภาพจะเก่าทันที
 * ทุกชิ้นกดไม่ได้ — เป็นภาพประกอบเฉย ๆ
 */

/* ── ชิ้นส่วนพื้นฐาน ── */

/** กรอบรูปตัวอย่าง พร้อมคำบรรยาย */
export function Shot({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <figure className="overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50">
      <figcaption className="border-b border-dashed border-slate-200 bg-white/60 px-3 py-1.5 text-[0.7rem] font-bold uppercase tracking-[0.1em] text-slate-400">
        ตัวอย่างหน้าจอ · {caption}
      </figcaption>
      <div className="pointer-events-none select-none p-3" aria-hidden="true">
        {children}
      </div>
    </figure>
  );
}

/** ปุ่มจำลอง */
export function MBtn({
  children,
  tone = "plain",
  full,
}: {
  children: React.ReactNode;
  tone?: "plain" | "brand" | "ok" | "danger" | "ghost" | "violet";
  full?: boolean;
}) {
  const t = {
    plain: "border border-slate-200 bg-white text-slate-600",
    brand: "bg-amber-500 text-white",
    ok: "bg-emerald-600 text-white",
    danger: "bg-rose-500 text-white",
    ghost: "border border-dashed border-slate-300 bg-white text-slate-400",
    violet: "bg-violet-600 text-white",
  }[tone];
  return (
    <span className={`inline-block rounded-lg px-3 py-1.5 text-xs font-bold shadow-sm ${t} ${full ? "block w-full text-center" : ""}`}>
      {children}
    </span>
  );
}

/** ป้ายสถานะ/แท็ก */
export function MTag({ children, tone = "slate" }: { children: React.ReactNode; tone?: string }) {
  const t: Record<string, string> = {
    slate: "bg-slate-100 text-slate-600 ring-slate-200",
    green: "bg-green-50 text-green-700 ring-green-200",
    yellow: "bg-yellow-50 text-yellow-700 ring-yellow-200",
    orange: "bg-orange-50 text-orange-700 ring-orange-200",
    violet: "bg-violet-50 text-violet-700 ring-violet-200",
    rose: "bg-rose-50 text-rose-700 ring-rose-200",
    teal: "bg-teal-50 text-teal-700 ring-teal-200",
    sky: "bg-sky-50 text-sky-700 ring-sky-200",
    amber: "bg-amber-50 text-amber-700 ring-amber-200",
  };
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold ring-1 ${t[tone] ?? t.slate}`}>{children}</span>;
}

/** ช่องกรอกจำลอง */
export function MField({ label, value, placeholder }: { label?: string; value?: string; placeholder?: string }) {
  return (
    <label className="block">
      {label && <span className="mb-0.5 block text-[0.68rem] font-bold uppercase tracking-wide text-slate-400">{label}</span>}
      <span className={`block rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[0.78rem] ${value ? "text-slate-700" : "text-slate-300"}`}>
        {value || placeholder}
      </span>
    </label>
  );
}

/** ติ๊กถูก / ช่องว่าง */
export function MCheck({ on, children }: { on?: boolean; children: React.ReactNode }) {
  return (
    <span className="flex items-start gap-2 text-[0.78rem] text-slate-600">
      <span
        className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded text-[0.6rem] font-bold ${
          on ? "bg-teal-500 text-white" : "bg-white ring-1 ring-slate-300"
        }`}
      >
        {on ? "✓" : ""}
      </span>
      {children}
    </span>
  );
}

/** การ์ดขาวจำลอง */
export function MCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl bg-white p-3 ring-1 ring-slate-200 ${className}`}>{children}</div>;
}

/* ── ตัวอย่างเฉพาะเรื่อง ── */

/** ปุ่ม ♻️ ทำใหม่ / เคลม อย่างที่เห็นบนแถบหัวออเดอร์ */
export function ShotRedoButton() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm">
        🧾 ใบงาน + ใบปะหน้า
      </span>
      <span className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm">💳 ใบเสร็จ</span>
      <span className="rounded-lg border-2 border-emerald-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm">
        ♻️ ทำใหม่ / เคลม
      </span>
    </div>
  );
}

/** หน้าต่าง "ทำงานใหม่จากออเดอร์" — ตัวเลือกโหมด + ติ๊กรายการ */
export function ShotRedoModal({ mode = "claim" }: { mode?: "claim" | "reorder" }) {
  const claim = mode === "claim";
  const items: [string, number, number][] = [
    ["สแตนดี้ อะคริลิค 15 ซม.", 10, 200],
    ["เคสใสพรีเมี่ยม", 5, 350],
    ["กรอบรูปแคนวาส", 1, 550],
  ];
  return (
    <div className="mx-auto max-w-md overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-slate-200">
      <div className="border-b border-slate-100 px-4 py-3">
        <p className="text-sm font-extrabold text-slate-900">♻️ ทำงานใหม่จากออเดอร์ OD-260101-1234</p>
        <p className="mt-0.5 text-[0.72rem] text-slate-500">ระบบจะสร้างออเดอร์ใหม่ ใช้ชื่อ/ที่อยู่/สเปคงาน/ลายของลูกค้าชุดเดิม</p>
      </div>

      <div className="grid gap-2 p-4 sm:grid-cols-2">
        <div className={`rounded-xl border-2 p-2.5 ${claim ? "border-emerald-400 bg-emerald-50/60" : "border-slate-200 bg-white"}`}>
          <p className="text-[0.78rem] font-extrabold text-slate-900">♻️ งานเคลม</p>
          <p className="mt-0.5 text-[0.68rem] leading-snug text-slate-500">งานเสีย/พิมพ์ผิด/ส่งผิด — ทำส่งใหม่ให้ฟรี</p>
          <p className="mt-0.5 text-[0.68rem] font-bold text-rose-600">ราคา ฿0 · ค่าส่ง ฿0 · เริ่มงานได้เลย</p>
        </div>
        <div className={`rounded-xl border-2 p-2.5 ${claim ? "border-slate-200 bg-white" : "border-sky-400 bg-sky-50/60"}`}>
          <p className="text-[0.78rem] font-extrabold text-slate-900">🔁 สั่งซ้ำ (ออเดอร์ใหม่)</p>
          <p className="mt-0.5 text-[0.68rem] leading-snug text-slate-500">ลูกค้าอยากได้อีก — คิดเงินตามปกติ</p>
          <p className="mt-0.5 text-[0.68rem] font-bold text-sky-700">ราคาเดิม · เริ่มที่ “รอชำระเงิน”</p>
        </div>
      </div>

      {claim && (
        <div className="px-4 pb-2">
          <p className="text-[0.72rem] font-bold text-slate-700">
            เหตุผลที่ต้องเคลม <span className="text-rose-500">*</span>
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {["งานพิมพ์เสีย/สีเพี้ยน", "ทำผิดสเปค", "ส่งผิดรายการ", "ชำรุดจากขนส่ง", "ของหาย/ไม่ครบ"].map((r, i) => (
              <span
                key={r}
                className={`rounded-full px-2.5 py-1 text-[0.68rem] font-semibold ring-1 ${
                  i === 1 ? "bg-emerald-500 text-white ring-emerald-500" : "bg-white text-slate-500 ring-slate-200"
                }`}
              >
                {r}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="px-4 pb-3">
        <p className="mb-1.5 text-[0.72rem] font-bold text-slate-700">ทำใหม่รายการไหน (ค่าเริ่มต้น = ทั้งหมด)</p>
        <div className="space-y-1">
          {items.map(([name, qty, price], i) => (
            <div key={name} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5">
              <span className="flex items-center gap-2 text-[0.75rem] text-slate-700">
                <span
                  className={`grid h-4 w-4 shrink-0 place-items-center rounded text-[0.6rem] font-bold text-white ${
                    i === 2 ? "bg-white ring-1 ring-slate-300" : "bg-teal-500"
                  }`}
                >
                  {i === 2 ? "" : "✓"}
                </span>
                {i + 1}. {name}
              </span>
              <span className="shrink-0 text-[0.7rem] tabular-nums text-slate-400">
                ×{qty} · ฿{claim ? 0 : price}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[0.66rem] leading-snug text-slate-400">
          แบบงานเก่าไม่ถูกคัดลอกไป (ต้องทำ/ตรวจใหม่อยู่ดี) แต่ลายที่ลูกค้าแนบมาจะติดไปให้
        </p>
      </div>

      <div className="flex gap-2 border-t border-slate-100 p-3">
        <span className="flex-1 rounded-full border border-slate-200 py-2 text-center text-xs font-bold text-slate-500">ยกเลิก</span>
        <span
          className={`flex-1 rounded-full py-2 text-center text-xs font-bold text-white ${claim ? "bg-emerald-600" : "bg-sky-600"}`}
        >
          {claim ? "สร้างงานเคลม (ฟรี)" : "สร้างออเดอร์สั่งซ้ำ"}
        </span>
      </div>
    </div>
  );
}

/** แบนเนอร์บนหัวออเดอร์เคลม */
export function ShotClaimBanner() {
  return (
    <div className="rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-200">
      <p className="text-sm font-extrabold text-emerald-800">♻️ งานเคลม — ไม่คิดเงินกับลูกค้า</p>
      <p className="mt-0.5 text-[0.75rem] text-emerald-700">
        จากออเดอร์ <span className="font-bold underline">OD-260101-1234</span> · เหตุผล: ทำผิดสเปค
      </p>
    </div>
  );
}

/** กล่องมัดจำ 50% ในคอลัมน์ขวาของหน้าออเดอร์ */
export function ShotDepositBox() {
  return (
    <div className="mx-auto max-w-[17rem] space-y-1.5 rounded-xl bg-violet-50/60 p-2.5 ring-1 ring-violet-100">
      <div className="flex items-center justify-between text-xs font-semibold">
        <span className="text-violet-700">➗ มัดจำ 50% · รับแล้ว ✓</span>
        <span className="text-emerald-600">฿2,500</span>
      </div>
      <div className="flex items-center justify-between text-xs font-semibold">
        <span className="text-violet-700">ยอดคงเหลือ · เก็บก่อนส่ง</span>
        <span className="text-rose-600">฿2,500</span>
      </div>
      <div className="w-full rounded-lg bg-emerald-600 py-1.5 text-center text-[11px] font-bold text-white">
        ✔️ ยืนยันรับยอดคงเหลือครบ (ตรวจเอง)
      </div>
      <p className="text-[10px] leading-snug text-violet-500">ยังพิมพ์ใบงาน/ใบเสร็จและยิงเลขพัสดุไม่ได้ จนกว่าจะเก็บครบ 100%</p>
    </div>
  );
}

/** ปุ่มคู่สำหรับเพิ่มรายการ */
export function ShotAddButtons() {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <span className="rounded-xl border-2 border-dashed border-slate-200 px-4 py-2.5 text-center text-sm font-semibold text-slate-500">
        ＋ เพิ่มรายการเอง (กรอกชื่อ/ราคาเอง)
      </span>
      <span className="rounded-xl border-2 border-dashed border-teal-300 bg-teal-50/40 px-4 py-2.5 text-center text-sm font-bold text-teal-700">
        🛍️ หยิบจากหน้าร้าน (ได้ตัวเลือกครบ)
      </span>
    </div>
  );
}

/** วิธีจัดส่งในตะกร้าตอนระบบเลือกกล่องใหญ่ให้เอง */
export function ShotShipping() {
  return (
    <div className="mx-auto max-w-sm space-y-2">
      <p className="rounded-xl bg-sky-50 px-3 py-2 text-[0.72rem] leading-relaxed text-sky-800 ring-1 ring-sky-200">
        🚚 ระบบเลือกกล่องที่พอดีกับออเดอร์นี้ให้แล้ว — สั่ง 60 ชิ้น (ตั้งแต่ 50 ชิ้นขึ้นไป)
      </p>
      {[
        ["EMS (50)", "฿50", "locked"],
        ["EMS (100)", "฿100", "picked"],
        ["มารับเอง", "฿0", "idle"],
      ].map(([name, price, state]) => (
        <div
          key={name}
          className={`flex items-center justify-between rounded-2xl px-4 py-2.5 text-sm ring-1 ${
            state === "locked"
              ? "bg-stone-50 text-stone-300 ring-stone-100"
              : state === "picked"
                ? "bg-amber-50 font-bold ring-ducky"
                : "ring-amber-100"
          }`}
        >
          <span className="flex items-center gap-2">
            <span
              className={`grid h-3.5 w-3.5 place-items-center rounded-full ring-1 ${
                state === "picked" ? "ring-amber-500" : "ring-stone-300"
              }`}
            >
              {state === "picked" && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
            </span>
            {name}
            {state === "locked" && <span className="text-[11px] font-semibold text-stone-400">· ของใส่ไม่พอ</span>}
          </span>
          <span>{price}</span>
        </div>
      ))}
    </div>
  );
}

/** 2 ฝั่งรูปในรายการงานแบบ */
export function ShotProofPanels() {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="rounded-xl bg-white p-2.5 ring-1 ring-slate-200">
        <p className="text-[0.7rem] font-bold text-slate-700">🎨 ลายจากลูกค้า (1)</p>
        <p className="text-[0.62rem] text-slate-400">ทีมงานเห็นเท่านั้น</p>
        <div className="mt-1.5 flex gap-1.5">
          <span className="grid h-12 w-12 place-items-center rounded-lg bg-slate-100 text-lg">🖼️</span>
          <span className="grid h-12 flex-1 place-items-center rounded-lg border-2 border-dashed border-slate-200 text-[0.62rem] text-slate-400">
            ＋ แนบลาย
          </span>
        </div>
        <p className="mt-1.5 rounded bg-slate-50 py-1 text-center text-[0.62rem] font-semibold text-slate-500">
          ใช้ลายนี้เป็นแบบ → (1 รูป)
        </p>
      </div>
      <div className="rounded-xl bg-white p-2.5 ring-1 ring-violet-200">
        <p className="text-[0.7rem] font-bold text-violet-800">🖼 แบบที่เราส่งให้ตรวจ (1)</p>
        <p className="text-[0.62rem] text-violet-400">ลูกค้าเห็นชุดนี้ · ลากไฟล์มาวางได้</p>
        <div className="mt-1.5 flex gap-1.5">
          <span className="relative grid h-12 w-12 place-items-center rounded-lg bg-violet-50 text-lg ring-1 ring-violet-200">
            🖼️
            <span className="absolute -bottom-1 rounded-full bg-emerald-500 px-1 text-[0.5rem] font-bold text-white">แก้ไขแล้ว</span>
          </span>
          <span className="grid h-12 flex-1 place-items-center rounded-lg border-2 border-dashed border-violet-200 text-[0.62rem] text-violet-400">
            ลากไฟล์มาวางทับได้เลย
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── 💰 รับออเดอร์ & เงิน ── */

/** สลิปเข้ามา — ป้ายบอกว่าใครตรวจ + ปุ่มยืนยัน */
export function ShotSlip() {
  return (
    <div className="mx-auto max-w-sm space-y-2">
      <MCard>
        <p className="text-[0.72rem] font-bold text-slate-700">🧾 หลักฐานการโอน</p>
        <div className="mt-1.5 flex gap-2">
          <span className="grid h-16 w-12 place-items-center rounded-lg bg-slate-100 text-lg">🧾</span>
          <div className="flex-1 space-y-1">
            <MTag tone="green">🤖 SlipOK ตรวจ ✓</MTag>
            <p className="text-[0.7rem] text-slate-500">฿2,640 · 4 ส.ค. 14:20</p>
          </div>
        </div>
      </MCard>
      <div className="flex items-center gap-2">
        <MTag tone="orange">รอตรวจสอบ</MTag>
        <MBtn tone="ok">ยืนยันว่าเงินเข้าแล้ว →</MBtn>
      </div>
    </div>
  );
}

/** ส่วนลดรายรายการ + คูปอง */
export function ShotDiscount() {
  return (
    <div className="mx-auto max-w-sm space-y-2">
      <MCard>
        <div className="flex items-center justify-between text-[0.78rem]">
          <span className="text-slate-700">สแตนดี้ อะคริลิค ×10</span>
          <span className="font-bold text-slate-900">฿2,000</span>
        </div>
        <div className="mt-1 flex items-center justify-end gap-1 text-[0.7rem] font-semibold text-rose-500">
          ลด
          <span className="w-14 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right">10</span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5">%</span>
        </div>
      </MCard>
      <MCard>
        <p className="text-[0.72rem] font-bold text-slate-700">🎟️ คูปอง</p>
        <div className="mt-1 flex items-center justify-between text-[0.75rem]">
          <span className="rounded bg-slate-100 px-2 py-0.5 font-mono font-bold text-slate-700">DUCKY100</span>
          <span className="font-bold text-emerald-600">−฿100</span>
        </div>
        <p className="mt-1 text-[0.65rem] text-slate-400">ใช้ได้ครั้งเดียว · ระบบตัดใช้ฝั่งเซิร์ฟเวอร์</p>
      </MCard>
    </div>
  );
}

/** เมนูเปลี่ยนสถานะ ตอนจะยกเลิก */
export function ShotCancel() {
  return (
    <div className="mx-auto max-w-[15rem]">
      <MBtn full>เปลี่ยนสถานะ ▾</MBtn>
      <MCard className="mt-1 space-y-1 p-2">
        {[
          ["กำลังผลิต", "indigo"],
          ["จัดส่งแล้ว", "sky"],
          ["เสร็จสิ้น", "slate"],
        ].map(([n, t]) => (
          <p key={n} className="px-1 py-0.5 text-[0.75rem] text-slate-600">
            <MTag tone={t as string}>{n}</MTag>
          </p>
        ))}
        <p className="border-t border-slate-100 px-1 pt-1.5">
          <MTag tone="rose">ยกเลิก</MTag>
          <span className="ml-1.5 text-[0.65rem] text-slate-400">คืนสต๊อกให้เอง</span>
        </p>
      </MCard>
    </div>
  );
}

/* ── 📝 จัดการออเดอร์ ── */

/** รายการใบเสนอราคา — เตือนใบค้างหลายใบ */
export function ShotQuoteList() {
  const rows: [string, string, string, string][] = [
    ["QT-260101-1001", "คุณเอ", "฿9,100", "ส่งให้ลูกค้าแล้ว"],
    ["QT-260101-1002", "คุณเอ", "฿4,000", "ส่งให้ลูกค้าแล้ว"],
    ["QT-260101-1003", "คุณบี", "฿960", "ร่าง"],
  ];
  return (
    <MCard className="mx-auto max-w-lg p-0">
      {rows.map(([id, who, sum, st], i) => (
        <div key={id} className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2 last:border-b-0">
          <span className="min-w-32 flex-1">
            <span className="block text-[0.75rem] font-bold tabular-nums text-slate-900">{id}</span>
            <span className="block text-[0.65rem] text-slate-400">
              {who} · 1 รายการ
              {i < 2 && <span className="ml-1 font-bold text-orange-600">· ⚠️ ลูกค้ารายนี้มีใบค้างหลายใบ</span>}
            </span>
          </span>
          <span className="text-[0.75rem] font-bold tabular-nums text-slate-900">{sum}</span>
          <MTag tone={st === "ร่าง" ? "slate" : "sky"}>{st}</MTag>
        </div>
      ))}
    </MCard>
  );
}

/** ปุ่มบนหัวใบเสนอราคา */
export function ShotQuoteAccept() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <MBtn tone="ok">✅ ลูกค้าตกลง — สร้างออเดอร์</MBtn>
      <span className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-bold text-rose-600">✕ ลูกค้าไม่รับ</span>
      <span className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-500">🔗 คัดลอกลิงก์ส่งลูกค้า</span>
    </div>
  );
}

/** ติ๊กสั่งแทนลูกค้า ในหน้าชำระเงิน */
export function ShotStaffOrder() {
  return (
    <MCard className="mx-auto max-w-sm bg-sky-50/60 ring-sky-200">
      <MCheck on>
        <span>
          <span className="block font-bold text-sky-900">🧑‍💼 สั่งแทนลูกค้า</span>
          <span className="block text-[0.7rem] text-sky-700">ไม่คิดคูปองและส่วนลดสมาชิกให้อัตโนมัติ · บันทึกว่าใครเป็นคนสั่งแทน</span>
        </span>
      </MCheck>
    </MCard>
  );
}

/** ลบรายการ ต้องใส่เหตุผล */
export function ShotDeleteItem() {
  return (
    <div className="mx-auto max-w-sm space-y-2">
      <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">
        <span className="text-[0.78rem] text-slate-700">2. ผ้าห่มสกรีน ×2</span>
        <span className="rounded-lg px-2 py-1 text-[0.7rem] font-bold text-rose-500">🗑 ลบรายการ</span>
      </div>
      <MCard className="ring-rose-200">
        <p className="text-[0.75rem] font-bold text-rose-700">ลบรายการนี้ — ใส่เหตุผลก่อน</p>
        <div className="mt-1.5">
          <MField value="ลูกค้าขอตัดออก ไม่เอาแล้ว" />
        </div>
        <p className="mt-1.5 text-[0.65rem] text-slate-400">📝 ระบบจะบันทึกในประวัติว่าใครลบ ลบอะไร และยอดลดลงเท่าไร</p>
        <div className="mt-2 flex gap-2">
          <MBtn>ยกเลิก</MBtn>
          <MBtn tone="danger">ยืนยันลบ</MBtn>
        </div>
      </MCard>
    </div>
  );
}

/** หมายเหตุ 3 ที่ */
export function ShotNotes() {
  return (
    <div className="mx-auto grid max-w-lg gap-2">
      <MCard>
        <p className="text-[0.7rem] font-bold text-slate-500">💬 หมายเหตุลูกค้า</p>
        <p className="mt-0.5 text-[0.75rem] text-slate-700">“ขอสีเข้มกว่ารูปนิดนึงค่ะ”</p>
      </MCard>
      <MCard className="ring-amber-200">
        <p className="text-[0.7rem] font-bold text-amber-700">📝 หมายเหตุใบงานของรายการนี้ · ขึ้นบนใบงาน</p>
        <p className="mt-0.5 text-[0.75rem] font-bold text-rose-600">ตัดขอบ 3 มม. · ห้ามเคลือบเงา</p>
      </MCard>
      <MCard>
        <p className="text-[0.7rem] font-bold text-slate-500">📄 หมายเหตุท้ายบิล · ขึ้นบนใบเสร็จ</p>
        <p className="mt-0.5 text-[0.75rem] text-slate-700">ราคานี้ยังไม่รวม VAT</p>
      </MCard>
    </div>
  );
}

/** ป้ายงานเร่ง + นับถอยหลัง */
export function ShotRush() {
  return (
    <MCard className="mx-auto max-w-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[0.8rem] font-bold tabular-nums text-slate-900">OD-260101-1234</span>
        <MTag tone="rose">🔥 งานเร่ง</MTag>
        <MTag tone="green">ชำระแล้ว</MTag>
      </div>
      <p className="mt-1.5 text-[0.75rem] text-slate-600">
        📅 ต้องใช้งาน <span className="font-bold">12 ส.ค. 2569</span>{" "}
        <span className="font-bold text-rose-600">· เหลืออีก 3 วัน</span>
      </p>
    </MCard>
  );
}

/** ป้ายรอเช็คสต๊อก */
export function ShotBulk() {
  return (
    <MCard className="mx-auto max-w-sm">
      <p className="text-[0.78rem] font-bold text-slate-800">เสื้อยืดสกรีน ×250</p>
      <p className="mt-1 text-[0.7rem] text-slate-500">
        <MTag tone="amber">📦 รอเช็คสต๊อก</MTag>
        <span className="ml-1.5">สั่งเกิน 100 ชิ้น — ยืนยันคิวกับลูกค้าก่อนเริ่มงาน</span>
      </p>
    </MCard>
  );
}

/** หน้าเลือกเอกสารก่อนพิมพ์ */
export function ShotPrint() {
  return (
    <MCard className="mx-auto max-w-sm">
      <p className="mb-1.5 rounded-full bg-orange-50 px-2.5 py-1 text-[0.65rem] font-bold text-orange-700 ring-1 ring-orange-200">
        🖨 ใบนี้ปริ้นไปแล้ว 2 ครั้ง · ล่าสุด 4 ส.ค. 17:36 — กดพิมพ์อีกจะบันทึกเป็นปริ้นซ้ำ
      </p>
      <p className="text-[0.75rem] font-bold text-slate-700">เลือกเอกสารที่จะพิมพ์</p>
      <div className="mt-2 space-y-1.5">
        <MCheck on>
          ใบงาน <span className="text-[0.68rem] font-bold text-rose-500">· ใบปะหน้ายังไม่ออก 🔒</span>
        </MCheck>
        <span className="flex items-start gap-2 text-[0.78rem] text-slate-300">
          <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded bg-white ring-1 ring-slate-200" />
          ใบเสร็จ <span className="text-[0.68rem] font-bold text-rose-400">· ยังเก็บเงินไม่ครบ</span>
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
        <span className="text-[0.65rem] text-slate-400">ใบงานมี QR เปิดออเดอร์บนมือถือ</span>
        <MBtn tone="brand">🖨 พิมพ์</MBtn>
      </div>
    </MCard>
  );
}

/** กล่องลิงก์สำหรับลูกค้า */
export function ShotCustomerLink() {
  return (
    <MCard className="mx-auto max-w-sm">
      <p className="text-[0.72rem] font-bold text-slate-700">🔗 ลิงก์สำหรับลูกค้า</p>
      <p className="mt-1 truncate rounded bg-slate-50 px-2 py-1 font-mono text-[0.65rem] text-slate-500">
        iduckystore.com/order/OD-260101-1234?key=•••••
      </p>
      <div className="mt-1.5">
        <MBtn tone="brand" full>
          📋 คัดลอกลิงก์
        </MBtn>
      </div>
      <p className="mt-1 text-[0.62rem] text-slate-400">ใครไม่มีคีย์ในลิงก์ เปิดไม่ได้</p>
    </MCard>
  );
}

/** ข้อความไลน์ที่ลูกค้าได้รับ */
export function ShotNotify() {
  return (
    <div className="mx-auto max-w-xs space-y-1.5">
      {[
        "✅ ยืนยันการชำระเงินออเดอร์ OD-260101-1234 แล้ว กำลังเริ่มงานให้ครับ",
        "🎨 มีแบบใหม่ให้ตรวจแล้ว กดดูและอนุมัติได้เลยครับ",
        "🚚 ออเดอร์ OD-260101-1234 จัดส่งแล้ว\nเลขพัสดุ: EX123456789TH",
      ].map((t) => (
        <div key={t} className="rounded-2xl rounded-tl-sm bg-[#06C755]/10 px-3 py-2 text-[0.72rem] leading-relaxed text-slate-700 ring-1 ring-[#06C755]/25">
          <span className="whitespace-pre-line">{t}</span>
        </div>
      ))}
      <p className="text-center text-[0.62rem] text-slate-400">ส่งเฉพาะลูกค้าที่ผูกไลน์ไว้</p>
    </div>
  );
}

/* ── 🎨 งานแบบ ── */

/** คิวงานของกราฟฟิก */
export function ShotGfxQueue() {
  return (
    <MCard className="mx-auto max-w-md p-0">
      {[
        ["OD-260101-1201", "แก้ไขแบบ", "rose", "ด่วนที่สุด — ลูกค้ารออยู่"],
        ["OD-260101-1202", "ชำระแล้ว", "green", "เริ่มได้เลย"],
        ["OD-260101-1203", "รอตรวจแบบ", "violet", "รอลูกค้าตอบ ไม่ต้องทำอะไร"],
        ["OD-260101-1204", "รอชำระเงิน", "yellow", "ยังไม่ต้องทำ"],
      ].map(([id, st, tone, hint]) => (
        <div key={id} className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2 last:border-b-0">
          <span className="text-[0.75rem] font-bold tabular-nums text-slate-800">{id}</span>
          <MTag tone={tone}>{st}</MTag>
          <span className="text-[0.68rem] text-slate-400">{hint}</span>
        </div>
      ))}
    </MCard>
  );
}

/** ฝั่งลูกค้ากดอนุมัติ / ขอแก้ */
export function ShotApprove() {
  return (
    <div className="mx-auto max-w-sm space-y-2">
      <MCard>
        <p className="text-[0.7rem] font-bold text-slate-500">สิ่งที่ลูกค้าเห็นในหน้าออเดอร์</p>
        <div className="mt-1.5 flex gap-2">
          <MBtn tone="ok">✅ อนุมัติแบบนี้</MBtn>
          <MBtn>✏️ ขอแก้ไข</MBtn>
        </div>
      </MCard>
      <MCard className="ring-rose-200">
        <p className="text-[0.7rem] font-bold text-rose-700">ลูกค้าขอแก้ไข</p>
        <p className="mt-0.5 text-[0.75rem] text-slate-700">“ขอขยับโลโก้ขึ้นอีกนิด แล้วเปลี่ยนเป็นฟอนต์หนากว่านี้ค่ะ”</p>
      </MCard>
    </div>
  );
}

/** ช่องยืนยันอ่านรายละเอียด */
export function ShotAck() {
  return (
    <MCard className="mx-auto max-w-sm space-y-1.5">
      <MCheck on>ยืนยันว่าอ่านรายละเอียดแล้ว (กราฟฟิก)</MCheck>
      <MCheck>งานนี้มีชิ้นงานตัวอย่าง</MCheck>
      <p className="text-[0.62rem] text-slate-400">ระบบจำว่าใครติ๊ก ติ๊กตอนไหน</p>
    </MCard>
  );
}

/* ── 📮 แพ็ค–ส่ง ── */

/** ช่องสแกนออเดอร์ */
export function ShotScan() {
  return (
    <MCard className="mx-auto max-w-sm text-center">
      <p className="text-2xl">📷</p>
      <p className="mt-1 text-[0.78rem] font-bold text-slate-700">ยิงบาร์โค้ดบนใบงาน</p>
      <div className="mt-2">
        <MField placeholder="หรือพิมพ์เลขออเดอร์เอง เช่น OD-260101-1234" />
      </div>
      <p className="mt-1.5 text-[0.62rem] text-slate-400">ยิง QR ของมือถือก็ได้ ระบบดึงเลขให้เอง</p>
    </MCard>
  );
}

/** ปุ่มตรวจนับใต้ภาพ */
export function ShotCount() {
  return (
    <MCard className="mx-auto max-w-xs text-center">
      <span className="mx-auto grid h-20 w-20 place-items-center rounded-lg bg-slate-100 text-2xl">🖼️</span>
      <p className="mt-1.5 text-[0.72rem] text-slate-500">สแตนดี้ อะคริลิค · ต้องได้ 10 ชิ้น</p>
      <div className="mt-2 flex justify-center gap-2">
        <MBtn tone="ok">✓ ครบ</MBtn>
        <MBtn tone="danger">✕ ไม่ครบ</MBtn>
      </div>
    </MCard>
  );
}

/** ด่านตรวจก่อนยิงเลขพัสดุ */
export function ShotPackGate() {
  return (
    <MCard className="mx-auto max-w-sm">
      <p className="text-[0.75rem] font-bold text-rose-700">⚠️ ด่านตรวจแพ็คยังไม่ครบ</p>
      <div className="mt-1.5 space-y-1">
        <MCheck on>ตรวจนับครบทุกรูป</MCheck>
        <MCheck on>ยืนยันอ่านรายละเอียดครบ</MCheck>
        <MCheck>ยังไม่ถ่ายรูปของในกล่อง</MCheck>
        <MCheck>ออเดอร์มัดจำ — ยังเก็บไม่ครบ 100%</MCheck>
      </div>
      <div className="mt-2 opacity-40">
        <MBtn tone="brand" full>
          📮 ยิงเลขพัสดุ
        </MBtn>
      </div>
    </MCard>
  );
}

/* ── 🏷️ สินค้า & ราคา ── */

/** บล็อกในหน้าแก้ไขสินค้า */
export function ShotProductBlocks() {
  return (
    <MCard className="mx-auto max-w-sm space-y-1">
      {[
        ["📋", "ข้อมูลหลัก", "ชื่อ · หมวดหมู่ · คำอธิบาย"],
        ["💰", "ราคา", "ราคาเดียว หรือขั้นบันได"],
        ["🎛️", "ตัวเลือก", "ดึงจากคลังตัวเลือกได้"],
        ["🖼️", "รูปสินค้า", "ลากสลับลำดับได้"],
        ["⚠️", "ข้อควรทราบ", "เงื่อนไขงาน ลดเคลม"],
        ["🔍", "SEO", "ระบบร่างให้อัตโนมัติ"],
      ].map(([e, t, d]) => (
        <div key={t} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5">
          <span>{e}</span>
          <span className="text-[0.75rem] font-bold text-slate-700">{t}</span>
          <span className="ml-auto text-[0.65rem] text-slate-400">{d}</span>
        </div>
      ))}
      <div className="flex items-center justify-between pt-1">
        <MTag tone="green">✓ ตรวจแล้ว</MTag>
        <MBtn tone="brand">บันทึกสินค้า</MBtn>
      </div>
    </MCard>
  );
}

/** นำเข้าสินค้าจากลิงก์ */
export function ShotImport() {
  return (
    <MCard className="mx-auto max-w-sm">
      <MField label="ลิงก์หน้ารายการราคา" value="https://…/price-list" />
      <div className="mt-1.5">
        <MBtn tone="brand">ดึงข้อมูล</MBtn>
      </div>
      <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
        {["สแตนดี้ อะคริลิค 15 ซม.", "กรอบรูปแคนวาส A4"].map((n) => (
          <div key={n} className="flex items-center gap-2 rounded bg-slate-50 px-2 py-1 text-[0.72rem] text-slate-600">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded bg-white text-sm ring-1 ring-slate-200">🖼️</span>
            <span className="flex-1 truncate">{n}</span>
            <MTag tone="amber">ตรวจก่อนบันทึก</MTag>
          </div>
        ))}
      </div>
    </MCard>
  );
}

/** คลังตัวเลือก — ป้ายบอกว่ามีสินค้าลิงก์อยู่กี่ตัว */
export function ShotPresets() {
  return (
    <MCard className="mx-auto max-w-sm p-0">
      {[
        ["ชนิดกระดาษ", "8 ตัวเลือก", 30],
        ["การเคลือบ", "4 ตัวเลือก", 12],
        ["ขนาด", "6 ตัวเลือก", 0],
      ].map(([label, n, used]) => (
        <div key={label as string} className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 last:border-b-0">
          <span className="text-slate-300">⠿</span>
          <span className="text-[0.78rem] font-bold text-slate-800">{label}</span>
          <span className="text-[0.65rem] text-slate-400">{n}</span>
          <span className="ml-auto">
            {(used as number) > 0 ? (
              <MTag tone="green">🔗 ลิงก์อยู่ {used} สินค้า</MTag>
            ) : (
              <span className="text-[0.62rem] text-slate-300">ยังไม่มีสินค้าลิงก์</span>
            )}
          </span>
        </div>
      ))}
    </MCard>
  );
}

/* ── ⚙️ ตั้งค่า & ของหลังบ้าน ── */

/** แถวสต๊อก + ปุ่มนับจริง */
export function ShotStock() {
  return (
    <MCard className="mx-auto max-w-sm">
      <div className="flex items-center justify-between">
        <span className="text-[0.78rem] font-bold text-slate-800">อะคริลิคใส 3 มม.</span>
        <span className="text-[0.85rem] font-extrabold tabular-nums text-slate-900">128 แผ่น</span>
      </div>
      <p className="mt-0.5 text-[0.65rem] text-slate-400">ขายเฉลี่ย 12/สัปดาห์ · หมดใน ~10 สัปดาห์</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <MBtn>＋ รับเข้า</MBtn>
        <MBtn>− เบิกเสีย</MBtn>
        <MBtn tone="violet">🔢 นับจริง</MBtn>
      </div>
      <p className="mt-1.5 text-[0.62rem] text-rose-500">นับไม่ตรง = บังคับใส่เหตุผลก่อนปรับยอด</p>
    </MCard>
  );
}

/** แถวพนักงาน + แผนก */
export function ShotStaff() {
  return (
    <MCard className="mx-auto max-w-sm p-0">
      {[
        ["สมชาย", "แอดมิน", true],
        ["สมหญิง", "แพ็คของ", true],
        ["พนักงานใหม่", "— ยังไม่กำหนด —", false],
      ].map(([name, dept, ok]) => (
        <div key={name as string} className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 last:border-b-0">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-slate-100 text-[0.7rem]">👤</span>
          <span className="text-[0.78rem] font-bold text-slate-800">{name}</span>
          <span className="ml-auto rounded border border-slate-200 bg-white px-2 py-0.5 text-[0.7rem] text-slate-600">{dept} ▾</span>
          {ok ? <MTag tone="green">เข้าได้</MTag> : <MTag tone="rose">ล็อกอินไม่ได้</MTag>}
        </div>
      ))}
    </MCard>
  );
}

/** แท็บในตั้งค่าระบบ */
export function ShotSettingsTabs() {
  return (
    <div className="mx-auto flex max-w-md flex-wrap gap-1.5">
      {["🏪 ข้อมูลร้าน", "🏦 ชำระเงิน", "🚚 การจัดส่ง", "🏅 ระดับสมาชิก", "🎁 คูปองต้อนรับ", "👥 บทบาท", "🗂 หมวดหมู่สินค้า", "🧹 ล้างรูปเก่า"].map(
        (t, i) => (
          <span
            key={t}
            className={`rounded-full px-3 py-1 text-[0.7rem] font-semibold ${
              i === 7 ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600"
            }`}
          >
            {t}
          </span>
        )
      )}
    </div>
  );
}

/** สรุปคะแนนความพึงพอใจ */
export function ShotRatings() {
  return (
    <MCard className="mx-auto max-w-xs text-center">
      <p className="text-2xl font-extrabold tabular-nums text-slate-900">4.8</p>
      <p className="text-[0.7rem] text-slate-400">จาก 5 · ทั้งหมด 126 ครั้ง</p>
      <p className="mt-1 text-base tracking-widest text-amber-400">★★★★★</p>
      <p className="mt-1.5 text-[0.62rem] text-slate-400">ประเมินแบบนิรนาม — เก็บเวลาแค่ระดับเดือน</p>
    </MCard>
  );
}

/** ราคาต่อชิ้นเปลี่ยนตามจำนวนที่ลูกค้าเลือก */
export function ShotRate() {
  return (
    <MCard className="mx-auto max-w-xs">
      <div className="flex items-center justify-between">
        <span className="text-[0.75rem] text-slate-500">จำนวน</span>
        <span className="flex items-center gap-2 rounded-full bg-slate-50 px-2 py-0.5 text-[0.8rem] font-bold text-slate-800 ring-1 ring-slate-200">
          − <span className="tabular-nums">50</span> +
        </span>
      </div>
      <div className="mt-2 border-t border-slate-100 pt-2 text-right">
        <p className="text-[0.65rem] text-slate-400">
          <span className="line-through">฿120</span> / ชิ้น → <span className="font-bold text-emerald-600">฿95</span> / ชิ้น
        </p>
        <p className="text-lg font-extrabold tabular-nums text-amber-600">฿4,750</p>
        <p className="text-[0.62rem] text-emerald-600">สั่งเยอะขึ้นราคาต่อชิ้นถูกลงอัตโนมัติ</p>
      </div>
    </MCard>
  );
}

/** 2 แถวบนหัวหน้าแก้ไขสินค้า — ลิงก์ของสินค้า (บน) กับปุ่มนำเข้า (ล่าง) แยกกันคนละเรื่อง */
export function ShotUrlBar() {
  return (
    <div className="mx-auto max-w-lg space-y-2">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-2.5 ring-1 ring-slate-200">
        <span className="shrink-0 text-[0.65rem] font-bold text-slate-500">🔗 ลิงก์หน้าร้านของสินค้านี้</span>
        <code className="min-w-24 flex-1 truncate rounded-lg bg-slate-50 px-2 py-1 text-[0.62rem] text-slate-500">
          iduckystore.com/products/jibbitz-shoe
        </code>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[0.65rem] font-bold text-slate-700">📋 คัดลอกลิงก์</span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[0.65rem] font-bold text-slate-700">↗ เปิดดูหน้าร้าน</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border-2 border-dashed border-amber-200 bg-amber-50/40 p-2.5">
        <span className="text-base">📥</span>
        <span className="min-w-24 flex-1">
          <span className="block text-[0.65rem] font-bold text-amber-800">ดึงราคา/ตัวเลือกจากเว็บรายการราคา (Wix) มาเติมสินค้านี้</span>
          <span className="block text-[0.58rem] text-slate-500">คนละลิงก์กับด้านบน — ใช้ลิงก์หน้ารายการราคา</span>
        </span>
        <span className="rounded-full bg-amber-500 px-2.5 py-1 text-[0.65rem] font-bold text-white">เปิด ▾</span>
      </div>
    </div>
  );
}

/** พาเนลดึงจาก URL ที่กางออกมา — ผลลัพธ์ + เลือกรูป */
export function ShotImportPanel() {
  const pick = [1, 2, 3, 4, 5];
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-amber-200 bg-amber-50/40 p-2.5">
      <p className="mb-2 text-[0.65rem] font-semibold text-slate-600">
        📥 ดึงข้อมูลจากเว็บ Wix → เลือกสินค้ามาเติมช่อง (ชื่อ/ราคา/ตัวเลือก/ราคาขั้นบันได/รูป) แล้วกด 💾 บันทึก
      </p>
      <div className="flex items-center gap-2">
        <span className="flex-1 truncate rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[0.7rem] text-slate-600">
          https://www.iduckyofficial-pricelists.com/pricestandy
        </span>
        <span className="rounded-lg bg-amber-500 px-3 py-1.5 text-[0.68rem] font-bold text-white">🔍 ดึง</span>
      </div>

      <div className="mt-2 rounded-xl border border-slate-200 bg-white">
        <p className="border-b border-slate-100 px-2.5 py-1 text-[0.6rem] text-slate-400">
          พบ 1 สินค้าในหน้านี้ — เลือกรูปที่ต้องการแล้วกด “ใช้ตัวนี้” เพื่อเติมลงสินค้าที่กำลังแก้
        </p>
        <div className="p-2.5">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.78rem] font-semibold text-slate-800">ข้อความหรือจุดที่เล็กๆ ไม่แนะนำให้เคลือบ Spot uv</p>
              <p className="text-[0.62rem] text-slate-400">฿10 / ชิ้น · 1 ช่วง × 4 ตัวเลือก</p>
            </div>
            <span className="shrink-0 rounded-lg bg-emerald-600 px-2.5 py-1 text-[0.68rem] font-semibold text-white">ใช้ตัวนี้ →</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {[1, 2, 3, 4, 5, 6, 7].map((n) => {
              const on = pick.includes(n);
              return (
                <span
                  key={n}
                  className={`relative grid h-10 w-10 place-items-center overflow-hidden rounded-lg bg-slate-100 text-sm ring-2 ${
                    on ? "ring-emerald-500" : "opacity-50 ring-transparent"
                  }`}
                >
                  🖼️
                  {on && (
                    <span className="absolute right-0.5 top-0.5 grid h-3.5 w-3.5 place-items-center rounded-full bg-emerald-500 text-[0.5rem] font-bold text-white">
                      {n}
                    </span>
                  )}
                </span>
              );
            })}
          </div>
          <p className="mt-1 text-[0.58rem] text-slate-400">
            พบ 7 รูป · เลือกไว้ 5/5 (รูปแรกที่เลือก = รูปหลัก) — กดรูปเพื่อเลือก/ยกเลิก
          </p>
        </div>
      </div>
    </div>
  );
}

/** หน้า /admin/import — นำเข้าทีละหลายตัว */
export function ShotImportPage() {
  return (
    <MCard className="mx-auto max-w-lg">
      <div className="flex items-center gap-2">
        <span className="flex-1 truncate rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[0.7rem] text-slate-600">
          https://www.iduckyofficial-pricelists.com/keyring
        </span>
        <MBtn tone="brand">🔍 ดึง</MBtn>
      </div>
      <div className="mt-2 flex items-center gap-2 border-t border-slate-100 pt-2">
        <span className="flex-1 rounded border border-slate-200 px-2 py-1 text-[0.65rem] text-slate-300">ค้นหาสินค้าในหน้านี้…</span>
        <span className="text-[0.62rem] font-bold text-slate-400">เลือกไว้ 12 / 18</span>
      </div>
      <div className="mt-1.5 space-y-1">
        {[
          ["พวงกุญแจอะคริลิค 5 ซม.", "อะคริลิค", true],
          ["พวงกุญแจยาง 2 ด้าน", "— เลือก —", true],
          ["พวงกุญแจโลหะ", "อะคริลิค", false],
        ].map(([n, cat, on]) => (
          <div key={n as string} className="flex items-center gap-2 rounded bg-slate-50 px-2 py-1">
            <MCheck on={on as boolean}>
              <span className="text-[0.7rem]">{n}</span>
            </MCheck>
            <span className={`ml-auto rounded border px-1.5 py-0.5 text-[0.62rem] ${cat === "— เลือก —" ? "border-rose-200 text-rose-500" : "border-slate-200 text-slate-500"}`}>
              {cat} ▾
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
        <span className="text-[0.62rem] text-rose-500">สินค้าที่มีอยู่แล้วจะถูกข้าม</span>
        <MBtn tone="ok">📥 นำเข้า 12 รายการ</MBtn>
      </div>
    </MCard>
  );
}
