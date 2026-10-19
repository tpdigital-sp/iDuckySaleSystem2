"""
illustrator.py — ให้ Adobe Illustrator ในเครื่อง (macOS / Windows) แปลงไฟล์เป็น .ai แท้ที่แยกเลเยอร์

ขั้นตอน: แอพสร้างไฟล์ .ai (PDF) ไว้ในโฟลเดอร์ชั่วคราว -> สั่ง Illustrator รันสคริปต์ .jsx
         ให้เปิด ย้ายเส้น CutContour ไปเลเยอร์ของตัวเอง แล้ว Save As เป็น Illustrator แท้
  · macOS   = AppleScript (osascript · do javascript)
  · Windows = PowerShell + COM (Illustrator.Application · DoJavaScriptFile) — ไม่ต้องลงไลบรารีเพิ่ม
    (เครื่องกราฟฟิกเป็น Windows · เจ้าของร้านสั่ง 19 ต.ค. 69 "ขอไฟล์ python เพื่อให้พนักงานกราฟฟิกรันได้")
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from contextlib import contextmanager
from pathlib import Path

BUNDLE_ID = "com.adobe.illustrator"
_LOCK = threading.Lock()  # Illustrator ทำงานทีละงาน


def _rm_later(d: Path, tries: int = 20, gap: float = 3.0) -> None:
    """ลบโฟลเดอร์งานเบื้องหลัง — Windows: Illustrator ยังจับไฟล์ไว้สักพักหลังปิดเอกสาร ลองซ้ำจนลบได้"""
    def run():
        for _ in range(tries):
            shutil.rmtree(d, ignore_errors=True)
            if not d.exists():
                return
            time.sleep(gap)
    threading.Thread(target=run, daemon=True).start()


@contextmanager
def _workdir(prefix: str):
    """
    โฟลเดอร์ชั่วคราวของงาน Illustrator — ลบไม่ได้ต้องไม่ทำให้งานพัง (19 ต.ค. 69)
    เดิมใช้ tempfile.TemporaryDirectory: บน Windows ตอนออกจาก with ลบโฟลเดอร์ทันที แต่ Illustrator ยังจับไฟล์อยู่
    → [WinError 32] "being used by another process" โยนทับผลสำเร็จ → .ai แยกเลเยอร์ที่ทำเสร็จแล้วถูกทิ้ง เว็บได้ไฟล์สำรอง Layer 1
    (เครื่องกราฟฟิก champ: Illustrator ขึ้นเลเยอร์ครบแล้วปิด แต่ไฟล์ที่โหลดเปิดแล้วมี Layer 1 เดียว)
    """
    d = Path(tempfile.mkdtemp(prefix=prefix))
    try:
        yield d
    finally:
        shutil.rmtree(d, ignore_errors=True)
        if d.exists():
            _rm_later(d)


def _sweep_old_workdirs(max_age_h: float = 24) -> None:
    """โฟลเดอร์งานเก่าที่ค้าง (ลบไม่ทันตอนนั้น/โปรแกรมปิดไปก่อน) — กวาดตอนเปิดโปรแกรม"""
    try:
        root = Path(tempfile.gettempdir())
        cut = time.time() - max_age_h * 3600
        for d in list(root.glob("calai_*")) + list(root.glob("cutlayer_*")):
            try:
                if d.is_dir() and d.stat().st_mtime < cut:
                    shutil.rmtree(d, ignore_errors=True)
            except OSError:
                pass
    except Exception:
        pass


_sweep_old_workdirs()
_AVAILABLE: bool | None = None

JSX_CORE = r"""
// แยกเลเยอร์ตามชื่อสีพิเศษ: Cut100 / Cut50 (เส้นตัด), White (รองขาว), ที่เหลือ = Artwork
var SPOT_LAYERS = ["Cut100", "Cut50", "White"], ART_LAYER = "Artwork";
function spotName(c){ try{ if(c && c.typename==="SpotColor"){ var n=c.spot.name;
  if(/cutcontour/i.test(n)) return "Cut100";
  for(var i=0;i<SPOT_LAYERS.length;i++){ if(n.toLowerCase()===SPOT_LAYERS[i].toLowerCase()) return SPOT_LAYERS[i]; } } }catch(e){} return null; }
