export class HeliusProvider {
  constructor({ apiKey, fetchImpl = globalThis.fetch }) {
    this.apiKey = apiKey;
    this.fetch = fetchImpl;
  }

  async assetsByOwner(address) {
    if (!this.apiKey) return [];
    const output = [];
    let page = 1;
    while (true) {
      const response = await this.fetch(`https://mainnet.helius-rpc.com/?api-key=${this.apiKey}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: `wallet-assets-${page}`,
          method: "getAssetsByOwner",
          params: {
            ownerAddress: address,
            page,
            limit: 1000,
            displayOptions: { showFungible: true, showNativeBalance: true },
          },
        }),
      });
      if (!response.ok) throw new Error(`Helius request failed with HTTP ${response.status}`);
      const payload = await response.json();
      if (payload.error) throw new Error(`Helius error: ${payload.error.message}`);
      const result = payload.result || {};
      for (const asset of result.items || []) {
        const tokenInfo = asset.token_info || {};
        const content = asset.content || {};
        const metadata = content.metadata || {};
        const decimals = Number(tokenInfo.decimals || 0);
        const rawBalance = tokenInfo.balance;
        const balance = rawBalance === undefined ? null : Number(rawBalance) / 10 ** decimals;
        const priceUsd = Number.isFinite(Number(tokenInfo.price_info?.price_per_token))
          ? Number(tokenInfo.price_info.price_per_token)
          : null;
        output.push({
          network: "sol-mainnet",
          contractAddress: asset.id,
          isNative: false,
          name: metadata.name || null,
          symbol: tokenInfo.symbol || metadata.symbol || null,
          decimals,
          logo: content.links?.image || content.files?.[0]?.cdn_uri || content.files?.[0]?.uri || null,
          balance,
          priceUsd,
          valueUsd: balance !== null && priceUsd !== null ? balance * priceUsd : null,
          discoverySource: "HELIUS_DAS_GET_ASSETS_BY_OWNER",
        });
      }
      if ((result.items || []).length < 1000) break;
      page += 1;
    }
    return output;
  }
}
