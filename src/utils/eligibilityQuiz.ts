import type { BloodGroup } from '../types/db';
import { getCompatibleRecipientGroups } from './organMatching';

export type DonationPathwayPreference = 'both' | 'living' | 'deceased';

export type InfectiousCondition =
  | 'hiv'
  | 'hepatitis_bc'
  | 'sepsis_tb'
  | 'metastatic_cancer';

export type ChronicCondition =
  | 'uncontrolled_diabetes'
  | 'controlled_diabetes'
  | 'uncontrolled_hypertension'
  | 'chronic_kidney_disease'
  | 'liver_disease'
  | 'cardiac_disease'
  | 'pulmonary_disease';

export type SmokingStatus = 'never' | 'former' | 'active';
export type AlcoholUse = 'none_occasional' | 'moderate' | 'heavy';
export type SurgeryHistory = 'none' | 'minor' | 'major_organ';

export interface HealthProfileInput {
  age: number;
  heightCm: number;
  weightKg: number;
  bloodGroup: BloodGroup;
  pathwayPreference: DonationPathwayPreference;
  infectiousConditions: InfectiousCondition[];
  chronicConditions: ChronicCondition[];
  smokingStatus: SmokingStatus;
  alcoholUse: AlcoholUse;
  surgeryHistory: SurgeryHistory;
  consentUnderstood: boolean;
}

export type OrganEligibilityStatus = 'Eligible' | 'Conditional' | 'Ineligible';

export type OverallReadiness =
  | 'Strong Candidate'
  | 'Conditional — Specialist Review'
  | 'Deferred for Solid Organs (Cornea/Tissue Review)'
  | 'Medically Ineligible';

export interface OrganEligibilityItem {
  organKey: 'kidney_living' | 'liver_living' | 'heart_deceased' | 'lungs_deceased' | 'pancreas_deceased' | 'cornea_deceased';
  organLabel: string;
  pathway: 'Living' | 'Deceased';
  status: OrganEligibilityStatus;
  score: number;
  summary: string;
  reasons: string[];
  recommendedTests: string[];
}

export interface EligibilityEvaluationResult {
  bmi: number;
  bmiCategory: 'Underweight' | 'Normal' | 'Overweight' | 'Obese Class I' | 'Obese Class II+';
  overallReadiness: OverallReadiness;
  summaryHeadline: string;
  compatibleRecipientGroups: BloodGroup[];
  eligibleCount: number;
  conditionalCount: number;
  ineligibleCount: number;
  organAssessments: OrganEligibilityItem[];
  nextSteps: string[];
}

export function calculateBmi(heightCm: number, weightKg: number): number | null {
  if (!Number.isFinite(heightCm) || !Number.isFinite(weightKg) || heightCm <= 0 || weightKg <= 0) {
    return null;
  }
  const heightM = heightCm / 100;
  const raw = weightKg / (heightM * heightM);
  return Math.round(raw * 10) / 10;
}

export function getBmiCategory(bmi: number): EligibilityEvaluationResult['bmiCategory'] {
  if (bmi < 18.5) return 'Underweight';
  if (bmi < 25) return 'Normal';
  if (bmi < 30) return 'Overweight';
  if (bmi < 35) return 'Obese Class I';
  return 'Obese Class II+';
}

