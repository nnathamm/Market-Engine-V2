import { NextResponse } from "next/server";
import { type AppPermission, isAppRole, normalizeGrantedPermissions } from "@/lib/access-policy";
import { authorize, updateUserAccess } from "@/lib/access-control";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const authorization = await authorize("access.manage");
  if (authorization.response) return authorization.response;

  const body = (await request.json()) as { role?: unknown; permissions?: unknown };
  if (!isAppRole(body.role)) {
    return NextResponse.json({ error: "A valid role is required" }, { status: 400 });
  }

  try {
    const { userId } = await params;
    const access = await updateUserAccess(
      userId,
      body.role,
      normalizeGrantedPermissions(body.permissions) as AppPermission[],
    );
    return NextResponse.json(access);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update user access";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}