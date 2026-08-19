import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getCurrentAccess } from "@/lib/access-control";
import { createMasterSignal, listLinkedMasterSignals, listOwnerMasterSignals, listPublishedMasterSignals } from "@/lib/master-signals";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const access = await getCurrentAccess();
  if (!access) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const [library, linked] = await Promise.all([
    listPublishedMasterSignals(),
    listLinkedMasterSignals(userId),
  ]);
  const managed = access.isMasterOwner ? await listOwnerMasterSignals(userId) : [];
  return NextResponse.json({ library, linked, managed });
}

export async function POST(request: Request) {
  const { userId } = await auth();
  const access = await getCurrentAccess();
  if (!userId || !access) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!access.isMasterOwner) return NextResponse.json({ error: "Master Admin access required" }, { status: 403 });
  const body = await request.json() as { name?: unknown; description?: unknown; definition?: unknown; status?: unknown };
  if (typeof body.name !== "string" || !body.name.trim()) return NextResponse.json({ error: "A signal name is required" }, { status: 400 });
  const signal = await createMasterSignal(userId, {
    name: body.name,
    description: typeof body.description === "string" ? body.description : "",
    definition: body.definition && typeof body.definition === "object" ? body.definition as Record<string, unknown> : {},
    status: body.status === "published" ? "published" : "draft",
  });
  return NextResponse.json({ signal }, { status: 201 });
}