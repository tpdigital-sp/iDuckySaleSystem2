import Link from "next/link";

/**
 * เนื้อหาคู่มือทั้งหมด แยกเป็น "หัวข้อ" ก้อนละเรื่อง
 * แยกไฟล์ออกมาเพื่อให้หน้า /admin/guide ทำแค่ค้นหา/กรอง/จัดวาง
 */

export type Role = "แอดมิน" | "กราฟฟิก" | "แพ็คของ";

export interface Topic {
  id: string;
  icon: string;
  title: string;
  /** ใครต้องรู้เรื่องนี้ */
  roles: Role[];
  /** คำที่คนน่าจะพิมพ์ค้น (นอกเหนือจากชื่อหัวข้อ) */
  keywords: string;
  body: React.ReactNode;
}

/* ── ชิ้นส่วนเล็ก ๆ ที่ใช้ซ้ำ ── */

/** ปุ่มจำลอง — ให้ตรงกับปุ่มจริงบนหน้าจอ จะได้กดถูกตัว */
export function Key({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block whitespace-nowrap rounded-md border border-b-2 border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[0.92em] font-semibold text-slate-700">
      {children}
    </span>
  );
}

/** ข้อความที่ผิดแล้วเสียหาย */
export function Mark({ children }: { children: React.ReactNode }) {
  return <span className="rounded bg-ducky px-1.5 py-0.5 font-semibold text-slate-900">{children}</span>;
}

export function B({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-slate-800">{children}</strong>;
}

export function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((t, i) => (
        <li key={i} className="relative pl-4">
          <span className="absolute left-0 top-[0.62em] h-1.5 w-1.5 rounded-full border-[1.5px] border-amber-400" />
          {t}
        </li>
      ))}
    </ul>
  );
}

/** ขั้นตอน 1→N มีเส้นเชื่อม */
export function Steps({ items, tone = "amber" }: { items: React.ReactNode[]; tone?: "amber" | "teal" | "sky" | "violet" }) {
  const dot = { amber: "bg-amber-500", teal: "bg-teal-500", sky: "bg-sky-500", violet: "bg-violet-500" }[tone];
  const line = { amber: "bg-amber-200", teal: "bg-teal-200", sky: "bg-sky-200", violet: "bg-violet-200" }[tone];
  return (
    <ol className="relative flex flex-col gap-2.5 pl-7">
      <span className={`absolute bottom-3 left-[0.68rem] top-3 w-px ${line}`} />
      {items.map((t, i) => (
        <li key={i} className="relative">
          <span className={`absolute -left-7 grid h-[1.4rem] w-[1.4rem] place-items-center rounded-full text-[0.7rem] font-bold text-white ${dot}`}>
            {i + 1}
          </span>
          {t}
        </li>
      ))}
    </ol>
  );
}

/** ตารางทำได้/ทำไม่ได้ */
export function CanTable({ rows }: { rows: [string, boolean][] }) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-2">
      {rows.map(([label, ok]) => (
        <div
          key={label}
          className={`flex items-start gap-2 rounded-lg px-3 py-2 text-[0.85rem] ring-1 ${
            ok ? "bg-emerald-50/70 text-emerald-900 ring-emerald-100" : "bg-rose-50/70 text-rose-900 ring-rose-100"
          }`}
        >
          <span className="shrink-0 font-bold">{ok ? "✅" : "🔒"}</span>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

export function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-rose-50 px-3 py-2 text-[0.85rem] leading-relaxed text-rose-800 ring-1 ring-rose-100">{children}</div>
  );
}

export function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-emerald-50 px-3 py-2 text-[0.85rem] leading-relaxed text-emerald-800 ring-1 ring-emerald-100">
      {children}
    </div>
  );
}

const A = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link href={href} className="font-semibold text-amber-600 hover:underline">
    {children}
  </Link>
);

/* ══════════════════════════════════════════════════════ */

