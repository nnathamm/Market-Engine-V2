import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET() {
  try {
    const { rows } = await pool.query(
      "SELECT id, address, label, chain, notes, created_at FROM tracked_wallets ORDER BY created_at DESC"
    );
    return NextResponse.json(rows);
  } catch (err) {
    console.error("tracked/wallets GET:", err);
    return NextResponse.json({ error: "Failed to fetch tracked wallets" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { address, label, chain, notes } = (await request.json()) as {
      address: string; label?: string; chain?: string; notes?: string;
    };
    const clean = String(address ?? "").trim();
    if (!clean) return NextResponse.json({ error: "address is required" }, { status: 400 });
    const { rows } = await pool.query(
      `INSERT INTO tracked_wallets (address, label, chain, notes)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (address) DO UPDATE SET label = EXCLUDED.label, chain = EXCLUDED.chain, notes = EXCLUDED.notes
       RETURNING *`,
      [clean, label ?? null, chain ?? null, notes ?? null]
    );
    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    console.error("tracked/wallets POST:", err);
    return NextResponse.json({ error: "Failed to add wallet" }, { status: 500 });
  }
}
