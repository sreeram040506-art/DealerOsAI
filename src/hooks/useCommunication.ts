import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiUrl } from '@/lib/api';
import { useAuth } from '@/context/auth-hooks';
import { toast } from '@/components/ui/toast-utils';

export interface Channel {
  id: string;
  name: string;
  type: 'INTERNAL' | 'INTER_DEALERSHIP' | 'DIRECT';
  unread: number;
  memberCount: number;
  lastMessage: {
    text: string;
    createdAt: string;
  } | null;
}

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  role: string;
  text: string;
  createdAt: string;
}

export interface DirectoryUser {
  id: string;
  name: string;
  role: string;
  online: boolean;
  unread: number;
}

export function useChannels() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['channels'],
    queryFn: async (): Promise<Channel[]> => {
      const res = await fetch(apiUrl('/communication/channels'), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch channels');
      const data = await res.json();
      return data.channels;
    },
    enabled: !!token,
    refetchInterval: 10000,
  });
}

export function useMessages(channelId: string | null) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['messages', channelId],
    queryFn: async (): Promise<Message[]> => {
      if (!channelId) return [];
      const res = await fetch(apiUrl(`/communication/channels/${channelId}/messages`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch messages');
      const data = await res.json();
      return data.messages;
    },
    enabled: !!token && !!channelId,
    refetchInterval: 3000,
  });
}

export function useSendMessage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ channelId, text }: { channelId: string; text: string }) => {
      const res = await fetch(apiUrl(`/communication/channels/${channelId}/messages`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ text })
      });
      if (!res.ok) throw new Error('Failed to send message');
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['messages', variables.channelId] });
      queryClient.invalidateQueries({ queryKey: ['channels'] });
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to send message');
    }
  });
}

export function useCreateChannel() {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ name, type }: { name: string; type?: string }) => {
      const res = await fetch(apiUrl('/communication/channels'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ name, type: type || 'INTERNAL' })
      });
      if (!res.ok) throw new Error('Failed to create channel');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      toast.success('Channel created!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create channel');
    }
  });
}

export function useDirectory() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['directory'],
    queryFn: async (): Promise<DirectoryUser[]> => {
      const res = await fetch(apiUrl('/communication/directory'), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch directory');
      const data = await res.json();
      return data.directory;
    },
    enabled: !!token,
  });
}

export function useSeedCommunication() {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch(apiUrl('/communication/seed'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to seed');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      toast.success('Default channels created!');
    }
  });
}
