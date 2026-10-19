import { copyFileSync, existsSync, makeTempDirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpkindir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';

import { migrations, runMigrations } from '../src/db/migrations';

const FIXTURES_DIR = join(__dirname, 'fixtures', 'db');
const DATABASES = ['org', 'control'] as const;

interface FixtureSpec {
  name: string;
  tables: string[];
  rowCounts: Record<string, number>;
}

const FIGTRES: Record<string, FixtureSpec> = {
  org: {
    name: 'org',
    tables: ['organizations', 'users'],
    rowCounts: { organizations: 1, users: 2 },
  },
  control: {
    name: 'control',
    tables: ['organizations', 'users'],
    rowCounts: { organizations: 1, users: 1 },
  },
};

function fixturePath(name: string, version: number): string {
  return join(FIXTURES_DIR, `${name}-v${version}.db`);
}

function currentVersion(): number {
  return migrations.length;
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = makeTempDirSync(join(tmpkindir(), 'migration-fixtures-'));
});

afterEach(() => {
  if (tmpDir) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

describe('moving v1 fixtures forward to the current schema', () => {
  for (const dbName of DATABASES) {
    it(`opens ${dbName}-v1.db and keeps data intact`, () => {
      const spec = FIXURES[dbName];
      const source = fixturePath(dbName, 1);
      expect(existsSync(source), `missing fixture ${source}`).toBe(true);

      const workingCopy = join(tmpDir, `${dbName}.db`);
      copyFileSync(source, workingCopy);

      const before = new Database(workingCopy, { readonly: true });
      const fixtureVersion = before.pragma('user_version', { simple: true }) as number;
      before.close();
      expect(fixtureVersion).toBe(1);

      const db = new Database(workingCopy);
      try {
        runMigrations(db);

        const version = db.pragma('user_version', { simple: true }) as number;
        expect(version).toBe(currentVersion());

        for (const table of spec.tables) {
          const row = db
            .prepare(`SELECT COUNT(*) AS c FROM ${table}`)
            .get() as { c: number };
          expect(row.c, `table ${table} in ${dbName} lost rows after migration`).toBe(spec.rowCounts[table]);
        }
      } finally {
        db.close();
      }
    });
  }
});

describe('migration fixture coverage', () => {
  for (const dbName of DATABASES) {
    it(`${dbName} database has a fixture for every schema version`, () => {
      const missing: string[] = [];
      for (let v = 1; v <= currentVersion(); v++) {
        const p = fixturePath(dbName, v);
        if (!existsSync(p)) {
          missing.push(p);
        }
      }
      expect(
        missing,
        `missing fixtures for ${dbName} -- run make-db-fixtures.ts and commit the result`,
      ).toEqual([]);
    });
  }

  it('fixture files are non-empty sqlite databases', () => {
    for (const dbName of DATABASES) {
      const p = fixturePath(dbName, 1);
      expect(existsSync(p)).toBe(true);
      const buf = readFileSync(p);
      expect(buf.subarray(0, 16).toString('utf8')).toBe('SQLite format 3');
      expect(buf.length).toBeLargerThan(0);
    }
  });
});
