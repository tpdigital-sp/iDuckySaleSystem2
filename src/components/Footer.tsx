import Link from "next/link";

const MENU = [
  { name: "เกี่ยวกับเรา", href: "#" },
  { name: "รีวิวจากลูกค้า", href: "#" },
  { name: "การเตรียมไฟล์", href: "/how-to-order" },
  { name: "คำถามที่พบบ่อย", href: "/how-to-order" },
  { name: "การจัดส่งสินค้า", href: "/how-to-order" },
  { name: "เงื่อนไขการเคลมสินค้า", href: "/how-to-order" },
];

const SOCIALS = [
  { name: "Facebook", label: "f", href: "https://www.facebook.com/iduckyshop" },
  { name: "Instagram", label: "📷", href: "https://www.instagram.com/iduckyshop1" },
  { name: "TikTok", label: "♪", href: "https://www.tiktok.com/@iduckyofficial" },
  { name: "X", label: "𝕏", href: "https://x.com/iduckyshop" },
];

/** ลาย QR จำลองสำหรับกล่อง LINE (ของจริงค่อยแทนที่ด้วยรูป QR ร้าน) */
function QrPattern() {
  const cells = [
    "111011101110111",
    "100010001010001",
    "101110111010111",
    "100010100010100",
    "111011101110111",
    "000101010001000",
    "111010111011101",
    "100011000110001",
    "101110101110111",
    "100010111010001",
    "111011101110111",
  ];
  return (
    <svg viewBox="0 0 15 11" className="h-16 w-20" aria-hidden="true">
      {cells.flatMap((row, y) =>
        row.split("").map((c, x) =>
          c === "1" ? <rect key={`${x}-${y}`} x={x} y={y} width="0.9" height="0.9" fill="#1c1917" /> : null
        )
      )}
    </svg>
  );
}

export default function Footer() {
  return (
    <footer className="mt-16">
      <div className="bg-sky-100">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-6 py-10 md:grid-cols-[auto_1fr_1fr_1fr_auto]">
          {/* โลโก้ */}
          <Link href="/" className="flex items-center gap-2">
            <span className="text-4xl">🦆</span>
            <span className="leading-tight">
              <span className="block text-2xl font-extrabold text-sky-900">
                iDucky
              </span>
              <span className="block text-xs font-semibold tracking-wide text-amber-500">
                prints.studio♡
              </span>
            </span>
          </Link>

          {/* เมนู */}
          <nav aria-label="เมนูท้ายเว็บ">
            <ul className="space-y-2 text-sm text-stone-700">
              {MENU.map((m) => (
                <li key={m.name}>
                  <Link href={m.href} className="hover:text-sky-800 hover:underline">
                    {m.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* ที่อยู่บริษัท */}
          <div className="text-sm leading-relaxed text-stone-700">
            <p>บริษัท ทีพีดิจิตอล</p>
            <p>663/8 ซอยฉลองกรุง1</p>
            <p>แขวง/เขตลาดกระบัง กทม 10520</p>
          </div>

          {/* ติดต่อ + โซเชียล */}
          <div className="text-sm leading-relaxed text-stone-700">
            <p>ติดต่อสอบถาม : 096-569-9414</p>
            <p>เวลา : จันทร์-ศุกร์ 09.00 - 18.00 น.</p>
            <div className="mt-3 flex gap-2">
              {SOCIALS.map((s) => (
                <a
                  key={s.name}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.name}
                  title={s.name}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border-2 border-stone-800 bg-white/60 text-base font-bold text-stone-800 transition hover:bg-white"
                >
                  {s.label}
                </a>
              ))}
            </div>
          </div>

          {/* LINE QR */}
          <a
            href="https://page.line.me/iduckyofficial?openQrModal=true"
            target="_blank"
            rel="noopener noreferrer"
            className="justify-self-start rounded-2xl bg-white p-3 shadow-sm ring-1 ring-sky-200 transition hover:shadow-md md:justify-self-end"
            title="แอด LINE ร้าน"
          >
            <div className="flex items-center gap-1.5">
              <QrPattern />
              <span className="text-sm font-extrabold text-stone-800">LINE</span>
            </div>
            <p className="mt-1 text-center text-[10px] text-stone-500">แสกนแอดไลน์ร้าน</p>
          </a>
        </div>
      </div>
      <div className="bg-sky-200/60 py-3 text-center text-xs text-sky-900">
        © 2026 iDucky Prints Studio — ทำด้วยใจ พิมพ์ด้วยรัก 🦆💛 ·{" "}
        <Link href="/admin" className="underline-offset-2 hover:underline">
          หลังบ้าน (สำหรับแอดมิน)
        </Link>
      </div>
    </footer>
  );
}
