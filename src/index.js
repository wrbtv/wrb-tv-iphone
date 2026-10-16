import api from "../netlify/functions/api.mjs";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Only this new Worker handles its own /api endpoints.
    // All UI assets are served from this project's own public directory.
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      return api(request);
    }

    return env.ASSETS.fetch(request);
  }
};
