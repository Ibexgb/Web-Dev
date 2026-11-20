import { randomUUID } from "node:crypto";
import { connectSqlite } from "./sqlite.mjs";

const SERVICES = [
  ["kitchen", "Kitchen Remodeling"],
  ["bathroom", "Bathroom Remodeling"],
  ["basement", "Basement Finishing"],
  ["outdoors", "Outdoor Improvements"]
];

export async function createRepository(filename = ":memory:", providedDb = null) {
  const db = providedDb ?? await connectSqlite(filename);
  db.exec("PRAGMA foreign_keys = ON");

  const version = db.get("PRAGMA user_version").user_version;
  if (version > 1) throw new Error("Unsupported database schema version");

  if (version === 0) {
    db.exec(`
      CREATE TABLE services (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      );

      CREATE TABLE project_requests (
        id TEXT PRIMARY KEY,
        service_id TEXT NOT NULL REFERENCES services(id),
        label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 80),
        status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed')),
        created_at TEXT NOT NULL
      );

      CREATE TABLE project_events (
        id INTEGER PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES project_requests(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL CHECK (event_type IN ('created', 'reviewed')),
        created_at TEXT NOT NULL
      );

      CREATE INDEX idx_projects_created
        ON project_requests(created_at DESC);

      PRAGMA user_version = 1;
    `);
  }

  for (const [id, name] of SERVICES) {
    db.run("INSERT OR IGNORE INTO services (id, name) VALUES (?, ?)", [id, name]);
  }

  const findProjectSql = `
    SELECT p.id, p.service_id AS serviceId, s.name AS serviceName,
           p.label, p.status, p.created_at AS createdAt
    FROM project_requests p
    JOIN services s ON s.id = p.service_id
    WHERE p.id = ?
  `;

  function createProject({ serviceId, label }) {
    const id = randomUUID();
    const createdAt = new Date().toISOString();

    const insertResult = db.run(`
      INSERT INTO project_requests
        (id, service_id, label, status, created_at)
      VALUES (?, ?, ?, 'new', ?)
    `, [id, serviceId, label, createdAt]);

    if (insertResult.changes !== 1) throw new Error("Project insert failed");

    const eventResult = db.run(
      "INSERT INTO project_events (project_id, event_type, created_at) VALUES (?, ?, ?)",
      [id, "created", createdAt]
    );

    if (eventResult.changes !== 1) {
      db.run("DELETE FROM project_requests WHERE id = ?", [id]);
      throw new Error("Project event insert failed; project insert rolled back");
    }

    return db.get(findProjectSql, [id]);
  }

  function markReviewed(id) {
    const existing = db.get(findProjectSql, [id]);
    if (!existing) return null;
    if (existing.status === "reviewed") return existing;

    const result = db.run(
      "UPDATE project_requests SET status = 'reviewed' WHERE id = ? AND status = 'new'",
      [id]
    );

    if (result.changes !== 1) return null;

    const eventResult = db.run(
      "INSERT INTO project_events (project_id, event_type, created_at) VALUES (?, ?, ?)",
      [id, "reviewed", new Date().toISOString()]
    );

    if (eventResult.changes !== 1) {
      db.run("UPDATE project_requests SET status = 'new' WHERE id = ?", [id]);
      throw new Error("Review event insert failed; status update rolled back");
    }

    return db.get(findProjectSql, [id]);
  }

  return {
    listServices: () => db.all("SELECT id, name FROM services ORDER BY name"),
    listProjects: () => db.all(`
      SELECT p.id, p.service_id AS serviceId, s.name AS serviceName,
             p.label, p.status, p.created_at AS createdAt
      FROM project_requests p
      JOIN services s ON s.id = p.service_id
      ORDER BY p.created_at DESC, p.id DESC
    `),
    findProject: id => db.get(findProjectSql, [id]),
    createProject,
    markReviewed,
    removeProject: id => db.run("DELETE FROM project_requests WHERE id = ?", [id]).changes === 1,
    countEvents: id => db.get("SELECT count(*) AS count FROM project_events WHERE project_id = ?", [id]).count,
    close: () => { if (!providedDb) db.close(); }
  };
}
