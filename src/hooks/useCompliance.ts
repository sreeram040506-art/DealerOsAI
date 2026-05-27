import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-hooks';
import { apiFetch, handleApiResponse } from '@/lib/api';

export type ComplianceRecord = {
  id: string;
  vin: string;
  vehicleCategory?: string | null;
  dealType?: string | null;
  insuranceStatus?: string | null;
  titleStatus?: string | null;
  titleTransfer?: string | null;
  registrationStatus?: string | null;
  inspectionValidity?: string | null;
  insuranceVerification?: string | null;
  taxSubmission?: string | null;
  temporaryPlateExpiration?: string | null;
  complianceWarnings: string[];
  filingDeadlines: string[];
  penaltyRisks: string[];
  blockingActions: string[];
  createdAt: string;
  updatedAt: string;
};

export type ComplianceAudit = {
  id: string;
  user_id: string;
  timestamp: string;
  action_type: string;
  old_value?: unknown;
  new_value?: unknown;
  device?: string | null;
  IP?: string | null;
};

export function useCompliance() {
  const { token, logout } = useAuth();
  const queryClient = useQueryClient();

  const recordsQuery = useQuery({
    queryKey: ['compliance'],
    queryFn: async () => {
      const response = await apiFetch('/compliance', token);
      return handleApiResponse<ComplianceRecord[]>(response, logout);
    },
    enabled: Boolean(token),
  });

  const createMutation = useMutation({
    mutationFn: async (payload: Partial<ComplianceRecord> & { vin: string }) => {
      const response = await apiFetch('/compliance', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return handleApiResponse<ComplianceRecord>(response, logout);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['compliance'] }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...payload }: Partial<ComplianceRecord> & { id: string }) => {
      const response = await apiFetch(`/compliance/${id}`, token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return handleApiResponse<ComplianceRecord>(response, logout);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['compliance'] }),
  });

  const evaluateMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiFetch(`/compliance/${id}/evaluate`, token, {
        method: 'POST',
      });
      return handleApiResponse<ComplianceRecord>(response, logout);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['compliance'] }),
  });

  const getAudit = async (id: string) => {
    const response = await apiFetch(`/compliance/${id}/audit`, token);
    return handleApiResponse<ComplianceAudit[]>(response, logout);
  };

  return {
    records: recordsQuery.data || [],
    isLoading: recordsQuery.isLoading,
    isError: recordsQuery.isError,
    createRecord: createMutation.mutateAsync,
    updateRecord: updateMutation.mutateAsync,
    evaluateRecord: evaluateMutation.mutateAsync,
    getAudit,
    isSaving: createMutation.isPending || updateMutation.isPending || evaluateMutation.isPending,
  };
}
