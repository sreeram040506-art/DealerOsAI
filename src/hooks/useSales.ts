import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-hooks';
import { Sale } from '@/types/inventory';
import { apiFetch, handleApiResponse } from '@/lib/api';

export function useSales() {
  const { token, logout } = useAuth();
  const queryClient = useQueryClient();

  const salesQuery = useQuery({
    queryKey: ['sales'],
    queryFn: async () => {
      const response = await apiFetch('/sales', token);
      return handleApiResponse<Sale[]>(response, logout);
    },
    enabled: !!token,
    staleTime: 60000,
  });

  const addSaleMutation = useMutation({
    mutationFn: async (newSale: Partial<Sale>) => {
      const response = await apiFetch('/sales', token, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newSale),
      });
      return handleApiResponse(response, logout);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    },
  });

  const deleteSaleMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiFetch(`/sales/${id}`, token, {
        method: 'DELETE',
      });
      return handleApiResponse(response, logout);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    },
  });

  return {
    sales: salesQuery.data || [],
    isLoading: salesQuery.isLoading,
    isError: salesQuery.isError,
    error: salesQuery.error,
    addSale: addSaleMutation.mutateAsync,
    deleteSale: deleteSaleMutation.mutateAsync,
  };
}
