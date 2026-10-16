import http from "node:http";
import { Readable } from "node:stream";
import api from "../netlify/functions/api.mjs";

const PORT = Number(process.env.PORT || 3000);
const HOST = "0.0.0.0";

function sendResponse(res, response, headOnly = false) {
  res.statusCode = response.status;
  for (const [key, value] of response.headers.entries()) {
    res.setHeader(key, value);
  }
  if (headOnly || !response.body) {
    res.end();
    return;
  }
  Readable.fromWeb(response.body).pipe(res);
}

function collectBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", chunk => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function makeRequest(req, body) {
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  const proto = req.headers["x-forwarded-proto"] || "http";
  const url = new URL(req.url || "/", `${proto}://${host}`);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue;
    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }
  return new Request(url, {
    method: req.method,
    headers,
    body: body && req.method !== "GET" && req.method !== "HEAD" ? body : undefined
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const parsed = new URL(req.url || "/", "http://localhost");
    if (req.method === "OPTIONS") {
      const request = makeRequest(req);
      sendResponse(res, await api(request));
      return;
    }

    if (parsed.pathname === "/health") {
      const payload = JSON.stringify({
        ok: true,
        service: "wrbtv-iphone-node-backend",
        runtime: "nodejs-container",
        node: process.version,
        time: new Date().toISOString()
      });
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "access-control-allow-origin": "*"
      });
      res.end(payload);
      return;
    }

    const body = req.method === "POST" ? await collectBody(req) : undefined;
    const request = makeRequest(req, body);
    const response = await api(request);
    sendResponse(res, response, req.method === "HEAD");
  } catch (error) {
    console.error("[WRB-TV iPhone Node]", error?.stack || error);
    if (!res.headersSent) {
      res.writeHead(502, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "access-control-allow-origin": "*"
      });
    }
    res.end(JSON.stringify({
      error: "Falha no backend Node.js da WRB-TV iPhone.",
      detail: String(error?.message || error)
    }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`WRB-TV iPhone Node backend listening on ${HOST}:${PORT}`);
});
