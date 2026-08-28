#!/bin/bash
# ─────────────────────────────────────────────────────────────
# iDucky Prints Studio — ดับเบิลคลิกเพื่อเปิดเว็บอัตโนมัติ
# สตาร์ท dev server (พอร์ต 3006 · เปลี่ยนได้ด้วย PORT=xxxx ./start.command) แล้วเปิดเบราว์เซอร์ให้เอง
# ปิดเซิร์ฟเวอร์: กด Ctrl+C หรือปิดหน้าต่าง Terminal นี้
#
# กันหน้าต่างปิดเอง:
#   · ถ้าเซิร์ฟเวอร์ error/ดับ → ค้างข้อความไว้ให้อ่าน ต้องกด Enter ถึงจะปิด
#   · ถ้าดับเองแบบไม่ได้ตั้งใจ → สตาร์ทใหม่อัตโนมัติ (สูงสุด 5 ครั้ง)
#   · กันเครื่องหลับตอนไม่ได้ใช้งาน (caffeinate) เซิร์ฟเวอร์จะไม่หลุด
# ─────────────────────────────────────────────────────────────

# ไปที่โฟลเดอร์โปรเจกต์ (ที่เดียวกับไฟล์นี้) เสมอ ไม่ว่าจะดับเบิลคลิกจากที่ไหน
cd "$(dirname "$0")" || {
  echo "❌ เข้าโฟลเดอร์โปรเจกต์ไม่ได้"
  read -r -p "กด Enter เพื่อปิดหน้าต่างนี้..." _
  exit 1
}

# ค้างหน้าต่างไว้เสมอ ไม่ให้ปิดเองจนกว่าจะกด Enter (จะได้อ่าน error ทัน)
hold_window() {
  echo ""
  echo "────────────────────────────────"
  [ -n "$1" ] && echo "$1"
  read -r -p "กด Enter เพื่อปิดหน้าต่างนี้..." _
}

STOPPED_BY_USER=0
on_interrupt() {
  STOPPED_BY_USER=1
}
trap on_interrupt INT TERM

# ใส่ Node ที่ติดตั้งไว้ใน ~/.local เข้า PATH (เลือกเวอร์ชันแรกที่เจอ)
NODE_BIN=$(ls -d "$HOME"/.local/node-*/bin 2>/dev/null | head -1)
[ -n "$NODE_BIN" ] && export PATH="$NODE_BIN:$PATH"

PORT="${PORT:-3006}"
URL="http://localhost:$PORT"

echo "🦆 iDucky Prints Studio"
echo "────────────────────────────────"

# ไม่มี node/npm → บอกให้ชัด แล้วค้างหน้าต่างไว้ (เมื่อก่อนจะเด้งปิดทันที)
if ! command -v npm >/dev/null 2>&1; then
  echo "❌ หา npm/node ไม่เจอ"
  echo "   คาดว่าอยู่ที่ ~/.local/node-*/bin — ตรวจว่าติดตั้งไว้ครบไหม"
  hold_window ""
  exit 1
fi

# ไม่มี node_modules → ติดตั้งให้ก่อน (ไม่งั้น next dev จะดับทันที)
if [ ! -d node_modules ]; then
  echo "📦 ยังไม่มี node_modules — กำลังติดตั้ง (ครั้งแรกใช้เวลาสักครู่)..."
  if ! npm install; then
    hold_window "❌ ติดตั้ง dependencies ไม่สำเร็จ"
    exit 1
  fi
fi

# ถ้าเซิร์ฟเวอร์เปิดอยู่แล้ว → เปิดเบราว์เซอร์แล้วจบ (ไม่สตาร์ทซ้ำ)
if curl -s -o /dev/null "$URL"; then
  echo "✓ เซิร์ฟเวอร์เปิดอยู่แล้ว — กำลังเปิดเบราว์เซอร์..."
  open "$URL"
  exit 0
fi

# เปิดเบราว์เซอร์อัตโนมัติเมื่อเซิร์ฟเวอร์พร้อม (รอเบื้องหลัง สูงสุด ~60 วิ)
(
  for _ in $(seq 1 60); do
    if curl -s -o /dev/null "$URL"; then
      open "$URL"
      break
    fi
    sleep 1
  done
) &

echo "⏳ กำลังสตาร์ทเซิร์ฟเวอร์ที่ $URL ..."
echo "   (เบราว์เซอร์จะเปิดเองเมื่อพร้อม · กด Ctrl+C เพื่อหยุด)"
echo "────────────────────────────────"

# กันเครื่องหลับ/App Nap ระหว่างเซิร์ฟเวอร์ทำงาน — ไม่ใช้งานนาน ๆ ก็ไม่หลุด
RUNNER=()
command -v caffeinate >/dev/null 2>&1 && RUNNER=(caffeinate -i -s)

# สตาร์ท Next.js dev server · ถ้าดับเองแบบไม่ได้ตั้งใจ ให้สตาร์ทใหม่ (กัน crash loop ที่ 5 ครั้ง)
RESTARTS=0
MAX_RESTARTS=5
while true; do
  "${RUNNER[@]}" npm run dev -- --port "$PORT"
  CODE=$?

  # ผู้ใช้กด Ctrl+C เอง (130 = SIGINT, 143 = SIGTERM) → หยุดจริง ไม่สตาร์ทใหม่
  if [ "$STOPPED_BY_USER" -eq 1 ] || [ "$CODE" -eq 130 ] || [ "$CODE" -eq 143 ] || [ "$CODE" -eq 0 ]; then
    hold_window "🛑 หยุดเซิร์ฟเวอร์แล้ว"
    exit 0
  fi

  RESTARTS=$((RESTARTS + 1))
  if [ "$RESTARTS" -gt "$MAX_RESTARTS" ]; then
    hold_window "❌ เซิร์ฟเวอร์ดับซ้ำ ๆ $MAX_RESTARTS ครั้ง (exit code $CODE) — เลื่อนอ่าน error ด้านบนได้เลย"
    exit 1
  fi

  echo ""
  echo "⚠️  เซิร์ฟเวอร์ดับเอง (exit code $CODE) — จะสตาร์ทใหม่ใน 3 วินาที [$RESTARTS/$MAX_RESTARTS]"
  echo "   ถ้าไม่ต้องการให้สตาร์ทใหม่ กด Ctrl+C ตอนนี้"
  sleep 3
  [ "$STOPPED_BY_USER" -eq 1 ] && { hold_window "🛑 หยุดเซิร์ฟเวอร์แล้ว"; exit 0; }
  echo "🔄 กำลังสตาร์ทใหม่..."
done
