import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, BedDouble, HeartPulse, SlidersHorizontal, Stethoscope } from 'lucide-react';
import { api } from '../services/api';
import { Modal } from './ui/Modal';
import { StatusText } from './ui/StatusText';
import {
  buildResourceAvailabilitySnapshot,
  deriveTheaterReadinessStatus,
  type ResourceAvailabilitySnapshot,
} from '../utils/resourceAvailability';
import type { HospitalResourceRecord, OrganRecord } from '../types/db';

interface ResourceAvailabilityCardProps {
  hospitalId: number;
  hospitalName: string;
  scopeAll: boolean;
  organs: OrganRecord[];
  onNavigateTab?: (tab: string) => void;
  onResourceUpdated?: (message: string) => void;
}

export function ResourceAvailabilityCard({
  hospitalId,
  hospitalName,
  scopeAll,
  organs,
  onNavigateTab,
  onResourceUpdated,
}: ResourceAvailabilityCardProps) {
  const [resources, setResources] = useState<HospitalResourceRecord[]>([]);
  const [snapshot, setSnapshot] = useState<ResourceAvailabilitySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [streamStatus, setStreamStatus] = useState<'connected' | 'reconnecting'>('reconnecting');
  const [error, setError] = useState<string | null>(null);

  // Capacity editor modal state
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ownResource, setOwnResource] = useState<HospitalResourceRecord | null>(null);
  const [formState, setFormState] = useState({
    ICU_Beds_Occupied: 0,
    Isolation_Beds_Occupied: 0,
    Ward_Beds_Occupied: 0,
    Theaters_Ready: 0,
    Theaters_In_Use: 0,
    Surgical_Teams_On_Call: 0,
    Next_Theater_Available_Min: 0,
    Notes: '',
  });

  const activeHospitalFilter = scopeAll ? undefined : hospitalId;

  const loadSnapshot = useCallback(async () => {
    try {
      setError(null);
      const data = await api.getResources(activeHospitalFilter);
      setResources(data.resources);
      setSnapshot(data.snapshot);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load hospital resource availability.');
    } finally {
      setLoading(false);
    }
  }, [activeHospitalFilter]);

  useEffect(() => {
    setLoading(true);
    void loadSnapshot();
  }, [loadSnapshot]);

  // Subscribe to real-time SSE resource stream
  useEffect(() => {
    const streamUrl = activeHospitalFilter
      ? `/api/resources/stream?hospitalId=${activeHospitalFilter}`
      : '/api/resources/stream';
    const source = new EventSource(streamUrl);

    const handleResourceUpdate = (event: MessageEvent) => {
      try {
        const parsed = JSON.parse(event.data) as {
          resources: HospitalResourceRecord[];
          snapshot: ResourceAvailabilitySnapshot;
        };
        setResources(parsed.resources);
        setSnapshot(parsed.snapshot);
        setStreamStatus('connected');
        setLoading(false);
      } catch {
        // Ignore malformed SSE frame
      }
    };

    source.addEventListener('resource-update', handleResourceUpdate as EventListener);
    source.onopen = () => setStreamStatus('connected');
    source.onerror = () => setStreamStatus('reconnecting');

    return () => {
      source.removeEventListener('resource-update', handleResourceUpdate as EventListener);
      source.close();
    };
  }, [activeHospitalFilter]);

  // Keep organ inventory numbers synchronized if parent reloads organs
  const effectiveSnapshot = useMemo(() => {
    if (!snapshot) return null;
    if (resources.length === 0) return snapshot;
    const clientRebuilt = buildResourceAvailabilitySnapshot({
      resources,
      organs,
      scopeLabel: snapshot.scopeLabel,
    });
    return {
      ...snapshot,
      organInventory:
        organs.length >= snapshot.organInventory.totalTracked
          ? clientRebuilt.organInventory
          : snapshot.organInventory,
    };
  }, [snapshot, resources, organs]);

  const openCapacityEditor = async () => {
    setError(null);
    let target = resources.find((r) => r.Hospital_ID === hospitalId) ?? null;
    if (!target) {
      try {
        const res = await api.getResources(hospitalId);
        target = res.resources[0] ?? null;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not fetch hospital resource record.');
        return;
      }
    }
    if (!target) return;
    setOwnResource(target);
    setFormState({
      ICU_Beds_Occupied: target.ICU_Beds_Occupied,
      Isolation_Beds_Occupied: target.Isolation_Beds_Occupied,
      Ward_Beds_Occupied: target.Ward_Beds_Occupied,
      Theaters_Ready: target.Theaters_Ready,
      Theaters_In_Use: target.Theaters_In_Use,
      Surgical_Teams_On_Call: target.Surgical_Teams_On_Call,
      Next_Theater_Available_Min: target.Next_Theater_Available_Min,
      Notes: target.Notes ?? '',
    });
    setEditorOpen(true);
  };

  const handleSaveCapacity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ownResource) return;
    setSaving(true);
    setError(null);
    try {
      const clampedReady = Math.max(0, Math.min(formState.Theaters_Ready, ownResource.Theaters_Total));
      const clampedInUse = Math.max(
        0,
        Math.min(formState.Theaters_In_Use, ownResource.Theaters_Total - clampedReady),
      );
      const sanitizing = Math.max(0, ownResource.Theaters_Total - clampedReady - clampedInUse);

      await api.updateHospitalResources(hospitalId, {
        ICU_Beds_Occupied: formState.ICU_Beds_Occupied,
        Isolation_Beds_Occupied: formState.Isolation_Beds_Occupied,
        Ward_Beds_Occupied: formState.Ward_Beds_Occupied,
        Theaters_Ready: clampedReady,
        Theaters_In_Use: clampedInUse,
        Theaters_Sanitizing: sanitizing,
        Surgical_Teams_On_Call: formState.Surgical_Teams_On_Call,
        Next_Theater_Available_Min: clampedReady > 0 ? 0 : formState.Next_Theater_Available_Min || 30,
        Notes: formState.Notes.trim() || null,
        actorName: hospitalName,
      });

      setEditorOpen(false);
      await loadSnapshot();
      onResourceUpdated?.(`Updated real-time bed occupancy and surgical theater status for ${hospitalName}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update capacity.');
    } finally {
      setSaving(false);
    }
  };

  const singleHospitalRecord = !scopeAll ? resources.find((r) => r.Hospital_ID === hospitalId) : undefined;

  const previewSanitizing = ownResource
    ? Math.max(
        0,
        ownResource.Theaters_Total -
          Math.min(formState.Theaters_Ready, ownResource.Theaters_Total) -
          Math.min(
            formState.Theaters_In_Use,
            ownResource.Theaters_Total - Math.min(formState.Theaters_Ready, ownResource.Theaters_Total),
          ),
      )
    : 0;

  const previewReadiness = ownResource
    ? deriveTheaterReadinessStatus({
        theatersTotal: ownResource.Theaters_Total,
        theatersReady: Math.min(formState.Theaters_Ready, ownResource.Theaters_Total),
        theatersInUse: formState.Theaters_In_Use,
        surgicalTeamsOnCall: formState.Surgical_Teams_On_Call,
      })
    : 'Ready';

  const occupancyBarColor =
    effectiveSnapshot?.bedOccupancy.capacityStatus === 'Critical'
      ? 'bg-rose-600'
      : effectiveSnapshot?.bedOccupancy.capacityStatus === 'High Load'
      ? 'bg-amber-500'
      : 'bg-emerald-600';

  return (
    <section
      aria-labelledby="resource-availability-heading"
      className="rounded-lg border border-slate-200 bg-white p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-teal-700 shrink-0" aria-hidden="true" />
            <h2 id="resource-availability-heading" className="text-sm font-semibold text-slate-900">
              Resource Availability
            </h2>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {streamStatus === 'connected' ? 'Live SSE sync active' : 'Syncing telemetry'}
            {' · '}
            {effectiveSnapshot?.scopeLabel || (scopeAll ? 'All Maharashtra Network' : hospitalName)}
            {effectiveSnapshot ? (
              <>
                {' · '}
                <span className="font-mono tabular-nums">Updated {effectiveSnapshot.lastUpdatedAt}</span>
              </>
            ) : null}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void openCapacityEditor()}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Update Capacity</span>
        </button>
      </div>

      {error && (
        <div role="alert" className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          {error}
        </div>
      )}

      {loading && !effectiveSnapshot ? (
        <div className="py-8 text-center text-xs text-slate-500">Loading real-time clinical capacity...</div>
      ) : effectiveSnapshot ? (
        <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Column 1: Organ Inventory */}
          <div className="rounded-md border border-slate-200 bg-slate-50/50 p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <HeartPulse className="w-4 h-4 text-teal-700" aria-hidden="true" />
                  <h3 className="text-xs font-semibold text-slate-900">Organ Inventory</h3>
                </div>
                {onNavigateTab && (
                  <button
                    type="button"
                    onClick={() => onNavigateTab('organs')}
                    className="text-[11px] font-medium text-teal-700 hover:underline whitespace-nowrap"
                  >
                    Open Inventory
                  </button>
                )}
              </div>

              <div className="mt-3 flex items-baseline justify-between gap-2">
                <div>
                  <span className="font-mono text-2xl font-semibold tabular-nums text-teal-700">
                    {effectiveSnapshot.organInventory.availableCount}
                  </span>
                  <span className="ml-1.5 text-xs text-slate-600">available</span>
                </div>
                <span className="font-mono text-[11px] tabular-nums text-slate-500">
                  {effectiveSnapshot.organInventory.allocatedCount} allocated ·{' '}
                  {effectiveSnapshot.organInventory.transplantedCount} transplanted
                </span>
              </div>

              {effectiveSnapshot.organInventory.criticalWindowCount > 0 && (
                <div className="mt-2.5 flex items-center gap-1.5 text-xs font-medium text-amber-700">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span className="tabular-nums">
                    {effectiveSnapshot.organInventory.criticalWindowCount}{' '}
                    {effectiveSnapshot.organInventory.criticalWindowCount === 1 ? 'organ' : 'organs'} in critical
                    cold-ischemia window
                  </span>
                </div>
              )}

              <div className="mt-3 pt-3 border-t border-slate-200/80 space-y-1.5">
                {effectiveSnapshot.organInventory.byOrganType.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No active organs in {scopeAll ? 'network' : 'hospital'} cold storage.
                  </p>
                ) : (
                  effectiveSnapshot.organInventory.byOrganType.slice(0, 5).map((item) => (
                    <div key={item.organType} className="flex items-center justify-between text-xs">
                      <span className="text-slate-700">{item.organType}</span>
                      <span className="font-mono tabular-nums text-slate-900">
                        {item.available} avail{item.allocated > 0 ? ` · ${item.allocated} alloc` : ''}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Column 2: Bed Occupancy */}
          <div className="rounded-md border border-slate-200 bg-slate-50/50 p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <BedDouble className="w-4 h-4 text-teal-700" aria-hidden="true" />
                  <h3 className="text-xs font-semibold text-slate-900">Bed Occupancy</h3>
                </div>
                <StatusText value={effectiveSnapshot.bedOccupancy.capacityStatus} />
              </div>

              <div className="mt-3 flex items-baseline justify-between gap-2">
                <div>
                  <span className="font-mono text-2xl font-semibold tabular-nums text-slate-900">
                    {effectiveSnapshot.bedOccupancy.occupiedBeds}/{effectiveSnapshot.bedOccupancy.totalBeds}
                  </span>
                  <span className="ml-1.5 text-xs text-slate-600">occupied</span>
                </div>
                <span className="font-mono text-sm font-semibold tabular-nums text-slate-800">
                  {effectiveSnapshot.bedOccupancy.occupancyRatePct}%
                </span>
              </div>

              <div
                className="mt-2.5 h-2 w-full rounded-sm bg-slate-200 overflow-hidden"
                role="progressbar"
                aria-label="Overall bed occupancy percentage"
                aria-valuenow={effectiveSnapshot.bedOccupancy.occupancyRatePct}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className={`h-full transition-all duration-300 ${occupancyBarColor}`}
                  style={{ width: `${effectiveSnapshot.bedOccupancy.occupancyRatePct}%` }}
                />
              </div>

              <div className="mt-3 pt-3 border-t border-slate-200/80 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-700">ICU Beds</span>
                  <span className="font-mono tabular-nums text-slate-900">
                    {effectiveSnapshot.bedOccupancy.icuOccupied}/{effectiveSnapshot.bedOccupancy.icuTotal}{' '}
                    <span className="text-slate-500">({effectiveSnapshot.bedOccupancy.icuFree} free)</span>
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-700">Isolation Units</span>
                  <span className="font-mono tabular-nums text-slate-900">
                    {effectiveSnapshot.bedOccupancy.isolationOccupied}/{effectiveSnapshot.bedOccupancy.isolationTotal}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-700">Transplant Ward</span>
                  <span className="font-mono tabular-nums text-slate-900">
                    {effectiveSnapshot.bedOccupancy.wardOccupied}/{effectiveSnapshot.bedOccupancy.wardTotal}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Column 3: Surgical Theater Readiness */}
          <div className="rounded-md border border-slate-200 bg-slate-50/50 p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Stethoscope className="w-4 h-4 text-teal-700" aria-hidden="true" />
                  <h3 className="text-xs font-semibold text-slate-900">Surgical Theater Readiness</h3>
                </div>
                <StatusText value={effectiveSnapshot.theaterReadiness.readinessStatus} />
              </div>

              <div className="mt-3 flex items-baseline justify-between gap-2">
                <div>
                  <span className="font-mono text-2xl font-semibold tabular-nums text-slate-900">
                    {effectiveSnapshot.theaterReadiness.theatersReady}/
                    {effectiveSnapshot.theaterReadiness.theatersTotal}
                  </span>
                  <span className="ml-1.5 text-xs text-slate-600">ORs ready</span>
                </div>
                <span className="font-mono text-[11px] tabular-nums text-slate-500">
                  {effectiveSnapshot.theaterReadiness.surgicalTeamsOnCall} teams on call
                </span>
              </div>

              <div className="mt-3 pt-3 border-t border-slate-200/80 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-700">Active / In Use</span>
                  <span className="font-mono tabular-nums text-slate-900">
                    {effectiveSnapshot.theaterReadiness.theatersInUse} ORs
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-700">Turnaround / Sanitizing</span>
                  <span className="font-mono tabular-nums text-slate-900">
                    {effectiveSnapshot.theaterReadiness.theatersSanitizing} ORs
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-700">Availability Window</span>
                  <span className="font-mono tabular-nums text-slate-900">
                    {effectiveSnapshot.theaterReadiness.theatersReady > 0
                      ? 'Immediate'
                      : `~${effectiveSnapshot.theaterReadiness.nextAvailableMinutes} min`}
                  </span>
                </div>
              </div>

              {singleHospitalRecord?.Notes && (
                <p className="mt-2.5 pt-2 border-t border-slate-200/80 text-[11px] text-slate-600 leading-snug">
                  {singleHospitalRecord.Notes}
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title="Update Hospital Resource Capacity"
        subtitle={
          ownResource
            ? `${ownResource.Hospital_Name || hospitalName} · Changes broadcast live to connected coordinators`
            : hospitalName
        }
        maxWidthClass="max-w-xl"
      >
        {ownResource && (
          <form onSubmit={handleSaveCapacity} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="res-icu-occupied" className="block text-xs font-medium text-slate-700 mb-1">
                  ICU Occupied (max {ownResource.ICU_Beds_Total})
                </label>
                <input
                  id="res-icu-occupied"
                  type="number"
                  min={0}
                  max={ownResource.ICU_Beds_Total}
                  value={formState.ICU_Beds_Occupied}
                  onChange={(e) =>
                    setFormState((prev) => ({ ...prev, ICU_Beds_Occupied: Number(e.target.value) || 0 }))
                  }
                  className="w-full px-3 py-2 rounded-md border border-slate-300 font-mono text-xs tabular-nums focus:border-teal-600 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="res-iso-occupied" className="block text-xs font-medium text-slate-700 mb-1">
                  Isolation Occupied (max {ownResource.Isolation_Beds_Total})
                </label>
                <input
                  id="res-iso-occupied"
                  type="number"
                  min={0}
                  max={ownResource.Isolation_Beds_Total}
                  value={formState.Isolation_Beds_Occupied}
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      Isolation_Beds_Occupied: Number(e.target.value) || 0,
                    }))
                  }
                  className="w-full px-3 py-2 rounded-md border border-slate-300 font-mono text-xs tabular-nums focus:border-teal-600 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="res-ward-occupied" className="block text-xs font-medium text-slate-700 mb-1">
                  Ward Occupied (max {ownResource.Ward_Beds_Total})
                </label>
                <input
                  id="res-ward-occupied"
                  type="number"
                  min={0}
                  max={ownResource.Ward_Beds_Total}
                  value={formState.Ward_Beds_Occupied}
                  onChange={(e) =>
                    setFormState((prev) => ({ ...prev, Ward_Beds_Occupied: Number(e.target.value) || 0 }))
                  }
                  className="w-full px-3 py-2 rounded-md border border-slate-300 font-mono text-xs tabular-nums focus:border-teal-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="res-or-ready" className="block text-xs font-medium text-slate-700 mb-1">
                  Theaters Ready (max {ownResource.Theaters_Total})
                </label>
                <input
                  id="res-or-ready"
                  type="number"
                  min={0}
                  max={ownResource.Theaters_Total}
                  value={formState.Theaters_Ready}
                  onChange={(e) => {
                    const nextReady = Math.max(0, Math.min(Number(e.target.value) || 0, ownResource.Theaters_Total));
                    setFormState((prev) => ({
                      ...prev,
                      Theaters_Ready: nextReady,
                      Theaters_In_Use: Math.min(prev.Theaters_In_Use, ownResource.Theaters_Total - nextReady),
                    }));
                  }}
                  className="w-full px-3 py-2 rounded-md border border-slate-300 font-mono text-xs tabular-nums focus:border-teal-600 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="res-or-inuse" className="block text-xs font-medium text-slate-700 mb-1">
                  Theaters In Use (max {ownResource.Theaters_Total - formState.Theaters_Ready})
                </label>
                <input
                  id="res-or-inuse"
                  type="number"
                  min={0}
                  max={Math.max(0, ownResource.Theaters_Total - formState.Theaters_Ready)}
                  value={formState.Theaters_In_Use}
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      Theaters_In_Use: Math.max(
                        0,
                        Math.min(Number(e.target.value) || 0, ownResource.Theaters_Total - prev.Theaters_Ready),
                      ),
                    }))
                  }
                  className="w-full px-3 py-2 rounded-md border border-slate-300 font-mono text-xs tabular-nums focus:border-teal-600 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="res-teams" className="block text-xs font-medium text-slate-700 mb-1">
                  Surgical Teams On Call
                </label>
                <input
                  id="res-teams"
                  type="number"
                  min={0}
                  max={20}
                  value={formState.Surgical_Teams_On_Call}
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      Surgical_Teams_On_Call: Math.max(0, Number(e.target.value) || 0),
                    }))
                  }
                  className="w-full px-3 py-2 rounded-md border border-slate-300 font-mono text-xs tabular-nums focus:border-teal-600 focus:outline-none"
                />
              </div>
            </div>

            {formState.Theaters_Ready === 0 && (
              <div>
                <label htmlFor="res-next-min" className="block text-xs font-medium text-slate-700 mb-1">
                  Estimated Minutes Until Next OR Ready
                </label>
                <input
                  id="res-next-min"
                  type="number"
                  min={5}
                  max={480}
                  value={formState.Next_Theater_Available_Min || 30}
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      Next_Theater_Available_Min: Number(e.target.value) || 30,
                    }))
                  }
                  className="w-full px-3 py-2 rounded-md border border-slate-300 font-mono text-xs tabular-nums focus:border-teal-600 focus:outline-none"
                />
              </div>
            )}

            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-slate-600">
                Sanitizing / Turnaround ORs:{' '}
                <strong className="font-mono tabular-nums text-slate-900">{previewSanitizing}</strong> of{' '}
                <span className="font-mono tabular-nums">{ownResource.Theaters_Total}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 text-slate-600">
                Derived Status: <StatusText value={previewReadiness} />
              </span>
            </div>

            <div>
              <label htmlFor="res-notes" className="block text-xs font-medium text-slate-700 mb-1">
                Coordinator Readiness Note
              </label>
              <input
                id="res-notes"
                type="text"
                value={formState.Notes}
                onChange={(e) => setFormState((prev) => ({ ...prev, Notes: e.target.value }))}
                placeholder="e.g. Standby surgical perfusion team cleared for urgent organ retrieval"
                className="w-full px-3 py-2 rounded-md border border-slate-300 text-xs focus:border-teal-600 focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="px-4 py-2 rounded-md border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-md bg-teal-700 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Resource Status'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </section>
  );
}
