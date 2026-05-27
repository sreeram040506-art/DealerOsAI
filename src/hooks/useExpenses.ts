import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-hooks';
import { BusinessExpense } from '@/types/inventory';
import { apiFetch, handleApiResponse } from '@/lib/api';

export function useExpenses() {
  const { user, token, logout } = useAuth();
  const queryClient = useQueryClient();

  const expensesQuery = useQuery({
    queryKey: ['expenses'],
    queryFn: async () => {
      const response = await apiFetch('/expenses', token);
      return handleApiResponse<BusinessExpense[]>(response, logout);
    },
    enabled: !!token && user?.role === 'ADMIN',
    staleTime: 60000,
  });

  const addExpenseMutation = useMutation({
    mutationFn: async (newExpense: Partial<BusinessExpense>) => {
      const response = await apiFetch('/expenses', token, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newExpense),
      });
      return handleApiResponse(response, logout);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
    },
  });

  const updateExpenseMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<BusinessExpense> & { id: string }) => {
      const response = await apiFetch(`/expenses/${id}`, token, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });
      return handleApiResponse(response, logout);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
    },
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiFetch(`/expenses/${id}`, token, {
        method: 'DELETE',
      });
      return handleApiResponse(response, logout);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
    },
  });

  return {
    expenses: expensesQuery.data || [],
    isLoading: expensesQuery.isLoading,
    isError: expensesQuery.isError,
    error: expensesQuery.error,
    addExpense: addExpenseMutation.mutateAsync,
    updateExpense: updateExpenseMutation.mutateAsync,
    deleteExpense: deleteExpenseMutation.mutateAsync,
  };
}
