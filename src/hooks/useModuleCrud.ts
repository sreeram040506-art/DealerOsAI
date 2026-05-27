import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-hooks";
import { apiFetch, handleApiResponse } from "@/lib/api";

export type ModuleRecord = Record<string, any> & { id: string };

export function useModuleCrud(queryKey: string, endpoint: string) {
  const { token, logout } = useAuth();
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: [queryKey],
    queryFn: async () => {
      const response = await apiFetch(endpoint, token);
      return handleApiResponse<ModuleRecord[]>(response, logout);
    },
    enabled: Boolean(token),
  });

  const addMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const response = await apiFetch(endpoint, token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return handleApiResponse<ModuleRecord>(response, logout);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [queryKey] }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: Record<string, any> & { id: string }) => {
      const response = await apiFetch(`${endpoint}/${id}`, token, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return handleApiResponse<ModuleRecord>(response, logout);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [queryKey] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiFetch(`${endpoint}/${id}`, token, { method: "DELETE" });
      if (response.status === 204) return null;
      return handleApiResponse(response, logout);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [queryKey] }),
  });

  return {
    items: listQuery.data ?? [],
    isLoading: listQuery.isLoading,
    isError: listQuery.isError,
    addItem: addMutation.mutateAsync,
    updateItem: updateMutation.mutateAsync,
    deleteItem: deleteMutation.mutateAsync,
    isSaving: addMutation.isPending || updateMutation.isPending || deleteMutation.isPending,
  };
}
