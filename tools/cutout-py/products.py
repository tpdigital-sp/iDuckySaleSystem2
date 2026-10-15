"""
products.py — สินค้า = ชุดฟังก์ชันย่อย (โมดูล) + ค่าเริ่มต้น + การแสดงผลของแต่ละช่อง

- FIELDS   : ทุกช่องตั้งค่าที่มีในโปรแกรม (ชื่อ ชนิด หน่วย) แยกตามโมดูล
- MODULES  : ฟังก์ชันย่อยที่สินค้าเลือกใช้ได้ (core = ใช้ทุกสินค้า)
- สินค้าแต่ละตัว: {id, group, name, modules:[...], p:{ค่าเริ่มต้น}, ui:{ช่อง: edit|lock|hide}}
    edit = พนักงานปรับได้ · lock = ใช้ค่าที่ตั้งไว้ ปรับไม่ได้ · hide = ไม่แสดง (ใช้ค่าที่ตั้งไว้)

ทุกอย่างที่แก้จากหน้า "จัดการสินค้า" เก็บใน products.json
(ไฟล์รุ่นเก่า {id: ค่าที่บันทึก} อ่านได้ แปลงเป็น version 2 ตอนบันทึกครั้งถัดไป)

ในระบบ iDucky: หน้า index.html ส่งสูตร (postMessage cutout-products) ให้หลังบ้านเก็บขึ้นเว็บ
→ จอออกแบบพวงกุญแจของลูกค้าใช้ค่าเดียวกัน (ดู syncProducts ใน web/index.html)
"""
from __future__ import annotations

import copy
import json
import re
import time
from pathlib import Path

FILE = Path(__file__).resolve().parent / "products.json"

# ขนาดกระดาษมาตรฐาน (มม.) แนวตั้ง
PAPER = {"A4": (210, 297), "A5": (148, 210), "A6": (105, 148), "A7": (74, 105)}

MODES = ("edit", "lock", "hide")

