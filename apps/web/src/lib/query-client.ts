import { QueryClient } from "@tanstack/react-query";

let client: QueryClient | null = null;

export function getQueryClient(): QueryClient {
  if (client) return client;
  client = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
      mutations: {
        retry: 0,
      },
    },
  });
  return client;
}
