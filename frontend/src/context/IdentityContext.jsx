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

  // Selected Demo Identities (populated from real database accounts)
  const [selectedTraderId, setSelectedTraderId] = useState(7); // Default known seeded trader ID 7 (Aarav Textiles Export House)
  const [selectedProviderId, setSelectedProviderId] = useState(1); // Default known seeded provider ID 1 (Maersk Logistics India)
  const [selectedAdminId, setSelectedAdminId] = useState(27); // Default known seeded admin ID 27
  const [activeRole, setActiveRole] = useState("trader");
  const [isIdentityModalOpen, setIsIdentityModalOpen] = useState(false);

  const refreshCatalog = useCallback(async () => {
    setLoadingCatalog(true);
    setCatalogError(null);
    try {
      const [portsRes, routesRes, cargoRes, usersRes, summaryRes, healthRes] =
        await Promise.all([
          api.getPorts(),
          api.getRoutes(),
          api.getCargoTypes(),
          api.getAdminUsers(),
          api.getAdminSummary(),
          api.getDbHealth().catch(() => null),
        ]);

      const fetchedUsers = usersRes.data || [];
      setPorts(portsRes.data || []);
      setRoutes(routesRes.data || []);
      setCargoTypes(cargoRes.data || []);
      setUsers(fetchedUsers);
      setPlatformSummary(summaryRes.data || null);
      setDbHealth(healthRes);
      setDbConnected(Boolean(healthRes?.success || portsRes?.success));

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
