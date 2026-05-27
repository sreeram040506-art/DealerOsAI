import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-hooks';
import { apiFetch, handleApiResponse } from '@/lib/api';

export interface DocumentLog {
  id: string;
  vin: string | null;
  make: string | null;
  model: string | null;
  year: string | null;
  color?: string | null;
  mileage?: string | null;
  titleNumber?: string | null;
  purchaseDate?: string | null;
  purchasedFrom?: string | null;
  sellerAddress?: string | null;
  sellerCity?: string | null;
  sellerState?: string | null;
  sellerZip?: string | null;
  documentType: string;
  documentBase64?: string | null;
  sourceDocumentBase64?: string | null;
  sourceFileName: string | null;
  // Disposition details
  disposedTo?: string | null;
  disposedAddress?: string | null;
  disposedCity?: string | null;
  disposedState?: string | null;
  disposedZip?: string | null;
  disposedDate?: string | null;
  disposedPrice?: string | null;
  disposedOdometer?: string | null;
  disposedDlNumber?: string | null;
  disposedDlState?: string | null;
  createdAt: string;
}

export function useRegistry() {
  const { token, logout } = useAuth();
  const queryClient = useQueryClient();

  const registryQuery = useQuery({
    queryKey: ['registry'],
    queryFn: async () => {
      const response = await apiFetch('/registry', token);
      return handleApiResponse<DocumentLog[]>(response, logout);
    },
    enabled: !!token,
    staleTime: 60000,
  });

  const updateRegistryMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<DocumentLog> & { id: string }) => {
      const response = await apiFetch(`/registry/${id}`, token, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });
      return handleApiResponse(response, logout);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['registry'] });
    },
  });

  const deleteRegistryMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiFetch(`/registry/${id}`, token, {
        method: 'DELETE',
      });
      return handleApiResponse(response, logout);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['registry'] });
    },
  });

  return {
    logs: registryQuery.data || [],
    isLoading: registryQuery.isLoading,
    isError: registryQuery.isError,
    updateLog: updateRegistryMutation.mutateAsync,
    deleteLog: deleteRegistryMutation.mutateAsync,
  };
}
