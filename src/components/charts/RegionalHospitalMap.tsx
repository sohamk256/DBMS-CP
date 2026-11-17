import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import {
  Building2,
  Compass,
  LocateFixed,
  Navigation,
  Phone,
  RotateCcw,
  Search,
  ShieldCheck,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  MAHARASHTRA_BOUNDARY_GEOJSON,
  MAHARASHTRA_CITY_HUBS,
  REGIONAL_TRANSIT_CORRIDORS,
  filterMappedHospitals,
  formatEta,
  geolocateHospitalRegistry,
  getMockGeolocationPresets,
  simulateMockGpsPing,
  type CenterTypeFilter,
  type GeolocationOrigin,
  type MappedHospital,
} from '../../utils/regionalGeolocation';
import type { HospitalRecord, OrganRecord, RecipientRecord } from '../../types/db';

interface RegionalHospitalMapProps {
  hospitals: HospitalRecord[];
  organs: OrganRecord[];
  recipients: RecipientRecord[];
  activeHospitalId: number;
  loading?: boolean;
}

interface HoveredPinState {
  item: MappedHospital;
  x: number;
  y: number;
}

const CITY_LABEL_OFFSETS: Record<string, { dx: number; dy: number; shortLabel?: string; anchor?: 'start' | 'end' | 'middle' }> = {
  Mumbai: { dx: 14, dy: -16, anchor: 'start' },
  Pune: { dx: 14, dy: 14, anchor: 'start' },
  Nashik: { dx: -10, dy: -12, anchor: 'end' },
  Nagpur: { dx: 0, dy: -15, anchor: 'middle' },
  Kolhapur: { dx: 12, dy: -4, anchor: 'start' },
  'Chhatrapati Sambhajinagar': { dx: 12, dy: -10, shortLabel: 'C. Sambhajinagar', anchor: 'start' },
  Solapur: { dx: 12, dy: 6, anchor: 'start' },
};

