import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-hooks';
import { apiFetch, handleApiResponse } from '@/lib/api';

export function useRepairs() {
  const { token, logout } = useAuth();
  const queryClient = useQueryClient();

  const addRepairMutation = useMutation({
    mutationFn: async (newRepair: {
      vehicleId: string;
      repairShop: string;
      partsCost: number;
      laborCost: number;
      description: string;
      repairDate?: string;
    }) => {
      const response = await apiFetch('/repairs', token, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newRepair),
      });
      return handleApiResponse(response, logout);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    },
  });

  return {
    addRepair: addRepairMutation.mutateAsync,
    isAdding: addRepairMutation.isPending,
  };
}
