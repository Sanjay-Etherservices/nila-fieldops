import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ClipboardList,
  Compass,
  ExternalLink,
  Link2,
  LogOut,
  MapPin,
  Menu,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Users,
  X,
} from 'lucide-react';
import {
  apiFetch,
  formatIstDateTime,
  formatIstTime,
  getTodayIst,
  safeExternalUrl,
} from '../lib/api.ts';
import {
  ACTIVITY_TYPES,
  DAY_ORDERS,
  type ActivityType,
  type AgentItem,
  type AuthUser,
  type CentreItem,
  type CollectionVisit,
  type DashboardSummary,
  type DayOrder,
  type FieldStatusLog,
  type LocationItem,
} from '../types.ts';

type AdminTab = 'collection' | 'field' | 'centres' | 'locations' | 'agents';

interface AdminWorkspaceProps {
  token: string;
  user: AuthUser;
  onLogout: () => void;
}

export function AdminWorkspace({ token, user, onLogout }: AdminWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('collection');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [centres, setCentres] = useState<CentreItem[]>([]);
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [visits, setVisits] = useState<CollectionVisit[]>([]);
  const [fieldLogs, setFieldLogs] = useState<FieldStatusLog[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Collection Status Cascading Filters: Location -> Day Order -> Centre
  const [filterLocationId, setFilterLocationId] = useState<string>('');
  const [filterDayOrder, setFilterDayOrder] = useState<string>('');
  const [filterCentreId, setFilterCentreId] = useState<string>('');
  const [filterVisitDate, setFilterVisitDate] = useState<string>('');

  // Field Status Filters
  const [fieldFilterLocationId, setFieldFilterLocationId] = useState<string>('');
  const [fieldFilterActivity, setFieldFilterActivity] = useState<string>('');
  const [fieldFilterAgentId, setFieldFilterAgentId] = useState<string>('');
  const [fieldFilterDate, setFieldFilterDate] = useState<string>('');

  // Location Form State
  const [newLocName, setNewLocName] = useState('');
  const [editingLocId, setEditingLocId] = useState<number | null>(null);
  const [editingLocName, setEditingLocName] = useState('');

  // Centre Form State
  const [centreFormOpen, setCentreFormOpen] = useState(false);
  const [editingCentreId, setEditingCentreId] = useState<number | null>(null);
  const [cLocationId, setCLocationId] = useState<string>('');
  const [cDayOrder, setCDayOrder] = useState<DayOrder>('Mon');
  const [cName, setCName] = useState('');
  const [cTimeSlot, setCTimeSlot] = useState('10:00 AM - 11:00 AM');
  const [cMapsUrl, setCMapsUrl] = useState('');
  const [cLat, setCLat] = useState('');
  const [cLng, setCLng] = useState('');
  const [extractingCoords, setExtractingCoords] = useState(false);

  // Agent Form State
  const [agentFormOpen, setAgentFormOpen] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState<number | null>(null);
  const [aFullName, setAFullName] = useState('');
  const [aIdentifier, setAIdentifier] = useState('');
  const [aPhone, setAPhone] = useState('');
  const [aDistrict, setADistrict] = useState('');
  const [aPassword, setAPassword] = useState('');

  const [submitting, setSubmitting] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((prev) => (prev === msg ? null : prev));
    }, 3500);
  }, []);

  const loadAllData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sumRes, locRes, cenRes, agtRes, visRes, fldRes] = await Promise.all([
        apiFetch<DashboardSummary>('/api/dashboard/summary', { token }),
        apiFetch<{ locations: LocationItem[] }>('/api/locations?includeInactive=true', { token }),
        apiFetch<{ centres: CentreItem[] }>('/api/centres?includeInactive=true', { token }),
        apiFetch<{ agents: AgentItem[] }>('/api/agents', { token }),
        apiFetch<{ visits: CollectionVisit[] }>('/api/visits', { token }),
        apiFetch<{ logs: FieldStatusLog[] }>('/api/field-status', { token }),
      ]);
      setSummary(sumRes);
      setLocations(locRes.locations);
      setCentres(cenRes.centres);
      setAgents(agtRes.agents);
      setVisits(visRes.visits);
      setFieldLogs(fldRes.logs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workspace data.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // Cascading Centres for Collection Status Drill-Down
  const activeLocations = useMemo(
    () => locations.filter((l) => l.active === 1),
    [locations]
  );

  const cascadeDayOrders = useMemo(() => {
    const relevant = centres.filter(
      (c) =>
        c.active === 1 &&
        (!filterLocationId || String(c.location_id) === filterLocationId)
    );
    const set = new Set(relevant.map((c) => c.day_order));
    return DAY_ORDERS.filter((d) => set.has(d));
  }, [centres, filterLocationId]);

  const cascadeCentres = useMemo(() => {
    return centres.filter(
      (c) =>
        c.active === 1 &&
        (!filterLocationId || String(c.location_id) === filterLocationId) &&
        (!filterDayOrder || c.day_order === filterDayOrder)
    );
  }, [centres, filterLocationId, filterDayOrder]);

  const selectedCentreObj = useMemo(
    () => centres.find((c) => String(c.id) === filterCentreId) ?? null,
    [centres, filterCentreId]
  );

  const filteredVisits = useMemo(() => {
    return visits.filter((v) => {
      if (filterLocationId && String(v.location_id) !== filterLocationId) return false;
      if (filterDayOrder && v.day_order !== filterDayOrder) return false;
      if (filterCentreId && String(v.centre_id) !== filterCentreId) return false;
      if (filterVisitDate && v.visit_date !== filterVisitDate) return false;
      return true;
    });
  }, [visits, filterLocationId, filterDayOrder, filterCentreId, filterVisitDate]);

  const filteredFieldLogs = useMemo(() => {
    return fieldLogs.filter((f) => {
      if (fieldFilterLocationId && String(f.location_id) !== fieldFilterLocationId) return false;
      if (fieldFilterActivity && f.activity_type !== fieldFilterActivity) return false;
      if (fieldFilterAgentId && String(f.agent_id) !== fieldFilterAgentId) return false;
      if (fieldFilterDate && f.logged_at.slice(0, 10) !== fieldFilterDate) return false;
      return true;
    });
  }, [fieldLogs, fieldFilterLocationId, fieldFilterActivity, fieldFilterAgentId, fieldFilterDate]);

  // Handlers
  function handleLocationSelect(locId: string) {
    setFilterLocationId(locId);
    setFilterDayOrder('');
    setFilterCentreId('');
  }

  function handleDayOrderSelect(day: string) {
    setFilterDayOrder(day);
    setFilterCentreId('');
  }

  function resetCollectionFilters() {
    setFilterLocationId('');
    setFilterDayOrder('');
    setFilterCentreId('');
    setFilterVisitDate('');
  }

  async function handleAddLocation(e: React.FormEvent) {
    e.preventDefault();
    if (!newLocName.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch('/api/locations', {
        method: 'POST',
        token,
        body: { name: newLocName.trim(), state: 'Tamil Nadu' },
      });
      setNewLocName('');
      showToast('Location added.');
      await loadAllData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add location.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdateLocation(id: number, payload: { name?: string; active?: boolean }) {
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/api/locations/${id}`, {
        method: 'PATCH',
        token,
        body: payload,
      });
      setEditingLocId(null);
      showToast('Location updated.');
      await loadAllData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update location.');
    } finally {
      setSubmitting(false);
    }
  }

  function openNewCentreForm() {
    setEditingCentreId(null);
    setCLocationId(activeLocations[0] ? String(activeLocations[0].id) : '');
    setCDayOrder('Mon');
    setCName('');
    setCTimeSlot('10:00 AM - 11:00 AM');
    setCMapsUrl('');
    setCLat('');
    setCLng('');
    setCentreFormOpen(true);
  }

  function openEditCentreForm(c: CentreItem) {
    setEditingCentreId(c.id);
    setCLocationId(String(c.location_id));
    setCDayOrder(c.day_order);
    setCName(c.name);
    setCTimeSlot(c.time_slot);
    setCMapsUrl(c.google_maps_url);
    setCLat(String(c.latitude));
    setCLng(String(c.longitude));
    setCentreFormOpen(true);
  }

  async function handleExtractMapsCoords() {
    if (!cMapsUrl.trim()) return;
    setExtractingCoords(true);
    setError(null);
    try {
      const res = await apiFetch<{ lat: number; lng: number; resolvedUrl: string }>(
        '/api/centres/parse-map-link',
        {
          method: 'POST',
          token,
          body: { url: cMapsUrl.trim() },
        }
      );
      setCLat(String(res.lat));
      setCLng(String(res.lng));
      setCMapsUrl(res.resolvedUrl);
      showToast(`Coordinates extracted: ${res.lat}, ${res.lng}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not extract coordinates.');
    } finally {
      setExtractingCoords(false);
    }
  }

  async function handleSaveCentre(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        locationId: Number(cLocationId),
        dayOrder: cDayOrder,
        name: cName.trim(),
        timeSlot: cTimeSlot.trim(),
        googleMapsUrl: cMapsUrl.trim(),
        latitude: cLat.trim(),
        longitude: cLng.trim(),
      };
      if (editingCentreId) {
        await apiFetch(`/api/centres/${editingCentreId}`, {
          method: 'PATCH',
          token,
          body: payload,
        });
        showToast('Centre updated.');
      } else {
        await apiFetch('/api/centres', {
          method: 'POST',
          token,
          body: payload,
        });
        showToast('Centre created.');
      }
      setCentreFormOpen(false);
      await loadAllData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save centre.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleCentreActive(c: CentreItem) {
    setSubmitting(true);
    try {
      await apiFetch(`/api/centres/${c.id}`, {
        method: 'PATCH',
        token,
        body: { active: c.active !== 1 },
      });
      showToast(c.active === 1 ? 'Centre deactivated.' : 'Centre activated.');
      await loadAllData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update centre.');
    } finally {
      setSubmitting(false);
    }
  }

  function openNewAgentForm() {
    setEditingAgentId(null);
    setAFullName('');
    setAIdentifier('');
    setAPhone('');
    setADistrict(activeLocations[0]?.name ?? 'Coimbatore');
    setAPassword('');
    setAgentFormOpen(true);
  }

  function openEditAgentForm(a: AgentItem) {
    setEditingAgentId(a.id);
    setAFullName(a.full_name);
    setAIdentifier(a.identifier);
    setAPhone(a.phone);
    setADistrict(a.district);
    setAPassword('');
    setAgentFormOpen(true);
  }

  async function handleSaveAgent(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (editingAgentId) {
        await apiFetch(`/api/agents/${editingAgentId}`, {
          method: 'PATCH',
          token,
          body: {
            fullName: aFullName.trim(),
            phone: aPhone.trim(),
            district: aDistrict.trim(),
            password: aPassword || undefined,
          },
        });
        showToast('Agent updated.');
      } else {
        await apiFetch('/api/agents', {
          method: 'POST',
          token,
          body: {
            fullName: aFullName.trim(),
            identifier: aIdentifier.trim(),
            phone: aPhone.trim(),
            district: aDistrict.trim(),
            password: aPassword,
          },
        });
        showToast('Agent account created.');
      }
      setAgentFormOpen(false);
      await loadAllData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save agent.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleAgentActive(a: AgentItem) {
    setSubmitting(true);
    try {
      await apiFetch(`/api/agents/${a.id}`, {
        method: 'PATCH',
        token,
        body: { active: a.active !== 1 },
      });
      showToast(a.active === 1 ? 'Agent deactivated.' : 'Agent activated.');
      await loadAllData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update agent status.');
    } finally {
      setSubmitting(false);
    }
  }

  const navItems: Array<{ id: AdminTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'collection', label: 'Collection Status', icon: MapPin },
    { id: 'field', label: 'Field Status', icon: ClipboardList },
    { id: 'centres', label: 'Centres & Maps', icon: Building2 },
    { id: 'locations', label: 'Locations', icon: Compass },
    { id: 'agents', label: 'Agents', icon: Users },
  ];

  const activeNavLabel = navItems.find((n) => n.id === activeTab)?.label ?? 'Dashboard';

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 bg-white border-r border-slate-200">
        <div className="h-16 px-6 flex items-center gap-2.5 border-b border-slate-200">
          <Compass className="w-5 h-5 text-blue-700 shrink-0" aria-hidden="true" />
          <span className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
            Nila FieldOps
          </span>
        </div>

        <nav className="flex-1 p-4 space-y-1" aria-label="Admin sections">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-sm font-medium flex items-center gap-3 transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-blue-50 text-blue-800'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-blue-700' : 'text-slate-500'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 text-xs text-slate-500 space-y-1">
          <p className="font-medium text-slate-800 truncate">{user.fullName}</p>
          <p className="truncate font-mono">{user.identifier}</p>
        </div>
      </aside>

      {/* Mobile Nav Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative w-72 max-w-[80vw] bg-white h-full border-r border-slate-200 flex flex-col">
            <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200">
              <span className="font-display text-lg font-bold text-slate-900">Nila FieldOps</span>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Close menu"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-4 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileNavOpen(false);
                    }}
                    className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-sm font-medium flex items-center gap-3 ${
                      active ? 'bg-blue-50 text-blue-800' : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract: 3 clean zones */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-6 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation"
              className="lg:hidden min-h-[44px] min-w-[44px] -ml-2 flex items-center justify-center text-slate-700"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-500 whitespace-nowrap hidden sm:inline">Admin</span>
              <span className="text-slate-400 hidden sm:inline" aria-hidden="true">
                /
              </span>
              <h1 className="font-display font-semibold text-slate-900 truncate">
                {activeNavLabel}
              </h1>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-1 p-1 bg-slate-100 rounded-lg shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('collection')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'collection'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Collection Status
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('field')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'field'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Field Status
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={loadAllData}
              aria-label="Refresh data"
              className="min-h-[40px] px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="min-h-[40px] px-3.5 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
          {toast && (
            <div
              role="status"
              className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-900 flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>{toast}</span>
              </div>
              <button
                type="button"
                onClick={() => setToast(null)}
                className="text-xs text-emerald-700 hover:underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800 flex items-center justify-between gap-4"
            >
              <span>{error}</span>
              <button
                type="button"
                onClick={() => setError(null)}
                className="text-xs font-medium text-red-800 hover:underline shrink-0"
              >
                Close
              </button>
            </div>
          )}

          {/* KPI Summary Strip */}
          {summary && (
            <section
              aria-label="Daily operations overview"
              className="grid grid-cols-2 lg:grid-cols-4 bg-white border border-slate-200 rounded-2xl divide-y lg:divide-y-0 lg:divide-x divide-slate-200"
            >
              <div className="p-4 sm:p-5">
                <p className="text-xs text-slate-500">Visits Today ({summary.today})</p>
                <p className="font-mono tabular-nums text-2xl font-bold text-slate-900 mt-1">
                  {summary.visitsToday}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {summary.activeVisits} active check-in
                </p>
              </div>
              <div className="p-4 sm:p-5">
                <p className="text-xs text-slate-500">Outside 100m Warnings</p>
                <p
                  className={`font-mono tabular-nums text-2xl font-bold mt-1 ${
                    summary.outside100mWarnings > 0 ? 'text-amber-700' : 'text-slate-900'
                  }`}
                >
                  {summary.outside100mWarnings}
                </p>
                <p className="text-xs text-slate-500 mt-1">Soft-flagged today</p>
              </div>
              <div className="p-4 sm:p-5">
                <p className="text-xs text-slate-500">Field Status Logs Today</p>
                <p className="font-mono tabular-nums text-2xl font-bold text-slate-900 mt-1">
                  {summary.fieldLogsToday}
                </p>
                <p className="text-xs text-slate-500 mt-1">Sourcing · Loan · Training</p>
              </div>
              <div className="p-4 sm:p-5">
                <p className="text-xs text-slate-500">Active Tamil Nadu Network</p>
                <p className="font-mono tabular-nums text-2xl font-bold text-slate-900 mt-1">
                  {summary.activeCentres}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {summary.activeLocations} hubs · {summary.activeAgents} agents
                </p>
              </div>
            </section>
          )}

          {/* TAB 1: COLLECTION STATUS */}
          {activeTab === 'collection' && (
            <section className="space-y-5">
              <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-lg font-semibold text-slate-900">
                      Collection Status Drill-Down
                    </h2>
                    <p className="text-sm text-slate-600 mt-0.5">
                      Select Location, then Day Order, then Centre Name & Slot to inspect GPS
                      check-in and check-out times.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setFilterVisitDate(getTodayIst())}
                      className={`min-h-[40px] px-3 py-1.5 text-xs font-medium rounded-lg border whitespace-nowrap cursor-pointer ${
                        filterVisitDate === getTodayIst()
                          ? 'bg-blue-700 text-white border-blue-700'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      onClick={resetCollectionFilters}
                      className="min-h-[40px] px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>All Records</span>
                    </button>
                  </div>
                </div>

                {/* Step 1: Location Selector */}
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-slate-600">
                    1. Select Location (Tamil Nadu Hub)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleLocationSelect('')}
                      className={`min-h-[40px] px-4 py-2 text-sm font-medium rounded-xl border transition-colors whitespace-nowrap cursor-pointer ${
                        filterLocationId === ''
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      All Locations
                    </button>
                    {activeLocations.map((loc) => (
                      <button
                        key={loc.id}
                        type="button"
                        onClick={() => handleLocationSelect(String(loc.id))}
                        className={`min-h-[40px] px-4 py-2 text-sm font-medium rounded-xl border transition-colors whitespace-nowrap cursor-pointer ${
                          filterLocationId === String(loc.id)
                            ? 'bg-blue-700 text-white border-blue-700'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {loc.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Step 2 & 3: Day Order + Centre Name + Date */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-100">
                  <div>
                    <label
                      htmlFor="admin-day-order"
                      className="block text-xs font-medium text-slate-600 mb-1.5"
                    >
                      2. Select Day Order
                    </label>
                    <select
                      id="admin-day-order"
                      value={filterDayOrder}
                      onChange={(e) => handleDayOrderSelect(e.target.value)}
                      className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    >
                      <option value="">All Day Orders ({cascadeDayOrders.join(', ')})</option>
                      {DAY_ORDERS.map((day) => (
                        <option key={day} value={day}>
                          {day}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="admin-centre-select"
                      className="block text-xs font-medium text-slate-600 mb-1.5"
                    >
                      3. Select Centre Name & Slot
                    </label>
                    <select
                      id="admin-centre-select"
                      value={filterCentreId}
                      onChange={(e) => setFilterCentreId(e.target.value)}
                      className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    >
                      <option value="">All Centres ({cascadeCentres.length})</option>
                      {cascadeCentres.map((c) => (
                        <option key={c.id} value={String(c.id)}>
                          {c.name} ({c.time_slot}) — {c.location_name} · {c.day_order}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="admin-visit-date"
                      className="block text-xs font-medium text-slate-600 mb-1.5"
                    >
                      Visit Date Filter
                    </label>
                    <input
                      id="admin-visit-date"
                      type="date"
                      value={filterVisitDate}
                      onChange={(e) => setFilterVisitDate(e.target.value)}
                      className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                </div>

                {selectedCentreObj && (
                  <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">
                        {selectedCentreObj.name}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{selectedCentreObj.location_name}</span>
                      <span aria-hidden="true">·</span>
                      <span>{selectedCentreObj.day_order}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">{selectedCentreObj.time_slot}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {selectedCentreObj.latitude.toFixed(5)}, {selectedCentreObj.longitude.toFixed(5)}
                      </span>
                    </div>
                    {safeExternalUrl(selectedCentreObj.google_maps_url) && (
                      <a
                        href={safeExternalUrl(selectedCentreObj.google_maps_url)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-700 hover:underline font-medium flex items-center gap-1"
                      >
                        <span>Open Centre in Google Maps</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                )}
              </div>

              {/* Visits Table */}
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                  <h3 className="font-display text-base font-semibold text-slate-900">
                    Centre Visit Attendance & GPS Verification
                  </h3>
                  <span className="text-xs text-slate-500 font-mono tabular-nums">
                    {filteredVisits.length} record{filteredVisits.length === 1 ? '' : 's'}
                  </span>
                </div>

                {loading ? (
                  <div className="p-6 space-y-3">
                    {[1, 2, 3].map((row) => (
                      <div key={row} className="h-10 bg-slate-100 rounded-lg animate-pulse" />
                    ))}
                  </div>
                ) : filteredVisits.length === 0 ? (
                  <div className="p-10 text-center space-y-2">
                    <p className="text-sm font-medium text-slate-900">
                      No collection visits recorded for the current selection
                    </p>
                    <p className="text-xs text-slate-500">
                      Visits appear here automatically as Field Agents verify GPS and check in or
                      out at centres.
                    </p>
                    {(filterLocationId || filterDayOrder || filterCentreId || filterVisitDate) && (
                      <button
                        type="button"
                        onClick={resetCollectionFilters}
                        className="mt-2 min-h-[40px] px-4 py-2 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg"
                      >
                        Reset Filters
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                          <th className="py-3 px-4 whitespace-nowrap">Date</th>
                          <th className="py-3 px-4 whitespace-nowrap">Agent</th>
                          <th className="py-3 px-4 whitespace-nowrap">Location · Day</th>
                          <th className="py-3 px-4 whitespace-nowrap">Centre & Slot</th>
                          <th className="py-3 px-4 whitespace-nowrap">Centre In-Time</th>
                          <th className="py-3 px-4 whitespace-nowrap">Centre Out-Time</th>
                          <th className="py-3 px-4 whitespace-nowrap">100m GPS Accuracy</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                        {filteredVisits.map((v) => {
                          const hasWarning =
                            v.in_within_100m === 0 ||
                            (v.out_within_100m !== null && v.out_within_100m === 0);
                          return (
                            <tr key={v.id} className="hover:bg-slate-50/70">
                              <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-700 whitespace-nowrap">
                                {v.visit_date}
                              </td>
                              <td className="py-3 px-4 whitespace-nowrap">
                                <div className="font-medium text-slate-900">{v.agent_name}</div>
                                <div className="text-xs text-slate-500 font-mono">
                                  {v.agent_identifier}
                                </div>
                              </td>
                              <td className="py-3 px-4 whitespace-nowrap text-slate-700">
                                <span>{v.location_name}</span>
                                <span className="text-slate-400 mx-1.5" aria-hidden="true">
                                  ·
                                </span>
                                <span className="font-medium">{v.day_order}</span>
                              </td>
                              <td className="py-3 px-4 whitespace-nowrap">
                                <div className="font-medium text-slate-900">{v.centre_name}</div>
                                <div className="text-xs text-slate-500 font-mono">{v.time_slot}</div>
                              </td>
                              <td className="py-3 px-4 whitespace-nowrap">
                                <div className="font-mono tabular-nums text-slate-900 font-medium">
                                  {formatIstTime(v.in_time)}
                                </div>
                                <div className="font-mono tabular-nums text-xs text-slate-500">
                                  {v.in_distance_m} m away (±{v.in_accuracy_m} m)
                                </div>
                              </td>
                              <td className="py-3 px-4 whitespace-nowrap">
                                {v.out_time ? (
                                  <>
                                    <div className="font-mono tabular-nums text-slate-900 font-medium">
                                      {formatIstTime(v.out_time)}
                                    </div>
                                    <div className="font-mono tabular-nums text-xs text-slate-500">
                                      {v.out_distance_m} m away (±{v.out_accuracy_m} m)
                                    </div>
                                  </>
                                ) : (
                                  <span className="text-xs font-medium text-blue-700">
                                    Checked In (In Progress)
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4 whitespace-nowrap">
                                {hasWarning ? (
                                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-800">
                                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                                    <span>Outside 100m Warning</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-800">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                    <span>Within 100m Verified</span>
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* TAB 2: FIELD STATUS */}
          {activeTab === 'field' && (
            <section className="space-y-5">
              <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-lg font-semibold text-slate-900">
                      Field Status Activity Log
                    </h2>
                    <p className="text-sm text-slate-600 mt-0.5">
                      Review agent reports across Sourcing, Loan, Training, and Collection—with
                      centre references and remarks.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setFieldFilterLocationId('');
                      setFieldFilterActivity('');
                      setFieldFilterAgentId('');
                      setFieldFilterDate('');
                    }}
                    className="min-h-[40px] px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg flex items-center gap-1.5 self-start whitespace-nowrap cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Clear Filters</span>
                  </button>
                </div>

                {/* Activity Type Segmented Filter */}
                <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-xl w-fit">
                  <button
                    type="button"
                    onClick={() => setFieldFilterActivity('')}
                    className={`min-h-[38px] px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                      fieldFilterActivity === ''
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    All Activities
                  </button>
                  {ACTIVITY_TYPES.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setFieldFilterActivity(type)}
                      className={`min-h-[38px] px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                        fieldFilterActivity === type
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label
                      htmlFor="field-loc-filter"
                      className="block text-xs font-medium text-slate-600 mb-1.5"
                    >
                      Location
                    </label>
                    <select
                      id="field-loc-filter"
                      value={fieldFilterLocationId}
                      onChange={(e) => setFieldFilterLocationId(e.target.value)}
                      className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl text-slate-900"
                    >
                      <option value="">All Locations</option>
                      {activeLocations.map((l) => (
                        <option key={l.id} value={String(l.id)}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="field-agent-filter"
                      className="block text-xs font-medium text-slate-600 mb-1.5"
                    >
                      Agent
                    </label>
                    <select
                      id="field-agent-filter"
                      value={fieldFilterAgentId}
                      onChange={(e) => setFieldFilterAgentId(e.target.value)}
                      className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl text-slate-900"
                    >
                      <option value="">All Agents</option>
                      {agents.map((a) => (
                        <option key={a.id} value={String(a.id)}>
                          {a.full_name} ({a.identifier})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="field-date-filter"
                      className="block text-xs font-medium text-slate-600 mb-1.5"
                    >
                      Date
                    </label>
                    <input
                      id="field-date-filter"
                      type="date"
                      value={fieldFilterDate}
                      onChange={(e) => setFieldFilterDate(e.target.value)}
                      className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                  <h3 className="font-display text-base font-semibold text-slate-900">
                    Field Submissions
                  </h3>
                  <span className="text-xs text-slate-500 font-mono tabular-nums">
                    {filteredFieldLogs.length} entr{filteredFieldLogs.length === 1 ? 'y' : 'ies'}
                  </span>
                </div>

                {filteredFieldLogs.length === 0 ? (
                  <div className="p-10 text-center space-y-2">
                    <p className="text-sm font-medium text-slate-900">No field status logs found</p>
                    <p className="text-xs text-slate-500">
                      Agents submit Sourcing, Loan, Training, and Collection updates from the Field
                      Status tab.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                          <th className="py-3 px-4 whitespace-nowrap">Logged At</th>
                          <th className="py-3 px-4 whitespace-nowrap">Agent</th>
                          <th className="py-3 px-4 whitespace-nowrap">Work Type</th>
                          <th className="py-3 px-4 whitespace-nowrap">Location · Centre</th>
                          <th className="py-3 px-4">Remarks</th>
                          <th className="py-3 px-4 whitespace-nowrap">GPS Tag</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                        {filteredFieldLogs.map((log) => (
                          <tr key={log.id} className="hover:bg-slate-50/70">
                            <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-700 whitespace-nowrap">
                              {formatIstDateTime(log.logged_at)}
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <div className="font-medium text-slate-900">{log.agent_name}</div>
                              <div className="text-xs text-slate-500 font-mono">
                                {log.agent_identifier}
                              </div>
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap font-medium text-slate-900">
                              {log.activity_type}
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap text-slate-700">
                              {log.location_name || '—'}
                              {log.centre_name && (
                                <>
                                  <span className="text-slate-400 mx-1.5" aria-hidden="true">
                                    ·
                                  </span>
                                  <span className="font-medium text-slate-900">
                                    {log.centre_name}
                                  </span>
                                </>
                              )}
                            </td>
                            <td className="py-3 px-4 text-slate-700 max-w-md">
                              {log.remarks ? log.remarks : <span className="text-slate-400">—</span>}
                            </td>
                            <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-500 whitespace-nowrap">
                              {log.lat !== null && log.lng !== null
                                ? `${log.lat.toFixed(4)}, ${log.lng.toFixed(4)}`
                                : 'Not attached'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* TAB 3: CENTRES & GOOGLE MAPS */}
          {activeTab === 'centres' && (
            <section className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-semibold text-slate-900">
                    Centres & Google Maps Geofences
                  </h2>
                  <p className="text-sm text-slate-600 mt-0.5">
                    Add centres under any Tamil Nadu location with a Google Maps link for 100m
                    agent GPS verification.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openNewCentreForm}
                  className="min-h-[44px] px-4 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-xl flex items-center gap-2 self-start whitespace-nowrap cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Centre</span>
                </button>
              </div>

              {centreFormOpen && (
                <form
                  onSubmit={handleSaveCentre}
                  className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-base font-semibold text-slate-900">
                      {editingCentreId ? 'Edit Centre' : 'Create New Centre'}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setCentreFormOpen(false)}
                      className="text-xs text-slate-500 hover:text-slate-800"
                    >
                      Cancel
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">
                        Location
                      </label>
                      <select
                        required
                        value={cLocationId}
                        onChange={(e) => setCLocationId(e.target.value)}
                        className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl"
                      >
                        <option value="" disabled>
                          Select Location
                        </option>
                        {activeLocations.map((l) => (
                          <option key={l.id} value={String(l.id)}>
                            {l.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">
                        Day Order
                      </label>
                      <select
                        value={cDayOrder}
                        onChange={(e) => setCDayOrder(e.target.value as DayOrder)}
                        className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl"
                      >
                        {DAY_ORDERS.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">
                        Centre Name
                      </label>
                      <input
                        type="text"
                        required
                        value={cName}
                        onChange={(e) => setCName(e.target.value)}
                        placeholder="e.g., Mars"
                        className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">
                        Time Slot
                      </label>
                      <input
                        type="text"
                        required
                        value={cTimeSlot}
                        onChange={(e) => setCTimeSlot(e.target.value)}
                        placeholder="e.g., 10:00 AM - 11:00 AM"
                        className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
                    <div className="lg:col-span-6">
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">
                        Google Maps Link
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="url"
                          value={cMapsUrl}
                          onChange={(e) => setCMapsUrl(e.target.value)}
                          placeholder="Paste Google Maps URL (https://maps.app.goo.gl/... or google.com/maps/...)"
                          className="flex-1 min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl"
                        />
                        <button
                          type="button"
                          disabled={extractingCoords || !cMapsUrl.trim()}
                          onClick={handleExtractMapsCoords}
                          className="min-h-[44px] px-3.5 py-2 text-xs font-medium text-blue-800 bg-blue-50 hover:bg-blue-100 disabled:opacity-50 rounded-xl flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                        >
                          <Link2 className="w-3.5 h-3.5" />
                          <span>{extractingCoords ? 'Reading...' : 'Extract GPS'}</span>
                        </button>
                      </div>
                    </div>

                    <div className="lg:col-span-3">
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">
                        Latitude
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={cLat}
                        onChange={(e) => setCLat(e.target.value)}
                        placeholder="e.g., 11.0168"
                        className="w-full min-h-[44px] px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-xl"
                      />
                    </div>

                    <div className="lg:col-span-3">
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">
                        Longitude
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={cLng}
                        onChange={(e) => setCLng(e.target.value)}
                        placeholder="e.g., 76.9558"
                        className="w-full min-h-[44px] px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-xl"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setCentreFormOpen(false)}
                      className="min-h-[44px] px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="min-h-[44px] px-5 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 rounded-xl cursor-pointer"
                    >
                      {submitting
                        ? 'Saving...'
                        : editingCentreId
                          ? 'Save Centre Changes'
                          : 'Create Centre'}
                    </button>
                  </div>
                </form>
              )}

              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                        <th className="py-3 px-4 whitespace-nowrap">Location</th>
                        <th className="py-3 px-4 whitespace-nowrap">Day Order</th>
                        <th className="py-3 px-4 whitespace-nowrap">Centre Name</th>
                        <th className="py-3 px-4 whitespace-nowrap">Time Slot</th>
                        <th className="py-3 px-4 whitespace-nowrap">GPS Coordinates</th>
                        <th className="py-3 px-4 whitespace-nowrap">Google Maps</th>
                        <th className="py-3 px-4 whitespace-nowrap">Status</th>
                        <th className="py-3 px-4 text-right whitespace-nowrap">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {centres.map((c) => {
                        const mapHref = safeExternalUrl(c.google_maps_url);
                        return (
                          <tr key={c.id} className="hover:bg-slate-50/70">
                            <td className="py-3 px-4 font-medium text-slate-900 whitespace-nowrap">
                              {c.location_name}
                            </td>
                            <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                              {c.day_order}
                            </td>
                            <td className="py-3 px-4 font-semibold text-slate-900 whitespace-nowrap">
                              {c.name}
                            </td>
                            <td className="py-3 px-4 font-mono text-xs text-slate-700 whitespace-nowrap">
                              {c.time_slot}
                            </td>
                            <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-600 whitespace-nowrap">
                              {c.latitude.toFixed(5)}, {c.longitude.toFixed(5)}
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              {mapHref ? (
                                <a
                                  href={mapHref}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline"
                                >
                                  <span>Open Map</span>
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              ) : (
                                <span className="text-xs text-slate-400">—</span>
                              )}
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap text-xs font-medium">
                              {c.active === 1 ? (
                                <span className="text-emerald-700">Active</span>
                              ) : (
                                <span className="text-slate-500">Inactive</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => openEditCentreForm(c)}
                                  className="px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                  <span>Edit</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleToggleCentreActive(c)}
                                  className="px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
                                >
                                  {c.active === 1 ? 'Deactivate' : 'Activate'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {/* TAB 4: LOCATIONS */}
          {activeTab === 'locations' && (
            <section className="space-y-5">
              <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
                <h2 className="font-display text-lg font-semibold text-slate-900">
                  Tamil Nadu Locations & Districts
                </h2>
                <p className="text-sm text-slate-600 mt-0.5 mb-4">
                  Dynamically add operating hubs across Tamil Nadu. New locations appear
                  immediately in Collection Status and Centre setup.
                </p>

                <form onSubmit={handleAddLocation} className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="text"
                    required
                    value={newLocName}
                    onChange={(e) => setNewLocName(e.target.value)}
                    placeholder="Enter new Tamil Nadu location (e.g., Trichy, Salem, Tirunelveli)"
                    className="flex-1 min-h-[44px] px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-xl"
                  />
                  <button
                    type="submit"
                    disabled={submitting || !newLocName.trim()}
                    className="min-h-[44px] px-5 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 rounded-xl flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Location</span>
                  </button>
                </form>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                      <th className="py-3 px-4">Location Name</th>
                      <th className="py-3 px-4">State</th>
                      <th className="py-3 px-4">Active Centres</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {locations.map((loc) => (
                      <tr key={loc.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 font-semibold text-slate-900">
                          {editingLocId === loc.id ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={editingLocName}
                                onChange={(e) => setEditingLocName(e.target.value)}
                                className="min-h-[36px] px-2.5 py-1 text-sm border border-slate-300 rounded-lg"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateLocation(loc.id, { name: editingLocName })
                                }
                                className="px-2.5 py-1 text-xs font-medium bg-blue-700 text-white rounded-lg"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingLocId(null)}
                                className="px-2 py-1 text-xs text-slate-600"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            loc.name
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-600">{loc.state}</td>
                        <td className="py-3 px-4 font-mono tabular-nums text-slate-700">
                          {loc.centre_count}
                        </td>
                        <td className="py-3 px-4 text-xs font-medium">
                          {loc.active === 1 ? (
                            <span className="text-emerald-700">Active</span>
                          ) : (
                            <span className="text-slate-500">Inactive</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingLocId(loc.id);
                                setEditingLocName(loc.name);
                              }}
                              className="px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
                            >
                              Rename
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateLocation(loc.id, { active: loc.active !== 1 })
                              }
                              className="px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
                            >
                              {loc.active === 1 ? 'Deactivate' : 'Activate'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* TAB 5: AGENTS */}
          {activeTab === 'agents' && (
            <section className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-semibold text-slate-900">
                    Field Agents Directory
                  </h2>
                  <p className="text-sm text-slate-600 mt-0.5">
                    Create Agent IDs or email logins with PIN/passwords. Agents are never locked to
                    a single centre and can record visits at any active centre.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openNewAgentForm}
                  className="min-h-[44px] px-4 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-xl flex items-center gap-2 self-start whitespace-nowrap cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Agent</span>
                </button>
              </div>

              {agentFormOpen && (
                <form
                  onSubmit={handleSaveAgent}
                  className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-base font-semibold text-slate-900">
                      {editingAgentId ? 'Edit Field Agent' : 'Create Field Agent Credentials'}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setAgentFormOpen(false)}
                      className="text-xs text-slate-500 hover:text-slate-800"
                    >
                      Cancel
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">
                        Full Name
                      </label>
                      <input
                        type="text"
                        required
                        value={aFullName}
                        onChange={(e) => setAFullName(e.target.value)}
                        placeholder="e.g., Senthil Kumar"
                        className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">
                        Agent ID or Email
                      </label>
                      <input
                        type="text"
                        required
                        disabled={editingAgentId !== null}
                        value={aIdentifier}
                        onChange={(e) => setAIdentifier(e.target.value)}
                        placeholder="e.g., tn-agt-01 or senthil@nilafinance.in"
                        className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl disabled:bg-slate-100"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">
                        {editingAgentId ? 'Reset PIN / Password (optional)' : 'PIN or Password'}
                      </label>
                      <input
                        type="password"
                        required={editingAgentId === null}
                        value={aPassword}
                        onChange={(e) => setAPassword(e.target.value)}
                        placeholder={
                          editingAgentId ? 'Leave blank to keep existing' : 'Minimum 4 characters'
                        }
                        className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">
                        Mobile Number
                      </label>
                      <input
                        type="tel"
                        value={aPhone}
                        onChange={(e) => setAPhone(e.target.value)}
                        placeholder="e.g., 9876543210"
                        className="w-full min-h-[44px] px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-xl"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">
                        Primary District
                      </label>
                      <input
                        type="text"
                        value={aDistrict}
                        onChange={(e) => setADistrict(e.target.value)}
                        placeholder="e.g., Coimbatore"
                        className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setAgentFormOpen(false)}
                      className="min-h-[44px] px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="min-h-[44px] px-5 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 rounded-xl cursor-pointer"
                    >
                      {submitting
                        ? 'Saving...'
                        : editingAgentId
                          ? 'Save Agent Changes'
                          : 'Create Agent'}
                    </button>
                  </div>
                </form>
              )}

              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                {agents.length === 0 ? (
                  <div className="p-10 text-center space-y-3">
                    <p className="text-sm font-medium text-slate-900">No Field Agents added yet</p>
                    <p className="text-xs text-slate-500 max-w-md mx-auto">
                      Create credentials for your field agents so they can log in from their phones,
                      verify GPS at centres, and submit daily field status reports.
                    </p>
                    <button
                      type="button"
                      onClick={openNewAgentForm}
                      className="min-h-[44px] px-4 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-xl inline-flex items-center gap-2 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add First Agent</span>
                    </button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                          <th className="py-3 px-4 whitespace-nowrap">Agent Name</th>
                          <th className="py-3 px-4 whitespace-nowrap">Agent ID / Email</th>
                          <th className="py-3 px-4 whitespace-nowrap">Mobile</th>
                          <th className="py-3 px-4 whitespace-nowrap">Primary District</th>
                          <th className="py-3 px-4 whitespace-nowrap">Status</th>
                          <th className="py-3 px-4 text-right whitespace-nowrap">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                        {agents.map((a) => (
                          <tr key={a.id} className="hover:bg-slate-50/70">
                            <td className="py-3 px-4 font-semibold text-slate-900 whitespace-nowrap">
                              {a.full_name}
                            </td>
                            <td className="py-3 px-4 font-mono text-xs text-slate-700 whitespace-nowrap">
                              {a.identifier}
                            </td>
                            <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-700 whitespace-nowrap">
                              {a.phone || '—'}
                            </td>
                            <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                              {a.district || 'Tamil Nadu'}
                            </td>
                            <td className="py-3 px-4 text-xs font-medium whitespace-nowrap">
                              {a.active === 1 ? (
                                <span className="text-emerald-700">Active</span>
                              ) : (
                                <span className="text-slate-500">Inactive</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => openEditAgentForm(a)}
                                  className="px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                  <span>Edit / Reset PIN</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleToggleAgentActive(a)}
                                  className="px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
                                >
                                  {a.active === 1 ? 'Deactivate' : 'Activate'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
