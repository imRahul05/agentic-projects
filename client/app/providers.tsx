"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { ApiConfigurationError, ApiError } from "@/lib/api/http";

export interface ProvidersProps {
  readonly children: ReactNode;
}

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Capabilities are the only cached resource and they override this with
        // `Infinity`; the default is a sane floor for anything added later.
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          // A misconfigured base URL or a 4xx will not fix itself.
          if (error instanceof ApiConfigurationError) {
            return false;
          }
          if (error instanceof ApiError && !error.retryable) {
            return false;
          }
          return failureCount < 2;
        },
      },
    },
  });
}

export function Providers({ children }: ProvidersProps) {
  /**
   * Created inside the component, never at module scope: a module-level client
   * is shared across concurrent requests on the server, which leaks one user's
   * cache into another's render.
   */
  const [queryClient] = useState(createQueryClient);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
