import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-4 pt-20 text-center">
      <span className="text-7xl">🐥</span>
      <h1 className="mt-4 text-2xl font-extrabold text-amber-950">อุ๊ปส์! ไม่พบหน้านี้</h1>
      <p className="mt-2 text-sm text-stone-500">หน้าที่คุณหาอาจถูกย้ายหรือไม่มีอยู่แล้ว</p>
      <Link
        href="/"
        className="mt-6 inline-block rounded-full bg-amber-400 px-8 py-3.5 text-sm font-bold text-white shadow-lg transition hover:scale-105"
      >
        🏠 กลับหน้าแรก
      </Link>
    </div>
  );
}
