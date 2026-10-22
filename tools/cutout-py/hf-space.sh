#!/bin/bash
# 🐳 เตรียม/อัปโหลดโปรแกรมตัดพื้นหลังขึ้น Hugging Face Space (22 ต.ค. 69)
#   ./hf-space.sh                       → สร้างโฟลเดอร์ ~/Desktop/iducky-cutout-space ไว้ลากขึ้นหน้าเว็บ Hugging Face
#   ./hf-space.sh ชื่อผู้ใช้/iducky-cutout   → อัปโหลดขึ้น Space เลย (ต้อง hf auth login ก่อน)
# ไม่ส่ง config.json (มีคีย์ API) · .venv · ไฟล์ Windows/Mac launcher
set -e
cd "$(dirname "$0")"
OUT="$HOME/Desktop/iducky-cutout-space"
rm -rf "$OUT" && mkdir -p "$OUT/web"
cp app.py cutout.py engine.py illustrator.py products.py review.py requirements-windows.txt Dockerfile .dockerignore "$OUT/"
cp web/index.html "$OUT/web/"
[ -f products.json ] && cp products.json "$OUT/"   # สูตรสินค้าที่ปรับไว้บนเครื่องร้าน → ค่าเริ่มต้นบนเซิร์ฟเวอร์
cat > "$OUT/README.md" <<'MD'
---
title: iDucky Cutout
emoji: ✂️
colorFrom: yellow
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
---

โปรแกรมตัดพื้นหลัง + ทำเส้นไดคัทของร้าน iDucky (tools/cutout-py) · เปิดใช้จากหลังบ้าน เมนูไดคัท > ตัดพื้นหลัง AI

Secrets ที่ต้องตั้ง (Settings > Variables and secrets):
- `CUTOUT_KEY` รหัสเข้าใช้ (ค่าเดียวกับ CUTOUT_SPACE_KEY บน Netlify)
- `ANTHROPIC_API_KEY` (ไม่บังคับ) สำหรับปุ่มให้ AI ตรวจงาน
MD
echo "✓ เตรียมไฟล์ไว้ที่ $OUT"
ls -1 "$OUT" "$OUT/web"
if [ -n "$1" ]; then
  HF="${HF_BIN:-hf}"
  command -v "$HF" >/dev/null || { echo "ยังไม่มีคำสั่ง hf — ติดตั้ง: pip install -U huggingface_hub"; exit 1; }
  "$HF" upload "$1" "$OUT" . --repo-type space --commit-message "อัปเดตโปรแกรมตัดพื้นหลัง"
  echo "✓ อัปโหลดแล้ว: https://huggingface.co/spaces/$1"
fi
