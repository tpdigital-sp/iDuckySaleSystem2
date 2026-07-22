"use client";

/** พาเลตต์สีพื้นไล่เฉด (คลาส Tailwind ต้องเป็นข้อความตรง ๆ เพื่อให้ถูก build) */
export const GRADIENTS: { value: string; label: string }[] = [
  { value: "from-sky-100 to-blue-200", label: "ฟ้า" },
  { value: "from-cyan-100 to-sky-200", label: "ฟ้าน้ำทะเล" },
  { value: "from-blue-100 to-cyan-200", label: "ฟ้าอมเขียว" },
  { value: "from-blue-100 to-indigo-200", label: "น้ำเงิน" },
  { value: "from-indigo-100 to-violet-200", label: "ม่วงคราม" },
  { value: "from-violet-100 to-purple-200", label: "ม่วง" },
  { value: "from-purple-100 to-indigo-200", label: "ม่วงเข้ม" },
  { value: "from-purple-100 to-fuchsia-200", label: "ม่วงบานเย็น" },
  { value: "from-fuchsia-100 to-purple-200", label: "ม่วงชมพู" },
  { value: "from-fuchsia-100 to-pink-200", label: "บานเย็น" },
  { value: "from-pink-100 to-rose-200", label: "ชมพู" },
  { value: "from-pink-100 to-violet-200", label: "ชมพูม่วง" },
  { value: "from-rose-100 to-pink-200", label: "ชมพูอ่อน" },
  { value: "from-rose-100 to-red-200", label: "ชมพูแดง" },
  { value: "from-orange-100 to-red-100", label: "ส้มอ่อน" },
  { value: "from-orange-100 to-amber-200", label: "ส้ม" },
  { value: "from-amber-100 to-orange-200", label: "ส้มอำพัน" },
  { value: "from-amber-100 to-yellow-200", label: "เหลืองทอง" },
  { value: "from-yellow-100 to-amber-200", label: "เหลือง" },
  { value: "from-yellow-100 to-orange-200", label: "เหลืองส้ม" },
  { value: "from-lime-100 to-green-200", label: "เขียวมะนาว" },
  { value: "from-green-100 to-emerald-200", label: "เขียว" },
  { value: "from-emerald-100 to-teal-200", label: "เขียวมินต์" },
  { value: "from-emerald-100 to-green-200", label: "เขียวสด" },
  { value: "from-teal-100 to-emerald-200", label: "มินต์" },
  { value: "from-teal-100 to-cyan-200", label: "มินต์ฟ้า" },
  { value: "from-sky-100 to-cyan-200", label: "ฟ้าใส" },
  { value: "from-slate-100 to-slate-200", label: "เทา" },
  { value: "from-stone-100 to-stone-200", label: "เทาอุ่น" },
];

export default function GradientPicker({
  value,
  emoji,
  onChange,
  ariaLabel,
}: {
  value: string;
  emoji: string;
  onChange: (v: string) => void;
  ariaLabel: string;
}) {
  const known = GRADIENTS.some((g) => g.value === value);
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br ${value} text-base`}
        aria-hidden="true"
      >
        {emoji}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl bg-stone-50 px-2 py-1.5 text-sm ring-1 ring-stone-200 focus:outline-none focus:ring-2 focus:ring-ducky"
        aria-label={ariaLabel}
      >
        {!known && <option value={value}>สีเดิม</option>}
        {GRADIENTS.map((g) => (
          <option key={g.value} value={g.value}>
            {g.label}
          </option>
        ))}
      </select>
    </div>
  );
}
