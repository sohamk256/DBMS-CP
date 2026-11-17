import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildResourceAvailabilitySnapshot,
  computeOccupancyPct,
  deriveCapacityStatus,
  deriveTheaterReadinessStatus,
  normalizeResourceMutation,
} from './resourceAvailability';
import type { HospitalResourceRecord, OrganRecord } from '../types/db';

const SAMPLE_RESOURCE: HospitalResourceRecord = {
  Hospital_ID: 324270101,
  Hospital_Name: 'Sassoon General Hospital',
  City: 'Pune',
  Transplant_Center_Certified: 1,
  ICU_Beds_Total: 24,
  ICU_Beds_Occupied: 18,
  Isolation_Beds_Total: 8,
  Isolation_Beds_Occupied: 5,
  Ward_Beds_Total: 40,
  Ward_Beds_Occupied: 29,
  Theaters_Total: 4,
  Theaters_Ready: 2,
  Theaters_In_Use: 1,
  Theaters_Sanitizing: 1,
  Surgical_Teams_On_Call: 3,
  Next_Theater_Available_Min: 0,
  Theater_Readiness_Status: 'Ready',
  Notes: '24x7 ZTCC Transplant Wing active',
  Updated_At: '2026-11-16 18:00:00',
};

test('computeOccupancyPct and deriveCapacityStatus handle thresholds accurately', () => {
  assert.equal(computeOccupancyPct(0, 0), 0);
  assert.equal(computeOccupancyPct(18, 24), 75);
  assert.equal(computeOccupancyPct(30, 24), 100);
  assert.equal(deriveCapacityStatus(68), 'Nominal');
  assert.equal(deriveCapacityStatus(75), 'High Load');
  assert.equal(deriveCapacityStatus(90), 'Critical');
});

test('deriveTheaterReadinessStatus classifies Ready, Limited, Busy, and Standby', () => {
  assert.equal(
    deriveTheaterReadinessStatus({
      theatersTotal: 4,
      theatersReady: 2,
      theatersInUse: 1,
      surgicalTeamsOnCall: 3,
    }),
    'Ready',
  );
  assert.equal(
    deriveTheaterReadinessStatus({
      theatersTotal: 4,
      theatersReady: 1,
      theatersInUse: 2,
      surgicalTeamsOnCall: 2,
    }),
    'Limited',
  );
  assert.equal(
    deriveTheaterReadinessStatus({
      theatersTotal: 4,
      theatersReady: 0,
      theatersInUse: 3,
      surgicalTeamsOnCall: 2,
    }),
    'Busy',
  );
  assert.equal(
    deriveTheaterReadinessStatus({
      theatersTotal: 4,
      theatersReady: 2,
      theatersInUse: 0,
      surgicalTeamsOnCall: 0,
    }),
    'Standby',
  );
});

test('normalizeResourceMutation clamps bed counts and reconciles theater totals cleanly', () => {
  const updated = normalizeResourceMutation(SAMPLE_RESOURCE, {
    ICU_Beds_Occupied: 99,
    Theaters_Ready: 0,
    Theaters_In_Use: 3,
    Next_Theater_Available_Min: 40,
  });

  assert.equal(updated.ICU_Beds_Occupied, 24);
  assert.equal(updated.Theaters_Ready, 0);
  assert.equal(updated.Theaters_In_Use, 3);
  assert.equal(updated.Theaters_Sanitizing, 1);
  assert.equal(updated.Theater_Readiness_Status, 'Busy');
  assert.equal(updated.Next_Theater_Available_Min, 40);
});

test('buildResourceAvailabilitySnapshot aggregates beds, theaters, and live organ counts', () => {
  const nowMs = Date.parse('2026-11-16T18:00:00Z');
  const organs: Partial<OrganRecord>[] = [
    {
      OrganID: 1,
      OrganType: 'Kidney',
      OrganStatus: 'Available',
      MaxPreservationHours: 24,
      ExpiryTime: '2026-11-16 20:00:00',
    },
    {
      OrganID: 2,
      OrganType: 'Liver',
      OrganStatus: 'Available',
      MaxPreservationHours: 12,
      ExpiryTime: '2026-11-17 04:00:00',
    },
    {
      OrganID: 3,
      OrganType: 'Heart',
      OrganStatus: 'Allocated',
      MaxPreservationHours: 6,
      ExpiryTime: '2026-11-16 22:00:00',
    },
    {
      OrganID: 4,
      OrganType: 'Cornea',
      OrganStatus: 'Transplanted',
      MaxPreservationHours: 72,
      ExpiryTime: '2026-11-19 18:00:00',
    },
  ];

  const snapshot = buildResourceAvailabilitySnapshot({
    resources: [SAMPLE_RESOURCE],
    organs: organs as OrganRecord[],
    scopeLabel: 'Sassoon General Hospital',
    referenceTimeMs: nowMs,
  });

  assert.equal(snapshot.hospitalCount, 1);
  assert.equal(snapshot.bedOccupancy.totalBeds, 72);
  assert.equal(snapshot.bedOccupancy.occupiedBeds, 52);
  assert.equal(snapshot.bedOccupancy.freeBeds, 20);
  assert.equal(snapshot.bedOccupancy.occupancyRatePct, 72);
  assert.equal(snapshot.bedOccupancy.capacityStatus, 'Nominal');
  assert.equal(snapshot.theaterReadiness.theatersReady, 2);
  assert.equal(snapshot.theaterReadiness.readinessStatus, 'Ready');
  assert.equal(snapshot.organInventory.availableCount, 2);
  assert.equal(snapshot.organInventory.allocatedCount, 1);
  assert.equal(snapshot.organInventory.transplantedCount, 1);
  assert.equal(snapshot.organInventory.criticalWindowCount, 1); // Kidney expiring in 2h <= 6h threshold
  assert.equal(snapshot.organInventory.byOrganType.length, 3);
});
