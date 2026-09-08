#!/bin/bash
# ─────────────────────────────────────────────────────────────
# iDucky Prints Studio — ดับเบิลคลิกเพื่อเปิดเว็บอัตโนมัติ
# สตาร์ท dev server (พอร์ต 3016 · เปลี่ยนได้ด้วย PORT=xxxx ./start.command) แล้วเปิดเบราว์เซอร์ให้เอง
# ปิดเซิร์ฟเวอร์: กด Ctrl+C หรือปิดหน้าต่าง Terminal นี้
#
# กันหน้าต่างปิดเอง:
#   · ถ้าเซิร์ฟเวอร์ error/ดับ → ค้างข้อความไว้ให้อ่าน ต้องกด Enter ถึงจะปิด
#   · ถ้าดับเองแบบไม่ได้ตั้งใจ → สตาร์ทใหม่อัตโนมัติ (สูงสุด 5 ครั้ง)
#   · ถ้าพอร์ตชนกับโปรแกรมอื่น → เลื่อนไปใช้พอร์ตว่างถัดไปให้เอง
#   · กันเครื่องหลับตอนไม่ได้ใช้งาน (caffeinate) เซิร์ฟเวอร์จะไม่หลุด
#
# อัปเดตโค้ดให้เอง (ไม่ต้องกด update.command แยก):
#   · ตอนเปิด → git pull origin main ก่อนสตาร์ท ถ้า package.json เปลี่ยนก็ npm install ให้
#   · ระหว่างเปิดค้างไว้ → เช็ค GitHub ทุก 10 นาที มีของใหม่ก็ดึงมาเลย (Next dev โหลดไฟล์ใหม่เอง)
#     ถ้า dependency เปลี่ยน → npm install แล้วรีสตาร์ทเซิร์ฟเวอร์ให้อัตโนมัติ
#   · ดึงเฉพาะตอน "ไม่มีไฟล์แก้ค้าง + อยู่บรานช์ main" — งานที่กำลังแก้อยู่จะไม่โดนทับ/โดนเก็บเข้า stash
#     กรณีนั้นจะขึ้นเตือนแทน ถ้าอยากบังคับดึง (stash ให้ + สลับกลับ main) ใช้ update.command
#   · ปิดการอัปเดตอัตโนมัติชั่วคราว: NO_UPDATE=1 ./start.command
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

PORT="${PORT:-3016}"
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

# ── อัปเดตโค้ดจาก GitHub ─────────────────────────────────────
# คืนค่า: 0 = ดึงแล้ว (มีของใหม่หรือไม่ก็ตาม) · 1 = ข้าม/ไม่สำเร็จ
# ตั้งตัวแปร DEPS_CHANGED=1 ถ้า package.json / package-lock.json เปลี่ยนรอบนี้
DEPS_CHANGED=0
pull_latest() {
  DEPS_CHANGED=0
  command -v git >/dev/null 2>&1 || return 1
  git rev-parse --is-inside-work-tree >/dev/null 2>&1 || return 1

  local branch before after
  branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
  if [ "$branch" != "main" ]; then
    echo "⚠️  อยู่บรานช์ $branch (ไม่ใช่ main) — ข้ามการอัปเดตอัตโนมัติ · ถ้าจะดึงจริงใช้ update.command"
    return 1
  fi
  if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    echo "⚠️  มีไฟล์ที่แก้ค้างในเครื่อง — ข้ามการอัปเดตอัตโนมัติ กันงานโดนทับ · ถ้าจะดึงจริงใช้ update.command"
    return 1
  fi

  before=$(git rev-parse HEAD 2>/dev/null)
  # fetch ก่อน จะได้รู้ว่าไม่มีเน็ต/มีของใหม่ไหม โดยไม่ต้องแตะไฟล์
  if ! git fetch -q origin main 2>/dev/null; then
    echo "⚠️  ติดต่อ GitHub ไม่ได้ (ไม่มีเน็ต?) — ใช้โค้ดที่มีอยู่ไปก่อน"
    return 1
  fi
  after=$(git rev-parse origin/main 2>/dev/null)
  if [ "$before" = "$after" ]; then
    echo "✓ โค้ดเป็นเวอร์ชันล่าสุดอยู่แล้ว"
    return 0
  fi
  if ! git merge -q --ff-only origin/main 2>&1; then
    echo "❌ ดึงโค้ดใหม่ไม่สำเร็จ (ประวัติในเครื่องไม่ตรงกับ GitHub) — ใช้โค้ดเดิมไปก่อน · ลอง update.command"
    return 1
  fi
  echo "✓ อัปเดตโค้ดแล้ว — ของใหม่รอบนี้:"
  git log --oneline "$before..$after" | sed 's/^/   · /'
  if git diff --name-only "$before" "$after" | grep -qE '^(package\.json|package-lock\.json)$'; then
    DEPS_CHANGED=1
  fi
  return 0
}

