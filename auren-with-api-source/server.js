const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { ProxyAgent } = require("undici");

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.MIROMIND_API_KEY;
const MODEL = process.env.MIROMIND_MODEL || "mirothinker-1-7-deepresearch-mini";
const API_URL = "https://api.miromind.ai/v1/chat/completions";
const PROXY_URL = process.env.HTTPS_PROXY || process.env.https_proxy || "http://127.0.0.1:1090";
const proxyAgent = new ProxyAgent(PROXY_URL);
const PUBLIC_DIR = path.join(__dirname, "public");

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml; charset=utf-8"
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 100_000) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });

    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function handleChat(req, res) {
  if (!API_KEY) {
    sendJson(res, 500, {
      error: "MIROMIND_API_KEY is not configured on the server."
    });
    return;
  }

  let payload;
  try {
    payload = JSON.parse(await readRequestBody(req));
  } catch {
    sendJson(res, 400, { error: "Invalid JSON request body." });
    return;
  }

  const message = typeof payload.message === "string" ? payload.message.trim() : "";
  if (!message) {
    sendJson(res, 400, { error: "Message is required." });
    return;
  }

  try {
    const upstream = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        messages: [
          {
            role: "system",
            content:
              "You are a concise finance research assistant. Answer with practical, decision-ready analysis for institutional users."
          },
          { role: "user", content: message }
        ]
      }),
      dispatcher: proxyAgent
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      sendJson(res, upstream.status, {
        error: data.error?.message || data.message || "Miromind API request failed."
      });
      return;
    }

    const reply = data.choices?.[0]?.message?.content || "";
    sendJson(res, 200, { reply, model: MODEL });
  } catch (error) {
    sendJson(res, 502, {
      error: "Unable to reach the Miromind API.",
      detail: error.message
    });
  }
}

async function serveStatic(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const safePath = path.normalize(decodeURIComponent(requestUrl.pathname)).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath === "/" ? "index.html" : safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const file = await fs.readFile(filePath);
    const type = CONTENT_TYPES[path.extname(filePath)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(file);
  } catch {
    const index = await fs.readFile(path.join(PUBLIC_DIR, "index.html"));
    res.writeHead(200, { "Content-Type": CONTENT_TYPES[".html"] });
    res.end(index);
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url?.startsWith("/api/chat")) {
    await handleChat(req, res);
    return;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    await serveStatic(req, res);
    return;
  }

  sendJson(res, 405, { error: "Method not allowed." });
});

server.listen(PORT, () => {
  console.log(`Auren app running at http://localhost:${PORT}`);
});
