"use client";

import { useCallback, useEffect, useState } from "react";
import type { AppAccess } from "@/lib/access-policy";

const SESSION_HANDOFF_RETRY_MS = 750;
const SESSION_HANDOFF_RETRIES = 8;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useAppAccess(
  isSignedIn: boolean | undefined,
  onSessionInvalid?: () => void | Promise<void>,
) {
  const [access, setAccess] = useState<AppAccess | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(isSignedIn));
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isSignedIn) {
      setAccess(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      let response = await fetch("/api/access/me");
      for (let attempt = 0; response.status === 401 && attempt < SESSION_HANDOFF_RETRIES; attempt += 1) {
        await wait(SESSION_HANDOFF_RETRY_MS);
        response = await fetch("/api/access/me");
      }
      if (response.status === 401) {
        setAccess(null);
        await onSessionInvalid?.();
        return;
      }
      if (!response.ok) throw new Error("Unable to load your access permissions");
      setAccess(await response.json() as AppAccess);
    } catch (cause) {
      setAccess(null);
      setError(cause instanceof Error ? cause.message : "Unable to load your access permissions");
    } finally {
      setIsLoading(false);
    }
  }, [isSignedIn, onSessionInvalid]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { access, isLoading, error, refresh };
}