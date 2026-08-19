---
name: Cross-exchange asset identity
description: Trust rules for mapping tracked crypto assets to exchange-specific markets without same-ticker mismatches.
---

Treat an exchange-specific symbol as trusted only after it has been verified for that exchange. A matching ticker or a pair saved from another venue is not an identity. Strong chain/contract or provider IDs must prevent fallback to an unverified same-ticker market.

When the identity provider omits the target exchange, a mapping may be corroborated only with multiple fresh, non-anomalous venues and a closely matching target-market price. Otherwise fail closed with an unavailable state.

**Why:** Different assets can share a ticker, and market-data providers do not list every exchange. Blind symbol or cross-venue pair reuse can silently open a chart for the wrong coin.

**How to apply:** Keep verification state separate from price-source metadata, preserve chain-specific address casing, and require re-verification when an asset identity or exchange mapping changes.