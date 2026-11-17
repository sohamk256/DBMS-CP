import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'organ_donation.db');
const SQL_ASSETS_DIR = path.resolve(process.cwd(), 'public/assets/aistudio');

const SQL_FILES = {
  hospital: 'organ_donation_db_hospital_6bae1e15.sql',
  donor: 'organ_donation_db_donor_ac1b69c6.sql',
  organ: 'organ_donation_db_organ_3ba2ad58.sql',
  recipient: 'organ_donation_db_recipient_9632ab8e.sql',
  medicaltest: 'organ_donation_db_medicaltest_f639b9c2.sql',
  allocation: 'organ_donation_db_allocation_2d57cc66.sql',
};

let dbInstance: Database.Database | null = null;

export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(`organlink:${password}`).digest('hex');
}

function parseSqlInsertValues(sqlContent: string, tableName: string): (string | number | null)[][] {
  const rows: (string | number | null)[][] = [];
  const regex = new RegExp(`INSERT INTO \`${tableName}\` VALUES\\s*([\\s\\S]*?);`, 'gi');
  let match: RegExpExecArray | null;

  while ((match = regex.exec(sqlContent)) !== null) {
    const valuesBlock = match[1];
    let i = 0;
    const len = valuesBlock.length;

    while (i < len) {
      while (i < len && valuesBlock[i] !== '(') {
        i++;
      }
      if (i >= len) break;
      i++; // skip '('

      const tuple: (string | number | null)[] = [];
      while (i < len) {
        while (i < len && (valuesBlock[i] === ' ' || valuesBlock[i] === '\n' || valuesBlock[i] === '\r' || valuesBlock[i] === '\t')) {
          i++;
        }
        if (i >= len) break;

        if (valuesBlock[i] === "'") {
          i++; // skip opening quote
          let str = '';
          while (i < len) {
            if (valuesBlock[i] === '\\' && i + 1 < len) {
              const nextChar = valuesBlock[i + 1];
              if (nextChar === 'n') str += '\n';
              else if (nextChar === 'r') str += '\r';
              else if (nextChar === 't') str += '\t';
              else str += nextChar;
              i += 2;
              continue;
            }
            if (valuesBlock[i] === "'" && valuesBlock[i + 1] === "'") {
              str += "'";
              i += 2;
              continue;
            }
            if (valuesBlock[i] === "'") {
              i++; // skip closing quote
              break;
            }
            str += valuesBlock[i];
            i++;
          }
          tuple.push(str);
        } else {
          let token = '';
          while (i < len && valuesBlock[i] !== ',' && valuesBlock[i] !== ')') {
            token += valuesBlock[i];
            i++;
          }
          const trimmed = token.trim();
          if (trimmed.toUpperCase() === 'NULL' || trimmed === '') {
            tuple.push(null);
          } else if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
            tuple.push(Number(trimmed));
          } else {
            tuple.push(trimmed);
          }
        }

        while (i < len && (valuesBlock[i] === ' ' || valuesBlock[i] === '\n' || valuesBlock[i] === '\r' || valuesBlock[i] === '\t')) {
          i++;
        }
        if (valuesBlock[i] === ',') {
          i++;
          continue;
        }
        if (valuesBlock[i] === ')') {
          i++;
          break;
        }
      }
      if (tuple.length > 0) {
        rows.push(tuple);
      }
    }
  }

  return rows;
}

