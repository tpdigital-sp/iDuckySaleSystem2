#!/bin/bash
# ดับเบิลคลิกเพื่อเปิดเซิร์ฟเวอร์ตัดพื้นหลัง (ใช้ในหลังบ้าน /admin/diecut แท็บ "ตัดพื้นหลัง AI")
# ครั้งแรก: ติดตั้งไลบรารี + โหลดโมเดล BiRefNet (~1 GB) ใช้เวลาหลายนาที
cd "$(dirname "$0")" || exit 1
if [ ! -x .venv/bin/python ]; then
  echo "ติดตั้งครั้งแรก…"
  /usr/bin/python3 -m venv .venv || exit 1
  .venv/bin/pip install --upgrade pip
  .venv/bin/pip install -r requirements.txt || { echo "ติดตั้งไม่สำเร็จ"; read -r; exit 1; }
fi
# ไลบรารีที่เพิ่มทีหลัง (เช่น pymupdf อ่านไฟล์ .ai/.pdf) — เครื่องที่ติดตั้งไว้ก่อนแล้วให้ลงเพิ่มเอง
.venv/bin/python -c "import fitz" 2>/dev/null || .venv/bin/pip install -r requirements.txt
exec .venv/bin/python app.py --no-browser "$@"
