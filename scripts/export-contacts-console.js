/**
 * ดึงรายชื่อผู้ติดต่อทั้งหมดจาก backoffice.casedesign2u.com เป็นไฟล์ contacts-casedesign2u.json
 *
 * วิธีใช้ (ทำในเบราว์เซอร์ที่ล็อกอิน backoffice ค้างไว้):
 *   1. เปิด https://backoffice.casedesign2u.com/view-contact
 *   2. กด F12 (หรือ ⌥⌘I บน Mac) → แท็บ Console
 *   3. ถ้า Chrome ขึ้นเตือน ให้พิมพ์ allow pasting แล้ว Enter ก่อน
 *   4. วางโค้ดทั้งไฟล์นี้ แล้ว Enter — รอจนขึ้น "ดึงแล้ว 28,xxx/28,xxx" (~1 นาที)
 *   5. ไฟล์ contacts-casedesign2u.json จะถูกดาวน์โหลดอัตโนมัติ
 *   6. ไปที่ หลังบ้าน › ลูกค้า & การตลาด › ข้อมูลผู้ติดต่อ › นำเข้าจากระบบเดิม แล้วเลือกไฟล์นั้น
 *
 * คอลัมน์ของตารางระบบเดิม: 0 รหัส · 1 ชื่อ (+เบอร์บางราย) · 2 Point · 3 รูป Rank · 4 สถานะ Rank · 5 วันหมดอายุ · 6 เบอร์ · 7 ที่อยู่
 */
(async () => {
  const s = jQuery("#data-table").DataTable().settings()[0];
  const strip = (h) => (h == null ? "" : String(h).replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim());
  /** ชื่อไฟล์รูป rank (ไม่เอานามสกุล) — "0" = ไม่มี rank */
  const rankOf = (h) => {
    const m = String(h ?? "").match(/src="[^"]*\/([^/"?]+?)(?:\.[a-z]+)?"/i);
    return m ? m[1] : strip(h);
  };
  const all = [];
  let total = Infinity;
  for (let off = 0; off < total; off += 1000) {
    const j = await new Promise((res, rej) =>
      jQuery.ajax({
        type: "POST",
        url: s.ajax.url,
        headers: s.ajax.headers,
        data: { draw: 1, start: off, length: 1000, "search[value]": "", "order[0][column]": 0, "order[0][dir]": "asc" },
        success: res,
        error: (x) => rej(new Error("HTTP " + x.status)),
      })
    );
    total = j.recordsTotal;
    for (const c of j.data) {
      all.push({ id: strip(c[0]), name: strip(c[1]), phone: strip(c[6]), address: strip(c[7]), point: strip(c[2]), rank: rankOf(c[3]), rankStatus: strip(c[4]), rankExpiry: strip(c[5]) });
    }
    console.log(`ดึงแล้ว ${all.length}/${total}`);
  }
  window.__contacts = all; // เผื่อใช้ต่อใน Console
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(all)], { type: "application/json" }));
  a.download = "contacts-casedesign2u.json";
  a.click();
  console.log("✅ เสร็จแล้ว — ไฟล์ contacts-casedesign2u.json อยู่ในโฟลเดอร์ Downloads");
})();
