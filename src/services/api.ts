import type {
  AllocationRecord,
  AuthSession,
  DonorRecord,
  EligibilityAssessmentRecord,
  HospitalRecord,
  HospitalResourceRecord,
  MatchCandidate,
  MedicalTestRecord,
  OrganRecord,
  RecipientAuditRecord,
  RecipientRecord,
  RegionalTrendsResponse,
  SchemaTableInfo,
  SystemActivityRecord,
  UserProfileData,
  UserRole,
} from '../types/db';
import type { ResourceAvailabilitySnapshot } from '../utils/resourceAvailability';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
    ...options,
  });

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : `Request failed (${res.status})`);
  }
  return data as T;
}

export interface HealthResponse {
  status: string;
  engine: string;
  counts: {
    hospitals: number;
    donors: number;
    organs: number;
    recipients: number;
    medicalTests: number;
    allocations: number;
    auditLogs: number;
  };
}

export interface AuthDirectoryResponse {
  donors: {
    id: number;
    name: string;
    identifier: string;
    bloodGroup: string;
    detail: string;
    status: string;
  }[];
  recipients: {
    id: number;
    name: string;
    identifier: string;
    bloodGroup: string;
    detail: string;
    status: string;
    urgency: string;
  }[];
  hospitals: {
    id: number;
    name: string;
    city: string;
    type: string;
    license: string;
    certified: number;
  }[];
}

export interface DashboardSummaryResponse {
  kpis: {
    totalHospitals: number;
    certifiedHospitals: number;
    totalDonors: number;
    pendingLegalDonors: number;
    waitingRecipients: number;
    emergencyRecipients: number;
    availableOrgans: number;
    activeAllocations: number;
    completedTransplants: number;
    greenCorridors: number;
  };
  organDemandSupply: {
    organType: string;
    availableOrgans: number;
    totalOrgans: number;
    waitingRecipients: number;
  }[];
  bloodGroupMatrix: {
    bloodGroup: string;
    donors: number;
    waitingRecipients: number;
    availableOrgans: number;
  }[];
  cityDistribution: {
    city: string;
    hospitals: number;
    donors: number;
    recipients: number;
  }[];
}

