/**
 * Regenerates the committed database fixtures used by migrations.test.ts.
 * Run with: pnpm --filter @concord/api exec tsx test/fixtures/make-db-fixtures.ts
 *
 * Each fixture freezes the schema exactly as shipped at one migration count (org-v1.db is
 * ORG_MIGRATIONS.slice(0, 1), and so on) and holds a few rows. When you append a migration, add
 * the matching build() calls below for the new version and commit the files it writes. Do not
 * regenerate an older fixture: a changed fixture hides the regression the test exists to catch.
 */
import { rmSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { ORG_MIGRATIONS, CONTROL_MIGRATIONS } from "../../src/schema.js";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "db");
mkdirSync(outDir, { recursive: true });

function build(path: string, migrations: readonly string[], seed: (db: DatabaseSync) => void): void {
  for (const suffix of ["", "-wal", "-shm"]) {
    if (existsSync(path + suffix)) rmSync(path + suffix);
  }
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = DELETE; PRAGMA foreign_keys = OFF;");
  for (let i = 0; i < migrations.length; i++) {
    db.exec("BEGIN");
    db.exec(migrations[i]!);
    db.exec(`PRAGMA user_version = ${i + 1}`);
    db.exec("COMMIT");
  }
  db.exec("PRAGMA foreign_keys = ON");
  seed(db);
  db.exec("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode = DELETE;");
  db.close();
}

build(join(outDir, "org-v1.db"), ORG_MIGRATIONS.slice(0, 1), (db) => {
  db.exec("INSERT INTO meta (key, value) VALUES ('fixture', 'org-v1')");
  db.exec(`INSERT INTO assets (id, network, code, issuer, name, decimals, start_mode, state, created_at)
    VALUES ('usd-mainnet', 'mainnet', 'USD', 'GISSUER1', 'US Dollar', 7, 'baseline', 'ready', '2024-01-01T00:00:00Z')`);
  db.exec(`INSERT INTO events (id, asset_id, kind, ledger, closed_at, tx_hash, from_addr, to_addr, amount, authorized)
    VALUES ('e1', 'usd-mainnet', 'transfer', 100, '2024-01-02T00:00:00Z', 'tx1', 'GA', 'GB', '1000', 1)`);
  db.exec(`INSERT INTO openings (asset_id, address, amount, authorized, as_of_ledger)
    VALUES ('usd-mainnet', 'GA', '5000', 1, 90)`);
  db.exec(`INSERT INTO registers (asset_id, as_of, source, sha256, issues, imported_by, imported_at)
    VALUES ('usd-mainnet', '2024-01-03', 'upload', 'abc', '[]', 'u1', '2024-01-03T00:00:00Z')`);
  db.exec(`INSERT INTO register_positions (register_id, holder_id, holder_name, account, units, status)
    VALUES (1, 'h1', 'Holder One', 'GA', '4000', 'ok')`);
});

build(join(outDir, "control-v1.db"), CONTROL_MIGRATIONS.slice(0, 1), (db) => {
  db.exec(`INSERT INTO users (id, email, name, email_verified, created_at)
    VALUES ('u1', 'alice@example.org', 'Alice', 1, '2024-01-01T00:00:00Z')`);
  db.exec(`INSERT INTO orgs (id, name, created_at) VALUES ('o1', 'Org One', '2024-01-01T00:00:00Z')`);
  db.exec(`INSERT INTO memberships (org_id, user_id, role, created_at)
    VALUES ('o1', 'u1', 'owner', '2024-01-01T00:00:00Z')`);
  db.exec(`INSERT INTO credentials (user_id, kind, subject, secret, updated_at)
    VALUES ('u1', 'password', NULL, 'scrypt$1$1$1$salt$hash', '2024-01-01T00:00:00Z')`);
});

console.log("Wrote fixtures to", outDir);
