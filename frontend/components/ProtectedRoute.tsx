import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import type { UserRole } from '../types/travel';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: UserRole;
}

/**
 * Component #3: ProtectedRoute
 * Bảo vệ route bằng <Navigate /> (Yêu cầu #5: Routing SPA).
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredRole,
}) => {
  const { user, loading } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-16 text-center text-sm text-zinc-500 dark:text-zinc-400">
        {t('Đang kiểm tra phiên đăng nhập...', 'Checking authentication session...')}
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (requiredRole && user.role !== requiredRole) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};
