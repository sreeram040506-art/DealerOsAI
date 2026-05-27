import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-hooks';
import { apiFetch, handleApiResponse } from '@/lib/api';
import { toast } from 'sonner';

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  _count: {
    vehiclesAdded: number;
    salesMade: number;
  };
  vehiclesAdded: any[];
  salesMade: any[];
}

export function useTeam() {
  const { user, token, logout } = useAuth();
  const queryClient = useQueryClient();

  const teamQuery = useQuery({
    queryKey: ['team'],
    queryFn: async () => {
      const response = await apiFetch('/team', token);
      return handleApiResponse<TeamMember[]>(response, logout);
    },
    enabled: !!token && user?.role === 'ADMIN',
    staleTime: 60000,
  });

  const addMember = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiFetch('/team', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return handleApiResponse<TeamMember>(response, logout);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team'] });
      toast.success('Team member added successfully');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to add team member');
    }
  });

  const updateMember = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const response = await apiFetch(`/team/${id}`, token, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return handleApiResponse<TeamMember>(response, logout);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team'] });
      toast.success('Team member updated successfully');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to update team member');
    }
  });

  const deleteMember = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiFetch(`/team/${id}`, token, {
        method: 'DELETE'
      });
      return handleApiResponse<any>(response, logout);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team'] });
      toast.success('Team member removed');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to remove team member');
    }
  });

  return {
    team: teamQuery.data || [],
    isLoading: teamQuery.isLoading,
    isError: teamQuery.isError,
    addMember,
    updateMember,
    deleteMember
  };
}
