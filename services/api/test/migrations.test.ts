import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Db } from "../src/db.js";
import { CONTROL_MIGRATIONS, ORG_MIGRATIONS } from "../src/schema.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "db");

/** Open a private copy of a committed fixture with the current migration list. */
function upgraded<T>(name: string, migrations: readonly string[], inspect: (db: Db) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "concord-upgrade-"));
  try {
    const path = join(dir, name);
    copyFileSync(join(fixtures, name), path);
    const db = new Db(path, migrations);
    try {
      expect(db.get<{ user_version: number }>("PRAGMA user_version")?.user_version).toBe(migrations.length);
      return inspect(db);
    } finally {
      db.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("databases written by earlier builds", () => {
  it("opens the v1 workspace database with the current migrations and keeps its rows", () => {
    upgraded("org-v1.db", ORG_MIGRATIONS, (db) => {
      expect(db.get<{ value: string }>("SELECT value FROM meta WHERE key = 'fixture'")?.value).toBe("org-v1");
      expect(db.get<{ amount: string }>("SELECT amount FROM events WHERE id = 'e1'")?.amount).toBe("1000");
      expect(db.get<{ units: string }>("SELECT units FROM register_positions WHERE holder_id = 'h1'")?.units).toBe("4000");
      expect(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM openings")?.n).toBe(1);
    });
  });

  it("opens the v1 control database with the current migrations and keeps its rows", () => {
    upgraded("control-v1.db", CONTROL_MIGRATIONS, (db) => {
      expect(db.get<{ name: string }>("SELECT name FROM users WHERE id = 'u1'")?.name).toBe("Alice");
      expect(db.get<{ role: string }>("SELECT role FROM memberships WHERE user_id = 'u1'")?.role).toBe("owner");
      expect(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM credentials")?.n).toBe(1);
    });
  });

  it("has an upgrade fixture for every migration version", () => {
    // Appending a migration makes this fail until make-db-fixtures.ts has written, and the commit
    // includes, a database frozen at the new version.
    const missing: string[] = [];
    for (const [kind, migrations] of [["org", ORG_MIGRATIONS], ["control", CONTROL_MIGRATIONS]] as const) {
      for (let version = 1; version <= migrations.length; version++) {
        const name = `${kind}-v${version}.db`;
        if (!existsSync(join(fixtures, name))) missing.push(name);
      }
    }
    expect(missing, "run test/fixtures/make-db-fixtures.ts and commit the databases it writes").toEqual([]);
  });
});
