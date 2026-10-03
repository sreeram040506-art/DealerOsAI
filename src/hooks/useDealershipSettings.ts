import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-hooks';
import { apiFetch, handleApiResponse } from '@/lib/api';

export type DealershipSettings = {
  notifications: {
    emailEnabled: boolean;
    fromEmail: string;
    alertEmails: string[];
    smsEnabled: boolean;
    smsFromNumber: string;
    alertPhones: string[];
    slackEnabled: boolean;
    events: { newLead: boolean; manualAlerts: boolean };
  };
  marketing: {
    enabledChannels: string[];
    facebookPageId: string;
    lowMileagePerYear: number;
  };
  ai: { enabled: boolean };
  swapNetwork: { participate: boolean; minDaysInStock: number };
};

export type CredentialName =
  | 'facebookAccessToken'
  | 'sendgridApiKey'
  | 'twilioAccountSid'
  | 'twilioAuthToken'
  | 'slackWebhookUrl'
  | 'openaiApiKey';

export type CredentialState = { configured: boolean; hint?: string };

export type SettingsResponse = {
  settings: DealershipSettings;
  credentials: Record<CredentialName, CredentialState>;
  platformAiAvailable: boolean;
  canStoreCredentials: boolean;
  updatedAt: string | null;
};

export type SettingsUpdate = {
  settings?: { [K in keyof DealershipSettings]?: Partial<DealershipSettings[K]> };
  credentials?: Partial<Record<CredentialName, string | null>>;
};

export type TestIntegration = 'email' | 'sms' | 'slack' | 'facebook' | 'openai';

/** Error from the settings API, carrying per-field validation messages when present. */
export class SettingsError extends Error {
  constructor(message: string, public fieldErrors: { path: string; message: string }[] = []) {
    super(message);
  }
}

export function useDealershipSettings() {
  const { token, logout } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['dealership-settings'],
    queryFn: async () => handleApiResponse<SettingsResponse>(await apiFetch('/dealerships/settings', token), logout),
    enabled: Boolean(token),
  });

  const save = useMutation({
    mutationFn: async (update: SettingsUpdate) => {
      const response = await apiFetch('/dealerships/settings', token, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      });
      if (!response.ok && response.status !== 401) {
        const body = await response.json().catch(() => ({}));
        throw new SettingsError(body.message || 'Could not save settings', body.errors || []);
      }
      return handleApiResponse<SettingsResponse>(response, logout);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['dealership-settings'], data);
      // Marketing options (enabled channels) come from these settings.
      queryClient.invalidateQueries({ queryKey: ['marketing-options'] });
    },
  });

  const test = useMutation({
    mutationFn: async (integration: TestIntegration) => {
      const response = await apiFetch(`/dealerships/settings/test/${integration}`, token, { method: 'POST' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || 'Test failed');
      return body as { ok: boolean; message: string };
    },
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    save: save.mutateAsync,
    isSaving: save.isPending,
    test: test.mutateAsync,
    testing: test.isPending ? test.variables : null,
  };
}
