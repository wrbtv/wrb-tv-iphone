import api from "../netlify/functions/api.mjs";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // The iPhone PWA uses its own API implementation, based on the Android
    // local_server.dart flow: the 0022/PFAST server pools, HTTP retries with
    // alternate User-Agents, login/categories, and the HLS/media proxy all run
    // through this project's own Worker. Do not route these codes to another
    // Worker or reuse another project's gateway.
    if (url.pathname === "/api" || url.pathname.startsWith("/api/") ||
        url.pathname === "/stream" || request.method === "OPTIONS") {
      return api(request);
    }

    return env.ASSETS.fetch(request);
  }
};
