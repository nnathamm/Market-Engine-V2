function keyFor(holding) {
  return `${holding.network}:${holding.isNative ? "native" : String(holding.contractAddress || "").toLowerCase()}`;
}

export function classifyHolding(holding, registry = {}) {
  const verified = registry[keyFor(holding)] || null;
  if (verified) {
    return { ...holding, ...verified, trust: "VERIFIED", hiddenByDefault: false };
  }
  const meaningfulValue = Number.isFinite(holding.valueUsd) && holding.valueUsd >= 1;
  const priced = Number.isFinite(holding.priceUsd) && holding.priceUsd > 0;
  const named = Boolean(holding.name && holding.symbol);
  if (meaningfulValue || (priced && named)) {
    return { ...holding, trust: "RECOGNIZED", hiddenByDefault: false };
  }
  return {
    ...holding,
    trust: "UNVERIFIED_OR_DUST",
    hiddenByDefault: true,
  };
}

export function holdingKey(holding) {
  return keyFor(holding);
}
