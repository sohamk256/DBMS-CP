import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  HeartPulse,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { api } from '../services/api';
import { StatusText } from './ui/StatusText';
import {
  calculateBmi,
  computeAgeFromDob,
  evaluateDonorEligibility,
  getBmiCategory,
  type AlcoholUse,
  type ChronicCondition,
  type DonationPathwayPreference,
  type EligibilityEvaluationResult,
  type HealthProfileInput,
  type InfectiousCondition,
  type SmokingStatus,
  type SurgeryHistory,
} from '../utils/eligibilityQuiz';
import type {
  AuthSession,
  BloodGroup,
  DonorRecord,
  EligibilityAssessmentRecord,
  RecipientRecord,
} from '../types/db';

interface EligibilityQuizViewProps {
  session: AuthSession;
  donor: DonorRecord | null;
  recipient: RecipientRecord | null;
}

const BLOOD_GROUPS: BloodGroup[] = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];

const INFECTIOUS_OPTIONS: { id: InfectiousCondition; label: string; detail: string }[] = [
  {
    id: 'hiv',
    label: 'Active HIV / AIDS',
    detail: 'Confirmed HIV seropositivity',
  },
  {
    id: 'hepatitis_bc',
    label: 'Active Hepatitis B or C',
    detail: 'Untreated active HBV (HBsAg+) or HCV viremia',
  },
  {
    id: 'sepsis_tb',
    label: 'Active Systemic Sepsis or Untreated Tuberculosis',
    detail: 'Acute bloodstream or disseminated mycobacterial infection',
  },
  {
    id: 'metastatic_cancer',
    label: 'Active Metastatic Malignancy',
    detail: 'Active non-localized solid tumor or hematologic cancer',
  },
];

const CHRONIC_OPTIONS: { id: ChronicCondition; label: string; detail: string }[] = [
  {
    id: 'controlled_diabetes',
    label: 'Controlled Type 2 Diabetes',
    detail: 'HbA1c < 7.0% without nephropathy or retinopathy',
  },
  {
    id: 'uncontrolled_diabetes',
    label: 'Uncontrolled Diabetes / Target-Organ Damage',
    detail: 'HbA1c > 8.0%, insulin-dependent microvascular complications',
  },
  {
    id: 'uncontrolled_hypertension',
    label: 'Uncontrolled Severe Hypertension',
    detail: 'BP > 160/100 mmHg or requiring ≥ 3 antihypertensives',
  },
  {
    id: 'chronic_kidney_disease',
    label: 'Chronic Kidney Disease / Bilateral Renal Stones',
    detail: 'eGFR < 60 mL/min or proteinuria',
  },
  {
    id: 'liver_disease',
    label: 'Chronic Liver Disease / Cirrhosis / Steatosis',
    detail: 'Fibrosis, chronic hepatitis, or moderate-to-severe fatty liver',
  },
  {
    id: 'cardiac_disease',
    label: 'Coronary Artery Disease / Heart Failure',
    detail: 'Prior MI, LVEF < 50%, or unstable arrhythmia',
  },
  {
    id: 'pulmonary_disease',
    label: 'COPD / Pulmonary Hypertension / Severe Asthma',
    detail: 'Chronic oxygen need or chronic systemic steroid therapy',
  },
];

