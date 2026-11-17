import type {
  BloodGroup,
  MatchCandidate,
  OrganRecord,
  RecipientRecord,
  UrgencyLevel,
} from '../types/db';

const COMPATIBLE_RECIPIENTS: Record<BloodGroup, BloodGroup[]> = {
  'O-': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
  'O+': ['O+', 'A+', 'B+', 'AB+'],
  'A-': ['A-', 'A+', 'AB-', 'AB+'],
  'A+': ['A+', 'AB+'],
  'B-': ['B-', 'B+', 'AB-', 'AB+'],
  'B+': ['B+', 'AB+'],
  'AB-': ['AB-', 'AB+'],
  'AB+': ['AB+'],
};

const URGENCY_WEIGHT: Record<UrgencyLevel, number> = {
  Emergency: 30,
  Critical: 24,
  Urgent: 16,
  Routine: 8,
};

export function isBloodCompatible(donorGroup: BloodGroup, recipientGroup: BloodGroup): boolean {
  const allowed = COMPATIBLE_RECIPIENTS[donorGroup];
  if (!allowed) {
    return false;
  }
  return allowed.includes(recipientGroup);
}

export function getCompatibleRecipientGroups(donorGroup: BloodGroup): BloodGroup[] {
  return COMPATIBLE_RECIPIENTS[donorGroup] ?? [];
}

export function calculateCompatibilityScore(
  organ: Pick<OrganRecord, 'OrganType' | 'BloodGroup' | 'RetrievalHospitalID'>,
  recipient: RecipientRecord,
  hospitalCityById: Record<number, string> = {},
): MatchCandidate | null {
  if (organ.OrganType !== recipient.RequiredOrgan) {
    return null;
  }
  if (!isBloodCompatible(organ.BloodGroup, recipient.Blood_Group)) {
    return null;
  }

  const exactBlood = organ.BloodGroup === recipient.Blood_Group;
  const bloodScore = exactBlood ? 35 : 25;
  const urgencyScore = URGENCY_WEIGHT[recipient.UrgencyLevel] ?? 8;
  const clampedPriority = Math.max(0, Math.min(100, Number(recipient.PriorityScore) || 0));
  const priorityContribution = (clampedPriority / 100) * 20;

  const retrievalCity = hospitalCityById[organ.RetrievalHospitalID];
  const recipientCity = hospitalCityById[recipient.RegisteringHospitalID];
  const sameHospital = organ.RetrievalHospitalID === recipient.RegisteringHospitalID;
  const sameCity = Boolean(retrievalCity && recipientCity && retrievalCity === recipientCity);
  const proximityScore = sameHospital ? 15 : sameCity ? 11 : 5;

  const totalScore = Math.round(
    Math.min(100, bloodScore + urgencyScore + priorityContribution + proximityScore) * 100,
  ) / 100;

  const reasons: string[] = [
    exactBlood
      ? `Exact ABO/Rh match (${organ.BloodGroup})`
      : `Compatible ABO/Rh (${organ.BloodGroup} to ${recipient.Blood_Group})`,
    `${recipient.UrgencyLevel} clinical urgency`,
    `Waitlist priority ${clampedPriority.toFixed(1)}`,
  ];

  if (sameHospital) {
    reasons.push('Same retrieval & transplant center (minimal cold ischemia)');
  } else if (sameCity) {
    reasons.push(`Intra-city transfer (${retrievalCity})`);
  } else if (retrievalCity && recipientCity) {
    reasons.push(`Inter-city transfer (${retrievalCity} to ${recipientCity})`);
  }

  return {
    recipient,
    compatibilityScore: totalScore,
    bloodMatchType: exactBlood ? 'Exact' : 'Compatible',
    sameCity,
    sameHospital,
    reasons,
  };
}

export function rankCompatibleRecipients(
  organ: Pick<OrganRecord, 'OrganType' | 'BloodGroup' | 'RetrievalHospitalID'>,
  recipients: RecipientRecord[],
  hospitalCityById: Record<number, string> = {},
): MatchCandidate[] {
  return recipients
    .filter((r) => r.RecipientStatus === 'Waiting')
    .map((r) => calculateCompatibilityScore(organ, r, hospitalCityById))
    .filter((candidate): candidate is MatchCandidate => candidate !== null)
    .sort((a, b) => b.compatibilityScore - a.compatibilityScore);
}

