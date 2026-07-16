import * as React from 'react';
import { useAuth } from '@/context/auth-hooks';
import { apiUrl } from '@/lib/api';

interface DealershipProfile {
  name: string;
  address: string;
  phone: string;
  email: string;
  logoBase64: string;
}

interface DealershipContextType {
  profile: DealershipProfile | null;
  refreshProfile: () => Promise<void>;
  isLoading: boolean;
}

const DealershipContext = React.createContext<DealershipContextType | undefined>(undefined);

export const DealershipProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token } = useAuth();
  const [profile, setProfile] = React.useState<DealershipProfile | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  const fetchProfile = React.useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const response = await fetch(apiUrl('/dealerships/profile'), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setProfile({
          name: data.name || '',
          address: data.address || '',
          phone: data.phone || '',
          email: data.email || '',
          logoBase64: data.logoBase64 || '',
        });
      }
    } catch {
      // Silently fail — sidebar will fall back to default logo
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  // Fetch on mount and whenever token changes
  React.useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const value = React.useMemo(
    () => ({ profile, refreshProfile: fetchProfile, isLoading }),
    [profile, fetchProfile, isLoading]
  );

  return (
    <DealershipContext.Provider value={value}>
      {children}
    </DealershipContext.Provider>
  );
};

export const useDealership = () => {
  const context = React.useContext(DealershipContext);
  if (context === undefined) {
    throw new Error('useDealership must be used within a DealershipProvider');
  }
  return context;
};
