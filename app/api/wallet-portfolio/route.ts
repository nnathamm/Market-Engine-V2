import { NextResponse } from "next/server";
import { portfolioService, alchemyConfigured } from "@/lib/wallet-tracker/instance";
import { authorize } from "@/lib/access-control";

export async function GET() {
  const authorization = await authorize("asset_tracking.view");
  if (authorization.response) return authorization.response;
  try {
    const wallets = await portfolioService.store.list();
    return NextResponse.json({ wallets, alchemyConfigured });
  } catch (err) {
    console.error("wallet-portfolio GET:", err);
    return NextResponse.json({ error: "Failed to fetch wallets" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authorization = await authorize("asset_tracking.manage");
  if (authorization.response) return authorization.response;
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
