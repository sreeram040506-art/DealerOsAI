import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-hooks';
import { apiFetch, handleApiResponse } from '@/lib/api';

export type ListingStatus = 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED';
export type ChannelResultStatus = 'POSTED' | 'NOT_CONNECTED' | 'FAILED';

export type ChannelResult = {
  channel: string;
  status: ChannelResultStatus;
  at: string;
  permalink?: string;
  trackingUrl?: string;
  note?: string;
  error?: string;
};

export type ChannelStats = { views?: number; inquiries?: number };

export type MarketingListing = {
  id: string;
  vehicleId?: string | null;
  vin: string;
  vehicleSpecs: string;
  photos: string[];
  photoUrls: string[];
  mileage: number;
  condition: string;
  pricing: number;
  channels: string[];
  seoTitle: string;
  description: string;
  hashtags: string[];
  featureBullets: string[];
  adCopy: string;
  copySource?: 'AI' | 'TEMPLATE' | null;
  status: ListingStatus;
  scheduledFor?: string | null;
  publishedAt?: string | null;
  archivedReason?: string | null;
  scheduledPosts?: ChannelResult[] | null;
  analytics?: { views?: number; inquiries?: number; byChannel?: Record<string, ChannelStats> } | null;
  publicPath: string;
  createdAt: string;
  updatedAt: string;
};

export type LeadStatus = 'NEW' | 'CONTACTED' | 'CONVERTED';

export type MarketingLead = {
  id: string;
  listingId: string;
  listingTitle?: string | null;
  source: string;
  campaign?: string | null;
  leadName?: string | null;
  leadPhone?: string | null;
  leadEmail?: string | null;
  message?: string | null;
  status: LeadStatus;
  customerId?: string | null;
  createdAt: string;
};

export type CampaignResult =
  | { id: string; attributable: false }
  | {
      id: string;
      attributable: true;
      leads: number;
      costPerLead: number | null;
      sold: boolean;
      saleRevenue: number | null;
      returnOnAdSpend: number | null;
    };

export type MarketingSummary = {
  listings: { published: number; scheduled: number; drafts: number; archived: number };
  leads: { total: number; thisWeek: number };
  spend: { total: number; active: number };
  costPerLead: number | null;
  campaigns: CampaignResult[];
  channelStatus: Record<string, { posted: number; notConnected: number; failed: number }>;
};

export type MarketingOptions = { channels: string[]; conditions: string[] };

export type GeneratePayload = {
  vehicleId?: string;
  vin: string;
  vehicleSpecs: string;
  photos: string[];
  mileage: number;
  condition: string;
  pricing: number;
  channels: string[];
};

export type ListingUpdate = Partial<
  Pick<MarketingListing, 'seoTitle' | 'description' | 'adCopy' | 'featureBullets' | 'hashtags' | 'pricing' | 'mileage' | 'condition' | 'channels'>
> & { addPhotos?: string[]; removePhotos?: string[] };

const KEYS = {
  listings: ['marketing-listings'],
  summary: ['marketing-summary'],
  leads: ['marketing-leads'],
  options: ['marketing-options'],
};

export function useMarketing() {
  const { token, logout } = useAuth();
  const queryClient = useQueryClient();

  const request = async <T,>(path: string, init?: RequestInit & { json?: unknown }) => {
    const { json, ...rest } = init ?? {};
    const response = await apiFetch(path, token, {
      ...rest,
      ...(json !== undefined
        ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(json) }
        : {}),
    });
    if (response.status === 204) return undefined as T;
    return handleApiResponse<T>(response, logout);
  };

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: KEYS.listings });
    queryClient.invalidateQueries({ queryKey: KEYS.summary });
  };

  const listingQuery = useQuery({
    queryKey: KEYS.listings,
    queryFn: () => request<MarketingListing[]>('/marketing'),
    enabled: Boolean(token),
  });

  const summaryQuery = useQuery({
    queryKey: KEYS.summary,
    queryFn: () => request<MarketingSummary>('/marketing/summary'),
    enabled: Boolean(token),
    staleTime: 30 * 1000,
  });

  const optionsQuery = useQuery({
    queryKey: KEYS.options,
    queryFn: () => request<MarketingOptions>('/marketing/options'),
    enabled: Boolean(token),
    staleTime: Infinity,
  });

  const leadsQuery = useQuery({
    queryKey: KEYS.leads,
    queryFn: () => request<MarketingLead[]>('/marketing/leads/list'),
    enabled: Boolean(token),
    staleTime: 30 * 1000,
  });

  const generate = useMutation({
    mutationFn: (payload: GeneratePayload) => request<MarketingListing>('/marketing/generate', { method: 'POST', json: payload }),
    onSuccess: refreshAll,
  });

  const update = useMutation({
    mutationFn: ({ id, ...changes }: ListingUpdate & { id: string }) =>
      request<MarketingListing>(`/marketing/${id}`, { method: 'PATCH', json: changes }),
    onSuccess: refreshAll,
  });

  const publish = useMutation({
    mutationFn: ({ id, channels, scheduleAt }: { id: string; channels: string[]; scheduleAt?: string }) =>
      request<MarketingListing>(`/marketing/${id}/publish`, { method: 'POST', json: { channels, scheduleAt } }),
    onSuccess: refreshAll,
  });

  const archive = useMutation({
    mutationFn: (id: string) => request<MarketingListing>(`/marketing/${id}/archive`, { method: 'POST' }),
    onSuccess: refreshAll,
  });

  const remove = useMutation({
    mutationFn: (id: string) => request<void>(`/marketing/${id}`, { method: 'DELETE' }),
    onSuccess: refreshAll,
  });

  const setLeadStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'NEW' | 'CONTACTED' }) =>
      request(`/marketing/leads/${id}`, { method: 'PATCH', json: { status } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEYS.leads }),
  });

  const convertLead = useMutation({
    mutationFn: (id: string) =>
      request<{ customerId: string; existing: boolean }>(`/marketing/leads/${id}/convert`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.leads });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });

  return {
    listings: listingQuery.data ?? [],
    summary: summaryQuery.data,
    options: optionsQuery.data,
    leads: leadsQuery.data ?? [],
    isLoading: listingQuery.isLoading,
    isError: listingQuery.isError,
    leadsError: leadsQuery.isError,
    leadsLoading: leadsQuery.isLoading,
    refetchLeads: leadsQuery.refetch,
    generateListing: generate.mutateAsync,
    isGenerating: generate.isPending,
    updateListing: update.mutateAsync,
    isUpdating: update.isPending,
    publishListing: publish.mutateAsync,
    isPublishing: publish.isPending,
    archiveListing: archive.mutateAsync,
    deleteListing: remove.mutateAsync,
    setLeadStatus: setLeadStatus.mutateAsync,
    convertLead: convertLead.mutateAsync,
  };
}
