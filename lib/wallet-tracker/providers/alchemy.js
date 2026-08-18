const ENDPOINT = "https://api.g.alchemy.com/data/v1/{key}/assets/tokens/by-address";

function decimal(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatUnits(raw, decimals) {
  if (!/^0x[0-9a-f]+$/i.test(String(raw || ""))) return decimal(raw);
  const value = BigInt(raw);
  const places = Math.max(0, Number(decimals || 0));
  if (!places) return Number(value);
  const base = 10n ** BigInt(places);
  const whole = value / base;
  const fraction = (value % base).toString().padStart(places, "0").replace(/0+$/, "");
  return Number(`${whole}${fraction ? `.${fraction}` : ""}`);
}

export class AlchemyPortfolioProvider {
  constructor({ apiKey, fetchImpl = globalThis.fetch }) {
    this.apiKey = apiKey;
    this.fetch = fetchImpl;
  }

  async tokensByWallet(address, networks) {
    if (!this.apiKey) throw new Error("ALCHEMY_API_KEY is required for portfolio discovery");
    const all = [];
    const warnings = [];
    let pageKey;
    do {
      const response = await this.fetch(ENDPOINT.replace("{key}", this.apiKey), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          addresses: [{ address, networks }],
          withMetadata: true,
          withPrices: true,
          includeNativeTokens: true,
          includeErc20Tokens: true,
          ...(pageKey ? { pageKey } : {}),
        }),
      });
      if (!response.ok) {
        throw new Error(`Alchemy portfolio request failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
      }
      const payload = await response.json();
      const data = payload.data || payload;
      for (const partial of payload.error?.partialErrors || []) {
        warnings.push(`Alchemy partial network failure: ${partial.network || "unknown network"}: ${partial.message || partial.error || "unavailable"}`);
      }
      for (const token of data.tokens || []) {
        const metadata = token.tokenMetadata || token.metadata || {};
        const priceRow = (token.tokenPrices || token.prices || []).find(
          (item) => String(item.currency || "usd").toLowerCase() === "usd",
        );
        const rawBalance = token.tokenBalance ?? token.balance;
        const balance = formatUnits(rawBalance, metadata.decimals);
        const priceUsd = decimal(priceRow?.value ?? token.priceUsd);
        all.push({
          network: token.network,
          contractAddress: token.tokenAddress || token.contractAddress || null,
          isNative: !token.tokenAddress && !token.contractAddress,
          name: metadata.name || null,
          symbol: metadata.symbol || null,
          decimals: Number.isInteger(metadata.decimals) ? metadata.decimals : null,
          logo: metadata.logo || null,
          balance,
          priceUsd,
          valueUsd: balance !== null && priceUsd !== null ? balance * priceUsd : null,
          discoverySource: "ALCHEMY_PORTFOLIO_API",
          providerRawBalance: rawBalance ?? null,
        });
      }
      pageKey = data.pageKey || null;
    } while (pageKey);
    return { tokens: all, warnings };
  }
}
