import pool from "./db";
import { runMigrations } from "./db-migrate";

/**
 * Removes tracked tokens that were auto-imported exclusively from the given
 * wallet and are not held by any other currently-tracked wallet.
 *
 * Tokens manually added (wallet_source IS NULL) or sourced from a different
 * wallet are left untouched.
 *
 * @param keepSymbols - Optional set of symbols to preserve rather than delete.
 *   Preserved tokens have their wallet_source cleared (set to NULL) so they
 *   are treated as manually tracked going forward.
 */
export async function removeTokensForWallet(
  walletId: string,
  keepSymbols?: Set<string>,
): Promise<void> {
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

  // If the caller asked to keep certain symbols, clear their wallet_source so
  // they become manually tracked tokens rather than being deleted.
  if (keepSymbols && keepSymbols.size > 0) {
    const keepList = [...keepSymbols].map(s => s.toUpperCase());
    const placeholders = keepList.map((_, i) => `$${i + 2}`).join(",");
    await pool.query(
      `UPDATE tracked_tokens
          SET wallet_source = NULL
        WHERE wallet_source = $1
          AND symbol IN (${placeholders})`,
      [walletId, ...keepList]
    );
  }

  // Build the full set of symbols to skip deletion: other wallets' tokens plus
  // any the user explicitly chose to keep.
  const skipSymbols = new Set([...otherSymbols, ...(keepSymbols ?? [])].map(s => s.toUpperCase()));

  if (skipSymbols.size > 0) {
    const placeholders = [...skipSymbols].map((_, i) => `$${i + 2}`).join(",");
    await pool.query(
      `DELETE FROM tracked_tokens
       WHERE wallet_source = $1
         AND symbol NOT IN (${placeholders})`,
      [walletId, ...skipSymbols]
    );
  } else {
    await pool.query(
      "DELETE FROM tracked_tokens WHERE wallet_source = $1",
      [walletId]
    );
  }
}
