import "dotenv/config";
import pg from "pg";

const { Client } = pg;

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  fail("DATABASE_URL is missing. Copy .env.example to .env and set DATABASE_URL first.");
}

let target;
try {
  target = new URL(databaseUrl);
} catch {
  fail("DATABASE_URL is not a valid URL.");
}

if (!/^postgres(ql)?:$/.test(target.protocol)) {
  fail("DATABASE_URL must use the postgresql:// protocol.");
}

const host = target.hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
  fail(
    `Refusing to modify non-local database host "${host}". ` +
      "This command is only for local development databases."
  );
}

const role = decodeURIComponent(target.username || "");
const password = decodeURIComponent(target.password || "");
const database = decodeURIComponent(target.pathname.replace(/^\//, "") || "");
const shouldResetRolePassword = process.env.LOCAL_POSTGRES_RESET_ROLE_PASSWORD === "1";

if (!role || !database) {
  fail("DATABASE_URL must include a username and database name.");
}

const adminUrl =
  process.env.LOCAL_POSTGRES_ADMIN_URL?.trim() ||
  `postgresql://${hostForUrl(host)}${target.port ? `:${target.port}` : ""}/postgres`;

const sql = `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${literal(role)}) THEN
    EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L', ${literal(role)}, ${literal(password)});
  ELSIF ${shouldResetRolePassword ? "true" : "false"} THEN
    EXECUTE format('ALTER ROLE %I LOGIN PASSWORD %L', ${literal(role)}, ${literal(password)});
  ELSE
    RAISE NOTICE 'role % already exists; leaving password unchanged', ${literal(role)};
  END IF;
END
$$;
`;

await withClient(adminUrl, async (client) => {
  await client.query(sql);

  const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [database]);
  if (exists.rowCount === 0) {
    await client.query(`CREATE DATABASE ${ident(database)} OWNER ${ident(role)}`);
  }

  await client.query(`ALTER DATABASE ${ident(database)} OWNER TO ${ident(role)}`);
});

await withClient(databaseUrl, async (client) => {
  await client.query("SELECT current_database() AS database, current_user AS user");
});

console.log(`Local Postgres is ready for ${redacted(databaseUrl)}.`);

async function withClient(url, callback) {
  const client = new Client({ connectionString: url });
  try {
    await client.connect();
    await callback(client);
  } catch (err) {
    fail(
      "Local database setup failed.\n" +
        `${err instanceof Error ? err.message : String(err)}\n` +
        "If your admin role needs a password, set LOCAL_POSTGRES_ADMIN_URL and rerun. " +
        "If the target role exists with an old password, set LOCAL_POSTGRES_RESET_ROLE_PASSWORD=1."
    );
  } finally {
    await client.end().catch(() => {});
  }
}

function hostForUrl(value) {
  return value.includes(":") && !value.startsWith("[") ? `[${value}]` : value;
}

function ident(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function literal(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function redacted(value) {
  const url = new URL(value);
  if (url.password) url.password = "****";
  return url.toString();
}

function fail(message) {
  console.error(`[db:setup:local] ${message}`);
  process.exit(1);
}
