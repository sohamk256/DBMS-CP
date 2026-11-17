export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';
export type OrganType =
  | 'Kidney'
  | 'Liver'
  | 'Heart'
  | 'Lung'
  | 'Pancreas'
  | 'Cornea'
  | 'Small Intestine';
export type UrgencyLevel = 'Routine' | 'Urgent' | 'Critical' | 'Emergency';
export type UserRole = 'user' | 'hospital' | 'admin';
export type UserSubRole = 'donor' | 'recipient';

export interface HospitalRecord {
  Hospital_ID: number;
  Hospital_Name: string;
  Hospital_Type: 'Government' | 'Private' | 'Trust';
  City: string;
  State: string;
  Contact_Number: string;
  Email: string | null;
  License_Number: string;
  Transplant_Center_Certified: number;
  Registration_Date: string;
}

export interface DonorRecord {
  Donor_ID: number;
  Full_Name: string;
  DOB: string;
  Gender: 'Male' | 'Female' | 'Other';
  Blood_Group: BloodGroup;
  Contact_Number: string;
  Email: string;
  Address: string;
  Aadhar_Num: string;
  Registration_Date: string;
  Donor_Type: 'Living' | 'Deceased';
  Donating_Organ: 'Kidney' | 'Liver' | 'Heart' | 'Lungs' | 'Pancreas' | 'Multiple';
  Brain_Death_Conf: number;
  Brain_Death_Date: string | null;
  Consent_Obtained: number;
  Legal_Approval_Status: 'pending' | 'Approved' | 'Rejected';
  Legal_Approval_Date: string | null;
  Legal_Authority: string | null;
  Registering_Hospital_ID: number;
  Medical_Fitness_Status: 'Pending' | 'Fit' | 'Unfit';
  Donor_Status: 'Registered' | 'Evaluated' | 'Approved' | 'Retrieved' | 'Rejected' | 'Deceased';
  Hospital_Name?: string;
  Hospital_City?: string;
}

export interface OrganRecord {
  OrganID: number;
  OrganCode: string;
  DonorID: number;
  OrganType: OrganType;
  BloodGroup: BloodGroup;
  RetrievalDate: string;
  RetrievalHospitalID: number;
  PreservationStartTime: string;
  MaxPreservationHours: number;
  ExpiryTime: string;
  OrganStatus: 'Available' | 'Allocated' | 'Transplanted' | 'Expired' | 'Rejected';
  RejectionReason: string | null;
  DonorName?: string;
  DonorType?: string;
  RetrievalHospitalName?: string;
  RetrievalHospitalCity?: string;
}

export interface RecipientRecord {
  Recipient_ID: number;
  Full_Name: string;
  DOB: string;
  Gender: 'Male' | 'Female' | 'Other';
  Blood_Group: BloodGroup;
  Contact_Number: string;
  Email: string;
  Address: string;
  Aadhar_Num: string;
  RequiredOrgan: OrganType;
  UrgencyLevel: UrgencyLevel;
  PriorityScore: number;
  RegistrationDate: string;
  RegisteringHospitalID: number;
  RecipientStatus: 'Waiting' | 'Allocated' | 'Transplanted' | 'Removed' | 'Deceased';
  RemovalReason: string | null;
  Previous_Transplant_History: number;
  Attending_Physician: string;
  Disease: string;
  Hospital_Name?: string;
  Hospital_City?: string;
}

export interface MedicalTestRecord {
  TestID: number;
  Person_ID: number;
  OrganID: number | null;
  TestType: string;
  TestDate: string;
  TestResult: 'Pending' | 'Normal' | 'Abnormal' | 'Positive' | 'Negative';
  ResultDetails: string | null;
  ConductedByHospitalID: number;
  LabName: string | null;
  Hospital_Name?: string;
  OrganCode?: string | null;
  PersonName?: string | null;
  PersonType?: 'Donor' | 'Recipient' | 'Registry Member';
}

export interface AllocationRecord {
  AllocationID: number;
  OrganID: number;
  RecipientID: number;
  AllocationDate: string;
  CompatibilityVerified: number;
  CompatibilityScore: number | null;
  AllocationStatus: 'Proposed' | 'Confirmed' | 'Rejected' | 'Completed' | 'Cancelled';
  TransplantHospitalID: number;
  TransportMode: 'Road' | 'Air' | 'Green Corridor' | null;
  GreenCorridorUsed: number;
  TransportStartTime: string | null;
  TransportEndTime: string | null;
  TransplantSurgeryDate: string | null;
  LeadSurgeon: string | null;
  TransplantOutcome: 'Successful' | 'Failed' | 'Complication' | 'Not Performed' | null;
  RecoveryStatus: string | null;
  OrganCode?: string;
  OrganType?: OrganType;
  OrganBloodGroup?: BloodGroup;
  RetrievalHospitalID?: number;
  RetrievalHospitalName?: string;
  TransplantHospitalName?: string;
  TransplantHospitalCity?: string;
  RecipientName?: string;
  RecipientBloodGroup?: BloodGroup;
  RecipientUrgency?: UrgencyLevel;
  DonorName?: string;
}

