// 🎨 สร้างภาพไลฟ์สไตล์การ์ด Spotlight จากรูปสินค้าจริงด้วย Gemini image (25 ก.ย. 69) — รัน: set -a; source .env.local; set +a; S=<โฟลเดอร์ที่มี src/ และ out/> node scripts/_tmp/spotlight-gen-images.mjs [job...]

import fs from "node:fs";
const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.MODEL || "gemini-3.1-flash-image";
const S = process.env.S;
const BRAND = "Keep the printed artwork EXACTLY as in the reference photo (same characters, colours, proportions) — do not redesign or add new text/logos. Output a polished commercial e-commerce lifestyle photo, 4:3, photorealistic, sharp, the shirt is the hero and its print is clearly visible and centred, no watermark, no text overlays.";
const jobs = {
  "crop-a": { refs: ["crop-cover.jpg"], p: `Reference: a white crop top with a yellow duck holding an ice-cream cone print. Create a fresh eye-catching photo: a young Thai woman wearing this exact crop top with high-waist light-blue jeans, sweet summer street style, holding a real ice-cream cone, smiling, in front of a pastel pink & sky-blue wall, bright soft sunlight, playful cheerful mood. ${BRAND}` },
  "crop-b": { refs: ["crop-cover.jpg","crop-black.jpg"], p: `Reference photos: the same crop top design in white (duck with ice cream) and black (duck with moon). Create one photo with two friends standing together, one wearing the white crop and one the black crop, both with high-waist jeans, laughing, colourful pastel outdoor background with soft bokeh and warm sunlight, trendy fashion-editorial look. ${BRAND}` },
  "oversize-a": { refs: ["oversize-headphones.jpg"], p: `Reference: a black oversize T-shirt with a yellow duck wearing headphones print. Create a Korean street-style photo: a young Thai man wearing this exact oversize tee loosely with wide beige trousers and sneakers, walking on a city street at golden hour, subtle urban backdrop, relaxed cool pose, cinematic lighting. ${BRAND}` },
  "oversize-b": { refs: ["oversize-headphones.jpg","oversize-cover.jpg"], p: `Reference: black oversize tee with headphone duck print, and a white oversize tee. Create a minimal aesthetic studio photo: two oversize tees (black with the duck-headphone print in front, white behind) hanging on wooden hangers against a warm cream wall with soft window light and a small green plant, Korean cafe vibe, calm premium look. ${BRAND}` },
  "sport-a": { refs: ["sport-cover.jpg","sport-g2.jpg"], p: `Reference: a green-black striped sport jersey with gold accents and number. Create a dynamic team photo: four young Thai friends wearing this exact jersey design as a matching team, one showing his back with a printed name and number 32, outdoors at a skatepark/futsal court at sunset, energetic poses, one mid-jump, confident team spirit, sporty editorial look. ${BRAND}` },
  "sport-b": { refs: ["sport-cover.jpg"], p: `Reference: a green-black striped sport jersey. Create a punchy product-hero photo: the same jersey shown front and back side by side on invisible mannequins, back shows name IDUCKY and number 32, floating on a bold dark-green gradient background with subtle light streaks and motion energy, sports-brand catalogue style. ${BRAND}` },
};
const only = process.argv.slice(2);
async function run(id) {
  const j = jobs[id];
  const parts = [{ text: j.p }, ...j.refs.map(f => ({ inline_data: { mime_type: "image/jpeg", data: fs.readFileSync(`${S}/src/${f}`).toString("base64") } }))];
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "4:3" } } }),
  });
  const j2 = await r.json();
  const img = j2.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
  if (!img) { console.log(id, "FAIL", JSON.stringify(j2).slice(0, 400)); return; }
  const ext = img.inlineData.mimeType.includes("png") ? "png" : "jpg";
  fs.writeFileSync(`${S}/out/${id}.${ext}`, Buffer.from(img.inlineData.data, "base64"));
  console.log(id, "ok", ext);
}
await Promise.all((only.length ? only : Object.keys(jobs)).map(run));
