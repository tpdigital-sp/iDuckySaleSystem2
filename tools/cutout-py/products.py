"""
products.py — สูตรสินค้า: สินค้าแต่ละตัวกำหนดรูปร่างเส้นตัด ระยะ ชนิดเส้น และส่วนเสริม

ค่าที่บันทึกจากหน้าเว็บ (ปุ่ม "บันทึกเป็นค่าเริ่มต้นของสินค้านี้") เก็บใน products.json
"""
from __future__ import annotations

import copy
import json
from pathlib import Path

FILE = Path(__file__).resolve().parent / "products.json"

# ขนาดกระดาษมาตรฐาน (มม.) แนวตั้ง
PAPER = {"A4": (210, 297), "A5": (148, 210), "A6": (105, 148), "A7": (74, 105)}

ACRYLIC = {"method": "auto", "shape": "contour", "offset_mm": 1.5, "cut_type": "Cut100", "white": "full",
           "white_choke_mm": 0.1, "extend": False, "fill": "none", "fixed_w_mm": 0, "fixed_h_mm": 0,
           "hole": False, "stand": False}

DEFAULTS = [
    {"id": "custom", "group": "ทั่วไป", "name": "กำหนดเอง", "kind": "custom",
     "p": {"cut_type": "Cut100", "white": "none", "hole": False, "stand": False,
           "fixed_w_mm": 0, "fixed_h_mm": 0}},

    {"id": "keychain", "group": "อะคริลิก", "name": "พวงกุญแจอะคริลิก", "kind": "keychain",
     "p": {**ACRYLIC, "hole": True, "hole_mm": 1.5, "ring_mm": 2.0, "hole_gap_mm": 1.5, "hole_x_mm": 0,
           "hole_style": "circle"}},
    {"id": "acrylic", "group": "อะคริลิก", "name": "งานอะคริลิกตามทรง (บัคเคิล เขย่า กิ๊บ ฯลฯ)", "kind": "acrylic",
     "p": {**ACRYLIC}},
    {"id": "standee", "group": "อะคริลิก", "name": "สแตนดี้อะคริลิก", "kind": "standee",
     "p": {**ACRYLIC, "stand": True, "tab_w_mm": 0, "tab_h_mm": 6, "base_d_mm": 25,
           "thick_mm": 3, "slot_clear_mm": 0.1}},

    {"id": "sticker100", "group": "สติกเกอร์", "name": "สติกเกอร์ไดคัท 100 (ตัดเป็นตัว)", "kind": "sticker",
     "p": {"method": "auto", "shape": "contour", "offset_mm": 0, "cut_type": "Cut100", "white": "none",
           "extend": False, "fill": "none", "fixed_w_mm": 0, "fixed_h_mm": 0, "hole": False, "stand": False}},

    {"id": "paper", "group": "กระดาษ", "name": "การ์ด / โปสการ์ด / งานกระดาษ", "kind": "paper",
     "p": {"method": "none", "shape": "rounded", "radius_mm": 3, "offset_mm": -1.5, "cut_type": "Cut100",
           "white": "none", "extend": True, "fill": "none", "paper": "A6",
           "fixed_w_mm": 105, "fixed_h_mm": 148, "hole": False, "stand": False}},
]


def load() -> list[dict]:
    items = copy.deepcopy(DEFAULTS)
    try:
        saved = json.loads(FILE.read_text(encoding="utf-8"))
    except Exception:
        saved = {}
    for it in items:  # ค่าที่บันทึกไว้ทับค่าเริ่มต้น (สินค้าใหม่ในโปรแกรมยังได้ค่าเริ่มต้นครบ)
        if it["id"] in saved:
            it["p"].update(saved[it["id"]])
    return items


def save(pid: str, p: dict) -> list[dict]:
    keys = set()
    for it in DEFAULTS:
        if it["id"] == pid:
            keys = set(it["p"]) | {"radius_mm", "bridge", "holes", "smooth", "shrink", "bleed_mm"}
    if not keys:
        raise KeyError("ไม่พบสินค้านี้")
    try:
        saved = json.loads(FILE.read_text(encoding="utf-8"))
    except Exception:
        saved = {}
    saved[pid] = {k: v for k, v in p.items() if k in keys}
    FILE.write_text(json.dumps(saved, ensure_ascii=False, indent=2), encoding="utf-8")
    return load()


def name_of(pid: str) -> str:
    for it in load():
        if it["id"] == pid:
            return it["name"]
    return ""
