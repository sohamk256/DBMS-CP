import type {
  HospitalResourceRecord,
  OrganRecord,
  OrganType,
  TheaterReadinessStatus,
} from '../types/db';

export interface OrganInventoryBreakdown {
  totalTracked: number;
  availableCount: number;
  allocatedCount: number;
  transplantedCount: number;
  criticalWindowCount: number;
  byOrganType: {
    organType: OrganType;
    available: number;
    allocated: number;
  }[];
}

export interface BedOccupancyMetrics {
  icuTotal: number;
  icuOccupied: number;
  icuFree: number;
  isolationTotal: number;
  isolationOccupied: number;
  wardTotal: number;
  wardOccupied: number;
  totalBeds: number;
  occupiedBeds: number;
  freeBeds: number;
  occupancyRatePct: number;
  icuOccupancyPct: number;
  capacityStatus: 'Nominal' | 'High Load' | 'Critical';
}

export interface TheaterReadinessMetrics {
  theatersTotal: number;
  theatersReady: number;
  theatersInUse: number;
  theatersSanitizing: number;
  surgicalTeamsOnCall: number;
  nextAvailableMinutes: number;
  readinessStatus: TheaterReadinessStatus;
}

export interface ResourceAvailabilitySnapshot {
  scopeLabel: string;
  hospitalCount: number;
  organInventory: OrganInventoryBreakdown;
  bedOccupancy: BedOccupancyMetrics;
  theaterReadiness: TheaterReadinessMetrics;
  lastUpdatedAt: string;
}

const TRACKED_ORGANS: OrganType[] = [
  'Kidney',
  'Liver',
  'Heart',
  'Lung',
  'Pancreas',
  'Cornea',
  'Small Intestine',
];

export function computeOccupancyPct(occupied: number, total: number): number {
  if (total <= 0) return 0;
  const clamped = Math.max(0, Math.min(occupied, total));
  return Math.round((clamped / total) * 100);
}

export function deriveCapacityStatus(occupancyRatePct: number): 'Nominal' | 'High Load' | 'Critical' {
  if (occupancyRatePct >= 90) return 'Critical';
  if (occupancyRatePct >= 75) return 'High Load';
  return 'Nominal';
}

export function deriveTheaterReadinessStatus(params: {
  theatersTotal: number;
  theatersReady: number;
  theatersInUse: number;
  surgicalTeamsOnCall: number;
}): TheaterReadinessStatus {
  if (params.theatersTotal <= 0 || params.surgicalTeamsOnCall <= 0) {
    return 'Standby';
  }
  if (params.theatersReady === 0) {
    return 'Busy';
  }
  if (params.theatersReady === 1 && params.theatersTotal >= 3) {
    return 'Limited';
  }
  if (params.theatersReady / params.theatersTotal <= 0.35) {
    return 'Limited';
  }
  return 'Ready';
}

export function normalizeResourceMutation(
  existing: HospitalResourceRecord,
  patch: Partial<{
    ICU_Beds_Occupied: number;
    Isolation_Beds_Occupied: number;
    Ward_Beds_Occupied: number;
    Theaters_Ready: number;
    Theaters_In_Use: number;
    Theaters_Sanitizing: number;
    Surgical_Teams_On_Call: number;
    Next_Theater_Available_Min: number;
    Notes: string | null;
  }>,
): {
  ICU_Beds_Occupied: number;
  Isolation_Beds_Occupied: number;
  Ward_Beds_Occupied: number;
  Theaters_Ready: number;
  Theaters_In_Use: number;
  Theaters_Sanitizing: number;
  Surgical_Teams_On_Call: number;
  Next_Theater_Available_Min: number;
  Theater_Readiness_Status: TheaterReadinessStatus;
  Notes: string | null;
} {
  const clamp = (val: number, max: number) => Math.max(0, Math.min(Math.round(val), max));

  const icuOcc =
    patch.ICU_Beds_Occupied !== undefined
      ? clamp(patch.ICU_Beds_Occupied, existing.ICU_Beds_Total)
      : existing.ICU_Beds_Occupied;

  const isoOcc =
    patch.Isolation_Beds_Occupied !== undefined
      ? clamp(patch.Isolation_Beds_Occupied, existing.Isolation_Beds_Total)
      : existing.Isolation_Beds_Occupied;

  const wardOcc =
    patch.Ward_Beds_Occupied !== undefined
      ? clamp(patch.Ward_Beds_Occupied, existing.Ward_Beds_Total)
      : existing.Ward_Beds_Occupied;

  const totalTheaters = existing.Theaters_Total;
  let ready =
    patch.Theaters_Ready !== undefined
      ? clamp(patch.Theaters_Ready, totalTheaters)
      : existing.Theaters_Ready;
  let inUse =
    patch.Theaters_In_Use !== undefined
      ? clamp(patch.Theaters_In_Use, totalTheaters)
      : existing.Theaters_In_Use;
  let sanitizing =
    patch.Theaters_Sanitizing !== undefined
      ? clamp(patch.Theaters_Sanitizing, totalTheaters)
      : existing.Theaters_Sanitizing;

  // Keep theater breakdown summing cleanly to Theaters_Total
  if (ready + inUse > totalTheaters) {
    inUse = Math.max(0, totalTheaters - ready);
  }
  sanitizing = Math.max(0, totalTheaters - ready - inUse);

  const teams =
    patch.Surgical_Teams_On_Call !== undefined
      ? Math.max(0, Math.min(20, Math.round(patch.Surgical_Teams_On_Call)))
      : existing.Surgical_Teams_On_Call;

  const readinessStatus = deriveTheaterReadinessStatus({
    theatersTotal: totalTheaters,
    theatersReady: ready,
    theatersInUse: inUse,
    surgicalTeamsOnCall: teams,
  });

  const nextAvailable =
    ready > 0
      ? 0
      : patch.Next_Theater_Available_Min !== undefined
      ? Math.max(5, Math.min(480, Math.round(patch.Next_Theater_Available_Min)))
      : Math.max(15, existing.Next_Theater_Available_Min || 35);

  return {
    ICU_Beds_Occupied: icuOcc,
    Isolation_Beds_Occupied: isoOcc,
    Ward_Beds_Occupied: wardOcc,
    Theaters_Ready: ready,
    Theaters_In_Use: inUse,
    Theaters_Sanitizing: sanitizing,
    Surgical_Teams_On_Call: teams,
    Next_Theater_Available_Min: nextAvailable,
    Theater_Readiness_Status: readinessStatus,
    Notes: patch.Notes !== undefined ? patch.Notes : existing.Notes,
  };
}