# ---------------------------------------------------------------------------
# ช่องตั้งค่าทั้งหมด: key -> ข้อมูลช่อง
#   t: num | sel | bool | color | size | edits    (size/edits = ช่องพิเศษในหน้าทำงาน · color = สี #rrggbb)
# ---------------------------------------------------------------------------
F = lambda **kw: kw
FIELDS = {
    # --- core ---
    "method": F(m="core", label="หาขอบงาน", t="sel", opts=[
        ["auto", "อัตโนมัติ"], ["ai", "AI ตัดพื้นหลัง"], ["alpha", "ใช้ขอบโปร่งใสจากไฟล์ (PNG)"],
        ["solid", "ลบสีพื้นเรียบ"], ["none", "ไม่ตัดพื้นหลัง (ใช้ทั้งใบ)"]], d="auto"),
    "size": F(m="core", label="ขนาดชิ้นงาน", t="size", d=None),
    "shape": F(m="core", label="รูปร่าง", t="sel", opts=[
        ["contour", "ตามทรง"], ["rect", "สี่เหลี่ยม"], ["rounded", "สี่เหลี่ยมมุมมน"],
        ["circle", "วงกลม"], ["ellipse", "วงรี"]], d="contour"),
    "radius_mm": F(m="core", label="ความมนของมุม (สี่เหลี่ยมมุมมน)", t="num", unit="มม.", min=0, max=100, step=0.5, d=3),
    "offset_mm": F(m="core", label="ระยะเส้นตัด", t="num", unit="มม.", min=-20, max=50, step=0.1, d=0,
                   hint="ติดลบ = ตัดเข้าเนื้อ · 0 = ชิดขอบ · บวก = เผื่อขอบ"),
    "cut_type": F(m="core", label="ชนิดเส้นตัด", t="sel", opts=[["Cut100", "Cut100 (ตัดขาด)"],
                                                              ["Cut50", "Cut50 (ตัดครึ่ง)"]], d="Cut100"),
    "bridge": F(m="core", label="ถมร่องแคบ", t="num", min=0, max=2.5, step=0.1, d=1, adv=True),
    "edits": F(m="core", label="แก้เฉพาะจุด (＋ มน / − ชิด)", t="edits", d=None, adv=True),
    "holes": F(m="core", label="เว้นรูด้านใน (ไม่ถม)", t="bool", d=False, adv=True),
    "smooth": F(m="core", label="ความโค้งของเส้น", t="num", min=0, max=1.33, step=0.05, d=1, adv=True),
    "shrink": F(m="core", label="หดขอบตัด halo", t="num", unit="px", min=0, max=6, step=1, d=1, adv=True),
    "dpi": F(m="core", label="ความละเอียด (ถ้าไม่กำหนดขนาด)", t="num", unit="dpi", min=150, max=600, step=50, d=300, adv=True),
    # ขอบรอบรูป (Stroke) — มีในหน้าทำงานอยู่แล้ว (12 ต.ค. 69) ใส่ไว้ให้สินค้าตั้งค่าเริ่มต้น/ล็อกได้
    "stroke_mm": F(m="core", label="ขอบรอบรูป (Stroke) หนา", t="num", unit="มม.", min=0, max=50, step=0.1, d=0, adv=True,
                   hint="ขอบสีทึบรอบรูป (เฉพาะรูปร่างตามทรง) · ระยะเส้นตัดนับต่อจากขอบนี้"),
    "stroke": F(m="core", label="สีขอบรอบรูป", t="color", d="#ffffff", adv=True),
    # --- รองขาว ---
    "white": F(m="white", label="รองขาว", t="sel", opts=[["none", "ไม่มี"], ["full", "เต็มรูปทรง"]], d="full"),
    "white_choke_mm": F(m="white", label="หดรองขาวเข้า", t="num", unit="มม.", min=0, max=2, step=0.05, d=0.1),
    # --- รูห่วง ---
    "hole_mm": F(m="hole", label="ขนาดรู (Ø)", t="num", unit="มม.", min=0.5, max=20, step=0.1, d=1.5),
    "ring_mm": F(m="hole", label="เนื้อรอบรู", t="num", unit="มม.", min=0.5, max=20, step=0.1, d=2),
    "hole_gap_mm": F(m="hole", label="ระยะรูห่างจากงาน", t="num", unit="มม.", min=0, max=20, step=0.1, d=1.5),
    "hole_x_mm": F(m="hole", label="เลื่อนรู ซ้าย(−)/ขวา(+)", t="num", unit="มม.", min=-100, max=100, step=0.5, d=0),
    # --- สแตนดี้ ---
    "tab_w_mm": F(m="stand", label="ขาเสียบกว้าง (0 = อัตโนมัติ)", t="num", unit="มม.", min=0, max=200, step=0.5, d=0),
    "tab_h_mm": F(m="stand", label="ขาเสียบยาว", t="num", unit="มม.", min=1, max=50, step=0.5, d=6),
    "base_d_mm": F(m="stand", label="ฐานลึก", t="num", unit="มม.", min=5, max=200, step=1, d=25),
    "thick_mm": F(m="stand", label="ความหนาแผ่น (= ร่อง)", t="num", unit="มม.", min=0.5, max=20, step=0.1, d=3),
    "slot_clear_mm": F(m="stand", label="เผื่อร่องหลวม", t="num", unit="มม.", min=0, max=2, step=0.05, d=0.1),
    # --- กระดาษ ---
    "paper": F(m="paper", label="ขนาดกระดาษ", t="sel",
               opts=[[k, f"{k} ({w}×{h} มม.)"] for k, (w, h) in PAPER.items()] + [["custom", "กำหนดเอง"]], d="A6"),
    "fixed_w_mm": F(m="paper", label="กว้าง (กำหนดเอง)", t="num", unit="มม.", min=10, max=1000, step=1, d=105),
    "fixed_h_mm": F(m="paper", label="สูง (กำหนดเอง)", t="num", unit="มม.", min=10, max=1000, step=1, d=148),
    "bleed_mm": F(m="paper", label="เผื่อตัดตกรอบ (bleed)", t="num", unit="มม.", min=0, max=10, step=0.5, d=1),
    # --- มุมแหลม (เครื่องตัดใบมีดลาก) ---
    "corner_r_mm": F(m="corner", label="มุมโค้งขั้นต่ำ (รัศมี)", t="num", unit="มม.", min=0.1, max=5, step=0.1, d=0.5,
                     hint="ทุกมุมของเส้นตัดจะโค้งอย่างน้อยเท่านี้ ใบมีดเลี้ยวทัน"),
    "corner_trim_mm": F(m="corner", label="ตัดเข้าเนื้อได้ไม่เกิน", t="num", unit="มม.", min=0, max=10, step=0.1, d=1.0,
                        hint="ปลายแหลมที่ต้องตัดลึกกว่านี้ จะเผื่อขอบออกแทน"),
}