function itemSpot(p){ try{ return (p.stroked && spotName(p.strokeColor)) || (p.filled && spotName(p.fillColor)) || null; }catch(e){ return null; } }
function getLayer(doc,name){ for(var i=0;i<doc.layers.length;i++){ if(doc.layers[i].name===name) return doc.layers[i]; }
  var l=doc.layers.add(); l.name=name; return l; }
function ungroupAll(container,target){
  var changed=true, guard=0;
  while(changed && guard<50){ changed=false; guard++;
    for(var i=container.groupItems.length-1;i>=0;i--){
      var g=container.groupItems[i]; if(g.parent!==container) continue;
      if(g.clipped){
        for(var k=g.pathItems.length-1;k>=0;k--){ if(g.pathItems[k].clipping){ try{ g.pathItems[k].remove(); }catch(e){} } }
        for(var k2=g.compoundPathItems.length-1;k2>=0;k2--){ try{ var cp=g.compoundPathItems[k2];
          if(cp.pathItems.length && cp.pathItems[0].clipping) cp.remove(); }catch(e){} }
        try{ g.clipped=false; }catch(e){}
      }
      for(var j=g.pageItems.length-1;j>=0;j--){ g.pageItems[j].move(target, ElementPlacement.PLACEATBEGINNING); }
      try{ g.remove(); }catch(e){}
      changed=true;
    }
  }
}
function processDoc(doc){
  var art=getLayer(doc,ART_LAYER);
  for(var i=doc.layers.length-1;i>=0;i--){ var L=doc.layers[i];
    if(L===art) continue;
    var keep=false; for(var s=0;s<SPOT_LAYERS.length;s++){ if(L.name===SPOT_LAYERS[s]) keep=true; }
    L.locked=false; L.visible=true;
    if(keep) continue;
    for(var j=L.pageItems.length-1;j>=0;j--){ L.pageItems[j].move(art, ElementPlacement.PLACEATBEGINNING); }
    try{ L.remove(); }catch(e){}
  }
  art.locked=false; ungroupAll(art,art);
  var list=[], n, sp;
  for(n=0;n<art.compoundPathItems.length;n++){ var cp=art.compoundPathItems[n];
    if(cp.pathItems.length && (sp=itemSpot(cp.pathItems[0]))) list.push([cp, sp]); }
  for(n=0;n<art.pathItems.length;n++){ var p=art.pathItems[n];
    if(p.parent.typename!=="CompoundPathItem" && (sp=itemSpot(p))) list.push([p, sp]); }
  var used={};
  for(n=0;n<list.length;n++){ var L2=getLayer(doc,list[n][1]); list[n][0].move(L2, ElementPlacement.PLACEATBEGINNING); used[list[n][1]]=L2; }
  // ลำดับเลเยอร์: White ล่างสุด, Artwork, แล้วเส้นตัดไว้บนสุด
  if(used["White"]) used["White"].zOrder(ZOrderMethod.SENDTOBACK);
  if(used["Cut50"]) used["Cut50"].zOrder(ZOrderMethod.BRINGTOFRONT);
  if(used["Cut100"]) used["Cut100"].zOrder(ZOrderMethod.BRINGTOFRONT);
  for(var key in used){ if(key!=="White") used[key].locked=true; }
  return list.length;
}
"""

JSX_BATCH = r"""
(function(){
  var jobs = __JOBS__, out = [];
  var old = app.userInteractionLevel;
  app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
  for(var i=0;i<jobs.length;i++){
    try{
      var doc = app.open(new File(jobs[i][0]));
      var m = processDoc(doc);
      var o = new IllustratorSaveOptions(); o.pdfCompatible = true;
      doc.saveAs(new File(jobs[i][1]), o);
      doc.close(SaveOptions.DONOTSAVECHANGES);
      out.push("OK:" + m);
    }catch(e){
      out.push("ERR:" + e.message);
      try{ app.activeDocument.close(SaveOptions.DONOTSAVECHANGES); }catch(e2){}
    }
  }
  app.userInteractionLevel = old;
  return out.join("\n");
})();
"""


WIN_PROGID = "Illustrator.Application"  # COM ที่ Illustrator ลงทะเบียนไว้ตอนติดตั้ง (ทุกรุ่น CS–2025)

# PowerShell สั่ง Illustrator ผ่าน COM แล้วพิมพ์ผลของสคริปต์ออกมาเป็น UTF-8 (ข้อความผิดพลาดมีภาษาไทย)
PS_RUN = r"""
param([string]$jsx)
$ErrorActionPreference = 'Stop'
# UTF-8 แบบไม่มี BOM — [System.Text.Encoding]::UTF8 ของ PowerShell 5 แปะ BOM หน้าข้อความ → Python อ่าน "OK" ไม่ออก
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
try {
  $app = New-Object -ComObject Illustrator.Application
} catch {
  [Console]::Error.WriteLine("NOCOM: " + $_.Exception.Message); exit 3
}
try {
  $r = $app.DoJavaScriptFile($jsx)
  [Console]::Out.Write([string]$r)
} catch {
  [Console]::Error.WriteLine("JSX: " + $_.Exception.Message); exit 4
}
"""


def _powershell() -> str | None:
    """PowerShell ของเครื่อง — หาด้วย path เต็มก่อน (บางเครื่อง PATH เสีย: 'powershell' is not recognized · 19 ต.ค. 69)"""
    import os
    full = Path(os.environ.get("SystemRoot", r"C:\Windows")) / "System32" / "WindowsPowerShell" / "v1.0" / "powershell.exe"
    return str(full) if full.exists() else (shutil.which("powershell") or shutil.which("pwsh"))


def _win_has_illustrator() -> bool:
    """Windows: มี COM ของ Illustrator ลงทะเบียนไว้ไหม (อ่าน registry เฉย ๆ ไม่เปิดโปรแกรม)"""
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CLASSES_ROOT, WIN_PROGID):
            return True
    except Exception:
        return False


def available() -> bool:
    """มี Illustrator ในเครื่องนี้ไหม (เช็กครั้งเดียว ไม่เปิดโปรแกรม)"""
    global _AVAILABLE
    if _AVAILABLE is None:
        if sys.platform == "win32":
            _AVAILABLE = _win_has_illustrator() and bool(_powershell())
        elif sys.platform != "darwin" or not shutil.which("osascript"):
            _AVAILABLE = False
        else:
            try:
                r = subprocess.run(["mdfind", f"kMDItemCFBundleIdentifier == '{BUNDLE_ID}'"],
                                   capture_output=True, text=True, timeout=10)
                _AVAILABLE = bool(r.stdout.strip())
            except Exception:
                _AVAILABLE = False
    return _AVAILABLE


def _run_jsx(tmp: Path, jsx: str, timeout: int) -> str:
    """ให้ Illustrator รันสคริปต์ .jsx แล้วคืนค่าที่สคริปต์ return (ข้อความ) · พัง = RuntimeError ภาษาไทย"""
    if sys.platform == "win32":
        # ExtendScript อ่านไฟล์ UTF-8 ที่มี BOM ถูก (ชื่อเลเยอร์/อาร์ตบอร์ดเป็นภาษาไทย) · ไม่มี BOM = อ่านเป็นภาษาเครื่อง ชื่อเพี้ยน
        jsx_path = tmp / "run.jsx"
        jsx_path.write_text(jsx, encoding="utf-8-sig")
        ps1 = tmp / "run.ps1"
        ps1.write_text(PS_RUN, encoding="utf-8-sig")
        exe = _powershell()
        try:
            r = subprocess.run([exe, "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
                                "-File", str(ps1), "-jsx", str(jsx_path)],
                               capture_output=True, timeout=timeout + 30,
                               creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        except subprocess.TimeoutExpired:
            raise RuntimeError(f"Illustrator ทำงานนานเกิน {timeout} วินาที — ดูว่ามีกล่องถามค้างในหน้าต่าง Illustrator ไหม")
        # ⚠️ ตัด BOM (\ufeff) ทิ้งเสมอ — str.strip() ไม่ตัดให้ (19 ต.ค. 69 เครื่องกราฟฟิก: Illustrator ทำไฟล์แยกเลเยอร์สำเร็จ
        #    แต่ได้ "\ufeffOK" → เช็ค startswith("OK") ไม่ผ่าน → แจ้ง "สร้างไฟล์ไม่ได้" → เว็บถอยไปไฟล์สำรอง -pdf.ai Layer 1)
        out = r.stdout.decode("utf-8-sig", "replace").replace("\ufeff", "").strip()
        err = r.stderr.decode("utf-8-sig", "replace").replace("\ufeff", "").strip()
        if r.returncode == 3 or "NOCOM" in err:
            raise RuntimeError("เปิด Adobe Illustrator ผ่าน COM ไม่ได้ — เปิด Illustrator ด้วยมือ 1 ครั้งให้โหลดเสร็จ "
                               f"แล้วลองใหม่ (ถ้ายังไม่ได้ ให้ติดตั้ง/ซ่อม Illustrator) · {err[:200]}")
        if r.returncode != 0:
            raise RuntimeError(f"สั่ง Illustrator ไม่สำเร็จ: {(err or out)[:300]}")
        return out
    (tmp / "run.jsx").write_text(jsx, encoding="utf-8")
    scpt = (f'with timeout of {timeout} seconds\n'
            f'  tell application id "{BUNDLE_ID}"\n'
            f'    do javascript (read POSIX file "{tmp / "run.jsx"}" as «class utf8»)\n'
            f'  end tell\n'
            f'end timeout\n')
    (tmp / "run.applescript").write_text(scpt, encoding="utf-8")
    r = subprocess.run(["osascript", str(tmp / "run.applescript")],
                       capture_output=True, text=True, timeout=timeout + 30)
    if r.returncode != 0:
        err = r.stderr.strip()
        if "-1743" in err or "Not authorized" in err:
            raise RuntimeError("macOS ยังไม่อนุญาตให้ควบคุม Illustrator: ไปที่ System Settings > "
                               "Privacy & Security > Automation แล้วเปิดสิทธิ์ Terminal → Adobe Illustrator")
        raise RuntimeError(f"สั่ง Illustrator ไม่สำเร็จ: {err[:300]}")
    return r.stdout


def layered(ai_files: list[bytes], timeout: int = 600) -> list[bytes]:
    """รับไฟล์ .ai (PDF) หลายไฟล์ คืนไฟล์ .ai แท้ที่แยกเลเยอร์แล้ว ลำดับเดียวกัน"""
    if not available():
        raise RuntimeError("ไม่พบ Adobe Illustrator ในเครื่องนี้")
    with _LOCK, _workdir("cutlayer_") as tmp:
        tmp = Path(tmp)
        jobs = []
        for i, data in enumerate(ai_files):
            src, dst = tmp / f"in_{i}.ai", tmp / f"out_{i}.ai"
            src.write_bytes(data)
            jobs.append([str(src), str(dst)])
        jsx = JSX_CORE + JSX_BATCH.replace("__JOBS__", json.dumps(jobs))
        res = _run_jsx(tmp, jsx, timeout).replace("\ufeff", "")
        lines = [l.strip() for l in res.strip().splitlines() if l.strip()]
        out = []
        for i, (src, dst) in enumerate(jobs):
            st = lines[i] if i < len(lines) else "ERR:ไม่มีผลลัพธ์"
            if not st.startswith("OK") or not Path(dst).exists():
                raise RuntimeError(f"Illustrator แปลงไฟล์ที่ {i + 1} ไม่ได้: {st[4:]}")
            out.append(Path(dst).read_bytes())
        return out


# ───────────────────────── ปฏิทินจากจอสร้างปฏิทินบนเว็บ ─────────────────────────
# เว็บวาดแต่ละชั้นเป็น PNG พื้นใสมาให้ (เรียงล่าง → บน ตามที่ลูกค้าจัด) → สร้างเอกสารใหม่
# วางทีละชั้นลงเลเยอร์ชื่อเดียวกับหน้าจอ · พื้นหลังเป็นสี่เหลี่ยมเวกเตอร์ · เส้นตัด CutContour บนสุด (ล็อก)
# หลายหน้า/หลายใบ = หลายอาร์ตบอร์ดเรียงซ้าย→ขวา แต่ละใบเป็นเลเยอร์แม่ มีเลเยอร์ลูกตามลำดับ
JSX_CALENDAR = r"""
(function(){
  var job = __JOB__, PT = 72/25.4, GAP = 10*PT;
  var old = app.userInteractionLevel;
  app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
  var doc = null;
  try{
    var p0 = job.pages[0];
    doc = app.documents.add(DocumentColorSpace.RGB, p0.wMm*PT, p0.hMm*PT);
    var base = doc.layers[0], R0 = doc.artboards[0].artboardRect, left0 = R0[0], top0 = R0[1];
    // อาร์ตบอร์ดเรียงเป็นตาราง 4 ต่อแถว — เรียงแถวเดียวยาว 16 หน้าเกินขอบผืนงาน Illustrator (~±8,000 pt) → error CoOA ที่ artboards.add (14 ต.ค. 69)
    var COLS = 4, CW = 0, CH = 0;
    for(var k=0;k<job.pages.length;k++){ CW = Math.max(CW, job.pages[k].wMm*PT); CH = Math.max(CH, job.pages[k].hMm*PT); }
    var spots = {};
    function spotColor(name, cmyk){
      if(!spots[name]){
        try{ spots[name] = doc.spots.getByName(name); }catch(e){
          var sp = doc.spots.add(); sp.name = name;
          var c = new CMYKColor(); c.cyan=cmyk[0]; c.magenta=cmyk[1]; c.yellow=cmyk[2]; c.black=cmyk[3];
          sp.color = c; sp.colorType = ColorModel.SPOT; spots[name] = sp;
        }
      }
      var sc = new SpotColor(); sc.spot = spots[name]; sc.tint = 100; return sc;
    }
    function cutColor(){ return spotColor("CutContour", [0,100,0,0]); }
    // ✂️ เส้นโค้งเบซิเยร์ (มม.) → path ใน Illustrator · หลายเส้น = compound path (รูกลางงานเจาะทะลุ)
    function addCurves(ly, curves, L, T, style){
      var host = curves.length > 1 ? ly.compoundPathItems.add() : ly;
      var X = function(v){ return L + v*PT; }, Y = function(v){ return T - v*PT; };
      for(var q=0;q<curves.length;q++){
        var cv = curves[q], g = cv.g, n = g.length, pth = host.pathItems.add(), open = !!cv.open, m = open ? n + 1 : n;
        for(var a=0;a<m;a++){
          var an = a===0 ? cv.s : [g[a-1][4], g[a-1][5]];
          var pp = pth.pathPoints.add();
          pp.anchor = [X(an[0]), Y(an[1])];
          if(open){
            // เส้นเปิด (รอยกรีดปลอกแก้ว): จุดแรก/สุดท้ายไม่มีมือจับฝั่งที่ไม่มีท่อน
            pp.leftDirection = a > 0 ? [X(g[a-1][2]), Y(g[a-1][3])] : pp.anchor;
            pp.rightDirection = a < n ? [X(g[a][0]), Y(g[a][1])] : pp.anchor;
          } else {
            var prev = g[(a-1+n)%n], nx = g[a];
            pp.leftDirection = [X(prev[2]), Y(prev[3])];
            pp.rightDirection = [X(nx[0]), Y(nx[1])];
          }
          pp.pointType = PointType.CORNER;
        }
        pth.closed = !open; style(pth);
      }
    }
    for(var i=0;i<job.pages.length;i++){
      var pg = job.pages[i], W = pg.wMm*PT, H = pg.hMm*PT, L = left0 + (i%COLS)*(CW+GAP), T = top0 - Math.floor(i/COLS)*(CH+GAP);
      if(i>0) doc.artboards.add([L, T, L+W, T-H]);
      doc.artboards[i].name = pg.name;
      var parent = null;
      if(job.pages.length>1){ parent = doc.layers.add(); parent.name = pg.name; }
      var addLayer = function(name){ var ly = parent ? parent.layers.add() : doc.layers.add(); ly.name = name; return ly; };
      // ✂️ งานไดคัท: พื้นใส (bg null) — รองขาว (spot White) อยู่ล่างสุดใต้ลาย
      if(pg.bg){
        var bl = addLayer("พื้นหลัง");
        var rect = bl.pathItems.rectangle(T, L, W, H);
        var col = new RGBColor(); col.red = pg.bg[0]; col.green = pg.bg[1]; col.blue = pg.bg[2];
        rect.stroked = false; rect.filled = true; rect.fillColor = col;
      }
      var under = pg.paths || [], over = [];
      for(var u=0;u<under.length;u++){ if(under[u].fill){ (function(P){
        var wl = addLayer(P.layer), clr = spotColor(P.spot, P.cmyk);
        addCurves(wl, P.curves, L, T, function(x){ x.stroked = false; x.filled = true; x.fillColor = clr; });
      })(under[u]); } else over.push(under[u]); }
      for(var j=0;j<pg.layers.length;j++){
        var it = pg.layers[j], ly = addLayer(it.name), pi = ly.placedItems.add();
        pi.file = new File(it.path);
        pi.width = it.w*PT; pi.height = it.h*PT;
        pi.position = [L + it.x*PT, T - it.y*PT];
        pi.embed();
      }
      var c = pg.cut;
      if(c){
        var cl = addLayer("เส้นตัด (CutContour)");
        var path = c.r > 0 ? cl.pathItems.roundedRectangle(T - c.y*PT, L + c.x*PT, c.w*PT, c.h*PT, c.r*PT, c.r*PT)
                           : cl.pathItems.rectangle(T - c.y*PT, L + c.x*PT, c.w*PT, c.h*PT);
        path.filled = false; path.stroked = true; path.strokeWidth = 0.25; path.strokeColor = cutColor();
        cl.locked = true;
      }
      // ✂️ เส้นตัดตามรูป (spot Cut100/Cut50) + รูห่วง — บนสุด ล็อก
      for(var o2=0;o2<over.length;o2++){ (function(P){
        var ol = addLayer(P.layer), clr = spotColor(P.spot, P.cmyk);
        addCurves(ol, P.curves, L, T, function(x){ x.filled = false; x.stroked = true; x.strokeWidth = 0.25; x.strokeColor = clr; });
        if(P.circles){ for(var z=0;z<P.circles.length;z++){ var cc = P.circles[z];
          var e = ol.pathItems.ellipse(T - (cc[1]-cc[2])*PT, L + (cc[0]-cc[2])*PT, cc[2]*2*PT, cc[2]*2*PT);
          e.filled = false; e.stroked = true; e.strokeWidth = 0.25; e.strokeColor = clr; } }
        ol.locked = true;
      })(over[o2]); }
    }
    if(base.pageItems.length===0 && base.layers.length===0 && doc.layers.length>1) base.remove();
    var o = new IllustratorSaveOptions(); o.pdfCompatible = true;
    doc.saveAs(new File(job.out), o);
    doc.close(SaveOptions.DONOTSAVECHANGES);
    app.userInteractionLevel = old;
    return "OK";
  }catch(e){
    app.userInteractionLevel = old;
    try{ if(doc) doc.close(SaveOptions.DONOTSAVECHANGES); }catch(e2){}
    return "ERR:" + e.message + " (line " + e.line + ")";
  }
})();
"""


def _hex_rgb(h: str) -> list:
    h = (h or "#ffffff").lstrip("#")
    if len(h) != 6:
        h = "ffffff"
    return [int(h[i:i + 2], 16) for i in (0, 2, 4)]


def calendar_ai(job: dict, timeout: int = 600) -> bytes:
    """job = {title, pages:[{name, wMm, hMm, bg, cut:{x,y,w,h,r}, layers:[{name, png(base64), x,y,w,h}]}]} -> .ai แท้"""
    import base64
    if not available():
        raise RuntimeError("ไม่พบ Adobe Illustrator ในเครื่องนี้")
    pages = job.get("pages") or []
    if not pages:
        raise RuntimeError("ไม่มีหน้าให้สร้าง")
    with _LOCK, _workdir("calai_") as tmp:
        tmp = Path(tmp)
        jpages = []
        for i, pg in enumerate(pages):
            layers = []
            for j, ly in enumerate(pg.get("layers") or []):
                raw = base64.b64decode(ly["png"])
                # ชั้นทึบ (รูปถ่าย) เว็บส่งมาเป็น JPEG ในช่อง png — ตั้งนามสกุลตามไฟล์จริง ไม่งั้น Illustrator วางไม่ได้
                ext = "jpg" if raw[:2] == b"\xff\xd8" else "png"
                f = tmp / f"p{i}_l{j}.{ext}"
                f.write_bytes(raw)
                layers.append({"name": str(ly.get("name") or f"ชั้น {j + 1}"), "path": str(f),
                               "x": float(ly["x"]), "y": float(ly["y"]), "w": float(ly["w"]), "h": float(ly["h"])})
            cut = pg.get("cut")
            # ✂️ งานไดคัท: เส้นตัด/รองขาวเป็นเส้นโค้งเวกเตอร์ (paths) · พื้นใส (bg "none") · ไม่มีเส้นตัดสี่เหลี่ยม (cut null)
            paths = []
            for pth in pg.get("paths") or []:
                paths.append({"layer": str(pth.get("layer") or "เส้นตัด"), "spot": str(pth.get("spot") or "CutContour"),
                              "cmyk": [float(v) for v in (pth.get("cmyk") or [0, 100, 0, 0])][:4],
                              "fill": bool(pth.get("fill")), "curves": pth.get("curves") or [],
                              "circles": pth.get("circles") or []})
            bg = pg.get("bg")
            jpages.append({"name": str(pg.get("name") or f"หน้า {i + 1}"), "wMm": float(pg["wMm"]), "hMm": float(pg["hMm"]),
                           "bg": None if bg in (None, "", "none", "transparent") else _hex_rgb(bg), "layers": layers,
                           "cut": {k: float(cut.get(k, 0)) for k in ("x", "y", "w", "h", "r")} if cut else None,
                           "paths": paths})
        out = tmp / "calendar.ai"
        jsx = JSX_CALENDAR.replace("__JOB__", json.dumps({"pages": jpages, "out": str(out)}, ensure_ascii=False))
        st = _run_jsx(tmp, jsx, timeout).replace("\ufeff", "").strip()
        # ไฟล์ออกมาจริง + ไม่ได้รายงาน ERR = สำเร็จ (กันข้อความตอบกลับเพี้ยนจากตัวกลางอีกชั้น)
        ok = st.startswith("OK") or (out.exists() and out.stat().st_size > 0 and not st.startswith("ERR"))
        if not ok or not out.exists():
            # บอกให้ครบ: Illustrator ตอบอะไรมาจริง (repr เห็นอักขระแปลก ๆ) + ไฟล์ออกมาไหม — ไล่ปัญหาเครื่อง Windows จากข้อความนี้ (เว็บส่งเข้า calendar-ai-log)
            got = st[4:] if st.startswith("ERR") else f"ผลตอบกลับ {st[:300]!r}"
            raise RuntimeError(f"Illustrator สร้างไฟล์ไม่ได้: {got} · ไฟล์ออก={'มี ' + str(out.stat().st_size) + ' ไบต์' if out.exists() else 'ไม่มี'} · {out}")
        return out.read_bytes()
