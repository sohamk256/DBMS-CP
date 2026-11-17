import type { HospitalRecord, OrganRecord, RecipientRecord } from '../types/db';

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface GeolocationOrigin {
  id: string;
  label: string;
  city: string;
  lat: number;
  lng: number;
  source: 'hospital-anchor' | 'mock-hub' | 'simulated-gps' | 'browser-gps';
  accuracyMeters: number;
}

export interface TransportEstimate {
  roadMinutes: number;
  greenCorridorMinutes: number;
  airMinutes: number;
}

export interface MappedHospital {
  hospital: HospitalRecord;
  coords: GeoPoint;
  distanceKm: number;
  transport: TransportEstimate;
  isCertifiedCenter: boolean;
  availableOrgansCount: number;
  waitingRecipientsCount: number;
}

export type CenterTypeFilter = 'all' | 'certified' | 'partner';

export interface CityHubMeta {
  city: string;
  lat: number;
  lng: number;
  zoneLabel: string;
}

export const MAHARASHTRA_CITY_HUBS: Record<string, CityHubMeta> = {
  Mumbai: {
    city: 'Mumbai',
    lat: 19.076,
    lng: 72.8777,
    zoneLabel: 'ZTCC Mumbai Metropolitan Hub',
  },
  Pune: {
    city: 'Pune',
    lat: 18.5204,
    lng: 73.8567,
    zoneLabel: 'ZTCC Pune Western Corridor',
  },
  Nashik: {
    city: 'Nashik',
    lat: 19.9975,
    lng: 73.7898,
    zoneLabel: 'North Maharashtra Retrieval Hub',
  },
  Nagpur: {
    city: 'Nagpur',
    lat: 21.1458,
    lng: 79.0882,
    zoneLabel: 'ZTCC Vidarbha Regional Hub',
  },
  Kolhapur: {
    city: 'Kolhapur',
    lat: 16.705,
    lng: 74.2433,
    zoneLabel: 'South Maharashtra Medical Hub',
  },
  'Chhatrapati Sambhajinagar': {
    city: 'Chhatrapati Sambhajinagar',
    lat: 19.8762,
    lng: 75.3433,
    zoneLabel: 'ZTCC Marathwada Hub',
  },
  Solapur: {
    city: 'Solapur',
    lat: 17.6599,
    lng: 75.9064,
    zoneLabel: 'Solapur Retrieval Sector',
  },
};

// Simplified geographic outline of Maharashtra state (GeoJSON Feature) for D3 geoMercator projection.
export const MAHARASHTRA_BOUNDARY_GEOJSON = {
  type: 'Feature' as const,
  properties: { name: 'Maharashtra' },
  geometry: {
    type: 'Polygon' as const,
    coordinates: [
      [
        [72.65, 20.12],
        [73.35, 20.92],
        [73.85, 21.62],
        [74.45, 21.95],
        [75.45, 21.45],
        [76.85, 21.52],
        [77.82, 21.48],
        [79.15, 21.65],
        [80.42, 21.48],
        [80.75, 20.68],
        [80.52, 19.65],
        [80.02, 18.75],
        [78.92, 19.45],
        [77.85, 19.42],
        [77.45, 18.75],
        [76.85, 18.12],
        [76.12, 17.35],
        [75.15, 17.05],
        [74.42, 16.42],
        [73.85, 15.82],
        [73.55, 16.05],
        [73.32, 16.85],
        [73.12, 17.75],
        [72.88, 18.55],
        [72.76, 19.05],
        [72.68, 19.65],
        [72.65, 20.12],
      ],
    ],
  },
};

export interface CorridorRouteLine {
  id: string;
  label: string;
  fromCity: string;
  toCity: string;
}

export const REGIONAL_TRANSIT_CORRIDORS: CorridorRouteLine[] = [
  { id: 'mum-pun', label: 'Mumbai–Pune Express Corridor', fromCity: 'Mumbai', toCity: 'Pune' },
  { id: 'mum-nas', label: 'Mumbai–Nashik Corridor', fromCity: 'Mumbai', toCity: 'Nashik' },
  { id: 'nas-aur', label: 'Samruddhi West Segment', fromCity: 'Nashik', toCity: 'Chhatrapati Sambhajinagar' },
  { id: 'aur-nag', label: 'Samruddhi East Express Corridor', fromCity: 'Chhatrapati Sambhajinagar', toCity: 'Nagpur' },
  { id: 'pun-sol', label: 'Pune–Solapur Corridor', fromCity: 'Pune', toCity: 'Solapur' },
  { id: 'pun-kol', label: 'Pune–Kolhapur Corridor', fromCity: 'Pune', toCity: 'Kolhapur' },
];

