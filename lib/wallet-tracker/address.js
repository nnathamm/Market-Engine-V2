import { EVM_NETWORKS, SOLANA_NETWORKS, SUPPORTED_NETWORKS } from "./config.js";

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function addressType(address) {
  const value = String(address || "").trim();
  if (EVM_ADDRESS.test(value)) return "evm";
  if (SOLANA_ADDRESS.test(value)) return "solana";
  throw new Error("Address must be a valid EVM 0x address or Solana base58 address");
}

export function normalizeAddress(address) {
  const value = String(address || "").trim();
  return addressType(value) === "evm" ? value.toLowerCase() : value;
}

export function normalizeNetworks(address, requested) {
  const type = addressType(address);
  const defaults = type === "evm" ? EVM_NETWORKS : SOLANA_NETWORKS;
  const values = Array.isArray(requested) && requested.length ? requested : defaults;
  const unique = [...new Set(values.map(String))];
  for (const network of unique) {
    const definition = SUPPORTED_NETWORKS[network];
    if (!definition) throw new Error(`Unsupported network: ${network}`);
    if (definition.kind !== type) {
      throw new Error(`${network} cannot be scanned with a ${type} address`);
    }
  }
  return unique;
}
