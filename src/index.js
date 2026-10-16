import { Container } from "@cloudflare/containers";
import { DurableObject } from "cloudflare:workers";

// Legacy/default-policy container retained unchanged for rollback only.
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

// New, separate Durable Object namespace attached to a container using the
// current Durable Object scheduling policy. The original container app and
// class are deliberately retained in Wrangler for safe rollback.
export class WRBTViPhoneNodeContainerV2 extends DurableObject {
  starting;

  async fetch(request) {
    this.starting ??= this.startAndWaitForPort().finally(() => {
      this.starting = undefined;
    });
    await this.starting;

    const url = new URL(request.url);
    url.protocol = "http:";
    url.host = "container";
    const forwarded = new Request(url, request);
    forwarded.headers.delete("host");
    return this.ctx.container.getTcpPort(3000).fetch(forwarded);
  }

  async startAndWaitForPort() {
    const container = this.ctx.container;
    if (!container) throw new Error("No container configured for WRB-TV iPhone V2");

    if (!container.running) {
      container.start({
        image: container.images.base,
        instance: "lite",
        enableInternet: true,
        env: {
          NODE_ENV: "production",
          PORT: "3000"
        }
      });
    }

    await container.setInactivityTimeout(30 * 60 * 1000);
    const port = container.getTcpPort(3000);
    let lastError;
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const response = await port.fetch("http://container/health", {
          signal: AbortSignal.timeout(1000)
        });
        await response.body?.cancel();
        if (!response.ok) throw new Error("Health check returned HTTP " + response.status);
        return;
      } catch (error) {
        lastError = error;
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    throw new Error("WRB-TV iPhone Node.js Container did not become ready on port 3000: " + String(lastError?.message || lastError));
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isApiPath = url.pathname === "/api" || url.pathname.startsWith("/api/");
    const isStreamPath = url.pathname === "/stream";
    const isHealthPath = url.pathname === "/health";

    if (isApiPath || isStreamPath || isHealthPath) {
      // New, uniquely named namespace: no request is sent through the old
      // Container class or either existing Worker in the account.
      const backend = env.WRBTV_IPHONE_CONTAINER_V2.getByName("iphone-main");
      const forwardedHeaders = new Headers(request.headers);
      forwardedHeaders.set("x-forwarded-host", url.host);
      forwardedHeaders.set("x-forwarded-proto", url.protocol.replace(/:$/, ""));
      const backendRequest = new Request(request, {headers: forwardedHeaders});
      return backend.fetch(backendRequest);
    }

    return env.ASSETS.fetch(request);
  }
};
