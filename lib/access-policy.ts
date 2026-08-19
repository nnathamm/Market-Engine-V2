export const APP_PERMISSIONS = [
  "markets.view",
  "notifications.view",
  "signals.view",
  "signals.create",
  "asset_tracking.view",
  "asset_tracking.manage",
  "order_flow.view",
  "order_flow.manage",
  "access.manage",
] as const;

export type AppPermission = (typeof APP_PERMISSIONS)[number];
export type AppRole = "admin" | "member";

export type AppAccess = {
  role: AppRole;
  permissions: AppPermission[];
  isMasterOwner: boolean;
};

const MEMBER_PERMISSIONS: AppPermission[] = [
  "markets.view",
  "notifications.view",
];

export function isAppPermission(value: unknown): value is AppPermission {
  return typeof value === "string" && APP_PERMISSIONS.includes(value as AppPermission);
}

export function isAppRole(value: unknown): value is AppRole {
  return value === "admin" || value === "member";
}

export function normalizeGrantedPermissions(value: unknown): AppPermission[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(isAppPermission))];
}

export function permissionsFor(role: AppRole, granted: AppPermission[] = []): AppPermission[] {
  if (role === "admin") return [...APP_PERMISSIONS];
  return [...new Set([...MEMBER_PERMISSIONS, ...granted])];
}

export function hasPermission(access: AppAccess | null | undefined, permission: AppPermission): boolean {
  return Boolean(access?.permissions.includes(permission));
}

export function isMasterOwner(access: AppAccess | null | undefined): boolean {
  return Boolean(access?.isMasterOwner);
}