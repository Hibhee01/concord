import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { Db } from "../src/db.js";
import { CONTROL_MIGRATIONS, ORG_MIGRATIONS } from "../src/schema.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "fixtures", "db");

function withCopy<T>(name: string, fn: (path: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "migrations-"));
  try {
    const path = join(dir, name);
    copyFileSync(join(fixtures, name), path);
    return fn(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function userVersion(path: string): number {
  const raw = new DatabaseSync(path);
  try {
    const row = raw.prepare("PRAGMA user_version").get() as { user_version: number };
    return Number(row.user_version);
  } finally {
    raw.close();
  }
}

test("org-v1.db opens with current migrations and keeps its data", () => {
  withCopy("org-v1.db", (path) => {
    const db = new Db(path, ORG_MIGRATIONS);
    try {
      assert.equal(db.get<{ value: string }>("SELECT value FROM meta WHERE key = 'fixture'")?.value, "org-v1");
      assert.equal(db.get<{ amount: string }>("SELECT amount FROM events WHERE id = 'e1'")?.amount, "1000");
      assert.equal(db.get<{ units: string }>("SELECT units FROM register_positions WHERE holder_id = 'h1'")?.units, "4000");
      assert.equal(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM openings")?.n, 1);
    } finally {
      db.close();
    }
    assert.equal(userVersion(path), ORG_MIGRATIONS.length);
  });
});

test("control-v1.db opens with current migrations and keeps its data", () => {
  withCopy("control-v1.db", (path) => {
    const db = new Db(path, CONTROL_MIGRATIONS);
    try {
      assert.equal(db.get<{ name: string }>("SELECT name FROM users WHERE id = 'u1'")?.name, "Alice");
      assert.equal(db.get<{ role: string }>("SELECT role FROM memberships WHERE user_id = 'u1'")?.role, "owner");
      assert.equal(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM credentials")?.n, 1);
    } finally {
      db.close();
    }
    assert.equal(userVersion(path), CONTROL_MIGRATIONS.length);
  });
});

test("every shipped migration has a committed v1 fixture or a dedicated fixture per version", () => {
  const files = new Set(readdirSync(fixtures));
  for (const name of ["org-v1.db", "control-v1.db"]) {
    assert.ok(files.has(name), `missing fixture ${name}; run make-db-fixtures.ts`);
  }
});

test("fixture generator script is present and references both schemas", () => {
  const src = readFileSync(join(here, "fixtures", "make-db-fixtures.ts"), "utf8");
  assert.match(src, /org-v1\.db/);
  assert.match(src, /control-v1\.db/);
});
