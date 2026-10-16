import { Container, getContainer } from "@cloudflare/containers";

export class WRBTViPhoneNodeContainer extends Container {
  defaultPort = 3000;
  sleepAfter = "30m";
  enableInternet = true;
  pingEndpoint = "/health";

  envVars = {
    NODE_ENV: "production",
    PORT: "3000"
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isApiPath = url.pathname === "/api" || url.pathname.startsWith("/api/");
    const isStreamPath = url.pathname === "/stream";
    const isHealthPath = url.pathname === "/health";

    // The Node.js Container belongs exclusively to the iPhone project.
    // API calls, 0022/PFAST login, and media/playlist requests are handled
    // by the persistent Node process. UI assets remain served by this Worker.
    if (isApiPath || isStreamPath || isHealthPath) {
      const backend = getContainer(env.WRBTV_IPHONE_CONTAINER, "wrbtv-iphone-node-backend");
      return backend.fetch(request);
    }

    return env.ASSETS.fetch(request);
  }
};
