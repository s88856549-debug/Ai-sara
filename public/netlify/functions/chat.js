// SARA ব্যাকএন্ড (Google Gemini সংস্করণ)
// Netlify Environment Variables: GEMINI_API_KEY (দরকার), ACCESS_CODE (ঐচ্ছিক), GEMINI_MODEL (ঐচ্ছিক)
const hits = new Map();

exports.handler = async (event) => {
  const H = { "content-type": "application/json" };
  const reply = (code, obj) => ({ statusCode: code, headers: H, body: JSON.stringify(obj) });
  if (event.httpMethod !== "POST") return reply(405, { error: "method" });

  const ip = (event.headers["x-nf-client-connection-ip"] || event.headers["x-forwarded-for"] || "x").split(",")[0];
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60000);
  if (arr.length >= 15) return reply(429, { error: "rate" });
  arr.push(now); hits.set(ip, arr);

  let b;
  try { b = JSON.parse(event.body || "{}"); } catch (e) { return reply(400, { error: "bad" }); }

  if (process.env.ACCESS_CODE && b.code !== process.env.ACCESS_CODE) return reply(401, { error: "code" });

  let msgs = Array.isArray(b.messages) ? b.messages.slice(-20) : [];
  msgs = msgs
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return reply(400, { error: "bad" });

  const uname = String(b.uname || "বস").replace(/["\n\r\\]/g, "").slice(0, 20) || "বস";
  const funTxt = ["", "মাঝেমধ্যে একটু রসিকতা করো", "স্বাভাবিক আড্ডার মতো হালকা মজা করো", "ঘনঘন খুনসুটি ও হালকা রোস্ট করো (কিন্তু কখনো আঘাত বা অপমান নয়)"][Number(b.fun) || 2] || "";
  const system =
    `তুমি SARA, ব্যবহারকারীর পার্সোনাল মহিলা সহকারী। নিজেকে নারী হিসেবে পরিচয় দাও এবং নাম সবসময় SARA বলবে, অন্য কোনো নাম নেবে না। ` +
    `ব্যবহারকারীকে সবসময় "${uname}" বলে ডাকো। চলিত বাংলায় কথা বলো (ব্যবহারকারী অন্য ভাষায় লিখলে সেই ভাষায়)। উত্তর ছোট ও পরিষ্কার রাখো। ` +
    `বন্ধুর মতো আন্তরিক থাকো; ${funTxt}। ব্যবহারকারী মন খারাপ করলে বা গুরুতর সমস্যায় থাকলে মজা বন্ধ করে আন্তরিকভাবে পাশে থাকো। না জানলে স্বীকার করো, ভুল তথ্য দিও না।` +
    (b.voice ? " এটি ভয়েস কথোপকথন: উত্তর ২-৩ ছোট বাক্যে দাও, ইমোজি বা চিহ্ন ছাড়া।" : "");

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: msgs.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
        generationConfig: { maxOutputTokens: 600 },
      }),
    });
    const d = await r.json();
    if (!r.ok) return reply(502, { error: "api", detail: (d.error && d.error.message) || "" });
    const text = ((d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts) || []).map((p) => p.text || "").join("");
    if (!text) return reply(502, { error: "empty" });
    return reply(200, { text });
  } catch (e) {
    return reply(502, { error: "api" });
  }
};