export const api = {
  getHealth: () => request<HealthResponse>('/api/health'),
  getAuthDirectory: () => request<AuthDirectoryResponse>('/api/auth/directory'),
  login: (payload: { role: UserRole; identifier: string; password: string }) =>
    request<{ session: AuthSession }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  register: (payload: Record<string, unknown>) =>
    request<{ session: AuthSession; id: number }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getSummary: (hospitalId?: number) =>
    request<DashboardSummaryResponse>(
      hospitalId ? `/api/dashboard/summary?hospitalId=${hospitalId}` : '/api/dashboard/summary',
    ),
  getRegionalTrends: () => request<RegionalTrendsResponse>('/api/analytics/regional-trends'),
  getProfile: (params: { role: UserRole; identifier: string; linkedEntityId?: number | null }) => {
    const qs = new URLSearchParams({ role: params.role, identifier: params.identifier });
    if (params.linkedEntityId) qs.set('linkedEntityId', String(params.linkedEntityId));
    return request<{ profile: UserProfileData }>(`/api/profile?${qs.toString()}`);
  },
  updateProfile: (payload: Record<string, unknown>) =>
    request<{ ok: boolean; displayName: string }>('/api/profile', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  getEligibilityAssessments: (params: { identifier: string; linkedEntityId?: number | null }) => {
    const qs = new URLSearchParams({ identifier: params.identifier });
    if (params.linkedEntityId) qs.set('linkedEntityId', String(params.linkedEntityId));
    return request<{ assessments: EligibilityAssessmentRecord[] }>(`/api/eligibility-assessments?${qs.toString()}`);
  },
  saveEligibilityAssessment: (payload: Record<string, unknown>) =>
    request<{ assessment: EligibilityAssessmentRecord }>('/api/eligibility-assessments', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  sendChatMessage: (payload: {
    message: string;
    history: { role: 'user' | 'model'; text: string }[];
    context?: {
      screen?: string;
      role?: string | null;
      subRole?: string | null;
      activeTab?: string | null;
      displayName?: string | null;
      linkedEntityId?: number | null;
    };
  }) =>
    request<{ reply: string }>('/api/chat', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getHospitals: (params?: { city?: string; certified?: string }) => {
    const qs = new URLSearchParams();
    if (params?.city) qs.set('city', params.city);
    if (params?.certified) qs.set('certified', params.certified);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<{ hospitals: HospitalRecord[] }>(`/api/hospitals${suffix}`);
  },
  createHospital: (payload: Record<string, unknown>) =>
    request<{ hospital: HospitalRecord }>('/api/hospitals', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateHospital: (id: number, payload: Partial<HospitalRecord>) =>
    request<{ hospital: HospitalRecord }>(`/api/hospitals/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  getResources: (hospitalId?: number) =>
    request<{ resources: HospitalResourceRecord[]; snapshot: ResourceAvailabilitySnapshot }>(
      hospitalId ? `/api/resources?hospitalId=${hospitalId}` : '/api/resources',
    ),
  updateHospitalResources: (
    hospitalId: number,
    payload: Partial<{
      ICU_Beds_Occupied: number;
      Isolation_Beds_Occupied: number;
      Ward_Beds_Occupied: number;
      Theaters_Ready: number;
      Theaters_In_Use: number;
      Theaters_Sanitizing: number;
      Surgical_Teams_On_Call: number;
      Next_Theater_Available_Min: number;
      Notes: string | null;
      actorName: string;
    }>,
  ) =>
    request<{ resource: HospitalResourceRecord; snapshot: ResourceAvailabilitySnapshot }>(
      `/api/resources/${hospitalId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
    ),
  getDonors: (params?: { hospitalId?: number; status?: string; legalStatus?: string; search?: string }) => {
    const qs = new URLSearchParams();
    if (params?.hospitalId) qs.set('hospitalId', String(params.hospitalId));
    if (params?.status) qs.set('status', params.status);
    if (params?.legalStatus) qs.set('legalStatus', params.legalStatus);
    if (params?.search) qs.set('search', params.search);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<{ donors: DonorRecord[] }>(`/api/donors${suffix}`);
  },
  getDonorDetail: (id: number) =>
    request<{
      donor: DonorRecord;
      organs: OrganRecord[];
      tests: MedicalTestRecord[];
      allocations: AllocationRecord[];
    }>(`/api/donors/${id}`),
  createDonor: (payload: Record<string, unknown>) =>
    request<{ donor: DonorRecord }>('/api/donors', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateDonor: (id: number, payload: Record<string, unknown>) =>
    request<{ donor: DonorRecord }>(`/api/donors/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  getRecipients: (params?: { hospitalId?: number; status?: string; organ?: string; urgency?: string; search?: string }) => {
    const qs = new URLSearchParams();
    if (params?.hospitalId) qs.set('hospitalId', String(params.hospitalId));
    if (params?.status) qs.set('status', params.status);
    if (params?.organ) qs.set('organ', params.organ);
    if (params?.urgency) qs.set('urgency', params.urgency);
    if (params?.search) qs.set('search', params.search);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<{ recipients: RecipientRecord[] }>(`/api/recipients${suffix}`);
  },
  getRecipientDetail: (id: number) =>
    request<{
      recipient: RecipientRecord;
      queuePosition: number | null;
      queueTotal: number;
      tests: MedicalTestRecord[];
      allocations: AllocationRecord[];
      compatibleOrgans: {
        organ: OrganRecord;
        compatibilityScore: number;
        bloodMatchType: 'Exact' | 'Compatible';
        reasons: string[];
      }[];
    }>(`/api/recipients/${id}`),
  createRecipient: (payload: Record<string, unknown>) =>
    request<{ recipient: RecipientRecord }>('/api/recipients', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateRecipient: (id: number, payload: Record<string, unknown>) =>
    request<{ recipient: RecipientRecord }>(`/api/recipients/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  getOrgans: (params?: { hospitalId?: number; status?: string; organType?: string }) => {
    const qs = new URLSearchParams();
    if (params?.hospitalId) qs.set('hospitalId', String(params.hospitalId));
    if (params?.status) qs.set('status', params.status);
    if (params?.organType) qs.set('organType', params.organType);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<{ organs: OrganRecord[] }>(`/api/organs${suffix}`);
  },
  createOrgan: (payload: Record<string, unknown>) =>
    request<{ organ: OrganRecord }>('/api/organs', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateOrgan: (id: number, payload: Record<string, unknown>) =>
    request<{ organ: OrganRecord }>(`/api/organs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  getMedicalTests: (params?: { hospitalId?: number; personId?: number; result?: string }) => {
    const qs = new URLSearchParams();
    if (params?.hospitalId) qs.set('hospitalId', String(params.hospitalId));
    if (params?.personId) qs.set('personId', String(params.personId));
    if (params?.result) qs.set('result', params.result);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<{ tests: MedicalTestRecord[] }>(`/api/medical-tests${suffix}`);
  },
  createMedicalTest: (payload: Record<string, unknown>) =>
    request<{ test: MedicalTestRecord }>('/api/medical-tests', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getMatchCandidates: (organId: number) =>
    request<{ organ: OrganRecord; candidates: MatchCandidate[] }>(`/api/matching/candidates/${organId}`),
  getAllocations: (params?: { hospitalId?: number; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.hospitalId) qs.set('hospitalId', String(params.hospitalId));
    if (params?.status) qs.set('status', params.status);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<{ allocations: AllocationRecord[] }>(`/api/allocations${suffix}`);
  },
  createAllocation: (payload: Record<string, unknown>) =>
    request<{ allocation: AllocationRecord }>('/api/allocations', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateAllocation: (id: number, payload: Record<string, unknown>) =>
    request<{ allocation: AllocationRecord }>(`/api/allocations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  getSchema: () =>
    request<{
      tables: SchemaTableInfo[];
      triggers: { name: string; tbl_name: string; sql: string }[];
    }>('/api/dbms/schema'),
  getAuditLogs: () =>
    request<{
      recipientAudit: RecipientAuditRecord[];
      systemLogs: SystemActivityRecord[];
    }>('/api/dbms/audit-logs'),
  runSqlQuery: (sql: string, allowMutations = false) =>
    request<{
      kind: 'read' | 'write';
      columns?: string[];
      rows?: Record<string, unknown>[];
      totalRows?: number;
      changes?: number;
      lastInsertRowid?: number;
      durationMs: number;
    }>('/api/dbms/query', {
      method: 'POST',
      body: JSON.stringify({ sql, allowMutations }),
    }),
  runIntegrityCheck: () =>
    request<{ integrity: { integrity_check: string }[]; fkViolations: unknown[] }>('/api/dbms/integrity-check', {
      method: 'POST',
    }),
  resetDatabase: () =>
    request<{ ok: boolean; message: string }>('/api/dbms/reset', {
      method: 'POST',
    }),
};