export function EligibilityQuizView({ session, donor, recipient }: EligibilityQuizViewProps) {
  const prefilledAge = useMemo(() => {
    const dob = donor?.DOB || recipient?.DOB;
    return dob ? computeAgeFromDob(dob) ?? 30 : 30;
  }, [donor?.DOB, recipient?.DOB]);

  const prefilledBloodGroup: BloodGroup =
    donor?.Blood_Group || recipient?.Blood_Group || 'O+';

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [form, setForm] = useState<HealthProfileInput>({
    age: prefilledAge,
    heightCm: 170,
    weightKg: 68,
    bloodGroup: prefilledBloodGroup,
    pathwayPreference: donor?.Donor_Type === 'Living' ? 'living' : 'both',
    infectiousConditions: [],
    chronicConditions: [],
    smokingStatus: 'never',
    alcoholUse: 'none_occasional',
    surgeryHistory: 'none',
    consentUnderstood: true,
  });

  const [validationError, setValidationError] = useState<string | null>(null);
  const [result, setResult] = useState<EligibilityEvaluationResult | null>(null);
  const [pathwayFilter, setPathwayFilter] = useState<'all' | 'Living' | 'Deceased'>('all');
  const [saving, setSaving] = useState(false);
  const [saveBanner, setSaveBanner] = useState<string | null>(null);
  const [history, setHistory] = useState<EligibilityAssessmentRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await api.getEligibilityAssessments({
        identifier: session.identifier,
        linkedEntityId: session.linkedEntityId,
      });
      setHistory(res.assessments);
    } catch {
      // Non-fatal if history hasn't been created yet
    } finally {
      setLoadingHistory(false);
    }
  }, [session.identifier, session.linkedEntityId]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const liveBmi = calculateBmi(form.heightCm, form.weightKg);

  const toggleInfectious = (cond: InfectiousCondition) => {
    setForm((prev) => ({
      ...prev,
      infectiousConditions: prev.infectiousConditions.includes(cond)
        ? prev.infectiousConditions.filter((c) => c !== cond)
        : [...prev.infectiousConditions, cond],
    }));
  };

  const toggleChronic = (cond: ChronicCondition) => {
    setForm((prev) => ({
      ...prev,
      chronicConditions: prev.chronicConditions.includes(cond)
        ? prev.chronicConditions.filter((c) => c !== cond)
        : [...prev.chronicConditions, cond],
    }));
  };

  const validateStep1 = (): boolean => {
    if (!Number.isFinite(form.age) || form.age < 10 || form.age > 100) {
      setValidationError('Please enter a valid age between 10 and 100 years.');
      return false;
    }
    if (!Number.isFinite(form.heightCm) || form.heightCm < 100 || form.heightCm > 235) {
      setValidationError('Please enter a valid height between 100 cm and 235 cm.');
      return false;
    }
    if (!Number.isFinite(form.weightKg) || form.weightKg < 25 || form.weightKg > 250) {
      setValidationError('Please enter a valid weight between 25 kg and 250 kg.');
      return false;
    }
    setValidationError(null);
    return true;
  };

  const handleNext = () => {
    if (step === 1 && !validateStep1()) return;
    setValidationError(null);
    setStep((prev) => (prev < 3 ? ((prev + 1) as 1 | 2 | 3) : prev));
  };

  const handleEvaluate = async () => {
    if (!validateStep1()) {
      setStep(1);
      return;
    }
    const evaluated = evaluateDonorEligibility(form);
    setResult(evaluated);
    setPathwayFilter(
      form.pathwayPreference === 'living'
        ? 'Living'
        : form.pathwayPreference === 'deceased'
        ? 'Deceased'
        : 'all',
    );
    setStep(4);
    setSaving(true);
    setSaveBanner(null);

    try {
      await api.saveEligibilityAssessment({
        identifier: session.identifier,
        displayName: session.displayName,
        linkedEntityId: session.linkedEntityId,
        age: form.age,
        bmi: evaluated.bmi,
        bloodGroup: form.bloodGroup,
        pathwayPreference: form.pathwayPreference,
        overallReadiness: evaluated.overallReadiness,
        eligibleCount: evaluated.eligibleCount,
        conditionalCount: evaluated.conditionalCount,
        ineligibleCount: evaluated.ineligibleCount,
        result: evaluated,
      });
      setSaveBanner('Assessment evaluated and archived to your OrganLink SQLite record.');
      await loadHistory();
    } catch (err) {
      setSaveBanner(
        err instanceof Error
          ? `Evaluated locally (unable to archive: ${err.message}).`
          : 'Evaluated locally.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleResetQuiz = () => {
    setValidationError(null);
    setSaveBanner(null);
    setResult(null);
    setStep(1);
  };

  const handleLoadPastAssessment = (record: EligibilityAssessmentRecord) => {
    try {
      const parsed = JSON.parse(record.Result_JSON) as EligibilityEvaluationResult;
      if (parsed && Array.isArray(parsed.organAssessments)) {
        setResult(parsed);
        setPathwayFilter('all');
        setStep(4);
        setSaveBanner(`Viewing archived assessment #${record.Assessment_ID} (${record.Created_At.slice(0, 10)}).`);
      }
    } catch {
      // Ignore malformed historical payload
    }
  };

  const displayedOrgans = useMemo(() => {
    if (!result) return [];
    if (pathwayFilter === 'all') return result.organAssessments;
    return result.organAssessments.filter((o) => o.pathway === pathwayFilter);
  }, [pathwayFilter, result]);

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-teal-700">
              NOTTO / ZTCC Clinical Pre-Screening Tool
            </p>
            <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-900">
              Organ Donation Eligibility Quiz
            </h1>
            <p className="mt-1 text-xs text-slate-600 max-w-2xl">
              Evaluate medical suitability across living kidney, living partial liver, deceased visceral organ, and corneal donation pathways based on your biometrics, medical history, and lifestyle profile.
            </p>
          </div>

          {step === 4 && (
            <button
              type="button"
              onClick={handleResetQuiz}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Retake Eligibility Quiz
            </button>
          )}
        </div>

        {/* Step Indicator */}
        {step < 4 && (
          <div className="mt-5 pt-4 border-t border-slate-100 grid grid-cols-3 gap-3">
            {[
              { n: 1, title: '1. Biometrics & Blood Type' },
              { n: 2, title: '2. Infectious & Chronic History' },
              { n: 3, title: '3. Lifestyle & Consent' },
            ].map((s) => {
              const active = step === s.n;
              const completed = step > s.n;
              return (
                <button
                  key={s.n}
                  type="button"
                  onClick={() => {
                    if (s.n < step || (s.n === 2 && validateStep1()) || (s.n === 3 && validateStep1())) {
                      setStep(s.n as 1 | 2 | 3);
                    }
                  }}
                  className={`rounded-md border px-3 py-2 text-left text-xs font-medium transition-colors ${
                    active
                      ? 'border-teal-600 bg-teal-50/70 text-teal-900 font-semibold'
                      : completed
                      ? 'border-slate-200 bg-slate-50 text-slate-700'
                      : 'border-slate-200 bg-white text-slate-400'
                  }`}
                >
                  {s.title}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {validationError && (
        <div
          role="alert"
          className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-800 flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{validationError}</span>
        </div>
      )}

      {/* Step 1: Demographics & Biometrics */}
      {step === 1 && (
        <section className="rounded-lg border border-slate-200 bg-white p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <label htmlFor="quiz-age" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Age (Years)
              </label>
              <input
                id="quiz-age"
                type="number"
                min={10}
                max={100}
                value={form.age}
                onChange={(e) => setForm((p) => ({ ...p, age: Number(e.target.value) }))}
                className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-slate-500">Living donation requires age ≥ 18 yrs.</p>
            </div>

            <div>
              <label htmlFor="quiz-height" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Height (cm)
              </label>
              <input
                id="quiz-height"
                type="number"
                min={100}
                max={235}
                value={form.heightCm}
                onChange={(e) => setForm((p) => ({ ...p, heightCm: Number(e.target.value) }))}
                className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="quiz-weight" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Weight (kg)
              </label>
              <input
                id="quiz-weight"
                type="number"
                min={25}
                max={250}
                value={form.weightKg}
                onChange={(e) => setForm((p) => ({ ...p, weightKg: Number(e.target.value) }))}
                className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2 border-t border-slate-100">
            <div>
              <label htmlFor="quiz-blood" className="block text-xs font-semibold text-slate-700 mb-1.5">
                ABO / Rh Blood Group
              </label>
              <select
                id="quiz-blood"
                value={form.bloodGroup}
                onChange={(e) => setForm((p) => ({ ...p, bloodGroup: e.target.value as BloodGroup }))}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
              >
                {BLOOD_GROUPS.map((bg) => (
                  <option key={bg} value={bg}>
                    {bg}
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium text-slate-500">Computed Body Mass Index (BMI)</p>
                <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-slate-900">
                  {liveBmi ? `${liveBmi} kg/m²` : '—'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-medium text-slate-500">Classification</p>
                <p className="mt-0.5 text-xs font-semibold text-teal-800">
                  {liveBmi ? getBmiCategory(liveBmi) : 'Invalid Input'}
                </p>
              </div>
            </div>
          </div>

          <fieldset className="pt-2 border-t border-slate-100">
            <legend className="text-xs font-semibold text-slate-700 mb-2.5">
              Which Donation Pathways Would You Like to Evaluate?
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                {
                  id: 'both' as DonationPathwayPreference,
                  title: 'Both Living & Deceased',
                  desc: 'Evaluate all 6 organ & tissue pathways',
                },
                {
                  id: 'living' as DonationPathwayPreference,
                  title: 'Living Donation Focus',
                  desc: 'Living kidney & partial liver criteria',
                },
                {
                  id: 'deceased' as DonationPathwayPreference,
                  title: 'Deceased Pledge Focus',
                  desc: 'Heart, lungs, pancreas, kidney, liver & cornea',
                },
              ].map((opt) => (
                <label
                  key={opt.id}
                  className={`cursor-pointer rounded-md border p-3 transition-colors ${
                    form.pathwayPreference === opt.id
                      ? 'border-teal-600 bg-teal-50/50'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="pathwayPreference"
                      value={opt.id}
                      checked={form.pathwayPreference === opt.id}
                      onChange={() => setForm((p) => ({ ...p, pathwayPreference: opt.id }))}
                      className="accent-teal-700"
                    />
                    <span className="text-xs font-semibold text-slate-900">{opt.title}</span>
                  </div>
                  <p className="mt-1 pl-5 text-[11px] text-slate-500">{opt.desc}</p>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex justify-end pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={handleNext}
              className="inline-flex items-center gap-1.5 rounded-md bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 transition-colors"
            >
              Continue to Medical Screening
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </section>
      )}

      {/* Step 2: Infectious & Chronic Medical Conditions */}
      {step === 2 && (
        <section className="rounded-lg border border-slate-200 bg-white p-6 space-y-6">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Infectious &amp; Oncologic Contraindications
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Select any active diagnosis that applies. Leave unchecked if none apply.
            </p>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {INFECTIOUS_OPTIONS.map((opt) => {
                const checked = form.infectiousConditions.includes(opt.id);
                return (
                  <label
                    key={opt.id}
                    className={`cursor-pointer rounded-md border p-3 flex items-start gap-2.5 transition-colors ${
                      checked ? 'border-rose-300 bg-rose-50/50' : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleInfectious(opt.id)}
                      className="mt-0.5 accent-teal-700"
                    />
                    <div>
                      <p className="text-xs font-semibold text-slate-900">{opt.label}</p>
                      <p className="text-[11px] text-slate-500">{opt.detail}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900">
              Chronic Organ &amp; Systemic Health Conditions
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Select any pre-existing chronic condition so each organ pathway can be scored accurately.
            </p>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {CHRONIC_OPTIONS.map((opt) => {
                const checked = form.chronicConditions.includes(opt.id);
                return (
                  <label
                    key={opt.id}
                    className={`cursor-pointer rounded-md border p-3 flex items-start gap-2.5 transition-colors ${
                      checked ? 'border-amber-300 bg-amber-50/50' : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleChronic(opt.id)}
                      className="mt-0.5 accent-teal-700"
                    />
                    <div>
                      <p className="text-xs font-semibold text-slate-900">{opt.label}</p>
                      <p className="text-[11px] text-slate-500">{opt.detail}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="inline-flex items-center gap-1.5 rounded-md bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 transition-colors"
            >
              Continue to Lifestyle &amp; Consent
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </section>
      )}

      {/* Step 3: Lifestyle, Surgical History & Consent */}
      {step === 3 && (
        <section className="rounded-lg border border-slate-200 bg-white p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <label htmlFor="quiz-smoking" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Tobacco / Smoking History
              </label>
              <select
                id="quiz-smoking"
                value={form.smokingStatus}
                onChange={(e) => setForm((p) => ({ ...p, smokingStatus: e.target.value as SmokingStatus }))}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-teal-600 focus:outline-none"
              >
                <option value="never">Non-Smoker</option>
                <option value="former">Former Smoker (&gt; 1 year quit)</option>
                <option value="active">Active Smoker</option>
              </select>
            </div>

            <div>
              <label htmlFor="quiz-alcohol" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Alcohol Consumption
              </label>
              <select
                id="quiz-alcohol"
                value={form.alcoholUse}
                onChange={(e) => setForm((p) => ({ ...p, alcoholUse: e.target.value as AlcoholUse }))}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-teal-600 focus:outline-none"
              >
                <option value="none_occasional">None / Occasional</option>
                <option value="moderate">Moderate Social Use</option>
                <option value="heavy">Heavy / Chronic Use</option>
              </select>
            </div>

            <div>
              <label htmlFor="quiz-surgery" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Prior Abdominal / Thoracic Surgery
              </label>
              <select
                id="quiz-surgery"
                value={form.surgeryHistory}
                onChange={(e) => setForm((p) => ({ ...p, surgeryHistory: e.target.value as SurgeryHistory }))}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-teal-600 focus:outline-none"
              >
                <option value="none">No Prior Major Surgery</option>
                <option value="minor">Minor / Uncomplicated Procedure</option>
                <option value="major_organ">Major Abdominal or Thoracic Resection</option>
              </select>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100">
            <label className="flex items-start gap-2.5 cursor-pointer rounded-md border border-slate-200 bg-slate-50 p-3.5">
              <input
                type="checkbox"
                checked={form.consentUnderstood}
                onChange={(e) => setForm((p) => ({ ...p, consentUnderstood: e.target.checked }))}
                className="mt-0.5 accent-teal-700"
              />
              <div>
                <p className="text-xs font-semibold text-slate-900">
                  Voluntary Informed Consent &amp; Next-of-Kin Awareness
                </p>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  I understand organ donation under THOTA / ZTCC Maharashtra is strictly voluntary, non-commercial, and requires formal hospital clinical testing prior to final clearance.
                </p>
              </div>
            </label>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleEvaluate()}
              className="inline-flex items-center gap-1.5 rounded-md bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50 transition-colors"
            >
              <ClipboardCheck className="w-3.5 h-3.5" />
              {saving ? 'Evaluating Profile...' : 'Evaluate Organ Eligibility'}
            </button>
          </div>
        </section>
      )}

      {/* Step 4: Clinical Evaluation Results Matrix */}
      {step === 4 && result && (
        <div className="space-y-6" data-testid="eligibility-results">
          {saveBanner && (
            <div className="rounded-md border border-teal-200 bg-teal-50 px-4 py-2.5 text-xs font-medium text-teal-900 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0" />
              <span>{saveBanner}</span>
            </div>
          )}

          {/* Summary KPI Strip */}
          <section className="rounded-lg border border-slate-200 bg-white p-6">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <p className="text-xs font-medium text-slate-500">Overall Screening Assessment</p>
                <h2 className="mt-1 text-lg font-bold text-slate-900">{result.overallReadiness}</h2>
                <p className="mt-1 text-xs text-slate-600">{result.summaryHeadline}</p>
              </div>
              <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 p-1">
                {(['all', 'Living', 'Deceased'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setPathwayFilter(f)}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      pathwayFilter === f
                        ? 'bg-white text-teal-800 font-semibold shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {f === 'all' ? 'All Pathways' : `${f} Only`}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-5">
              <div>
                <p className="text-[11px] font-medium text-slate-500">Eligible Pathways</p>
                <p className="mt-0.5 font-mono text-xl font-semibold tabular-nums text-teal-700">
                  {result.eligibleCount} / {result.organAssessments.length}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-slate-500">Conditional Review</p>
                <p className="mt-0.5 font-mono text-xl font-semibold tabular-nums text-amber-700">
                  {result.conditionalCount}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-slate-500">Calculated BMI</p>
                <p className="mt-0.5 font-mono text-xl font-semibold tabular-nums text-slate-900">
                  {result.bmi} <span className="text-xs font-sans font-normal text-slate-500">({result.bmiCategory})</span>
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-slate-500">Compatible Recipient Groups</p>
                <p className="mt-0.5 font-mono text-sm font-semibold text-slate-900">
                  {result.compatibleRecipientGroups.join(', ')}
                </p>
              </div>
            </div>
          </section>

          {/* Organ-by-Organ Eligibility Matrix */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {displayedOrgans.map((item) => (
              <article
                key={item.organKey}
                className="rounded-lg border border-slate-200 bg-white p-5 flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                    <div>
                      <p className="text-[11px] font-medium text-slate-500">
                        {item.pathway} Donation Pathway
                      </p>
                      <h3 className="text-sm font-bold text-slate-900 mt-0.5">{item.organLabel}</h3>
                    </div>
                    <div className="text-right shrink-0">
                      <StatusText value={item.status} />
                      <p className="mt-1 font-mono text-xs text-slate-500 tabular-nums">
                        Score: {item.score}/100
                      </p>
                    </div>
                  </div>

                  <p className="text-xs text-slate-700 font-medium">{item.summary}</p>

                  <ul className="space-y-1.5 text-xs text-slate-600">
                    {item.reasons.map((reason, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-teal-700 font-bold mt-0.5">·</span>
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-3 border-t border-slate-100">
                  <p className="text-[11px] font-semibold text-slate-500 mb-1">
                    Recommended Hospital Lab Screening
                  </p>
                  <p className="text-xs text-slate-700">{item.recommendedTests.join(' · ')}</p>
                </div>
              </article>
            ))}
          </div>

          {/* Actionable Next Steps */}
          <section className="rounded-lg border border-slate-200 bg-white p-6">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <HeartPulse className="w-4 h-4 text-teal-700" />
              Recommended Clinical Next Steps
            </h3>
            <ul className="mt-3 space-y-2 text-xs text-slate-700">
              {result.nextSteps.map((stepText, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-teal-700 mt-0.5 shrink-0" />
                  <span>{stepText}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      {/* Persisted Assessment History */}
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-900">Saved Eligibility Assessments</h2>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">SQLite Registry History</span>
        </div>

        {loadingHistory ? (
          <p className="text-xs text-slate-500">Loading saved assessments...</p>
        ) : history.length === 0 ? (
          <p className="text-xs text-slate-500">
            No eligibility assessments saved yet. Complete the 3-step quiz above to archive an evaluation.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {history.map((item) => (
              <div
                key={item.Assessment_ID}
                className="py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs"
              >
                <div>
                  <p className="font-semibold text-slate-900">{item.Overall_Readiness}</p>
                  <p className="text-[11px] text-slate-500 font-mono">
                    {item.Created_At} · Age {item.Age} · BMI {item.BMI} · Blood {item.Blood_Group} ·{' '}
                    {item.Eligible_Count} Eligible / {item.Conditional_Count} Conditional
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleLoadPastAssessment(item)}
                  className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:border-teal-600 hover:text-teal-800 transition-colors"
                >
                  View Report
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
