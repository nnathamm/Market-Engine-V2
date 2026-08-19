import { NextResponse } from "next/server";
import { portfolioService } from "@/lib/wallet-tracker/instance";
import { removeWalletAndTokens } from "@/lib/token-cleanup";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  try {
    const wallet = await portfolioService.store.get(id);
    if (!wallet) return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
    return NextResponse.json(wallet);
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch wallet" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  try {
    const body = (await request.json()) as { label?: string; networks?: string[] };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wallet = await portfolioService.update(id, body as any);
    return NextResponse.json(wallet);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to update wallet";
    return NextResponse.json({ error: msg }, { status: /not found/i.test(msg) ? 404 : 400 });
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const { id } = await params;
  try {
    // Prefer stable token IDs; keepSymbols remains accepted for older clients.
    let keepTokenIds: Set<number> | undefined;
    let keepSymbols: Set<string> | undefined;
    try {
      const body = (await req.json()) as { keepTokenIds?: number[]; keepSymbols?: string[] };
      if (Array.isArray(body.keepTokenIds) && body.keepTokenIds.length > 0) {
        keepTokenIds = new Set(
          body.keepTokenIds
            .map(Number)
            .filter((value) => Number.isInteger(value) && value > 0),
        );
      }
      if (Array.isArray(body.keepSymbols) && body.keepSymbols.length > 0) {
        keepSymbols = new Set(body.keepSymbols.map(s => String(s).toUpperCase()));
      }
    } catch {
      // No body or invalid JSON — proceed without explicit keep choices.
    }

    // Token cleanup, peer reassignment, and wallet removal share one serialized
    // transaction so concurrent wallet deletes cannot leave orphaned sources.
    const removed = await removeWalletAndTokens(id, { keepTokenIds, keepSymbols });
    return NextResponse.json({ ok: removed }, { status: removed ? 200 : 404 });
  } catch (err) {
    return NextResponse.json({ error: "Failed to delete wallet" }, { status: 500 });
  }
}
