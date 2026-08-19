import pool from "./db";
import { runMigrations } from "./db-migrate";

/**
 * Removes tracked tokens that were auto-imported exclusively from the given
 * wallet and are not held by any other currently-tracked wallet.
 *
 * Tokens manually added (wallet_source IS NULL) or sourced from a different
 * wallet are left untouched.
 */
export async function removeTokensForWallet(walletId: string): Promise<void> {
  await runMigrations();

  // Gather all symbols held by wallets *other* than the one being deleted so we
  // can avoid removing tokens that another wallet would still show.
  const { rows: otherWallets } = await pool.query(
    "SELECT data FROM wallet_portfolio WHERE id != $1",
    [walletId]
  );

  const otherSymbols = new Set<string>();
  for (const row of otherWallets) {
    const holdings: Array<{ symbol?: string }> =
      (row.data as { holdings?: Array<{ symbol?: string }> }).holdings ?? [];
    for (const h of holdings) {
      if (h.symbol) otherSymbols.add(h.symbol.toUpperCase());
    }
  }

  if (otherSymbols.size > 0) {
    const placeholders = [...otherSymbols].map((_, i) => `$${i + 2}`).join(",");
    await pool.query(
      `DELETE FROM tracked_tokens
       WHERE wallet_source = $1
         AND symbol NOT IN (${placeholders})`,
      [walletId, ...otherSymbols]
    );
  } else {
    await pool.query(
      "DELETE FROM tracked_tokens WHERE wallet_source = $1",
      [walletId]
    );
  }
}
