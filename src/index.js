import api from "../netlify/functions/api.mjs";

const GATEWAY_ORIGINS = [
  // Match the gateway origin already used by the working Windows version first.
  "https://wrb-tv-smart-gateway.wrbtv-official22.workers.dev",
  // Alternate account subdomain as shown in the current Cloudflare dashboard.
  "https://wrb-tv-smart-gateway.wrbtv-oficial22.workers.dev"
];
const REMOTE_CODES = new Set(["0022", "PFAST"]);

function shouldTryAlternateGateway(response) {
  return response.status === 403 || response.status === 404 || response.status >= 500;
}

async function fetchGateway(path, init) {
  let lastResponse = null;
  let meaningfulResponse = null;
  let lastError = null;

  for (const origin of GATEWAY_ORIGINS) {
    try {
      const response = await fetch(origin + path, init);
      lastResponse = response;

      // Remember useful error bodies and don't let an alternate-host 404
      // hide a more informative error returned by the gateway.
      if (response.status !== 404) meaningfulResponse = response;
      if (!shouldTryAlternateGateway(response)) return response;
    } catch (error) {
      lastError = error;
    }
  }

  if (meaningfulResponse) return meaningfulResponse;
  if (lastResponse) return lastResponse;
  throw lastError || new Error("Gateway WRB-TV indisponível.");
}

async function forwardRemoteApi(request, payload, code) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    // For the 0022/PFAST remote codes, always use the same gateway as Windows.
    // Direct fallback from a Cloudflare Worker gets blocked by some IPTV hosts
    // and was the reason the iPhone build differed from the working apps.
    return await fetchGateway("/api", {
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
  } catch (error) {
    return Response.json({
      auth: false,
      error: "Não foi possível acessar o gateway da WRB-TV. Verifique a disponibilidade do serviço e tente novamente."
    }, {
      status: 502,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
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

  let lastResponse = null;
  let meaningfulResponse = null;
  let lastError = null;

  for (const origin of GATEWAY_ORIGINS) {
    try {
      const target = new URL("/api/stream", origin);
      target.search = url.search;
      const response = await fetch(target.toString(), {
        method: request.method,
        headers,
        redirect: "follow"
      });

      lastResponse = response;
      if (response.ok) return response;

      if (response.status !== 404) meaningfulResponse = response;
      if (![403, 404].includes(response.status) && response.status < 500) return response;
    } catch (error) {
      lastError = error;
    }
  }

  // Do not retry these streams directly against the IPTV provider from this
  // Worker: the production apps use the gateway for stream proxying too.
  if (meaningfulResponse) return meaningfulResponse;
  if (lastResponse) return lastResponse;

  return new Response(
    "Não foi possível acessar o gateway de mídia da WRB-TV. Tente novamente em instantes.",
    { status: 502, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } }
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isApiPath = url.pathname === "/api" || url.pathname.startsWith("/api/");
    const isStreamPath = (url.pathname === "/api/stream" || url.pathname === "/stream" ||
      (url.pathname.startsWith("/api") && url.searchParams.has("url")));

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
        return forwardRemoteApi(request, payload, code);
      }
      return api(request);
    }

    if (isApiPath || request.method === "OPTIONS") {
      return api(request);
    }

    return env.ASSETS.fetch(request);
  }
};
