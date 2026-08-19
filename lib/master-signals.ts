import "server-only";

import pool from "@/lib/db";

export type MasterSignalStatus = "draft" | "published" | "paused" | "archived";

export type MasterSignal = {
  id: number;
  name: string;
  description: string;
  status: MasterSignalStatus;
  version: number;
  definition: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type LinkedMasterSignal = MasterSignal & {
  sourceVersion: number;
  copiedAt: string;
};

let schemaPromise: Promise<void> | null = null;

export async function ensureMasterSignalSchema() {
  if (!schemaPromise) {
    schemaPromise = pool.query(`
      CREATE TABLE IF NOT EXISTS master_signals (
        id BIGSERIAL PRIMARY KEY,
        owner_clerk_user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'paused', 'archived')) DEFAULT 'draft',
        version INTEGER NOT NULL DEFAULT 1,
        definition JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS master_signal_copies (
        clerk_user_id TEXT NOT NULL,
        master_signal_id BIGINT NOT NULL REFERENCES master_signals(id) ON DELETE CASCADE,
        source_version INTEGER NOT NULL,
        copied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (clerk_user_id, master_signal_id)
      );
    `).then(() => undefined).catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

function mapSignal(row: Record<string, unknown>): MasterSignal {
  return {
    id: Number(row.id),
    name: String(row.name),
    description: String(row.description ?? ""),
    status: row.status as MasterSignalStatus,
    version: Number(row.version),
    definition: (row.definition ?? {}) as Record<string, unknown>,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

export async function listPublishedMasterSignals(): Promise<MasterSignal[]> {
  await ensureMasterSignalSchema();
  const result = await pool.query(`
    SELECT id, name, description, status, version, definition, created_at, updated_at
    FROM master_signals
    WHERE status IN ('published', 'paused')
    ORDER BY updated_at DESC
  `);
  return result.rows.map(mapSignal);
}

export async function listOwnerMasterSignals(ownerId: string): Promise<MasterSignal[]> {
  await ensureMasterSignalSchema();
  const result = await pool.query(
    `SELECT id, name, description, status, version, definition, created_at, updated_at
     FROM master_signals WHERE owner_clerk_user_id = $1 ORDER BY updated_at DESC`,
    [ownerId],
  );
  return result.rows.map(mapSignal);
}

export async function listLinkedMasterSignals(userId: string): Promise<LinkedMasterSignal[]> {
  await ensureMasterSignalSchema();
  const result = await pool.query(`
    SELECT m.id, m.name, m.description, m.status, m.version, m.definition, m.created_at, m.updated_at,
           c.source_version, c.copied_at
    FROM master_signal_copies c
    JOIN master_signals m ON m.id = c.master_signal_id
    WHERE c.clerk_user_id = $1
    ORDER BY c.copied_at DESC
  `, [userId]);
  return result.rows.map((row) => ({
    ...mapSignal(row),
    sourceVersion: Number(row.source_version),
    copiedAt: new Date(String(row.copied_at)).toISOString(),
  }));
}

export async function createMasterSignal(ownerId: string, input: {
  name: string;
  description?: string;
  definition?: Record<string, unknown>;
  status?: MasterSignalStatus;
}) {
  await ensureMasterSignalSchema();
  const result = await pool.query(
    `INSERT INTO master_signals (owner_clerk_user_id, name, description, status, definition)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, description, status, version, definition, created_at, updated_at`,
    [ownerId, input.name.trim(), input.description?.trim() ?? "", input.status ?? "draft", input.definition ?? {}],
  );
  return mapSignal(result.rows[0]);
}

export async function updateMasterSignal(ownerId: string, id: number, input: {
  name?: string;
  description?: string;
  definition?: Record<string, unknown>;
  status?: MasterSignalStatus;
}) {
  await ensureMasterSignalSchema();
  const result = await pool.query(
    `UPDATE master_signals
     SET name = COALESCE($3, name),
         description = COALESCE($4, description),
         definition = COALESCE($5, definition),
         status = COALESCE($6, status),
         version = version + 1,
         updated_at = NOW()
     WHERE id = $1 AND owner_clerk_user_id = $2
     RETURNING id, name, description, status, version, definition, created_at, updated_at`,
    [id, ownerId, input.name?.trim() || null, input.description?.trim() ?? null, input.definition ?? null, input.status ?? null],
  );
  if (!result.rows[0]) return null;
  return mapSignal(result.rows[0]);
}

export async function copyMasterSignal(userId: string, id: number) {
  await ensureMasterSignalSchema();
  const result = await pool.query(
    `INSERT INTO master_signal_copies (clerk_user_id, master_signal_id, source_version)
     SELECT $1, id, version FROM master_signals
     WHERE id = $2 AND status IN ('published', 'paused')
     ON CONFLICT (clerk_user_id, master_signal_id)
     DO UPDATE SET source_version = EXCLUDED.source_version
     RETURNING clerk_user_id, master_signal_id, source_version, copied_at`,
    [userId, id],
  );
  return result.rows[0] ?? null;
}