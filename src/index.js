import api from "../netlify/functions/api.mjs";
import { DurableObject } from "cloudflare:workers";

// Keep the two existing Durable Object class names and SQLite namespaces
// declared so this change does not delete or tombstone provisioned namespaces.
// They are not used by the request path. The API now runs directly in this
// Worker and no longer depends on a Cloudflare Container.
export class WRBTViPhoneNodeContainer extends DurableObject {}
export class WRBTViPhoneNodeContainerV2 extends DurableObject {}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "wrbtv-iphone-api",
        runtime: "cloudflare-worker"
      }, {
        headers: {
          "cache-control": "no-store",
          "access-control-allow-origin": "*"
        }
      });
    }

    const isApiPath = url.pathname === "/api" || url.pathname.startsWith("/api/");
    const isStreamPath = url.pathname === "/stream";

    if (isApiPath || isStreamPath) {
      // api.mjs uses Web Request/Response, fetch and URL APIs, all available
      // in Workers. Direct execution removes the fragile Container startup path.
      return api(request);
    }

    return env.ASSETS.fetch(request);
  }
};