export function calculateRecipientPriorityScore(params: {
  urgencyLevel: UrgencyLevel;
  previousTransplantHistory: boolean;
  waitingDays: number;
}): number {
  const baseByUrgency: Record<UrgencyLevel, number> = {
    Emergency: 90,
    Critical: 76,
    Urgent: 58,
    Routine: 38,
  };
  const base = baseByUrgency[params.urgencyLevel] ?? 38;
  const historyBonus = params.previousTransplantHistory ? 4 : 0;
  const waitBonus = Math.min(6, Math.max(0, Math.floor(params.waitingDays / 30)));
  return Math.min(100, Math.round((base + historyBonus + waitBonus) * 100) / 100);
}

export function getPreservationStatus(
  organ: Pick<OrganRecord, 'PreservationStartTime' | 'ExpiryTime' | 'MaxPreservationHours' | 'OrganStatus'>,
  referenceTimeMs: number = Date.now(),
): {
  remainingHours: number;
  elapsedHours: number;
  percentRemaining: number;
  windowState: 'Transplanted' | 'Expired' | 'Critical Window' | 'Nominal' | 'Inactive';
} {
  if (organ.OrganStatus === 'Transplanted') {
    return {
      remainingHours: 0,
      elapsedHours: organ.MaxPreservationHours,
      percentRemaining: 100,
      windowState: 'Transplanted',
    };
  }
  if (organ.OrganStatus === 'Rejected' || organ.OrganStatus === 'Expired') {
    return {
      remainingHours: 0,
      elapsedHours: organ.MaxPreservationHours,
      percentRemaining: 0,
      windowState: organ.OrganStatus === 'Expired' ? 'Expired' : 'Inactive',
    };
  }

  const startMs = new Date(organ.PreservationStartTime.replace(' ', 'T')).getTime();
  const expiryMs = new Date(organ.ExpiryTime.replace(' ', 'T')).getTime();
  const totalMs = Math.max(1, expiryMs - startMs);
  const remainingMs = expiryMs - referenceTimeMs;
  const elapsedMs = Math.max(0, referenceTimeMs - startMs);

  const remainingHours = Math.max(0, Math.round((remainingMs / 3600000) * 10) / 10);
  const elapsedHours = Math.round((elapsedMs / 3600000) * 10) / 10;
  const percentRemaining = Math.max(0, Math.min(100, Math.round((remainingMs / totalMs) * 100)));

  if (remainingMs <= 0) {
    return {
      remainingHours: 0,
      elapsedHours,
      percentRemaining: 0,
      windowState: 'Expired',
    };
  }

  return {
    remainingHours,
    elapsedHours,
    percentRemaining,
    windowState: percentRemaining <= 25 || remainingHours <= 2 ? 'Critical Window' : 'Nominal',
  };
}

export function validateSqlQuery(
  rawSql: string,
  allowMutations: boolean,
): { valid: true; normalized: string; kind: 'read' | 'write' } | { valid: false; error: string } {
  const trimmed = rawSql.trim();
  if (!trimmed) {
    return { valid: false, error: 'SQL query cannot be empty.' };
  }

  const stripped = trimmed.replace(/\/\*[\s\S]*?\*\/|--.*$/gm, '').trim();
  if (!stripped) {
    return { valid: false, error: 'SQL query contains only comments.' };
  }

  const normalizedUpper = stripped.toUpperCase();
  const forbiddenKeywords = ['ATTACH ', 'DETACH ', 'DROP TABLE', 'DROP TRIGGER', 'DROP VIEW', 'VACUUM'];
  for (const kw of forbiddenKeywords) {
    if (normalizedUpper.includes(kw)) {
      return { valid: false, error: `Destructive command "${kw.trim()}" is blocked in the registry console.` };
    }
  }

  const isRead =
    normalizedUpper.startsWith('SELECT') ||
    normalizedUpper.startsWith('WITH') ||
    normalizedUpper.startsWith('PRAGMA') ||
    normalizedUpper.startsWith('EXPLAIN');

  if (isRead) {
    return { valid: true, normalized: stripped, kind: 'read' };
  }

  if (!allowMutations) {
    return {
      valid: false,
      error: 'Read-only mode is active. Enable Write Mode to execute INSERT or UPDATE statements.',
    };
  }

  if (
    normalizedUpper.startsWith('INSERT') ||
    normalizedUpper.startsWith('UPDATE') ||
    normalizedUpper.startsWith('DELETE')
  ) {
    return { valid: true, normalized: stripped, kind: 'write' };
  }

  return {
    valid: false,
    error: 'Only SELECT, WITH, PRAGMA, EXPLAIN, INSERT, UPDATE, and DELETE statements are supported.',
  };
}
