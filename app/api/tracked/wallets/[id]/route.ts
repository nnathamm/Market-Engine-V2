import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { authorize } from "@/lib/access-control";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await authorize("asset_tracking.manage");
  if (authorization.response) return authorization.response;
  try {
    const { id } = await params;
    await pool.query("DELETE FROM tracked_wallets WHERE id = $1", [Number(id)]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("tracked/wallets DELETE:", err);
    return NextResponse.json({ error: "Failed to remove wallet" }, { status: 500 });
  }
}
