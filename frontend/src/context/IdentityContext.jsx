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
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [catalogError, setCatalogError] = useState(null);

  // Selected Demo Identities (populated from real database accounts)
  const [selectedTraderId, setSelectedTraderId] = useState(7); // Default known seeded trader ID 7 (Aarav Textiles Export House)
  const [selectedProviderId, setSelectedProviderId] = useState(1); // Default known seeded provider ID 1 (Maersk Logistics India)
  const [selectedAdminId, setSelectedAdminId] = useState(27); // Default known seeded admin ID 27
  const [activeRole, setActiveRole] = useState("trader");
  const [isIdentityModalOpen, setIsIdentityModalOpen] = useState(false);

  const refreshReferenceData = useCallback(async () => {
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
      if (healthRes) {
        setDbHealth(healthRes);
      }

      // Ensure selected IDs correspond to actual existing users in the database
      const traders = fetchedUsers.filter((u) => u.role === "trader");
      const providers = fetchedUsers.filter((u) => u.role === "provider");
      const admins = fetchedUsers.filter((u) => u.role === "admin");

      if (traders.length > 0 && !traders.some((t) => Number(t.id) === Number(selectedTraderId))) {
        const preferred = traders.find((t) => Number(t.id) === 7) || traders[0];
        setSelectedTraderId(Number(preferred.id));
      }
      if (
        providers.length > 0 &&
        !providers.some((p) => Number(p.id) === Number(selectedProviderId))
      ) {
        setSelectedProviderId(Number(providers[0].id));
      }
      if (admins.length > 0 && !admins.some((a) => Number(a.id) === Number(selectedAdminId))) {
        setSelectedAdminId(Number(admins[0].id));
      }
    } catch (err) {
      setCatalogError(err.message || "Failed to load reference catalog from backend");
    } finally {
      setLoadingCatalog(false);
    }
  }, [selectedTraderId, selectedProviderId, selectedAdminId]);

  useEffect(() => {
    refreshReferenceData();
  }, []);

  const traders = users.filter((u) => u.role === "trader");
  const providers = users.filter((u) => u.role === "provider");
  const admins = users.filter((u) => u.role === "admin");

  const currentTrader =
    traders.find((u) => Number(u.id) === Number(selectedTraderId)) || null;
  const currentProvider =
    providers.find((u) => Number(u.id) === Number(selectedProviderId)) || null;
  const currentAdmin =
    admins.find((u) => Number(u.id) === Number(selectedAdminId)) || null;

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
        loadingCatalog,
        catalogError,
        refreshReferenceData,
        selectedTraderId,
        setSelectedTraderId,
        selectedProviderId,
        setSelectedProviderId,
        selectedAdminId,
        setSelectedAdminId,
        currentTrader,
        currentProvider,
        currentAdmin,
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
