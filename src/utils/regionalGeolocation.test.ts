import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAHARASHTRA_CITY_HUBS,
  estimateTransportTimes,
  filterMappedHospitals,
  formatEta,
  geolocateHospitalRegistry,
  getMockGeolocationPresets,
  haversineDistanceKm,
  resolveHospitalCoordinates,
  simulateMockGpsPing,
} from './regionalGeolocation';
import type { HospitalRecord, OrganRecord, RecipientRecord } from '../types/db';

const SAMPLE_HOSPITALS: HospitalRecord[] = [
  {
    Hospital_ID: 324270101,
    Hospital_Name: 'KEM Hospital & Seth GS Medical College',
    Hospital_Type: 'Government',
    City: 'Mumbai',
    State: 'Maharashtra',
    Contact_Number: '022-24107000',
    Email: 'kem@hosp.in',
    License_Number: 'MH-ZTCC-MUM-001',
    Transplant_Center_Certified: 1,
    Registration_Date: '2023-01-10',
  },
  {
    Hospital_ID: 324270102,
    Hospital_Name: 'Lilavati Hospital & Research Centre',
    Hospital_Type: 'Private',
    City: 'Mumbai',
    State: 'Maharashtra',
    Contact_Number: '022-26568000',
    Email: 'lilavati@hosp.in',
    License_Number: 'MH-ZTCC-MUM-002',
    Transplant_Center_Certified: 0,
    Registration_Date: '2023-02-12',
  },
  {
    Hospital_ID: 324270201,
    Hospital_Name: 'Ruby Hall Clinic',
    Hospital_Type: 'Private',
    City: 'Pune',
    State: 'Maharashtra',
    Contact_Number: '020-26163391',
    Email: 'ruby@hosp.in',
    License_Number: 'MH-ZTCC-PUN-001',
    Transplant_Center_Certified: 1,
    Registration_Date: '2023-03-01',
  },
  {
    Hospital_ID: 324270401,
    Hospital_Name: 'Government Medical College Nagpur',
    Hospital_Type: 'Government',
    City: 'Nagpur',
    State: 'Maharashtra',
    Contact_Number: '0712-2743588',
    Email: 'gmcnagpur@hosp.in',
    License_Number: 'MH-ZTCC-NGP-001',
    Transplant_Center_Certified: 1,
    Registration_Date: '2023-04-15',
  },
];

test('haversineDistanceKm computes realistic Maharashtra inter-city distances', () => {
  const mumbai = MAHARASHTRA_CITY_HUBS.Mumbai;
  const pune = MAHARASHTRA_CITY_HUBS.Pune;
  const nagpur = MAHARASHTRA_CITY_HUBS.Nagpur;

  assert.equal(haversineDistanceKm(mumbai, mumbai), 0);

  const mumToPun = haversineDistanceKm(mumbai, pune);
  assert.ok(mumToPun > 110 && mumToPun < 140, `Expected Mumbai-Pune ~119 km, got ${mumToPun}`);

  const mumToNgp = haversineDistanceKm(mumbai, nagpur);
  assert.ok(mumToNgp > 640 && mumToNgp < 730, `Expected Mumbai-Nagpur ~680 km, got ${mumToNgp}`);
});

test('resolveHospitalCoordinates spreads sibling hospitals in the same city without overlap', () => {
  const c0 = resolveHospitalCoordinates(SAMPLE_HOSPITALS[0], 0);
  const c1 = resolveHospitalCoordinates(SAMPLE_HOSPITALS[1], 1);

  assert.notEqual(`${c0.lat},${c0.lng}`, `${c1.lat},${c1.lng}`);
  const separationKm = haversineDistanceKm(c0, c1);
  assert.ok(separationKm > 1 && separationKm < 10, `Expected local spread ~2-8 km, got ${separationKm}`);
});

test('geolocateHospitalRegistry ranks hospitals ascending by distance and attaches organ/waitlist counts', () => {
  const organs: Partial<OrganRecord>[] = [
    { OrganID: 1, RetrievalHospitalID: 324270101, OrganStatus: 'Available' },
    { OrganID: 2, RetrievalHospitalID: 324270101, OrganStatus: 'Available' },
    { OrganID: 3, RetrievalHospitalID: 324270201, OrganStatus: 'Allocated' },
  ];
  const recipients: Partial<RecipientRecord>[] = [
    { Recipient_ID: 10, RegisteringHospitalID: 324270201, RecipientStatus: 'Waiting' },
    { Recipient_ID: 11, RegisteringHospitalID: 324270401, RecipientStatus: 'Transplanted' },
  ];

  const mapped = geolocateHospitalRegistry(
    SAMPLE_HOSPITALS,
    MAHARASHTRA_CITY_HUBS.Mumbai,
    organs as OrganRecord[],
    recipients as RecipientRecord[],
  );

  assert.equal(mapped.length, 4);
  assert.equal(mapped[0].hospital.Hospital_ID, 324270101);
  assert.equal(mapped[0].distanceKm, 0);
  assert.equal(mapped[0].availableOrgansCount, 2);
  assert.equal(mapped[1].hospital.Hospital_ID, 324270102);
  assert.equal(mapped[2].hospital.City, 'Pune');
  assert.equal(mapped[2].waitingRecipientsCount, 1);
  assert.equal(mapped[3].hospital.City, 'Nagpur');
  assert.equal(mapped[3].waitingRecipientsCount, 0);
});

test('filterMappedHospitals filters accurately by certification status, radius, city, and search query', () => {
  const mapped = geolocateHospitalRegistry(SAMPLE_HOSPITALS, MAHARASHTRA_CITY_HUBS.Mumbai);

  const certifiedOnly = filterMappedHospitals(mapped, {
    centerType: 'certified',
    maxDistanceKm: null,
  });
  assert.equal(certifiedOnly.length, 3);
  assert.ok(certifiedOnly.every((m) => m.isCertifiedCenter));

  const partnersOnly = filterMappedHospitals(mapped, {
    centerType: 'partner',
    maxDistanceKm: null,
  });
  assert.equal(partnersOnly.length, 1);
  assert.equal(partnersOnly[0].hospital.Hospital_ID, 324270102);

  const within150Km = filterMappedHospitals(mapped, {
    centerType: 'all',
    maxDistanceKm: 150,
  });
  assert.equal(within150Km.length, 3); // Mumbai (2) + Pune (1), excludes Nagpur

  const searchLilavati = filterMappedHospitals(mapped, {
    centerType: 'all',
    maxDistanceKm: null,
    searchQuery: 'lilavati',
  });
  assert.equal(searchLilavati.length, 1);
  assert.equal(searchLilavati[0].hospital.Hospital_ID, 324270102);
});

test('estimateTransportTimes and formatEta return faster Green Corridor times than standard road', () => {
  const est = estimateTransportTimes(120);
  assert.ok(est.greenCorridorMinutes < est.roadMinutes);
  assert.ok(est.airMinutes < est.roadMinutes);
  assert.equal(formatEta(45), '45 min');
  assert.equal(formatEta(125), '2h 5m');
});

test('mock geolocation presets and simulated GPS pings produce valid Maharashtra coordinates', () => {
  const presets = getMockGeolocationPresets(SAMPLE_HOSPITALS, 324270201);
  assert.equal(presets[0].source, 'hospital-anchor');
  assert.equal(presets[0].city, 'Pune');

  const ping = simulateMockGpsPing('Nashik', 3);
  assert.equal(ping.source, 'simulated-gps');
  assert.ok(haversineDistanceKm(ping, MAHARASHTRA_CITY_HUBS.Nashik) < 5);
});
