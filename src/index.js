import api from "../netlify/functions/api.mjs";

const GATEWAY_ORIGINS = [
  "https://wrb-tv-smart-gateway.wrbtv-oficial22.workers.dev",
  "https://wrb-tv-smart-gateway.wrbtv-official22.workers.dev"
];
const REMOTE_CODES = new Set(["0022", "PFAST"]);

function responseStatusShouldRetry(response) {
  return response.status === 404 || response.status >= 500;
}

async function fetchGateway(path, init) {
  let lastResponse = null;
  let lastError = null;
  for (const origin of GATEWAY_ORIGINS) {
    try {
      const response = await fetch(origin + path, init);
      lastResponse = response;
      if (!responseStatusShouldRetry(response)) return response;
    } catch (error) {
      lastError = error;
    }
  }
  if (lastResponse) return lastResponse;
  throw lastError || new Error("Gateway WRB-TV indisponível.");
}

async function forwardRemoteApi(request, payload, code) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetchGateway("/api", {
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
    // Mirror the working Windows implementation: return success and client errors;
    // fall back locally only when the gateway itself returns a server error.
    if (response.ok || (response.status >= 400 && response.status < 500 && response.status !== 404)) {
      return response;
    }
    return api(request);
  } catch (_) {
    return api(request);
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
      if (response.status === 404 || response.status >= 500) continue;
      // On an upstream 403/410, fall back locally and rotate user agents.
      // Do not overwrite the meaningful gateway response with a typo-host 404.
      if ([403, 410].includes(response.status)) break;
      return response;
    } catch (error) {
      lastError = error;
    }
  }
  const localResponse = await api(request);
  if (localResponse.ok) return localResponse;
  if (lastResponse) return lastResponse;
  if (lastError) {
    return new Response("Gateway de mídia indisponível: " + (lastError.message || "falha de conexão"), {
      status: 502,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" }
    });
  }
  return localResponse;
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
