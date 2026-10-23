import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "../api/client";

const IdentityContext = createContext(null);

export function IdentityProvider({ children }) {
  const [users, setUsers] = useState([]);
  const [ports, setPorts] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [cargoTypes, setCargoTypes] = useState([]);
  const [platformSummary, setPlatformSummary] = useState(null);
  const [dbHealth, setDbHealth] = useState(null);
  const [dbConnected, setDbConnected] = useState(false);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [catalogError, setCatalogError] = useState(null);

  // Authenticated user state & JWT verification
  const [currentUser, setCurrentUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    try {
      return Boolean(localStorage.getItem('shipspace_token'));
    } catch {
      return false;
    }
  });
  const [authLoading, setAuthLoading] = useState(true);

  // Selected Demo Identities (populated from real database accounts and synced to localStorage)
  const [selectedTraderId, setSelectedTraderIdState] = useState(() => {
    try {
      const saved = localStorage.getItem('shipspace_trader_id');
      return saved ? Number(saved) : 7;
    } catch {
      return 7;
    }
  });
  const [selectedProviderId, setSelectedProviderIdState] = useState(() => {
    try {
      const saved = localStorage.getItem('shipspace_provider_id');
      return saved ? Number(saved) : 1;
    } catch {
      return 1;
    }
  });
  const [selectedAdminId, setSelectedAdminIdState] = useState(() => {
    try {
      const saved = localStorage.getItem('shipspace_admin_id');
      return saved ? Number(saved) : 27;
    } catch {
      return 27;
    }
  });
  const [activeRole, setActiveRoleState] = useState(() => {
    try {
      return localStorage.getItem('shipspace_active_role') || 'trader';
    } catch {
      return 'trader';
    }
  });
  const [isIdentityModalOpen, setIsIdentityModalOpen] = useState(false);

  const logout = useCallback(() => {
    api.logout();
    setCurrentUser(null);
    setIsAuthenticated(false);
  }, []);

  const setSelectedTraderId = useCallback((id) => {
    const num = Number(id);
    setSelectedTraderIdState(num);
    try { localStorage.setItem('shipspace_trader_id', String(num)); } catch {}
  }, []);

  const setSelectedProviderId = useCallback((id) => {
    const num = Number(id);
    setSelectedProviderIdState(num);
    try { localStorage.setItem('shipspace_provider_id', String(num)); } catch {}
  }, []);

  const setSelectedAdminId = useCallback((id) => {
    const num = Number(id);
    setSelectedAdminIdState(num);
    try { localStorage.setItem('shipspace_admin_id', String(num)); } catch {}
  }, []);

  const setActiveRole = useCallback((role) => {
    setActiveRoleState(role);
    try { localStorage.setItem('shipspace_active_role', role); } catch {}
  }, []);

  const refreshCatalog = useCallback(async () => {
    setLoadingCatalog(true);
    setCatalogError(null);
    try {
      const [portsRes, routesRes, cargoRes, healthRes, usersRes, summaryRes, meRes] =
        await Promise.all([
          api.getPorts(),
          api.getRoutes(),
          api.getCargoTypes(),
          api.getDbHealth().catch(() => null),
          api.getAdminUsers().catch(() => ({ data: [] })),
          api.getAdminSummary().catch(() => ({ data: null })),
          api.getMe().catch(() => ({ data: null })),
        ]);

      const fetchedUsers = usersRes.data || [];
      const user = meRes.data || null;
      setPorts(portsRes.data || []);
      setRoutes(routesRes.data || []);
      setCargoTypes(cargoRes.data || []);
      setUsers(fetchedUsers);
      setPlatformSummary(summaryRes.data || null);
      setDbHealth(healthRes);
      setDbConnected(Boolean(healthRes?.success || portsRes?.success));

      setCurrentUser(user);
      setIsAuthenticated(Boolean(user));

      if (user) {
        setActiveRole(user.role);
        if (user.role === 'admin') {
          setSelectedAdminId(Number(user.user_id ?? user.id));
        } else if (user.role === 'provider') {
          setSelectedProviderId(Number(user.user_id ?? user.id));
        } else {
          setSelectedTraderId(Number(user.user_id ?? user.id));
        }
      }

      // Ensure selected IDs correspond to actual existing users in the database
      const tradersList = fetchedUsers.filter((u) => u.role === "trader");
      const providersList = fetchedUsers.filter((u) => u.role === "provider");
      const adminsList = fetchedUsers.filter((u) => u.role === "admin");

      if (
        tradersList.length > 0 &&
        !tradersList.some((t) => Number(t.user_id ?? t.id) === Number(selectedTraderId))
      ) {
        const preferred =
          tradersList.find((t) => Number(t.user_id ?? t.id) === 7) || tradersList[0];
        setSelectedTraderId(Number(preferred.user_id ?? preferred.id));
      }
      if (
        providersList.length > 0 &&
        !providersList.some((p) => Number(p.user_id ?? p.id) === Number(selectedProviderId))
      ) {
        setSelectedProviderId(Number(providersList[0].user_id ?? providersList[0].id));
      }
      if (
        adminsList.length > 0 &&
        !adminsList.some((a) => Number(a.user_id ?? a.id) === Number(selectedAdminId))
      ) {
        setSelectedAdminId(Number(adminsList[0].user_id ?? adminsList[0].id));
      }
    } catch (err) {
      setDbConnected(false);
      setCatalogError(err.message || "Failed to load reference catalog from backend");
    } finally {
      setLoadingCatalog(false);
      setAuthLoading(false);
    }
  }, [selectedTraderId, selectedProviderId, selectedAdminId]);

  useEffect(() => {
    refreshCatalog();
  }, []);

  const traders = users.filter((u) => u.role === "trader");
  const providers = users.filter((u) => u.role === "provider");
  const admins = users.filter((u) => u.role === "admin");

  const activeTrader =
    traders.find((u) => Number(u.user_id ?? u.id) === Number(selectedTraderId)) || null;
  const activeProvider =
    providers.find((u) => Number(u.user_id ?? u.id) === Number(selectedProviderId)) || null;
  const activeAdmin =
    admins.find((u) => Number(u.user_id ?? u.id) === Number(selectedAdminId)) || null;

  return (
    <IdentityContext.Provider
      value={{
        currentUser,
        isAuthenticated,
        authLoading,
        logout,
        users,
        traders,
        providers,
        admins,
        ports,
        routes,
        cargoTypes,
        platformSummary,
        dbHealth,
        dbConnected,
        loadingCatalog,
        catalogError,
        refreshCatalog,
        refreshReferenceData: refreshCatalog,
        selectedTraderId,
        setSelectedTraderId,
        selectedProviderId,
        setSelectedProviderId,
        selectedAdminId,
        setSelectedAdminId,
        activeTrader,
        activeProvider,
        activeAdmin,
        currentTrader: activeTrader,
        currentProvider: activeProvider,
        currentAdmin: activeAdmin,
        activeRole,
        setActiveRole,
        isIdentityModalOpen,
        setIsIdentityModalOpen,
      }}
    >
      {children}
    </IdentityContext.Provider>
  );
}

export function useIdentity() {
  const ctx = useContext(IdentityContext);
  if (!ctx) {
    throw new Error("useIdentity must be used within an IdentityProvider");
  }
  return ctx;
}