// Deterministic local offsets (in degrees) so multiple hospitals in the same city plot as distinct markers
const LOCAL_SPREAD_OFFSETS: readonly [number, number][] = [
  [0.0, 0.0],
  [0.026, -0.022],
  [-0.024, 0.025],
  [0.032, 0.028],
  [-0.031, -0.024],
  [0.044, -0.008],
  [-0.015, 0.042],
  [0.014, -0.041],
  [-0.043, 0.006],
];

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * Resolves deterministic coordinates for a hospital inside Maharashtra.
 * Certified centers stay close to city centroids, while sibling hospitals
 * receive a deterministic neighborhood spread so pins remain clickable.
 */
export function resolveHospitalCoordinates(
  hospital: Pick<HospitalRecord, 'Hospital_ID' | 'City' | 'Transplant_Center_Certified'>,
  citySlotIndex = 0,
): GeoPoint {
  const normalizedCity = hospital.City.trim();
  const hub = MAHARASHTRA_CITY_HUBS[normalizedCity];

  if (hub) {
    if (citySlotIndex === 0) {
      return { lat: hub.lat, lng: hub.lng };
    }
    const offset = LOCAL_SPREAD_OFFSETS[citySlotIndex % LOCAL_SPREAD_OFFSETS.length];
    const ringMultiplier = 1 + Math.floor(citySlotIndex / LOCAL_SPREAD_OFFSETS.length) * 0.45;
    return {
      lat: Number((hub.lat + offset[0] * ringMultiplier).toFixed(5)),
      lng: Number((hub.lng + offset[1] * ringMultiplier).toFixed(5)),
    };
  }

  // Deterministic fallback inside central Maharashtra bounds for any newly registered city
  const h = hashString(`${hospital.Hospital_ID}-${normalizedCity}`);
  const lat = 17.4 + (h % 320) / 100; // 17.40 .. 20.59
  const lng = 73.2 + ((h >> 8) % 520) / 100; // 73.20 .. 78.39
  return {
    lat: Number(lat.toFixed(5)),
    lng: Number(lng.toFixed(5)),
  };
}

export function haversineDistanceKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371; // Earth mean radius in km
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return Number((R * c).toFixed(1));
}

export function estimateTransportTimes(distanceKm: number): TransportEstimate {
  if (distanceKm <= 0.5) {
    return { roadMinutes: 4, greenCorridorMinutes: 2, airMinutes: 0 };
  }
  const roadKm = distanceKm * 1.24; // road winding factor
  const roadMinutes = Math.max(5, Math.round((roadKm / 42) * 60));
  const greenCorridorMinutes = Math.max(3, Math.round((roadKm / 78) * 60));
  const airMinutes = distanceKm >= 60 ? Math.round((distanceKm / 260) * 60 + 22) : Math.max(12, Math.round((distanceKm / 190) * 60 + 10));
  return {
    roadMinutes,
    greenCorridorMinutes,
    airMinutes,
  };
}

export function getMockGeolocationPresets(
  hospitals: HospitalRecord[],
  activeHospitalId?: number | null,
): GeolocationOrigin[] {
  const presets: GeolocationOrigin[] = [];

  if (activeHospitalId) {
    const active = hospitals.find((h) => h.Hospital_ID === activeHospitalId);
    if (active) {
      const coords = resolveHospitalCoordinates(active, 0);
      presets.push({
        id: `hospital-${active.Hospital_ID}`,
        label: `${active.Hospital_Name} (Current Facility)`,
        city: active.City,
        lat: coords.lat,
        lng: coords.lng,
        source: 'hospital-anchor',
        accuracyMeters: 18,
      });
    }
  }

  for (const hub of Object.values(MAHARASHTRA_CITY_HUBS)) {
    presets.push({
      id: `hub-${hub.city.toLowerCase().replace(/\s+/g, '-')}`,
      label: hub.zoneLabel,
      city: hub.city,
      lat: hub.lat,
      lng: hub.lng,
      source: 'mock-hub',
      accuracyMeters: 35,
    });
  }

  return presets;
}

