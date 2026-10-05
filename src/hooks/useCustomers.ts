import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-hooks';
import { apiFetch, handleApiResponse } from '@/lib/api';

export interface Customer {
  id: string;
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  driverLicense?: string | null;
  notes?: string | null;
  source?: string | null;
  /** Where the customer came from (CarGurus, Google, Referral, ...). */
  leadSource?: string | null;
  /** Last visit recorded by hand (the list also derives lastVisitDate from purchases and viewings). */
  lastVisitAt?: string | null;
  /** Cars this customer has bought, matched from sales by phone, email or name. */
  carsBought?: number;
  lastPurchaseDate?: string | null;
  /** Most recent of a recorded visit, a purchase, or a viewing note. */
  lastVisitDate?: string | null;
  lastVisitSource?: 'visit' | 'purchase' | 'viewing' | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerDocument {
  id: string;
  customerId: string;
  customerName: string;
  documentName: string;
  fileName: string;
  mimeType: string;
  createdAt: string;
}

export function useCustomers() {
  const { token, logout } = useAuth();
  const queryClient = useQueryClient();

  const customersQuery = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const response = await apiFetch('/customers', token);
      return handleApiResponse<Customer[]>(response, logout);
    },
    enabled: !!token,
    staleTime: 60000,
  });

  const addCustomerMutation = useMutation({
    mutationFn: async (data: Partial<Customer>) => {
      const response = await apiFetch('/customers', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return handleApiResponse<Customer>(response, logout);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });

  const updateCustomerMutation = useMutation({
    mutationFn: async ({ id, ...data }: Partial<Customer> & { id: string }) => {
      const response = await apiFetch(`/customers/${id}`, token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return handleApiResponse<Customer>(response, logout);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });

  const deleteCustomerMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiFetch(`/customers/${id}`, token, {
        method: 'DELETE',
      });
      if (response.status === 204) return;
      return handleApiResponse(response, logout);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });

  const importFromSalesMutation = useMutation({
    mutationFn: async () => {
      const response = await apiFetch('/customers/import-from-sales', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      return handleApiResponse<{ message: string; count: number }>(response, logout);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });

  // Records that the customer visited: today, or an earlier 'YYYY-MM-DD' date.
  const recordVisitMutation = useMutation({
    mutationFn: async ({ id, date }: { id: string; date?: string }) => {
      const response = await apiFetch(`/customers/${id}/visit`, token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(date ? { date } : {}),
      });
      return handleApiResponse<{ id: string; lastVisitAt: string }>(response, logout);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });

  const uploadCustomerDocumentMutation = useMutation({
    mutationFn: async ({
      customerId,
      documentName,
      file,
    }: {
      customerId: string;
      documentName: string;
      file: File;
    }) => {
      const formData = new FormData();
      formData.append('documentName', documentName);
      formData.append('file', file);
      const response = await apiFetch(`/customers/${customerId}/documents`, token, {
        method: 'POST',
        body: formData,
      });
      return handleApiResponse<CustomerDocument>(response, logout);
    },
  });

  return {
    customers: customersQuery.data || [],
    isLoading: customersQuery.isLoading,
    isError: customersQuery.isError,
    error: customersQuery.error,
    addCustomer: addCustomerMutation.mutateAsync,
    updateCustomer: updateCustomerMutation.mutateAsync,
    deleteCustomer: deleteCustomerMutation.mutateAsync,
    importFromSales: importFromSalesMutation.mutateAsync,
    recordVisit: recordVisitMutation.mutateAsync,
    isImporting: importFromSalesMutation.isPending,
    uploadCustomerDocument: uploadCustomerDocumentMutation.mutateAsync,
    isUploadingCustomerDocument: uploadCustomerDocumentMutation.isPending,
  };
}
