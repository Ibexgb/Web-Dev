import initSqlJs from "sql.js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

let sqlInitPromise = null;

export async function connectSqlite(filename = ":memory:") {
  sqlInitPromise ??= initSqlJs({
    locateFile: file =>
      new URL(`../node_modules/sql.js/dist/${file}`, import.meta.url).href
  });
  const SQL = await sqlInitPromise;

  const fileBacked = filename !== ":memory:";
  let data;
  if (fileBacked) {
    try {
      data = readFileSync(filename);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      mkdirSync(dirname(filename), { recursive: true });
      data = undefined;
    }
  }

  const db = new SQL.Database(data);
  let closed = false;

  function persist() {
    if (!fileBacked || closed) return;

    const bytes = db.export();
    writeFileSync(filename, Buffer.from(bytes));
  }

  function run(sql, params = []) {
    if (closed) throw new Error("SQLite connection closed");
    db.run(sql, params);
    const changes = db.getRowsModified();
    persist();
    return { changes };
  }

  function all(sql, params = []) {
    if (closed) throw new Error("SQLite connection closed");
    return db.exec(sql, params).flatMap(result =>
      result.values.map(row =>
        Object.fromEntries(result.columns.map((name, index) => [name, row[index]]))
      )
    );
  }

  function get(sql, params = []) {
    return all(sql, params)[0];
  }

  return {
    exec: sql => { if (closed) throw new Error("SQLite connection closed"); db.exec(sql); },
    run,
    all,
    get,
    close: () => { if (!closed) { persist(); db.close(); closed = true; } }
  };
}






