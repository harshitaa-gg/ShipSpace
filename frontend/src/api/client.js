const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

/**
 * Custom error wrapper preserving backend HTTP status, code, and PostgreSQL SQLSTATE
 */
export class ApiClientError extends Error {
  constructor(message, { status = 500, code = 'API_ERROR', sqlState = null, details = null } = {}) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.sqlState = sqlState;
    this.details = details;
  }
}

function buildQuery(params = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      searchParams.set(key, String(value).trim());
    }
  });
  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : '';
}

async function request(path, options = {}) {
  const url = `${API_BASE_URL}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
    });
  } catch (networkErr) {
    throw new ApiClientError(
      'Unable to reach the ShipSpace backend API on http://localhost:5000. Please ensure the Express server is running.',
      { status: 0, code: 'NETWORK_ERROR', details: networkErr?.message }
    );
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || (payload && payload.success === false)) {
    const errObj = payload?.error || {};
    const message =
      errObj.message ||
      payload?.message ||
      `Request failed with HTTP status ${response.status}`;
    throw new ApiClientError(message, {
      status: response.status,
      code: errObj.code || 'API_ERROR',
      sqlState: errObj.sqlState || null,
      details: errObj,
    });
  }

  return payload;
}

/**
 * Normalizers that preserve all native PostgreSQL / Express column names
 * while providing consistent aliases across views and pages.
 */
function normalizePort(p) {
  if (!p) return p;
  return {
    ...p,
    port_id: p.id ?? p.port_id,
    port_name: p.name ?? p.port_name,
    port_code: p.un_locode ?? p.port_code,
  };
}

function normalizeRoute(r) {
  if (!r) return r;
  return {
    ...r,
    origin_port_code: r.origin_un_locode ?? r.origin_port_code,
    destination_port_code: r.destination_un_locode ?? r.destination_port_code,
  };
}

function normalizeCargoType(c) {
  if (!c) return c;
  return {
    ...c,
    cargo_type_id: c.id ?? c.cargo_type_id,
  };
}

function normalizeUser(u) {
  if (!u) return u;
  return {
    ...u,
    user_id: u.id ?? u.user_id,
  };
}

function normalizeListing(l) {
  if (!l) return l;
  const routeParts = (l.route_code || '').split('->').map((s) => s.trim());
  const allowedList = Array.isArray(l.allowed_cargo_types)
    ? l.allowed_cargo_types.map((c) => c.name).join(', ')
    : '';
  return {
    ...l,
    status: l.listing_status ?? l.status ?? 'open',
    provider_company: l.provider_company_name ?? l.provider_name ?? l.provider_company,
    origin_port_code: l.origin_un_locode ?? l.origin_port_code ?? routeParts[0] ?? '',
    origin_port_name: l.origin_port ?? l.origin_port_name ?? '',
    destination_port_code: l.destination_un_locode ?? l.destination_port_code ?? routeParts[1] ?? '',
    destination_port_name: l.destination_port ?? l.destination_port_name ?? '',
    supported_cargo_types:
      l.permitted_cargo_types ??
      l.matched_cargo_type_name ??
      (allowedList || l.supported_cargo_types || ''),
  };
}

function normalizeBooking(b) {
  if (!b) return b;
  return {
    ...b,
    booking_status: b.booking_status ?? b.status ?? 'confirmed',
    booking_date: b.booking_time ?? b.booking_date,
    trader_company: b.trader_company_name ?? b.trader_company,
    provider_company: b.provider_company_name ?? b.provider_company,
    origin_port_code: b.origin_un_locode ?? b.origin_port_code,
    origin_port_name: b.origin_port ?? b.origin_port_name,
    destination_port_code: b.destination_un_locode ?? b.destination_port_code,
    destination_port_name: b.destination_port ?? b.destination_port_name,
    listing_status: b.listing_status ?? 'open',
  };
}

export const api = {
  // Authentication & Registration
  register: async (body) => {
    const res = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return { ...res, data: normalizeUser(res.data) };
  },

  // Health & Reference Data
  getHealth: () => request('/health'),
  getDbHealth: () => request('/health/db'),
  getPorts: async () => {
    const res = await request('/ports');
    return { ...res, data: (res.data || []).map(normalizePort) };
  },
  getRoutes: async (params) => {
    const res = await request(`/routes${buildQuery(params)}`);
    return { ...res, data: (res.data || []).map(normalizeRoute) };
  },
  getCargoTypes: async () => {
    const res = await request('/cargo-types');
    return { ...res, data: (res.data || []).map(normalizeCargoType) };
  },
  getBookingDetails: async (bookingId) => {
    const res = await request(`/bookings/${bookingId}`);
    return { ...res, data: normalizeBooking(res.data) };
  },

  // Trader Endpoints
  getOpenListings: async (params) => {
    const res = await request(`/trader/listings${buildQuery(params)}`);
    return { ...res, data: (res.data || []).map(normalizeListing) };
  },
  searchTraderListings: async (params) => {
    const mapped = {
      ...params,
      sort_by: params?.sort || params?.sort_by || 'price',
    };
    const res = await request(`/trader/listings/search${buildQuery(mapped)}`);
    return { ...res, data: (res.data || []).map(normalizeListing) };
  },
  createBooking: async (body) => {
    const res = await request('/trader/bookings', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const rawBooking = res.data?.booking || res.data;
    return {
      ...res,
      data: normalizeBooking(rawBooking),
      listing_capacity: res.data?.listing_capacity || null,
    };
  },
  getTraderBookings: async (traderId, params) => {
    const res = await request(`/trader/${traderId}/bookings${buildQuery(params)}`);
    return { ...res, data: (res.data || []).map(normalizeBooking) };
  },
  cancelTraderBooking: async (bookingId, traderId, reason) => {
    const res = await request(`/trader/bookings/${bookingId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ trader_id: Number(traderId), reason }),
    });
    const rawBooking = res.data?.booking || res.data;
    return {
      ...res,
      data: {
        ...normalizeBooking(rawBooking),
        status_history: res.data?.status_history || [],
      },
    };
  },

  // Provider Endpoints
  getProviderListings: async (providerId, params) => {
    const res = await request(`/provider/${providerId}/listings${buildQuery(params)}`);
    const rows = (res.data || []).map(normalizeListing);

    // Compute aggregated provider utilization summary from v_provider_listing_utilization rows
    const totalListings = rows.length;
    const openListings = rows.filter((r) => r.status === 'open').length;
    const fullListings = rows.filter((r) => r.status === 'full').length;
    const totalCbmOffered = rows.reduce((s, r) => s + Number(r.total_cbm || 0), 0);
    const totalCbmBooked = rows.reduce((s, r) => s + Number(r.booked_cbm || 0), 0);
    const confirmedBookings = rows.reduce((s, r) => s + Number(r.active_booking_count || 0), 0);
    const confirmedRevenue = rows.reduce((s, r) => s + Number(r.total_active_revenue || 0), 0);
    const overallPct =
      totalCbmOffered > 0 ? ((totalCbmBooked / totalCbmOffered) * 100).toFixed(2) : '0.00';

    return {
      ...res,
      data: rows,
      meta: {
        utilization: {
          total_listings: totalListings,
          open_listings: openListings,
          full_listings: fullListings,
          total_cbm_offered: totalCbmOffered.toFixed(2),
          total_cbm_booked: totalCbmBooked.toFixed(2),
          overall_cbm_utilization_pct: overallPct,
          confirmed_bookings: confirmedBookings,
          confirmed_revenue: confirmedRevenue.toFixed(2),
        },
      },
    };
  },
  createProviderListing: async (body) => {
    const res = await request('/provider/listings', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return { ...res, data: normalizeListing(res.data) };
  },
  updateProviderListingStatus: async (listingId, body) => {
    const res = await request(`/provider/listings/${listingId}/status`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    return { ...res, data: normalizeListing(res.data) };
  },
  getProviderBookings: async (providerId, params) => {
    const res = await request(`/provider/${providerId}/bookings${buildQuery(params)}`);
    return { ...res, data: (res.data || []).map(normalizeBooking) };
  },
  cancelProviderBooking: async (bookingId, providerId, reason) => {
    const res = await request(`/provider/bookings/${bookingId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ provider_id: Number(providerId), reason }),
    });
    return res;
  },

  // Admin Endpoints
  getAdminSummary: async () => {
    const res = await request('/admin/summary');
    const d = res.data || {};
    return {
      ...res,
      data: {
        ...d,
        total_providers: Number(d.total_providers_count ?? d.total_providers ?? 0),
        total_traders: Number(d.total_traders_count ?? d.total_traders ?? 0),
        total_admins: Number(d.total_admins_count ?? d.total_admins ?? 0),
        total_ports: Number(d.total_ports_count ?? d.total_ports ?? 0),
        total_routes: Number(d.total_routes_count ?? d.total_routes ?? 0),
        total_cargo_types: Number(d.total_cargo_types_count ?? d.total_cargo_types ?? 0),
        total_listings_count: Number(d.total_listings_count ?? 0),
        open_listings: Number(d.open_listings_count ?? d.open_listings ?? 0),
        full_listings: Number(d.full_listings_count ?? d.full_listings ?? 0),
        closed_listings: Number(d.closed_listings_count ?? d.closed_listings ?? 0),
        confirmed_bookings: Number(d.confirmed_bookings_count ?? d.confirmed_bookings ?? 0),
        completed_bookings: Number(d.completed_bookings_count ?? d.completed_bookings ?? 0),
        cancelled_bookings: Number(d.cancelled_bookings_count ?? d.cancelled_bookings ?? 0),
        active_booking_revenue: Number(
          d.total_active_platform_revenue ?? d.active_booking_revenue ?? 0
        ),
      },
    };
  },
  getAdminCapacityOverview: (params) =>
    request(`/admin/capacity-overview${buildQuery(params)}`),
  getAdminProviderUtilization: async (params) => {
    const res = await request(`/admin/provider-utilization${buildQuery(params)}`);
    return { ...res, data: (res.data || []).map(normalizeListing) };
  },
  getAdminUsers: async (params) => {
    const res = await request(`/admin/users${buildQuery(params)}`);
    return { ...res, data: (res.data || []).map(normalizeUser) };
  },
  getAdminBookings: async (params) => {
    const res = await request(`/admin/bookings${buildQuery(params)}`);
    return { ...res, data: (res.data || []).map(normalizeBooking) };
  },
  getAdminBookingHistory: (params) =>
    request(`/admin/bookings/history${buildQuery(params)}`),
  createPort: async (body) => {
    const payload = {
      name: body.name ?? body.port_name,
      country: body.country,
      un_locode: body.un_locode ?? body.port_code,
      admin_id: body.admin_id,
    };
    const res = await request('/admin/ports', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return { ...res, data: normalizePort(res.data) };
  },
  createRoute: async (body) => {
    const res = await request('/admin/routes', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return { ...res, data: normalizeRoute(res.data) };
  },
  createCargoType: async (body) => {
    const res = await request('/admin/cargo-types', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return { ...res, data: normalizeCargoType(res.data) };
  },
};
