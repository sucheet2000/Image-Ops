import { promises as fs } from "node:fs";
import path from "node:path";
import { Client } from "pg";

type Command = "up" | "down" | "status";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "infra/sql");
const MIGRATION_TABLE = "schema_migrations";

function resolveCommand(value: string | undefined): Command {
  if (value === "up" || value === "down" || value === "status") {
    return value;
  }
  throw new Error(`Unknown migration command "${value || ""}". Use: up | down | status`);
}

function getConnectionString(): string {
  const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("POSTGRES_URL (or DATABASE_URL) is required to run migrations.");
  }
  return connectionString;
}

async function listUpMigrations(): Promise<string[]> {
  const entries = await fs.readdir(MIGRATIONS_DIR);
  return entries
    .filter((entry) => /^\d+_.+\.up\.sql$/.test(entry))
    .sort((left, right) => {
      const leftMatch = left.match(/^(\d+)_(.+)\.up\.sql$/);
      const rightMatch = right.match(/^(\d+)_(.+)\.up\.sql$/);
      const leftOrder = leftMatch ? Number.parseInt(leftMatch[1], 10) : Number.MAX_SAFE_INTEGER;
      const rightOrder = rightMatch ? Number.parseInt(rightMatch[1], 10) : Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      const leftRemainder = leftMatch?.[2] || left;
      const rightRemainder = rightMatch?.[2] || right;
      return leftRemainder.localeCompare(rightRemainder);
    });
}

async function readMigrationSql(fileName: string): Promise<string> {
  return fs.readFile(path.join(MIGRATIONS_DIR, fileName), "utf8");
}

async function ensureMigrationTable(client: Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function getAppliedMigrations(client: Client): Promise<string[]> {
  const result = await client.query<{ name: string }>(
    `SELECT name FROM ${MIGRATION_TABLE} ORDER BY name ASC`
  );
  return result.rows.map((row) => row.name);
}

async function migrateUp(client: Client): Promise<void> {
  const upMigrations = await listUpMigrations();
  const appliedSet = new Set(await getAppliedMigrations(client));
  const pending = upMigrations.filter((name) => !appliedSet.has(name));

  if (pending.length === 0) {
    // eslint-disable-next-line no-console
    console.log("No pending migrations.");
    return;
  }

  for (const name of pending) {
    const sql = await readMigrationSql(name);
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query(`INSERT INTO ${MIGRATION_TABLE} (name) VALUES ($1)`, [name]);
      await client.query("COMMIT");
      // eslint-disable-next-line no-console
      console.log(`Applied ${name}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw new Error(`Failed applying ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

async function migrateDown(client: Client): Promise<void> {
  const result = await client.query<{ name: string }>(
    `SELECT name FROM ${MIGRATION_TABLE} ORDER BY applied_at DESC LIMIT 1`
  );
  const latest = result.rows[0]?.name;
  if (!latest) {
    // eslint-disable-next-line no-console
    console.log("No applied migrations to roll back.");
    return;
  }

  const downName = latest.replace(/\.up\.sql$/, ".down.sql");
  if (downName === latest) {
    throw new Error(`Latest migration "${latest}" does not use .up.sql naming.`);
  }

  const downPath = path.join(MIGRATIONS_DIR, downName);
  try {
    await fs.access(downPath);
  } catch {
    throw new Error(`Missing rollback file for ${latest}: ${downName}`);
  }

  const sql = await readMigrationSql(downName);
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query(`DELETE FROM ${MIGRATION_TABLE} WHERE name = $1`, [latest]);
    await client.query("COMMIT");
    // eslint-disable-next-line no-console
    console.log(`Rolled back ${latest}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw new Error(`Failed rolling back ${latest}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function migrateStatus(client: Client): Promise<void> {
  const upMigrations = await listUpMigrations();
  const applied = await getAppliedMigrations(client);
  const appliedSet = new Set(applied);
  const pending = upMigrations.filter((name) => !appliedSet.has(name));

  // eslint-disable-next-line no-console
  console.log("Applied migrations:");
  if (applied.length === 0) {
    // eslint-disable-next-line no-console
    console.log("  (none)");
  } else {
    for (const name of applied) {
      // eslint-disable-next-line no-console
      console.log(`  - ${name}`);
    }
  }

  // eslint-disable-next-line no-console
  console.log("Pending migrations:");
  if (pending.length === 0) {
    // eslint-disable-next-line no-console
    console.log("  (none)");
  } else {
    for (const name of pending) {
      // eslint-disable-next-line no-console
      console.log(`  - ${name}`);
    }
  }
}

async function main(): Promise<void> {
  const command = resolveCommand(process.argv[2]);
  const client = new Client({ connectionString: getConnectionString() });
  await client.connect();

  try {
    await ensureMigrationTable(client);
    if (command === "up") {
      await migrateUp(client);
      return;
    }
    if (command === "down") {
      await migrateDown(client);
      return;
    }
    await migrateStatus(client);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