export function RegionalHospitalMap({
  hospitals,
  organs,
  recipients,
  activeHospitalId,
  loading = false,
}: RegionalHospitalMapProps) {
  const presets = useMemo(
    () => getMockGeolocationPresets(hospitals, activeHospitalId),
    [hospitals, activeHospitalId],
  );

  const [origin, setOrigin] = useState<GeolocationOrigin>(() => ({
    id: 'default-mumbai',
    label: 'ZTCC Mumbai Metropolitan Hub',
    city: 'Mumbai',
    lat: MAHARASHTRA_CITY_HUBS.Mumbai.lat,
    lng: MAHARASHTRA_CITY_HUBS.Mumbai.lng,
    source: 'mock-hub',
    accuracyMeters: 25,
  }));

  // Sync default origin once hospitals finish loading
  const initializedOriginRef = useRef(false);
  useEffect(() => {
    if (!initializedOriginRef.current && presets.length > 0) {
      initializedOriginRef.current = true;
      setOrigin(presets[0]);
      setSelectedHospitalId(null);
    }
  }, [presets]);

  const [pingCounter, setPingCounter] = useState(1);
  const [geoStatusNote, setGeoStatusNote] = useState<string>(
    'Mock Maharashtra Geolocation Service active · Deterministic ZTCC coordinates',
  );

  // Filters
  const [centerType, setCenterType] = useState<CenterTypeFilter>('all');
  const [maxDistanceKm, setMaxDistanceKm] = useState<number | null>(null);
  const [cityFilter, setCityFilter] = useState<string>('All Cities');
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedHospitalId, setSelectedHospitalId] = useState<number | null>(null);
  const [hoveredPin, setHoveredPin] = useState<HoveredPinState | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapSvgRef = useRef<SVGSVGElement>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [mapWidth, setMapWidth] = useState(740);

  // Observe container width for crisp responsive D3 geoMercator projection
  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el) return;
    const initial = Math.floor(el.clientWidth);
    if (initial > 240) setMapWidth(initial);

    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 240) {
        setMapWidth(Math.floor(w));
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [loading, hospitals.length]);

  const allMapped = useMemo(
    () => geolocateHospitalRegistry(hospitals, origin, organs, recipients),
    [hospitals, origin, organs, recipients],
  );

  const filteredHospitals = useMemo(
    () =>
      filterMappedHospitals(allMapped, {
        centerType,
        maxDistanceKm,
        cityFilter,
        searchQuery,
      }),
    [allMapped, centerType, maxDistanceKm, cityFilter, searchQuery],
  );

  const availableCities = useMemo(() => {
    const set = new Set(hospitals.map((h) => h.City));
    return ['All Cities', ...Array.from(set).sort()];
  }, [hospitals]);

  // Keep selected hospital valid when filters or origin reset
  useEffect(() => {
    if (filteredHospitals.length === 0) {
      setSelectedHospitalId(null);
      return;
    }
    const stillVisible =
      selectedHospitalId !== null &&
      filteredHospitals.some((m) => m.hospital.Hospital_ID === selectedHospitalId);
    if (!stillVisible) {
      const nearestCertified = filteredHospitals.find(
        (m) => m.distanceKm > 0.5 && m.isCertifiedCenter,
      );
      const firstNonZero = filteredHospitals.find((m) => m.distanceKm > 0.5);
      setSelectedHospitalId(
        (nearestCertified ?? firstNonZero ?? filteredHospitals[0]).hospital.Hospital_ID,
      );
    }
  }, [filteredHospitals, selectedHospitalId]);

  const selectedHospital = useMemo(
    () =>
      filteredHospitals.find((m) => m.hospital.Hospital_ID === selectedHospitalId) ??
      filteredHospitals[0] ??
      null,
    [filteredHospitals, selectedHospitalId],
  );

  const certifiedCount = useMemo(
    () => allMapped.filter((m) => m.isCertifiedCenter).length,
    [allMapped],
  );
  const partnerCount = allMapped.length - certifiedCount;

  // Handlers for Mock Geolocation controls
  const handleOriginPresetChange = (presetId: string) => {
    const match = presets.find((p) => p.id === presetId);
    if (!match) return;
    setOrigin(match);
    setSelectedHospitalId(null);
    setGeoStatusNote(
      match.source === 'hospital-anchor'
        ? `Anchored to ${match.label} (${match.lat.toFixed(4)}°N, ${match.lng.toFixed(4)}°E)`
        : `Simulated hub anchor set to ${match.city} (${match.lat.toFixed(4)}°N, ${match.lng.toFixed(4)}°E)`,
    );
  };

  const handleSimulateGpsPing = () => {
    const nextSeed = pingCounter + 1;
    setPingCounter(nextSeed);
    const simulated = simulateMockGpsPing(origin.city, nextSeed);
    setOrigin(simulated);
    setGeoStatusNote(
      `Mock GPS ping #${nextSeed} locked near ${simulated.city} (±${simulated.accuracyMeters} m)`,
    );
  };

  const handleTryBrowserGeolocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      const fallback = simulateMockGpsPing(origin.city, pingCounter + 1);
      setPingCounter((c) => c + 1);
      setOrigin(fallback);
      setGeoStatusNote('Browser GPS unsupported here — locked to Mock Maharashtra Telemetry.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(5));
        const lng = Number(pos.coords.longitude.toFixed(5));
        // If browser returns coordinates far outside Maharashtra (e.g. cloud container IP), clamp/note or use mock fallback cleanly
        const insideMaharashtra = lat >= 15.5 && lat <= 22.3 && lng >= 72.3 && lng <= 81.2;
        if (insideMaharashtra) {
          setOrigin({
            id: 'browser-gps',
            label: 'Live Browser GPS Fix',
            city: 'Maharashtra Field',
            lat,
            lng,
            source: 'browser-gps',
            accuracyMeters: Math.round(pos.coords.accuracy || 25),
          });
          setGeoStatusNote(`Live Browser GPS fix acquired (${lat}°N, ${lng}°E).`);
        } else {
          const fallback = simulateMockGpsPing(origin.city, pingCounter + 1);
          setPingCounter((c) => c + 1);
          setOrigin(fallback);
          setGeoStatusNote(
            `Device coordinates outside Maharashtra network — snapped to Mock ${fallback.city} GPS.`,
          );
        }
      },
      () => {
        const fallback = simulateMockGpsPing(origin.city, pingCounter + 1);
        setPingCounter((c) => c + 1);
        setOrigin(fallback);
        setGeoStatusNote(
          `Browser location permission unavailable — using Mock ${fallback.city} GPS ping.`,
        );
      },
      { timeout: 3500 },
    );
  };

  const handleZoomControl = (factor: number | 'reset') => {
    const svgEl = mapSvgRef.current;
    const zoomBehavior = zoomBehaviorRef.current;
    if (!svgEl || !zoomBehavior) return;
    const svg = d3.select(svgEl);
    if (factor === 'reset') {
      svg.transition().duration(250).call(zoomBehavior.transform, d3.zoomIdentity);
      setZoomLevel(1);
    } else {
      svg.transition().duration(200).call(zoomBehavior.scaleBy, factor);
    }
  };

  // D3 GeoMercator Render
  useEffect(() => {
    const svgEl = mapSvgRef.current;
    if (!svgEl) return;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    const isCompact = mapWidth < 520;
    const height = isCompact ? 350 : 476;
    const padX = isCompact ? 28 : 48;
    const padY = isCompact ? 30 : 40;

    svg.attr('viewBox', `0 0 ${mapWidth} ${height}`);

    const projection = d3
      .geoMercator()
      .fitExtent(
        [
          [padX, padY],
          [mapWidth - padX, height - padY],
        ],
        MAHARASHTRA_BOUNDARY_GEOJSON as d3.GeoPermissibleObjects,
      );

    const pathGen = d3.geoPath(projection);

    // Clip path for map boundary frame
    const defs = svg.append('defs');
    defs
      .append('clipPath')
      .attr('id', 'mh-map-clip')
      .append('rect')
      .attr('width', mapWidth)
      .attr('height', height);

    const viewport = svg.append('g').attr('clip-path', 'url(#mh-map-clip)');
    const zoomLayer = viewport.append('g').attr('class', 'zoom-layer');

    // Subtle ocean / backdrop rect
    zoomLayer
      .append('rect')
      .attr('width', mapWidth)
      .attr('height', height)
      .attr('fill', '#f8fafc');

    // Lat/Lng Graticule lines
    const graticule = d3.geoGraticule().step([1.5, 1.5]);
    zoomLayer
      .append('path')
      .datum(graticule())
      .attr('d', pathGen)
      .attr('fill', 'none')
      .attr('stroke', '#e2e8f0')
      .attr('stroke-width', 0.75)
      .attr('stroke-dasharray', '2,3');

    // Maharashtra boundary polygon
    zoomLayer
      .append('path')
      .datum(MAHARASHTRA_BOUNDARY_GEOJSON as d3.GeoPermissibleObjects)
      .attr('d', pathGen)
      .attr('fill', '#ffffff')
      .attr('stroke', '#94a3b8')
      .attr('stroke-width', 1.4);

    // Regional express corridors
    const corridorGroup = zoomLayer.append('g').attr('class', 'corridors');
    for (const c of REGIONAL_TRANSIT_CORRIDORS) {
      const fromHub = MAHARASHTRA_CITY_HUBS[c.fromCity];
      const toHub = MAHARASHTRA_CITY_HUBS[c.toCity];
      if (!fromHub || !toHub) continue;
      const p1 = projection([fromHub.lng, fromHub.lat]);
      const p2 = projection([toHub.lng, toHub.lat]);
      if (!p1 || !p2) continue;

      corridorGroup
        .append('line')
        .attr('x1', p1[0])
        .attr('y1', p1[1])
        .attr('x2', p2[0])
        .attr('y2', p2[1])
        .attr('stroke', '#cbd5e1')
        .attr('stroke-width', 1.25)
        .attr('stroke-dasharray', '4,4');
    }

    // Distance rings centered at active Mock Geolocation Origin (50 km, 150 km, 300 km)
    const ringKmList = [50, 150, 300];
    const ringGroup = zoomLayer.append('g').attr('class', 'distance-rings');
    const originProj = projection([origin.lng, origin.lat]);

    for (const rKm of ringKmList) {
      const degRadius = (rKm / 6371) * (180 / Math.PI);
      const circleGeo = d3
        .geoCircle()
        .center([origin.lng, origin.lat])
        .radius(degRadius)();

      const isActiveRadius = maxDistanceKm === rKm;
      ringGroup
        .append('path')
        .datum(circleGeo)
        .attr('d', pathGen)
        .attr('fill', isActiveRadius ? 'rgba(15, 118, 110, 0.04)' : 'none')
        .attr('stroke', isActiveRadius ? '#0f766e' : '#cbd5e1')
        .attr('stroke-width', isActiveRadius ? 1.4 : 0.9)
        .attr('stroke-dasharray', isActiveRadius ? 'none' : '3,3');

      if (originProj) {
        const northPoint = projection([origin.lng, origin.lat + degRadius]);
        if (northPoint && northPoint[1] > 14 && northPoint[1] < height - 10) {
          ringGroup
            .append('text')
            .attr('x', northPoint[0] + 4)
            .attr('y', northPoint[1] + 10)
            .attr('font-family', '"IBM Plex Mono", monospace')
            .attr('font-size', '9.5px')
            .attr('fill', isActiveRadius ? '#0f766e' : '#64748b')
            .text(`${rKm} km`);
        }
      }
    }

    // Green Corridor route arc between Origin and Selected Hospital
    if (selectedHospital && selectedHospital.distanceKm > 0.5 && originProj) {
      const targetProj = projection([selectedHospital.coords.lng, selectedHospital.coords.lat]);
      if (targetProj) {
        const midX = (originProj[0] + targetProj[0]) / 2;
        const midY = (originProj[1] + targetProj[1]) / 2;
        const dx = targetProj[0] - originProj[0];
        const dy = targetProj[1] - originProj[1];
        const distPx = Math.hypot(dx, dy);
        const curveOffset = Math.min(48, distPx * 0.22);
        const normX = distPx > 0 ? -dy / distPx : 0;
        const normY = distPx > 0 ? dx / distPx : -1;
        const ctrlX = midX + normX * curveOffset;
        const ctrlY = midY + normY * curveOffset;

        const arcPath = `M ${originProj[0]} ${originProj[1]} Q ${ctrlX} ${ctrlY} ${targetProj[0]} ${targetProj[1]}`;

        zoomLayer
          .append('path')
          .attr('d', arcPath)
          .attr('fill', 'none')
          .attr('stroke', '#0f766e')
          .attr('stroke-width', 2.2)
          .attr('stroke-dasharray', '6,3');
      }
    }

    // City labels
    const cityLabelGroup = zoomLayer.append('g').attr('class', 'city-labels');
    for (const hub of Object.values(MAHARASHTRA_CITY_HUBS)) {
      const pt = projection([hub.lng, hub.lat]);
      if (!pt) continue;
      const offset = CITY_LABEL_OFFSETS[hub.city] ?? { dx: 8, dy: -8, anchor: 'start' as const };
      cityLabelGroup
        .append('text')
        .attr('x', pt[0] + offset.dx)
        .attr('y', pt[1] + offset.dy)
        .attr('font-family', '"Plus Jakarta Sans", sans-serif')
        .attr('font-size', isCompact ? '9.5px' : '10.5px')
        .attr('font-weight', '600')
        .attr('fill', '#475569')
        .attr('text-anchor', offset.anchor ?? (offset.dx < 0 ? 'end' : 'start'))
        .text(offset.shortLabel || hub.city);
    }

    // Hospital markers (draw retrieval partners first, then certified centers so certified sit on top)
    const orderedPins = [...filteredHospitals].sort((a, b) => {
      const aSelected = a.hospital.Hospital_ID === selectedHospital?.hospital.Hospital_ID ? 1 : 0;
      const bSelected = b.hospital.Hospital_ID === selectedHospital?.hospital.Hospital_ID ? 1 : 0;
      if (aSelected !== bSelected) return aSelected - bSelected;
      return Number(a.isCertifiedCenter) - Number(b.isCertifiedCenter);
    });

    const markersGroup = zoomLayer.append('g').attr('class', 'hospital-markers');

    for (const item of orderedPins) {
      const pt = projection([item.coords.lng, item.coords.lat]);
      if (!pt) continue;

      const isSelected = selectedHospital?.hospital.Hospital_ID === item.hospital.Hospital_ID;
      const isCurrentFacility = item.hospital.Hospital_ID === activeHospitalId;

      const pinG = markersGroup
        .append('g')
        .attr('transform', `translate(${pt[0]}, ${pt[1]})`)
        .attr('cursor', 'pointer')
        .attr('role', 'button')
        .attr('tabindex', 0)
        .attr(
          'aria-label',
          `${item.hospital.Hospital_Name} (${item.hospital.City}) - ${item.distanceKm} km`,
        );

      if (isSelected) {
        pinG
          .append('circle')
          .attr('r', item.isCertifiedCenter ? 13 : 11)
          .attr('fill', 'rgba(15, 118, 110, 0.14)')
          .attr('stroke', '#0f766e')
          .attr('stroke-width', 1.5);
      }

      if (item.isCertifiedCenter) {
        // Distinct square-diamond clinical marker for ZTCC Certified Transplant Centers
        pinG
          .append('rect')
          .attr('x', -6.5)
          .attr('y', -6.5)
          .attr('width', 13)
          .attr('height', 13)
          .attr('rx', 2.5)
          .attr('transform', 'rotate(45)')
          .attr('fill', '#0f766e')
          .attr('stroke', '#ffffff')
          .attr('stroke-width', 1.8);
      } else {
        // Circular marker for Retrieval Partner Hospitals
        pinG
          .append('circle')
          .attr('r', 5.2)
          .attr('fill', isCurrentFacility ? '#0284c7' : '#475569')
          .attr('stroke', '#ffffff')
          .attr('stroke-width', 1.5);
      }

      // Small indicator ring if facility has available organs waiting for match
      if (item.availableOrgansCount > 0) {
        pinG
          .append('circle')
          .attr('cx', 6.5)
          .attr('cy', -6.5)
          .attr('r', 3.5)
          .attr('fill', '#d97706')
          .attr('stroke', '#ffffff')
          .attr('stroke-width', 1);
      }

      pinG
        .on('click', () => {
          setSelectedHospitalId(item.hospital.Hospital_ID);
        })
        .on('keydown', (event: KeyboardEvent) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setSelectedHospitalId(item.hospital.Hospital_ID);
          }
        })
        .on('mouseenter', (event: MouseEvent) => {
          const rect = mapContainerRef.current?.getBoundingClientRect();
          if (rect) {
            setHoveredPin({
              item,
              x: event.clientX - rect.left,
              y: event.clientY - rect.top,
            });
          }
        })
        .on('mousemove', (event: MouseEvent) => {
          const rect = mapContainerRef.current?.getBoundingClientRect();
          if (rect) {
            setHoveredPin({
              item,
              x: event.clientX - rect.left,
              y: event.clientY - rect.top,
            });
          }
        })
        .on('mouseleave', () => {
          setHoveredPin(null);
        });
    }

    // Mock Geolocation Origin Beacon (crosshair reticle — no decorative pulse)
    if (originProj) {
      const originG = zoomLayer
        .append('g')
        .attr('transform', `translate(${originProj[0]}, ${originProj[1]})`)
        .attr('pointer-events', 'none');

      originG
        .append('circle')
        .attr('r', 11)
        .attr('fill', 'none')
        .attr('stroke', '#dc2626')
        .attr('stroke-width', 1.6);

      originG
        .append('circle')
        .attr('r', 3.2)
        .attr('fill', '#dc2626')
        .attr('stroke', '#ffffff')
        .attr('stroke-width', 1);

      // Crosshair ticks
      const ticks: [number, number, number, number][] = [
        [0, -15, 0, -8],
        [0, 8, 0, 15],
        [-15, 0, -8, 0],
        [8, 0, 15, 0],
      ];
      for (const [x1, y1, x2, y2] of ticks) {
        originG
          .append('line')
          .attr('x1', x1)
          .attr('y1', y1)
          .attr('x2', x2)
          .attr('y2', y2)
          .attr('stroke', '#dc2626')
          .attr('stroke-width', 1.6);
      }
    }

    // D3 Zoom & Pan
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 6])
      .translateExtent([
        [0, 0],
        [mapWidth, height],
      ])
      .on('zoom', (event) => {
        zoomLayer.attr('transform', event.transform.toString());
        setZoomLevel(Number(event.transform.k.toFixed(1)));
      });

    zoomBehaviorRef.current = zoom;
    svg.call(zoom);
  }, [mapWidth, origin, filteredHospitals, selectedHospital, maxDistanceKm, activeHospitalId]);

  return (
    <div className="space-y-6 pb-16">
      {/* Mock Geolocation Telemetry & Filter Control Bar */}
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900">
              Regional Transplant Center &amp; Hospital Network Map
            </h1>
            <p className="mt-0.5 text-xs text-slate-500">
              {geoStatusNote}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-slate-600 tabular-nums">
            <span>
              Origin: <strong className="text-slate-900">{origin.lat.toFixed(4)}°N, {origin.lng.toFixed(4)}°E</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>Accuracy ±{origin.accuracyMeters} m</span>
          </div>
        </div>

        {/* Mock Geolocation & Filter Controls */}
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
          <div className="lg:col-span-4">
            <label htmlFor="geo-origin-select" className="block text-[11px] font-semibold text-slate-600 mb-1">
              Mock Geolocation Origin
            </label>
            <select
              id="geo-origin-select"
              value={presets.some((p) => p.id === origin.id) ? origin.id : ''}
              onChange={(e) => handleOriginPresetChange(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-teal-600 focus:outline-none"
            >
              {!presets.some((p) => p.id === origin.id) && (
                <option value="">{origin.label}</option>
              )}
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSimulateGpsPing}
              className="inline-flex items-center gap-1.5 rounded-md border border-teal-700 bg-teal-700 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-800 whitespace-nowrap"
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Simulate GPS Ping</span>
            </button>
            <button
              type="button"
              onClick={handleTryBrowserGeolocation}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              <LocateFixed className="w-3.5 h-3.5" />
              <span>Use Device GPS</span>
            </button>
          </div>

          <div className="lg:col-span-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                aria-label="Search mapped hospitals"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search hospital or license..."
                className="w-full rounded-md border border-slate-300 pl-8 pr-2.5 py-2 text-xs focus:border-teal-600 focus:outline-none"
              />
            </div>
            <select
              aria-label="Filter by city"
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-700 focus:border-teal-600 focus:outline-none"
            >
              {availableCities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Segmented Center Type & Radius Filters */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-md">
            {(
              [
                { id: 'all', label: `All Facilities (${allMapped.length})` },
                { id: 'certified', label: `Active Transplant Centers (${certifiedCount})` },
                { id: 'partner', label: `Retrieval Partners (${partnerCount})` },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setCenterType(opt.id)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                  centerType === opt.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-500 mr-1">Radius:</span>
            {([null, 50, 150, 300] as const).map((km) => (
              <button
                key={String(km)}
                type="button"
                onClick={() => setMaxDistanceKm(km)}
                className={`px-2.5 py-1 rounded border text-xs font-mono tabular-nums transition-colors whitespace-nowrap ${
                  maxDistanceKm === km
                    ? 'border-teal-700 bg-teal-50 text-teal-800 font-semibold'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                {km === null ? 'All Regions' : `≤ ${km} km`}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Main 12-Col Spatial Canvas & Facility Directory */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left: D3 Maharashtra Geo-Map */}
        <section className="xl:col-span-7 rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                  <rect x="3" y="3" width="6" height="6" rx="1" transform="rotate(45 6 6)" fill="#0f766e" />
                </svg>
                <span>Certified Transplant Center</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                  <circle cx="5" cy="5" r="4" fill="#475569" />
                </svg>
                <span>Retrieval Partner</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                  <circle cx="6" cy="6" r="4.5" fill="none" stroke="#dc2626" strokeWidth="1.5" />
                  <circle cx="6" cy="6" r="1.8" fill="#dc2626" />
                </svg>
                <span>Origin Beacon</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                  <circle cx="5" cy="5" r="3.5" fill="#d97706" />
                </svg>
                <span>Available Organ</span>
              </span>
            </div>

            <div className="flex items-center gap-1">
              <span className="mr-1.5 font-mono text-[11px] text-slate-500 tabular-nums">
                {zoomLevel.toFixed(1)}x
              </span>
              <button
                type="button"
                aria-label="Zoom in map"
                onClick={() => handleZoomControl(1.4)}
                className="p-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                aria-label="Zoom out map"
                onClick={() => handleZoomControl(0.72)}
                className="p-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                aria-label="Reset map view"
                onClick={() => handleZoomControl('reset')}
                className="p-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div
            ref={mapContainerRef}
            className="relative mt-3 w-full overflow-hidden rounded-md border border-slate-200 bg-slate-50"
          >
            <svg
              ref={mapSvgRef}
              data-testid="d3-hospital-map"
              className="block w-full h-auto select-none"
              role="img"
              aria-label="Interactive regional map of registered Maharashtra hospitals and active transplant centers"
            />

            {selectedHospital && selectedHospital.distanceKm > 0.5 && (
              <div className="pointer-events-none absolute top-3 left-3 z-10 max-w-[calc(100%-24px)] truncate rounded bg-slate-900/90 px-2.5 py-1 font-mono text-[11px] font-semibold text-white tabular-nums">
                Corridor: {selectedHospital.hospital.City} · {selectedHospital.distanceKm} km ·{' '}
                {formatEta(selectedHospital.transport.greenCorridorMinutes)}
              </div>
            )}

            {hoveredPin && (
              <div
                className="pointer-events-none absolute z-10 w-60 rounded-md border border-slate-200 bg-slate-900 px-3 py-2.5 text-xs text-white shadow-lg"
                style={{
                  left: Math.min(Math.max(8, hoveredPin.x + 12), Math.max(8, mapWidth - 252)),
                  top: Math.max(8, hoveredPin.y - 76),
                }}
              >
                <p className="font-semibold leading-snug text-white">
                  {hoveredPin.item.hospital.Hospital_Name}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-300">
                  {hoveredPin.item.hospital.City} ·{' '}
                  {hoveredPin.item.isCertifiedCenter
                    ? 'Certified Transplant Center'
                    : 'Retrieval Partner'}
                </p>
                <div className="mt-1.5 flex items-center justify-between border-t border-slate-700 pt-1.5 font-mono text-[11px] tabular-nums">
                  <span>{hoveredPin.item.distanceKm} km</span>
                  <span className="text-emerald-300">
                    Corridor {formatEta(hoveredPin.item.transport.greenCorridorMinutes)}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
            <span>
              Showing <strong className="font-mono text-slate-900 tabular-nums">{filteredHospitals.length}</strong> of{' '}
              <span className="font-mono tabular-nums">{allMapped.length}</span> registered facilities · Drag to pan or use zoom buttons
            </span>
            <span className="font-mono tabular-nums">Projection: D3 geoMercator (Maharashtra)</span>
          </div>
        </section>

        {/* Right: Selected Facility Inspector + Ranked Distance List */}
        <aside className="xl:col-span-5 space-y-5">
          {/* Selected Facility Detail Inspector */}
          <section className="rounded-lg border border-slate-200 bg-white p-5">
            {selectedHospital ? (
              <div>
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                  <div>
                    <p className="text-[11px] font-semibold text-teal-700">
                      {selectedHospital.isCertifiedCenter
                        ? 'ZTCC Certified Transplant Center'
                        : 'Registered Retrieval Partner'}
                    </p>
                    <h2 className="mt-0.5 text-base font-bold text-slate-900 leading-snug">
                      {selectedHospital.hospital.Hospital_Name}
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">
                      {selectedHospital.hospital.City}, {selectedHospital.hospital.State} ·{' '}
                      {selectedHospital.hospital.Hospital_Type} ·{' '}
                      <span className="font-mono">{selectedHospital.hospital.License_Number}</span>
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono text-lg font-bold text-slate-900 tabular-nums">
                      {selectedHospital.distanceKm} km
                    </p>
                    <p className="text-[11px] text-slate-500">from origin</p>
                  </div>
                </div>

                {/* Organ Transport ETA Matrix */}
                <div className="mt-4 grid grid-cols-3 gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <p className="text-[11px] text-slate-500">Green Corridor</p>
                    <p className="mt-0.5 font-mono text-sm font-semibold text-teal-700 tabular-nums">
                      {formatEta(selectedHospital.transport.greenCorridorMinutes)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500">Standard Road</p>
                    <p className="mt-0.5 font-mono text-sm font-semibold text-slate-900 tabular-nums">
                      {formatEta(selectedHospital.transport.roadMinutes)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500">Air Charter</p>
                    <p className="mt-0.5 font-mono text-sm font-semibold text-slate-900 tabular-nums">
                      {selectedHospital.distanceKm >= 40
                        ? formatEta(selectedHospital.transport.airMinutes)
                        : 'Road Pref.'}
                    </p>
                  </div>
                </div>

                {/* Facility Live Capacity & Contact */}
                <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-slate-500">Available Organs</p>
                    <p className="mt-0.5 font-mono text-sm font-semibold text-slate-900 tabular-nums">
                      {selectedHospital.availableOrgansCount} ready
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Active Waitlist</p>
                    <p className="mt-0.5 font-mono text-sm font-semibold text-slate-900 tabular-nums">
                      {selectedHospital.waitingRecipientsCount} waiting
                    </p>
                  </div>
                  <div className="col-span-2 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs text-slate-600">
                    <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      {selectedHospital.hospital.Contact_Number}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                      {selectedHospital.coords.lat.toFixed(4)}°N, {selectedHospital.coords.lng.toFixed(4)}°E
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-6 text-center">
                <p className="text-xs font-semibold text-slate-800">No hospitals match the active filter</p>
                <p className="mt-1 text-xs text-slate-500">
                  Widen the radius filter or reset city/certification toggles to view facilities.
                </p>
              </div>
            )}
          </section>

          {/* Ranked Nearby Hospitals Directory */}
          <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <div className="flex items-center gap-2">
                <Navigation className="w-4 h-4 text-teal-700" />
                <h3 className="text-sm font-semibold text-slate-900">
                  Nearby Facilities by Distance
                </h3>
              </div>
              <span className="font-mono text-xs text-slate-500 tabular-nums">
                {filteredHospitals.length} listed
              </span>
            </div>

            {filteredHospitals.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-xs text-slate-500 mb-3">
                  No registered hospitals found within this radius or filter.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setCenterType('all');
                    setMaxDistanceKm(null);
                    setCityFilter('All Cities');
                    setSearchQuery('');
                  }}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Reset Map Filters
                </button>
              </div>
            ) : (
              <div className="max-h-[340px] overflow-y-auto divide-y divide-slate-100">
                {filteredHospitals.map((item, idx) => {
                  const isSelected = selectedHospital?.hospital.Hospital_ID === item.hospital.Hospital_ID;
                  const isSelf = item.hospital.Hospital_ID === activeHospitalId;
                  return (
                    <button
                      key={item.hospital.Hospital_ID}
                      type="button"
                      onClick={() => setSelectedHospitalId(item.hospital.Hospital_ID)}
                      className={`w-full text-left px-5 py-3 transition-colors flex items-center justify-between gap-3 ${
                        isSelected ? 'bg-teal-50/70' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[11px] font-semibold text-slate-400 tabular-nums">
                            #{idx + 1}
                          </span>
                          {item.isCertifiedCenter ? (
                            <ShieldCheck className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                          ) : (
                            <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          )}
                          <p className="text-xs font-semibold text-slate-900 truncate">
                            {item.hospital.Hospital_Name}
                          </p>
                        </div>
                        <p className="mt-0.5 text-[11px] text-slate-500 truncate">
                          {item.hospital.City} · {item.isCertifiedCenter ? 'Transplant Center' : 'Retrieval Partner'}
                          {isSelf ? ' · Active Session' : ''}
                          {item.availableOrgansCount > 0 ? ` · ${item.availableOrgansCount} organ(s)` : ''}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-mono text-xs font-semibold text-slate-900 tabular-nums">
                          {item.distanceKm} km
                        </p>
                        <p className="font-mono text-[11px] text-teal-700 tabular-nums">
                          {formatEta(item.transport.greenCorridorMinutes)}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
