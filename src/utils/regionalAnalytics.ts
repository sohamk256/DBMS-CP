import type { RegionalCitySummary, RegionalTrendPoint, RegionalTrendsResponse } from '../types/db';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatYearMonthLabel(ym: string): string {
  const parts = ym.split('-');
  if (parts.length !== 2) return ym;
  const yearShort = parts[0].slice(-2);
  const monthIdx = Number(parts[1]) - 1;
  const monthName = MONTH_NAMES[monthIdx] ?? parts[1];
  return `${monthName} '${yearShort}`;
}

export function computeTransplantSuccessRate(successful: number, resolved: number): number {
  if (resolved <= 0) return 0;
  return Math.round((successful / resolved) * 1000) / 10;
}

export function buildTrendTimeline(params: {
  months: string[];
  donorCounts: Record<string, number>;
  organCounts: Record<string, number>;
  allocationCounts: Record<string, number>;
  successfulCounts: Record<string, number>;
  resolvedCounts: Record<string, number>;
}): RegionalTrendPoint[] {
  let cumulativeSuccess = 0;
  let cumulativeResolved = 0;

  return params.months.map((month) => {
    const donorsRegistered = params.donorCounts[month] ?? 0;
    const organsRetrieved = params.organCounts[month] ?? 0;
    const allocationsTotal = params.allocationCounts[month] ?? 0;
    const successfulTransplants = params.successfulCounts[month] ?? 0;
    const resolvedTransplants = params.resolvedCounts[month] ?? 0;

    cumulativeSuccess += successfulTransplants;
    cumulativeResolved += resolvedTransplants;

    const successRate =
      resolvedTransplants > 0
        ? computeTransplantSuccessRate(successfulTransplants, resolvedTransplants)
        : cumulativeResolved > 0
        ? computeTransplantSuccessRate(cumulativeSuccess, cumulativeResolved)
        : 0;

    return {
      month,
      label: formatYearMonthLabel(month),
      donorsRegistered,
      organsRetrieved,
      allocationsTotal,
      successfulTransplants,
      resolvedTransplants,
      successRate,
    };
  });
}

export function getTimelineForRegion(
  data: RegionalTrendsResponse | null,
  selectedCity: string,
): RegionalTrendPoint[] {
  if (!data) return [];
  if (!selectedCity || selectedCity === 'All Regions') {
    return data.overallTimeline;
  }
  return data.byCityTimeline[selectedCity] ?? data.overallTimeline;
}

export function summarizeRegionalMetrics(
  regionalSummary: RegionalCitySummary[],
  selectedCity: string,
): {
  totalDonationsAndRetrievals: number;
  totalSuccessfulTransplants: number;
  overallSuccessRate: number;
  topRegion: string;
} {
  const scope =
    !selectedCity || selectedCity === 'All Regions'
      ? regionalSummary
      : regionalSummary.filter((r) => r.city === selectedCity);

  const totalDonationsAndRetrievals = scope.reduce(
    (sum, item) => sum + item.donors + item.organsRetrieved,
    0,
  );
  const totalSuccessfulTransplants = scope.reduce((sum, item) => sum + item.successfulTransplants, 0);
  const totalResolved = scope.reduce((sum, item) => sum + item.resolvedTransplants, 0);
  const overallSuccessRate = computeTransplantSuccessRate(totalSuccessfulTransplants, totalResolved);

  const sorted = [...regionalSummary].sort(
    (a, b) => b.donors + b.organsRetrieved - (a.donors + a.organsRetrieved),
  );
  const topRegion = sorted[0]?.city ?? 'Pune';

  return {
    totalDonationsAndRetrievals,
    totalSuccessfulTransplants,
    overallSuccessRate,
    topRegion,
  };
}
