import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET() {
  try {
    const { rows } = await pool.query(
      "SELECT id, symbol, label, created_at FROM tracked_tokens ORDER BY created_at DESC"
    );
    return NextResponse.json(rows);
  } catch (err) {
    console.error("tracked/tokens GET:", err);
    return NextResponse.json({ error: "Failed to fetch tracked tokens" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { symbol, label } = (await request.json()) as { symbol: string; label?: string };
    const clean = String(symbol ?? "").trim().toUpperCase();
    if (!clean) return NextResponse.json({ error: "symbol is required" }, { status: 400 });
    const { rows } = await pool.query(
      "INSERT INTO tracked_tokens (symbol, label) VALUES ($1, $2) ON CONFLICT (symbol) DO UPDATE SET label = EXCLUDED.label RETURNING *",
      [clean, label ?? null]
    );
    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    console.error("tracked/tokens POST:", err);
    return NextResponse.json({ error: "Failed to add token" }, { status: 500 });
  }
}
