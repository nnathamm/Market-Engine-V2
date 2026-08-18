import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function DELETE(_req: Request, { params }: { params: Promise<{ symbol: string }> }) {
  try {
    const { symbol } = await params;
    await pool.query("DELETE FROM tracked_tokens WHERE symbol = $1", [symbol.toUpperCase()]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("tracked/tokens DELETE:", err);
    return NextResponse.json({ error: "Failed to remove token" }, { status: 500 });
  }
}
