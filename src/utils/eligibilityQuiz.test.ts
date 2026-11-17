import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBmi,
  computeAgeFromDob,
  evaluateDonorEligibility,
  type HealthProfileInput,
} from './eligibilityQuiz';

function baseHealthyProfile(overrides: Partial<HealthProfileInput> = {}): HealthProfileInput {
  return {
    age: 29,
    heightCm: 172,
    weightKg: 68,
    bloodGroup: 'O+',
    pathwayPreference: 'both',
    infectiousConditions: [],
    chronicConditions: [],
    smokingStatus: 'never',
    alcoholUse: 'none_occasional',
    surgeryHistory: 'none',
    consentUnderstood: true,
    ...overrides,
  };
}

test('calculateBmi and computeAgeFromDob return accurate biometric values', () => {
  assert.equal(calculateBmi(175, 70), 22.9);
  assert.equal(calculateBmi(0, 70), null);
  assert.equal(computeAgeFromDob('1996-05-10', new Date('2026-05-10T00:00:00Z')), 30);
  assert.equal(computeAgeFromDob('1996-12-10', new Date('2026-05-10T00:00:00Z')), 29);
  assert.equal(computeAgeFromDob('invalid'), null);
});

test('healthy adult qualifies across all 6 living and deceased organ pathways', () => {
  const result = evaluateDonorEligibility(baseHealthyProfile());
  assert.equal(result.overallReadiness, 'Strong Candidate');
  assert.equal(result.eligibleCount, 6);
  assert.equal(result.ineligibleCount, 0);
  assert.deepEqual(result.compatibleRecipientGroups, ['O+', 'A+', 'B+', 'AB+']);
});

test('HIV or active sepsis defers all solid organs and corneal tissue', () => {
  const result = evaluateDonorEligibility(
    baseHealthyProfile({
      infectiousConditions: ['hiv'],
    }),
  );
  assert.equal(result.overallReadiness, 'Medically Ineligible');
  assert.equal(result.eligibleCount, 0);
  assert.equal(result.ineligibleCount, 6);
});

test('controlled diabetes blocks pancreas but keeps living kidney conditional and cornea eligible', () => {
  const result = evaluateDonorEligibility(
    baseHealthyProfile({
      age: 48,
      chronicConditions: ['controlled_diabetes'],
    }),
  );
  const byKey = Object.fromEntries(result.organAssessments.map((o) => [o.organKey, o]));
  assert.equal(byKey.pancreas_deceased.status, 'Ineligible');
  assert.equal(byKey.kidney_living.status, 'Conditional');
  assert.equal(byKey.cornea_deceased.status, 'Eligible');
});

test('underage applicant (<18) cannot consent to living donation', () => {
  const result = evaluateDonorEligibility(baseHealthyProfile({ age: 16 }));
  const byKey = Object.fromEntries(result.organAssessments.map((o) => [o.organKey, o]));
  assert.equal(byKey.kidney_living.status, 'Ineligible');
  assert.equal(byKey.liver_living.status, 'Ineligible');
});

test('heavy smoking + COPD blocks lungs while BMI > 35 blocks living kidney and liver', () => {
  const result = evaluateDonorEligibility(
    baseHealthyProfile({
      heightCm: 170,
      weightKg: 105, // BMI 36.3
      smokingStatus: 'active',
      chronicConditions: ['pulmonary_disease', 'chronic_kidney_disease'],
    }),
  );
  const byKey = Object.fromEntries(result.organAssessments.map((o) => [o.organKey, o]));
  assert.equal(byKey.lungs_deceased.status, 'Ineligible');
  assert.equal(byKey.kidney_living.status, 'Ineligible');
  assert.equal(byKey.liver_living.status, 'Ineligible');
  assert.equal(byKey.cornea_deceased.status, 'Eligible');
  assert.equal(result.overallReadiness, 'Conditional — Specialist Review'); // heart/pancreas still possible
});