MODULES = [
    {"id": "core", "name": "พื้นฐาน", "desc": "หาขอบงาน ขนาด รูปร่าง ระยะเส้นตัด (ทุกสินค้ามี)"},
    {"id": "corner", "name": "แก้มุมแหลม", "desc": "สำหรับเครื่องตัดใบมีดลาก: ทำทุกมุมให้โค้ง ปลายแหลมมากเผื่อขอบให้"},
    {"id": "white", "name": "รองขาว", "desc": "เลเยอร์สีขาวใต้ภาพ (อะคริลิก/วัสดุใส)"},
    {"id": "hole", "name": "รูห่วง", "desc": "ติ่งวงกลมพร้อมรูด้านบน (พวงกุญแจ)"},
    {"id": "stand", "name": "ขาตั้ง + ฐาน", "desc": "ขาเสียบด้านล่าง + ฐานแยกชิ้นมีร่อง (สแตนดี้)"},
    {"id": "paper", "name": "ขนาดกระดาษ", "desc": "ครอปภาพให้พอดีขนาดมาตรฐาน + bleed (การ์ด โปสการ์ด)"},
]
MODULE_IDS = [m["id"] for m in MODULES]
for _m in MODULES:
    _m["fields"] = [k for k, f in FIELDS.items() if f["m"] == _m["id"]]

# ค่ากลางเมื่อสินค้าไม่ได้เลือกโมดูลนั้น (ปิดผลของโมดูล)
OFF = {"white": {"white": "none"}, "paper": {"fixed_w_mm": 0, "fixed_h_mm": 0, "extend": False}}
FLAG = {"hole": "hole", "stand": "stand", "corner": "corner"}   # โมดูลที่เปิดด้วยค่า True/False ในเครื่องคำนวณ


def _p(**kw):
    return kw


DEFAULTS = [
    {"id": "custom", "group": "ทั่วไป", "name": "กำหนดเอง", "modules": ["white"],
     "p": _p(white="none"), "ui": {}},

    {"id": "keychain", "group": "อะคริลิก", "name": "พวงกุญแจอะคริลิก", "modules": ["white", "hole"],
     "p": _p(offset_mm=1.5, white="full", hole_mm=1.5, ring_mm=2.0, hole_gap_mm=1.5, hole_x_mm=0),
     "ui": {"cut_type": "lock"}},
    {"id": "acrylic", "group": "อะคริลิก", "name": "งานอะคริลิกตามทรง (บัคเคิล เขย่า กิ๊บ ฯลฯ)", "modules": ["white"],
     "p": _p(offset_mm=1.5, white="full"), "ui": {"cut_type": "lock"}},
    {"id": "standee", "group": "อะคริลิก", "name": "สแตนดี้อะคริลิก", "modules": ["white", "stand"],
     "p": _p(offset_mm=1.5, white="full", tab_w_mm=0, tab_h_mm=6, base_d_mm=25, thick_mm=3, slot_clear_mm=0.1),
     "ui": {"cut_type": "lock", "thick_mm": "lock"}},

    {"id": "sticker100", "group": "สติกเกอร์", "name": "สติกเกอร์ไดคัท 100 (ตัดเป็นตัว)", "modules": ["corner"],
     "p": _p(offset_mm=0, corner_r_mm=0.5, corner_trim_mm=1.0), "ui": {"cut_type": "lock"}},

    {"id": "paper", "group": "กระดาษ", "name": "การ์ด / โปสการ์ด / งานกระดาษ", "modules": ["paper"],
     "p": _p(method="none", shape="rounded", radius_mm=3, offset_mm=-1.5, paper="A6", fixed_w_mm=105, fixed_h_mm=148,
             bleed_mm=1),
     "ui": {"method": "hide", "size": "hide", "edits": "hide", "bridge": "hide", "holes": "hide"}},
]


