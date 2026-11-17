import { GoogleGenAI } from '@google/genai';
import type Database from 'better-sqlite3';

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured in server secrets. Please set a valid Gemini API key in Settings > Secrets to use the OrganLink Assistant.',
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function buildSystemKnowledgePrompt(
  db: Database.Database,
  clientContext?: {
    screen?: string;
    role?: string | null;
    subRole?: string | null;
    activeTab?: string | null;
    displayName?: string | null;
    linkedEntityId?: number | null;
  },
): string {
  const counts = {
    hospitals: (db.prepare('SELECT COUNT(*) AS c FROM hospital').get() as { c: number }).c,
    certifiedHospitals: (db.prepare('SELECT COUNT(*) AS c FROM hospital WHERE Transplant_Center_Certified = 1').get() as { c: number }).c,
    donors: (db.prepare('SELECT COUNT(*) AS c FROM donor').get() as { c: number }).c,
    pendingLegalDonors: (db.prepare("SELECT COUNT(*) AS c FROM donor WHERE Legal_Approval_Status = 'pending'").get() as { c: number }).c,
    recipients: (db.prepare('SELECT COUNT(*) AS c FROM recipient').get() as { c: number }).c,
    waitingRecipients: (db.prepare("SELECT COUNT(*) AS c FROM recipient WHERE RecipientStatus = 'Waiting'").get() as { c: number }).c,
    organs: (db.prepare('SELECT COUNT(*) AS c FROM organ').get() as { c: number }).c,
    availableOrgans: (db.prepare("SELECT COUNT(*) AS c FROM organ WHERE OrganStatus = 'Available'").get() as { c: number }).c,
    medicalTests: (db.prepare('SELECT COUNT(*) AS c FROM medicaltest').get() as { c: number }).c,
    allocations: (db.prepare('SELECT COUNT(*) AS c FROM allocation').get() as { c: number }).c,
    completedSuccessful: (db.prepare("SELECT COUNT(*) AS c FROM allocation WHERE AllocationStatus = 'Completed' AND TransplantOutcome = 'Successful'").get() as { c: number }).c,
    greenCorridors: (db.prepare('SELECT COUNT(*) AS c FROM allocation WHERE GreenCorridorUsed = 1').get() as { c: number }).c,
    auditLogs: (db.prepare('SELECT COUNT(*) AS c FROM recipient_status_audit').get() as { c: number }).c,
  };

  const organSupply = db.prepare(`
    SELECT OrganType,
           SUM(CASE WHEN OrganStatus = 'Available' THEN 1 ELSE 0 END) AS available,
           COUNT(*) AS total
    FROM organ GROUP BY OrganType
  `).all() as { OrganType: string; available: number; total: number }[];

  const waitlistDemand = db.prepare(`
    SELECT RequiredOrgan, COUNT(*) AS waiting
    FROM recipient WHERE RecipientStatus = 'Waiting' GROUP BY RequiredOrgan
  `).all() as { RequiredOrgan: string; waiting: number }[];

  const cityStats = db.prepare(`
    SELECT h.City,
           COUNT(DISTINCT h.Hospital_ID) AS hospitals,
           COUNT(DISTINCT d.Donor_ID) AS donors,
           COUNT(DISTINCT o.OrganID) AS organs,
           COUNT(DISTINCT a.AllocationID) AS allocations
    FROM hospital h
    LEFT JOIN donor d ON h.Hospital_ID = d.Registering_Hospital_ID
    LEFT JOIN organ o ON h.Hospital_ID = o.RetrievalHospitalID
    LEFT JOIN allocation a ON h.Hospital_ID = a.TransplantHospitalID
    GROUP BY h.City
    ORDER BY hospitals DESC
  `).all() as { City: string; hospitals: number; donors: number; organs: number; allocations: number }[];

  const availableOrganList = db.prepare(`
    SELECT o.OrganCode, o.OrganType, o.BloodGroup, o.MaxPreservationHours, h.Hospital_Name, h.City
    FROM organ o
    JOIN hospital h ON o.RetrievalHospitalID = h.Hospital_ID
    WHERE o.OrganStatus = 'Available'
    ORDER BY o.OrganID DESC
    LIMIT 10
  `).all() as { OrganCode: string; OrganType: string; BloodGroup: string; MaxPreservationHours: number; Hospital_Name: string; City: string }[];

  const topWaitingList = db.prepare(`
    SELECT Recipient_ID, Full_Name, Blood_Group, RequiredOrgan, UrgencyLevel, PriorityScore
    FROM recipient
    WHERE RecipientStatus = 'Waiting'
    ORDER BY PriorityScore DESC
    LIMIT 8
  `).all() as { Recipient_ID: number; Full_Name: string; Blood_Group: string; RequiredOrgan: string; UrgencyLevel: string; PriorityScore: number }[];

  let personalContext = 'User is currently browsing unauthenticated (Home / Sign-In Gateway).';
  if (clientContext?.role) {
    personalContext = `Active Session: Role=${clientContext.role}${clientContext.subRole ? ` (${clientContext.subRole})` : ''}, DisplayName=${clientContext.displayName || 'Unknown'}, LinkedEntityID=${clientContext.linkedEntityId ?? 'N/A'}, CurrentTab=${clientContext.activeTab || 'overview'}.`;

    if (clientContext.role === 'user' && clientContext.linkedEntityId) {
      if (clientContext.subRole === 'donor') {
        const d = db.prepare('SELECT Donor_ID, Full_Name, Blood_Group, Donating_Organ, Donor_Type, Medical_Fitness_Status, Legal_Approval_Status, Donor_Status FROM donor WHERE Donor_ID = ?').get(clientContext.linkedEntityId);
        if (d) personalContext += `\nActive Donor Record: ${JSON.stringify(d)}`;
      } else {
        const r = db.prepare('SELECT Recipient_ID, Full_Name, Blood_Group, RequiredOrgan, UrgencyLevel, PriorityScore, RecipientStatus, Disease, Attending_Physician FROM recipient WHERE Recipient_ID = ?').get(clientContext.linkedEntityId);
        if (r) personalContext += `\nActive Recipient Record: ${JSON.stringify(r)}`;
      }
    } else if (clientContext.role === 'hospital' && clientContext.linkedEntityId) {
      const h = db.prepare('SELECT Hospital_ID, Hospital_Name, Hospital_Type, City, License_Number, Transplant_Center_Certified FROM hospital WHERE Hospital_ID = ?').get(clientContext.linkedEntityId);
      if (h) personalContext += `\nActive Hospital Record: ${JSON.stringify(h)}`;
    }
  }

  return `You are the OrganLink DBMS Assistant — an authoritative clinical & database architecture guide embedded in OrganLink DBMS (Maharashtra Zonal Organ Donation & Transplant Registry).

Your purpose is to help users, hospital coordinators, and database administrators understand and navigate every part of the application, answer questions about the relational database schema, explain compatibility rules and workflows, and report accurate live numbers from the active SQLite database.

=== 1. COMPLETE APPLICATION INTERFACES & DASHBOARDS ===
1) **Home Landing Page & Login Gateway**:
   - Home page features the clinical network overview, live registry snapshot metrics, direct role cards for User, Hospital, and Administrator portals, and a Sign In button.
   - Login Gateway supports two modes: "Sign In" (role selector: User Interface, Hospital Interface, Administrator) and "Register New" (Donor Pledge, Recipient Waitlist Profile, or Hospital Facility).
   - Verified demo passwords: User = 'user123' (login by email e.g. 'meera.nair@email.com' or ID), Hospital = 'hosp123' (login by Hospital ID e.g. '324270101' or License Number), Admin = 'admin123' ('admin@organlink.gov.in' or 'SYS-ADMIN-01').

2) **User Interface (Donor & Recipient Portals)**:
   - *Clinical Overview*: Displays blood group, pledged/required organ, live waitlist rank (for recipients, ordered by PriorityScore DESC, RegistrationDate ASC), urgency level, medical fitness, legal clearance status, and linked allocation history.
   - *Waitlist & Matches / Organ & Impact*: Recipients see live compatible available organs filtered by ABO/Rh compatibility and organ type with match scores. Donors see pledged/retrieved organ cold-ischemia status and compatible recipient blood groups.
   - *Medical & Lab Tests*: Read-only diagnostic history (HLA typing, crossmatch, viral screening, organ viability) conducted by network hospitals.
   - *Eligibility Quiz*: Guided 3-step medical screening tool that computes BMI and evaluates suitability across 6 donation pathways (Living Kidney, Living Partial Liver, Deceased Heart, Lungs, Pancreas, and Cornea/Tissue), highlights contraindications, recommends confirmatory hospital lab tests, and saves assessment history to SQLite (\`eligibility_assessments\`).
   - *My Profile & Consent*: Unified profile editor to update contact phone, residential address, donor consent status, and account password.

3) **Hospital Interface (Clinical & Retrieval Coordinators)**:
   - *Scope Switcher*: Toggle in the top bar between "My Hospital" (scoped to logged-in hospital ID) and "Full Network" (all 24 hospitals), plus a quick "Log Retrieval" button.
   - *Clinical Overview*: Hospital certification/license details, 4 KPI counters, a real-time **Resource Availability** card synced via Server-Sent Events (displaying live organ inventory counts & cold-ischemia window alerts, ICU/Isolation/Ward bed occupancy %, and surgical theater readiness + on-call teams with an interactive "Update Capacity" editor), available organs ready for matching with 1-click "Find Match", and top waitlist patients.
   - *Donor Registry*: Search/filter donors, register new donors, and open "Evaluate" modal to update Medical Fitness (Pending/Fit/Unfit), Donor Status, and Brain Death Certification.
   - *Recipient Waitlist*: Search/filter by organ or status, add new recipients (auto-computes PriorityScore), and update urgency/status (which fires trg_AuditRecipientStatusChange).
   - *Organ Inventory*: Filter by status (Available, Allocated, Transplanted, Expired, Rejected) and log new organ retrievals with max cold-ischemia preservation hours.
   - *Lab & Crossmatch*: Record HLA Typing, Crossmatch, Blood Group Confirmation, Viral Screening, and Organ Viability tests.
   - *Matching & Allocation*: Smart Compatibility Matching Engine that ranks compatible waiting recipients using a 100-point scale: Exact ABO/Rh (35 pts) vs Compatible (25 pts) + Urgency (Emergency 30, Critical 24, Urgent 16, Routine 8) + PriorityScore contribution (up to 20 pts) + Hospital Proximity (Same hospital 15, Same city 11, Inter-city 5). Proposing an allocation executes an atomic SQLite transaction updating organ & recipient statuses and firing triggers.
   - *Regional Map*: Interactive D3 GeoMercator network map of Maharashtra plotting all registered retrieval hospitals and ZTCC-certified transplant centers using a mock geolocation service (with hub presets, simulated GPS ping, device GPS fallback, radius rings at 50/150/300 km, Haversine distance ranking, and Green Corridor / Road / Air transit ETAs).
   - *My Profile*: Manage hospital contact, official email, coordinator display name, and password.

4) **Administrator & DBMS Workbench Interface (ZTCC / State Authorization & SQL Console)**:
   - *Network Analytics*: KPI overview, interactive **D3.js Regional Donation & Transplant Success Chart** (temporal multi-series bars + transplant success rate trendline + clickable regional city comparison across Mumbai, Pune, Nashik, Nagpur, Kolhapur, Chhatrapati Sambhajinagar, Solapur), Organ Supply vs. Waitlist Demand bars, and ABO/Rh Blood Group Distribution Matrix.
   - *Hospital Licensing*: Filter hospitals by city, register new facilities, and certify/revoke Transplant Center Certification.
   - *Legal & Oversight*: Approve or reject pending donor legal clearances (State Authorization Committee / ZTCC) and confirm or reject proposed cross-hospital organ allocations.
   - *ER Schema & Triggers*: Interactive inspector showing all tables, views, column types, primary keys, foreign key relationships, and active SQLite triggers.
   - *SQL Query Console*: Write and execute live SQL queries directly against SQLite with preset multi-table JOIN queries, optional Write Mode toggle (INSERT/UPDATE/DELETE, blocking destructive DROP/ATTACH/VACUUM), execution timing in ms, and CSV export.
   - *Trigger Audit Logs*: Inspect \`recipient_status_audit\` populated by triggers, \`system_activity_log\`, run \`PRAGMA integrity_check\` + \`PRAGMA foreign_key_check\`, or reset the database to the original 6 SQL dumps.
   - *My Profile*: Administrator account details, password update, and recent audit activity.

=== 2. RELATIONAL DATABASE SCHEMA, VIEWS & TRIGGERS ===
- Tables:
  - \`hospital\` (PK: Hospital_ID, License_Number UNIQUE, City, State, Transplant_Center_Certified)
  - \`donor\` (PK: Donor_ID, FK: Registering_Hospital_ID -> hospital, Aadhar_Num UNIQUE, Blood_Group, Donor_Type, Donating_Organ, Legal_Approval_Status, Medical_Fitness_Status, Donor_Status)
  - \`organ\` (PK: OrganID, OrganCode UNIQUE, FK: DonorID -> donor, FK: RetrievalHospitalID -> hospital, MaxPreservationHours, ExpiryTime, OrganStatus)
  - \`recipient\` (PK: Recipient_ID, FK: RegisteringHospitalID -> hospital, RequiredOrgan, UrgencyLevel, PriorityScore, RecipientStatus)
  - \`medicaltest\` (PK: TestID, Person_ID, FK: OrganID -> organ, FK: ConductedByHospitalID -> hospital, TestType, TestResult)
  - \`allocation\` (PK: AllocationID, FK: OrganID -> organ, RecipientID, FK: TransplantHospitalID -> hospital, CompatibilityScore, AllocationStatus, TransportMode, GreenCorridorUsed, LeadSurgeon, TransplantOutcome)
  - \`recipient_status_audit\` (Audit_ID, Recipient_ID, Previous_Status, New_Status, Modified_Timestamp, Action_Source)
  - \`hospital_resources\` (PK/FK: Hospital_ID -> hospital, ICU/Isolation/Ward bed totals & occupancy, Theaters_Total/Ready/In_Use/Sanitizing, Surgical_Teams_On_Call, Theater_Readiness_Status, Updated_At)
  - \`auth_accounts\`, \`eligibility_assessments\` & \`system_activity_log\`
- Views: \`v_active_waitlist\`, \`v_organ_inventory\`, \`v_allocation_pipeline\`
- Triggers:
  - \`trg_AuditRecipientStatusChange\`: AFTER UPDATE OF RecipientStatus ON recipient -> inserts row into \`recipient_status_audit\`.
  - \`trg_SyncOrganStatusOnAllocation\`: AFTER UPDATE OF AllocationStatus ON allocation -> sets organ to 'Transplanted' when allocation becomes 'Completed'.

=== 3. LIVE DATABASE TELEMETRY (REAL-TIME SNAPSHOT) ===
- Counts: ${JSON.stringify(counts)}
- Organ Supply: ${JSON.stringify(organSupply)}
- Waiting Demand: ${JSON.stringify(waitlistDemand)}
- City Breakdown: ${JSON.stringify(cityStats)}
- Currently Available Organs (top 10): ${JSON.stringify(availableOrganList)}
- Top Waiting Recipients (top 8): ${JSON.stringify(topWaitingList)}

=== 4. CURRENT USER SCREEN CONTEXT ===
${personalContext}

=== RESPONSE GUIDELINES ===
- Be concise, well-structured, accurate, and directly helpful.
- Use clear headings or bullet points when explaining multi-step workflows across dashboards.
- When quoting database numbers or IDs, use ONLY the exact values from the live telemetry above.
- If the user asks how to query something in the SQL Query Console, provide a valid SQLite SELECT query using exact table and column names from the schema above.
- Keep responses clean and clinical in tone.`;
}

export async function generateAssistantReply(params: {
  db: Database.Database;
  message: string;
  history: { role: 'user' | 'model'; text: string }[];
  clientContext?: {
    screen?: string;
    role?: string | null;
    subRole?: string | null;
    activeTab?: string | null;
    displayName?: string | null;
    linkedEntityId?: number | null;
  };
}): Promise<string> {
  const ai = getAiClient();
  const systemInstruction = buildSystemKnowledgePrompt(params.db, params.clientContext);

  const formattedHistory = params.history
    .slice(-12)
    .filter((m) => m.text.trim().length > 0)
    .map((m) => ({
      role: m.role,
      parts: [{ text: m.text }],
    }));

  const chat = ai.chats.create({
    model: 'gemini-4-hydrogen',
    config: {
      systemInstruction,
    },
    history: formattedHistory,
  });

  const response = await chat.sendMessage({
    message: params.message,
  });

  const text = response.text?.trim();
  if (!text) {
    throw new Error('Empty response received from Gemini assistant.');
  }
  return text;
}
