import fs from "node:fs";
const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.MODEL || "gemini-3-pro-image";
const D = process.env.D;
const BRAND = "Keep the jersey design EXACTLY as in the reference photos: cream/off-white body, navy round collar, light-blue raglan sleeves, blue checkered stripes on sleeves and hem, big navy 'iDUCKY' arched wordmark, round badge with a white cartoon duck wearing a blue cap and navy varsity jacket, yellow stars, number 14 in blue. Do not redesign, recolour, or add new logos. Same bright pastel light-blue studio/backdrop mood and clean commercial e-commerce look as the reference photos. Photorealistic, sharp, 4:3, no watermark, no text overlays.";
const jobs = {
  "sport-backs": { refs: ["sport-1.jpg","sport-3.jpg"], p: `Reference: the same jersey worn by a couple (front & back) and a flat front/back shot. Create a fun team photo: five young Thai friends (mixed men and women) standing in a row with arms over each other's shoulders, seen from BEHIND, all wearing this exact jersey. Each back shows a different printed player name and number in the same navy block-letter style as the reference back (e.g. TON 7, BANK 10, IDUCKY 32, MEK 9, POP 4), small 'iDUCKY' at the upper back. Background: bright pastel light-blue studio wall with soft geometric shapes like the reference product photos, sunny cheerful mood, white shorts. ${BRAND}` },
  "sport-team-front": { refs: ["sport-1.jpg","sport-4.jpg"], p: `Reference: the same jersey worn by a couple. Create a lively team photo of four young Thai friends (2 men, 2 women) in this exact jersey, playful team poses (one pointing at the duck print, one flexing, one peace sign), white shorts, bright pastel light-blue studio backdrop with soft geometric blocks exactly like the reference, cheerful energetic mood. The front print (iDUCKY duck badge, 14) must be clearly visible on at least two shirts. ${BRAND}` },
};
const only = process.argv.slice(2);
async function run(id) {
  const j = jobs[id];
  const parts = [{ text: j.p }, ...j.refs.map(f => ({ inline_data: { mime_type: "image/jpeg", data: fs.readFileSync(`${D}/src/${f}`).toString("base64") } }))];
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "4:3" } } }),
  });
  const j2 = await r.json();
  const img = j2.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
  if (!img) { console.log(id, "FAIL", JSON.stringify(j2).slice(0, 400)); return; }
  const ext = img.inlineData.mimeType.includes("png") ? "png" : "jpg";
  fs.writeFileSync(`${D}/out/${id}.${ext}`, Buffer.from(img.inlineData.data, "base64"));
  console.log(id, "ok", ext);
}
await Promise.all((only.length ? only : Object.keys(jobs)).map(run));
