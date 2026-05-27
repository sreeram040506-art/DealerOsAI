import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-hooks';
import { apiFetch, handleApiResponse } from '@/lib/api';
import { CustomerNote } from '@/types/inventory';

export function useNotes(vehicleId?: string) {
  const { token, logout } = useAuth();
  const queryClient = useQueryClient();

  const notesQuery = useQuery({
    queryKey: ['notes', vehicleId],
    queryFn: async () => {
      if (!vehicleId) return [];
      const response = await apiFetch(`/notes/vehicle/${vehicleId}`, token);
      return handleApiResponse(response, logout);
    },
    enabled: !!vehicleId && !!token,
  });

  const addNoteMutation = useMutation({
    mutationFn: async (newNote: {
      vehicleId: string;
      customerName: string;
      phone: string;
      email?: string;
      note: string;
    }) => {
      const response = await apiFetch('/notes', token, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newNote),
      });
      return handleApiResponse(response, logout);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes', vehicleId] });
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      const response = await apiFetch(`/notes/${noteId}`, token, {
        method: 'DELETE',
      });
      if (response.status === 204) return true;
      return handleApiResponse(response, logout);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes', vehicleId] });
    },
  });

  return {
    notes: notesQuery.data as CustomerNote[] | undefined,
    isLoadingNotes: notesQuery.isLoading,
    addNote: addNoteMutation.mutateAsync,
    isAddingNote: addNoteMutation.isPending,
    deleteNote: deleteNoteMutation.mutateAsync,
  };
}
