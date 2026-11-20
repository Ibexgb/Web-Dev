import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";

function routeGroup(rawUrl) {
  const path = new URL(rawUrl, "http://localhost").pathname;
  if (path === "/api/login") return "auth:login";
  if (path === "/api/logout") return "auth:logout";
  if (path === "/api/session") return "auth:session";
  if (path === "/api/services") return "services:list";
  if (path === "/api/projects") return "projects:collection";
  if (/^\/api\/projects\/[0-9a-f-]{36}$/.test(path)) return "projects:item";
  if (path === "/health/live") return "health:live";
  if (path === "/health/ready") return "health:ready";
  if (path === "/" || path === "/app.mjs") return "static";
  return "other";
}

export function createTelemetry({ log = entry => console.log(JSON.stringify(entry)) } = {}) {
  const histogram = monitorEventLoopDelay({ resolution: 20 });
  histogram.enable();
  const latencies = [];
  let requests = 0;

  function observe({ method, rawUrl, status, durationMs }) {
    requests++;
    latencies.push(durationMs);
    if (latencies.length > 200) latencies.shift();

    log({
      event: "http_request",
      requestId: randomUUID(),
      method,
      route: routeGroup(rawUrl),
      statusClass: `${Math.floor(status / 100)}xx`,
      status,
      durationMs: Number(durationMs.toFixed(2))
    });
  }

  function snapshot() {
    const sorted = [...latencies].sort((a, b) => a - b);
    const percentile = fraction => {
      if (sorted.length === 0) return null;
      const index = Math.ceil(fraction * sorted.length) - 1;
      return Number(sorted[Math.max(0, index)].toFixed(2));
    };

    histogram.disable();
    const eventLoop = histogram.mean / 1e6;
    histogram.reset();
    histogram.enable();

    return {
      requests,
      recentRequests: sorted.length,
      p95RequestMs: percentile(0.95),
      meanEventLoopDelayMs: Number.isFinite(eventLoop) ? Number(eventLoop.toFixed(2)) : null,
      rssBytes: process.memoryUsage().rss
    };
  }

  return { observe, snapshot };
}

export function startGracefulShutdown(server, { timeoutMs = 5000 } = {}) {
  let shuttingDown = false;
  async function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), timeoutMs).unref();
  }
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
