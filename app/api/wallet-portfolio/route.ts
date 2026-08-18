import { NextResponse } from "next/server";
import { portfolioService, alchemyConfigured } from "@/lib/wallet-tracker/instance";

export async function GET() {
  try {
    const wallets = await portfolioService.store.list();
    return NextResponse.json({ wallets, alchemyConfigured });
  } catch (err) {
    console.error("wallet-portfolio GET:", err);
    return NextResponse.json({ error: "Failed to fetch wallets" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      address: string;
      label?: string;
      networks?: string[];
    };
    if (!body.address) {
      return NextResponse.json({ error: "address is required" }, { status: 400 });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wallet = await portfolioService.add(body as any);
    return NextResponse.json(wallet, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to add wallet";
    const status = /already tracked|valid|unsupported/i.test(msg) ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
