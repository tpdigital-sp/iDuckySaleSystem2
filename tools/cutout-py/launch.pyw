"""
launch.pyw — เปิด cutout-py แบบไม่มีหน้าต่าง (Windows · pythonw.exe) · 19 ต.ค. 69

ใช้โดย 2 ทาง (start.bat ลงทะเบียนให้ตอนติดตั้ง · setup-windows.ps1):
  1) เปิดเองตอนเปิดเครื่อง — ช็อตคัตในโฟลเดอร์ Startup
  2) เว็บสั่งเปิด — ลิงก์ iducky-cutout: (จอออกแบบกดใช้แบบ/บันทึก หรือปุ่ม ▶ เปิดโปรแกรม ตอน 🔁 เจอโปรแกรมปิดอยู่)
pythonw ไม่มี stdout/stderr (print/แถบดาวน์โหลดโมเดลพังได้) → เขียนลง cutout-py.log ในโฟลเดอร์นี้แทน
เปิดอยู่แล้ว = app.py เจอพอร์ตไม่ว่างแล้วปิดตัวเอง (ไม่เปิดซ้อน)
"""
import os
import runpy
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
os.chdir(HERE)
sys.path.insert(0, str(HERE))

LOG = HERE / "cutout-py.log"
try:
    if LOG.exists() and LOG.stat().st_size > 5 * 1024 * 1024:  # เก็บไม่เกิน ~5 MB
        LOG.replace(HERE / "cutout-py.old.log")
except OSError:
    pass
log = open(LOG, "a", encoding="utf-8", buffering=1)
sys.stdout = sys.stderr = log
print("\n===== เปิดโปรแกรม (launch.pyw) =====", flush=True)

sys.argv = [str(HERE / "app.py"), "--no-browser"]
try:
    runpy.run_path(str(HERE / "app.py"), run_name="__main__")
except SystemExit:
    pass
except BaseException:
    import traceback

    traceback.print_exc()
