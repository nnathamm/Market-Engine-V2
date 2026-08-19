import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getCurrentAccess } from "@/lib/access-control";
import { copyMasterSignal, updateMasterSignal } from "@/lib/master-signals";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  const access = await getCurrentAccess();
  if (!userId || !access) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Invalid signal id" }, { status: 400 });
  const body = await request.json() as { name?: unknown; description?: unknown; definition?: unknown; status?: unknown; action?: unknown };
  if (body.action === "copy") {
    const copy = await copyMasterSignal(userId, id);
    if (!copy) return NextResponse.json({ error: "Published master signal not found" }, { status: 404 });
    return NextResponse.json({ copy });
  }
  if (!access.isMasterOwner) return NextResponse.json({ error: "Master Admin access required" }, { status: 403 });
  const signal = await updateMasterSignal(userId, id, {
    name: typeof body.name === "string" ? body.name : undefined,
    description: typeof body.description === "string" ? body.description : undefined,
    definition: body.definition && typeof body.definition === "object" ? body.definition as Record<string, unknown> : undefined,
    status: ["draft", "published", "paused", "archived"].includes(String(body.status)) ? body.status as "draft" | "published" | "paused" | "archived" : undefined,
  });
  if (!signal) return NextResponse.json({ error: "Master signal not found" }, { status: 404 });
  return NextResponse.json({ signal });
}