export interface RecipientAuditRecord {
  Audit_ID: number;
  Recipient_ID: number;
  Previous_Status: string;
  New_Status: string;
  Modified_Timestamp: string;
  Action_Source: string;
  Recipient_Name?: string;
}

export interface SystemActivityRecord {
  Log_ID: number;
  Actor_Role: string;
  Actor_Name: string;
  Action_Type: string;
  Target_Table: string;
  Target_ID: string;
  Summary: string;
  Created_At: string;
}

export interface AuthSession {
  role: UserRole;
  subRole: UserSubRole | null;
  identifier: string;
  displayName: string;
  linkedEntityId: number | null;
  token: string;
}

export interface MatchCandidate {
  recipient: RecipientRecord;
  compatibilityScore: number;
  bloodMatchType: 'Exact' | 'Compatible';
  sameCity: boolean;
  sameHospital: boolean;
  reasons: string[];
}

export interface SchemaTableInfo {
  name: string;
  type: 'table' | 'view';
  rowCount: number;
  columns: {
    cid: number;
    name: string;
    type: string;
    notnull: number;
    dflt_value: string | null;
    pk: number;
  }[];
  foreignKeys: {
    id: number;
    table: string;
    from: string;
    to: string;
    on_update: string;
    on_delete: string;
  }[];
}

export interface RegionalTrendPoint {
  month: string; // YYYY-MM
  label: string; // e.g. Nov 25
  donorsRegistered: number;
  organsRetrieved: number;
  allocationsTotal: number;
  successfulTransplants: number;
  resolvedTransplants: number;
  successRate: number; // 0-100
}

export interface RegionalCitySummary {
  city: string;
  hospitals: number;
  certifiedHospitals: number;
  donors: number;
  organsRetrieved: number;
  waitingRecipients: number;
  allocationsTotal: number;
  successfulTransplants: number;
  resolvedTransplants: number;
  successRate: number;
}

export interface RegionalTrendsResponse {
  months: string[];
  overallTimeline: RegionalTrendPoint[];
  byCityTimeline: Record<string, RegionalTrendPoint[]>;
  regionalSummary: RegionalCitySummary[];
}

export interface UserProfileData {
  role: UserRole;
  subRole: UserSubRole | null;
  identifier: string;
  displayName: string;
  linkedEntityId: number | null;
  accountCreatedAt: string;
  email: string;
  contactNumber: string;
  city: string;
  state: string;
  address: string;
  registrationDate: string;
  bloodGroup?: BloodGroup;
  aadharNum?: string;
  hospitalName?: string;
  hospitalType?: string;
  licenseNumber?: string;
  certified?: boolean;
  donorType?: 'Living' | 'Deceased';
  donatingOrgan?: string;
  medicalFitness?: string;
  legalApprovalStatus?: string;
  consentObtained?: boolean;
  requiredOrgan?: OrganType;
  urgencyLevel?: UrgencyLevel;
  priorityScore?: number;
  recipientStatus?: string;
  attendingPhysician?: string;
  disease?: string;
  recentActivity: SystemActivityRecord[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  error?: boolean;
}

export interface EligibilityAssessmentRecord {
  Assessment_ID: number;
  Account_Identifier: string;
  Linked_Entity_ID: number | null;
  Age: number;
  BMI: number;
  Blood_Group: BloodGroup;
  Pathway_Preference: 'both' | 'living' | 'deceased';
  Overall_Readiness: string;
  Eligible_Count: number;
  Conditional_Count: number;
  Ineligible_Count: number;
  Result_JSON: string;
  Created_At: string;
}

export type TheaterReadinessStatus = 'Ready' | 'Limited' | 'Busy' | 'Standby';

export interface HospitalResourceRecord {
  Hospital_ID: number;
  Hospital_Name?: string;
  City?: string;
  Transplant_Center_Certified?: number;
  ICU_Beds_Total: number;
  ICU_Beds_Occupied: number;
  Isolation_Beds_Total: number;
  Isolation_Beds_Occupied: number;
  Ward_Beds_Total: number;
  Ward_Beds_Occupied: number;
  Theaters_Total: number;
  Theaters_Ready: number;
  Theaters_In_Use: number;
  Theaters_Sanitizing: number;
  Surgical_Teams_On_Call: number;
  Next_Theater_Available_Min: number;
  Theater_Readiness_Status: TheaterReadinessStatus;
  Notes: string | null;
  Updated_At: string;
}

