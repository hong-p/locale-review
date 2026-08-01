import { useQuery } from "@tanstack/react-query";
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";

import { type GitHubClient, createGitHubClient } from "../../api/client";
import {
  clearToken as clearStoredToken,
  getTokenStorageMode,
  readToken,
  setTokenStorageMode,
  writeToken,
} from "./tokenStorage";
import { type ConnectionResult, testConnection } from "./connection";
import type { TokenStorageMode } from "./tokenStorage";

/**
 * The token, its storage mode, and the client built from it.
 *
 * plan.md 4.1 forbids starting any pull request request without a token, so
 * `client` is null until one exists. That makes the rule structural: a screen
 * cannot accidentally fetch, because there is nothing to fetch with.
 */

type TokenContextValue = {
  token: string | null;
  mode: TokenStorageMode;
  /** Null until a token is set (plan.md 4.1). */
  client: GitHubClient | null;
  connection: ConnectionResult | null;
  setToken: (token: string, mode?: TokenStorageMode) => void;
  setMode: (mode: TokenStorageMode) => void;
  clearToken: () => void;
  setConnection: (result: ConnectionResult | null) => void;
};

const TokenContext = createContext<TokenContextValue | null>(null);

export function TokenProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => readToken());
  const [mode, setModeState] = useState<TokenStorageMode>(() => getTokenStorageMode());
  const [connection, setConnection] = useState<ConnectionResult | null>(null);

  const setToken = useCallback((next: string, nextMode?: TokenStorageMode) => {
    writeToken(next, nextMode);
    setTokenState(readToken());
    setModeState(getTokenStorageMode());
    // A new token invalidates whatever the previous one proved.
    setConnection(null);
  }, []);

  const setMode = useCallback((next: TokenStorageMode) => {
    setTokenStorageMode(next);
    setTokenState(readToken());
    setModeState(getTokenStorageMode());
  }, []);

  const clearToken = useCallback(() => {
    clearStoredToken();
    setTokenState(null);
    setConnection(null);
  }, []);

  const client = useMemo(() => (token === null ? null : createGitHubClient({ token })), [token]);

  /**
   * Resolves who the token belongs to as soon as there is one.
   *
   * The review flow needs the login to find this user's pending review
   * (plan.md 4.9). Leaving that to the Test connection button meant a reviewer
   * who never pressed it could not submit at all, which a browser test caught.
   */
  const viewer = useQuery({
    queryKey: ["viewer", token],
    enabled: client !== null,
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: ({ signal }) => {
      if (!client) throw new Error("viewer query ran without a client");
      return testConnection(client, signal);
    },
  });

  // An explicit Test connection result wins, since the user asked for it.
  const resolvedConnection = connection ?? viewer.data ?? null;

  const value = useMemo(
    () => ({
      token,
      mode,
      client,
      connection: resolvedConnection,
      setToken,
      setMode,
      clearToken,
      setConnection,
    }),
    [token, mode, client, resolvedConnection, setToken, setMode, clearToken],
  );

  return <TokenContext.Provider value={value}>{children}</TokenContext.Provider>;
}

export function useToken(): TokenContextValue {
  const value = useContext(TokenContext);
  if (!value) throw new Error("useToken must be used inside a TokenProvider");
  return value;
}
