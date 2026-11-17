import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import {
  getTimelineForRegion,
  summarizeRegionalMetrics,
} from '../../utils/regionalAnalytics';
import type { RegionalTrendPoint, RegionalTrendsResponse } from '../../types/db';

interface RegionalDonationD3ChartProps {
  data: RegionalTrendsResponse | null;
  loading?: boolean;
}

interface HoveredMonthState {
  point: RegionalTrendPoint;
  x: number;
  y: number;
}

export function RegionalDonationD3Chart({ data, loading }: RegionalDonationD3ChartProps) {
  const [selectedCity, setSelectedCity] = useState<string>('All Regions');
  const [hoveredMonth, setHoveredMonth] = useState<HoveredMonthState | null>(null);
  const [hoveredCity, setHoveredCity] = useState<string | null>(null);

  const timelineContainerRef = useRef<HTMLDivElement>(null);
  const timelineSvgRef = useRef<SVGSVGElement>(null);
  const regionalContainerRef = useRef<HTMLDivElement>(null);
  const regionalSvgRef = useRef<SVGSVGElement>(null);

  const [timelineWidth, setTimelineWidth] = useState(720);
  const [regionalWidth, setRegionalWidth] = useState(420);

  useEffect(() => {
    const observers: ResizeObserver[] = [];

    if (timelineContainerRef.current) {
      const initialW = Math.floor(timelineContainerRef.current.clientWidth);
      if (initialW > 240) setTimelineWidth(initialW);
      const obs = new ResizeObserver((entries) => {
        const w = entries[0]?.contentRect.width;
        if (w && w > 240) setTimelineWidth(Math.floor(w));
      });
      obs.observe(timelineContainerRef.current);
      observers.push(obs);
    }

    if (regionalContainerRef.current) {
      const initialW = Math.floor(regionalContainerRef.current.clientWidth);
      if (initialW > 200) setRegionalWidth(initialW);
      const obs = new ResizeObserver((entries) => {
        const w = entries[0]?.contentRect.width;
        if (w && w > 200) setRegionalWidth(Math.floor(w));
      });
      obs.observe(regionalContainerRef.current);
      observers.push(obs);
    }

    return () => {
      observers.forEach((o) => o.disconnect());
    };
  }, [loading, data]);

  const timeline = useMemo(
    () => getTimelineForRegion(data, selectedCity),
    [data, selectedCity],
  );

  const metricsSummary = useMemo(
    () => summarizeRegionalMetrics(data?.regionalSummary ?? [], selectedCity),
    [data, selectedCity],
  );

  const cities = useMemo(
    () => ['All Regions', ...(data?.regionalSummary.map((r) => r.city) ?? [])],
    [data],
  );

  // Render Temporal D3 Dual-Axis Chart (Grouped Bars + Success Rate Curve)
  useEffect(() => {
    const svgEl = timelineSvgRef.current;
    if (!svgEl || timeline.length === 0) return;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    const isCompact = timelineWidth < 480;
    const height = isCompact ? 324 : 310;
    const margin = { top: 20, right: 44, bottom: isCompact ? 52 : 38, left: 36 };
    const innerWidth = Math.max(200, timelineWidth - margin.left - margin.right);
    const innerHeight = height - margin.top - margin.bottom;

    svg.attr('viewBox', `0 0 ${timelineWidth} ${height}`);

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const x0 = d3
      .scaleBand<string>()
      .domain(timeline.map((d) => d.label))
      .range([0, innerWidth])
      .paddingInner(0.24)
      .paddingOuter(0.12);

    const seriesKeys = ['donorsRegistered', 'organsRetrieved', 'successfulTransplants'] as const;
    const x1 = d3
      .scaleBand<string>()
      .domain(seriesKeys)
      .range([0, x0.bandwidth()])
      .padding(0.12);

    const maxCount = Math.max(
      4,
      d3.max(timeline, (d) =>
        Math.max(d.donorsRegistered, d.organsRetrieved, d.allocationsTotal, d.successfulTransplants),
      ) ?? 4,
    );

    const yCount = d3.scaleLinear().domain([0, maxCount * 1.15]).nice().range([innerHeight, 0]);
    const yRate = d3.scaleLinear().domain([0, 100]).range([innerHeight, 0]);

    // Subtle horizontal gridlines
    g.append('g')
      .attr('class', 'd3-grid')
      .call(
        d3
          .axisLeft(yCount)
          .ticks(5)
          .tickSize(-innerWidth)
          .tickFormat(() => ''),
      )
      .call((grid) => {
        grid.select('.domain').remove();
        grid.selectAll('line').attr('stroke', '#e2e8f0').attr('stroke-dasharray', '2,2');
      });

    // Area under success rate line
    const areaGen = d3
      .area<RegionalTrendPoint>()
      .x((d) => (x0(d.label) ?? 0) + x0.bandwidth() / 2)
      .y0(innerHeight)
      .y1((d) => yRate(d.successRate))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(timeline)
      .attr('fill', '#0f766e')
      .attr('fill-opacity', 0.08)
      .attr('d', areaGen);

    // Grouped Bars
    const colorMap: Record<(typeof seriesKeys)[number], string> = {
      donorsRegistered: '#334155', // Slate 700
      organsRetrieved: '#0d9488', // Teal 600
      successfulTransplants: '#0284c7', // Sky 600
    };

    const monthGroups = g
      .selectAll<SVGGElement, RegionalTrendPoint>('.month-group')
      .data(timeline)
      .join('g')
      .attr('class', 'month-group')
      .attr('transform', (d) => `translate(${x0(d.label) ?? 0},0)`);

    monthGroups
      .selectAll('rect')
      .data((d) =>
        seriesKeys.map((key) => ({
          key,
          value: d[key],
        })),
      )
      .join('rect')
      .attr('x', (d) => x1(d.key) ?? 0)
      .attr('y', (d) => yCount(d.value))
      .attr('width', x1.bandwidth())
      .attr('height', (d) => Math.max(0, innerHeight - yCount(d.value)))
      .attr('rx', 2)
      .attr('fill', (d) => colorMap[d.key]);

    // Success Rate Line Overlay
    const lineGen = d3
      .line<RegionalTrendPoint>()
      .x((d) => (x0(d.label) ?? 0) + x0.bandwidth() / 2)
      .y((d) => yRate(d.successRate))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(timeline)
      .attr('fill', 'none')
      .attr('stroke', '#0f766e')
      .attr('stroke-width', 2.25)
      .attr('d', lineGen);

    g.selectAll('.rate-dot')
      .data(timeline)
      .join('circle')
      .attr('class', 'rate-dot')
      .attr('cx', (d) => (x0(d.label) ?? 0) + x0.bandwidth() / 2)
      .attr('cy', (d) => yRate(d.successRate))
      .attr('r', 3.5)
      .attr('fill', '#ffffff')
      .attr('stroke', '#0f766e')
      .attr('stroke-width', 2);

    // X Axis
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x0).tickSizeOuter(0))
      .call((axis) => {
        axis.select('.domain').attr('stroke', '#cbd5e1');
        axis.selectAll('line').attr('stroke', '#cbd5e1');
        const texts = axis
          .selectAll('text')
          .attr('fill', '#475569')
          .attr('font-size', '10px')
          .attr('font-family', 'IBM Plex Mono, monospace');
        if (isCompact) {
          texts
            .attr('transform', 'rotate(-35)')
            .style('text-anchor', 'end')
            .attr('dx', '-0.4em')
            .attr('dy', '0.2em');
        }
      });

    // Left Y Axis (Counts)
    g.append('g')
      .call(d3.axisLeft(yCount).ticks(5).tickFormat(d3.format('d')))
      .call((axis) => {
        axis.select('.domain').remove();
        axis.selectAll('line').remove();
        axis
          .selectAll('text')
          .attr('fill', '#64748b')
          .attr('font-size', '10px')
          .attr('font-family', 'IBM Plex Mono, monospace');
      });

    // Right Y Axis (Success %)
    g.append('g')
      .attr('transform', `translate(${innerWidth},0)`)
      .call(
        d3
          .axisRight(yRate)
          .ticks(5)
          .tickFormat((v) => `${v}%`),
      )
      .call((axis) => {
        axis.select('.domain').remove();
        axis.selectAll('line').remove();
        axis
          .selectAll('text')
          .attr('fill', '#0f766e')
          .attr('font-size', '10px')
          .attr('font-family', 'IBM Plex Mono, monospace');
      });

    // Interactive Hover Hit Targets
    g.selectAll('.hover-band')
      .data(timeline)
      .join('rect')
      .attr('class', 'hover-band')
      .attr('x', (d) => x0(d.label) ?? 0)
      .attr('y', 0)
      .attr('width', x0.bandwidth())
      .attr('height', innerHeight)
      .attr('fill', 'transparent')
      .style('cursor', 'crosshair')
      .on('mouseenter', (_event, d) => {
        const cx = margin.left + (x0(d.label) ?? 0) + x0.bandwidth() / 2;
        const cy = margin.top + yRate(d.successRate);
        setHoveredMonth({ point: d, x: cx, y: cy });
      })
      .on('mouseleave', () => {
        setHoveredMonth(null);
      });
  }, [timeline, timelineWidth]);

  // Render Regional City Horizontal Comparison D3 Chart
  useEffect(() => {
    const svgEl = regionalSvgRef.current;
    const summaryRows = data?.regionalSummary ?? [];
    if (!svgEl || summaryRows.length === 0) return;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    const height = 310;
    const margin = { top: 14, right: 64, bottom: 28, left: 118 };
    const innerWidth = Math.max(120, regionalWidth - margin.left - margin.right);
    const innerHeight = height - margin.top - margin.bottom;

    svg.attr('viewBox', `0 0 ${regionalWidth} ${height}`);

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const y = d3
      .scaleBand<string>()
      .domain(summaryRows.map((d) => d.city))
      .range([0, innerHeight])
      .padding(0.28);

    const maxActivity = Math.max(
      4,
      d3.max(summaryRows, (d) => d.donors + d.organsRetrieved) ?? 4,
    );

    const x = d3.scaleLinear().domain([0, maxActivity]).nice().range([0, innerWidth]);

    // Stacked Bars: Donors + Organs Retrieved
    const rows = g
      .selectAll<SVGGElement, (typeof summaryRows)[number]>('.city-row')
      .data(summaryRows)
      .join('g')
      .attr('class', 'city-row')
      .style('cursor', 'pointer')
      .on('click', (_event, d) => {
        setSelectedCity((prev) => (prev === d.city ? 'All Regions' : d.city));
      })
      .on('mouseenter', (_event, d) => setHoveredCity(d.city))
      .on('mouseleave', () => setHoveredCity(null));

    rows
      .append('rect')
      .attr('x', 0)
      .attr('y', (d) => y(d.city) ?? 0)
      .attr('width', (d) => x(d.donors))
      .attr('height', y.bandwidth())
      .attr('rx', 2)
      .attr('fill', (d) =>
        selectedCity === 'All Regions' || selectedCity === d.city ? '#334155' : '#cbd5e1',
      );

    rows
      .append('rect')
      .attr('x', (d) => x(d.donors))
      .attr('y', (d) => y(d.city) ?? 0)
      .attr('width', (d) => Math.max(0, x(d.donors + d.organsRetrieved) - x(d.donors)))
      .attr('height', y.bandwidth())
      .attr('rx', 2)
      .attr('fill', (d) =>
        selectedCity === 'All Regions' || selectedCity === d.city ? '#0d9488' : '#94a3b8',
      );

    // Value + Success Rate annotation at end of bar
    rows
      .append('text')
      .attr('x', (d) => x(d.donors + d.organsRetrieved) + 6)
      .attr('y', (d) => (y(d.city) ?? 0) + y.bandwidth() / 2 + 3.5)
      .attr('font-size', '10px')
      .attr('font-family', 'IBM Plex Mono, monospace')
      .attr('fill', '#334155')
      .text((d) => `${d.donors + d.organsRetrieved} · ${d.successRate}%`);

    // City Y Labels (clean regional abbreviation for long names)
    g.append('g')
      .call(
        d3.axisLeft(y).tickFormat((city) =>
          city === 'Chhatrapati Sambhajinagar' ? 'C. Sambhajinagar' : city,
        ),
      )
      .call((axis) => {
        axis.select('.domain').remove();
        axis.selectAll('line').remove();
        axis
          .selectAll('text')
          .attr('fill', (d) => (d === selectedCity ? '#0f766e' : '#1e293b'))
          .attr('font-weight', (d) => (d === selectedCity ? '700' : '500'))
          .attr('font-size', '11px');
      });

    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x).ticks(4).tickFormat(d3.format('d')))
      .call((axis) => {
        axis.select('.domain').attr('stroke', '#cbd5e1');
        axis.selectAll('line').attr('stroke', '#cbd5e1');
        axis
          .selectAll('text')
          .attr('fill', '#64748b')
          .attr('font-size', '10px')
          .attr('font-family', 'IBM Plex Mono, monospace');
      });
  }, [data, regionalWidth, selectedCity, hoveredCity]);

  return (
    <section
      data-testid="d3-regional-chart"
      className="rounded-lg border border-slate-200 bg-white p-6 space-y-5"
    >
      {/* Header & Interactive Region Selector */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-base font-bold tracking-tight text-slate-900">
            Regional Organ Donation Rates &amp; Transplant Success Over Time
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Interactive D3.js telemetry across Maharashtra regions. Click any city filter or regional bar to slice monthly trends.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
          {cities.map((city) => {
            const active = selectedCity === city;
            return (
              <button
                key={city}
                type="button"
                onClick={() => setSelectedCity(city)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-white text-teal-800 font-semibold shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {city === 'Chhatrapati Sambhajinagar' ? 'C. Sambhajinagar' : city}
              </button>
            );
          })}
        </div>
      </div>

      {/* Scoped KPI Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 border-b border-slate-100 pb-4">
        <div>
          <p className="text-[11px] font-medium text-slate-500">Selected Scope</p>
          <p className="mt-0.5 text-sm font-semibold text-slate-900 truncate">{selectedCity}</p>
        </div>
        <div>
          <p className="text-[11px] font-medium text-slate-500">Donations &amp; Retrievals</p>
          <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-slate-900">
            {metricsSummary.totalDonationsAndRetrievals}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-medium text-slate-500">Successful Transplants</p>
          <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-sky-700">
            {metricsSummary.totalSuccessfulTransplants}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-medium text-slate-500">Outcome Success Rate</p>
          <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-teal-700">
            {metricsSummary.overallSuccessRate}%
          </p>
        </div>
      </div>

      {loading || !data ? (
        <div className="h-[310px] rounded-md bg-slate-50 animate-pulse border border-slate-100" />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Temporal Multi-Series Bar + Success Rate Curve */}
          <div ref={timelineContainerRef} className="xl:col-span-7 relative">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h3 className="text-xs font-semibold text-slate-700">
                Monthly Donation Volume &amp; Transplant Success Trajectory ({selectedCity})
              </h3>
              <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-slate-700 inline-block" /> Donors
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-teal-600 inline-block" /> Organs Retrieved
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-sky-600 inline-block" /> Successful Transplants
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-teal-700 inline-block" /> Success Rate (%)
                </span>
              </div>
            </div>

            <svg
              ref={timelineSvgRef}
              className="w-full h-[310px] overflow-visible select-none"
              role="img"
              aria-label={`D3 temporal chart of organ donations and transplant success rate for ${selectedCity}`}
            />

            {hoveredMonth && (
              <div
                className="pointer-events-none absolute z-10 rounded-md border border-slate-200 bg-white/95 px-3 py-2 text-[11px] shadow-md backdrop-blur-sm"
                style={{
                  left: Math.min(Math.max(12, hoveredMonth.x - 75), Math.max(20, timelineWidth - 185)),
                  top: 32,
                }}
              >
                <p className="font-mono font-semibold text-slate-900 border-b border-slate-100 pb-1 mb-1">
                  {hoveredMonth.point.label} ({hoveredMonth.point.month})
                </p>
                <div className="space-y-0.5 font-mono tabular-nums text-slate-700">
                  <p>Donors Registered: {hoveredMonth.point.donorsRegistered}</p>
                  <p>Organs Retrieved: {hoveredMonth.point.organsRetrieved}</p>
                  <p>Allocations: {hoveredMonth.point.allocationsTotal}</p>
                  <p>Successful Surgeries: {hoveredMonth.point.successfulTransplants}</p>
                  <p className="font-semibold text-teal-700">
                    Success Rate: {hoveredMonth.point.successRate}%
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Regional City Breakdown */}
          <div ref={regionalContainerRef} className="xl:col-span-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-slate-700">
                Regional Activity &amp; Success Rate by City
              </h3>
              <span className="text-[11px] text-slate-500">Click bar to filter</span>
            </div>
            <svg
              ref={regionalSvgRef}
              className="w-full h-[310px] overflow-visible select-none"
              role="img"
              aria-label="D3 horizontal bar chart comparing organ donation activity and transplant success rate across regions"
            />
          </div>
        </div>
      )}
    </section>
  );
}
