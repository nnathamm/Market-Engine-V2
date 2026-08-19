import pool from "./db";
import { runMigrations } from "./db-migrate";
import { buildTokenIdentityKey, walletNetworkToChain } from "./token-identity";

/**
 * Removes a wallet and cleans up its auto-imported tokens atomically.
 *
 * Tokens manually added (wallet_source IS NULL) or sourced from a different
 * wallet are left untouched.
 *
 * @param options - Optional token IDs (preferred) or legacy symbols to preserve.
 *   Preserved tokens have their wallet_source cleared (set to NULL) so they
 *   are treated as manually tracked going forward.
 */
export async function removeWalletAndTokens(
  walletId: string,
  options?: { keepTokenIds?: Set<number>; keepSymbols?: Set<string> },
): Promise<boolean> {
  await runMigrations();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('wallet-token-cleanup'), 0)",
    );
    const walletResult = await client.query(
      "SELECT id FROM wallet_portfolio WHERE id = $1 FOR UPDATE",
      [walletId],
    );
    if (!walletResult.rowCount) {
      await client.query("COMMIT");
      return false;
    }

    const { rows: ownedTokens } = await client.query(
      `SELECT id, symbol, chain, contract_address
         FROM tracked_tokens
        WHERE wallet_source = $1
        FOR UPDATE`,
      [walletId],
    );
    const { rows: otherWallets } = await client.query(
      "SELECT id, data FROM wallet_portfolio WHERE id != $1",
      [walletId],
    );

    const peerWalletByIdentity = new Map<string, string>();
    for (const row of otherWallets) {
      const holdings: Array<{
        symbol?: string | null;
        network?: string;
        contractAddress?: string | null;
      }> = (row.data as {
        holdings?: Array<{
          symbol?: string | null;
          network?: string;
          contractAddress?: string | null;
        }>;
      }).holdings ?? [];
      for (const holding of holdings) {
        if (!holding.symbol) continue;
        const identity = buildTokenIdentityKey({
          symbol: holding.symbol,
          chain: walletNetworkToChain(holding.network ?? ""),
          contractAddress: holding.contractAddress,
        });
        if (!peerWalletByIdentity.has(identity)) {
          peerWalletByIdentity.set(identity, String(row.id));
        }
      }
    }

    const keepTokenIds = options?.keepTokenIds ?? new Set<number>();
    const legacyKeepSymbols = new Set(
      [...(options?.keepSymbols ?? [])].map((symbol) => symbol.toUpperCase()),
    );

    for (const token of ownedTokens as Array<{
      id: number;
      symbol: string;
      chain: string | null;
      contract_address: string | null;
    }>) {
      if (keepTokenIds.has(token.id) || legacyKeepSymbols.has(token.symbol.toUpperCase())) {
        await client.query(
          "UPDATE tracked_tokens SET wallet_source = NULL WHERE id = $1",
          [token.id],
        );
        continue;
      }

      const identity = buildTokenIdentityKey({
        symbol: token.symbol,
        chain: token.chain,
        contractAddress: token.contract_address,
      });
      const peerWalletId = peerWalletByIdentity.get(identity);
      if (peerWalletId) {
        await client.query(
          "UPDATE tracked_tokens SET wallet_source = $2 WHERE id = $1",
          [token.id, peerWalletId],
        );
      } else {
        await client.query("DELETE FROM tracked_tokens WHERE id = $1", [token.id]);
      }
    }
    await client.query("DELETE FROM wallet_portfolio WHERE id = $1", [walletId]);
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
