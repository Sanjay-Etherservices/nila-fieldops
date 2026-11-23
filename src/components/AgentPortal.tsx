import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock,
  Compass,
  Crosshair,
  ExternalLink,
  History,
  LogOut,
  MapPin,
  Navigation,
  RefreshCw,
} from 'lucide-react';
import {
  apiFetch,
  calculateDistanceMetres,
  formatIstDateTime,
  formatIstTime,
  getCurrentGpsPosition,
  getTodayIst,
  safeExternalUrl,
} from '../lib/api.ts';
import {
  ACTIVITY_TYPES,
  DAY_ORDERS,
  type ActivityType,
  type AuthUser,
  type CentreItem,
  type CollectionVisit,
  type FieldStatusLog,
  type GpsReading,
  type LocationItem,
} from '../types.ts';

type AgentTab = 'collection' | 'field' | 'history';

interface AgentPortalProps {
  token: string;
  user: AuthUser;
  onLogout: () => void;
}

export function AgentPortal({ token, user, onLogout }: AgentPortalProps) {
  const [activeTab, setActiveTab] = useState<AgentTab>('collection');

  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [centres, setCentres] = useState<CentreItem[]>([]);
  const [visits, setVisits] = useState<CollectionVisit[]>([]);
  const [fieldLogs, setFieldLogs] = useState<FieldStatusLog[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Collection Check-In Selection
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [selectedDayOrder, setSelectedDayOrder] = useState<string>('');
  const [selectedCentreId, setSelectedCentreId] = useState<string>('');
  const [gpsReading, setGpsReading] = useState<GpsReading | null>(null);
  const [acquiringGps, setAcquiringGps] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkingOutId, setCheckingOutId] = useState<number | null>(null);

  // Field Status Form
  const [activityType, setActivityType] = useState<ActivityType>('Sourcing');
  const [fieldLocationId, setFieldLocationId] = useState<string>('');
  const [fieldCentreId, setFieldCentreId] = useState<string>('');
  const [remarks, setRemarks] = useState('');
  const [fieldGps, setFieldGps] = useState<GpsReading | null>(null);
  const [submittingField, setSubmittingField] = useState(false);

  const todayIst = getTodayIst();

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((prev) => (prev === msg ? null : prev));
    }, 4000);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [locRes, cenRes, visRes, fldRes] = await Promise.all([
        apiFetch<{ locations: LocationItem[] }>('/api/locations', { token }),
        apiFetch<{ centres: CentreItem[] }>('/api/centres', { token }),
        apiFetch<{ visits: CollectionVisit[] }>('/api/visits', { token }),
        apiFetch<{ logs: FieldStatusLog[] }>('/api/field-status', { token }),
      ]);
      setLocations(locRes.locations);
      setCentres(cenRes.centres);
      setVisits(visRes.visits);
      setFieldLogs(fldRes.logs);

      if (!selectedLocationId && locRes.locations.length > 0) {
        setSelectedLocationId(String(locRes.locations[0].id));
      }
      if (!fieldLocationId && locRes.locations.length > 0) {
        setFieldLocationId(String(locRes.locations[0].id));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load field data.');
    } finally {
      setLoading(false);
    }
  }, [token, selectedLocationId, fieldLocationId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredCentres = useMemo(() => {
    return centres.filter(
      (c) =>
        (!selectedLocationId || String(c.location_id) === selectedLocationId) &&
        (!selectedDayOrder || c.day_order === selectedDayOrder)
    );
  }, [centres, selectedLocationId, selectedDayOrder]);

  useEffect(() => {
    if (
      selectedCentreId &&
      !filteredCentres.some((c) => String(c.id) === selectedCentreId)
    ) {
      setSelectedCentreId('');
    }
  }, [filteredCentres, selectedCentreId]);

  const selectedCentre = useMemo(
    () => centres.find((c) => String(c.id) === selectedCentreId) ?? null,
    [centres, selectedCentreId]
  );

  const liveDistanceMetres = useMemo(() => {
    if (!gpsReading || !selectedCentre) return null;
    return calculateDistanceMetres(
      gpsReading.lat,
      gpsReading.lng,
      selectedCentre.latitude,
      selectedCentre.longitude
    );
  }, [gpsReading, selectedCentre]);

  const activeVisitsToday = useMemo(
    () => visits.filter((v) => v.visit_date === todayIst && v.status === 'checked_in'),
    [visits, todayIst]
  );

  const completedVisitsToday = useMemo(
    () => visits.filter((v) => v.visit_date === todayIst && v.status === 'completed'),
    [visits, todayIst]
  );

  const fieldCentresFiltered = useMemo(() => {
    return centres.filter(
      (c) => !fieldLocationId || String(c.location_id) === fieldLocationId
    );
  }, [centres, fieldLocationId]);

  async function handleCaptureGps() {
    setAcquiringGps(true);
    setError(null);
    try {
      const reading = await getCurrentGpsPosition();
      setGpsReading(reading);
      showToast(`GPS locked (±${reading.accuracy} m accuracy)`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'GPS capture failed.');
    } finally {
      setAcquiringGps(false);
    }
  }

  async function handleCheckIn() {
    if (!selectedCentre) {
      setError('Select a centre before checking in.');
      return;
    }

    setCheckingIn(true);
    setError(null);
    try {
      const reading = gpsReading ?? (await getCurrentGpsPosition());
      setGpsReading(reading);

      const res = await apiFetch<{ visit: CollectionVisit }>('/api/visits/check-in', {
        method: 'POST',
        token,
        body: {
          centreId: selectedCentre.id,
          lat: reading.lat,
          lng: reading.lng,
          accuracy: reading.accuracy,
        },
      });

      const v = res.visit;
      if (v.in_within_100m === 1) {
        showToast(
          `Checked in at ${v.centre_name} (${v.in_distance_m} m from centre · Within 100m)`
        );
      } else {
        showToast(
          `Checked in at ${v.centre_name} with soft warning (${v.in_distance_m} m away · Outside 100m)`
        );
      }
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Check-in failed.');
    } finally {
      setCheckingIn(false);
    }
  }

  async function handleCheckOut(visit: CollectionVisit) {
    setCheckingOutId(visit.id);
    setError(null);
    try {
      const reading = await getCurrentGpsPosition();
      const res = await apiFetch<{ visit: CollectionVisit }>(
        `/api/visits/${visit.id}/check-out`,
        {
          method: 'POST',
          token,
          body: {
            lat: reading.lat,
            lng: reading.lng,
            accuracy: reading.accuracy,
          },
        }
      );

      const updated = res.visit;
      if (updated.out_within_100m === 1) {
        showToast(
          `Checked out from ${updated.centre_name} (${updated.out_distance_m} m · Within 100m)`
        );
      } else {
        showToast(
          `Checked out from ${updated.centre_name} with soft warning (${updated.out_distance_m} m · Outside 100m)`
        );
      }
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Check-out failed.');
    } finally {
      setCheckingOutId(null);
    }
  }

  async function handleAttachFieldGps() {
    setAcquiringGps(true);
    setError(null);
    try {
      const reading = await getCurrentGpsPosition();
      setFieldGps(reading);
      showToast(`Location tagged (${reading.lat.toFixed(4)}, ${reading.lng.toFixed(4)})`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to tag GPS location.');
    } finally {
      setAcquiringGps(false);
    }
  }

  async function handleSubmitFieldStatus(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if ((activityType === 'Sourcing' || activityType === 'Loan') && !fieldCentreId) {
      setError(`Please select which centre for ${activityType}.`);
      return;
    }
    if (activityType === 'Loan' && !remarks.trim()) {
      setError('Remarks are required when submitting Loan field status.');
      return;
    }

    setSubmittingField(true);
    try {
      await apiFetch('/api/field-status', {
        method: 'POST',
        token,
        body: {
          activityType,
          centreId: fieldCentreId ? Number(fieldCentreId) : null,
          locationId: fieldLocationId ? Number(fieldLocationId) : null,
          remarks: remarks.trim(),
          lat: fieldGps?.lat ?? null,
          lng: fieldGps?.lng ?? null,
          accuracy: fieldGps?.accuracy ?? null,
        },
      });
      setRemarks('');
      setFieldGps(null);
      showToast(`${activityType} status logged.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to log field status.');
    } finally {
      setSubmittingField(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col pb-20 lg:pb-8">
      {/* Sticky Top Header (Compact <= 56px) */}
      <header className="sticky top-0 z-30 h-14 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto h-full flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <Compass className="w-5 h-5 text-blue-700 shrink-0" aria-hidden="true" />
            <span className="font-display font-bold text-slate-900 whitespace-nowrap shrink-0">
              Nila FieldOps
            </span>
          </div>

          {/* Desktop Navigation Tabs */}
          <nav
            aria-label="Agent sections"
            className="hidden lg:flex items-center gap-1 p-1 bg-slate-100 rounded-xl"
          >
            <button
              type="button"
              onClick={() => setActiveTab('collection')}
              className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
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
              className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'field'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Field Status
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'history'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              My History
            </button>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden sm:inline text-xs text-slate-600 truncate max-w-[160px]">
              {user.fullName}
            </span>
            <button
              type="button"
              onClick={loadData}
              aria-label="Refresh"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="min-h-[40px] px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-5 space-y-5">
        {/* Agent Identity Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-900">{user.fullName}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">{user.identifier}</span>
            <span aria-hidden="true">·</span>
            <span>Open Centre Access (All Hubs)</span>
          </div>
          <span className="font-mono tabular-nums text-slate-500">IST Date: {todayIst}</span>
        </div>

        {toast && (
          <div
            role="status"
            className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-900 flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>{toast}</span>
            </div>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="text-xs font-medium text-emerald-800"
            >
              OK
            </button>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800 flex items-center justify-between gap-3"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-xs font-medium text-red-800 shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* TAB 1: COLLECTION STATUS */}
        {activeTab === 'collection' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Left / Main Check-In Workflow */}
            <section className="lg:col-span-7 space-y-5">
              {/* Active Checked-In Visits Needing Check-Out */}
              {activeVisitsToday.length > 0 && (
                <div className="bg-white border border-blue-200 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h2 className="font-display text-base font-bold text-slate-900">
                        Active Visit — Ready for Centre Out-Time
                      </h2>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Verify your GPS location before leaving the centre to log Out-Time.
                      </p>
                    </div>
                    <Clock className="w-5 h-5 text-blue-700 shrink-0" aria-hidden="true" />
                  </div>

                  <div className="divide-y divide-slate-100">
                    {activeVisitsToday.map((visit) => (
                      <div key={visit.id} className="py-3 first:pt-0 last:pb-0 space-y-3">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <div>
                            <p className="font-semibold text-slate-900">
                              {visit.centre_name} ({visit.time_slot})
                            </p>
                            <p className="text-xs text-slate-600 mt-0.5">
                              {visit.location_name} · {visit.day_order}
                            </p>
                          </div>
                          <div className="text-right font-mono tabular-nums text-xs">
                            <p className="font-semibold text-slate-900">
                              In: {formatIstTime(visit.in_time)}
                            </p>
                            <p
                              className={
                                visit.in_within_100m === 1 ? 'text-emerald-700' : 'text-amber-700'
                              }
                            >
                              {visit.in_distance_m} m away
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={checkingOutId === visit.id}
                          onClick={() => handleCheckOut(visit)}
                          className="w-full min-h-[48px] px-4 py-3 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 rounded-xl flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <Navigation className="w-4 h-4" />
                          <span>
                            {checkingOutId === visit.id
                              ? 'Verifying GPS & Recording Out-Time...'
                              : 'Verify GPS & Record Centre Out-Time'}
                          </span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Check-In Form Card */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5">
                <div>
                  <h1 className="font-display text-lg font-bold text-slate-900">
                    Centre Collection Check-In
                  </h1>
                  <p className="text-sm text-slate-600 mt-0.5">
                    Choose any centre you are visiting, verify your GPS within 100 metres, and
                    record Centre In-Time.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="agent-loc-select"
                      className="block text-xs font-medium text-slate-700 mb-1.5"
                    >
                      Location
                    </label>
                    <select
                      id="agent-loc-select"
                      value={selectedLocationId}
                      onChange={(e) => setSelectedLocationId(e.target.value)}
                      className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl text-slate-900"
                    >
                      <option value="">All Locations</option>
                      {locations.map((l) => (
                        <option key={l.id} value={String(l.id)}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="agent-day-select"
                      className="block text-xs font-medium text-slate-700 mb-1.5"
                    >
                      Day Order
                    </label>
                    <select
                      id="agent-day-select"
                      value={selectedDayOrder}
                      onChange={(e) => setSelectedDayOrder(e.target.value)}
                      className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl text-slate-900"
                    >
                      <option value="">All Day Orders</option>
                      {DAY_ORDERS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="agent-centre-select"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    Centre Name & Time Slot
                  </label>
                  <select
                    id="agent-centre-select"
                    value={selectedCentreId}
                    onChange={(e) => setSelectedCentreId(e.target.value)}
                    className="w-full min-h-[48px] px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 font-medium"
                  >
                    <option value="">Select a centre ({filteredCentres.length} available)</option>
                    {filteredCentres.map((c) => (
                      <option key={c.id} value={String(c.id)}>
                        {c.name} ({c.time_slot}) — {c.location_name} · {c.day_order}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedCentre && (
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900 text-sm">
                        {selectedCentre.name} · {selectedCentre.time_slot}
                      </span>
                      {safeExternalUrl(selectedCentre.google_maps_url) && (
                        <a
                          href={safeExternalUrl(selectedCentre.google_maps_url)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-700 hover:underline font-medium inline-flex items-center gap-1"
                        >
                          <span>Navigate in Maps</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                    <p className="text-slate-600 font-mono tabular-nums">
                      Target GPS: {selectedCentre.latitude.toFixed(5)},{' '}
                      {selectedCentre.longitude.toFixed(5)} · Geofence: 100 m
                    </p>
                  </div>
                )}

                {/* GPS Acquisition & Proximity Feedback */}
                <div className="space-y-3 pt-1">
                  <button
                    type="button"
                    disabled={acquiringGps}
                    onClick={handleCaptureGps}
                    className="w-full min-h-[44px] px-4 py-2.5 text-sm font-medium text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Crosshair className="w-4 h-4" />
                    <span>
                      {acquiringGps
                        ? 'Acquiring Device GPS...'
                        : gpsReading
                          ? 'Refresh Current GPS Location'
                          : 'Verify Current GPS Location'}
                    </span>
                  </button>

                  {gpsReading && (
                    <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-mono tabular-nums text-slate-700">
                          Your GPS: {gpsReading.lat.toFixed(5)}, {gpsReading.lng.toFixed(5)}
                        </span>
                        <span className="font-mono tabular-nums text-slate-500">
                          Device accuracy: ±{gpsReading.accuracy} m
                        </span>
                      </div>

                      {liveDistanceMetres !== null && (
                        <div
                          className={`p-3 rounded-lg text-xs font-medium flex items-start gap-2 ${
                            liveDistanceMetres <= 100
                              ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                              : 'bg-amber-50 text-amber-900 border border-amber-200'
                          }`}
                        >
                          {liveDistanceMetres <= 100 ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                          ) : (
                            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                          )}
                          <div>
                            <p>
                              {liveDistanceMetres <= 100
                                ? `Verified within 100m (${liveDistanceMetres} m from ${selectedCentre?.name}).`
                                : `Soft Warning: You are ${liveDistanceMetres} m away from ${selectedCentre?.name} (outside 100m radius).`}
                            </p>
                            {liveDistanceMetres > 100 && (
                              <p className="font-normal text-amber-800 mt-0.5">
                                Check-in is still allowed, and this distance will be flagged for
                                Admin review.
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={checkingIn || !selectedCentre}
                    onClick={handleCheckIn}
                    className="w-full min-h-[48px] px-5 py-3 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:bg-slate-300 rounded-xl flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <MapPin className="w-4 h-4" />
                    <span>
                      {checkingIn
                        ? 'Recording Centre In-Time...'
                        : 'Record Centre In-Time (Check In)'}
                    </span>
                  </button>
                </div>
              </div>
            </section>

            {/* Right Column: Today's Completed Visits */}
            <aside className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Today’s Completed Visits
                </h2>
                <span className="text-xs font-mono tabular-nums text-slate-500">
                  {completedVisitsToday.length} done
                </span>
              </div>

              {completedVisitsToday.length === 0 ? (
                <p className="text-sm text-slate-500 py-6 text-center">
                  No completed centre visits logged today yet.
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {completedVisitsToday.map((v) => (
                    <div key={v.id} className="py-3.5 first:pt-0 last:pb-0 space-y-1.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="font-semibold text-sm text-slate-900">{v.centre_name}</p>
                        <span className="text-xs font-mono text-slate-500">
                          {v.location_name} · {v.day_order}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs font-mono tabular-nums text-slate-700">
                        <span>In: {formatIstTime(v.in_time)}</span>
                        <span aria-hidden="true">·</span>
                        <span>Out: {formatIstTime(v.out_time)}</span>
                      </div>
                      <div className="text-xs">
                        {v.in_within_100m === 1 && v.out_within_100m === 1 ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>
                              Within 100m ({v.in_distance_m} m in / {v.out_distance_m} m out)
                            </span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>
                              Outside 100m warning ({v.in_distance_m} m in / {v.out_distance_m} m
                              out)
                            </span>
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </aside>
          </div>
        )}

        {/* TAB 2: FIELD STATUS */}
        {activeTab === 'field' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            <section className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5">
              <div>
                <h1 className="font-display text-lg font-bold text-slate-900">
                  Log Field Status
                </h1>
                <p className="text-sm text-slate-600 mt-0.5">
                  Select your current field work category. No loan amounts are entered here.
                </p>
              </div>

              <form onSubmit={handleSubmitFieldStatus} className="space-y-5">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-2">
                    Select Work Category
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {ACTIVITY_TYPES.map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setActivityType(type)}
                        className={`min-h-[44px] px-3 py-2 text-sm font-medium rounded-xl border transition-colors whitespace-nowrap cursor-pointer ${
                          activityType === type
                            ? 'bg-blue-700 text-white border-blue-700'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="field-loc"
                      className="block text-xs font-medium text-slate-700 mb-1.5"
                    >
                      Location
                    </label>
                    <select
                      id="field-loc"
                      value={fieldLocationId}
                      onChange={(e) => {
                        setFieldLocationId(e.target.value);
                        setFieldCentreId('');
                      }}
                      className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl"
                    >
                      <option value="">All Locations</option>
                      {locations.map((l) => (
                        <option key={l.id} value={String(l.id)}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="field-centre"
                      className="block text-xs font-medium text-slate-700 mb-1.5"
                    >
                      Centre{' '}
                      {activityType === 'Sourcing' || activityType === 'Loan'
                        ? '(Required)'
                        : '(Optional)'}
                    </label>
                    <select
                      id="field-centre"
                      required={activityType === 'Sourcing' || activityType === 'Loan'}
                      value={fieldCentreId}
                      onChange={(e) => setFieldCentreId(e.target.value)}
                      className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl"
                    >
                      <option value="">
                        {activityType === 'Sourcing' || activityType === 'Loan'
                          ? 'Select which centre...'
                          : 'No specific centre (Optional)'}
                      </option>
                      {fieldCentresFiltered.map((c) => (
                        <option key={c.id} value={String(c.id)}>
                          {c.name} ({c.location_name} · {c.day_order})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="field-remarks"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    Remarks {activityType === 'Loan' ? '(Required for Loan)' : '(Optional)'}
                  </label>
                  <textarea
                    id="field-remarks"
                    rows={3}
                    required={activityType === 'Loan'}
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder={
                      activityType === 'Loan'
                        ? 'Enter loan verification or disbursement visit remarks (do not enter loan amount)...'
                        : activityType === 'Sourcing'
                          ? 'Optional sourcing notes (e.g., new group inquiry)...'
                          : 'Enter activity remarks...'
                    }
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <button
                    type="button"
                    disabled={acquiringGps}
                    onClick={handleAttachFieldGps}
                    className="min-h-[44px] px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl flex items-center gap-1.5 cursor-pointer"
                  >
                    <Crosshair className="w-3.5 h-3.5" />
                    <span>
                      {fieldGps
                        ? `GPS Tagged (${fieldGps.lat.toFixed(4)}, ${fieldGps.lng.toFixed(4)})`
                        : 'Attach Current GPS (Optional)'}
                    </span>
                  </button>

                  <button
                    type="submit"
                    disabled={submittingField}
                    className="min-h-[48px] px-6 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 rounded-xl flex items-center gap-2 cursor-pointer"
                  >
                    <ClipboardList className="w-4 h-4" />
                    <span>
                      {submittingField ? 'Submitting...' : `Submit ${activityType} Status`}
                    </span>
                  </button>
                </div>
              </form>
            </section>

            {/* Recent Field Status Logs */}
            <aside className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Recent Field Updates
                </h2>
                <span className="text-xs font-mono tabular-nums text-slate-500">
                  {fieldLogs.length} total
                </span>
              </div>

              {fieldLogs.length === 0 ? (
                <p className="text-sm text-slate-500 py-6 text-center">
                  No field status entries submitted yet.
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {fieldLogs.slice(0, 8).map((log) => (
                    <div key={log.id} className="py-3 first:pt-0 last:pb-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm text-slate-900">
                          {log.activity_type}
                        </span>
                        <span className="font-mono tabular-nums text-xs text-slate-500">
                          {formatIstDateTime(log.logged_at)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600">
                        {log.location_name || 'Tamil Nadu'}
                        {log.centre_name && ` · ${log.centre_name}`}
                      </p>
                      {log.remarks && (
                        <p className="text-xs text-slate-700 leading-relaxed">{log.remarks}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </aside>
          </div>
        )}

        {/* TAB 3: MY HISTORY */}
        {activeTab === 'history' && (
          <section className="space-y-5">
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                <h2 className="font-display text-base font-semibold text-slate-900">
                  My Collection Visit History
                </h2>
                <span className="text-xs font-mono tabular-nums text-slate-500">
                  {visits.length} visits
                </span>
              </div>

              {visits.length === 0 ? (
                <p className="p-8 text-sm text-slate-500 text-center">
                  No collection visits recorded yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">Centre</th>
                        <th className="py-3 px-4">In-Time</th>
                        <th className="py-3 px-4">Out-Time</th>
                        <th className="py-3 px-4">GPS Check</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {visits.map((v) => (
                        <tr key={v.id}>
                          <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-700 whitespace-nowrap">
                            {v.visit_date}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="font-medium text-slate-900">{v.centre_name}</div>
                            <div className="text-xs text-slate-500">
                              {v.location_name} · {v.day_order}
                            </div>
                          </td>
                          <td className="py-3 px-4 font-mono tabular-nums text-xs whitespace-nowrap">
                            {formatIstTime(v.in_time)} ({v.in_distance_m} m)
                          </td>
                          <td className="py-3 px-4 font-mono tabular-nums text-xs whitespace-nowrap">
                            {v.out_time
                              ? `${formatIstTime(v.out_time)} (${v.out_distance_m} m)`
                              : 'Active'}
                          </td>
                          <td className="py-3 px-4 text-xs font-medium whitespace-nowrap">
                            {v.in_within_100m === 1 &&
                            (v.out_within_100m === null || v.out_within_100m === 1) ? (
                              <span className="text-emerald-700">Within 100m</span>
                            ) : (
                              <span className="text-amber-700">Outside 100m Warning</span>
                            )}
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

      {/* Mobile Thumb-Zone Bottom Tab Bar */}
      <nav
        aria-label="Mobile navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-white/95 backdrop-blur-md border-t border-slate-200 grid grid-cols-3 items-center"
      >
        <button
          type="button"
          onClick={() => setActiveTab('collection')}
          className={`h-full flex flex-col items-center justify-center gap-1 text-[11px] font-medium ${
            activeTab === 'collection' ? 'text-blue-700' : 'text-slate-600'
          }`}
        >
          <MapPin className="w-5 h-5" />
          <span>Collection</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('field')}
          className={`h-full flex flex-col items-center justify-center gap-1 text-[11px] font-medium ${
            activeTab === 'field' ? 'text-blue-700' : 'text-slate-600'
          }`}
        >
          <ClipboardList className="w-5 h-5" />
          <span>Field Status</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`h-full flex flex-col items-center justify-center gap-1 text-[11px] font-medium ${
            activeTab === 'history' ? 'text-blue-700' : 'text-slate-600'
          }`}
        >
          <History className="w-5 h-5" />
          <span>History</span>
        </button>
      </nav>
    </div>
  );
}
