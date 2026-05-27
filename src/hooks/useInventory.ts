import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-hooks';
import { Vehicle } from '@/types/inventory';
import { apiFetch, handleApiResponse } from '@/lib/api';

export function useInventory() {
  const { token, logout } = useAuth();
  const queryClient = useQueryClient();

  const vehiclesQuery = useQuery({
    queryKey: ['vehicles'],
    queryFn: async () => {
      const response = await apiFetch('/vehicles', token);
      return handleApiResponse<Vehicle[]>(response, logout);
    },
    enabled: !!token,
    staleTime: 60000,
  });

  const addVehicleMutation = useMutation({
    mutationFn: async (newVehicle: Partial<Vehicle>) => {
      const response = await apiFetch('/vehicles', token, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newVehicle),
      });
      return handleApiResponse(response, logout);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    },
  });

  const updateVehicleMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Vehicle> & { id: string }) => {
      const response = await apiFetch(`/vehicles/${id}`, token, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });
      return handleApiResponse(response, logout);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    },
  });

  const deleteVehicleMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiFetch(`/vehicles/${id}`, token, {
        method: 'DELETE',
      });
      return handleApiResponse(response, logout);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    },
  });

  return {
    vehicles: vehiclesQuery.data || [],
    isLoading: vehiclesQuery.isLoading,
    isError: vehiclesQuery.isError,
    error: vehiclesQuery.error,
    addVehicle: addVehicleMutation.mutateAsync,
    updateVehicle: updateVehicleMutation.mutateAsync,
    deleteVehicle: deleteVehicleMutation.mutateAsync,
  };
}
