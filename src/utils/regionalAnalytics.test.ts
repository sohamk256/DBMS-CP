import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTrendTimeline,
  computeTransplantSuccessRate,
  formatYearMonthLabel,
  getTimelineForRegion,
  summarizeRegionalMetrics,
} from './regionalAnalytics';
import type { RegionalTrendsResponse } from '../types/db';

test('formatYearMonthLabel formats YYYY-MM cleanly', () => {
  assert.equal(formatYearMonthLabel('2025-11'), "Nov '25");
  assert.equal(formatYearMonthLabel('2026-04'), "Apr '26");
});

test('computeTransplantSuccessRate handles zero denominator and rounding', () => {
  assert.equal(computeTransplantSuccessRate(0, 0), 0);
  assert.equal(computeTransplantSuccessRate(5, 6), 83.3);
  assert.equal(computeTransplantSuccessRate(4, 4), 100);
});

test('buildTrendTimeline computes monthly counts and carries cumulative rate when month has no resolved outcomes', () => {
  const timeline = buildTrendTimeline({
    months: ['2026-03', '2026-04', '2026-05'],
    donorCounts: { '2026-05': 4 },
    organCounts: { '2026-03': 10, '2026-04': 2 },
    allocationCounts: { '2026-03': 5, '2026-04': 3 },
    successfulCounts: { '2026-03': 4, '2026-04': 2 },
    resolvedCounts: { '2026-03': 5, '2026-04': 2 },
  });

  assert.equal(timeline.length, 3);
  assert.equal(timeline[0].successRate, 80);
  assert.equal(timeline[1].successRate, 100);
  // 2026-05 has 0 resolved transplants, carries cumulative 6/7 = 85.7%
  assert.equal(timeline[2].successRate, 85.7);
  assert.equal(timeline[2].donorsRegistered, 4);
});

test('getTimelineForRegion and summarizeRegionalMetrics slice correctly by city', () => {
  const mockData: RegionalTrendsResponse = {
    months: ['2026-03', '2026-04'],
    overallTimeline: [
      {
        month: '2026-03',
        label: "Mar '26",
        donorsRegistered: 2,
        organsRetrieved: 8,
        allocationsTotal: 4,
        successfulTransplants: 3,
        resolvedTransplants: 4,
        successRate: 75,
      },
    ],
    byCityTimeline: {
      Mumbai: [
        {
          month: '2026-03',
          label: "Mar '26",
          donorsRegistered: 1,
          organsRetrieved: 5,
          allocationsTotal: 2,
          successfulTransplants: 2,
          resolvedTransplants: 2,
          successRate: 100,
        },
      ],
    },
    regionalSummary: [
      {
        city: 'Mumbai',
        hospitals: 8,
        certifiedHospitals: 7,
        donors: 10,
        organsRetrieved: 12,
        waitingRecipients: 9,
        allocationsTotal: 10,
        successfulTransplants: 8,
        resolvedTransplants: 9,
        successRate: 88.9,
      },
      {
        city: 'Pune',
        hospitals: 7,
        certifiedHospitals: 6,
        donors: 8,
        organsRetrieved: 9,
        waitingRecipients: 11,
        allocationsTotal: 7,
        successfulTransplants: 5,
        resolvedTransplants: 7,
        successRate: 71.4,
      },
    ],
  };

  assert.equal(getTimelineForRegion(mockData, 'All Regions')[0].organsRetrieved, 8);
  assert.equal(getTimelineForRegion(mockData, 'Mumbai')[0].organsRetrieved, 5);

  const mumbaiSummary = summarizeRegionalMetrics(mockData.regionalSummary, 'Mumbai');
  assert.equal(mumbaiSummary.totalDonationsAndRetrievals, 22);
  assert.equal(mumbaiSummary.overallSuccessRate, 88.9);
  assert.equal(mumbaiSummary.topRegion, 'Mumbai');
});
