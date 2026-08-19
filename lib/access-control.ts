import "server-only";

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import pool from "@/lib/db";
import {
  type AppAccess,
  type AppPermission,
  type AppRole,
  isAppRole,
  normalizeGrantedPermissions,
  permissionsFor,
} from "@/lib/access-policy";

type AccessRow = {
  clerk_user_id: string;
  role: string;
  permissions: unknown;
};

let schemaPromise: Promise<void> | null = null;

async function ensureAccessSchema() {
  if (!schemaPromise) {
    schemaPromise = pool.query(`
      CREATE TABLE IF NOT EXISTS app_user_access (
        clerk_user_id TEXT PRIMARY KEY,
        role TEXT NOT NULL CHECK (role IN ('admin', 'member')) DEFAULT 'member',
        permissions TEXT[] NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `).then(() => undefined).catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

function toAccess(row: AccessRow): AppAccess {
  const role: AppRole = isAppRole(row.role) ? row.role : "member";
  return {
    role,
    permissions: permissionsFor(role, normalizeGrantedPermissions(row.permissions)),
  };
}

async function ensureUserAccess(userId: string): Promise<AppAccess> {
  await ensureAccessSchema();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('signal-control:access-bootstrap'))");

    const existing = await client.query<AccessRow>(
      "SELECT clerk_user_id, role, permissions FROM app_user_access WHERE clerk_user_id = $1",
      [userId],
    );
    if (existing.rows[0]) {
      await client.query("COMMIT");
      return toAccess(existing.rows[0]);
    }

    const countResult = await client.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM app_user_access");
    const role: AppRole = Number(countResult.rows[0]?.count ?? "0") === 0 ? "admin" : "member";
    const inserted = await client.query<AccessRow>(
      `INSERT INTO app_user_access (clerk_user_id, role)
       VALUES ($1, $2)
       RETURNING clerk_user_id, role, permissions`,
      [userId, role],
    );
    await client.query("COMMIT");
    return toAccess(inserted.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getCurrentAccess(): Promise<AppAccess | null> {
  const { userId } = await auth();
  if (!userId) return null;
  return ensureUserAccess(userId);
}

export async function authorize(permission: AppPermission) {
  const access = await getCurrentAccess();
  if (!access) {
    return {
      access: null,
      response: NextResponse.json({ error: "Authentication required" }, { status: 401 }),
    };
  }
  if (!access.permissions.includes(permission)) {
    return {
      access: null,
      response: NextResponse.json({ error: "You do not have permission to perform this action" }, { status: 403 }),
    };
  }
  return { access, response: null };
}

export async function listAccessRecords() {
  await ensureAccessSchema();
  const { rows } = await pool.query<AccessRow>(
    "SELECT clerk_user_id, role, permissions FROM app_user_access ORDER BY created_at ASC",
  );
  return new Map(rows.map((row) => [row.clerk_user_id, toAccess(row)]));
}

export async function updateUserAccess(
  userId: string,
  role: AppRole,
  grantedPermissions: AppPermission[],
) {
  await ensureAccessSchema();
  await ensureUserAccess(userId);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('signal-control:access-management'))");
    const current = await client.query<AccessRow>(
      "SELECT clerk_user_id, role, permissions FROM app_user_access WHERE clerk_user_id = $1 FOR UPDATE",
      [userId],
    );
    const existing = current.rows[0];
    if (!existing) throw new Error("Account access record was not found");

    if (existing.role === "admin" && role !== "admin") {
      const admins = await client.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM app_user_access WHERE role = 'admin'",
      );
      if (Number(admins.rows[0]?.count ?? "0") <= 1) {
        throw new Error("At least one administrator must retain admin access");
      }
    }

    // An admin's effective permissions are intentionally all capabilities.
    // Do not carry those implicit capabilities into a member account.
    const storedPermissions = existing.role === "admin" && role !== "admin"
      ? []
      : normalizeGrantedPermissions(grantedPermissions);
    const { rows } = await client.query<AccessRow>(
      `UPDATE app_user_access
         SET role = $2, permissions = $3, updated_at = NOW()
       WHERE clerk_user_id = $1
       RETURNING clerk_user_id, role, permissions`,
      [userId, role, storedPermissions],
    );
    await client.query("COMMIT");
    return toAccess(rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}