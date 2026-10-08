import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-hooks';
import { apiFetch, handleApiResponse } from '@/lib/api';

export interface PriceSuggestion {
  id: string;
  vehicleId: string;
  status: 'PENDING' | 'APPLIED' | 'DISMISSED' | 'IN_LINE' | 'NO_DATA';
  daysOnLot: number;
  currentPrice?: number | null;
  suggestedPrice?: number | null;
  marketLow?: number | null;
  marketMedian?: number | null;
  marketHigh?: number | null;
  belowCost: boolean;
  reason?: string | null;
  comparables?: { title: string; price: number; mileage?: number | null; url: string; source: string }[] | null;
  createdAt: string;
}

const json = { 'Content-Type': 'application/json' };

/** Owners and managers only: the server refuses everyone else. */
export function useCanSeePriceSuggestions() {
  const { user } = useAuth();
  return user?.role === 'ADMIN' || user?.role === 'MANAGER';
}

/** Vehicles that have a market suggestion waiting for a decision. */
export function usePendingPriceSuggestions() {
  const { token, logout } = useAuth();
  const allowed = useCanSeePriceSuggestions();
  const query = useQuery({
    queryKey: ['price-suggestions', 'pending'],
    queryFn: async () => handleApiResponse<PriceSuggestion[]>(await apiFetch('/price-suggestions', token), logout),
    enabled: !!token && allowed,
    staleTime: 60_000,
  });
  return { pending: query.data ?? [], pendingVehicleIds: new Set((query.data ?? []).map((s) => s.vehicleId)) };
}

export function useVehiclePriceSuggestions(vehicleId?: string) {
  const { token, logout } = useAuth();
  const queryClient = useQueryClient();
  const allowed = useCanSeePriceSuggestions();
  const key = ['price-suggestions', 'vehicle', vehicleId];
  const query = useQuery({
    queryKey: key,
    queryFn: async () => handleApiResponse<PriceSuggestion[]>(await apiFetch(`/price-suggestions/vehicle/${vehicleId}`, token), logout),
    enabled: !!token && !!vehicleId && allowed,
  });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['price-suggestions'] });
    queryClient.invalidateQueries({ queryKey: ['vehicles'] });
  };
  const check = useMutation({
    mutationFn: async () => handleApiResponse<PriceSuggestion>(await apiFetch(`/price-suggestions/vehicle/${vehicleId}/check`, token, { method: 'POST' }), logout),
    onSuccess: refresh,
  });
  const apply = useMutation({
    mutationFn: async (id: string) => handleApiResponse<{ askingPrice: number }>(await apiFetch(`/price-suggestions/${id}/apply`, token, { method: 'POST', headers: json }), logout),
    onSuccess: refresh,
  });
  const dismiss = useMutation({
    mutationFn: async (id: string) => handleApiResponse(await apiFetch(`/price-suggestions/${id}/dismiss`, token, { method: 'POST', headers: json }), logout),
    onSuccess: refresh,
  });
  return {
    allowed,
    latest: query.data?.[0] as PriceSuggestion | undefined,
    isLoading: query.isLoading,
    check: check.mutateAsync, isChecking: check.isPending,
    apply: apply.mutateAsync, isApplying: apply.isPending,
    dismiss: dismiss.mutateAsync, isDismissing: dismiss.isPending,
  };
}
