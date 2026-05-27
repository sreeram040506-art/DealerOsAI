import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-hooks';
import { AdvertisingExpense } from '@/types/inventory';
import { apiFetch, handleApiResponse } from '@/lib/api';

export function useAdvertising() {
  const { user, token, logout } = useAuth();
  const queryClient = useQueryClient();

  const adsQuery = useQuery({
    queryKey: ['advertising'],
    queryFn: async () => {
      const response = await apiFetch('/advertising', token);
      return handleApiResponse<AdvertisingExpense[]>(response, logout);
    },
    enabled: !!token && user?.role === 'ADMIN',
    staleTime: 60000,
  });

  const addAdMutation = useMutation({
    mutationFn: async (newAd: Partial<AdvertisingExpense>) => {
      const response = await apiFetch('/advertising', token, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newAd),
      });
      return handleApiResponse(response, logout);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['advertising'] });
    },
  });

  const updateAdMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<AdvertisingExpense> & { id: string }) => {
      const response = await apiFetch(`/advertising/${id}`, token, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });
      return handleApiResponse(response, logout);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['advertising'] });
    },
  });

  const deleteAdMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiFetch(`/advertising/${id}`, token, {
        method: 'DELETE',
      });
      return handleApiResponse(response, logout);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['advertising'] });
    },
  });

  const generateAdCopyMutation = useMutation({
    mutationFn: async (vehicleId: string) => {
      const response = await apiFetch('/advertising/generate-copy', token, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ vehicleId }),
      });
      return handleApiResponse<{ adCopy: string }>(response, logout);
    },
  });

  return {
    ads: adsQuery.data || [],
    isLoading: adsQuery.isLoading,
    isError: adsQuery.isError,
    error: adsQuery.error,
    addAd: addAdMutation.mutateAsync,
    updateAd: updateAdMutation.mutateAsync,
    deleteAd: deleteAdMutation.mutateAsync,
    generateAdCopy: generateAdCopyMutation.mutateAsync,
  };
}
