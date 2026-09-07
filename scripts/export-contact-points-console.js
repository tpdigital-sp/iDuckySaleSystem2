/**
 * ดึง "ธงคำนวณคะแนนสะสม" + "ประวัติการสะสมคะแนน" ของผู้ติดต่อจาก backoffice.casedesign2u.com
 * เป็นไฟล์ contact-points-casedesign2u.json แล้วนำเข้าที่ หลังบ้าน › ข้อมูลผู้ติดต่อ › นำเข้าจากระบบเดิม
 *
 * วิธีใช้ (เบราว์เซอร์ที่ล็อกอิน backoffice ค้างไว้):
 *   1. เปิด https://backoffice.casedesign2u.com/view-contact
 *   2. ⌥⌘I → Console → วางโค้ดทั้งไฟล์ → Enter
 *   3. รอจน console ขึ้น "✅ เสร็จแล้ว" (ดึงประวัติเฉพาะรายที่มีแต้ม > 0 หรือเปิดคำนวณคะแนน ~1,000 ราย · ~15 นาที)
 *
 * ⚠️ ยิงทีละราย เว้น 150ms — เซิร์ฟเวอร์ระบบเดิมตอบ 500 ถ้ายิงถี่/ซ้อนกัน (มี retry ให้ 3 ครั้ง)
 * ผลลัพธ์: { flags: [{ id, pointActive }], history: [{ contactId, at, action, point, orderId, note }] }
 */
(async () => {
  const s = jQuery("#data-table").DataTable().settings()[0];
  const strip = (h) => (h == null ? "" : String(h).replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim());
  const post = (url, data) => new Promise((res, rej) => jQuery.ajax({ type: "POST", url, headers: s.ajax.headers, timeout: 30000, data, success: res, error: (x, st) => rej(new Error("HTTP " + x.status + " " + st)) }));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const retry = async (fn) => {
    for (let i = 0; ; i++) {
      try { return await fn(); } catch (e) { if (i >= 2) throw e; await sleep(2000); }
    }
  };

  // 1) รายชื่อทั้งหมด → ธงคำนวณคะแนน (ป้ายเขียว = คำนวณ) + แต้ม
  const flags = [];
  const targets = [];
  let total = Infinity;
  for (let off = 0; off < total; off += 1000) {
    const j = await retry(() => post("/api/user/ajax-get-contact-lists", { draw: 1, start: off, length: 1000, "search[value]": "", "order[0][column]": 0, "order[0][dir]": "asc" }));
    total = j.recordsTotal;
    for (const c of j.data) {
      const id = strip(c[0]);
      const html = String(c[2] || "");
      const active = /label-success/.test(html) || /^คำนวณ/.test((html.match(/title=['"]([^'"]*)['"]/) || [])[1] || "");
      flags.push({ id, pointActive: active });
      if (active || parseFloat(strip(c[2]).replace(/,/g, "")) > 0) targets.push(id);
    }
    console.log(`รายชื่อ ${flags.length}/${total}`);
  }

  // 2) ประวัติคะแนนรายคน
  const history = [];
  const failed = [];
  let n = 0;
  for (const id of targets) {
    try {
      const j = await retry(() => post("/api/user/ajax-get-contact-history", { draw: 1, start: 0, length: 2000, "search[value]": "", "order[0][column]": 0, "order[0][dir]": "asc", customer_id: id }));
      for (const r of j.data) history.push({ contactId: id, at: strip(r[1]), action: strip(r[2]), point: strip(r[3]), orderId: strip(r[4]).replace(/^#/, ""), note: strip(r[5]) });
    } catch (e) {
      failed.push(id);
    }
    if (++n % 50 === 0) console.log(`ประวัติ ${n}/${targets.length} (${history.length} รายการ)`);
    await sleep(150);
  }
  if (failed.length) console.warn("ดึงไม่สำเร็จ " + failed.length + " ราย:", failed.join(","));

  window.__contactPoints = { flags, history };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify({ flags, history })], { type: "application/json" }));
  a.download = "contact-points-casedesign2u.json";
  a.click();
  console.log(`✅ เสร็จแล้ว — ธง ${flags.length} ราย · ประวัติ ${history.length} รายการ → contact-points-casedesign2u.json`);
})();
