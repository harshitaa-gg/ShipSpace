import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useIdentity } from '../context/IdentityContext';

/**
 * Route guard component that protects private pages from unauthenticated access
 * and enforces role-based access restrictions.
 */
export default function ProtectedRoute({ children, allowedRoles = [] }) {
  const { isAuthenticated, currentUser, activeRole, authLoading } = useIdentity();
  const location = useLocation();

  if (authLoading) {
    return (
      <div className="empty-state-card" style={{ margin: '4rem auto', maxWidth: 440, textAlign: 'center' }}>
        <p className="text-secondary" style={{ padding: '2rem' }}>
          Verifying commercial session...
        </p>
      </div>
    );
  }

  if (!isAuthenticated) {
    const redirectTarget = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?redirect=${redirectTarget}`} replace />;
  }

  const effectiveRole = currentUser?.role || activeRole;

  if (allowedRoles.length > 0 && !allowedRoles.includes(effectiveRole)) {
    if (effectiveRole === 'provider') {
      return <Navigate to="/provider" replace />;
    }
    if (effectiveRole === 'admin') {
      return <Navigate to="/admin" replace />;
    }
    return <Navigate to="/bookings" replace />;
  }

  return children;
}
