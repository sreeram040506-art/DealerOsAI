import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-hooks';
import { apiFetch, handleApiResponse } from '@/lib/api';

export type MarketingListing = {
  id: string;
  vin: string;
  vehicleSpecs: string;
  photos: string[];
  mileage: number;
  condition: string;
  pricing: number;
  channels: string[];
  seoTitle: string;
  description: string;
  hashtags: string[];
  featureBullets: string[];
  adCopy: string;
  ctaOptimization: string;
  formattedListing: string;
  scheduledPosts?: any;
  analytics?: any;
  leadAttribution?: any;
  createdAt: string;
  updatedAt: string;
};

export type MarketingLead = {
  id: string;
  listingId: string;
  source: string;
  campaign?: string | null;
  leadName?: string | null;
  leadPhone?: string | null;
  leadEmail?: string | null;
  createdAt: string;
};

type GeneratePayload = {
  vehicleId?: string;
  vin: string;
  vehicleSpecs: string;
  photos: string[];
  mileage: number;
  condition: string;
  pricing: number;
  channels: string[];
};

export function useMarketing() {
  const { token, logout } = useAuth();
  const queryClient = useQueryClient();

  const listingQuery = useQuery({
    queryKey: ['marketing-listings'],
    queryFn: async () => {
      const response = await apiFetch('/marketing', token);
      return handleApiResponse<MarketingListing[]>(response, logout);
    },
    enabled: Boolean(token),
  });

  const generateMutation = useMutation({
    mutationFn: async (payload: GeneratePayload) => {
      const response = await apiFetch('/marketing/generate', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return handleApiResponse<MarketingListing>(response, logout);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['marketing-listings'] }),
  });

  const updateScheduleMutation = useMutation({
    mutationFn: async ({ id, scheduledPosts }: { id: string; scheduledPosts: any[] }) => {
      const response = await apiFetch(`/marketing/${id}/schedule`, token, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledPosts }),
      });
      return handleApiResponse<MarketingListing>(response, logout);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['marketing-listings'] }),
  });

  const updateAnalyticsMutation = useMutation({
    mutationFn: async ({ id, analytics, leadAttribution }: { id: string; analytics?: any; leadAttribution?: any }) => {
      const response = await apiFetch(`/marketing/${id}/analytics`, token, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analytics, leadAttribution }),
      });
      return handleApiResponse<MarketingListing>(response, logout);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['marketing-listings'] }),
  });

  const publishMutation = useMutation({
    mutationFn: async ({ id, channels }: { id: string; channels: string[] }) => {
      const response = await apiFetch(`/marketing/${id}/publish`, token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channels }),
      });
      return handleApiResponse<MarketingListing>(response, logout);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['marketing-listings'] }),
  });

  const captureLeadMutation = useMutation({
    mutationFn: async ({
      id,
      source,
      campaign,
      leadName,
      leadPhone,
      leadEmail,
    }: {
      id: string;
      source: string;
      campaign?: string;
      leadName?: string;
      leadPhone?: string;
      leadEmail?: string;
    }) => {
      const response = await apiFetch(`/marketing/${id}/lead`, token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, campaign, leadName, leadPhone, leadEmail }),
      });
      return handleApiResponse<MarketingLead>(response, logout);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['marketing-listings'] }),
  });

  return {
    listings: listingQuery.data || [],
    isLoading: listingQuery.isLoading,
    isError: listingQuery.isError,
    generateListing: generateMutation.mutateAsync,
    updateSchedule: updateScheduleMutation.mutateAsync,
    updateAnalytics: updateAnalyticsMutation.mutateAsync,
    publishListing: publishMutation.mutateAsync,
    captureLead: captureLeadMutation.mutateAsync,
    isSaving: generateMutation.isPending || updateScheduleMutation.isPending || updateAnalyticsMutation.isPending || publishMutation.isPending || captureLeadMutation.isPending,
  };
}
