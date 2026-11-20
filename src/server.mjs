import http from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRepository } from "./db.mjs";
import { createAuthStore, permitted } from "./auth.mjs";
import { createTelemetry } from "./ops.mjs";
import { connectSqlite } from "./sqlite.mjs";

const SESSION_COOKIE = "oakline_demo_sid";
const MAX_BODY_BYTES = 8192;
const ROOT = dirname(fileURLToPath(import.meta.url));

function json(res, status, data, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers
  });
  res.end(JSON.stringify(data));
}

function cookieToken(req) {
  return (req.headers.cookie ?? "").split(";")
    .map(part => part.trim().split("="))
    .filter(([name]) => name === SESSION_COOKIE)
    .at(0)?.[1] ?? null;
}

function sessionCookie(token) {
  return [`${SESSION_COOKIE}=${token}`, "HttpOnly", "SameSite=Strict", "Path=/", "Max-Age=1200"].join("; ");
}

function expiredCookie() {
  return [`${SESSION_COOKIE}=`, "HttpOnly", "SameSite=Strict", "Path=/", "Max-Age=0"].join("; ");
}

async function readBody(req) {
  const media = (req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
  if (media !== "application/json") return { status: 415, code: "UNSUPPORTED_MEDIA_TYPE" };

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) return { status: 413, code: "CONTENT_TOO_LARGE" };
    chunks.push(chunk);
  }

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
    return { data: JSON.parse(text) };
  } catch {
    return { status: 400, code: "INVALID_JSON" };
  }
}

function validateProject(data) {
  const errors = {};
  if (!data || typeof data !== "object" || Array.isArray(data)) return { request: "Expected an object." };
  if (!["kitchen", "bathroom", "basement", "outdoors"].includes(data.serviceId)) {
    errors.serviceId = "Choose a supported service.";
  }
  if (typeof data.label !== "string" || data.label.trim().length === 0 || data.label.length > 80) {
    errors.label = "Enter a label of 1–80 characters.";
  }
  for (const key of Object.keys(data)) {
    if (!["serviceId", "label"].includes(key)) errors.request = "Unsupported field.";
  }
  return errors;
}