export function buildResourceAvailabilitySnapshot(params: {
  resources: HospitalResourceRecord[];
  organs: OrganRecord[];
  scopeLabel: string;
  referenceTimeMs?: number;
}): ResourceAvailabilitySnapshot {
  const { resources, organs, scopeLabel } = params;
  const nowMs = params.referenceTimeMs ?? Date.now();

  let icuTotal = 0;
  let icuOccupied = 0;
  let isolationTotal = 0;
  let isolationOccupied = 0;
  let wardTotal = 0;
  let wardOccupied = 0;

  let theatersTotal = 0;
  let theatersReady = 0;
  let theatersInUse = 0;
  let theatersSanitizing = 0;
  let surgicalTeamsOnCall = 0;
  let minWait = Infinity;
  let latestUpdate = '';

  for (const r of resources) {
    icuTotal += r.ICU_Beds_Total;
    icuOccupied += r.ICU_Beds_Occupied;
    isolationTotal += r.Isolation_Beds_Total;
    isolationOccupied += r.Isolation_Beds_Occupied;
    wardTotal += r.Ward_Beds_Total;
    wardOccupied += r.Ward_Beds_Occupied;

    theatersTotal += r.Theaters_Total;
    theatersReady += r.Theaters_Ready;
    theatersInUse += r.Theaters_In_Use;
    theatersSanitizing += r.Theaters_Sanitizing;
    surgicalTeamsOnCall += r.Surgical_Teams_On_Call;

    if (r.Theaters_Ready === 0 && r.Next_Theater_Available_Min > 0) {
      minWait = Math.min(minWait, r.Next_Theater_Available_Min);
    }
    if (r.Updated_At && r.Updated_At > latestUpdate) {
      latestUpdate = r.Updated_At;
    }
  }

  const totalBeds = icuTotal + isolationTotal + wardTotal;
  const occupiedBeds = icuOccupied + isolationOccupied + wardOccupied;
  const occupancyRatePct = computeOccupancyPct(occupiedBeds, totalBeds);
  const icuOccupancyPct = computeOccupancyPct(icuOccupied, icuTotal);

  const byTypeMap = new Map<OrganType, { available: number; allocated: number }>();
  for (const t of TRACKED_ORGANS) {
    byTypeMap.set(t, { available: 0, allocated: 0 });
  }

  let availableCount = 0;
  let allocatedCount = 0;
  let transplantedCount = 0;
  let criticalWindowCount = 0;

  for (const o of organs) {
    const bucket = byTypeMap.get(o.OrganType);
    if (o.OrganStatus === 'Available') {
      availableCount += 1;
      if (bucket) bucket.available += 1;
      const expiryMs = Date.parse(o.ExpiryTime.replace(' ', 'T'));
      if (Number.isFinite(expiryMs)) {
        const remainingHrs = (expiryMs - nowMs) / 3600000;
        if (remainingHrs > 0 && remainingHrs <= Math.max(2, o.MaxPreservationHours * 0.25)) {
          criticalWindowCount += 1;
        }
      }
    } else if (o.OrganStatus === 'Allocated') {
      allocatedCount += 1;
      if (bucket) bucket.allocated += 1;
    } else if (o.OrganStatus === 'Transplanted') {
      transplantedCount += 1;
    }
  }

  const byOrganType = TRACKED_ORGANS.map((organType) => {
    const entry = byTypeMap.get(organType) ?? { available: 0, allocated: 0 };
    return {
      organType,
      available: entry.available,
      allocated: entry.allocated,
    };
  }).filter((item) => item.available > 0 || item.allocated > 0);

  const readinessStatus = deriveTheaterReadinessStatus({
    theatersTotal,
    theatersReady,
    theatersInUse,
    surgicalTeamsOnCall,
  });

  return {
    scopeLabel,
    hospitalCount: resources.length,
    organInventory: {
      totalTracked: organs.length,
      availableCount,
      allocatedCount,
      transplantedCount,
      criticalWindowCount,
      byOrganType,
    },
    bedOccupancy: {
      icuTotal,
      icuOccupied,
      icuFree: Math.max(0, icuTotal - icuOccupied),
      isolationTotal,
      isolationOccupied,
      wardTotal,
      wardOccupied,
      totalBeds,
      occupiedBeds,
      freeBeds: Math.max(0, totalBeds - occupiedBeds),
      occupancyRatePct,
      icuOccupancyPct,
      capacityStatus: deriveCapacityStatus(occupancyRatePct),
    },
    theaterReadiness: {
      theatersTotal,
      theatersReady,
      theatersInUse,
      theatersSanitizing,
      surgicalTeamsOnCall,
      nextAvailableMinutes: theatersReady > 0 ? 0 : Number.isFinite(minWait) ? minWait : 30,
      readinessStatus,
    },
    lastUpdatedAt: latestUpdate || new Date(nowMs).toISOString().slice(0, 19).replace('T', ' '),
  };
}
