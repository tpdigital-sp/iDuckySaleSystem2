#!/bin/bash
# ─────────────────────────────────────────────────────────────
# iDucky Prints Studio — ดับเบิลคลิกเพื่อ "ดึงโค้ดใหม่ล่าสุด" แล้วเปิดเว็บ
#
# ทำให้ 4 อย่างตามลำดับ แล้วส่งต่อให้ start.command เปิดเว็บ:
#   1. ถ้ามีไฟล์ที่แก้ค้างในเครื่อง → เก็บเข้ากระเป๋า (git stash) ไว้ก่อน ไม่ให้ทับกัน
#   2. สลับมาบรานช์ main (ถ้าเผลออยู่บรานช์อื่น)
#   3. git pull origin main
#   4. ถ้ารายการ dependency เปลี่ยน → npm install ให้เอง
#
# ทำไมต้องมีไฟล์นี้: ตัวเว็บอยู่บนเครื่องนี้ ไม่ได้ดึงโค้ดใหม่เอง
# แก้อะไรบน GitHub แล้วเครื่องนี้จะยังรันของเดิมจนกว่าจะ pull — ไฟล์นี้คือปุ่ม pull นั่นเอง
# ─────────────────────────────────────────────────────────────

cd "$(dirname "$0")" || {
  echo "❌ เข้าโฟลเดอร์โปรเจกต์ไม่ได้"
  read -r -p "กด Enter เพื่อปิดหน้าต่างนี้..." _
  exit 1
}

hold() {
  echo ""
  echo "────────────────────────────────"
  [ -n "$1" ] && echo "$1"
  read -r -p "กด Enter เพื่อปิดหน้าต่างนี้..." _
}

# ใส่ Node ที่ติดตั้งไว้ใน ~/.local เข้า PATH (ชุดเดียวกับ start.command)
NODE_BIN=$(ls -d "$HOME"/.local/node-*/bin 2>/dev/null | head -1)
[ -n "$NODE_BIN" ] && export PATH="$NODE_BIN:$PATH"

echo "🦆 อัปเดตโค้ด iDucky Prints Studio"
echo "────────────────────────────────"

command -v git >/dev/null 2>&1 || { hold "❌ หา git ไม่เจอ"; exit 1; }

BEFORE=$(git rev-parse HEAD 2>/dev/null)

# 1) มีไฟล์ที่แก้ค้างไว้ในเครื่อง → เก็บเข้ากระเป๋าก่อน ไม่งั้น pull ไม่ผ่าน
STASHED=0
if [ -n "$(git status --porcelain)" ]; then
  echo "📦 มีไฟล์ที่แก้ค้างในเครื่อง — เก็บเข้ากระเป๋าไว้ก่อน"
  if git stash push -u -m "ก่อนอัปเดต $(date '+%d/%m %H:%M')" >/dev/null 2>&1; then
    STASHED=1
  else
    hold "❌ เก็บไฟล์ที่แก้ค้างไม่สำเร็จ — หยุดไว้ก่อน ไม่แตะของเดิม"
    exit 1
  fi
fi

# 2) อยู่บรานช์อื่น → กลับมา main
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" != "main" ]; then
  echo "🔀 ตอนนี้อยู่บรานช์ $BRANCH — สลับกลับมา main"
  git checkout main || { hold "❌ สลับมาบรานช์ main ไม่สำเร็จ"; exit 1; }
fi

# 3) ดึงของใหม่
echo "⬇️  กำลังดึงโค้ดล่าสุดจาก GitHub..."
if ! git pull origin main; then
  echo ""
  echo "❌ ดึงโค้ดไม่สำเร็จ — อ่านข้อความด้านบนประกอบ"
  [ "$STASHED" -eq 1 ] && echo "   ไฟล์ที่แก้ค้างยังอยู่ในกระเป๋า เอาคืนด้วย: git stash pop"
  hold ""
  exit 1
fi

AFTER=$(git rev-parse HEAD)

if [ "$BEFORE" = "$AFTER" ]; then
  echo "✓ เป็นเวอร์ชันล่าสุดอยู่แล้ว ไม่มีอะไรใหม่"
else
  echo "✓ อัปเดตแล้ว — ของใหม่รอบนี้:"
  git log --oneline "$BEFORE..$AFTER" | sed 's/^/   · /'
  # 4) รายการ dependency เปลี่ยน → ติดตั้งเพิ่มให้เอง (ไม่งั้นเว็บพังตอนสตาร์ท)
  if git diff --name-only "$BEFORE" "$AFTER" | grep -qE '^(package\.json|package-lock\.json)$'; then
    echo "📦 รายการ dependency เปลี่ยน — กำลังติดตั้งเพิ่ม..."
    npm install || { hold "❌ ติดตั้ง dependencies ไม่สำเร็จ"; exit 1; }
  fi
fi

if [ "$STASHED" -eq 1 ]; then
  echo ""
  echo "📦 ไฟล์ที่แก้ค้างของคุณยังอยู่ในกระเป๋า — เอาคืนได้ด้วยคำสั่ง: git stash pop"
fi

echo "────────────────────────────────"
echo "🚀 กำลังเปิดเว็บ..."
echo ""
exec ./start.command
