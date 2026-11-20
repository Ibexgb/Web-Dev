import { connectSqlite } from "./sqlite.mjs";
import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual
} from "node:crypto";

const SESSION_MS = 20 * 60 * 1000;
const ROLES = new Set(["viewer", "editor"]);

export async function createAuthStore(filenameOrDb, { viewerPassword, editorPassword }, providedDb = null) {
  const passedDb = providedDb ?? (typeof filenameOrDb === "object" && filenameOrDb !== null ? filenameOrDb : null);
  const db = passedDb ?? await connectSqlite(typeof filenameOrDb === "object" ? ":memory:" : filenameOrDb);
  db.exec("PRAGMA foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS demo_users (
      username TEXT PRIMARY KEY,
      role TEXT NOT NULL CHECK (role IN ('viewer', 'editor')),
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS demo_sessions (
      token_hash TEXT PRIMARY KEY,
      username TEXT NOT NULL REFERENCES demo_users(username),
      csrf_token TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
  `);

  function hashPassword(password, salt) {
    return scryptSync(password, Buffer.from(salt, "hex"), 64);
  }
  function hashToken(token) {
    return createHash("sha256").update(token).digest("hex");
  }
  function makeToken() {
    return randomBytes(32).toString("hex");
  }

  function provisionUser(username, role, password) {
    if (!ROLES.has(role) || typeof password !== "string" || password.length < 16) {
      throw new Error("Invalid local demo account configuration");
    }
    if (db.get("SELECT username FROM demo_users WHERE username = ?", [username])) return;
    const salt = randomBytes(16).toString("hex");
    const hash = hashPassword(password, salt).toString("hex");
    db.run("INSERT INTO demo_users (username, role, password_salt, password_hash) VALUES (?, ?, ?, ?)", [username, role, salt, hash]);
  }

  provisionUser("viewer", "viewer", viewerPassword);
  provisionUser("editor", "editor", editorPassword);

  const findUserSql = `
    SELECT username, role, password_salt, password_hash
    FROM demo_users WHERE username = ?
  `;
  const findSessionSql = `
    SELECT u.username, u.role, s.csrf_token AS csrfToken, s.expires_at AS expiresAt
    FROM demo_sessions s
    JOIN demo_users u ON u.username = s.username
    WHERE s.token_hash = ?
  `;

  const dummySalt = randomBytes(16).toString("hex");
  const dummyHash = hashPassword("not-a-real-account-password", dummySalt);

  function login(username, password) {
    if (
      typeof username !== "string" || typeof password !== "string" ||
      username.length > 80 || password.length > 1024
    ) {
      return null;
    }

    const user = db.get(findUserSql, [username]);
    const submittedHash = hashPassword(password, user?.password_salt ?? dummySalt);
    const expectedHash = user ? Buffer.from(user.password_hash, "hex") : dummyHash;

    if (!timingSafeEqual(submittedHash, expectedHash) || !user) return null;

    db.run("DELETE FROM demo_sessions WHERE expires_at <= ?", [Date.now()]);
    const token = makeToken();
    const csrfToken = makeToken();
    db.run("INSERT INTO demo_sessions (token_hash, username, csrf_token, expires_at) VALUES (?, ?, ?, ?)", [hashToken(token), user.username, csrfToken, Date.now() + SESSION_MS]);

    return { token, username: user.username, role: user.role, csrfToken };
  }

  function getSession(token) {
    if (typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token)) return null;
    const session = db.get(findSessionSql, [hashToken(token)]);
    if (!session) return null;
    if (session.expiresAt <= Date.now()) {
      db.run("DELETE FROM demo_sessions WHERE token_hash = ?", [hashToken(token)]);
      return null;
    }
    return { username: session.username, role: session.role, csrfToken: session.csrfToken };
  }

  return {
    login,
    getSession,
    logout: token => {
      if (typeof token === "string" && /^[0-9a-f]{64}$/.test(token)) {
        db.run("DELETE FROM demo_sessions WHERE token_hash = ?", [hashToken(token)]);
      }
    },
    close: () => {}
  };
}

export function permitted(role, operation) {
  const policy = {
    "projects:read": ["viewer", "editor"],
    "projects:create": ["editor"],
    "projects:update": ["editor"],
    "projects:delete": ["editor"]
  };
  return policy[operation]?.includes(role) ?? false;
}


