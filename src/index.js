import api from "../netlify/functions/api.mjs";

// The Cloudflare Container gateway is the Node.js backend used by the
// working Windows application. Use the account's exact workers.dev hostname first.
const GATEWAY_ORIGINS = [
  "https://wrb-tv-smart-gateway.wrbtv-oficial22.workers.dev",
  "https://wrb-tv-smart-gateway.wrbtv-official22.workers.dev"
];
const REMOTE_CODES = new Set(["0022", "PFAST"]);

function isJsonResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  return contentType.toLowerCase().includes("json");
}

async function fetchGatewayJson(path, init) {
  let lastStatus = 502;
  let lastIssue = "O gateway Node.js não retornou uma resposta JSON válida.";

  for (const origin of GATEWAY_ORIGINS) {
    try {
      const response = await fetch(origin + path, init);
      lastStatus = response.status;

      // A stale/incorrect workers.dev hostname can return a Cloudflare HTML error
      // (including 403). Never pass that HTML to the app as if it were API JSON.
      if (!isJsonResponse(response)) {
        lastIssue = "O endereço do gateway respondeu com uma página de erro em vez de JSON.";
        continue;
      }

      // API errors from the Node.js gateway are JSON and need to reach the app.
      return response;
    } catch (_) {
      lastIssue = "Não foi possível alcançar este endereço do gateway.";
    }
  }

  return Response.json({
    auth: false,
    error: lastIssue + " Verifique a URL pública do gateway Node.js da WRB-TV."
  }, {
    status: 502,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

async function forwardRemoteApi(payload, code) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    // 0022/PFAST must go through the persistent Node.js Container gateway.
    // Do not fall back to direct upstream provider requests from this Worker:
    // the provider returns HTTP 403 to direct Cloudflare-origin connections.
    return await fetchGatewayJson("/api", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "accept": "application/json"
      },
      body: JSON.stringify({
        ...payload,
        server: code,
        serverCode: code
      }),
      signal: controller.signal
    });
  } catch (_) {
    return Response.json({
      auth: false,
      error: "A chamada ao gateway Node.js da WRB-TV excedeu o tempo limite. Tente novamente."
    }, {
      status: 502,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store"
      }
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function forwardStream(request, url) {
  const headers = new Headers();
  for (const name of ["range", "if-range", "accept"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  let lastStatus = 502;
  let lastIssue = "O gateway Node.js não conseguiu abrir o fluxo de vídeo.";

  for (const origin of GATEWAY_ORIGINS) {
    try {
      const target = new URL("/api/stream", origin);
      target.search = url.search;
      const response = await fetch(target.toString(), {
        method: request.method,
        headers,
        redirect: "follow"
      });

      // Streaming responses are binary or HLS text, not JSON. Accept successful
      // responses, including 206 partial content for video seeking.
      if (response.ok || response.status === 206) return response;

      lastStatus = response.status;
      lastIssue = "O gateway de mídia respondeu HTTP " + response.status + ".";
      // Try the correct account hostname if the alternate hostname returns a
      // Cloudflare page/error. Keep all 0022/PFAST streams on the Node gateway.
      if (response.status === 403 || response.status === 404 || response.status >= 500) continue;
      return response;
    } catch (_) {
      lastIssue = "Não foi possível conectar ao gateway de mídia da WRB-TV.";
    }
  }

  return new Response(lastIssue, {
    status: lastStatus >= 400 ? lastStatus : 502,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-expose-headers": "Content-Range, Content-Length, Accept-Ranges"
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isApiPath = url.pathname === "/api" || url.pathname.startsWith("/api/");
    const isStreamPath = url.pathname === "/api/stream" || url.pathname === "/stream" ||
      (url.pathname.startsWith("/api") && url.searchParams.has("url"));

    if (isStreamPath && (request.method === "GET" || request.method === "HEAD") && url.searchParams.has("url")) {
      return forwardStream(request, url);
    }

    if (isApiPath && request.method === "POST") {
      let payload;
      try {
        payload = await request.clone().json();
      } catch {
        return api(request);
      }

      const code = String(payload.serverCode || payload.server || "").trim().toUpperCase();
      if (REMOTE_CODES.has(code)) {
        return forwardRemoteApi(payload, code);
      }
      return api(request);
    }

    if (isApiPath || request.method === "OPTIONS") return api(request);
    return env.ASSETS.fetch(request);
  }
};
