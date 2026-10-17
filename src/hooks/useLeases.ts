import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-hooks';
import { apiFetch, handleApiResponse } from '@/lib/api';

export type LeasePhase = 'PICKUP' | 'RETURN';

export interface LeaseVehicle {
  id: string;
  year: number;
  make: string;
  model: string;
  vin: string;
  color: string;
  stockNumber?: string | null;
}

export interface LeasePhotoMeta {
  id: string;
  phase: LeasePhase;
  angle: string;
}

export interface Lease {
  id: string;
  vehicleId: string;
  vehicle: LeaseVehicle;
  customerName: string;
  customerPhone?: string | null;
  startDate: string;
  endDate?: string | null;
  returnedAt?: string | null;
  status: 'ACTIVE' | 'RETURNED';
  notes?: string | null;
  photos?: LeasePhotoMeta[];
}

export interface LeasePhoto extends LeasePhotoMeta {
  dataUrl: string;
}

const json = { 'Content-Type': 'application/json' };

export function useLeases() {
  const { token, logout } = useAuth();
  return useQuery({
    queryKey: ['leases'],
    queryFn: async () => handleApiResponse<Lease[]>(await apiFetch('/leases', token), logout),
    enabled: !!token,
  });
}

export function useLease(id: string | undefined) {
  const { token, logout } = useAuth();
  return useQuery({
    queryKey: ['leases', id],
    queryFn: async () => handleApiResponse<Lease>(await apiFetch(`/leases/${id}`, token), logout),
    enabled: !!token && !!id,
  });
}

export function useLeasePhotos(id: string | undefined, enabled = true) {
  const { token, logout } = useAuth();
  return useQuery({
    queryKey: ['leases', id, 'photos'],
    queryFn: async () => handleApiResponse<LeasePhoto[]>(await apiFetch(`/leases/${id}/photos`, token), logout),
    enabled: !!token && !!id && enabled,
  });
}

export function useLeaseActions() {
  const { token, logout } = useAuth();
  const qc = useQueryClient();
  const refresh = (id?: string) => {
    qc.invalidateQueries({ queryKey: ['leases'] });
    if (id) qc.invalidateQueries({ queryKey: ['leases', id] });
  };

  const create = useMutation({
    mutationFn: async (body: { vehicleId: string; customerName: string; customerPhone?: string; endDate?: string; notes?: string }) =>
      handleApiResponse<Lease>(await apiFetch('/leases', token, { method: 'POST', headers: json, body: JSON.stringify(body) }), logout),
    onSuccess: () => refresh(),
  });

  const uploadPhoto = useMutation({
    mutationFn: async ({ id, phase, angle, dataUrl }: { id: string; phase: LeasePhase; angle: string; dataUrl: string }) =>
      handleApiResponse(await apiFetch(`/leases/${id}/photos`, token, { method: 'PUT', headers: json, body: JSON.stringify({ phase, angle, dataUrl }) }), logout),
    onSuccess: (_d, v) => refresh(v.id),
  });

  const deletePhoto = useMutation({
    mutationFn: async ({ id, photoId }: { id: string; photoId: string }) =>
      handleApiResponse(await apiFetch(`/leases/${id}/photos/${photoId}`, token, { method: 'DELETE' }), logout),
    onSuccess: (_d, v) => refresh(v.id),
  });

  const markReturned = useMutation({
    mutationFn: async (id: string) =>
      handleApiResponse<Lease>(await apiFetch(`/leases/${id}/return`, token, { method: 'POST' }), logout),
    onSuccess: (_d, id) => refresh(id),
  });

  return { create, uploadPhoto, deletePhoto, markReturned };
}
