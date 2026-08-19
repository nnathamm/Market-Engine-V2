import { NextResponse } from "next/server";
import { getCurrentAccess } from "@/lib/access-control";

export async function GET() {
  const access = await getCurrentAccess();
  if (!access) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  return NextResponse.json(access);
}