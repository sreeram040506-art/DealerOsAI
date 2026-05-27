import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-hooks';
import { apiFetch, handleApiResponse } from '@/lib/api';
import { Vehicle } from '@/types/inventory';
import { TeamMember } from './useTeam';

export interface DashboardSummary {
  vehicles: Vehicle[];
  sales: any[];
  advertising: any[];
  expenses: any[];
  team: TeamMember[];
}

export function useDashboard() {
  const { token, logout } = useAuth();

  const dashboardQuery = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: async () => {
      const response = await apiFetch('/dashboard/summary', token);
      return handleApiResponse<DashboardSummary>(response, logout);
    },
    enabled: !!token,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    data: dashboardQuery.data,
    isLoading: dashboardQuery.isLoading,
    isError: dashboardQuery.isError,
    error: dashboardQuery.error
  };
}
