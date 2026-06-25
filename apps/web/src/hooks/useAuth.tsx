import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { apiGet, apiPost } from "@/lib/api-client";
import type { MeResponse } from "@megick/api-types";

export const ME_QUERY_KEY = ["auth", "me"] as const;

export function useAuth(options?: { enabled?: boolean }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: () => apiGet<MeResponse>("/api/auth/me"),
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
    retry: false,
  });

  const signOut = useMutation({
    mutationFn: () => apiPost("/api/auth/logout"),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
      const signOutTarget =
        typeof window !== "undefined" && window.megickDesktop?.isElectron ? "/desktop-login" : "/";
      navigate({ to: signOutTarget });
    },
  });

  const user = data?.user ?? null;

  return {
    user,
    loading: isLoading,
    refreshing: isFetching && !isLoading,
    isSuperAdmin: !!user?.isSuperAdmin,
    signOut: () => signOut.mutateAsync(),
    refetch,
  };
}

export function invalidateMe(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
}
