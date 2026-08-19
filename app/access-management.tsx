"use client";

import { useCallback, useEffect, useState } from "react";
import { APP_PERMISSIONS, type AppPermission, type AppRole } from "@/lib/access-policy";

type ManagedUser = {
  id: string;
  name: string;
  email: string;
  role: AppRole;
  permissions: AppPermission[];
};

const PERMISSION_LABELS: Record<AppPermission, string> = {
  "markets.view": "View Markets",
  "notifications.view": "View Notifications",
  "signals.view": "View Signals",
  "signals.create": "Create Signals",
  "asset_tracking.view": "View Asset Tracking",
  "asset_tracking.manage": "Manage Asset Tracking",
  "order_flow.view": "View Order Flow",
  "order_flow.manage": "Manage Order Flow",
  "access.manage": "Manage Access",
};

export function AccessManagementPanel() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/users");
      if (!response.ok) throw new Error("Unable to load accounts");
      const payload = await response.json() as { users: ManagedUser[] };
      setUsers(payload.users);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to load accounts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function save(user: ManagedUser, next: Partial<Pick<ManagedUser, "role" | "permissions">>) {
    const updated = { ...user, ...next };
    setNotice(null);
    const response = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: updated.role, permissions: updated.permissions }),
    });
    const payload = await response.json() as { error?: string; role?: AppRole; permissions?: AppPermission[] };
    if (!response.ok) {
      setNotice(payload.error ?? "Unable to update account access");
      return;
    }
    setUsers((current) => current.map((entry) => entry.id === user.id
      ? { ...entry, role: payload.role ?? updated.role, permissions: payload.permissions ?? updated.permissions }
      : entry));
    setNotice(`Saved access for ${user.name}.`);
  }

  return (
    <section className="surface access-management-panel" aria-labelledby="access-management-title">
      <header>
        <div>
          <span className="profile-control-icon blue" aria-hidden="true">♧</span>
          <h2 id="access-management-title">Manage Accounts &amp; Access</h2>
          <p>Choose an account role and grant only the extra capabilities a member needs.</p>
        </div>
        <button type="button" onClick={() => void load()}>Refresh</button>
      </header>
      {notice && <p className="access-management-notice" role="status">{notice}</p>}
      {loading ? <p className="access-management-empty">Loading accounts…</p> : (
        <div className="access-user-list">
          {users.map((user) => (
            <article key={user.id} className="access-user-row">
              <div className="access-user-identity"><strong>{user.name}</strong><small>{user.email}</small></div>
              <label className="access-role-field"><span>Role</span>
                <select value={user.role} onChange={(event) => void save(user, { role: event.target.value as AppRole })}>
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
              <div className="access-permission-list" aria-label={`Permissions for ${user.name}`}>
                {APP_PERMISSIONS.map((permission) => (
                  <label key={permission}>
                    <input
                      type="checkbox"
                      checked={user.permissions.includes(permission)}
                      disabled={user.role === "admin"}
                      onChange={(event) => void save(user, {
                        permissions: event.target.checked
                          ? [...new Set([...user.permissions, permission])]
                          : user.permissions.filter((entry) => entry !== permission),
                      })}
                    />
                    <span>{PERMISSION_LABELS[permission]}</span>
                  </label>
                ))}
              </div>
            </article>
          ))}
          {users.length === 0 && <p className="access-management-empty">No signed-in accounts yet.</p>}
        </div>
      )}
    </section>
  );
}