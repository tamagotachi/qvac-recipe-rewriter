// Recipe Rewriter - paste a recipe, pick a diet, and an AI on YOUR machine (QVAC) rewrites it with swaps.
// The page scales ingredient amounts for more or fewer servings with plain math. Open http://localhost:3074 after starting.

import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

// The QVAC worker can be slow to start on some computers. Wait up to 3 minutes for it.
process.env.QVAC_RPC_INIT_TIMEOUT_MS ??= "180000";
const { loadModel, completion, LLAMA_3_2_1B_INST_Q4_0 } = await import("@qvac/sdk");

const PORT = 3074;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---- Step 1: load the AI model (downloads the first time, then it's cached) ----
let modelId = null;
const status = { ready: false, message: "Starting...", percent: null, error: null };
async function startModel() {
  try {
    status.message = "Loading the AI model (first run downloads it)...";
    modelId = await loadModel({
      modelSrc: LLAMA_3_2_1B_INST_Q4_0,
      modelType: "llm",
      onProgress: (p) => { const v = typeof p === "number" ? p : p?.percentage; if (typeof v === "number") status.percent = Math.round(v); },
    });
    status.ready = true; status.message = "AI recipe rewriter ready";
    console.log("Model loaded. Open http://localhost:" + PORT);
  } catch (err) { status.error = String(err?.message || err); console.error("Could not load model:", err); }
}

// One AI job at a time
let chain = Promise.resolve();
const enqueue = (job) => { const p = chain.then(job); chain = p.catch(() => {}); return p; };

function readBody(req, limit = 10000) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > limit) { reject(new Error("Too big")); req.destroy(); } });
    req.on("end", () => resolve(data)); req.on("error", reject);
  });
}
const json = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
const clean = (v, n) => String(v || "").replace(/\s+/g, " ").trim().slice(0, n);

// QVAC "structured output": the rewritten recipe plus a list of swaps with reasons.
const SCHEMA = { type: "object", properties: {
  title: { type: "string" }, ingredients: { type: "array", items: { type: "string" } }, steps: { type: "array", items: { type: "string" } },
  swaps: { type: "array", items: { type: "object", properties: { from: { type: "string" }, to: { type: "string" }, why: { type: "string" } }, required: ["from", "to", "why"], additionalProperties: false } },
}, required: ["title", "ingredients", "steps", "swaps"], additionalProperties: false };
const DIETS = { vegan: "vegan (no meat, fish, eggs, dairy or honey)", vegetarian: "vegetarian (no meat or fish)", "gluten-free": "gluten-free (no wheat, barley or rye)", "dairy-free": "dairy-free (no milk, butter, cheese, cream or yogurt)", "less sugar": "lower in sugar" };
const prompt = (diet) => `You adapt recipes. Rewrite the recipe so it is ${DIETS[diet]}. Reply with JSON only.
title: the recipe name (add the diet, like "Vegan ..."). ingredients: one per line, keeping the ORIGINAL amounts at the start of each line (like "2 cups oat milk").
steps: the method, updated for the swaps. swaps: every ingredient you changed, with a short reason.
Only change what the diet requires. Keep everything else the same.`;

// ---- Step 2: the web server ----
const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(await readFile(path.join(__dirname, "public", "index.html")));
    }
    if (req.method === "GET" && req.url === "/api/status") return json(res, 200, status);
    if (req.method === "POST" && req.url === "/api/rewrite") {
      if (!status.ready) return json(res, 503, { error: "The AI recipe rewriter is not ready yet." });
      const b = JSON.parse(await readBody(req, 30000)), recipe = String(b.recipe || "").trim().slice(0, 4000), diet = DIETS[b.diet] ? b.diet : "vegan";
      if (recipe.length < 30) return json(res, 400, { error: "Paste a recipe first." });
      const r = await enqueue(async () => {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            // This is the QVAC call that runs the AI on-device
            const run = completion({ modelId, stream: true, history: [{ role: "system", content: prompt(diet) }, { role: "user", content: "Recipe:\n\"\"\"\n" + recipe + "\n\"\"\"" }], responseFormat: { type: "json_schema", json_schema: { name: "Rewrite", schema: SCHEMA } } });
            let out = "";
            for await (const event of run.events) if (event.type === "contentDelta") out += event.text;
            const j = JSON.parse(out), list = (a, n) => (a || []).map((x) => clean(x, n)).filter(Boolean);
            const res2 = { title: clean(j.title, 100), ingredients: list(j.ingredients, 120).slice(0, 40), steps: list(j.steps, 400).slice(0, 30), swaps: (j.swaps || []).map((s) => ({ from: clean(s.from, 60), to: clean(s.to, 60), why: clean(s.why, 200) })).filter((s) => s.from && s.to && s.from.toLowerCase() !== s.to.toLowerCase()).slice(0, 15) };
            if (res2.ingredients.length && res2.steps.length) return res2;
          } catch (err) { console.error("Rewrite attempt failed:", err.message); }
        }
        return null;
      });
      return r ? json(res, 200, r) : json(res, 502, { error: "The AI couldn't rewrite this recipe. Try again." });
    }
    res.writeHead(404); res.end("Not found");
  } catch (err) { console.error(err); json(res, 500, { error: String(err?.message || err) }); }
});

// "127.0.0.1" means only YOUR computer can reach this app
server.listen(PORT, "127.0.0.1", () => console.log("Server running at http://localhost:" + PORT));
startModel();
