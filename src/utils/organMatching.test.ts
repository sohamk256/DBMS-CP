import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCompatibilityScore,
  calculateRecipientPriorityScore,
  getPreservationStatus,
  isBloodCompatible,
  rankCompatibleRecipients,
  validateSqlQuery,
} from './organMatching';
import type { RecipientRecord } from '../types/db';

const makeRecipient = (overrides: Partial<RecipientRecord>): RecipientRecord => ({
  Recipient_ID: 625270099,
  Full_Name: 'Test Patient',
  DOB: '1988-01-01',
  Gender: 'Female',
  Blood_Group: 'O+',
  Contact_Number: '9800000000',
  Email: 'patient@example.com',
  Address: 'Pune, MH',
  Aadhar_Num: '1111 2222 3333',
  RequiredOrgan: 'Kidney',
  UrgencyLevel: 'Urgent',
  PriorityScore: 70,
  RegistrationDate: '2026-01-01',
  RegisteringHospitalID: 324270101,
  RecipientStatus: 'Waiting',
  RemovalReason: null,
  Previous_Transplant_History: 0,
  Attending_Physician: 'Dr. Joshi',
  Disease: 'ESRD',
  ...overrides,
});

test('ABO/Rh blood compatibility matrix enforces clinical rules', () => {
  assert.equal(isBloodCompatible('O-', 'AB+'), true);
  assert.equal(isBloodCompatible('O-', 'O-'), true);
  assert.equal(isBloodCompatible('O+', 'O-'), false);
  assert.equal(isBloodCompatible('A+', 'A+'), true);
  assert.equal(isBloodCompatible('A+', 'B+'), false);
  assert.equal(isBloodCompatible('AB+', 'O+'), false);
  assert.equal(isBloodCompatible('AB+', 'AB+'), true);
});

test('rankCompatibleRecipients filters organ type, blood group, waiting status, and sorts by score', () => {
  const organ = {
    OrganType: 'Kidney' as const,
    BloodGroup: 'O+' as const,
    RetrievalHospitalID: 324270101,
  };
  const cityMap = {
    324270101: 'Pune',
    324270102: 'Mumbai',
    324270103: 'Pune',
  };

  const candidates = [
    makeRecipient({
      Recipient_ID: 1,
      Full_Name: 'Wrong Organ',
      RequiredOrgan: 'Liver',
      UrgencyLevel: 'Emergency',
    }),
    makeRecipient({
      Recipient_ID: 2,
      Full_Name: 'Incompatible Blood',
      Blood_Group: 'O-',
    }),
    makeRecipient({
      Recipient_ID: 3,
      Full_Name: 'Already Transplanted',
      RecipientStatus: 'Transplanted',
    }),
    makeRecipient({
      Recipient_ID: 4,
      Full_Name: 'Routine Compatible Mumbai',
      Blood_Group: 'A+',
      UrgencyLevel: 'Routine',
      PriorityScore: 45,
      RegisteringHospitalID: 324270102,
    }),
    makeRecipient({
      Recipient_ID: 5,
      Full_Name: 'Emergency Exact Same Hospital',
      Blood_Group: 'O+',
      UrgencyLevel: 'Emergency',
      PriorityScore: 97,
      RegisteringHospitalID: 324270101,
    }),
  ];

  const ranked = rankCompatibleRecipients(organ, candidates, cityMap);
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0].recipient.Recipient_ID, 5);
  assert.equal(ranked[0].bloodMatchType, 'Exact');
  assert.equal(ranked[0].sameHospital, true);
  assert.equal(ranked[1].recipient.Recipient_ID, 4);
  assert.equal(ranked[1].bloodMatchType, 'Compatible');
  assert.ok(ranked[0].compatibilityScore > ranked[1].compatibilityScore);
});

test('calculateCompatibilityScore returns null for organ mismatch', () => {
  const res = calculateCompatibilityScore(
    { OrganType: 'Heart', BloodGroup: 'O-', RetrievalHospitalID: 324270101 },
    makeRecipient({ RequiredOrgan: 'Kidney', Blood_Group: 'O+' }),
  );
  assert.equal(res, null);
});

test('calculateRecipientPriorityScore incorporates urgency, prior transplant, and waiting time', () => {
  const routine = calculateRecipientPriorityScore({
    urgencyLevel: 'Routine',
    previousTransplantHistory: false,
    waitingDays: 0,
  });
  const emergency = calculateRecipientPriorityScore({
    urgencyLevel: 'Emergency',
    previousTransplantHistory: true,
    waitingDays: 180,
  });
  assert.equal(routine, 38);
  assert.equal(emergency, 100);
});

test('getPreservationStatus computes nominal, critical window, and expired states', () => {
  const nominal = getPreservationStatus(
    {
      PreservationStartTime: '2026-11-16 10:00:00',
      ExpiryTime: '2026-11-16 20:00:00',
      MaxPreservationHours: 10,
      OrganStatus: 'Available',
    },
    new Date('2026-11-16T12:00:00').getTime(),
  );
  assert.equal(nominal.windowState, 'Nominal');
  assert.equal(nominal.remainingHours, 8);
  assert.equal(nominal.percentRemaining, 80);

  const critical = getPreservationStatus(
    {
      PreservationStartTime: '2026-11-16 10:00:00',
      ExpiryTime: '2026-11-16 20:00:00',
      MaxPreservationHours: 10,
      OrganStatus: 'Available',
    },
    new Date('2026-11-16T18:30:00').getTime(),
  );
  assert.equal(critical.windowState, 'Critical Window');
  assert.equal(critical.remainingHours, 1.5);

  const expired = getPreservationStatus(
    {
      PreservationStartTime: '2026-11-16 10:00:00',
      ExpiryTime: '2026-11-16 20:00:00',
      MaxPreservationHours: 10,
      OrganStatus: 'Available',
    },
    new Date('2026-11-16T21:00:00').getTime(),
  );
  assert.equal(expired.windowState, 'Expired');
  assert.equal(expired.remainingHours, 0);
});

test('validateSqlQuery guards read-only mode and destructive statements', () => {
  assert.equal(validateSqlQuery('SELECT * FROM donor;', false).valid, true);
  assert.equal(validateSqlQuery('PRAGMA table_info(organ);', false).valid, true);
  assert.equal(validateSqlQuery('UPDATE donor SET Donor_Status = "Approved"', false).valid, false);
  assert.equal(validateSqlQuery('UPDATE donor SET Donor_Status = "Approved"', true).valid, true);
  assert.equal(validateSqlQuery('DROP TABLE donor;', true).valid, false);
});
