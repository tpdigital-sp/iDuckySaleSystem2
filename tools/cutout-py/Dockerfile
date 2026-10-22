# 🐳 cutout-py ในคอนเทนเนอร์ — รันบนเซิร์ฟเวอร์ (Hugging Face Spaces / VPS) แทนการติดตั้ง Python บนเครื่องพนักงาน (22 ต.ค. 69)
# ทดสอบบน Mac:  docker build -t cutout-py . && docker run --rm -p 7860:7860 cutout-py  → http://localhost:7860
# ส่วน Illustrator (.ai แยกเลเยอร์ /calendar-ai) ใช้ไม่ได้ในคอนเทนเนอร์ — illustrator.available() คืน False เอง
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 U2NET_HOME=/models
RUN apt-get update && apt-get install -y --no-install-recommends libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -m -u 1000 user

WORKDIR /app
# เวอร์ชันที่ทดสอบแล้วบน Mac ร้าน (ไฟล์ชื่อ windows แต่ใช้ได้ทุกระบบ)
COPY requirements-windows.txt .
RUN pip install -r requirements-windows.txt

# ฝังโมเดล AI ตัดพื้นหลังเริ่มต้น (~1 GB) ลงในอิมเมจ — เปิดเครื่องแล้วไม่ต้องดาวน์โหลดใหม่ทุกครั้ง
RUN mkdir -p /models \
    && python -c "from rembg import new_session; new_session('birefnet-general', providers=['CPUExecutionProvider'])" \
    && chown -R user /models

COPY --chown=user . .
RUN chown user /app
USER user

# Hugging Face Spaces ใช้พอร์ต 7860 · --share = รับจากนอกคอนเทนเนอร์ (0.0.0.0)
EXPOSE 7860
CMD ["python", "app.py", "--share", "--no-browser", "--port", "7860"]
