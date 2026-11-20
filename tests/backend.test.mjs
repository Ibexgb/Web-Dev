import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createRepository } from "../src/db.mjs";
import { createAppServer } from "../src/server.mjs";

const credentials = {
  viewerPassword: "viewer-local-passphrase-16",
  editorPassword: "editor-local-passphrase-16"
};

async function withServer(run) {
  const server = await createAppServer({ databaseFile: ":memory:", credentials });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    await run({ server, base });
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

async function login(base, role) {
  const response = await fetch(`${base}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({
      username: role,
      password: credentials[`${role}Password`]
    })
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  const cookie = response.headers.get("set-cookie").split(";")[0];

  return {
    csrf: payload.csrfToken,
    cookie,
    headers: { Cookie: cookie, "x-csrf-token": payload.csrfToken, "Content-Type": "application/json", Origin: base }
  };
}

test("fresh repository seeds services and starts empty", async () => {
  const repo = await createRepository();

  try {
    assert.equal(repo.listServices().length, 4);
    assert.deepEqual(repo.listProjects(), []);
  } finally {
    repo.close();
  }
});

test("project lifecycle is transactional and idempotent", async () => {
  const repo = await createRepository();

  try {
    const project = repo.createProject({ serviceId: "kitchen", label: "Sample kitchen refresh" });
    assert.equal(repo.countEvents(project.id), 1);

    const reviewed = repo.markReviewed(project.id);
    assert.equal(reviewed.status, "reviewed");
    repo.markReviewed(project.id);
    assert.equal(repo.countEvents(project.id), 2);

    assert.equal(repo.removeProject(project.id), true);
    assert.equal(repo.countEvents(project.id), 0);
  } finally {
    repo.close();
  }
});

test("foreign keys and parameterized SQL protect records", async () => {
  const repo = await createRepository();

  try {
    assert.throws(() => repo.createProject({ serviceId: "invalid", label: "bad" }));

    const malicious = "Sample'); DROP TABLE services; --";
    const project = repo.createProject({ serviceId: "basement", label: malicious });
    assert.equal(project.label, malicious);
    assert.equal(repo.listServices().length, 4);
  } finally {
    repo.close();
  }
});

test("file-backed records persist after reopening", async () => {
  const dir = await mkdtemp(join(tmpdir(), "oakline-repo-"));
  const file = join(dir, "test.sqlite");

  try {
    const first = await createRepository(file);
    first.createProject({ serviceId: "outdoors", label: "Persistent fictional project" });
    first.close();

    const second = await createRepository(file);
    try {
      assert.equal(second.listProjects().length, 1);
      assert.equal(second.listProjects()[0].label, "Persistent fictional project");
    } finally {
      second.close();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("health endpoints respond independently before authentication", async () => {
  await withServer(async ({ base }) => {
    for (const path of ["/health/live", "/health/ready"]) {
      const response = await fetch(base + path);
      assert.equal(response.status, 200);
      assert.equal((await response.json()).status, "pass");
    }
  });
});

test("authentication and route permissions are enforced", async () => {
  await withServer(async ({ base }) => {
    const protectedRead = await fetch(`${base}/api/projects`);
    assert.equal(protectedRead.status, 401);

    const viewer = await login(base, "viewer");
    const viewerRead = await fetch(`${base}/api/projects`, { headers: viewer.headers });
    assert.equal(viewerRead.status, 200);

    const viewerCreate = await fetch(`${base}/api/projects`, {
      method: "POST",
      headers: { ...viewer.headers, Origin: base },
      body: JSON.stringify({ serviceId: "kitchen", label: "Viewer denied" })
    });
    assert.equal(viewerCreate.status, 403);

    const editor = await login(base, "editor");
    const created = await fetch(`${base}/api/projects`, {
      method: "POST",
      headers: { ...editor.headers, Origin: base },
      body: JSON.stringify({ serviceId: "kitchen", label: "Lifecycle test" })
    });
    assert.equal(created.status, 201);

    const { project } = await created.json();
    const reviewed = await fetch(`${base}/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { ...editor.headers, Origin: base },
      body: JSON.stringify({ status: "reviewed" })
    });
    assert.equal(reviewed.status, 200);

    const removed = await fetch(`${base}/api/projects/${project.id}`, {
      method: "DELETE",
      headers: editor.headers
    });
    assert.equal(removed.status, 200);
  });
});

test("mutation rejects wrong origin and missing CSRF token", async () => {
  await withServer(async ({ server, base }) => {
    const editor = await login(base, "editor");

    const csrfDenied = await fetch(`${base}/api/projects`, {
      method: "POST",
      headers: { Cookie: editor.cookie, "Content-Type": "application/json", Origin: base },
      body: JSON.stringify({ serviceId: "kitchen", label: "missing csrf" })
    });
    assert.equal(csrfDenied.status, 403);

    const originDenied = await fetch(`${base}/api/projects`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://evil.example"
      },
      body: JSON.stringify({ serviceId: "kitchen", label: "wrong origin" })
    });
    assert.equal(originDenied.status, 403);
    assert.ok(server.listening);
  });
});

test("invalid and malformed requests are rejected safely", async () => {
  await withServer(async ({ base }) => {
    const editor = await login(base, "editor");

    const invalid = await fetch(`${base}/api/projects`, {
      method: "POST",
      headers: { ...editor.headers, Origin: base },
      body: JSON.stringify({ serviceId: "unknown", label: "" })
    });
    assert.equal(invalid.status, 422);
    const invalidBody = await invalid.json();
    assert.ok(invalidBody.fieldErrors.serviceId);
    assert.ok(invalidBody.fieldErrors.label);

    const malformed = await fetch(`${base}/api/projects`, {
      method: "POST",
      headers: { ...editor.headers, Origin: base },
      body: "{not-json"
    });
    assert.equal(malformed.status, 400);

    const unsupported = await fetch(`${base}/api/projects`, {
      method: "POST",
      headers: { ...editor.headers, "Content-Type": "text/plain" },
      body: "text"
    });
    assert.equal(unsupported.status, 415);
  });
});



