import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-hooks';
import { apiFetch, handleApiResponse } from '@/lib/api';

export const LEAD_STATUSES = ['Interested', 'Negotiating', 'Won', 'Lost'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export interface VehicleLead {
  id: string;
  vehicleId: string;
  customerName: string;
  phone?: string | null;
  email?: string | null;
  offerAmount?: number | null;
  status: LeadStatus;
  notes?: string | null;
  createdAt: string;
}

export interface NewVehicleLead {
  vehicleId: string;
  customerName: string;
  phone?: string;
  email?: string;
  offerAmount?: string;
  status?: LeadStatus;
  notes?: string;
}

/** Customers who asked about one vehicle, with what they offered. */
export function useVehicleLeads(vehicleId?: string) {
  const { token, logout } = useAuth();
  const queryClient = useQueryClient();
  const key = ['vehicle-leads', vehicleId];

  const query = useQuery({
    queryKey: key,
    queryFn: async () => handleApiResponse<VehicleLead[]>(await apiFetch(`/vehicle-leads/vehicle/${vehicleId}`, token), logout),
    enabled: !!vehicleId && !!token,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: key });
  const json = { 'Content-Type': 'application/json' };

  const add = useMutation({
    mutationFn: async (lead: NewVehicleLead) => handleApiResponse<VehicleLead>(await apiFetch('/vehicle-leads', token, { method: 'POST', headers: json, body: JSON.stringify(lead) }), logout),
    onSuccess: refresh,
  });
  const update = useMutation({
    mutationFn: async ({ id, ...changes }: { id: string; status?: LeadStatus; offerAmount?: string; notes?: string }) =>
      handleApiResponse<VehicleLead>(await apiFetch(`/vehicle-leads/${id}`, token, { method: 'PATCH', headers: json, body: JSON.stringify(changes) }), logout),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/vehicle-leads/${id}`, token, { method: 'DELETE' });
      if (res.status === 204) return true;
      return handleApiResponse(res, logout);
    },
    onSuccess: refresh,
  });

  return { leads: query.data ?? [], isLoading: query.isLoading, addLead: add.mutateAsync, isAdding: add.isPending, updateLead: update.mutateAsync, deleteLead: remove.mutateAsync };
}