export async function createAppServer({
  providedDb = null,
  databaseFile = ":memory:",
  credentials,
  log
} = {}) {
  const db = providedDb ?? await connectSqlite(databaseFile);
  const repository = await createRepository(databaseFile, db);
  const auth = await createAuthStore(db, credentials);
  const telemetry = createTelemetry({ log });

  const server = http.createServer(async (req, res) => {
    const started = performance.now();
    let status = 500;

    try {
      status = await handleRequest(req, res);
    } catch {
      if (!res.headersSent && !res.destroyed) status = 500, json(res, 500, { code: "INTERNAL_ERROR" });
      else res.destroy();
    } finally {
      telemetry.observe({
        method: req.method,
        rawUrl: req.url ?? "/",
        status,
        durationMs: performance.now() - started
      });
    }
  });

  async function handleRequest(req, res) {
    const path = new URL(req.url, "http://localhost").pathname;
    const method = req.method;

    if (Object.hasOwn({ "/": true, "/app.mjs": true }, path)) {
      if (method !== "GET") {
        json(res, 405, { code: "METHOD_NOT_ALLOWED" }, { Allow: "GET" });
        return 405;
      }
      const file = path === "/" ? "index.html" : "app.mjs";
      const type = path === "/" ? "text/html; charset=utf-8" : "text/javascript; charset=utf-8";
      const contents = await readFile(join(ROOT, "../public", file));
      res.writeHead(200, { "Content-Type": type, "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" });
      res.end(contents);
      return 200;
    }

    if (path === "/health/live") {
      json(res, 200, { status: "pass" });
      return 200;
    }

    if (path === "/health/ready") {
      const snapshot = telemetry.snapshot();
      json(res, 200, { status: "pass", telemetry: snapshot });
      return 200;
    }

    const address = server.address();
    const expectedOrigin = `http://127.0.0.1:${address?.port}`;
    if (["POST", "PATCH", "DELETE"].includes(method) && req.headers.origin !== expectedOrigin) {
      json(res, 403, { code: "ORIGIN_DENIED" });
      return 403;
    }

    if (path === "/api/services" && method === "GET") {
      json(res, 200, { services: repository.listServices() });
      return 200;
    }

    if (path === "/api/login" && method === "POST") {
      const body = await readBody(req);
      if (body.status) {
        json(res, body.status, { code: body.code });
        return body.status;
      }
      const result = auth.login(body.data?.username, body.data?.password);
      if (!result) {
        json(res, 401, { code: "INVALID_CREDENTIALS", message: "Incorrect username or password." });
        return 401;
      }
      json(res, 200, {
        user: { username: result.username, role: result.role },
        csrfToken: result.csrfToken
      }, { "Set-Cookie": sessionCookie(result.token) });
      return 200;
    }

    const token = cookieToken(req);
    const session = auth.getSession(token);
    if (path.startsWith("/api/") && !session) {
      json(res, 401, { code: "AUTHENTICATION_REQUIRED" });
      return 401;
    }

    if (path === "/api/session" && method === "GET") {
      json(res, 200, {
        user: { username: session.username, role: session.role },
        csrfToken: session.csrfToken
      });
      return 200;
    }

    if (["POST", "PATCH", "DELETE"].includes(method) && req.headers["x-csrf-token"] !== session.csrfToken) {
      json(res, 403, { code: "CSRF_DENIED" });
      return 403;
    }

    if (path === "/api/logout" && method === "POST") {
      auth.logout(token);
      json(res, 200, { signedOut: true }, { "Set-Cookie": expiredCookie() });
      return 200;
    }

    if (path === "/api/projects") {
      if (method === "GET") {
        if (!permitted(session.role, "projects:read")) {
          json(res, 403, { code: "FORBIDDEN" });
          return 403;
        }
        json(res, 200, { projects: repository.listProjects() });
        return 200;
      }

      if (method === "POST") {
        if (!permitted(session.role, "projects:create")) {
          json(res, 403, { code: "FORBIDDEN" });
          return 403;
        }
        const body = await readBody(req);
        if (body.status) {
          json(res, body.status, { code: body.code });
          return body.status;
        }
        const errors = validateProject(body.data);
        if (Object.keys(errors).length) {
          json(res, 422, { code: "VALIDATION_ERROR", fieldErrors: errors });
          return 422;
        }
        const project = repository.createProject({ serviceId: body.data.serviceId, label: body.data.label.trim() });
        json(res, 201, { project });
        return 201;
      }

      json(res, 405, { code: "METHOD_NOT_ALLOWED" }, { Allow: "GET, POST" });
      return 405;
    }

    const match = /^\/api\/projects\/([0-9a-f-]{36})$/.exec(path);
    if (match) {
      const id = match[1];
      if (method === "PATCH") {
        if (!permitted(session.role, "projects:update")) {
          json(res, 403, { code: "FORBIDDEN" });
          return 403;
        }
        const body = await readBody(req);
        if (
          body.status || !body.data || typeof body.data !== "object" ||
          Array.isArray(body.data) || Object.keys(body.data).length !== 1 ||
          body.data.status !== "reviewed"
        ) {
          json(res, 422, { code: "VALIDATION_ERROR" });
          return 422;
        }
        const project = repository.markReviewed(id);
        json(res, project ? 200 : 404, project ? { project } : { code: "NOT_FOUND" });
        return project ? 200 : 404;
      }

      if (method === "DELETE") {
        if (!permitted(session.role, "projects:delete")) {
          json(res, 403, { code: "FORBIDDEN" });
          return 403;
        }
        const removed = repository.removeProject(id);
        json(res, removed ? 200 : 404, removed ? { deleted: true } : { code: "NOT_FOUND" });
        return removed ? 200 : 404;
      }

      json(res, 405, { code: "METHOD_NOT_ALLOWED" }, { Allow: "PATCH, DELETE" });
      return 405;
    }

    json(res, 404, { code: "NOT_FOUND" });
    return 404;
  }

  server.requestTimeout = 10_000;
  server.headersTimeout = 5_000;
  server.on("close", () => {
    auth.close();
    repository.close();
  });
  return server;
}
