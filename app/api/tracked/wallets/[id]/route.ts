import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await pool.query("DELETE FROM tracked_wallets WHERE id = $1", [Number(id)]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("tracked/wallets DELETE:", err);
    return NextResponse.json({ error: "Failed to remove wallet" }, { status: 500 });
  }
}
