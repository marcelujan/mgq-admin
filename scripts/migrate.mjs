import { Pool } from "@neondatabase/serverless";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const { DATABASE_URL, VERCEL_ENV, FORCE_MIGRATE } = process.env;

if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL");
  process.exit(1);
}

// Seguridad: por defecto NO migra en producción
if (VERCEL_ENV === "production" && FORCE_MIGRATE !== "1") {
  console.log("Skipping migrations in production (set FORCE_MIGRATE=1 to override).");
  process.exit(0);
}

const migrationsDir = path.join(process.cwd(), "migrations");
const pool = new Pool({ connectionString: DATABASE_URL });

async function ensureTable(client) {
  await client.query(`
    create table if not exists schema_migrations (
      id text primary key,
      applied_at timestamptz not null default now()
    );
  `);
}

async function main() {
  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const client = await pool.connect();
  try {
    await client.query("begin");
    await ensureTable(client);

    const { rows } = await client.query("select id from schema_migrations order by id");
    const applied = new Set(rows.map((r) => r.id));

    for (const file of files) {
      if (applied.has(file)) continue;

      const sql = await readFile(path.join(migrationsDir, file), "utf8");
      console.log(`Applying migration: ${file}`);
      await client.query(sql);
      await client.query("insert into schema_migrations (id) values ($1)", [file]);
    }

    await client.query("commit");
    console.log("Migrations complete.");
  } catch (e) {
    await client.query("rollback");
    console.error("Migration failed, rolled back.", e);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
