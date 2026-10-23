import { Client as PgClient } from "pg";
import mysql from "mysql2/promise";
import { ValidationError } from "@shared/domain/errors";
import { MAX_IMPORT_ROWS, type TabularData } from "../domain/tabular";
import { resolveAllowedHost } from "./host-guard";

/**
 * Lectura de una tabla o vista de una base de datos externa (PostgreSQL o MySQL).
 * Solo lectura: la sesión se abre en modo READ ONLY, con tiempo máximo por consulta y un
 * límite de filas. No se aceptan consultas libres: solo el nombre de una tabla o vista.
 * Lo ideal es que el cliente cree un usuario de solo lectura para esto.
 */

export type SqlKind = "POSTGRES" | "MYSQL";

const CONNECT_TIMEOUT_MS = 10_000;
const QUERY_TIMEOUT_MS = 20_000;
const TABLE_RE = /^[A-Za-z_][A-Za-z0-9_$]*(\.[A-Za-z_][A-Za-z0-9_$]*)?$/;

interface ParsedUrl {
  kind: SqlKind;
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  sslMode: string | null;
}

export function parseConnectionUrl(raw: string): ParsedUrl {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new ValidationError("La URL de conexión no es válida. Ejemplo: postgresql://usuario:clave@servidor:5432/base");
  }
  const protocol = url.protocol.replace(":", "");
  const kind: SqlKind | null = protocol === "postgres" || protocol === "postgresql" ? "POSTGRES" : protocol === "mysql" ? "MYSQL" : null;
  if (!kind) throw new ValidationError("Solo se aceptan bases PostgreSQL (postgresql://…) o MySQL (mysql://…)");
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!url.hostname || !database) throw new ValidationError("A la URL le falta el servidor o el nombre de la base");
  return {
    kind,
    host: url.hostname,
    port: url.port ? Number(url.port) : kind === "POSTGRES" ? 5432 : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    sslMode: url.searchParams.get("sslmode") ?? url.searchParams.get("ssl"),
  };
}

function sslOptions(mode: string | null, servername: string) {
  if (!mode || mode === "disable" || mode === "false") return undefined;
  const verify = mode === "verify-full" || mode === "verify-ca";
  return { rejectUnauthorized: verify, servername };
}

export function assertTableName(table: string): string {
  const t = table.trim();
  if (!TABLE_RE.test(t)) throw new ValidationError("Nombre de tabla inválido. Usa solo letras, números y guion bajo (ej: inventario o public.inventario).");
  return t;
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    const iso = value.toISOString();
    return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso;
  }
  if (Buffer.isBuffer(value)) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function toTable(columns: string[], records: Record<string, unknown>[]): TabularData {
  return {
    columns,
    rows: records.map((r) => Object.fromEntries(columns.map((c) => [c, cellToString(r[c]).trim()]))),
  };
}

async function withPostgres<T>(p: ParsedUrl, fn: (client: PgClient) => Promise<T>): Promise<T> {
  const ip = await resolveAllowedHost(p.host);
  const client = new PgClient({
    host: ip,
    port: p.port,
    user: p.user,
    password: p.password,
    database: p.database,
    ssl: sslOptions(p.sslMode, p.host),
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    statement_timeout: QUERY_TIMEOUT_MS,
    query_timeout: QUERY_TIMEOUT_MS + 2_000,
    // Toda la sesión en solo lectura
    options: "-c default_transaction_read_only=on",
    application_name: "whatsappia-import",
  });
  try {
    await client.connect();
  } catch (err) {
    throw new ValidationError(`No se pudo conectar a PostgreSQL: ${(err as Error).message}`);
  }
  try {
    return await fn(client);
  } finally {
    await client.end().catch(() => {});
  }
}

async function withMysql<T>(p: ParsedUrl, fn: (conn: mysql.Connection) => Promise<T>): Promise<T> {
  const ip = await resolveAllowedHost(p.host);
  let conn: mysql.Connection;
  try {
    conn = await mysql.createConnection({
      host: ip,
      port: p.port,
      user: p.user,
      password: p.password,
      database: p.database,
      ssl: sslOptions(p.sslMode, p.host),
      connectTimeout: CONNECT_TIMEOUT_MS,
      dateStrings: true,
    });
  } catch (err) {
    throw new ValidationError(`No se pudo conectar a MySQL: ${(err as Error).message}`);
  }
  try {
    await conn.query("SET SESSION TRANSACTION READ ONLY");
    return await fn(conn);
  } finally {
    await conn.end().catch(() => {});
  }
}

const pgIdent = (t: string) => t.split(".").map((p) => `"${p.replace(/"/g, '""')}"`).join(".");
const myIdent = (t: string) => t.split(".").map((p) => `\`${p.replace(/`/g, "``")}\``).join(".");

/** Tablas y vistas que el usuario de la conexión puede leer. */
export async function listTables(connectionUrl: string): Promise<string[]> {
  const p = parseConnectionUrl(connectionUrl);
  if (p.kind === "POSTGRES") {
    return withPostgres(p, async (client) => {
      const res = await client.query<{ name: string }>(
        `SELECT CASE WHEN table_schema = 'public' THEN table_name ELSE table_schema || '.' || table_name END AS name
           FROM information_schema.tables
          WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
          ORDER BY table_schema = 'public' DESC, name
          LIMIT 500`,
      );
      return res.rows.map((r) => r.name);
    });
  }
  return withMysql(p, async (conn) => {
    const [rows] = await conn.query({ sql: "SHOW FULL TABLES", timeout: QUERY_TIMEOUT_MS });
    return (rows as Record<string, unknown>[]).map((r) => String(Object.values(r)[0])).slice(0, 500);
  });
}

/** Filas de una tabla o vista (hasta el máximo de importación). */
export async function readTable(connectionUrl: string, table: string, limit = MAX_IMPORT_ROWS): Promise<TabularData> {
  const p = parseConnectionUrl(connectionUrl);
  const name = assertTableName(table);
  const max = Math.min(Math.max(1, Math.floor(limit)), MAX_IMPORT_ROWS);
  try {
    if (p.kind === "POSTGRES") {
      return await withPostgres(p, async (client) => {
        const res = await client.query(`SELECT * FROM ${pgIdent(name)} LIMIT ${max}`);
        return toTable(res.fields.map((f) => f.name), res.rows as Record<string, unknown>[]);
      });
    }
    return await withMysql(p, async (conn) => {
      const [rows, fields] = await conn.query({ sql: `SELECT * FROM ${myIdent(name)} LIMIT ${max}`, timeout: QUERY_TIMEOUT_MS });
      return toTable((fields as mysql.FieldPacket[]).map((f) => f.name), rows as Record<string, unknown>[]);
    });
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw new ValidationError(`No se pudo leer la tabla "${name}": ${(err as Error).message}`);
  }
}