if [ -z "$NO_UPDATE" ]; then
  echo "⬇️  เช็คโค้ดใหม่จาก GitHub..."
  if pull_latest && [ "$DEPS_CHANGED" -eq 1 ]; then
    echo "📦 รายการ dependency เปลี่ยน — กำลังติดตั้งเพิ่ม..."
    if ! npm install; then
      hold_window "❌ ติดตั้ง dependencies ไม่สำเร็จ"
      exit 1
    fi
  fi
  echo "────────────────────────────────"
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
  [ "$DEPS_CHANGED" -eq 1 ] && echo "   ⚠️ dependency เพิ่งเปลี่ยน — ปิดหน้าต่างเซิร์ฟเวอร์เดิม (Ctrl+C) แล้วเปิด start.command ใหม่ด้วย"
  open "$URL"
  exit 0
fi

# พอร์ตโดนโปรแกรมอื่นจองอยู่ (แต่ไม่ใช่เว็บเรา) → เลื่อนไปพอร์ตว่างถัดไป สูงสุด 20 พอร์ต
port_busy() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }
if port_busy "$PORT"; then
  BUSY_PORT="$PORT"
  FOUND=""
  for _ in $(seq 1 20); do
    PORT=$((PORT + 1))
    port_busy "$PORT" || { FOUND=1; break; }
  done
  if [ -z "$FOUND" ]; then
    hold_window "❌ พอร์ต $BUSY_PORT ถึง $PORT ไม่ว่างสักตัว — ปิดโปรแกรมที่ใช้พอร์ตอยู่ แล้วลองใหม่"
    exit 1
  fi
  URL="http://localhost:$PORT"
  echo "⚠️  พอร์ต $BUSY_PORT ชนกับโปรแกรมอื่น — เปลี่ยนไปใช้พอร์ต $PORT แทน"
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

# ── เช็คของใหม่เป็นระยะระหว่างเซิร์ฟเวอร์เปิดค้างไว้ ─────────
# ทุก 10 นาที: ถ้า GitHub มีของใหม่ → ดึงมา (Next dev โหลดไฟล์ที่เปลี่ยนเอง ไม่ต้องรีสตาร์ท)
# ถ้า dependency เปลี่ยน → npm install แล้ววางไฟล์สัญญาณ + ปิดเซิร์ฟเวอร์ ให้ลูปด้านล่างสตาร์ทใหม่
UPDATE_EVERY="${UPDATE_EVERY:-600}"
RESTART_MARK=".restart-for-update"
rm -f "$RESTART_MARK"
UPDATER_PID=""
if [ -z "$NO_UPDATE" ]; then
  (
    while true; do
      sleep "$UPDATE_EVERY"
      # เงียบตอนไม่มีอะไรใหม่ — พิมพ์เฉพาะตอนมีผล ไม่ให้ log เซิร์ฟเวอร์รก
      OUT=$(pull_latest 2>&1)
      case "$OUT" in
        *"อัปเดตโค้ดแล้ว"*)
          echo ""
          echo "🔄 [$(date '+%H:%M')] $OUT"
          if git diff --name-only "HEAD@{1}" HEAD 2>/dev/null | grep -qE '^(package\.json|package-lock\.json)$'; then
            echo "📦 dependency เปลี่ยน — กำลังติดตั้ง แล้วจะรีสตาร์ทเซิร์ฟเวอร์ให้เอง..."
            if npm install >/dev/null 2>&1; then
              touch "$RESTART_MARK"
              lsof -ti TCP:"$PORT" -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null
            else
              echo "❌ npm install ไม่สำเร็จ — ปิดหน้าต่างนี้แล้วเปิด start.command ใหม่เพื่อดู error"
            fi
          else
            echo "   (เว็บโหลดของใหม่ให้เอง — รีเฟรชหน้าเบราว์เซอร์ถ้ายังเห็นของเก่า)"
          fi
          ;;
      esac
    done
  ) &
  UPDATER_PID=$!
fi
cleanup_updater() { [ -n "$UPDATER_PID" ] && kill "$UPDATER_PID" 2>/dev/null; rm -f "$RESTART_MARK"; }
trap cleanup_updater EXIT

# สตาร์ท Next.js dev server · ถ้าดับเองแบบไม่ได้ตั้งใจ ให้สตาร์ทใหม่ (กัน crash loop ที่ 5 ครั้ง)
RESTARTS=0
MAX_RESTARTS=5
while true; do
  "${RUNNER[@]}" npm run dev -- --port "$PORT"
  CODE=$?

  # ตัวอัปเดตสั่งปิดเพื่อรีสตาร์ทหลังติดตั้ง dependency → สตาร์ทใหม่ทันที ไม่นับเป็นดับเอง
  if [ -f "$RESTART_MARK" ]; then
    rm -f "$RESTART_MARK"
    echo ""
    echo "🔄 รีสตาร์ทเซิร์ฟเวอร์หลังอัปเดต dependency..."
    sleep 1
    continue
  fi

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