export const TOPICS: Topic[] = [
  /* ───────── แอดมิน ───────── */
  {
    id: "order-new",
    icon: "📥",
    title: "ออเดอร์เข้ามาใหม่ ทำอะไรก่อน",
    roles: ["แอดมิน"],
    keywords: "สลิป slipok ตรวจเงิน ชำระเงิน โอน รอตรวจสอบ ยืนยันเงินเข้า",
    body: (
      <>
        <Steps
          items={[
            <>
              ลูกค้าโอนแล้วแนบสลิป → ระบบ <B>SlipOK ตรวจให้อัตโนมัติ</B> · ผ่าน = เด้งเป็น{" "}
              <B>ชำระแล้ว</B> เอง ไม่ต้องทำอะไร
            </>,
            <>
              ไม่ผ่าน / SlipOK ล่ม → ออเดอร์ตกมาที่ <B>รอตรวจสอบ</B> ให้เปิดดูสลิปเอง
            </>,
            <>
              ตรวจแล้วถูกต้อง กด <Key>ยืนยันว่าเงินเข้าแล้ว →</Key> · ระบบลง log ว่าใครยืนยัน
            </>,
            <>
              ลูกค้าโอนไม่ครบ / โอนผิดบัญชี → ทักลูกค้าก่อน อย่าเพิ่งกดยืนยัน
            </>,
          ]}
        />
        <Tip>
          ป้ายในหน้ารายการบอกให้ว่าใครตรวจ — <B>🤖 SlipOK ตรวจ ✓</B> หรือ <B>🧑‍💼 แอดมินตรวจเอง</B>
        </Tip>
      </>
    ),
  },
  {
    id: "deposit",
    icon: "➗",
    title: "มัดจำ 50% — ทำอะไรได้ / ไม่ได้",
    roles: ["แอดมิน", "กราฟฟิก", "แพ็คของ"],
    keywords: "มัดจำ ครึ่ง 50 เปอร์เซ็นต์ งวดแรก ยอดคงเหลือ โอนไม่ครบ 100% ค้างชำระ",
    body: (
      <>
        <p>
          ใช้กับลูกค้าที่ขอโอนครึ่งเดียวก่อนเริ่มงาน — เปิดโหมดได้จาก<B>ในหน้าออเดอร์</B> ปุ่ม{" "}
          <Key>➗ เปิดโหมดมัดจำ 50%</Key>
        </p>
        <Bullets
          items={[
            <>
              เปิดได้เฉพาะตอนสถานะยังเป็น <B>รอชำระเงิน</B> หรือ <B>รอตรวจสอบ</B> เท่านั้น
            </>,
            <>
              ยอดมัดจำ = <B>ครึ่งหนึ่งของยอดรวม ปัดขึ้น</B> ระบบคิดให้เอง แก้ตัวเลขเองไม่ได้
            </>,
            <>
              เก็บงวดแรกได้แล้วกด <Key>✔️ ยืนยันรับมัดจำ</Key> · เก็บครบแล้วกด{" "}
              <Key>✔️ ยืนยันรับยอดคงเหลือครบ</Key>
            </>,
          ]}
        />

        <p className="pt-1 font-bold text-slate-800">หลังรับ “งวดแรก” แล้ว (ยังไม่ครบ 100%)</p>
        <CanTable
          rows={[
            ["กราฟฟิกทำแบบ / ส่งแบบให้ลูกค้าตรวจ ได้", true],
            ["ลูกค้าอนุมัติแบบ / ขอแก้ ได้", true],
            ["ส่งเข้าผลิต ได้", true],
            ["แพ็ค + ตรวจนับของ ได้", true],
            ["พิมพ์ใบงาน / ใบปะหน้าพัสดุ ไม่ได้", false],
            ["พิมพ์ใบเสร็จ ไม่ได้ (ลูกค้าก็เปิดใบเสร็จไม่ได้)", false],
            ["ยิงเลขพัสดุ / ส่งของออก ไม่ได้", false],
          ]}
        />
        <Warn>
          <B>สรุปสั้น ๆ:</B> ยังไม่ครบ 100% = <Mark>ทำงานได้ แต่ของออกจากร้านไม่ได้</Mark> ·
          ต้องเก็บยอดคงเหลือให้ครบแล้วกดยืนยันก่อน ระบบถึงจะปลดล็อกให้
        </Warn>
        <p className="text-[0.85rem] text-slate-500">
          ฝั่งลูกค้าจะเห็นยอดที่ต้องโอน “งวดนี้” ในหน้าออเดอร์ของเขาเอง — งวดแรกโชว์ยอดมัดจำ พอจ่ายแล้วเปลี่ยนเป็นยอดคงเหลือให้อัตโนมัติ
        </p>
      </>
    ),
  },
  {
    id: "claim",
    icon: "♻️",
    title: "ระบบเคลม ใช้งานยังไง",
    roles: ["แอดมิน"],
    keywords: "เคลม claim งานเสีย พิมพ์ผิด ส่งผิด ทำใหม่ ฟรี ชดเชย สั่งซ้ำ reorder",
    body: (
      <>
        <p>
          งานเสีย/พิมพ์ผิด/ส่งผิด <B>ไม่ต้องสร้างออเดอร์ใหม่เอง</B> — เปิดออเดอร์เดิมแล้วกด{" "}
          <Key>♻️ ทำใหม่ / เคลม</Key> ที่แถบบนสุด ระบบจะก๊อปลูกค้า/ที่อยู่/สเปค/ลายให้ทั้งหมด
        </p>
        <Steps
          tone="violet"
          items={[
            <>
              เปิดออเดอร์ที่มีปัญหา → กด <Key>♻️ ทำใหม่ / เคลม</Key>
            </>,
            <>
              เลือกแบบ: <B>♻️ งานเคลม</B> (ทำส่งใหม่ฟรี) หรือ <B>🔁 สั่งซ้ำ</B> (ลูกค้าอยากได้อีก คิดเงินปกติ)
            </>,
            <>
              ถ้าเป็นเคลม <Mark>ต้องเลือกเหตุผล</Mark> — งานพิมพ์เสีย/สีเพี้ยน · ทำผิดสเปค · ส่งผิดรายการ ·
              ชำรุดจากขนส่ง · ของหาย/ไม่ครบ (ระบบไม่ให้กดถ้าไม่เลือก)
            </>,
            <>
              ติ๊กว่าจะทำใหม่<B>รายการไหนบ้าง</B> — ไม่ติ๊ก = ทำใหม่ทั้งออเดอร์ · แก้จำนวนได้ด้วย
              (เสีย 3 ชิ้นจาก 10 ก็ทำใหม่แค่ 3)
            </>,
            <>กดสร้าง → ระบบพาไปที่ออเดอร์ใหม่ให้เลย</>,
          ]}
        />

        <p className="pt-1 font-bold text-slate-800">เคลม vs สั่งซ้ำ ต่างกันตรงไหน</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[26rem] text-left text-[0.85rem]">
            <thead className="text-[0.72rem] font-bold uppercase tracking-wide text-slate-400">
              <tr>
                <th className="pb-1"> </th>
                <th className="pb-1">♻️ งานเคลม</th>
                <th className="pb-1">🔁 สั่งซ้ำ</th>
              </tr>
            </thead>
            <tbody className="text-slate-600">
              <tr className="border-t border-slate-100">
                <td className="py-1 font-semibold text-slate-700">ราคาสินค้า</td>
                <td className="py-1 font-bold text-emerald-600">฿0 (ฟรี)</td>
                <td className="py-1">ราคาเดิม</td>
              </tr>
              <tr className="border-t border-slate-100">
                <td className="py-1 font-semibold text-slate-700">ค่าส่ง</td>
                <td className="py-1 font-bold text-emerald-600">฿0 (ร้านออกเอง)</td>
                <td className="py-1">คิดตามปกติ</td>
              </tr>
              <tr className="border-t border-slate-100">
                <td className="py-1 font-semibold text-slate-700">สถานะเริ่มต้น</td>
                <td className="py-1 font-bold text-green-700">ชำระแล้ว — ทำได้เลย</td>
                <td className="py-1">รอชำระเงิน</td>
              </tr>
              <tr className="border-t border-slate-100">
                <td className="py-1 font-semibold text-slate-700">ต้องใส่เหตุผล</td>
                <td className="py-1 font-bold text-rose-600">ใช่ บังคับ</td>
                <td className="py-1">ไม่ต้อง</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="pt-1 font-bold text-slate-800">สิ่งที่ตามไปกับออเดอร์ใหม่</p>
        <Bullets
          items={[
            <>
              <B>ตามไป:</B> ชื่อ · เบอร์ · ที่อยู่ · ชื่องาน/สเปค · <B>ลายที่ลูกค้าแนบมา</B>
            </>,
            <>
              <B>ไม่ตามไป:</B> แบบงานเก่าที่กราฟฟิกทำไว้ — เพราะยังไงก็ต้องทำ/ตรวจใหม่ กราฟฟิกจะได้ไม่หยิบไฟล์ผิด
            </>,
            <>
              ทั้งสองออเดอร์<B>ลิงก์ถึงกัน</B> เปิดข้ามไปมาได้ และมี log ที่ออเดอร์เดิมว่าเปิดเคลมใบไหน เพราะอะไร
            </>,
          ]}
        />
        <Tip>
          ในออเดอร์เคลมจะมีแบนเนอร์ <B>♻️ งานเคลม — ไม่คิดเงินกับลูกค้า</B> พร้อมเหตุผลติดไว้บนหัว
          ทุกคนที่เปิดดูจะรู้ทันทีว่าเป็นงานทำใหม่ ราคาที่ขึ้น ฿0 คือตั้งใจ ไม่ใช่ลืมตีราคา
        </Tip>
      </>
    ),
  },
  {
    id: "quote",
    icon: "📄",
    title: "ใบเสนอราคา — เสนอหลายใบไม่ให้กราฟฟิกงง",
    roles: ["แอดมิน"],
    keywords: "ใบเสนอราคา quote เสนอราคา ตีราคา ลูกค้าตกลง ยืนราคา หมดอายุ",
    body: (
      <>
        <p>
          ใบเสนอราคา<B>ไม่เข้าคิวกราฟฟิก</B> จนกว่าลูกค้าจะตกลง — เสนอกี่ใบก็ได้โดยไม่ปนกับงานจริง (
          <A href="/admin/quotes">เปิดหน้าใบเสนอราคา</A>)
        </p>
        <Steps
          items={[
            <>
              กด <Key>＋ ใบเสนอราคาใหม่</Key> → กรอกชื่อ/เบอร์ลูกค้า (บันทึกอัตโนมัติ ไม่มีปุ่มเซฟ)
            </>,
            <>
              ใส่รายการ — เสนอหลายแบบให้ลูกค้าคนเดียวกัน ใช้ปุ่ม <Key>ก๊อปจากใบเดิม</Key> จะเร็วกว่าพิมพ์ใหม่
            </>,
            <>
              ตั้ง <B>ยืนราคาถึง</B> (ค่าเริ่มต้น 7 วัน) — เลยกำหนดลูกค้ากดตกลงไม่ได้ ต้องขอใบใหม่
            </>,
            <>
              กด <Key>🔗 คัดลอกลิงก์ส่งลูกค้า</Key> — ครั้งแรกสถานะเปลี่ยนเป็น “ส่งให้ลูกค้าแล้ว” เอง
            </>,
            <>
              ลูกค้ากดตกลงจากลิงก์เอง หรือแอดมินกด <Key>✅ ลูกค้าตกลง — สร้างออเดอร์</Key> ให้ก็ได้
            </>,
          ]}
        />
        <Tip>
          ตอนแปลงเป็นออเดอร์ ระบบถามว่าจะ<B>ปิดใบอื่นของลูกค้ารายนั้น</B>ด้วยไหม — กด OK ไว้
          เหลือใบเดียวที่ยัง “มีชีวิต” กราฟฟิกจะไม่หยิบผิดใบ
        </Tip>
        <Bullets
          items={[
            <>
              หน้ารายการเตือน <B>⚠️ ลูกค้ารายนี้มีใบค้างหลายใบ</B> ให้เห็นก่อนที่จะกลายเป็นปัญหา
            </>,
            <>ใบที่แปลงเป็นออเดอร์แล้ว แก้ไม่ได้ ลบไม่ได้ — ไปแก้ที่หน้าออเดอร์แทน</>,
          ]}
        />
      </>
    ),
  },
  {
    id: "add-items",
    icon: "🛒",
    title: "เพิ่มของเข้าออเดอร์ — 3 ทาง",
    roles: ["แอดมิน"],
    keywords: "เพิ่มรายการ หยิบจากหน้าร้าน สั่งเพิ่ม งานพิเศษ สั่งแทนลูกค้า ตะกร้า",
    body: (
      <>
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[0.85rem] ring-1 ring-slate-200">
          <B>ถามตัวเองก่อน:</B> ของชิ้นนี้มีขายบนเว็บอยู่แล้วไหม?
          <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-teal-700 ring-1 ring-teal-200">
            มี → ทาง B
          </span>
          <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
            ไม่มี → ทาง A
          </span>
          <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-sky-700 ring-1 ring-sky-200">
            ลูกค้าสั่งเอง → ทาง C
          </span>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <p className="text-[0.8rem] font-bold text-slate-500">ทาง A · แอดมินกด</p>
            <p className="text-sm font-extrabold text-slate-900">＋ เพิ่มรายการเอง</p>
            <div className="mt-2 text-[0.82rem] text-slate-600">
              <Steps
                items={[
                  <>
                    กด <Key>＋ เพิ่มรายการเอง</Key> → แท็บ <Key>🛠 งานพิเศษ</Key>
                  </>,
                  <>พิมพ์ชื่องาน — คลังแม่แบบเด้งขึ้นให้เลือก สเปคเติมให้เอง</>,
                  <>
                    ใส่จำนวน/ราคา · ยังไม่รู้ราคาใส่ <B>0</B> = ขึ้นป้าย “รอตีราคา”
                  </>,
                  <>แนบภาพลาย (ลาก · คลิก · ⌘V)</>,
                  <>
                    กด <Key>✅ เพิ่มเข้าออเดอร์</Key> — ไม่กด = ไม่บันทึก
                  </>,
                ]}
              />
            </div>
            <div className="mt-2">
              <Warn>
                ทางนี้<B>ไม่มีราคาขั้นบันได</B> ต้องคิดราคาเอง
              </Warn>
            </div>
          </div>

          <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-3">
            <p className="text-[0.8rem] font-bold text-teal-600">ทาง B · แอดมินกด</p>
            <p className="text-sm font-extrabold text-slate-900">🛍️ หยิบจากหน้าร้าน</p>
            <div className="mt-2 text-[0.82rem] text-slate-600">
              <Steps
                tone="teal"
                items={[
                  <>
                    กด <Key>🛍️ หยิบจากหน้าร้าน</Key> — เปิดหน้าร้านแท็บใหม่
                  </>,
                  <>เลือกสินค้า + ตัวเลือก ใส่ตะกร้า (หลายชิ้นได้)</>,
                  <>กลับมาที่ตะกร้า จะมีแถบบอกปลายทาง</>,
                  <>กดปุ่มบนแถบ → โยนเข้าไปทีเดียว ตะกร้าล้างให้เอง</>,
                ]}
              />
            </div>
            <div className="mt-2">
              <Tip>
                ได้<B>ราคาขั้นบันไดจริง</B> · ตัวเลือกครบ · ไม่คิดค่าส่งซ้ำ
              </Tip>
            </div>
          </div>

          <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-3">
            <p className="text-[0.8rem] font-bold text-sky-600">ทาง C · ลูกค้ากดเอง</p>
            <p className="text-sm font-extrabold text-slate-900">สั่งเพิ่มในออเดอร์นี้</p>
            <div className="mt-2 text-[0.82rem] text-slate-600">
              <Steps
                tone="sky"
                items={[
                  <>
                    ลูกค้าเปิดลิงก์ออเดอร์ตัวเอง เลื่อนล่างสุด กด <Key>🛍️ สั่งเพิ่มในออเดอร์นี้</Key>
                  </>,
                  <>ช้อปตามปกติ</>,
                  <>ที่ตะกร้าติ๊กเลือกว่ารายการไหนเข้าออเดอร์เดิม</>,
                  <>ยืนยัน → เข้าออเดอร์ทันที มี log ให้เห็น</>,
                ]}
              />
            </div>
            <div className="mt-2">
              <Warn>
                เพิ่มได้เฉพาะออเดอร์ที่<B>ยังไม่เข้าผลิต</B> · มียอดค้าง สถานะเด้งกลับ <B>รอชำระเงิน</B>{" "}
                ให้โอนเฉพาะส่วนต่าง · ไม่คิดค่าส่งซ้ำ
              </Warn>
            </div>
          </div>
        </div>
      </>
    ),
  },
  {
    id: "edit-delete",
    icon: "🗑",
    title: "แก้ไข / ลบรายการในออเดอร์",
    roles: ["แอดมิน"],
    keywords: "ลบรายการ แก้รายละเอียด log ประวัติ เหตุผล ส่วนลด",
    body: (
      <>
        <Bullets
          items={[
            <>
              แก้ชื่อ/สเปคของรายการ → กด <Key>✏️ แก้รายละเอียด</Key> ใต้ชื่อสินค้า
            </>,
            <>
              ลบรายการ → กด <Key>🗑 ลบรายการ</Key> · <Mark>ระบบบังคับให้ใส่เหตุผลทุกครั้ง</Mark>
            </>,
            <>
              ทุกการแก้/ลบลง <B>ประวัติ</B> ท้ายหน้าออเดอร์ — ใครทำ ทำอะไร เมื่อไหร่ ย้อนดูได้เสมอ
            </>,
            <>
              ลดราคาเฉพาะรายการ → กด <Key>＋ ใส่ส่วนลด</Key> ข้างราคา ใส่ได้ทั้งบาทและ %
            </>,
          ]}
        />
      </>
    ),
  },
  {
    id: "shipping-auto",
    icon: "🚚",
    title: "ค่าส่งเลือกให้อัตโนมัติ (ขายส่งได้กล่องใหญ่เอง)",
    roles: ["แอดมิน"],
    keywords: "ค่าส่ง ems กล่อง ขายส่ง จำนวนมาก อัตโนมัติ จัดส่ง มารับเอง",
    body: (
      <>
        <p>
          ไม่ต้องคอยไล่แก้ค่าส่งให้ลูกค้าขายส่งอีก — ระบบเลือก<B>กล่องที่พอดี</B>ให้เองตั้งแต่หน้าตะกร้า
          และล็อกกล่องที่เล็กเกินไม่ให้เลือก
        </p>
        <p className="pt-1 font-bold text-slate-800">ตั้งค่า 2 ที่</p>
        <Bullets
          items={[
            <>
              <A href="/admin/settings">ตั้งค่าระบบ → 🚚 การจัดส่ง</A> — ใส่ช่อง <B>“เด้งมาใช้เมื่อ”</B> ของกล่องใหญ่
              เช่น EMS (100) → สั่งตั้งแต่ <B>50 ชิ้น</B> ขึ้นไป หรือยอดถึง <B>5,000 บาท</B>
            </>,
            <>
              <A href="/admin/products">สินค้า</A> → เปิดสินค้าชิ้นใหญ่ → <B>🚚 ค่าส่งขั้นต่ำของสินค้านี้</B> —
              มีของชิ้นนี้ในตะกร้าเมื่อไหร่ ยกระดับให้ทันทีไม่ว่าจะสั่งกี่ชิ้น
            </>,
          ]}
        />
        <Tip>
          ลูกค้าจะเห็นเหตุผลว่า <B>“ระบบเลือกกล่องที่พอดีกับออเดอร์นี้ให้แล้ว — สั่ง 60 ชิ้น”</B> ·
          กล่องที่เล็กเกินขึ้นว่า “ของใส่ไม่พอ” กดไม่ได้ · <B>มารับเอง (฿0) ไม่เคยโดนล็อก</B>
        </Tip>
        <p className="text-[0.85rem] text-slate-500">เว้นช่องไว้ = ไม่เด้ง ทำงานเหมือนเดิมทุกอย่าง</p>
      </>
    ),
  },
  {
    id: "discount",
    icon: "🎟️",
    title: "ส่วนลด & คูปอง",
    roles: ["แอดมิน"],
    keywords: "คูปอง ส่วนลด โค้ด สมาชิก ระดับ tier ชดเชย",
    body: (
      <Bullets
        items={[
          <>
            ส่วนลดมี 2 ชั้น — <B>ระดับสมาชิก</B> (อัตโนมัติตามยอดสะสม) และ <B>คูปอง</B> (โค้ด/ลิงก์ที่แจก)
          </>,
          <>
            คูปอง<B>ใช้ได้ครั้งเดียวต่อใบ</B> ระบบตัดฝั่งเซิร์ฟเวอร์ กันใช้ซ้ำ — สร้างที่{" "}
            <A href="/admin/coupons">หน้าคูปอง</A>
          </>,
          <>ลูกค้าไม่พอใจอยากชดเชย → แจกคูปองดีกว่าลดราคาในบิล เพราะตามสถิติได้ และไม่ทำให้ยอดบิลเพี้ยน</>,
        ]}
      />
    ),
  },

  /* ───────── กราฟฟิก ───────── */
  {
    id: "gfx-queue",
    icon: "🎯",
    title: "งานของฉันอยู่ตรงไหน",
    roles: ["กราฟฟิก"],
    keywords: "คิวงาน กราฟฟิก เริ่มงาน สถานะ ชำระแล้ว รอตรวจแบบ แก้ไขแบบ",
    body: (
      <>
        <p>
          เปิด <A href="/admin/orders">คำสั่งซื้อ</A> แล้วดูป้ายสถานะ — 3 สถานะนี้คืองานที่รอเราอยู่
        </p>
        <Bullets
          items={[
            <>
              <B>ชำระแล้ว</B> — เงินเข้าแล้ว ยังไม่มีใครทำแบบ = <B>เริ่มได้เลย</B>
            </>,
            <>
              <B>แก้ไขแบบ</B> — ลูกค้าขอแก้ กลับมาที่เรา <B>งานนี้ด่วนที่สุด</B> เพราะลูกค้ารออยู่
            </>,
            <>
              <B>รอตรวจแบบ</B> — ส่งไปแล้ว รอลูกค้าตอบ ไม่ต้องทำอะไร
            </>,
          ]}
        />
        <Warn>
          ออเดอร์ที่ยัง <B>รอชำระเงิน</B> ระบบล็อกช่องอัปโหลดไว้ — กันทำงานฟรีถ้าลูกค้าไม่โอน ·
          ลูกค้าประจำที่ไว้ใจได้ แอดมินกดปลดล็อก <Key>ทำแบบก่อนได้</Key> ให้ได้
        </Warn>
      </>
    ),
  },
  {
    id: "gfx-proof",
    icon: "🖼",
    title: "ใส่แบบให้ลูกค้าตรวจ",
    roles: ["กราฟฟิก"],
    keywords: "อัปแบบ ใส่ภาพ ลากภาพ เปลี่ยนภาพ proof แบบงาน ลบภาพ",
    body: (
      <>
        <p>
          ในแต่ละรายการมี <B>2 ฝั่ง</B> อย่าสับสน:
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg bg-slate-50 p-3 text-[0.85rem] ring-1 ring-slate-200">
            <p className="font-bold text-slate-700">🎨 ลายจากลูกค้า (ฝั่งซ้าย)</p>
            <p className="mt-1 text-slate-600">
              ไฟล์ที่ลูกค้าแนบมา · <B>ทีมงานเห็นเท่านั้น</B> ลูกค้าไม่เห็นในหน้าเช็คออเดอร์ · ลบไม่ได้
              แต่กดดาวน์โหลดได้
            </p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3 text-[0.85rem] ring-1 ring-slate-200">
            <p className="font-bold text-slate-700">🖼 แบบที่เราส่งให้ตรวจ (ฝั่งขวา)</p>
            <p className="mt-1 text-slate-600">
              ชุดนี้<B>ลูกค้าเห็น</B>และกดอนุมัติ / ขอแก้ไข
            </p>
          </div>
        </div>
        <Steps
          items={[
            <>
              ลากไฟล์มาวางในกล่องขวาได้เลย หรือกด <Key>＋ อัปแบบใหม่ให้ลูกค้าตรวจ</Key>
            </>,
            <>
              ถ้าลายลูกค้าใช้เป็นแบบได้เลย กด <Key>ใช้ลายนี้เป็นแบบ →</Key> ไม่ต้องโหลดลงเครื่องแล้วอัปใหม่
            </>,
            <>
              แก้แบบเดิม → <B>ลากไฟล์ใหม่ทับได้เลย ไม่ต้องลบของเดิม</B> ระบบจะบันทึกว่าแก้แล้ว
            </>,
            <>เปลี่ยนสถานะเป็น “รอตรวจแบบ” → ลูกค้าได้รับแจ้งเตือนทางไลน์อัตโนมัติ</>,
          ]}
        />
        <Warn>
          กด<B>ลบ</B>ภาพจะมีคำเตือนขึ้น เพราะลบแล้วตำแหน่งรายการอาจคลาดเคลื่อน และดูไม่ออกว่าอันไหนแก้แล้ว —
          ถ้าจะเปลี่ยนภาพ ให้ <Mark>ลากทับ</Mark> แทนการลบ
        </Warn>
        <Tip>
          พอแก้แล้ว ฝั่งลูกค้าจะเห็นป้าย <B>แก้ไขแล้ว</B> บนรูปนั้นเอง ไม่ต้องทักไปบอก
        </Tip>
      </>
    ),
  },
  {
    id: "gfx-approve",
    icon: "✅",
    title: "ลูกค้าอนุมัติ / ขอแก้ไข",
    roles: ["กราฟฟิก", "แอดมิน"],
    keywords: "อนุมัติ ขอแก้ไข ตรวจแบบ ลูกค้าตอบ รอบแก้",
    body: (
      <Bullets
        items={[
          <>
            ลูกค้ากดเองจากลิงก์ออเดอร์ของเขา — เราไม่ต้องกดแทน (ถ้ากดแทนจะไม่มีหลักฐานว่าลูกค้าอนุมัติจริง)
          </>,
          <>
            ลูกค้ากด <B>ขอแก้ไข</B> จะพิมพ์บอกด้วยว่าอยากแก้อะไร ข้อความขึ้นในรายการนั้นเลย
          </>,
          <>
            อนุมัติครบทุกรายการ → เปลี่ยนสถานะเป็น <B>อนุมัติแบบ</B> แล้วส่งเข้าผลิต
          </>,
        ]}
      />
    ),
  },
  {
    id: "gfx-ack",
    icon: "☑️",
    title: "ยืนยันว่าอ่านรายละเอียดแล้ว",
    roles: ["กราฟฟิก", "แพ็คของ"],
    keywords: "ยืนยันอ่าน noteAck หมายเหตุ ข้อควรทราบ ตรวจนับ",
    body: (
      <>
        <p>
          ทุกรายการมีช่อง <Key>☐ ยืนยันว่าอ่านรายละเอียดแล้ว</Key> — ต้องติ๊กก่อน ระบบถึงจะยอมให้ยิงเลขพัสดุ
        </p>
        <Bullets
          items={[
            <>อ่านสเปค/หมายเหตุของรายการนั้นให้จบก่อนติ๊ก อย่าติ๊กรวดเพื่อให้ผ่าน</>,
            <>ระบบจำว่าใครติ๊ก ติ๊กตอนไหน — ถ้างานพลาดจะรู้ว่าใครข้ามขั้นตอน</>,
          ]}
        />
      </>
    ),
  },

  /* ───────── แพ็คของ ───────── */
  {
    id: "pack-start",
    icon: "📮",
    title: "เริ่มแพ็ค — สแกนออเดอร์",
    roles: ["แพ็คของ"],
    keywords: "สแกน บาร์โค้ด qr แพ็ค สถานี มือถือ",
    body: (
      <>
        <Steps
          items={[
            <>
              เปิด <A href="/admin/orders/scan">แพ็ค–ส่ง</A> บนมือถือหรือคอม
            </>,
            <>
              ยิงบาร์โค้ดบนใบงาน (หรือพิมพ์เลขออเดอร์เอง) — ยิง QR ของมือถือก็ได้ ระบบดึงเลขให้เอง
            </>,
            <>
              เข้าโหมดแพ็ค กด <Key>📦 เข้าโหมดแพ็ค (ตรวจนับ/ยืนยันอ่าน)</Key>
            </>,
          ]}
        />
        <p className="text-[0.85rem] text-slate-500">
          คิวแพ็คมีเฉพาะออเดอร์ที่ผ่านแบบแล้ว — สถานะ <B>อนุมัติแบบ</B> หรือ <B>กำลังผลิต</B>
        </p>
      </>
    ),
  },
  {
    id: "pack-count",
    icon: "🔢",
    title: "ตรวจนับของทีละรูป",
    roles: ["แพ็คของ"],
    keywords: "ตรวจนับ นับของ ไม่ครบ ของขาด ตัวอย่าง sample ถ่ายรูป",
    body: (
      <>
        <Bullets
          items={[
            <>
              แตะรูปแบบงานให้ขยาย แล้วกด <B>ครบ</B> หรือ <B>ไม่ครบ</B> — ต้องกด<B>ทุกรูป</B>
            </>,
            <>
              กด <B>ไม่ครบ</B> ต้องใส่ว่าได้กี่ชิ้น → ระบบจะ<Mark>ห้ามยิงเลขพัสดุ</Mark>จนกว่าจะแก้ให้ครบ
            </>,
            <>
              รายการที่มี <B>ชิ้นงานตัวอย่าง</B> ต้องติ๊กว่าใส่กล่องแล้ว — กันลืมส่งตัวอย่างไปด้วย
            </>,
            <>
              ก่อนปิดกล่อง <B>ถ่ายรูปของในกล่องอย่างน้อย 1 รูป</B> — เป็นหลักฐานถ้าลูกค้าแจ้งของขาด/ชำรุด
            </>,
          ]}
        />
      </>
    ),
  },
  {
    id: "pack-ship",
    icon: "🏷",
    title: "ยิงเลขพัสดุ — ต้องผ่าน 6 ข้อนี้",
    roles: ["แพ็คของ", "แอดมิน"],
    keywords: "ยิงเลขพัสดุ tracking ส่งของ ปณ ไปรษณีย์ บล็อก ส่งไม่ได้",
    body: (
      <>
        <p>ระบบจะไม่ยอมให้ยิงเลขพัสดุ ถ้ายังติดข้อใดข้อหนึ่ง — เช็คตามนี้</p>
        <CanTable
          rows={[
            ["ตรวจนับครบทุกรูปแล้ว", true],
            ["ติ๊กยืนยันว่าอ่านรายละเอียดครบทุกรายการ", true],
            ["ไม่มีรายการที่กด “ไม่ครบ” ค้างอยู่", true],
            ["รายการที่มีชิ้นงานตัวอย่าง ติ๊กว่าใส่กล่องแล้ว", true],
            ["ถ่ายรูปของในกล่องแล้วอย่างน้อย 1 รูป", true],
            ["ถ้าเป็นออเดอร์มัดจำ ต้องเก็บครบ 100% ก่อน", true],
          ]}
        />
        <Warn>
          ติดข้อไหนระบบจะบอกชัดว่าติดอะไร — <B>อย่าหาทางข้าม</B> ทุกข้อมีไว้กันของผิด/ของขาดออกจากร้าน
        </Warn>
        <Tip>
          ยิงเลขแล้วลูกค้าเห็น<B>สถานะพัสดุไปรษณีย์ไทยเอง</B>ในหน้าออเดอร์ ไม่ต้องคอยตอบว่าของถึงไหนแล้ว
        </Tip>
      </>
    ),
  },

  /* ───────── อ้างอิง ───────── */
  {
    id: "ref-preset",
    icon: "🎛️",
    title: "คลังตัวเลือก มีไว้ทำไม",
    roles: ["แอดมิน"],
    keywords: "คลังตัวเลือก preset ชนิดกระดาษ เคลือบ ลิงก์ ตัดลิงก์ ปรับเฉพาะตัว",
    body: (
      <>
        <p>
          ชนิดกระดาษชุดเดียวถูกใช้กับสินค้าเป็นสิบตัว ถ้าพิมพ์ซ้ำในทุกสินค้า พอ<B>เลิกขายกระดาษ 1 ชนิด</B>{" "}
          ต้องไล่แก้ทีละตัวจนหลุดแน่ — คลังตัวเลือกคือเก็บชุดนั้นไว้ที่เดียว (
          <A href="/admin/options">เปิดคลังตัวเลือก</A>)
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg bg-rose-50/70 p-3 text-[0.82rem] ring-1 ring-rose-100">
            <p className="font-bold text-rose-700">❌ ไม่ใช้คลัง</p>
            <p className="mt-1 text-slate-600">พิมพ์ซ้ำ 30 สินค้า · แก้ทีเปิด 30 หน้า · ชื่อเพี้ยนกันเอง</p>
          </div>
          <div className="rounded-lg bg-emerald-50/70 p-3 text-[0.82rem] ring-1 ring-emerald-100">
            <p className="font-bold text-emerald-700">✅ ใช้คลัง</p>
            <p className="mt-1 text-slate-600">
              แก้ที่เดียว สินค้าที่ <B>🔗 ลิงก์</B> เปลี่ยนตามหมดทันที
            </p>
          </div>
        </div>
        <Bullets
          items={[
            <>
              สินค้าตัวไหนอยากต่างจากชาวบ้าน → กด <Key>ปรับเฉพาะตัว</Key> ตัดลิงก์เป็นสำเนาอิสระ
            </>,
            <>
              <Mark>คลังที่ยังมีสินค้าลิงก์อยู่ ลบไม่ได้</Mark> ต้องไปตัดลิงก์ที่สินค้าก่อน
            </>,
          ]}
        />
      </>
    ),
  },
  {
    id: "ref-price",
    icon: "💰",
    title: "ราคาขั้นบันได (สั่งเยอะถูกลง)",
    roles: ["แอดมิน"],
    keywords: "ราคา ขั้นบันได rate card สั่งเยอะ ถูกลง ตั้งราคา",
    body: (
      <>
        <p>
          สินค้าส่วนใหญ่คิดราคาตามจำนวน และบางตัวขึ้นกับตัวเลือกด้วย (ขนาด × ชนิดกระดาษ) — ระบบคิดให้เองตั้งแต่หน้าร้าน
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[18rem] text-left text-[0.82rem]">
            <thead className="text-[0.72rem] font-bold uppercase tracking-wide text-slate-400">
              <tr>
                <th className="pb-1">จำนวน</th>
                <th className="pb-1 text-right">ราคา/ชิ้น</th>
                <th className="pb-1 text-right">รวม</th>
              </tr>
            </thead>
            <tbody className="tabular-nums text-slate-600">
              {[
                [10, 120, 1200],
                [50, 95, 4750],
                [100, 80, 8000],
              ].map(([q, u, t]) => (
                <tr key={q} className="border-t border-slate-100">
                  <td className="py-1">{q} ชิ้น</td>
                  <td className="py-1 text-right">฿{u}</td>
                  <td className="py-1 text-right font-semibold text-slate-800">฿{t.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[0.72rem] text-slate-400">* ตัวเลขตัวอย่าง — ของจริงตั้งได้ต่อสินค้า</p>
        </div>
        <Tip>
          เวลาสั่งแทนลูกค้าให้ <B>หยิบจากหน้าร้าน</B> ดีกว่าพิมพ์ราคาเอง — ราคาตรงเสมอ
        </Tip>
      </>
    ),
  },
  {
    id: "ref-stock",
    icon: "📦",
    title: "คลังสต๊อก — ทำไมแก้ยอดตรง ๆ ไม่ได้",
    roles: ["แอดมิน"],
    keywords: "สต๊อก คลัง วัสดุ นับจริง เบิก ของเสีย ledger",
    body: (
      <>
        <p>
          ยอดคงเหลือ<B>คำนวณจากประวัติการเคลื่อนไหวเท่านั้น</B> (รับเข้า · ขายตัด · เบิกผลิต · ของเสีย)
          ถ้าพิมพ์ตัวเลขทับได้ ของหายแล้วจะไม่มีใครรู้ว่าหายตอนไหน
        </p>
        <Bullets
          items={[
            <>
              ขายได้ = ระบบ<B>ตัดสต๊อกให้เอง</B> ไม่ต้องมากดเอง
            </>,
            <>
              นับจริงไม่ตรง → ใช้เมนู <Key>นับจริง</Key> ระบบ<Mark>บังคับใส่เหตุผล</Mark>ก่อนปรับยอด
            </>,
          ]}
        />
      </>
    ),
  },
];
