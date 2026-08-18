import { NextResponse } from "next/server";
import { portfolioService } from "@/lib/wallet-tracker/instance";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const wallet = await portfolioService.refresh(id);
    return NextResponse.json(wallet);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Refresh failed";
    return NextResponse.json({ error: msg }, { status: /not found/i.test(msg) ? 404 : 500 });
  }
}