export function computeAgeFromDob(dob: string, referenceDate: Date = new Date()): number | null {
  if (!dob || !/^\d{4}-\d{2}-\d{2}/.test(dob)) return null;
  const birth = new Date(`${dob.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) return null;

  let age = referenceDate.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = referenceDate.getUTCMonth() - birth.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && referenceDate.getUTCDate() < birth.getUTCDate())) {
    age -= 1;
  }
  return age >= 0 && age <= 120 ? age : null;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function evaluateDonorEligibility(input: HealthProfileInput): EligibilityEvaluationResult {
  const bmi = calculateBmi(input.heightCm, input.weightKg) ?? 23.0;
  const bmiCategory = getBmiCategory(bmi);
  const compatibleRecipientGroups = getCompatibleRecipientGroups(input.bloodGroup);

  const inf = new Set(input.infectiousConditions);
  const chr = new Set(input.chronicConditions);

  const hasSolidOrganInfectiousBlock =
    inf.has('hiv') || inf.has('sepsis_tb') || inf.has('metastatic_cancer');
  const hasHepatitis = inf.has('hepatitis_bc');

  const assessments: OrganEligibilityItem[] = [];

  // 1. Living Kidney Donation
  {
    const reasons: string[] = [];
    const tests = ['HLA Tissue Typing & Crossmatch', 'Serum Creatinine & eGFR Panel', 'Renal CT Angiography', 'Viral Screening (HIV/HBV/HCV)'];
    let status: OrganEligibilityStatus = 'Eligible';
    let score = 96;

    if (input.age < 18) {
      status = 'Ineligible';
      score = 0;
      reasons.push('Minimum age for legal living kidney donation consent is 18 years.');
    } else if (input.age > 70) {
      status = 'Ineligible';
      score = 15;
      reasons.push('Age above 70 generally excludes living kidney nephrectomy due to surgical reserve.');
    } else if (input.age >= 60) {
      status = 'Conditional';
      score -= 18;
      reasons.push('Age 60–70 requires enhanced bilateral split-renal function (DTPA) verification.');
    } else {
      reasons.push(`Age (${input.age} yrs) is within the optimal living donor range (18–59 yrs).`);
    }

    if (hasSolidOrganInfectiousBlock || hasHepatitis) {
      status = 'Ineligible';
      score = 0;
      reasons.push('Active transmissible infection (HIV/HBV/HCV/sepsis) or metastatic cancer contraindicates living donation.');
    }
    if (chr.has('chronic_kidney_disease')) {
      status = 'Ineligible';
      score = 0;
      reasons.push('Pre-existing CKD or bilateral stone disease leaves insufficient single-kidney reserve.');
    }
    if (chr.has('uncontrolled_diabetes') || chr.has('uncontrolled_hypertension')) {
      status = 'Ineligible';
      score = Math.min(score, 20);
      reasons.push('Uncontrolled diabetes or severe hypertension poses high lifetime ESRD risk post-nephrectomy.');
    }
    if (chr.has('controlled_diabetes') && status !== 'Ineligible') {
      status = 'Conditional';
      score -= 22;
      reasons.push('Controlled Type 2 diabetes requires negative microalbuminuria & nephrology board review.');
    }
    if (bmi > 35 && status !== 'Ineligible') {
      status = 'Ineligible';
      score = Math.min(score, 25);
      reasons.push(`BMI ${bmi} kg/m² exceeds the living kidney threshold (≤ 35.0 kg/m²).`);
    } else if (bmi > 30 && status !== 'Ineligible') {
      status = 'Conditional';
      score -= 12;
      reasons.push(`BMI ${bmi} kg/m² (30–35) prompts pre-operative weight optimization counseling.`);
    }
    if (input.smokingStatus === 'active' && status !== 'Ineligible') {
      status = status === 'Eligible' ? 'Conditional' : status;
      score -= 10;
      reasons.push('Active smoking increases perioperative risk; 4–6 weeks cessation advised prior to surgery.');
    }
    if (input.surgeryHistory === 'major_organ' && status !== 'Ineligible') {
      status = 'Conditional';
      score -= 12;
      reasons.push('Prior major abdominal surgery requires vascular anatomy review.');
    }

    assessments.push({
      organKey: 'kidney_living',
      organLabel: 'Kidney (Living Donation)',
      pathway: 'Living',
      status,
      score: status === 'Ineligible' ? Math.min(score, 25) : clampScore(score),
      summary:
        status === 'Eligible'
          ? 'Meets standard NOTTO/ZTCC clinical criteria for living kidney donation.'
          : status === 'Conditional'
          ? 'Potentially eligible pending specialist nephrology clearance and confirmatory labs.'
          : 'Does not currently meet living kidney safety criteria.',
      reasons,
      recommendedTests: tests,
    });
  }

  // 2. Living Partial Liver Donation
  {
    const reasons: string[] = [];
    const tests = ['Liver Function Panel (LFT)', 'CT Liver Volumetry & Steatosis Check', 'Viral Hepatitis Serology', 'Coagulation Profile'];
    let status: OrganEligibilityStatus = 'Eligible';
    let score = 94;

    if (input.age < 18 || input.age > 55) {
      status = 'Ineligible';
      score = 10;
      reasons.push('Living liver lobe donation typically requires donor age between 18 and 55 years for optimal hepatic regeneration.');
    } else {
      reasons.push(`Age (${input.age} yrs) supports healthy post-hepatectomy liver regeneration.`);
    }

    if (hasSolidOrganInfectiousBlock || hasHepatitis) {
      status = 'Ineligible';
      score = 0;
      reasons.push('Active viral hepatitis, HIV, systemic infection, or metastatic malignancy contraindicates liver donation.');
    }
    if (chr.has('liver_disease')) {
      status = 'Ineligible';
      score = 0;
      reasons.push('Chronic liver disease, cirrhosis, or significant steatosis prevents partial hepatectomy.');
    }
    if (input.alcoholUse === 'heavy') {
      status = 'Ineligible';
      score = Math.min(score, 15);
      reasons.push('Heavy chronic alcohol intake elevates risk of steatohepatitis and poor graft function.');
    } else if (input.alcoholUse === 'moderate' && status !== 'Ineligible') {
      status = 'Conditional';
      score -= 12;
      reasons.push('Moderate alcohol use requires liver biopsy/MRI-PDFF to confirm < 10% macrosteatosis.');
    }
    if (bmi > 32 && status !== 'Ineligible') {
      status = 'Ineligible';
      score = Math.min(score, 20);
      reasons.push(`BMI ${bmi} kg/m² (> 32) is strongly associated with hepatic steatosis in living donors.`);
    } else if (bmi > 28 && status !== 'Ineligible') {
      status = 'Conditional';
      score -= 14;
      reasons.push(`BMI ${bmi} kg/m² warrants MRI-PDFF fat-fraction screening.`);
    }
    if ((chr.has('cardiac_disease') || chr.has('pulmonary_disease')) && status !== 'Ineligible') {
      status = 'Ineligible';
      score = Math.min(score, 20);
      reasons.push('Cardiopulmonary disease substantially elevates major hepatic surgery morbidity.');
    }
    if (input.surgeryHistory === 'major_organ' && status !== 'Ineligible') {
      status = 'Conditional';
      score -= 15;
      reasons.push('Prior major abdominal surgery requires biliary and vascular mapping.');
    }

    assessments.push({
      organKey: 'liver_living',
      organLabel: 'Liver (Living Partial Lobe)',
      pathway: 'Living',
      status,
      score: status === 'Ineligible' ? Math.min(score, 25) : clampScore(score),
      summary:
        status === 'Eligible'
          ? 'Meets baseline criteria for living partial liver lobe donation.'
          : status === 'Conditional'
          ? 'Conditional suitability — requires hepatic volumetry and fat-fraction imaging.'
          : 'Deferred for living partial liver donation based on safety thresholds.',
      reasons,
      recommendedTests: tests,
    });
  }

  // 3. Deceased Heart Donation
  {
    const reasons: string[] = [];
    const tests = ['Transthoracic Echocardiogram (LVEF)', '12-Lead ECG & Troponin I', 'Coronary Angiogram (if age > 40)'];
    let status: OrganEligibilityStatus = 'Eligible';
    let score = 95;

    if (hasSolidOrganInfectiousBlock) {
      status = 'Ineligible';
      score = 0;
      reasons.push('Active HIV, sepsis, or metastatic cancer contraindicates cardiac transplantation.');
    }
    if (chr.has('cardiac_disease')) {
      status = 'Ineligible';
      score = 0;
      reasons.push('Known coronary artery disease, heart failure, or severe arrhythmia excludes cardiac donation.');
    }
    if (input.age > 65) {
      status = 'Ineligible';
      score = Math.min(score, 15);
      reasons.push('Age above 65 generally precludes deceased heart procurement due to cold-ischemia sensitivity.');
    } else if (input.age > 55 && status !== 'Ineligible') {
      status = 'Conditional';
      score -= 20;
      reasons.push('Age 56–65 requires normal coronary angiography and preserved LVEF ≥ 55%.');
    } else {
      reasons.push('Within standard cardiac donor age guidelines (≤ 55 yrs).');
    }
    if (chr.has('uncontrolled_diabetes') || chr.has('uncontrolled_hypertension')) {
      if (status !== 'Ineligible') {
        status = 'Conditional';
        score -= 18;
        reasons.push('Longstanding diabetes or hypertension requires echo assessment for LV hypertrophy.');
      }
    }
    if (input.smokingStatus === 'active' && status !== 'Ineligible') {
      score -= 10;
      reasons.push('Active tobacco exposure lowers cardiac suitability score slightly due to vascular risk.');
    }

    assessments.push({
      organKey: 'heart_deceased',
      organLabel: 'Heart (Deceased Donation)',
      pathway: 'Deceased',
      status,
      score: status === 'Ineligible' ? Math.min(score, 25) : clampScore(score),
      summary:
        status === 'Eligible'
          ? 'Eligible for deceased heart pledge upon brain-death certification.'
          : status === 'Conditional'
          ? 'Potentially viable under extended-criteria cardiac evaluation at retrieval.'
          : 'Not eligible for cardiac donation.',
      reasons,
      recommendedTests: tests,
    });
  }

  // 4. Deceased Lung Donation
  {
    const reasons: string[] = [];
    const tests = ['Arterial Blood Gas (PaO2/FiO2)', 'Chest CT & Bronchoscopy', 'Sputum Culture'];
    let status: OrganEligibilityStatus = 'Eligible';
    let score = 93;

    if (hasSolidOrganInfectiousBlock) {
      status = 'Ineligible';
      score = 0;
      reasons.push('Active systemic infection, untreated TB, or metastatic malignancy contraindicates lung procurement.');
    }
    if (chr.has('pulmonary_disease')) {
      status = 'Ineligible';
      score = 0;
      reasons.push('Chronic COPD, pulmonary hypertension, or steroid-dependent asthma excludes lung donation.');
    }
    if (input.age > 65) {
      status = 'Ineligible';
      score = Math.min(score, 15);
      reasons.push('Age above 65 falls outside standard lung procurement limits.');
    } else if (input.age > 55 && status !== 'Ineligible') {
      status = 'Conditional';
      score -= 15;
      reasons.push('Age 56–65 requires PaO2/FiO2 > 300 mmHg on retrieval ventilation.');
    }
    if (input.smokingStatus === 'active' && status !== 'Ineligible') {
      status = 'Conditional';
      score -= 22;
      reasons.push('Active smoking (>20 pack-year risk) requires clear bronchoscopy and chest CT.');
    } else if (input.smokingStatus === 'former' && status !== 'Ineligible') {
      score -= 6;
      reasons.push('Former smoking history (>1 yr quit) is acceptable pending clear imaging.');
    } else if (status === 'Eligible') {
      reasons.push('Non-smoking status preserves optimal alveolar gas-exchange viability.');
    }

    assessments.push({
      organKey: 'lungs_deceased',
      organLabel: 'Lungs (Deceased Donation)',
      pathway: 'Deceased',
      status,
      score: status === 'Ineligible' ? Math.min(score, 25) : clampScore(score),
      summary:
        status === 'Eligible'
          ? 'Strong candidate for deceased bilateral/single lung donation.'
          : status === 'Conditional'
          ? 'Requires clear chest CT and oxygenation ratio verification at procurement.'
          : 'Ineligible for lung donation.',
      reasons,
      recommendedTests: tests,
    });
  }

  // 5. Deceased Pancreas Donation
  {
    const reasons: string[] = [];
    const tests = ['HbA1c & Fasting C-Peptide', 'Serum Amylase / Lipase', 'Abdominal CT'];
    let status: OrganEligibilityStatus = 'Eligible';
    let score = 92;

    if (hasSolidOrganInfectiousBlock || hasHepatitis) {
      status = 'Ineligible';
      score = 0;
      reasons.push('Transmissible infection or metastatic cancer contraindicates pancreas transplantation.');
    }
    if (chr.has('uncontrolled_diabetes') || chr.has('controlled_diabetes')) {
      status = 'Ineligible';
      score = 0;
      reasons.push('Diabetes mellitus directly reflects compromised endocrine beta-cell reserve.');
    }
    if (input.age > 55) {
      status = 'Ineligible';
      score = Math.min(score, 15);
      reasons.push('Pancreas procurement generally requires donor age ≤ 55 years.');
    } else if (input.age > 45 && status !== 'Ineligible') {
      status = 'Conditional';
      score -= 15;
      reasons.push('Age 46–55 requires normal HbA1c (< 6.0%) and low BMI.');
    }
    if (bmi > 30 && status !== 'Ineligible') {
      status = 'Ineligible';
      score = Math.min(score, 20);
      reasons.push(`BMI ${bmi} kg/m² (> 30) increases pancreatic fat infiltration and graft thrombosis risk.`);
    }
    if (input.alcoholUse === 'heavy' && status !== 'Ineligible') {
      status = 'Conditional';
      score -= 18;
      reasons.push('Heavy alcohol intake risks subclinical chronic pancreatitis.');
    }
    if (status === 'Eligible') {
      reasons.push('Normal glycemic history and BMI support whole-organ pancreas viability.');
    }

    assessments.push({
      organKey: 'pancreas_deceased',
      organLabel: 'Pancreas (Deceased Donation)',
      pathway: 'Deceased',
      status,
      score: status === 'Ineligible' ? Math.min(score, 25) : clampScore(score),
      summary:
        status === 'Eligible'
          ? 'Meets endocrine and metabolic criteria for deceased pancreas donation.'
          : status === 'Conditional'
          ? 'Conditional suitability pending HbA1c and pancreatic enzyme confirmation.'
          : 'Not eligible for pancreas donation.',
      reasons,
      recommendedTests: tests,
    });
  }

  // 6. Cornea & Ocular Tissue Donation
  {
    const reasons: string[] = [];
    const tests = ['Slit-Lamp Specular Microscopy', 'Serology Screening (HIV/HBV/HCV/Syphilis)'];
    let status: OrganEligibilityStatus = 'Eligible';
    let score = 97;

    if (inf.has('hiv') || inf.has('hepatitis_bc') || inf.has('sepsis_tb')) {
      status = 'Ineligible';
      score = 0;
      reasons.push('Active HIV, Hepatitis B/C, or systemic sepsis contraindicates corneal tissue banking.');
    } else if (inf.has('metastatic_cancer')) {
      status = 'Conditional';
      score = 68;
      reasons.push('Non-ocular cancers often still permit corneal donation after eye-bank pathology review.');
    } else {
      reasons.push('Chronic systemic conditions (diabetes, hypertension, CKD, smoking) usually do not prevent sight-restoring corneal donation.');
    }

    if (input.age > 80 && status !== 'Ineligible') {
      status = 'Conditional';
      score -= 18;
      reasons.push('Age above 80 requires endothelial cell density check (> 2,000 cells/mm²).');
    } else if (status === 'Eligible') {
      reasons.push(`Age (${input.age} yrs) falls well within eye-bank acceptance criteria (up to 80 yrs).`);
    }

    assessments.push({
      organKey: 'cornea_deceased',
      organLabel: 'Cornea & Ocular Tissue (Deceased)',
      pathway: 'Deceased',
      status,
      score: status === 'Ineligible' ? 0 : clampScore(score),
      summary:
        status === 'Eligible'
          ? 'Eligible for deceased corneal donation regardless of most systemic conditions.'
          : status === 'Conditional'
          ? 'Potentially eligible pending eye-bank endothelial cell count and tissue review.'
          : 'Contraindicated due to transmissible viral/systemic infection.',
      reasons,
      recommendedTests: tests,
    });
  }

  const eligibleCount = assessments.filter((a) => a.status === 'Eligible').length;
  const conditionalCount = assessments.filter((a) => a.status === 'Conditional').length;
  const ineligibleCount = assessments.filter((a) => a.status === 'Ineligible').length;

  const solidEligibleOrCond = assessments
    .filter((a) => a.organKey !== 'cornea_deceased' && a.status !== 'Ineligible')
    .length;
  const corneaOk = assessments.find((a) => a.organKey === 'cornea_deceased')?.status !== 'Ineligible';

  let overallReadiness: OverallReadiness;
  let summaryHeadline: string;

  if (eligibleCount >= 4) {
    overallReadiness = 'Strong Candidate';
    summaryHeadline = `Your health profile meets primary clinical criteria for ${eligibleCount} donation pathways across living and/or deceased programs.`;
  } else if (solidEligibleOrCond > 0) {
    overallReadiness = 'Conditional — Specialist Review';
    summaryHeadline = `You qualify or conditionally qualify for ${solidEligibleOrCond} solid-organ pathway(s) pending targeted hospital diagnostic verification.`;
  } else if (corneaOk) {
    overallReadiness = 'Deferred for Solid Organs (Cornea/Tissue Review)';
    summaryHeadline = 'Solid-organ donation is deferred under current clinical thresholds, though corneal/tissue donation remains viable.';
  } else {
    overallReadiness = 'Medically Ineligible';
    summaryHeadline = 'Current infectious or systemic contraindications defer solid-organ and ocular donation at this time.';
  }

  const nextSteps: string[] = [];
  if (!input.consentUnderstood) {
    nextSteps.push('Schedule an informed consent counseling session with a ZTCC Transplant Coordinator.');
  }
  if (overallReadiness === 'Strong Candidate') {
    nextSteps.push(
      input.pathwayPreference === 'living'
        ? 'Book baseline blood group confirmation, HLA typing, and renal/hepatic imaging at a certified network hospital.'
        : 'Confirm your donor consent preference in My Profile & Consent and inform next-of-kin of your deceased organ pledge.',
    );
  } else if (overallReadiness === 'Conditional — Specialist Review') {
    nextSteps.push('Share these flagged parameters with a transplant physician for individualized lab and imaging clearance.');
  } else {
    nextSteps.push('Consult your hospital physician regarding supportive care or tissue-registry alternatives.');
  }
  nextSteps.push(`Compatible recipient blood groups for your ${input.bloodGroup} profile: ${compatibleRecipientGroups.join(', ')}.`);

  return {
    bmi,
    bmiCategory,
    overallReadiness,
    summaryHeadline,
    compatibleRecipientGroups,
    eligibleCount,
    conditionalCount,
    ineligibleCount,
    organAssessments: assessments,
    nextSteps,
  };
}
