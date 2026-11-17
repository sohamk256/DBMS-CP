import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import { createServer as createViteServer } from 'vite';
import { getDb, hashPassword, seedDatabaseFromSqlDumps, seedMissingHospitalResources } from './server/db.ts';
import { generateAssistantReply } from './server/chatContext.ts';
import {
  calculateRecipientPriorityScore,
  rankCompatibleRecipients,
  validateSqlQuery,
} from './src/utils/organMatching.ts';
import {
  buildTrendTimeline,
  computeTransplantSuccessRate,
} from './src/utils/regionalAnalytics.ts';
import {
  buildResourceAvailabilitySnapshot,
  normalizeResourceMutation,
} from './src/utils/resourceAvailability.ts';
import type {
  AuthSession,
  HospitalRecord,
  HospitalResourceRecord,
  OrganRecord,
  RecipientRecord,
  RegionalCitySummary,
  RegionalTrendPoint,
  UrgencyLevel,
} from './src/types/db.ts';

const PORT = 3000;
const db = getDb();

const activeSessions = new Map<string, AuthSession>();

function logActivity(
  actorRole: string,
  actorName: string,
  actionType: string,
  targetTable: string,
  targetId: string | number,
  summary: string,
): void {
  db.prepare(`
    INSERT INTO system_activity_log (Actor_Role, Actor_Name, Action_Type, Target_Table, Target_ID, Summary)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(actorRole, actorName, actionType, targetTable, String(targetId), summary);
}

function getNextId(table: string, col: string, fallbackBase: number): number {
  const row = db.prepare(`SELECT MAX(${col}) AS maxId FROM ${table}`).get() as { maxId: number | null };
  return row?.maxId ? Number(row.maxId) + 1 : fallbackBase;
}

const resourceStreamClients = new Set<{ res: express.Response; hospitalId: number | null }>();

function getResourcePayload(hospitalId: number | null) {
  let resourceSql = `
    SELECT r.*, h.Hospital_Name, h.City, h.Transplant_Center_Certified
    FROM hospital_resources r
    JOIN hospital h ON r.Hospital_ID = h.Hospital_ID
  `;
  const rParams: unknown[] = [];
  if (hospitalId) {
    resourceSql += ' WHERE r.Hospital_ID = ?';
    rParams.push(hospitalId);
  }
  resourceSql += ' ORDER BY h.Transplant_Center_Certified DESC, r.Hospital_ID ASC';
  const resources = db.prepare(resourceSql).all(...rParams) as HospitalResourceRecord[];

  let organSql = 'SELECT * FROM v_organ_inventory';
  const oParams: unknown[] = [];
  if (hospitalId) {
    organSql += ' WHERE RetrievalHospitalID = ?';
    oParams.push(hospitalId);
  }
  const organs = db.prepare(organSql).all(...oParams) as OrganRecord[];

  const scopeLabel = hospitalId
    ? resources[0]?.Hospital_Name || `Hospital #${hospitalId}`
    : 'All Maharashtra Network';

  const snapshot = buildResourceAvailabilitySnapshot({
    resources,
    organs,
    scopeLabel,
  });

  return { resources, snapshot };
}

function broadcastResourceUpdate(): void {
  if (resourceStreamClients.size === 0) return;
  const cache = new Map<string, string>();
  for (const client of Array.from(resourceStreamClients)) {
    const key = client.hospitalId ? String(client.hospitalId) : 'all';
    let serialized = cache.get(key);
    if (!serialized) {
      serialized = JSON.stringify(getResourcePayload(client.hospitalId));
      cache.set(key, serialized);
    }
    try {
      client.res.write(`event: resource-update\ndata: ${serialized}\n\n`);
    } catch {
      resourceStreamClients.delete(client);
    }
  }
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // Health & Registry counts
  app.get('/api/health', (_req, res) => {
    const counts = {
      hospitals: (db.prepare('SELECT COUNT(*) AS c FROM hospital').get() as { c: number }).c,
      donors: (db.prepare('SELECT COUNT(*) AS c FROM donor').get() as { c: number }).c,
      organs: (db.prepare('SELECT COUNT(*) AS c FROM organ').get() as { c: number }).c,
      recipients: (db.prepare('SELECT COUNT(*) AS c FROM recipient').get() as { c: number }).c,
      medicalTests: (db.prepare('SELECT COUNT(*) AS c FROM medicaltest').get() as { c: number }).c,
      allocations: (db.prepare('SELECT COUNT(*) AS c FROM allocation').get() as { c: number }).c,
      auditLogs: (db.prepare('SELECT COUNT(*) AS c FROM recipient_status_audit').get() as { c: number }).c,
    };
    res.json({ status: 'ok', engine: 'SQLite 3 (WAL + FK + Triggers)', counts });
  });

  // Directory of verified demo identities for quick portal testing
  app.get('/api/auth/directory', (_req, res) => {
    const sampleDonors = db
      .prepare('SELECT Donor_ID AS id, Full_Name AS name, Email AS identifier, Blood_Group AS bloodGroup, Donating_Organ AS detail, Donor_Status AS status FROM donor ORDER BY Donor_ID LIMIT 6')
      .all();
    const sampleRecipients = db
      .prepare('SELECT Recipient_ID AS id, Full_Name AS name, Email AS identifier, Blood_Group AS bloodGroup, RequiredOrgan AS detail, RecipientStatus AS status, UrgencyLevel AS urgency FROM recipient WHERE RecipientStatus = ? ORDER BY PriorityScore DESC LIMIT 6')
      .all('Waiting');
    const hospitals = db
      .prepare('SELECT Hospital_ID AS id, Hospital_Name AS name, City AS city, Hospital_Type AS type, License_Number AS license, Transplant_Center_Certified AS certified FROM hospital ORDER BY Transplant_Center_Certified DESC, Hospital_ID ASC')
      .all();
    res.json({ donors: sampleDonors, recipients: sampleRecipients, hospitals });
  });

  // Authentication: Login
  app.post('/api/auth/login', (req, res) => {
    const { role, identifier, password } = req.body as {
      role?: string;
      identifier?: string;
      password?: string;
    };

    if (!role || !identifier || !password) {
      res.status(400).json({ error: 'Role, identifier, and password are required.' });
      return;
    }

    const cleanIdentifier = String(identifier).trim();
    const pwdHash = hashPassword(String(password));

    // Allow lookup by exact Identifier OR numeric Donor_ID / Recipient_ID for user role
    let account = db
      .prepare('SELECT * FROM auth_accounts WHERE Role = ? AND LOWER(Identifier) = LOWER(?)')
      .get(role, cleanIdentifier) as
      | {
          Role: 'user' | 'hospital' | 'admin';
          SubRole: 'donor' | 'recipient' | null;
          Identifier: string;
          PasswordHash: string;
          DisplayName: string;
          Linked_Entity_ID: number | null;
        }
      | undefined;

    if (!account && role === 'user' && /^\d+$/.test(cleanIdentifier)) {
      account = db
        .prepare('SELECT * FROM auth_accounts WHERE Role = ? AND Linked_Entity_ID = ?')
        .get('user', Number(cleanIdentifier)) as typeof account;
    }

    if (!account || account.PasswordHash !== pwdHash) {
      res.status(401).json({ error: 'Invalid credentials for the selected portal role.' });
      return;
    }

    const token = crypto.randomBytes(24).toString('hex');
    const session: AuthSession = {
      role: account.Role,
      subRole: account.SubRole,
      identifier: account.Identifier,
      displayName: account.DisplayName,
      linkedEntityId: account.Linked_Entity_ID,
      token,
    };
    activeSessions.set(token, session);
    logActivity(session.role, session.displayName, 'LOGIN', 'auth_accounts', session.linkedEntityId ?? session.identifier, `Signed into ${session.role} portal`);
    res.json({ session });
  });

  // Registration: Create new Donor, Recipient, or Hospital account + DB record
  app.post('/api/auth/register', (req, res) => {
    const body = req.body as Record<string, unknown>;
    const regType = String(body.regType || '');
    const password = String(body.password || 'user123');

    if (password.length < 4) {
      res.status(400).json({ error: 'Password must be at least 4 characters.' });
      return;
    }

    try {
      if (regType === 'donor') {
        const fullName = String(body.fullName || '').trim();
        const email = String(body.email || '').trim().toLowerCase();
        const dob = String(body.dob || '').trim();
        const gender = String(body.gender || 'Male');
        const bloodGroup = String(body.bloodGroup || 'O+');
        const contactNumber = String(body.contactNumber || '').trim();
        const address = String(body.address || '').trim();
        const aadharNum = String(body.aadharNum || '').trim();
        const donorType = String(body.donorType || 'Living');
        const donatingOrgan = String(body.donatingOrgan || 'Kidney');
        const hospitalId = Number(body.hospitalId || 324270101);

        if (!fullName || !email || !dob || !contactNumber || !address || !aadharNum) {
          res.status(400).json({ error: 'All required donor registration fields must be filled.' });
          return;
        }

        const newId = getNextId('donor', 'Donor_ID', 126270031);
        const today = new Date().toISOString().slice(0, 10);

        const tx = db.transaction(() => {
          db.prepare(`
            INSERT INTO donor (
              Donor_ID, Full_Name, DOB, Gender, Blood_Group, Contact_Number, Email, Address,
              Aadhar_Num, Registration_Date, Donor_Type, Donating_Organ, Brain_Death_Conf,
              Brain_Death_Date, Consent_Obtained, Legal_Approval_Status, Legal_Approval_Date,
              Legal_Authority, Registering_Hospital_ID, Medical_Fitness_Status, Donor_Status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, 1, 'pending', NULL, NULL, ?, 'Pending', 'Registered')
          `).run(
            newId,
            fullName,
            dob,
            gender,
            bloodGroup,
            contactNumber,
            email,
            address,
            aadharNum,
            today,
            donorType,
            donatingOrgan,
            hospitalId,
          );

          db.prepare(`
            INSERT INTO auth_accounts (Role, SubRole, Identifier, PasswordHash, DisplayName, Linked_Entity_ID)
            VALUES ('user', 'donor', ?, ?, ?, ?)
          `).run(email, hashPassword(password), fullName, newId);
        });
        tx();

        const token = crypto.randomBytes(24).toString('hex');
        const session: AuthSession = {
          role: 'user',
          subRole: 'donor',
          identifier: email,
          displayName: fullName,
          linkedEntityId: newId,
          token,
        };
        activeSessions.set(token, session);
        logActivity('user', fullName, 'REGISTER', 'donor', newId, `Registered new ${donorType} donor pledge (${donatingOrgan}, ${bloodGroup})`);
        res.status(201).json({ session, id: newId });
        return;
      }

      if (regType === 'recipient') {
        const fullName = String(body.fullName || '').trim();
        const email = String(body.email || '').trim().toLowerCase();
        const dob = String(body.dob || '').trim();
        const gender = String(body.gender || 'Female');
        const bloodGroup = String(body.bloodGroup || 'O+');
        const contactNumber = String(body.contactNumber || '').trim();
        const address = String(body.address || '').trim();
        const aadharNum = String(body.aadharNum || '').trim();
        const requiredOrgan = String(body.requiredOrgan || 'Kidney');
        const urgencyLevel = (String(body.urgencyLevel || 'Urgent') as UrgencyLevel);
        const disease = String(body.disease || 'End-Stage Organ Failure').trim();
        const attendingPhysician = String(body.attendingPhysician || 'Dr. Suresh Joshi').trim();
        const hospitalId = Number(body.hospitalId || 324270101);
        const prevTransplant = body.previousTransplantHistory ? 1 : 0;

        if (!fullName || !email || !dob || !contactNumber || !address || !aadharNum) {
          res.status(400).json({ error: 'All required recipient registration fields must be filled.' });
          return;
        }

        const newId = getNextId('recipient', 'Recipient_ID', 625270033);
        const today = new Date().toISOString().slice(0, 10);
        const priorityScore = calculateRecipientPriorityScore({
          urgencyLevel,
          previousTransplantHistory: Boolean(prevTransplant),
          waitingDays: 0,
        });

        const tx = db.transaction(() => {
          db.prepare(`
            INSERT INTO recipient (
              Recipient_ID, Full_Name, DOB, Gender, Blood_Group, Contact_Number, Email, Address,
              Aadhar_Num, RequiredOrgan, UrgencyLevel, PriorityScore, RegistrationDate,
              RegisteringHospitalID, RecipientStatus, RemovalReason, Previous_Transplant_History,
              Attending_Physician, Disease
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Waiting', NULL, ?, ?, ?)
          `).run(
            newId,
            fullName,
            dob,
            gender,
            bloodGroup,
            contactNumber,
            email,
            address,
            aadharNum,
            requiredOrgan,
            urgencyLevel,
            priorityScore,
            today,
            hospitalId,
            prevTransplant,
            attendingPhysician,
            disease,
          );

          db.prepare(`
            INSERT INTO auth_accounts (Role, SubRole, Identifier, PasswordHash, DisplayName, Linked_Entity_ID)
            VALUES ('user', 'recipient', ?, ?, ?, ?)
          `).run(email, hashPassword(password), fullName, newId);
        });
        tx();

        const token = crypto.randomBytes(24).toString('hex');
        const session: AuthSession = {
          role: 'user',
          subRole: 'recipient',
          identifier: email,
          displayName: fullName,
          linkedEntityId: newId,
          token,
        };
        activeSessions.set(token, session);
        logActivity('user', fullName, 'REGISTER', 'recipient', newId, `Registered new recipient waitlist profile (${requiredOrgan}, ${urgencyLevel})`);
        res.status(201).json({ session, id: newId });
        return;
      }

      if (regType === 'hospital') {
        const hospitalName = String(body.hospitalName || '').trim();
        const hospitalType = String(body.hospitalType || 'Private');
        const city = String(body.city || '').trim();
        const state = String(body.state || 'Maharashtra').trim();
        const contactNumber = String(body.contactNumber || '').trim();
        const email = String(body.email || '').trim().toLowerCase();
        const licenseNumber = String(body.licenseNumber || '').trim().toUpperCase();

        if (!hospitalName || !city || !contactNumber || !licenseNumber) {
          res.status(400).json({ error: 'Hospital name, city, contact number, and license number are required.' });
          return;
        }

        const newId = getNextId('hospital', 'Hospital_ID', 324270125);
        const today = new Date().toISOString().slice(0, 10);

        const tx = db.transaction(() => {
          db.prepare(`
            INSERT INTO hospital (
              Hospital_ID, Hospital_Name, Hospital_Type, City, State, Contact_Number,
              Email, License_Number, Transplant_Center_Certified, Registration_Date
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
          `).run(newId, hospitalName, hospitalType, city, state, contactNumber, email || null, licenseNumber, today);

          db.prepare(`
            INSERT INTO auth_accounts (Role, SubRole, Identifier, PasswordHash, DisplayName, Linked_Entity_ID)
            VALUES ('hospital', NULL, ?, ?, ?, ?)
          `).run(String(newId), hashPassword(password), hospitalName, newId);

          db.prepare(`
            INSERT OR IGNORE INTO auth_accounts (Role, SubRole, Identifier, PasswordHash, DisplayName, Linked_Entity_ID)
            VALUES ('hospital', NULL, ?, ?, ?, ?)
          `).run(licenseNumber, hashPassword(password), hospitalName, newId);
        });
        tx();

        const token = crypto.randomBytes(24).toString('hex');
        const session: AuthSession = {
          role: 'hospital',
          subRole: null,
          identifier: String(newId),
          displayName: hospitalName,
          linkedEntityId: newId,
          token,
        };
        activeSessions.set(token, session);
        logActivity('hospital', hospitalName, 'REGISTER', 'hospital', newId, `Registered new hospital (${city}, License ${licenseNumber})`);
        res.status(201).json({ session, id: newId });
        return;
      }

      res.status(400).json({ error: 'Unsupported registration type.' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Registration failed.';
      res.status(409).json({ error: msg.includes('UNIQUE') ? 'Email, Aadhar Number, or License Number already exists in the registry.' : msg });
    }
  });

  // Dashboard Summary & Analytics
  app.get('/api/dashboard/summary', (req, res) => {
    const hospitalId = req.query.hospitalId ? Number(req.query.hospitalId) : null;

    const totalHospitals = (db.prepare('SELECT COUNT(*) AS c FROM hospital').get() as { c: number }).c;
    const certifiedHospitals = (db.prepare('SELECT COUNT(*) AS c FROM hospital WHERE Transplant_Center_Certified = 1').get() as { c: number }).c;

    const totalDonors = hospitalId
      ? (db.prepare('SELECT COUNT(*) AS c FROM donor WHERE Registering_Hospital_ID = ?').get(hospitalId) as { c: number }).c
      : (db.prepare('SELECT COUNT(*) AS c FROM donor').get() as { c: number }).c;

    const pendingLegalDonors = (db.prepare("SELECT COUNT(*) AS c FROM donor WHERE Legal_Approval_Status = 'pending'").get() as { c: number }).c;

    const waitingRecipients = hospitalId
      ? (db.prepare("SELECT COUNT(*) AS c FROM recipient WHERE RecipientStatus = 'Waiting' AND RegisteringHospitalID = ?").get(hospitalId) as { c: number }).c
      : (db.prepare("SELECT COUNT(*) AS c FROM recipient WHERE RecipientStatus = 'Waiting'").get() as { c: number }).c;

    const emergencyRecipients = (db.prepare("SELECT COUNT(*) AS c FROM recipient WHERE RecipientStatus = 'Waiting' AND UrgencyLevel IN ('Emergency','Critical')").get() as { c: number }).c;

    const availableOrgans = hospitalId
      ? (db.prepare("SELECT COUNT(*) AS c FROM organ WHERE OrganStatus = 'Available' AND RetrievalHospitalID = ?").get(hospitalId) as { c: number }).c
      : (db.prepare("SELECT COUNT(*) AS c FROM organ WHERE OrganStatus = 'Available'").get() as { c: number }).c;

    const activeAllocations = (db.prepare("SELECT COUNT(*) AS c FROM allocation WHERE AllocationStatus IN ('Proposed','Confirmed')").get() as { c: number }).c;
    const completedTransplants = (db.prepare("SELECT COUNT(*) AS c FROM allocation WHERE AllocationStatus = 'Completed' AND TransplantOutcome = 'Successful'").get() as { c: number }).c;
    const greenCorridors = (db.prepare('SELECT COUNT(*) AS c FROM allocation WHERE GreenCorridorUsed = 1').get() as { c: number }).c;

    const organDemandSupply = db.prepare(`
      SELECT
        o_type.OrganType AS organType,
        COALESCE(o_cnt.availableCount, 0) AS availableOrgans,
        COALESCE(o_cnt.totalCount, 0) AS totalOrgans,
        COALESCE(r_cnt.waitingCount, 0) AS waitingRecipients
      FROM (
        SELECT 'Kidney' AS OrganType UNION ALL SELECT 'Liver' UNION ALL SELECT 'Heart'
        UNION ALL SELECT 'Lung' UNION ALL SELECT 'Pancreas' UNION ALL SELECT 'Cornea' UNION ALL SELECT 'Small Intestine'
      ) o_type
      LEFT JOIN (
        SELECT OrganType,
               SUM(CASE WHEN OrganStatus = 'Available' THEN 1 ELSE 0 END) AS availableCount,
               COUNT(*) AS totalCount
        FROM organ GROUP BY OrganType
      ) o_cnt ON o_type.OrganType = o_cnt.OrganType
      LEFT JOIN (
        SELECT RequiredOrgan, COUNT(*) AS waitingCount
        FROM recipient WHERE RecipientStatus = 'Waiting' GROUP BY RequiredOrgan
      ) r_cnt ON o_type.OrganType = r_cnt.RequiredOrgan
    `).all();

    const bloodGroupMatrix = db.prepare(`
      SELECT
        bg.BloodGroup AS bloodGroup,
        COALESCE(d.c, 0) AS donors,
        COALESCE(r.c, 0) AS waitingRecipients,
        COALESCE(o.c, 0) AS availableOrgans
      FROM (
        SELECT 'O+' AS BloodGroup UNION ALL SELECT 'O-' UNION ALL SELECT 'A+' UNION ALL SELECT 'A-'
        UNION ALL SELECT 'B+' UNION ALL SELECT 'B-' UNION ALL SELECT 'AB+' UNION ALL SELECT 'AB-'
      ) bg
      LEFT JOIN (SELECT Blood_Group, COUNT(*) AS c FROM donor GROUP BY Blood_Group) d ON bg.BloodGroup = d.Blood_Group
      LEFT JOIN (SELECT Blood_Group, COUNT(*) AS c FROM recipient WHERE RecipientStatus = 'Waiting' GROUP BY Blood_Group) r ON bg.BloodGroup = r.Blood_Group
      LEFT JOIN (SELECT BloodGroup, COUNT(*) AS c FROM organ WHERE OrganStatus = 'Available' GROUP BY BloodGroup) o ON bg.BloodGroup = o.BloodGroup
    `).all();

    const cityDistribution = db.prepare(`
      SELECT
        h.City AS city,
        COUNT(DISTINCT h.Hospital_ID) AS hospitals,
        COUNT(DISTINCT d.Donor_ID) AS donors,
        COUNT(DISTINCT r.Recipient_ID) AS recipients
      FROM hospital h
      LEFT JOIN donor d ON h.Hospital_ID = d.Registering_Hospital_ID
      LEFT JOIN recipient r ON h.Hospital_ID = r.RegisteringHospitalID
      GROUP BY h.City
      ORDER BY hospitals DESC
    `).all();

    res.json({
      kpis: {
        totalHospitals,
        certifiedHospitals,
        totalDonors,
        pendingLegalDonors,
        waitingRecipients,
        emergencyRecipients,
        availableOrgans,
        activeAllocations,
        completedTransplants,
        greenCorridors,
      },
      organDemandSupply,
      bloodGroupMatrix,
      cityDistribution,
    });
  });

  // Regional & Temporal Organ Donation + Transplant Success Analytics (for D3 Chart)
  app.get('/api/analytics/regional-trends', (_req, res) => {
    const donorMonthly = db.prepare(`
      SELECT substr(d.Registration_Date, 1, 7) AS month, h.City AS city, COUNT(*) AS c
      FROM donor d
      JOIN hospital h ON d.Registering_Hospital_ID = h.Hospital_ID
      WHERE length(d.Registration_Date) >= 7
      GROUP BY month, city
    `).all() as { month: string; city: string; c: number }[];

    const organMonthly = db.prepare(`
      SELECT substr(o.RetrievalDate, 1, 7) AS month, h.City AS city, COUNT(*) AS c
      FROM organ o
      JOIN hospital h ON o.RetrievalHospitalID = h.Hospital_ID
      WHERE length(o.RetrievalDate) >= 7
      GROUP BY month, city
    `).all() as { month: string; city: string; c: number }[];

    const allocMonthly = db.prepare(`
      SELECT substr(a.AllocationDate, 1, 7) AS month,
             h.City AS city,
             COUNT(*) AS totalCount,
             SUM(CASE WHEN a.AllocationStatus = 'Completed' AND a.TransplantOutcome = 'Successful' THEN 1 ELSE 0 END) AS successCount,
             SUM(CASE WHEN a.AllocationStatus IN ('Completed','Rejected','Cancelled') THEN 1 ELSE 0 END) AS resolvedCount
      FROM allocation a
      JOIN hospital h ON a.TransplantHospitalID = h.Hospital_ID
      WHERE length(a.AllocationDate) >= 7
      GROUP BY month, city
    `).all() as {
      month: string;
      city: string;
      totalCount: number;
      successCount: number;
      resolvedCount: number;
    }[];

    const monthSet = new Set<string>();
    const citySet = new Set<string>();
    for (const r of donorMonthly) {
      monthSet.add(r.month);
      citySet.add(r.city);
    }
    for (const r of organMonthly) {
      monthSet.add(r.month);
      citySet.add(r.city);
    }
    for (const r of allocMonthly) {
      monthSet.add(r.month);
      citySet.add(r.city);
    }

    const months = Array.from(monthSet).sort();

    // Aggregate overall counts
    const totalDonors: Record<string, number> = {};
    const totalOrgans: Record<string, number> = {};
    const totalAllocs: Record<string, number> = {};
    const totalSuccess: Record<string, number> = {};
    const totalResolved: Record<string, number> = {};

    for (const r of donorMonthly) {
      totalDonors[r.month] = (totalDonors[r.month] ?? 0) + r.c;
    }
    for (const r of organMonthly) {
      totalOrgans[r.month] = (totalOrgans[r.month] ?? 0) + r.c;
    }
    for (const r of allocMonthly) {
      totalAllocs[r.month] = (totalAllocs[r.month] ?? 0) + r.totalCount;
      totalSuccess[r.month] = (totalSuccess[r.month] ?? 0) + r.successCount;
      totalResolved[r.month] = (totalResolved[r.month] ?? 0) + r.resolvedCount;
    }

    const overallTimeline = buildTrendTimeline({
      months,
      donorCounts: totalDonors,
      organCounts: totalOrgans,
      allocationCounts: totalAllocs,
      successfulCounts: totalSuccess,
      resolvedCounts: totalResolved,
    });

    const byCityTimeline: Record<string, RegionalTrendPoint[]> = {};
    for (const city of citySet) {
      const cDonors: Record<string, number> = {};
      const cOrgans: Record<string, number> = {};
      const cAllocs: Record<string, number> = {};
      const cSuccess: Record<string, number> = {};
      const cResolved: Record<string, number> = {};

      for (const r of donorMonthly) if (r.city === city) cDonors[r.month] = (cDonors[r.month] ?? 0) + r.c;
      for (const r of organMonthly) if (r.city === city) cOrgans[r.month] = (cOrgans[r.month] ?? 0) + r.c;
      for (const r of allocMonthly) {
        if (r.city === city) {
          cAllocs[r.month] = (cAllocs[r.month] ?? 0) + r.totalCount;
          cSuccess[r.month] = (cSuccess[r.month] ?? 0) + r.successCount;
          cResolved[r.month] = (cResolved[r.month] ?? 0) + r.resolvedCount;
        }
      }

      byCityTimeline[city] = buildTrendTimeline({
        months,
        donorCounts: cDonors,
        organCounts: cOrgans,
        allocationCounts: cAllocs,
        successfulCounts: cSuccess,
        resolvedCounts: cResolved,
      });
    }

    const rawCities = db.prepare(`
      SELECT
        h.City AS city,
        COUNT(DISTINCT h.Hospital_ID) AS hospitals,
        SUM(CASE WHEN h.Transplant_Center_Certified = 1 THEN 1 ELSE 0 END) AS certifiedHospitals
      FROM hospital h
      GROUP BY h.City
    `).all() as { city: string; hospitals: number; certifiedHospitals: number }[];

    const regionalSummary: RegionalCitySummary[] = rawCities
      .map((c) => {
        const donors = (db.prepare(`
          SELECT COUNT(*) AS c FROM donor d JOIN hospital h ON d.Registering_Hospital_ID = h.Hospital_ID WHERE h.City = ?
        `).get(c.city) as { c: number }).c;
        const organsRetrieved = (db.prepare(`
          SELECT COUNT(*) AS c FROM organ o JOIN hospital h ON o.RetrievalHospitalID = h.Hospital_ID WHERE h.City = ?
        `).get(c.city) as { c: number }).c;
        const waitingRecipients = (db.prepare(`
          SELECT COUNT(*) AS c FROM recipient r JOIN hospital h ON r.RegisteringHospitalID = h.Hospital_ID WHERE h.City = ? AND r.RecipientStatus = 'Waiting'
        `).get(c.city) as { c: number }).c;
        const allocRow = db.prepare(`
          SELECT COUNT(*) AS allocationsTotal,
                 COALESCE(SUM(CASE WHEN a.AllocationStatus = 'Completed' AND a.TransplantOutcome = 'Successful' THEN 1 ELSE 0 END), 0) AS successfulTransplants,
                 COALESCE(SUM(CASE WHEN a.AllocationStatus IN ('Completed','Rejected','Cancelled') THEN 1 ELSE 0 END), 0) AS resolvedTransplants
          FROM allocation a
          JOIN hospital h ON a.TransplantHospitalID = h.Hospital_ID
          WHERE h.City = ?
        `).get(c.city) as { allocationsTotal: number; successfulTransplants: number; resolvedTransplants: number };

        return {
          city: c.city,
          hospitals: c.hospitals,
          certifiedHospitals: c.certifiedHospitals,
          donors,
          organsRetrieved,
          waitingRecipients,
          allocationsTotal: allocRow.allocationsTotal,
          successfulTransplants: allocRow.successfulTransplants,
          resolvedTransplants: allocRow.resolvedTransplants,
          successRate: computeTransplantSuccessRate(
            allocRow.successfulTransplants,
            allocRow.resolvedTransplants,
          ),
        };
      })
      .sort((a, b) => b.donors + b.organsRetrieved - (a.donors + a.organsRetrieved));

    res.json({ months, overallTimeline, byCityTimeline, regionalSummary });
  });

  // UNIFIED USER PROFILE (User, Hospital, Admin)
  app.get('/api/profile', (req, res) => {
    const role = String(req.query.role || '');
    const identifier = String(req.query.identifier || '');
    const linkedEntityId = req.query.linkedEntityId ? Number(req.query.linkedEntityId) : null;

    if (!role || !identifier) {
      res.status(400).json({ error: 'Role and identifier are required.' });
      return;
    }

    const account = db
      .prepare('SELECT * FROM auth_accounts WHERE Role = ? AND LOWER(Identifier) = LOWER(?)')
      .get(role, identifier) as
      | {
          Role: 'user' | 'hospital' | 'admin';
          SubRole: 'donor' | 'recipient' | null;
          Identifier: string;
          DisplayName: string;
          Linked_Entity_ID: number | null;
          Created_At: string;
        }
      | undefined;

    if (!account) {
      res.status(404).json({ error: 'Account profile not found.' });
      return;
    }

    const entityId = linkedEntityId ?? account.Linked_Entity_ID;
    const recentActivity = db
      .prepare('SELECT * FROM system_activity_log WHERE Actor_Role = ? AND (Actor_Name = ? OR Target_ID = ?) ORDER BY Log_ID DESC LIMIT 12')
      .all(role, account.DisplayName, String(entityId ?? identifier));

    if (role === 'user' && account.SubRole === 'donor' && entityId) {
      const donor = db.prepare(`
        SELECT d.*, h.Hospital_Name, h.City AS Hospital_City, h.State AS Hospital_State
        FROM donor d
        JOIN hospital h ON d.Registering_Hospital_ID = h.Hospital_ID
        WHERE d.Donor_ID = ?
      `).get(entityId) as Record<string, unknown> | undefined;

      if (!donor) {
        res.status(404).json({ error: 'Donor record not found.' });
        return;
      }

      res.json({
        profile: {
          role: 'user',
          subRole: 'donor',
          identifier: account.Identifier,
          displayName: String(donor.Full_Name),
          linkedEntityId: entityId,
          accountCreatedAt: account.Created_At,
          email: String(donor.Email),
          contactNumber: String(donor.Contact_Number),
          city: String(donor.Hospital_City || 'Pune'),
          state: String(donor.Hospital_State || 'Maharashtra'),
          address: String(donor.Address),
          registrationDate: String(donor.Registration_Date),
          bloodGroup: donor.Blood_Group,
          aadharNum: String(donor.Aadhar_Num),
          hospitalName: String(donor.Hospital_Name),
          donorType: donor.Donor_Type,
          donatingOrgan: String(donor.Donating_Organ),
          medicalFitness: String(donor.Medical_Fitness_Status),
          legalApprovalStatus: String(donor.Legal_Approval_Status),
          consentObtained: Boolean(donor.Consent_Obtained),
          recentActivity,
        },
      });
      return;
    }

    if (role === 'user' && account.SubRole === 'recipient' && entityId) {
      const rec = db.prepare(`
        SELECT r.*, h.Hospital_Name, h.City AS Hospital_City, h.State AS Hospital_State
        FROM recipient r
        JOIN hospital h ON r.RegisteringHospitalID = h.Hospital_ID
        WHERE r.Recipient_ID = ?
      `).get(entityId) as Record<string, unknown> | undefined;

      if (!rec) {
        res.status(404).json({ error: 'Recipient record not found.' });
        return;
      }

      res.json({
        profile: {
          role: 'user',
          subRole: 'recipient',
          identifier: account.Identifier,
          displayName: String(rec.Full_Name),
          linkedEntityId: entityId,
          accountCreatedAt: account.Created_At,
          email: String(rec.Email),
          contactNumber: String(rec.Contact_Number),
          city: String(rec.Hospital_City || 'Pune'),
          state: String(rec.Hospital_State || 'Maharashtra'),
          address: String(rec.Address),
          registrationDate: String(rec.RegistrationDate),
          bloodGroup: rec.Blood_Group,
          aadharNum: String(rec.Aadhar_Num),
          hospitalName: String(rec.Hospital_Name),
          requiredOrgan: rec.RequiredOrgan,
          urgencyLevel: rec.UrgencyLevel,
          priorityScore: Number(rec.PriorityScore),
          recipientStatus: String(rec.RecipientStatus),
          attendingPhysician: String(rec.Attending_Physician),
          disease: String(rec.Disease),
          recentActivity,
        },
      });
      return;
    }

    if (role === 'hospital' && entityId) {
      const hosp = db.prepare('SELECT * FROM hospital WHERE Hospital_ID = ?').get(entityId) as HospitalRecord | undefined;
      if (!hosp) {
        res.status(404).json({ error: 'Hospital record not found.' });
        return;
      }

      res.json({
        profile: {
          role: 'hospital',
          subRole: null,
          identifier: account.Identifier,
          displayName: account.DisplayName,
          linkedEntityId: hosp.Hospital_ID,
          accountCreatedAt: account.Created_At,
          email: hosp.Email || `${hosp.Hospital_ID}@organlink-hospital.org`,
          contactNumber: hosp.Contact_Number,
          city: hosp.City,
          state: hosp.State,
          address: `${hosp.City}, ${hosp.State}`,
          registrationDate: hosp.Registration_Date,
          hospitalName: hosp.Hospital_Name,
          hospitalType: hosp.Hospital_Type,
          licenseNumber: hosp.License_Number,
          certified: Boolean(hosp.Transplant_Center_Certified),
          recentActivity,
        },
      });
      return;
    }

    // Administrator profile
    res.json({
      profile: {
        role: 'admin',
        subRole: null,
        identifier: account.Identifier,
        displayName: account.DisplayName,
        linkedEntityId: null,
        accountCreatedAt: account.Created_At,
        email: account.Identifier.includes('@') ? account.Identifier : 'admin@organlink.gov.in',
        contactNumber: '+91-020-26128000',
        city: 'Pune / Mumbai',
        state: 'Maharashtra',
        address: 'Zonal Transplant Coordination Center (ZTCC), State Directorate',
        registrationDate: account.Created_At.slice(0, 10),
        recentActivity,
      },
    });
  });

  app.patch('/api/profile', (req, res) => {
    const body = req.body as Record<string, unknown>;
    const role = String(body.role || '');
    const identifier = String(body.identifier || '');
    const linkedEntityId = body.linkedEntityId ? Number(body.linkedEntityId) : null;

    if (!role || !identifier) {
      res.status(400).json({ error: 'Role and identifier are required.' });
      return;
    }

    const account = db
      .prepare('SELECT * FROM auth_accounts WHERE Role = ? AND LOWER(Identifier) = LOWER(?)')
      .get(role, identifier) as
      | {
          Account_ID: number;
          Role: 'user' | 'hospital' | 'admin';
          SubRole: 'donor' | 'recipient' | null;
          Identifier: string;
          PasswordHash: string;
          DisplayName: string;
          Linked_Entity_ID: number | null;
        }
      | undefined;

    if (!account) {
      res.status(404).json({ error: 'Account not found.' });
      return;
    }

    if (body.newPassword) {
      const currentPwd = String(body.currentPassword || '');
      const nextPwd = String(body.newPassword);
      if (hashPassword(currentPwd) !== account.PasswordHash) {
        res.status(400).json({ error: 'Current password is incorrect.' });
        return;
      }
      if (nextPwd.length < 4) {
        res.status(400).json({ error: 'New password must be at least 4 characters.' });
        return;
      }
      db.prepare('UPDATE auth_accounts SET PasswordHash = ? WHERE Role = ? AND (LOWER(Identifier) = LOWER(?) OR (Linked_Entity_ID IS NOT NULL AND Linked_Entity_ID = ?))').run(
        hashPassword(nextPwd),
        role,
        identifier,
        account.Linked_Entity_ID ?? -1,
      );
    }

    const nextDisplayName = body.displayName ? String(body.displayName).trim() : account.DisplayName;
    if (nextDisplayName && nextDisplayName !== account.DisplayName) {
      db.prepare('UPDATE auth_accounts SET DisplayName = ? WHERE Account_ID = ?').run(nextDisplayName, account.Account_ID);
    }

    const entityId = linkedEntityId ?? account.Linked_Entity_ID;
    if (role === 'user' && account.SubRole === 'donor' && entityId) {
      const existing = db.prepare('SELECT * FROM donor WHERE Donor_ID = ?').get(entityId) as Record<string, unknown> | undefined;
      if (existing) {
        db.prepare(`
          UPDATE donor SET Contact_Number = ?, Address = ?, Consent_Obtained = ? WHERE Donor_ID = ?
        `).run(
          body.contactNumber !== undefined ? String(body.contactNumber) : existing.Contact_Number,
          body.address !== undefined ? String(body.address) : existing.Address,
          body.consentObtained !== undefined ? (body.consentObtained ? 1 : 0) : existing.Consent_Obtained,
          entityId,
        );
      }
    } else if (role === 'user' && account.SubRole === 'recipient' && entityId) {
      const existing = db.prepare('SELECT * FROM recipient WHERE Recipient_ID = ?').get(entityId) as Record<string, unknown> | undefined;
      if (existing) {
        db.prepare(`
          UPDATE recipient SET Contact_Number = ?, Address = ? WHERE Recipient_ID = ?
        `).run(
          body.contactNumber !== undefined ? String(body.contactNumber) : existing.Contact_Number,
          body.address !== undefined ? String(body.address) : existing.Address,
          entityId,
        );
      }
    } else if (role === 'hospital' && entityId) {
      const existing = db.prepare('SELECT * FROM hospital WHERE Hospital_ID = ?').get(entityId) as HospitalRecord | undefined;
      if (existing) {
        db.prepare(`
          UPDATE hospital SET Contact_Number = ?, Email = ? WHERE Hospital_ID = ?
        `).run(
          body.contactNumber !== undefined ? String(body.contactNumber) : existing.Contact_Number,
          body.email !== undefined ? String(body.email) : existing.Email,
          entityId,
        );
      }
    }

    logActivity(role, nextDisplayName, 'UPDATE_PROFILE', 'auth_accounts', entityId ?? identifier, `Updated account profile & preferences`);
    res.json({ ok: true, displayName: nextDisplayName });
  });

  // DONOR ELIGIBILITY QUIZ ASSESSMENTS (Persisted to SQLite)
  app.get('/api/eligibility-assessments', (req, res) => {
    const identifier = String(req.query.identifier || '').trim().toLowerCase();
    const linkedEntityId = req.query.linkedEntityId ? Number(req.query.linkedEntityId) : null;

    if (!identifier && !linkedEntityId) {
      res.status(400).json({ error: 'Account identifier or linkedEntityId is required.' });
      return;
    }

    const rows = db
      .prepare(`
        SELECT * FROM eligibility_assessments
        WHERE LOWER(Account_Identifier) = ? OR (Linked_Entity_ID IS NOT NULL AND Linked_Entity_ID = ?)
        ORDER BY Assessment_ID DESC
        LIMIT 10
      `)
      .all(identifier, linkedEntityId ?? -1);

    res.json({ assessments: rows });
  });

  app.post('/api/eligibility-assessments', (req, res) => {
    const body = req.body as Record<string, unknown>;
    const identifier = String(body.identifier || '').trim().toLowerCase();
    const displayName = String(body.displayName || identifier || 'Registry User');
    const linkedEntityId = body.linkedEntityId ? Number(body.linkedEntityId) : null;
    const age = Number(body.age);
    const bmi = Number(body.bmi);
    const bloodGroup = String(body.bloodGroup || 'O+');
    const pathwayPreference = String(body.pathwayPreference || 'both');
    const overallReadiness = String(body.overallReadiness || '');
    const eligibleCount = Number(body.eligibleCount ?? 0);
    const conditionalCount = Number(body.conditionalCount ?? 0);
    const ineligibleCount = Number(body.ineligibleCount ?? 0);
    const resultJson = JSON.stringify(body.result ?? {});

    if (!identifier || !overallReadiness || !Number.isFinite(age) || !Number.isFinite(bmi)) {
      res.status(400).json({ error: 'Valid account identifier, biometrics, and evaluation summary are required.' });
      return;
    }

    const info = db
      .prepare(`
        INSERT INTO eligibility_assessments (
          Account_Identifier, Linked_Entity_ID, Age, BMI, Blood_Group, Pathway_Preference,
          Overall_Readiness, Eligible_Count, Conditional_Count, Ineligible_Count, Result_JSON
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        identifier,
        linkedEntityId,
        age,
        bmi,
        bloodGroup,
        pathwayPreference,
        overallReadiness,
        eligibleCount,
        conditionalCount,
        ineligibleCount,
        resultJson,
      );

    logActivity(
      'user',
      displayName,
      'ELIGIBILITY_QUIZ',
      'eligibility_assessments',
      info.lastInsertRowid as number,
      `Completed donor eligibility quiz (${overallReadiness}; ${eligibleCount} eligible pathways)`,
    );

    const saved = db
      .prepare('SELECT * FROM eligibility_assessments WHERE Assessment_ID = ?')
      .get(info.lastInsertRowid);
    res.status(201).json({ assessment: saved });
  });

  // GEMINI ASSISTANT CHAT ENDPOINT (Server-Side @google/genai)
  app.post('/api/chat', async (req, res) => {
    const body = req.body as {
      message?: string;
      history?: { role: 'user' | 'model'; text: string }[];
      context?: {
        screen?: string;
        role?: string | null;
        subRole?: string | null;
        activeTab?: string | null;
        displayName?: string | null;
        linkedEntityId?: number | null;
      };
    };

    const message = String(body.message || '').trim();
    if (!message) {
      res.status(400).json({ error: 'Message cannot be empty.' });
      return;
    }

    try {
      const reply = await generateAssistantReply({
        db,
        message,
        history: Array.isArray(body.history) ? body.history : [],
        clientContext: body.context,
      });
      res.json({ reply });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gemini assistant request failed.';
      const statusCode =
        msg.includes('not configured') || msg.includes('API_KEY_INVALID')
          ? 400
          : msg.includes('PERMISSION_DENIED')
          ? 403
          : msg.includes('RESOURCE_EXHAUSTED')
          ? 429
          : 500;
      res.status(statusCode).json({ error: msg });
    }
  });

  // HOSPITAL RESOURCE AVAILABILITY & REAL-TIME SSE STREAM
  app.get('/api/resources', (req, res) => {
    const rawId = req.query.hospitalId ? Number(req.query.hospitalId) : null;
    const hospitalId = rawId && Number.isFinite(rawId) ? rawId : null;
    res.json(getResourcePayload(hospitalId));
  });

  app.get('/api/resources/stream', (req, res) => {
    const rawId = req.query.hospitalId ? Number(req.query.hospitalId) : null;
    const hospitalId = rawId && Number.isFinite(rawId) ? rawId : null;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const client = { res, hospitalId };
    resourceStreamClients.add(client);

    const initialPayload = JSON.stringify(getResourcePayload(hospitalId));
    res.write(`event: resource-update\ndata: ${initialPayload}\n\n`);

    const keepAliveTimer = setInterval(() => {
      try {
        res.write(': keepalive\n\n');
      } catch {
        clearInterval(keepAliveTimer);
        resourceStreamClients.delete(client);
      }
    }, 30000);

    req.on('close', () => {
      clearInterval(keepAliveTimer);
      resourceStreamClients.delete(client);
    });
  });

  app.patch('/api/resources/:hospitalId', (req, res) => {
    const hospitalId = Number(req.params.hospitalId);
    if (!Number.isFinite(hospitalId) || hospitalId <= 0) {
      res.status(400).json({ error: 'Valid Hospital ID is required.' });
      return;
    }

    seedMissingHospitalResources(db);

    const existing = db
      .prepare(`
        SELECT r.*, h.Hospital_Name, h.City, h.Transplant_Center_Certified
        FROM hospital_resources r
        JOIN hospital h ON r.Hospital_ID = h.Hospital_ID
        WHERE r.Hospital_ID = ?
      `)
      .get(hospitalId) as HospitalResourceRecord | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Hospital resource record not found.' });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const normalized = normalizeResourceMutation(existing, {
      ICU_Beds_Occupied: body.ICU_Beds_Occupied !== undefined ? Number(body.ICU_Beds_Occupied) : undefined,
      Isolation_Beds_Occupied:
        body.Isolation_Beds_Occupied !== undefined ? Number(body.Isolation_Beds_Occupied) : undefined,
      Ward_Beds_Occupied: body.Ward_Beds_Occupied !== undefined ? Number(body.Ward_Beds_Occupied) : undefined,
      Theaters_Ready: body.Theaters_Ready !== undefined ? Number(body.Theaters_Ready) : undefined,
      Theaters_In_Use: body.Theaters_In_Use !== undefined ? Number(body.Theaters_In_Use) : undefined,
      Theaters_Sanitizing:
        body.Theaters_Sanitizing !== undefined ? Number(body.Theaters_Sanitizing) : undefined,
      Surgical_Teams_On_Call:
        body.Surgical_Teams_On_Call !== undefined ? Number(body.Surgical_Teams_On_Call) : undefined,
      Next_Theater_Available_Min:
        body.Next_Theater_Available_Min !== undefined ? Number(body.Next_Theater_Available_Min) : undefined,
      Notes: body.Notes !== undefined ? (body.Notes ? String(body.Notes).trim() : null) : undefined,
    });

    db.prepare(`
      UPDATE hospital_resources
      SET ICU_Beds_Occupied = ?,
          Isolation_Beds_Occupied = ?,
          Ward_Beds_Occupied = ?,
          Theaters_Ready = ?,
          Theaters_In_Use = ?,
          Theaters_Sanitizing = ?,
          Surgical_Teams_On_Call = ?,
          Next_Theater_Available_Min = ?,
          Theater_Readiness_Status = ?,
          Notes = ?,
          Updated_At = datetime('now')
      WHERE Hospital_ID = ?
    `).run(
      normalized.ICU_Beds_Occupied,
      normalized.Isolation_Beds_Occupied,
      normalized.Ward_Beds_Occupied,
      normalized.Theaters_Ready,
      normalized.Theaters_In_Use,
      normalized.Theaters_Sanitizing,
      normalized.Surgical_Teams_On_Call,
      normalized.Next_Theater_Available_Min,
      normalized.Theater_Readiness_Status,
      normalized.Notes,
      hospitalId,
    );

    logActivity(
      'hospital',
      String(body.actorName || existing.Hospital_Name || `Hospital #${hospitalId}`),
      'UPDATE',
      'hospital_resources',
      hospitalId,
      `Updated capacity: ICU ${normalized.ICU_Beds_Occupied}/${existing.ICU_Beds_Total}, ORs ${normalized.Theaters_Ready}/${existing.Theaters_Total} Ready (${normalized.Theater_Readiness_Status})`,
    );

    broadcastResourceUpdate();
    const payload = getResourcePayload(hospitalId);
    res.json({ resource: payload.resources[0], snapshot: payload.snapshot });
  });

  // HOSPITALS CRUD
  app.get('/api/hospitals', (req, res) => {
    const city = req.query.city ? String(req.query.city) : '';
    const certified = req.query.certified ? String(req.query.certified) : '';
    let sql = 'SELECT * FROM hospital WHERE 1=1';
    const params: unknown[] = [];
    if (city && city !== 'All') {
      sql += ' AND City = ?';
      params.push(city);
    }
    if (certified === '1' || certified === '0') {
      sql += ' AND Transplant_Center_Certified = ?';
      params.push(Number(certified));
    }
    sql += ' ORDER BY Hospital_ID ASC';
    res.json({ hospitals: db.prepare(sql).all(...params) });
  });

  app.post('/api/hospitals', (req, res) => {
    const body = req.body as Record<string, unknown>;
    const Hospital_Name = String(body.Hospital_Name || '').trim();
    const Hospital_Type = String(body.Hospital_Type || 'Private');
    const City = String(body.City || '').trim();
    const State = String(body.State || 'Maharashtra').trim();
    const Contact_Number = String(body.Contact_Number || '').trim();
    const Email = body.Email ? String(body.Email).trim() : null;
    const License_Number = String(body.License_Number || '').trim().toUpperCase();
    const Transplant_Center_Certified = body.Transplant_Center_Certified ? 1 : 0;

    if (!Hospital_Name || !City || !Contact_Number || !License_Number) {
      res.status(400).json({ error: 'Hospital Name, City, Contact Number, and License Number are required.' });
      return;
    }

    try {
      const newId = getNextId('hospital', 'Hospital_ID', 324270125);
      const today = new Date().toISOString().slice(0, 10);
      db.prepare(`
        INSERT INTO hospital (Hospital_ID, Hospital_Name, Hospital_Type, City, State, Contact_Number, Email, License_Number, Transplant_Center_Certified, Registration_Date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(newId, Hospital_Name, Hospital_Type, City, State, Contact_Number, Email, License_Number, Transplant_Center_Certified, today);

      db.prepare(`
        INSERT OR IGNORE INTO auth_accounts (Role, SubRole, Identifier, PasswordHash, DisplayName, Linked_Entity_ID)
        VALUES ('hospital', NULL, ?, ?, ?, ?)
      `).run(String(newId), hashPassword('hosp123'), Hospital_Name, newId);

      seedMissingHospitalResources(db);
      logActivity('admin', 'Administrator', 'INSERT', 'hospital', newId, `Added hospital ${Hospital_Name} (${City})`);
      broadcastResourceUpdate();
      const hospital = db.prepare('SELECT * FROM hospital WHERE Hospital_ID = ?').get(newId);
      res.status(201).json({ hospital });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create hospital.';
      res.status(409).json({ error: msg.includes('UNIQUE') ? 'License Number already exists.' : msg });
    }
  });

  app.patch('/api/hospitals/:id', (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM hospital WHERE Hospital_ID = ?').get(id) as HospitalRecord | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Hospital not found.' });
      return;
    }
    const body = req.body as Partial<HospitalRecord>;
    const certified =
      typeof body.Transplant_Center_Certified === 'number'
        ? body.Transplant_Center_Certified
        : existing.Transplant_Center_Certified;
    const contact = body.Contact_Number ?? existing.Contact_Number;
    const email = body.Email !== undefined ? body.Email : existing.Email;
    const hType = body.Hospital_Type ?? existing.Hospital_Type;

    db.prepare(`
      UPDATE hospital
      SET Transplant_Center_Certified = ?, Contact_Number = ?, Email = ?, Hospital_Type = ?
      WHERE Hospital_ID = ?
    `).run(certified, contact, email, hType, id);

    logActivity('admin', 'Administrator', 'UPDATE', 'hospital', id, `Updated ${existing.Hospital_Name} (Certified: ${certified === 1 ? 'Yes' : 'No'})`);
    res.json({ hospital: db.prepare('SELECT * FROM hospital WHERE Hospital_ID = ?').get(id) });
  });

  // DONORS CRUD
  app.get('/api/donors', (req, res) => {
    const hospitalId = req.query.hospitalId ? Number(req.query.hospitalId) : null;
    const status = req.query.status ? String(req.query.status) : '';
    const legalStatus = req.query.legalStatus ? String(req.query.legalStatus) : '';
    const bloodGroup = req.query.bloodGroup ? String(req.query.bloodGroup) : '';
    const search = req.query.search ? String(req.query.search).trim().toLowerCase() : '';

    let sql = `
      SELECT d.*, h.Hospital_Name, h.City AS Hospital_City
      FROM donor d
      JOIN hospital h ON d.Registering_Hospital_ID = h.Hospital_ID
      WHERE 1=1
    `;
    const params: unknown[] = [];

    if (hospitalId) {
      sql += ' AND d.Registering_Hospital_ID = ?';
      params.push(hospitalId);
    }
    if (status && status !== 'All') {
      sql += ' AND d.Donor_Status = ?';
      params.push(status);
    }
    if (legalStatus && legalStatus !== 'All') {
      sql += ' AND d.Legal_Approval_Status = ?';
      params.push(legalStatus);
    }
    if (bloodGroup && bloodGroup !== 'All') {
      sql += ' AND d.Blood_Group = ?';
      params.push(bloodGroup);
    }
    if (search) {
      sql += ' AND (LOWER(d.Full_Name) LIKE ? OR CAST(d.Donor_ID AS TEXT) LIKE ? OR LOWER(d.Email) LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    sql += ' ORDER BY d.Donor_ID DESC';
    res.json({ donors: db.prepare(sql).all(...params) });
  });

  app.get('/api/donors/:id', (req, res) => {
    const id = Number(req.params.id);
    const donor = db.prepare(`
      SELECT d.*, h.Hospital_Name, h.City AS Hospital_City
      FROM donor d
      JOIN hospital h ON d.Registering_Hospital_ID = h.Hospital_ID
      WHERE d.Donor_ID = ?
    `).get(id);
    if (!donor) {
      res.status(404).json({ error: 'Donor not found.' });
      return;
    }
    const organs = db.prepare('SELECT * FROM v_organ_inventory WHERE DonorID = ? ORDER BY OrganID DESC').all(id);
    const tests = db.prepare(`
      SELECT m.*, h.Hospital_Name, o.OrganCode
      FROM medicaltest m
      JOIN hospital h ON m.ConductedByHospitalID = h.Hospital_ID
      LEFT JOIN organ o ON m.OrganID = o.OrganID
      WHERE m.Person_ID = ?
      ORDER BY m.TestDate DESC
    `).all(id);
    const allocations = db.prepare(`
      SELECT * FROM v_allocation_pipeline WHERE OrganID IN (SELECT OrganID FROM organ WHERE DonorID = ?)
      ORDER BY AllocationDate DESC
    `).all(id);
    res.json({ donor, organs, tests, allocations });
  });

  app.post('/api/donors', (req, res) => {
    const body = req.body as Record<string, unknown>;
    const Full_Name = String(body.Full_Name || '').trim();
    const DOB = String(body.DOB || '').trim();
    const Gender = String(body.Gender || 'Male');
    const Blood_Group = String(body.Blood_Group || 'O+');
    const Contact_Number = String(body.Contact_Number || '').trim();
    const Email = String(body.Email || '').trim().toLowerCase();
    const Address = String(body.Address || '').trim();
    const Aadhar_Num = String(body.Aadhar_Num || '').trim();
    const Donor_Type = String(body.Donor_Type || 'Living');
    const Donating_Organ = String(body.Donating_Organ || 'Kidney');
    const Registering_Hospital_ID = Number(body.Registering_Hospital_ID || 324270101);
    const Brain_Death_Conf = body.Brain_Death_Conf ? 1 : 0;
    const Consent_Obtained = body.Consent_Obtained === false ? 0 : 1;

    if (!Full_Name || !DOB || !Contact_Number || !Email || !Address || !Aadhar_Num) {
      res.status(400).json({ error: 'All mandatory donor fields are required.' });
      return;
    }

    try {
      const newId = getNextId('donor', 'Donor_ID', 126270031);
      const today = new Date().toISOString().slice(0, 10);
      const brainDeathDate = Brain_Death_Conf ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null;

      db.prepare(`
        INSERT INTO donor (
          Donor_ID, Full_Name, DOB, Gender, Blood_Group, Contact_Number, Email, Address,
          Aadhar_Num, Registration_Date, Donor_Type, Donating_Organ, Brain_Death_Conf,
          Brain_Death_Date, Consent_Obtained, Legal_Approval_Status, Legal_Approval_Date,
          Legal_Authority, Registering_Hospital_ID, Medical_Fitness_Status, Donor_Status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, ?, 'Pending', 'Registered')
      `).run(
        newId,
        Full_Name,
        DOB,
        Gender,
        Blood_Group,
        Contact_Number,
        Email,
        Address,
        Aadhar_Num,
        today,
        Donor_Type,
        Donating_Organ,
        Brain_Death_Conf,
        brainDeathDate,
        Consent_Obtained,
        Registering_Hospital_ID,
      );

      db.prepare(`
        INSERT OR IGNORE INTO auth_accounts (Role, SubRole, Identifier, PasswordHash, DisplayName, Linked_Entity_ID)
        VALUES ('user', 'donor', ?, ?, ?, ?)
      `).run(Email, hashPassword('user123'), Full_Name, newId);

      logActivity('hospital', `Hospital #${Registering_Hospital_ID}`, 'INSERT', 'donor', newId, `Registered donor ${Full_Name} (${Blood_Group}, ${Donating_Organ})`);
      const donor = db.prepare('SELECT d.*, h.Hospital_Name FROM donor d JOIN hospital h ON d.Registering_Hospital_ID = h.Hospital_ID WHERE d.Donor_ID = ?').get(newId);
      res.status(201).json({ donor });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to register donor.';
      res.status(409).json({ error: msg.includes('UNIQUE') ? 'Aadhar Number already registered.' : msg });
    }
  });

  app.patch('/api/donors/:id', (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM donor WHERE Donor_ID = ?').get(id) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Donor not found.' });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const Contact_Number = body.Contact_Number !== undefined ? String(body.Contact_Number) : existing.Contact_Number;
    const Address = body.Address !== undefined ? String(body.Address) : existing.Address;
    const Medical_Fitness_Status = body.Medical_Fitness_Status !== undefined ? String(body.Medical_Fitness_Status) : existing.Medical_Fitness_Status;
    const Donor_Status = body.Donor_Status !== undefined ? String(body.Donor_Status) : existing.Donor_Status;
    const Legal_Approval_Status = body.Legal_Approval_Status !== undefined ? String(body.Legal_Approval_Status) : existing.Legal_Approval_Status;
    const Legal_Authority = body.Legal_Authority !== undefined ? String(body.Legal_Authority) : existing.Legal_Authority;
    const Consent_Obtained = body.Consent_Obtained !== undefined ? (body.Consent_Obtained ? 1 : 0) : existing.Consent_Obtained;
    const Brain_Death_Conf = body.Brain_Death_Conf !== undefined ? (body.Brain_Death_Conf ? 1 : 0) : existing.Brain_Death_Conf;

    let Legal_Approval_Date = existing.Legal_Approval_Date;
    if (body.Legal_Approval_Status && body.Legal_Approval_Status !== existing.Legal_Approval_Status && body.Legal_Approval_Status !== 'pending') {
      Legal_Approval_Date = new Date().toISOString().slice(0, 19).replace('T', ' ');
    }

    let Brain_Death_Date = existing.Brain_Death_Date;
    if (Brain_Death_Conf === 1 && !existing.Brain_Death_Date) {
      Brain_Death_Date = new Date().toISOString().slice(0, 19).replace('T', ' ');
    }

    db.prepare(`
      UPDATE donor SET
        Contact_Number = ?,
        Address = ?,
        Medical_Fitness_Status = ?,
        Donor_Status = ?,
        Legal_Approval_Status = ?,
        Legal_Approval_Date = ?,
        Legal_Authority = ?,
        Consent_Obtained = ?,
        Brain_Death_Conf = ?,
        Brain_Death_Date = ?
      WHERE Donor_ID = ?
    `).run(
      Contact_Number,
      Address,
      Medical_Fitness_Status,
      Donor_Status,
      Legal_Approval_Status,
      Legal_Approval_Date,
      Legal_Authority,
      Consent_Obtained,
      Brain_Death_Conf,
      Brain_Death_Date,
      id,
    );

    logActivity(
      String(body.actorRole || 'hospital'),
      String(body.actorName || 'Registry Staff'),
      'UPDATE',
      'donor',
      id,
      `Updated donor ${String(existing.Full_Name)}: Status=${String(Donor_Status)}, Fitness=${String(Medical_Fitness_Status)}, Legal=${String(Legal_Approval_Status)}`,
    );

    const updated = db.prepare('SELECT d.*, h.Hospital_Name, h.City AS Hospital_City FROM donor d JOIN hospital h ON d.Registering_Hospital_ID = h.Hospital_ID WHERE d.Donor_ID = ?').get(id);
    res.json({ donor: updated });
  });

  // RECIPIENTS CRUD
  app.get('/api/recipients', (req, res) => {
    const hospitalId = req.query.hospitalId ? Number(req.query.hospitalId) : null;
    const status = req.query.status ? String(req.query.status) : '';
    const organ = req.query.organ ? String(req.query.organ) : '';
    const urgency = req.query.urgency ? String(req.query.urgency) : '';
    const search = req.query.search ? String(req.query.search).trim().toLowerCase() : '';

    let sql = `
      SELECT r.*, h.Hospital_Name, h.City AS Hospital_City
      FROM recipient r
      JOIN hospital h ON r.RegisteringHospitalID = h.Hospital_ID
      WHERE 1=1
    `;
    const params: unknown[] = [];
    if (hospitalId) {
      sql += ' AND r.RegisteringHospitalID = ?';
      params.push(hospitalId);
    }
    if (status && status !== 'All') {
      sql += ' AND r.RecipientStatus = ?';
      params.push(status);
    }
    if (organ && organ !== 'All') {
      sql += ' AND r.RequiredOrgan = ?';
      params.push(organ);
    }
    if (urgency && urgency !== 'All') {
      sql += ' AND r.UrgencyLevel = ?';
      params.push(urgency);
    }
    if (search) {
      sql += ' AND (LOWER(r.Full_Name) LIKE ? OR CAST(r.Recipient_ID AS TEXT) LIKE ? OR LOWER(r.Disease) LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    sql += ' ORDER BY r.PriorityScore DESC, r.Recipient_ID ASC';
    res.json({ recipients: db.prepare(sql).all(...params) });
  });

  app.get('/api/recipients/:id', (req, res) => {
    const id = Number(req.params.id);
    const recipient = db.prepare(`
      SELECT r.*, h.Hospital_Name, h.City AS Hospital_City
      FROM recipient r
      JOIN hospital h ON r.RegisteringHospitalID = h.Hospital_ID
      WHERE r.Recipient_ID = ?
    `).get(id) as RecipientRecord | undefined;

    if (!recipient) {
      res.status(404).json({ error: 'Recipient not found.' });
      return;
    }

    const queueRows = db
      .prepare("SELECT Recipient_ID FROM recipient WHERE RecipientStatus = 'Waiting' AND RequiredOrgan = ? ORDER BY PriorityScore DESC, RegistrationDate ASC")
      .all(recipient.RequiredOrgan) as { Recipient_ID: number }[];
    const queuePosition = queueRows.findIndex((row) => row.Recipient_ID === id);

    const tests = db.prepare(`
      SELECT m.*, h.Hospital_Name, o.OrganCode
      FROM medicaltest m
      JOIN hospital h ON m.ConductedByHospitalID = h.Hospital_ID
      LEFT JOIN organ o ON m.OrganID = o.OrganID
      WHERE m.Person_ID = ?
      ORDER BY m.TestDate DESC
    `).all(id);

    const allocations = db.prepare('SELECT * FROM v_allocation_pipeline WHERE RecipientID = ? ORDER BY AllocationDate DESC').all(id);

    const availableOrgans = db.prepare("SELECT * FROM v_organ_inventory WHERE OrganStatus = 'Available' AND OrganType = ?").all(recipient.RequiredOrgan) as OrganRecord[];
    const hospitals = db.prepare('SELECT Hospital_ID, City FROM hospital').all() as HospitalRecord[];
    const cityMap: Record<number, string> = {};
    for (const h of hospitals) cityMap[h.Hospital_ID] = h.City;

    const compatibleOrgans = availableOrgans
      .map((organ) => {
        const ranked = rankCompatibleRecipients(organ, [recipient], cityMap);
        if (ranked.length === 0) return null;
        return {
          organ,
          compatibilityScore: ranked[0].compatibilityScore,
          bloodMatchType: ranked[0].bloodMatchType,
          reasons: ranked[0].reasons,
        };
      })
      .filter(Boolean);

    res.json({
      recipient,
      queuePosition: queuePosition >= 0 ? queuePosition + 1 : null,
      queueTotal: queueRows.length,
      tests,
      allocations,
      compatibleOrgans,
    });
  });

  app.post('/api/recipients', (req, res) => {
    const body = req.body as Record<string, unknown>;
    const Full_Name = String(body.Full_Name || '').trim();
    const DOB = String(body.DOB || '').trim();
    const Gender = String(body.Gender || 'Female');
    const Blood_Group = String(body.Blood_Group || 'O+');
    const Contact_Number = String(body.Contact_Number || '').trim();
    const Email = String(body.Email || '').trim().toLowerCase();
    const Address = String(body.Address || '').trim();
    const Aadhar_Num = String(body.Aadhar_Num || '').trim();
    const RequiredOrgan = String(body.RequiredOrgan || 'Kidney');
    const UrgencyLevel = (String(body.UrgencyLevel || 'Urgent') as UrgencyLevel);
    const RegisteringHospitalID = Number(body.RegisteringHospitalID || 324270101);
    const Previous_Transplant_History = body.Previous_Transplant_History ? 1 : 0;
    const Attending_Physician = String(body.Attending_Physician || 'Dr. Suresh Joshi').trim();
    const Disease = String(body.Disease || 'End-Stage Organ Failure').trim();

    if (!Full_Name || !DOB || !Contact_Number || !Email || !Address || !Aadhar_Num) {
      res.status(400).json({ error: 'All mandatory recipient fields are required.' });
      return;
    }

    try {
      const newId = getNextId('recipient', 'Recipient_ID', 625270033);
      const today = new Date().toISOString().slice(0, 10);
      const PriorityScore = calculateRecipientPriorityScore({
        urgencyLevel: UrgencyLevel,
        previousTransplantHistory: Boolean(Previous_Transplant_History),
        waitingDays: 0,
      });

      db.prepare(`
        INSERT INTO recipient (
          Recipient_ID, Full_Name, DOB, Gender, Blood_Group, Contact_Number, Email, Address,
          Aadhar_Num, RequiredOrgan, UrgencyLevel, PriorityScore, RegistrationDate,
          RegisteringHospitalID, RecipientStatus, RemovalReason, Previous_Transplant_History,
          Attending_Physician, Disease
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Waiting', NULL, ?, ?, ?)
      `).run(
        newId,
        Full_Name,
        DOB,
        Gender,
        Blood_Group,
        Contact_Number,
        Email,
        Address,
        Aadhar_Num,
        RequiredOrgan,
        UrgencyLevel,
        PriorityScore,
        today,
        RegisteringHospitalID,
        Previous_Transplant_History,
        Attending_Physician,
        Disease,
      );

      db.prepare(`
        INSERT OR IGNORE INTO auth_accounts (Role, SubRole, Identifier, PasswordHash, DisplayName, Linked_Entity_ID)
        VALUES ('user', 'recipient', ?, ?, ?, ?)
      `).run(Email, hashPassword('user123'), Full_Name, newId);

      logActivity('hospital', `Hospital #${RegisteringHospitalID}`, 'INSERT', 'recipient', newId, `Added recipient ${Full_Name} (${RequiredOrgan}, ${UrgencyLevel})`);
      const recipient = db.prepare('SELECT r.*, h.Hospital_Name FROM recipient r JOIN hospital h ON r.RegisteringHospitalID = h.Hospital_ID WHERE r.Recipient_ID = ?').get(newId);
      res.status(201).json({ recipient });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to register recipient.';
      res.status(409).json({ error: msg.includes('UNIQUE') ? 'Aadhar Number already registered.' : msg });
    }
  });

  app.patch('/api/recipients/:id', (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM recipient WHERE Recipient_ID = ?').get(id) as RecipientRecord | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Recipient not found.' });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const Contact_Number = body.Contact_Number !== undefined ? String(body.Contact_Number) : existing.Contact_Number;
    const Address = body.Address !== undefined ? String(body.Address) : existing.Address;
    const UrgencyLevel = (body.UrgencyLevel !== undefined ? String(body.UrgencyLevel) : existing.UrgencyLevel) as UrgencyLevel;
    const RecipientStatus = body.RecipientStatus !== undefined ? String(body.RecipientStatus) : existing.RecipientStatus;
    const Attending_Physician = body.Attending_Physician !== undefined ? String(body.Attending_Physician) : existing.Attending_Physician;
    const RemovalReason = body.RemovalReason !== undefined ? String(body.RemovalReason) : existing.RemovalReason;

    let PriorityScore = existing.PriorityScore;
    if (body.PriorityScore !== undefined) {
      PriorityScore = Number(body.PriorityScore);
    } else if (body.UrgencyLevel && body.UrgencyLevel !== existing.UrgencyLevel) {
      const regMs = new Date(existing.RegistrationDate).getTime();
      const waitingDays = Math.max(0, Math.floor((Date.now() - regMs) / 86400000));
      PriorityScore = calculateRecipientPriorityScore({
        urgencyLevel: UrgencyLevel,
        previousTransplantHistory: Boolean(existing.Previous_Transplant_History),
        waitingDays,
      });
    }

    db.prepare(`
      UPDATE recipient SET
        Contact_Number = ?,
        Address = ?,
        UrgencyLevel = ?,
        PriorityScore = ?,
        RecipientStatus = ?,
        Attending_Physician = ?,
        RemovalReason = ?
      WHERE Recipient_ID = ?
    `).run(Contact_Number, Address, UrgencyLevel, PriorityScore, RecipientStatus, Attending_Physician, RemovalReason, id);

    logActivity(
      String(body.actorRole || 'hospital'),
      String(body.actorName || 'Clinical Staff'),
      'UPDATE',
      'recipient',
      id,
      `Updated recipient ${existing.Full_Name}: Status=${RecipientStatus}, Urgency=${UrgencyLevel}, Priority=${PriorityScore}`,
    );

    const updated = db.prepare('SELECT r.*, h.Hospital_Name, h.City AS Hospital_City FROM recipient r JOIN hospital h ON r.RegisteringHospitalID = h.Hospital_ID WHERE r.Recipient_ID = ?').get(id);
    res.json({ recipient: updated });
  });

  // ORGANS CRUD
  app.get('/api/organs', (req, res) => {
    const hospitalId = req.query.hospitalId ? Number(req.query.hospitalId) : null;
    const status = req.query.status ? String(req.query.status) : '';
    const organType = req.query.organType ? String(req.query.organType) : '';

    let sql = 'SELECT * FROM v_organ_inventory WHERE 1=1';
    const params: unknown[] = [];
    if (hospitalId) {
      sql += ' AND RetrievalHospitalID = ?';
      params.push(hospitalId);
    }
    if (status && status !== 'All') {
      sql += ' AND OrganStatus = ?';
      params.push(status);
    }
    if (organType && organType !== 'All') {
      sql += ' AND OrganType = ?';
      params.push(organType);
    }
    sql += ' ORDER BY OrganID DESC';
    res.json({ organs: db.prepare(sql).all(...params) });
  });

  app.post('/api/organs', (req, res) => {
    const body = req.body as Record<string, unknown>;
    const DonorID = Number(body.DonorID);
    const OrganType = String(body.OrganType || 'Kidney');
    const RetrievalHospitalID = Number(body.RetrievalHospitalID || 324270101);
    const MaxPreservationHours = Number(body.MaxPreservationHours || 24);
    const RetrievalDate = String(body.RetrievalDate || new Date().toISOString().slice(0, 19).replace('T', ' '));
    const PreservationStartTime = String(body.PreservationStartTime || RetrievalDate);

    const donor = db.prepare('SELECT Donor_ID, Blood_Group, Full_Name FROM donor WHERE Donor_ID = ?').get(DonorID) as
      | { Donor_ID: number; Blood_Group: string; Full_Name: string }
      | undefined;
    if (!donor) {
      res.status(404).json({ error: 'Selected Donor ID does not exist.' });
      return;
    }

    const startMs = new Date(PreservationStartTime.replace(' ', 'T')).getTime();
    const expiryDate = new Date((Number.isNaN(startMs) ? Date.now() : startMs) + MaxPreservationHours * 3600000);
    const ExpiryTime = expiryDate.toISOString().slice(0, 19).replace('T', ' ');

    const newId = getNextId('organ', 'OrganID', 226270031);
    const prefixMap: Record<string, string> = {
      Kidney: 'KID',
      Liver: 'LIV',
      Heart: 'HRT',
      Lung: 'LNG',
      Pancreas: 'PAN',
      Cornea: 'COR',
      'Small Intestine': 'SIN',
    };
    const OrganCode = `${prefixMap[OrganType] || 'ORG'}-${String(newId).slice(-5)}`;

    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO organ (
          OrganID, OrganCode, DonorID, OrganType, BloodGroup, RetrievalDate,
          RetrievalHospitalID, PreservationStartTime, MaxPreservationHours,
          ExpiryTime, OrganStatus, RejectionReason
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Available', NULL)
      `).run(
        newId,
        OrganCode,
        DonorID,
        OrganType,
        donor.Blood_Group,
        RetrievalDate,
        RetrievalHospitalID,
        PreservationStartTime,
        MaxPreservationHours,
        ExpiryTime,
      );

      db.prepare("UPDATE donor SET Donor_Status = 'Retrieved' WHERE Donor_ID = ? AND Donor_Status IN ('Registered','Evaluated','Approved')").run(DonorID);
    });
    tx();

    logActivity('hospital', `Hospital #${RetrievalHospitalID}`, 'INSERT', 'organ', newId, `Retrieved ${OrganType} (${OrganCode}) from donor ${donor.Full_Name}`);
    broadcastResourceUpdate();
    res.status(201).json({ organ: db.prepare('SELECT * FROM v_organ_inventory WHERE OrganID = ?').get(newId) });
  });

  app.patch('/api/organs/:id', (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM organ WHERE OrganID = ?').get(id) as OrganRecord | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Organ not found.' });
      return;
    }
    const body = req.body as { OrganStatus?: string; RejectionReason?: string | null };
    const nextStatus = body.OrganStatus ?? existing.OrganStatus;
    const nextReason = body.RejectionReason !== undefined ? body.RejectionReason : existing.RejectionReason;

    db.prepare('UPDATE organ SET OrganStatus = ?, RejectionReason = ? WHERE OrganID = ?').run(nextStatus, nextReason, id);
    logActivity('hospital', 'Clinical Staff', 'UPDATE', 'organ', id, `Updated organ ${existing.OrganCode} status to ${nextStatus}`);
    broadcastResourceUpdate();
    res.json({ organ: db.prepare('SELECT * FROM v_organ_inventory WHERE OrganID = ?').get(id) });
  });

  // MEDICAL TESTS CRUD
  app.get('/api/medical-tests', (req, res) => {
    const hospitalId = req.query.hospitalId ? Number(req.query.hospitalId) : null;
    const personId = req.query.personId ? Number(req.query.personId) : null;
    const result = req.query.result ? String(req.query.result) : '';

    let sql = `
      SELECT
        m.*,
        h.Hospital_Name,
        o.OrganCode,
        COALESCE(d.Full_Name, r.Full_Name, 'Patient #' || m.Person_ID) AS PersonName,
        CASE WHEN d.Donor_ID IS NOT NULL THEN 'Donor' WHEN r.Recipient_ID IS NOT NULL THEN 'Recipient' ELSE 'Registry Member' END AS PersonType
      FROM medicaltest m
      JOIN hospital h ON m.ConductedByHospitalID = h.Hospital_ID
      LEFT JOIN organ o ON m.OrganID = o.OrganID
      LEFT JOIN donor d ON m.Person_ID = d.Donor_ID
      LEFT JOIN recipient r ON m.Person_ID = r.Recipient_ID
      WHERE 1=1
    `;
    const params: unknown[] = [];
    if (hospitalId) {
      sql += ' AND m.ConductedByHospitalID = ?';
      params.push(hospitalId);
    }
    if (personId) {
      sql += ' AND m.Person_ID = ?';
      params.push(personId);
    }
    if (result && result !== 'All') {
      sql += ' AND m.TestResult = ?';
      params.push(result);
    }
    sql += ' ORDER BY m.TestDate DESC, m.TestID DESC';
    res.json({ tests: db.prepare(sql).all(...params) });
  });

  app.post('/api/medical-tests', (req, res) => {
    const body = req.body as Record<string, unknown>;
    const Person_ID = Number(body.Person_ID);
    const OrganID = body.OrganID ? Number(body.OrganID) : null;
    const TestType = String(body.TestType || '').trim();
    const TestResult = String(body.TestResult || 'Normal');
    const ResultDetails = String(body.ResultDetails || '').trim();
    const ConductedByHospitalID = Number(body.ConductedByHospitalID || 324270101);
    const LabName = String(body.LabName || 'Central Transplant Diagnostics Lab').trim();
    const TestDate = new Date().toISOString().slice(0, 19).replace('T', ' ');

    if (!Person_ID || !TestType) {
      res.status(400).json({ error: 'Person ID and Test Type are required.' });
      return;
    }

    const newId = getNextId('medicaltest', 'TestID', 426270034);
    db.prepare(`
      INSERT INTO medicaltest (
        TestID, Person_ID, OrganID, TestType, TestDate, TestResult,
        ResultDetails, ConductedByHospitalID, LabName
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(newId, Person_ID, OrganID, TestType, TestDate, TestResult, ResultDetails, ConductedByHospitalID, LabName);

    logActivity('hospital', `Hospital #${ConductedByHospitalID}`, 'INSERT', 'medicaltest', newId, `Recorded ${TestType} (${TestResult}) for Person #${Person_ID}`);
    const testRow = db.prepare(`
      SELECT m.*, h.Hospital_Name, o.OrganCode
      FROM medicaltest m
      JOIN hospital h ON m.ConductedByHospitalID = h.Hospital_ID
      LEFT JOIN organ o ON m.OrganID = o.OrganID
      WHERE m.TestID = ?
    `).get(newId);
    res.status(201).json({ test: testRow });
  });

  // COMPATIBILITY MATCHING ENGINE & ALLOCATIONS
  app.get('/api/matching/candidates/:organId', (req, res) => {
    const organId = Number(req.params.organId);
    const organ = db.prepare('SELECT * FROM v_organ_inventory WHERE OrganID = ?').get(organId) as OrganRecord | undefined;
    if (!organ) {
      res.status(404).json({ error: 'Organ not found.' });
      return;
    }

    const recipients = db.prepare(`
      SELECT r.*, h.Hospital_Name, h.City AS Hospital_City
      FROM recipient r
      JOIN hospital h ON r.RegisteringHospitalID = h.Hospital_ID
      WHERE r.RecipientStatus = 'Waiting'
    `).all() as RecipientRecord[];

    const hospitals = db.prepare('SELECT Hospital_ID, City FROM hospital').all() as HospitalRecord[];
    const cityMap: Record<number, string> = {};
    for (const h of hospitals) cityMap[h.Hospital_ID] = h.City;

    const candidates = rankCompatibleRecipients(organ, recipients, cityMap);
    res.json({ organ, candidates });
  });

  app.get('/api/allocations', (req, res) => {
    const hospitalId = req.query.hospitalId ? Number(req.query.hospitalId) : null;
    const status = req.query.status ? String(req.query.status) : '';

    let sql = 'SELECT * FROM v_allocation_pipeline WHERE 1=1';
    const params: unknown[] = [];
    if (hospitalId) {
      sql += ' AND (TransplantHospitalID = ? OR RetrievalHospitalID = ?)';
      params.push(hospitalId, hospitalId);
    }
    if (status && status !== 'All') {
      sql += ' AND AllocationStatus = ?';
      params.push(status);
    }
    sql += ' ORDER BY AllocationID DESC';
    res.json({ allocations: db.prepare(sql).all(...params) });
  });

  app.post('/api/allocations', (req, res) => {
    const body = req.body as Record<string, unknown>;
    const OrganID = Number(body.OrganID);
    const RecipientID = Number(body.RecipientID);
    const TransplantHospitalID = Number(body.TransplantHospitalID);
    const TransportMode = String(body.TransportMode || 'Green Corridor');
    const GreenCorridorUsed = TransportMode === 'Green Corridor' || body.GreenCorridorUsed ? 1 : 0;
    const LeadSurgeon = body.LeadSurgeon ? String(body.LeadSurgeon).trim() : null;

    const organ = db.prepare('SELECT * FROM organ WHERE OrganID = ?').get(OrganID) as OrganRecord | undefined;
    const recipient = db.prepare('SELECT * FROM recipient WHERE Recipient_ID = ?').get(RecipientID) as RecipientRecord | undefined;
    if (!organ || !recipient) {
      res.status(404).json({ error: 'Organ or Recipient record not found.' });
      return;
    }
    if (organ.OrganStatus !== 'Available') {
      res.status(409).json({ error: `Organ ${organ.OrganCode} is currently ${organ.OrganStatus} and cannot be allocated.` });
      return;
    }

    const hospitals = db.prepare('SELECT Hospital_ID, City FROM hospital').all() as HospitalRecord[];
    const cityMap: Record<number, string> = {};
    for (const h of hospitals) cityMap[h.Hospital_ID] = h.City;

    const match = rankCompatibleRecipients(organ, [{ ...recipient, RecipientStatus: 'Waiting' }], cityMap)[0];
    if (!match) {
      res.status(400).json({ error: `Clinical incompatibility: ${organ.OrganType} (${organ.BloodGroup}) cannot be matched to ${recipient.RequiredOrgan} (${recipient.Blood_Group}).` });
      return;
    }

    const newId = getNextId('allocation', 'AllocationID', 526270025);
    const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');

    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO allocation (
          AllocationID, OrganID, RecipientID, AllocationDate, CompatibilityVerified,
          CompatibilityScore, AllocationStatus, TransplantHospitalID, TransportMode,
          GreenCorridorUsed, TransportStartTime, TransportEndTime, TransplantSurgeryDate,
          LeadSurgeon, TransplantOutcome, RecoveryStatus
        ) VALUES (?, ?, ?, ?, 1, ?, 'Proposed', ?, ?, ?, NULL, NULL, NULL, ?, 'Not Performed', NULL)
      `).run(newId, OrganID, RecipientID, nowStr, match.compatibilityScore, TransplantHospitalID, TransportMode, GreenCorridorUsed, LeadSurgeon);

      db.prepare("UPDATE organ SET OrganStatus = 'Allocated' WHERE OrganID = ?").run(OrganID);
      db.prepare("UPDATE recipient SET RecipientStatus = 'Allocated' WHERE Recipient_ID = ?").run(RecipientID);
    });
    tx();

    logActivity('hospital', `Hospital #${TransplantHospitalID}`, 'ALLOCATE', 'allocation', newId, `Proposed allocation of ${organ.OrganCode} to ${recipient.Full_Name} (Score ${match.compatibilityScore}%)`);
    broadcastResourceUpdate();
    res.status(201).json({ allocation: db.prepare('SELECT * FROM v_allocation_pipeline WHERE AllocationID = ?').get(newId) });
  });

  app.patch('/api/allocations/:id', (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM allocation WHERE AllocationID = ?').get(id) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Allocation not found.' });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const AllocationStatus = String(body.AllocationStatus ?? existing.AllocationStatus);
    const TransportMode = body.TransportMode !== undefined ? String(body.TransportMode) : existing.TransportMode;
    const GreenCorridorUsed = TransportMode === 'Green Corridor' ? 1 : (body.GreenCorridorUsed !== undefined ? (body.GreenCorridorUsed ? 1 : 0) : existing.GreenCorridorUsed);
    const LeadSurgeon = body.LeadSurgeon !== undefined ? String(body.LeadSurgeon) : existing.LeadSurgeon;
    const TransplantOutcome = body.TransplantOutcome !== undefined ? String(body.TransplantOutcome) : existing.TransplantOutcome;
    const RecoveryStatus = body.RecoveryStatus !== undefined ? String(body.RecoveryStatus) : existing.RecoveryStatus;
    const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');

    const TransportStartTime =
      AllocationStatus === 'Confirmed' && !existing.TransportStartTime ? nowStr : existing.TransportStartTime;
    const TransplantSurgeryDate =
      AllocationStatus === 'Completed' && !existing.TransplantSurgeryDate ? nowStr : existing.TransplantSurgeryDate;
    const TransportEndTime =
      AllocationStatus === 'Completed' && !existing.TransportEndTime ? nowStr : existing.TransportEndTime;

    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE allocation SET
          AllocationStatus = ?,
          TransportMode = ?,
          GreenCorridorUsed = ?,
          TransportStartTime = ?,
          TransportEndTime = ?,
          TransplantSurgeryDate = ?,
          LeadSurgeon = ?,
          TransplantOutcome = ?,
          RecoveryStatus = ?
        WHERE AllocationID = ?
      `).run(
        AllocationStatus,
        TransportMode,
        GreenCorridorUsed,
        TransportStartTime,
        TransportEndTime,
        TransplantSurgeryDate,
        LeadSurgeon,
        TransplantOutcome,
        RecoveryStatus,
        id,
      );

      if (AllocationStatus === 'Completed') {
        db.prepare("UPDATE recipient SET RecipientStatus = 'Transplanted' WHERE Recipient_ID = ?").run(existing.RecipientID);
      } else if (AllocationStatus === 'Cancelled' || AllocationStatus === 'Rejected') {
        db.prepare("UPDATE organ SET OrganStatus = 'Available' WHERE OrganID = ? AND OrganStatus = 'Allocated'").run(existing.OrganID);
        db.prepare("UPDATE recipient SET RecipientStatus = 'Waiting' WHERE Recipient_ID = ? AND RecipientStatus = 'Allocated'").run(existing.RecipientID);
      }
    });
    tx();

    logActivity(
      String(body.actorRole || 'hospital'),
      String(body.actorName || 'Transplant Coordinator'),
      'UPDATE',
      'allocation',
      id,
      `Updated allocation #${id}: Status=${AllocationStatus}${TransplantOutcome ? `, Outcome=${TransplantOutcome}` : ''}`,
    );

    broadcastResourceUpdate();
    res.json({ allocation: db.prepare('SELECT * FROM v_allocation_pipeline WHERE AllocationID = ?').get(id) });
  });

  // DBMS ADMIN: Schema Introspection, SQL Workbench, Audit Logs, Integrity Check, Reset
  app.get('/api/dbms/schema', (_req, res) => {
    const entities = db
      .prepare("SELECT name, type, sql FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY type, name")
      .all() as { name: string; type: 'table' | 'view'; sql: string }[];

    const tables = entities.map((entity) => {
      const columns = db.prepare(`PRAGMA table_info(${entity.name})`).all();
      const foreignKeys = entity.type === 'table' ? db.prepare(`PRAGMA foreign_key_list(${entity.name})`).all() : [];
      const countRow = db.prepare(`SELECT COUNT(*) AS c FROM ${entity.name}`).get() as { c: number };
      return {
        name: entity.name,
        type: entity.type,
        rowCount: countRow.c,
        columns,
        foreignKeys,
      };
    });

    const triggers = db
      .prepare("SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'trigger' ORDER BY name")
      .all();

    res.json({ tables, triggers });
  });

  app.get('/api/dbms/audit-logs', (_req, res) => {
    const recipientAudit = db.prepare(`
      SELECT a.*, r.Full_Name AS Recipient_Name
      FROM recipient_status_audit a
      LEFT JOIN recipient r ON a.Recipient_ID = r.Recipient_ID
      ORDER BY a.Audit_ID DESC
      LIMIT 100
    `).all();
    const systemLogs = db
      .prepare('SELECT * FROM system_activity_log ORDER BY Log_ID DESC LIMIT 100')
      .all();
    res.json({ recipientAudit, systemLogs });
  });

  app.post('/api/dbms/query', (req, res) => {
    const { sql, allowMutations } = req.body as { sql?: string; allowMutations?: boolean };
    const validation = validateSqlQuery(String(sql || ''), Boolean(allowMutations));
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const started = performance.now();
    try {
      if (validation.kind === 'read') {
        const rows = db.prepare(validation.normalized).all() as Record<string, unknown>[];
        const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
        const durationMs = Math.round((performance.now() - started) * 100) / 100;
        res.json({ kind: 'read', columns, rows: rows.slice(0, 250), totalRows: rows.length, durationMs });
      } else {
        const info = db.prepare(validation.normalized).run();
        const durationMs = Math.round((performance.now() - started) * 100) / 100;
        const rowIdNum = Number(info.lastInsertRowid ?? 0);
        logActivity('admin', 'SQL Console', 'DML', 'custom_sql', rowIdNum, validation.normalized.slice(0, 120));
        res.json({ kind: 'write', changes: info.changes, lastInsertRowid: rowIdNum, durationMs });
      }
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'SQL execution failed.' });
    }
  });

  app.post('/api/dbms/integrity-check', (_req, res) => {
    const integrity = db.prepare('PRAGMA integrity_check').all();
    const fkViolations = db.prepare('PRAGMA foreign_key_check').all();
    res.json({ integrity, fkViolations });
  });

  app.post('/api/dbms/reset', (_req, res) => {
    seedDatabaseFromSqlDumps(db, true);
    broadcastResourceUpdate();
    res.json({ ok: true, message: 'Database reset to original 6 SQL dump snapshots.' });
  });

  // Vite dev middleware or static serving
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`OrganLink DBMS server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
