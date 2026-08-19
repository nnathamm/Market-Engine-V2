"use client";

import { useCallback, useEffect, useState } from "react";
import type { AppAccess } from "@/lib/access-policy";

export function useAppAccess(isSignedIn: boolean | undefined) {
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
      const response = await fetch("/api/access/me");
      if (!response.ok) throw new Error("Unable to load your access permissions");
      setAccess(await response.json() as AppAccess);
    } catch (cause) {
      setAccess(null);
      setError(cause instanceof Error ? cause.message : "Unable to load your access permissions");
    } finally {
      setIsLoading(false);
    }
  }, [isSignedIn]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { access, isLoading, error, refresh };
}