def _norm(pr: dict) -> dict:
    """ทำให้ข้อมูลสินค้าครบและถูกชนิด (ใช้ทั้งตอนโหลดและตอนบันทึก)"""
    out = {
        "id": re.sub(r"[^a-zA-Z0-9_-]", "", str(pr.get("id") or ""))[:40] or "p" + base36(int(time.time() * 1000)),
        "group": str(pr.get("group") or "ทั่วไป").strip()[:40] or "ทั่วไป",
        "name": str(pr.get("name") or "").strip()[:80] or "สินค้าใหม่",
        "modules": [m for m in MODULE_IDS if m != "core" and m in (pr.get("modules") or [])],
        "p": {}, "ui": {},
    }
    src = pr.get("p") or {}
    for k, f in FIELDS.items():
        if f["t"] in ("edits",):
            continue
        if f["t"] == "size":
            ax = src.get("size_axis", "")
            out["p"]["size_axis"] = ax if ax in ("w", "h") else ""
            try:
                out["p"]["size_mm"] = max(0.0, float(src.get("size_mm") or 0)) if out["p"]["size_axis"] else 0.0
            except (TypeError, ValueError):
                out["p"]["size_mm"] = 0.0
            continue
        if k not in src:
            continue
        v = src[k]
        if f["t"] == "num":
            try:
                v = min(max(float(v), f["min"]), f["max"])
            except (TypeError, ValueError):
                continue
        elif f["t"] == "sel":
            if v not in [o[0] for o in f["opts"]]:
                continue
        elif f["t"] == "bool":
            v = bool(v) and v not in ("0", "false")
        elif f["t"] == "color":
            if not re.fullmatch(r"#[0-9a-fA-F]{6}", str(v)):
                continue
            v = str(v).lower()
        out["p"][k] = v
    for k, v in (pr.get("ui") or {}).items():
        if k in FIELDS and v in MODES and v != "edit":
            out["ui"][k] = v
    return out


def base36(n: int) -> str:
    s = ""
    while n:
        n, r = divmod(n, 36)
        s = "0123456789abcdefghijklmnopqrstuvwxyz"[r] + s
    return s or "0"


def _read() -> dict | list | None:
    try:
        return json.loads(FILE.read_text(encoding="utf-8"))
    except Exception:
        return None


def load() -> list[dict]:
    saved = _read()
    if isinstance(saved, dict) and saved.get("version") == 2:
        items = [_norm(x) for x in saved.get("products", [])]
    else:
        items = [_norm(x) for x in copy.deepcopy(DEFAULTS)]
        if isinstance(saved, dict):     # ไฟล์รุ่นเก่า {id: ค่าที่บันทึก} -> ทับค่าเริ่มต้น (เฉพาะช่องของโมดูลที่สินค้าใช้)
            for it in items:
                if it["id"] in saved and isinstance(saved[it["id"]], dict):
                    keep = {k: v for k, v in saved[it["id"]].items()
                            if k in FIELDS and (FIELDS[k]["m"] == "core" or FIELDS[k]["m"] in it["modules"])}
                    it.update(_norm({**it, "p": {**it["p"], **keep}}))
    if not any(x["id"] == "custom" for x in items):
        items.insert(0, _norm(copy.deepcopy(DEFAULTS[0])))
    return items