/**
 * Generates a realistic mock GPS jitter near a chosen city hub, simulating live mobile/ambulance telemetry.
 */
export function simulateMockGpsPing(baseHubCity: string, seed = 1): GeolocationOrigin {
  const hub = MAHARASHTRA_CITY_HUBS[baseHubCity] || MAHARASHTRA_CITY_HUBS.Mumbai;
  const angle = ((seed * 137.5) % 360) * (Math.PI / 180);
  const radiusDeg = 0.015 + ((seed % 5) * 0.006);
  return {
    id: `sim-gps-${seed}`,
    label: `Simulated Field GPS (${hub.city} Sector)`,
    city: hub.city,
    lat: Number((hub.lat + Math.sin(angle) * radiusDeg).toFixed(5)),
    lng: Number((hub.lng + Math.cos(angle) * radiusDeg).toFixed(5)),
    source: 'simulated-gps',
    accuracyMeters: 12 + (seed % 15),
  };
}

export function geolocateHospitalRegistry(
  hospitals: HospitalRecord[],
  origin: GeoPoint,
  organs: OrganRecord[] = [],
  recipients: RecipientRecord[] = [],
): MappedHospital[] {
  const cityCounts = new Map<string, number>();

  const availableByHospital = new Map<number, number>();
  for (const o of organs) {
    if (o.OrganStatus === 'Available') {
      availableByHospital.set(
        o.RetrievalHospitalID,
        (availableByHospital.get(o.RetrievalHospitalID) ?? 0) + 1,
      );
    }
  }

  const waitingByHospital = new Map<number, number>();
  for (const r of recipients) {
    if (r.RecipientStatus === 'Waiting') {
      waitingByHospital.set(
        r.RegisteringHospitalID,
        (waitingByHospital.get(r.RegisteringHospitalID) ?? 0) + 1,
      );
    }
  }

  const sortedForDeterministicSlots = [...hospitals].sort((a, b) => {
    if (b.Transplant_Center_Certified !== a.Transplant_Center_Certified) {
      return b.Transplant_Center_Certified - a.Transplant_Center_Certified;
    }
    return a.Hospital_ID - b.Hospital_ID;
  });

  const mapped: MappedHospital[] = sortedForDeterministicSlots.map((hospital) => {
    const cityKey = hospital.City.trim();
    const slot = cityCounts.get(cityKey) ?? 0;
    cityCounts.set(cityKey, slot + 1);

    const coords = resolveHospitalCoordinates(hospital, slot);
    const distanceKm = haversineDistanceKm(origin, coords);
    const transport = estimateTransportTimes(distanceKm);

    return {
      hospital,
      coords,
      distanceKm,
      transport,
      isCertifiedCenter: hospital.Transplant_Center_Certified === 1,
      availableOrgansCount: availableByHospital.get(hospital.Hospital_ID) ?? 0,
      waitingRecipientsCount: waitingByHospital.get(hospital.Hospital_ID) ?? 0,
    };
  });

  return mapped.sort((a, b) => {
    if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
    return a.hospital.Hospital_ID - b.hospital.Hospital_ID;
  });
}

export function filterMappedHospitals(
  items: MappedHospital[],
  options: {
    centerType: CenterTypeFilter;
    maxDistanceKm: number | null;
    searchQuery?: string;
    cityFilter?: string;
  },
): MappedHospital[] {
  const query = (options.searchQuery ?? '').trim().toLowerCase();
  const cityFilter = options.cityFilter && options.cityFilter !== 'All Cities' ? options.cityFilter : null;

  return items.filter((item) => {
    if (options.centerType === 'certified' && !item.isCertifiedCenter) return false;
    if (options.centerType === 'partner' && item.isCertifiedCenter) return false;
    if (options.maxDistanceKm !== null && item.distanceKm > options.maxDistanceKm) return false;
    if (cityFilter && item.hospital.City !== cityFilter) return false;
    if (query) {
      const hay = `${item.hospital.Hospital_Name} ${item.hospital.City} ${item.hospital.License_Number}`.toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  });
}

export function formatEta(minutes: number): string {
  if (minutes <= 0) return 'N/A';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
