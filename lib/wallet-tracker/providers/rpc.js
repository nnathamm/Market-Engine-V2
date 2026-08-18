import { SUPPORTED_NETWORKS } from "../config.js";

const BALANCE_OF_SELECTOR = "70a08231";
const SOLANA_TOKEN_PROGRAMS = [
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHncnBkqs8v",
];

function formatUnits(raw, decimals) {
  const value = BigInt(raw);
  const places = Math.max(0, Number(decimals || 0));
  if (!places) return Number(value);
  const base = 10n ** BigInt(places);
  const whole = value / base;
  const fraction = (value % base).toString().padStart(places, "0").replace(/0+$/, "");
  return Number(`${whole}${fraction ? `.${fraction}` : ""}`);
}

export class RpcVerifier {
  constructor({ rpcUrls, fetchImpl = globalThis.fetch }) {
    this.rpcUrls = rpcUrls;
    this.fetch = fetchImpl;
    this.requestId = 0;
  }

  async call(network, method, params) {
    const url = this.rpcUrls[network];
    if (!url) throw new Error(`No RPC endpoint configured for ${network}`);
    const response = await this.fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++this.requestId, method, params }),
    });
    if (!response.ok) throw new Error(`${network} RPC failed with HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.error) throw new Error(`${network} RPC error: ${payload.error.message || JSON.stringify(payload.error)}`);
    return payload.result;
  }

  async verifyEvm(address, holding) {
    const definition = SUPPORTED_NETWORKS[holding.network];
    if (!definition || definition.kind !== "evm") return holding;
    let raw;
    if (holding.isNative) {
      raw = await this.call(holding.network, "eth_getBalance", [address, "latest"]);
      holding.decimals ??= 18;
      holding.symbol ||= definition.nativeSymbol;
    } else {
      const contract = String(holding.contractAddress || "").toLowerCase();
      if (!/^0x[0-9a-f]{40}$/.test(contract)) return holding;
      const data = `0x${BALANCE_OF_SELECTOR}${address.toLowerCase().slice(2).padStart(64, "0")}`;
      raw = await this.call(holding.network, "eth_call", [{ to: contract, data }, "latest"]);
    }
    if (raw && /^0x[0-9a-f]+$/i.test(raw) && Number.isInteger(holding.decimals)) {
      holding.balance = formatUnits(raw, holding.decimals);
      holding.valueUsd = holding.priceUsd === null ? null : holding.balance * holding.priceUsd;
      holding.balanceVerified = true;
      holding.balanceSource = "DIRECT_BLOCKCHAIN_RPC";
    }
    return holding;
  }

  async solanaBalances(address, network = "sol-mainnet") {
    const holdings = [];
    const native = await this.call(network, "getBalance", [address, { commitment: "confirmed" }]);
    holdings.push({
      network,
      contractAddress: null,
      isNative: true,
      name: "Solana",
      symbol: "SOL",
      decimals: 9,
      balance: Number(native?.value || 0) / 1e9,
      priceUsd: null,
      valueUsd: null,
      balanceVerified: true,
      balanceSource: "DIRECT_BLOCKCHAIN_RPC",
      discoverySource: "SOLANA_GET_BALANCE",
    });
    const byMint = new Map();
    for (const programId of SOLANA_TOKEN_PROGRAMS) {
      const result = await this.call(network, "getTokenAccountsByOwner", [
        address,
        { programId },
        { encoding: "jsonParsed", commitment: "confirmed" },
      ]);
      for (const account of result?.value || []) {
        const info = account?.account?.data?.parsed?.info;
        const amount = info?.tokenAmount;
        if (!info?.mint || !amount) continue;
        const row = byMint.get(info.mint) || {
          network,
          contractAddress: info.mint,
          isNative: false,
          name: null,
          symbol: null,
          decimals: Number(amount.decimals || 0),
          balance: 0,
          priceUsd: null,
          valueUsd: null,
          balanceVerified: true,
          balanceSource: "DIRECT_BLOCKCHAIN_RPC",
          discoverySource: "SOLANA_TOKEN_ACCOUNTS_BY_OWNER",
        };
        row.balance += Number(amount.uiAmountString ?? amount.uiAmount ?? 0);
        byMint.set(info.mint, row);
      }
    }
    return holdings.concat([...byMint.values()]);
  }
}
