import { NextResponse } from "next/server";
import { portfolioService } from "@/lib/wallet-tracker/instance";
import { removeTokensForWallet } from "@/lib/token-cleanup";

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

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  try {
    // Remove tokens that were auto-imported exclusively from this wallet
    // before removing the wallet so we can still query its peer holdings.
    await removeTokensForWallet(id);
    const removed = await portfolioService.store.remove(id);
    return NextResponse.json({ ok: removed }, { status: removed ? 200 : 404 });
  } catch (err) {
    return NextResponse.json({ error: "Failed to delete wallet" }, { status: 500 });
  }
}