function createSchema(db: Database.Database): void {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS hospital (
      Hospital_ID INTEGER PRIMARY KEY,
      Hospital_Name TEXT NOT NULL,
      Hospital_Type TEXT NOT NULL CHECK (Hospital_Type IN ('Government','Private','Trust')),
      City TEXT NOT NULL,
      State TEXT NOT NULL,
      Contact_Number TEXT NOT NULL,
      Email TEXT,
      License_Number TEXT NOT NULL UNIQUE,
      Transplant_Center_Certified INTEGER NOT NULL DEFAULT 0,
      Registration_Date TEXT NOT NULL DEFAULT (date('now'))
    );

    CREATE TABLE IF NOT EXISTS donor (
      Donor_ID INTEGER PRIMARY KEY,
      Full_Name TEXT NOT NULL,
      DOB TEXT NOT NULL,
      Gender TEXT NOT NULL CHECK (Gender IN ('Male','Female','Other')),
      Blood_Group TEXT NOT NULL CHECK (Blood_Group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
      Contact_Number TEXT NOT NULL,
      Email TEXT NOT NULL,
      Address TEXT NOT NULL,
      Aadhar_Num TEXT NOT NULL UNIQUE,
      Registration_Date TEXT NOT NULL,
      Donor_Type TEXT NOT NULL CHECK (Donor_Type IN ('Living','Deceased')),
      Donating_Organ TEXT NOT NULL DEFAULT 'Kidney' CHECK (Donating_Organ IN ('Kidney','Liver','Heart','Lungs','Pancreas','Multiple')),
      Brain_Death_Conf INTEGER NOT NULL DEFAULT 0,
      Brain_Death_Date TEXT,
      Consent_Obtained INTEGER NOT NULL,
      Legal_Approval_Status TEXT NOT NULL CHECK (Legal_Approval_Status IN ('pending','Approved','Rejected')),
      Legal_Approval_Date TEXT,
      Legal_Authority TEXT,
      Registering_Hospital_ID INTEGER NOT NULL,
      Medical_Fitness_Status TEXT NOT NULL CHECK (Medical_Fitness_Status IN ('Pending','Fit','Unfit')),
      Donor_Status TEXT NOT NULL CHECK (Donor_Status IN ('Registered','Evaluated','Approved','Retrieved','Rejected','Deceased')),
      FOREIGN KEY (Registering_Hospital_ID) REFERENCES hospital(Hospital_ID) ON DELETE CASCADE ON UPDATE CASCADE
    );

    CREATE TABLE IF NOT EXISTS organ (
      OrganID INTEGER PRIMARY KEY,
      OrganCode TEXT NOT NULL UNIQUE,
      DonorID INTEGER NOT NULL,
      OrganType TEXT NOT NULL CHECK (OrganType IN ('Kidney','Liver','Heart','Lung','Pancreas','Cornea','Small Intestine')),
      BloodGroup TEXT NOT NULL CHECK (BloodGroup IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
      RetrievalDate TEXT NOT NULL,
      RetrievalHospitalID INTEGER NOT NULL,
      PreservationStartTime TEXT NOT NULL,
      MaxPreservationHours INTEGER NOT NULL,
      ExpiryTime TEXT NOT NULL,
      OrganStatus TEXT NOT NULL DEFAULT 'Available' CHECK (OrganStatus IN ('Available','Allocated','Transplanted','Expired','Rejected')),
      RejectionReason TEXT,
      FOREIGN KEY (DonorID) REFERENCES donor(Donor_ID) ON DELETE CASCADE ON UPDATE CASCADE,
      FOREIGN KEY (RetrievalHospitalID) REFERENCES hospital(Hospital_ID) ON DELETE CASCADE ON UPDATE CASCADE
    );

    CREATE TABLE IF NOT EXISTS recipient (
      Recipient_ID INTEGER PRIMARY KEY,
      Full_Name TEXT NOT NULL,
      DOB TEXT NOT NULL,
      Gender TEXT NOT NULL CHECK (Gender IN ('Male','Female','Other')),
      Blood_Group TEXT NOT NULL CHECK (Blood_Group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
      Contact_Number TEXT NOT NULL,
      Email TEXT NOT NULL,
      Address TEXT NOT NULL,
      Aadhar_Num TEXT NOT NULL UNIQUE,
      RequiredOrgan TEXT NOT NULL CHECK (RequiredOrgan IN ('Kidney','Liver','Heart','Lung','Pancreas','Cornea','Small Intestine')),
      UrgencyLevel TEXT NOT NULL DEFAULT 'Routine' CHECK (UrgencyLevel IN ('Routine','Urgent','Critical','Emergency')),
      PriorityScore REAL NOT NULL DEFAULT 0.00,
      RegistrationDate TEXT NOT NULL DEFAULT (date('now')),
      RegisteringHospitalID INTEGER NOT NULL,
      RecipientStatus TEXT NOT NULL DEFAULT 'Waiting' CHECK (RecipientStatus IN ('Waiting','Allocated','Transplanted','Removed','Deceased')),
      RemovalReason TEXT,
      Previous_Transplant_History INTEGER NOT NULL DEFAULT 0,
      Attending_Physician TEXT NOT NULL DEFAULT 'Dr. Unassigned',
      Disease TEXT NOT NULL DEFAULT 'Undisclosed',
      FOREIGN KEY (RegisteringHospitalID) REFERENCES hospital(Hospital_ID) ON DELETE CASCADE ON UPDATE CASCADE
    );

    CREATE TABLE IF NOT EXISTS medicaltest (
      TestID INTEGER PRIMARY KEY,
      Person_ID INTEGER NOT NULL,
      OrganID INTEGER,
      TestType TEXT NOT NULL,
      TestDate TEXT NOT NULL DEFAULT (datetime('now')),
      TestResult TEXT NOT NULL CHECK (TestResult IN ('Pending','Normal','Abnormal','Positive','Negative')),
      ResultDetails TEXT,
      ConductedByHospitalID INTEGER NOT NULL,
      LabName TEXT,
      FOREIGN KEY (ConductedByHospitalID) REFERENCES hospital(Hospital_ID) ON DELETE CASCADE ON UPDATE CASCADE,
      FOREIGN KEY (OrganID) REFERENCES organ(OrganID) ON DELETE SET NULL ON UPDATE CASCADE
    );

    CREATE TABLE IF NOT EXISTS allocation (
      AllocationID INTEGER PRIMARY KEY,
      OrganID INTEGER NOT NULL,
      RecipientID INTEGER NOT NULL,
      AllocationDate TEXT NOT NULL DEFAULT (datetime('now')),
      CompatibilityVerified INTEGER NOT NULL DEFAULT 0,
      CompatibilityScore REAL,
      AllocationStatus TEXT NOT NULL DEFAULT 'Proposed' CHECK (AllocationStatus IN ('Proposed','Confirmed','Rejected','Completed','Cancelled')),
      TransplantHospitalID INTEGER NOT NULL,
      TransportMode TEXT CHECK (TransportMode IS NULL OR TransportMode IN ('Road','Air','Green Corridor')),
      GreenCorridorUsed INTEGER NOT NULL DEFAULT 0,
      TransportStartTime TEXT,
      TransportEndTime TEXT,
      TransplantSurgeryDate TEXT,
      LeadSurgeon TEXT,
      TransplantOutcome TEXT CHECK (TransplantOutcome IS NULL OR TransplantOutcome IN ('Successful','Failed','Complication','Not Performed')),
      RecoveryStatus TEXT,
      FOREIGN KEY (TransplantHospitalID) REFERENCES hospital(Hospital_ID) ON DELETE CASCADE ON UPDATE CASCADE,
      FOREIGN KEY (OrganID) REFERENCES organ(OrganID) ON DELETE CASCADE ON UPDATE CASCADE
    );

    CREATE TABLE IF NOT EXISTS recipient_status_audit (
      Audit_ID INTEGER PRIMARY KEY AUTOINCREMENT,
      Recipient_ID INTEGER NOT NULL,
      Previous_Status TEXT NOT NULL,
      New_Status TEXT NOT NULL,
      Modified_Timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      Action_Source TEXT NOT NULL DEFAULT 'dbms_system'
    );

    CREATE TABLE IF NOT EXISTS auth_accounts (
      Account_ID INTEGER PRIMARY KEY AUTOINCREMENT,
      Role TEXT NOT NULL CHECK (Role IN ('user','hospital','admin')),
      SubRole TEXT CHECK (SubRole IS NULL OR SubRole IN ('donor','recipient')),
      Identifier TEXT NOT NULL UNIQUE,
      PasswordHash TEXT NOT NULL,
      DisplayName TEXT NOT NULL,
      Linked_Entity_ID INTEGER,
      Created_At TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS system_activity_log (
      Log_ID INTEGER PRIMARY KEY AUTOINCREMENT,
      Actor_Role TEXT NOT NULL,
      Actor_Name TEXT NOT NULL,
      Action_Type TEXT NOT NULL,
      Target_Table TEXT NOT NULL,
      Target_ID TEXT NOT NULL,
      Summary TEXT NOT NULL,
      Created_At TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS eligibility_assessments (
      Assessment_ID INTEGER PRIMARY KEY AUTOINCREMENT,
      Account_Identifier TEXT NOT NULL,
      Linked_Entity_ID INTEGER,
      Age INTEGER NOT NULL,
      BMI REAL NOT NULL,
      Blood_Group TEXT NOT NULL,
      Pathway_Preference TEXT NOT NULL,
      Overall_Readiness TEXT NOT NULL,
      Eligible_Count INTEGER NOT NULL,
      Conditional_Count INTEGER NOT NULL,
      Ineligible_Count INTEGER NOT NULL,
      Result_JSON TEXT NOT NULL,
      Created_At TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS hospital_resources (
      Hospital_ID INTEGER PRIMARY KEY,
      ICU_Beds_Total INTEGER NOT NULL DEFAULT 16,
      ICU_Beds_Occupied INTEGER NOT NULL DEFAULT 10,
      Isolation_Beds_Total INTEGER NOT NULL DEFAULT 6,
      Isolation_Beds_Occupied INTEGER NOT NULL DEFAULT 3,
      Ward_Beds_Total INTEGER NOT NULL DEFAULT 32,
      Ward_Beds_Occupied INTEGER NOT NULL DEFAULT 22,
      Theaters_Total INTEGER NOT NULL DEFAULT 3,
      Theaters_Ready INTEGER NOT NULL DEFAULT 2,
      Theaters_In_Use INTEGER NOT NULL DEFAULT 1,
      Theaters_Sanitizing INTEGER NOT NULL DEFAULT 0,
      Surgical_Teams_On_Call INTEGER NOT NULL DEFAULT 2,
      Next_Theater_Available_Min INTEGER NOT NULL DEFAULT 0,
      Theater_Readiness_Status TEXT NOT NULL DEFAULT 'Ready' CHECK (Theater_Readiness_Status IN ('Ready','Limited','Busy','Standby')),
      Notes TEXT,
      Updated_At TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (Hospital_ID) REFERENCES hospital(Hospital_ID) ON DELETE CASCADE ON UPDATE CASCADE
    );

    DROP TRIGGER IF EXISTS trg_AuditRecipientStatusChange;
    CREATE TRIGGER trg_AuditRecipientStatusChange
    AFTER UPDATE OF RecipientStatus ON recipient
    FOR EACH ROW
    WHEN OLD.RecipientStatus <> NEW.RecipientStatus
    BEGIN
      INSERT INTO recipient_status_audit (
        Recipient_ID,
        Previous_Status,
        New_Status,
        Modified_Timestamp,
        Action_Source
      ) VALUES (
        NEW.Recipient_ID,
        OLD.RecipientStatus,
        NEW.RecipientStatus,
        datetime('now'),
        'trg_AuditRecipientStatusChange'
      );
    END;

    DROP TRIGGER IF EXISTS trg_SyncOrganStatusOnAllocation;
    CREATE TRIGGER trg_SyncOrganStatusOnAllocation
    AFTER UPDATE OF AllocationStatus ON allocation
    FOR EACH ROW
    WHEN NEW.AllocationStatus = 'Completed' AND OLD.AllocationStatus <> 'Completed'
    BEGIN
      UPDATE organ SET OrganStatus = 'Transplanted' WHERE OrganID = NEW.OrganID;
    END;

    DROP VIEW IF EXISTS v_active_waitlist;
    CREATE VIEW v_active_waitlist AS
    SELECT
      r.Recipient_ID,
      r.Full_Name,
      r.Blood_Group,
      r.RequiredOrgan,
      r.UrgencyLevel,
      r.PriorityScore,
      r.RecipientStatus,
      r.Disease,
      r.Attending_Physician,
      r.RegistrationDate,
      h.Hospital_ID,
      h.Hospital_Name,
      h.City
    FROM recipient r
    JOIN hospital h ON r.RegisteringHospitalID = h.Hospital_ID
    WHERE r.RecipientStatus IN ('Waiting', 'Allocated')
    ORDER BY r.PriorityScore DESC, r.RegistrationDate ASC;

    DROP VIEW IF EXISTS v_organ_inventory;
    CREATE VIEW v_organ_inventory AS
    SELECT
      o.*,
      d.Full_Name AS DonorName,
      d.Donor_Type AS DonorType,
      h.Hospital_Name AS RetrievalHospitalName,
      h.City AS RetrievalHospitalCity
    FROM organ o
    JOIN donor d ON o.DonorID = d.Donor_ID
    JOIN hospital h ON o.RetrievalHospitalID = h.Hospital_ID;

    DROP VIEW IF EXISTS v_allocation_pipeline;
    CREATE VIEW v_allocation_pipeline AS
    SELECT
      a.*,
      o.OrganCode,
      o.OrganType,
      o.BloodGroup AS OrganBloodGroup,
      o.RetrievalHospitalID,
      rh.Hospital_Name AS RetrievalHospitalName,
      th.Hospital_Name AS TransplantHospitalName,
      th.City AS TransplantHospitalCity,
      r.Full_Name AS RecipientName,
      r.Blood_Group AS RecipientBloodGroup,
      r.UrgencyLevel AS RecipientUrgency,
      d.Full_Name AS DonorName
    FROM allocation a
    JOIN organ o ON a.OrganID = o.OrganID
    JOIN donor d ON o.DonorID = d.Donor_ID
    JOIN hospital rh ON o.RetrievalHospitalID = rh.Hospital_ID
    JOIN hospital th ON a.TransplantHospitalID = th.Hospital_ID
    LEFT JOIN recipient r ON a.RecipientID = r.Recipient_ID;
  `);
}

export function seedDatabaseFromSqlDumps(db: Database.Database, forceReset = false): void {
  const existingHospitals = db.prepare('SELECT COUNT(*) as count FROM hospital').get() as { count: number };
  if (existingHospitals.count > 0 && !forceReset) {
    return;
  }

  const seedTx = db.transaction(() => {
    if (forceReset) {
      db.exec(`
        PRAGMA foreign_keys = OFF;
        DELETE FROM allocation;
        DELETE FROM medicaltest;
        DELETE FROM organ;
        DELETE FROM recipient;
        DELETE FROM donor;
        DELETE FROM hospital;
        DELETE FROM recipient_status_audit;
        DELETE FROM auth_accounts;
        DELETE FROM system_activity_log;
        DELETE FROM eligibility_assessments;
        DELETE FROM hospital_resources;
        PRAGMA foreign_keys = ON;
      `);
    }

    const hospitalSql = fs.readFileSync(path.join(SQL_ASSETS_DIR, SQL_FILES.hospital), 'utf8');
    const donorSql = fs.readFileSync(path.join(SQL_ASSETS_DIR, SQL_FILES.donor), 'utf8');
    const organSql = fs.readFileSync(path.join(SQL_ASSETS_DIR, SQL_FILES.organ), 'utf8');
    const recipientSql = fs.readFileSync(path.join(SQL_ASSETS_DIR, SQL_FILES.recipient), 'utf8');
    const medicaltestSql = fs.readFileSync(path.join(SQL_ASSETS_DIR, SQL_FILES.medicaltest), 'utf8');
    const allocationSql = fs.readFileSync(path.join(SQL_ASSETS_DIR, SQL_FILES.allocation), 'utf8');

    const insertHospital = db.prepare(`
      INSERT INTO hospital (
        Hospital_ID, Hospital_Name, Hospital_Type, City, State,
        Contact_Number, Email, License_Number, Transplant_Center_Certified, Registration_Date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const hospitals = parseSqlInsertValues(hospitalSql, 'hospital');
    for (const row of hospitals) {
      const id = row[0] as number;
      const email = (row[6] as string | null) ?? `transplant.${id}@mahaclinical.org`;
      insertHospital.run(id, row[1], row[2], row[3], row[4], row[5], email, row[7], row[8], row[9]);
    }

    const insertDonor = db.prepare(`
      INSERT INTO donor (
        Donor_ID, Full_Name, DOB, Gender, Blood_Group, Contact_Number, Email, Address,
        Aadhar_Num, Registration_Date, Donor_Type, Donating_Organ, Brain_Death_Conf,
        Brain_Death_Date, Consent_Obtained, Legal_Approval_Status, Legal_Approval_Date,
        Legal_Authority, Registering_Hospital_ID, Medical_Fitness_Status, Donor_Status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const donors = parseSqlInsertValues(donorSql, 'donor');
    for (const row of donors) {
      insertDonor.run(...row);
    }

    const insertOrgan = db.prepare(`
      INSERT INTO organ (
        OrganID, OrganCode, DonorID, OrganType, BloodGroup, RetrievalDate,
        RetrievalHospitalID, PreservationStartTime, MaxPreservationHours,
        ExpiryTime, OrganStatus, RejectionReason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const organs = parseSqlInsertValues(organSql, 'organ');
    for (const row of organs) {
      insertOrgan.run(...row);
    }

    const insertRecipient = db.prepare(`
      INSERT INTO recipient (
        Recipient_ID, Full_Name, DOB, Gender, Blood_Group, Contact_Number, Email,
        Address, Aadhar_Num, RequiredOrgan, UrgencyLevel, PriorityScore,
        RegistrationDate, RegisteringHospitalID, RecipientStatus, RemovalReason,
        Previous_Transplant_History, Attending_Physician, Disease
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const recipients = parseSqlInsertValues(recipientSql, 'recipient');
    for (const row of recipients) {
      insertRecipient.run(...row);
    }

    const insertTest = db.prepare(`
      INSERT INTO medicaltest (
        TestID, Person_ID, OrganID, TestType, TestDate, TestResult,
        ResultDetails, ConductedByHospitalID, LabName
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const tests = parseSqlInsertValues(medicaltestSql, 'medicaltest');
    for (const row of tests) {
      insertTest.run(...row);
    }

    const insertAllocation = db.prepare(`
      INSERT INTO allocation (
        AllocationID, OrganID, RecipientID, AllocationDate, CompatibilityVerified,
        CompatibilityScore, AllocationStatus, TransplantHospitalID, TransportMode,
        GreenCorridorUsed, TransportStartTime, TransportEndTime, TransplantSurgeryDate,
        LeadSurgeon, TransplantOutcome, RecoveryStatus
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const allocations = parseSqlInsertValues(allocationSql, 'allocation');
    for (const row of allocations) {
      insertAllocation.run(...row);
    }

    // Seed auth accounts for Admin, all Hospitals, and all Donors/Recipients
    const insertAccount = db.prepare(`
      INSERT OR IGNORE INTO auth_accounts (Role, SubRole, Identifier, PasswordHash, DisplayName, Linked_Entity_ID)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    insertAccount.run('admin', null, 'admin@organlink.gov.in', hashPassword('admin123'), 'Zonal Transplant Authority', null);
    insertAccount.run('admin', null, 'SYS-ADMIN-01', hashPassword('admin123'), 'State Authorization Administrator', null);

    const hospRows = db.prepare('SELECT Hospital_ID, Hospital_Name, License_Number FROM hospital').all() as {
      Hospital_ID: number;
      Hospital_Name: string;
      License_Number: string;
    }[];
    for (const h of hospRows) {
      insertAccount.run('hospital', null, String(h.Hospital_ID), hashPassword('hosp123'), h.Hospital_Name, h.Hospital_ID);
      insertAccount.run('hospital', null, h.License_Number, hashPassword('hosp123'), h.Hospital_Name, h.Hospital_ID);
    }

    const donorRows = db.prepare('SELECT Donor_ID, Full_Name, Email FROM donor').all() as {
      Donor_ID: number;
      Full_Name: string;
      Email: string;
    }[];
    for (const d of donorRows) {
      insertAccount.run('user', 'donor', d.Email.toLowerCase(), hashPassword('user123'), d.Full_Name, d.Donor_ID);
    }

    const recRows = db.prepare('SELECT Recipient_ID, Full_Name, Email FROM recipient').all() as {
      Recipient_ID: number;
      Full_Name: string;
      Email: string;
    }[];
    for (const r of recRows) {
      insertAccount.run('user', 'recipient', r.Email.toLowerCase(), hashPassword('user123'), r.Full_Name, r.Recipient_ID);
    }

    // Seed initial historical recipient audit entries so audit tab has context right away
    db.prepare(`
      INSERT INTO recipient_status_audit (Recipient_ID, Previous_Status, New_Status, Modified_Timestamp, Action_Source)
      VALUES
        (625270001, 'Allocated', 'Transplanted', '2025-11-02 12:30:00', 'ztcc_historical_import'),
        (625270002, 'Allocated', 'Transplanted', '2025-11-06 13:15:00', 'ztcc_historical_import'),
        (625270021, 'Allocated', 'Transplanted', '2025-12-28 10:00:00', 'ztcc_historical_import')
    `).run();

    db.prepare(`
      INSERT INTO system_activity_log (Actor_Role, Actor_Name, Action_Type, Target_Table, Target_ID, Summary)
      VALUES
        ('admin', 'Zonal Transplant Authority', 'SEED', 'organ_donation_db', 'ALL', 'Initialized relational schema and imported 6 SQL registry tables (24 hospitals, 30 donors, 30 organs, 32 recipients, 33 tests, 24 allocations).')
    `).run();

    seedMissingHospitalResources(db);
  });

  seedTx();
}

export function seedMissingHospitalResources(db: Database.Database): void {
  const hospitals = db
    .prepare(
      'SELECT Hospital_ID, Hospital_Type, Transplant_Center_Certified FROM hospital ORDER BY Hospital_ID ASC',
    )
    .all() as {
    Hospital_ID: number;
    Hospital_Type: string;
    Transplant_Center_Certified: number;
  }[];

  const existingIds = new Set(
    (db.prepare('SELECT Hospital_ID FROM hospital_resources').all() as { Hospital_ID: number }[]).map(
      (r) => r.Hospital_ID,
    ),
  );

  const insertResource = db.prepare(`
    INSERT INTO hospital_resources (
      Hospital_ID, ICU_Beds_Total, ICU_Beds_Occupied, Isolation_Beds_Total, Isolation_Beds_Occupied,
      Ward_Beds_Total, Ward_Beds_Occupied, Theaters_Total, Theaters_Ready, Theaters_In_Use,
      Theaters_Sanitizing, Surgical_Teams_On_Call, Next_Theater_Available_Min,
      Theater_Readiness_Status, Notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  hospitals.forEach((h, idx) => {
    if (existingIds.has(h.Hospital_ID)) return;

    const isCertified = h.Transplant_Center_Certified === 1;
    const isGov = h.Hospital_Type === 'Government';

    const icuTotal = isCertified ? (isGov ? 28 : 22) : isGov ? 16 : 14;
    const icuOcc = Math.min(icuTotal - 2, Math.round(icuTotal * (0.64 + (idx % 4) * 0.06)));
    const isoTotal = isCertified ? 8 : 4;
    const isoOcc = Math.min(isoTotal - 1, 2 + (idx % 3));
    const wardTotal = isCertified ? 44 : 26;
    const wardOcc = Math.min(wardTotal - 3, Math.round(wardTotal * (0.62 + (idx % 3) * 0.08)));

    const theatersTotal = isCertified ? 4 : 2;
    const theatersInUse = idx % 3 === 0 ? 1 : idx % 4 === 1 ? 2 : 1;
    const theatersSanitizing = isCertified && idx % 2 === 0 ? 1 : 0;
    const theatersReady = Math.max(0, theatersTotal - Math.min(theatersTotal, theatersInUse + theatersSanitizing));
    const clampedInUse = Math.min(theatersTotal - theatersReady, theatersInUse);
    const clampedSanitizing = Math.max(0, theatersTotal - theatersReady - clampedInUse);
    const teamsOnCall = isCertified ? 3 : 2;

    const readiness =
      theatersReady === 0
        ? 'Busy'
        : theatersReady === 1 && theatersTotal >= 3
        ? 'Limited'
        : 'Ready';

    insertResource.run(
      h.Hospital_ID,
      icuTotal,
      icuOcc,
      isoTotal,
      isoOcc,
      wardTotal,
      wardOcc,
      theatersTotal,
      theatersReady,
      clampedInUse,
      clampedSanitizing,
      teamsOnCall,
      readiness === 'Busy' ? 25 : 0,
      readiness,
      isCertified
        ? 'ZTCC-certified transplant OR suite & post-op ICU wing'
        : 'Retrieval & donor stabilization surgical bay',
    );
  });
}

export function getDb(): Database.Database {
  if (dbInstance) {
    return dbInstance;
  }
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  createSchema(db);
  seedDatabaseFromSqlDumps(db, false);
  seedMissingHospitalResources(db);
  dbInstance = db;
  return dbInstance;
}
