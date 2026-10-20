// Přístup k databázi (Neon Postgres přes HTTP). Při testech se dá podstrčit vlastní dotazovací
// funkce přes globalThis.__VND_DB = async (text, params) => rows.
let klient = null;
let schemaPripraveno = null;

function sqlKlient() {
  if (globalThis.__VND_DB) return globalThis.__VND_DB;
  if (!klient) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) throw new Error('Chybí DATABASE_URL — databáze není připojená k projektu.');
    const { neon } = require('@neondatabase/serverless');
    const sql = neon(url);
    klient = (text, params) => sql.query(text, params || []);
  }
  return klient;
}

const SCHEMA = [
  'CREATE SEQUENCE IF NOT EXISTS vnd_rev',
  `CREATE TABLE IF NOT EXISTS vnd_records (
     coll text NOT NULL, id text NOT NULL, data jsonb, deleted boolean NOT NULL DEFAULT false,
     seq bigint NOT NULL, updated_by text, updated_at timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (coll, id))`,
  'CREATE INDEX IF NOT EXISTS vnd_records_seq ON vnd_records (seq)',
  `CREATE TABLE IF NOT EXISTS vnd_access (
     subject text PRIMARY KEY, pin_fp text NOT NULL UNIQUE, ver int NOT NULL DEFAULT 1,
     must_change boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now())`,
  'CREATE TABLE IF NOT EXISTS vnd_receipts (tank_id text PRIMARY KEY, data text NOT NULL, ver bigint NOT NULL)',
  `CREATE TABLE IF NOT EXISTS vnd_attempts (
     key text PRIMARY KEY, fails int NOT NULL DEFAULT 0, locked_until timestamptz,
     updated_at timestamptz NOT NULL DEFAULT now())`
];

async function db() {
  const q = sqlKlient();
  if (!schemaPripraveno) {
    schemaPripraveno = (async () => { for (const s of SCHEMA) await q(s, []); })().catch(e => { schemaPripraveno = null; throw e; });
  }
  await schemaPripraveno;
  return q;
}

module.exports = { db };
