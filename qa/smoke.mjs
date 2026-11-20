import { createAppServer } from "../src/server.mjs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workDir = await mkdtemp(join(tmpdir(), "oakline-smoke-"));
const databaseFile = join(workDir, "smoke.sqlite");

const server = await createAppServer({
  databaseFile,
  credentials: {
    viewerPassword: "smoke-viewer-passphrase-16",
    editorPassword: "smoke-editor-passphrase-16"
  },
  log: () => {}
});

server.listen(0, "127.0.0.1");
const { once } = await import("node:events");
await once(server, "listening");
const base = `http://127.0.0.1:${server.address().port}`;

try {
  const page = await fetch(`${base}/`);
  const script = await fetch(`${base}/app.mjs`);
  const live = await fetch(`${base}/health/live`);
  const ready = await fetch(`${base}/health/ready`);

  if (page.status !== 200 || script.status !== 200 || live.status !== 200 || ready.status !== 200) {
    throw new Error(`Smoke check failed: ${page.status}, ${script.status}, ${live.status}, ${ready.status}`);
  }

  const readyData = await ready.json();
  if (readyData.status !== "pass") throw new Error("Readiness did not report pass");

  console.log(JSON.stringify({
    gate: "smoke",
    status: "pass",
    checks: {
      staticPage: page.status,
      moduleScript: script.status,
      live: live.status,
      ready: readyData.status
    }
  }, null, 2));
} finally {
  await new Promise(resolvePromise => server.close(resolvePromise));
  await rm(workDir, { recursive: true, force: true });
}
