import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/auth-hooks';
import { memo } from 'react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  roles?: string[];
}

// Memoized loading spinner — never changes, avoids re-render allocations
const PageLoader = memo(function PageLoader() {
  return (
    <div className="flex h-screen items-center justify-center bg-background text-foreground" role="status" aria-label="Verifying access">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-full border-4 border-primary/20 border-t-profit animate-spin" aria-hidden="true" />
        <p className="text-muted-foreground font-display animate-pulse font-bold tracking-widest text-[10px] uppercase">Verifying Access...</p>
      </div>
    </div>
  );
});

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, roles }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <PageLoader />;

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
