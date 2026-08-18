import { NextResponse } from "next/server";
import { cascadeSearch } from "@/lib/price-sources";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "";
  if (!query.trim()) return NextResponse.json([]);
  try {
    const results = await cascadeSearch(query);
    return NextResponse.json(results);
  } catch {
    return NextResponse.json([]);
  }
}