def _write(items: list[dict]):
    FILE.write_text(json.dumps({"version": 2, "products": items}, ensure_ascii=False, indent=1), encoding="utf-8")


def get(pid: str) -> dict:
    items = load()
    for it in items:
        if it["id"] == pid:
            return it
    return items[0]


def save_defaults(pid: str, p: dict) -> list[dict]:
    """ปุ่ม "บันทึกเป็นค่าเริ่มต้นของสินค้านี้" จากหน้าทำงาน"""
    items = load()
    for i, it in enumerate(items):
        if it["id"] == pid:
            keep = {k: v for k, v in p.items() if k in FIELDS or k in ("size_axis", "size_mm")}
            items[i] = _norm({**it, "p": {**it["p"], **keep}})
            _write(items)
            return items
    raise KeyError("ไม่พบสินค้านี้")


def upsert(pr: dict) -> list[dict]:
    items = load()
    new = _norm(pr)
    for i, it in enumerate(items):
        if it["id"] == new["id"]:
            items[i] = new
            break
    else:
        items.append(new)
    _write(items)
    return items


def delete(pid: str) -> list[dict]:
    if pid == "custom":
        raise KeyError("สินค้า \"กำหนดเอง\" ลบไม่ได้")
    items = [x for x in load() if x["id"] != pid]
    _write(items)
    return items


def restore_defaults() -> list[dict]:
    """เพิ่มสินค้าตั้งต้นที่ถูกลบไปกลับมา (ไม่ทับสินค้าที่มีอยู่)"""
    items = load()
    have = {x["id"] for x in items}
    for d in DEFAULTS:
        if d["id"] not in have:
            items.append(_norm(copy.deepcopy(d)))
    _write(items)
    return items


def apply(pdict: dict) -> dict:
    """รวมค่าของรูปกับกฎของสินค้า: เปิด/ปิดโมดูล + บังคับค่าช่องที่ล็อก/ซ่อน
    (ทำฝั่งเซิร์ฟเวอร์เสมอ แม้หน้าเว็บส่งค่ามาผิด หรือเรียกจากระบบอัตโนมัติ)"""
    pr = get(str(pdict.get("product") or "custom"))
    p = dict(pdict)
    p["product"] = pr["id"]
    mods = set(pr["modules"])
    for k, f in FIELDS.items():
        mode = pr["ui"].get(k, "edit")
        if f["m"] != "core" and f["m"] not in mods:
            continue
        if mode in ("lock", "hide"):
            if f["t"] == "size":
                p["size_axis"], p["size_mm"] = pr["p"].get("size_axis", ""), pr["p"].get("size_mm", 0)
            elif f["t"] == "edits":
                p["edits"] = []
            else:
                p[k] = pr["p"].get(k, f["d"])
    for m, flag in FLAG.items():
        p[flag] = m in mods
    for m, vals in OFF.items():
        if m not in mods:
            p.update(vals)
    if "paper" in mods:
        p["extend"] = True
        if p.get("paper") in PAPER:
            p["fixed_w_mm"], p["fixed_h_mm"] = PAPER[p["paper"]]
    # ค่าของโมดูลที่ไม่ได้ส่งมา ใช้ค่าเริ่มต้นของสินค้า
    for k, v in pr["p"].items():
        p.setdefault(k, v)
    return p


def name_of(pid: str) -> str:
    for it in load():
        if it["id"] == pid:
            return it["name"]
    return ""


def payload() -> dict:
    """ข้อมูลทั้งหมดที่หน้าเว็บต้องใช้"""
    return {"products": load(), "modules": MODULES, "fields": FIELDS, "paper": PAPER, "modes": MODES}
