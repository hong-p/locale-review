import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter } from "react-router";

import { ThemeProvider } from "../features/settings/theme";
import { ErrorBoundary } from "./ErrorBoundary";
import { AppRoutes } from "./routes";

/**
 * plan.md 3.2: mutations must never retry automatically, because a retried
 * comment or review submission can duplicate it on GitHub.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
        staleTime: 30_000,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

const queryClient = createQueryClient();

export function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <HashRouter>
            <AppRoutes />
          </HashRouter>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
