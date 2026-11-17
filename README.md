# OrganLink DBMS

OrganLink is a relational database management system and web application for organ donation and transplant coordination across Maharashtra hospital networks. It pairs a SQLite backend (`better-sqlite3`) with three role-specific interfaces—User (Donor / Recipient), Hospital Coordinator, and State Administrator—around a shared relational schema with foreign keys, SQL views, and triggers.

## What Is Inside

The backend boots from six SQL registry dump files in `public/assets/aistudio/` (`hospital`, `donor`, `organ`, `recipient`, `medicaltest`, `allocation`), parses them into a local SQLite database (`data/organ_donation.db`), and enforces relational integrity, transaction safety, and automated audit logging.

### Portals & Features

- **Home & Auth Gateway**: Public registry overview, role-based sign-in, and new account registration for donors, waitlist recipients, and hospital facilities.
- **User Interface (Donor & Recipient)**
  - View blood group, waitlist queue position (ordered by priority score and registration date), medical fitness, and legal clearance status.
  - Inspect compatible available organs on the network based on ABO/Rh compatibility and organ type.
  - Review lab/crossmatch test records (`HLA Typing`, `Crossmatch`, viral screening, organ viability).
  - Complete a 3-step medical Eligibility Quiz evaluating 6 donation pathways (living kidney, living partial liver, and deceased heart, lungs, pancreas, cornea) with results persisted in SQLite.
  - Update contact info, donor consent, and password.
- **Hospital Interface**
  - Switch scope between the logged-in hospital (`My Hospital`) and all 24 registered centers (`Full Network`).
  - Register and evaluate donors, manage waitlist recipients, log retrieved organs with cold-ischemia preservation windows, and record diagnostic lab tests.
  - Run the compatibility matching engine, which scores waiting recipients out of 100 points (ABO/Rh match, clinical urgency, priority score, and hospital/city proximity) and creates atomic allocation transactions.
  - Monitor live organ inventory, ICU/isolation/ward bed occupancy, and surgical theater readiness on a real-time **Resource Availability** card synchronized via Server-Sent Events (`/api/resources/stream`).
  - Explore nearby retrieval hospitals and certified transplant centers on an interactive D3 regional map with simulated GPS coordinates, radius filtering, and transit ETAs.
- **Administrator & DBMS Console**
  - Inspect regional donation and transplant success trends over time with an interactive D3 chart filtered by city.
  - Certify/revoke hospital transplant licenses, approve or reject donor legal clearances, and confirm cross-hospital allocations.
  - Browse tables, views, columns, foreign keys, and trigger definitions in the ER schema inspector.
  - Run read-only or write-enabled SQL queries directly against SQLite in the SQL Query Console with CSV export, review `recipient_status_audit` and `system_activity_log`, run `PRAGMA integrity_check` / `PRAGMA foreign_key_check`, or reset the database back to the seed SQL dumps.
- **OrganLink Assistant (Optional)**: An embedded Q&A drawer powered by Gemini (`@google/genai`) that reads live SQLite counts and schema metadata to answer questions about records, SQL queries, and portal workflows.

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, D3.js, Lucide Icons
- **Backend**: Node.js, Express, `tsx`, `better-sqlite3` (SQLite 3 in WAL mode)
- **AI Integration**: `@google/genai` (server-side route `/api/chat`)

## Prerequisites

- **Node.js** 20 or newer (Node 22 recommended)
- **npm** (comes with Node.js)
- Build tools (Python + C/C++ compiler) only if your platform lacks a prebuilt binary for `better-sqlite3`

## Running Locally

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment variables**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` if you want to enable the optional AI assistant:

   ```env
   GEMINI_API_KEY="your_gemini_api_key_here"
   APP_URL="http://localhost:3000"
   ```

   All core portals, SQLite operations, D3 visualizations, and real-time resource streams work without `GEMINI_API_KEY`; only `/api/chat` requires a valid key.

3. **Start the development server**

   ```bash
   npm run dev
   ```

   The Express server binds to port `3000` and mounts Vite middleware in dev mode. On the first startup, it automatically creates `data/organ_donation.db` and imports the seed SQL files.

   Open `http://localhost:3000` in your browser.

### Production Build

```bash
npm run build
NODE_ENV=production npm start
```

### Type Checking & Tests

Run the TypeScript compiler check:

```bash
npm run lint
```

Run the unit test suite (`node:test` via `tsx`):

```bash
npx tsx --test src/utils/*.test.ts
```

## Demo Login Credentials

Seeded accounts are created automatically when `data/organ_donation.db` is initialized:

| Portal | Sample Identifier | Password | Notes |
| :--- | :--- | :--- | :--- |
| **User (Recipient / Donor)** | `meera.nair@email.com` | `user123` | Any seeded donor/recipient email or numeric ID works |
| **Hospital Coordinator** | `324270101` | `hosp123` | Hospital ID (`324270101` = Sassoon General) or license number |
| **Administrator** | `admin@organlink.gov.in` | `admin123` | Also accepts `SYS-ADMIN-01` |

## Project Structure

```text
.
├── server.ts                  # Express API server, SSE streams, and Vite entry point
├── server/
│   ├── db.ts                  # SQLite schema, triggers, views, and SQL dump seeder
│   └── chatContext.ts         # System prompt builder and Gemini API client
├── public/assets/aistudio/    # Seed SQL dumps and schema diagram asset
├── src/
│   ├── App.tsx                # Top-level routing across landing, login, and portals
│   ├── services/api.ts        # Typed fetch wrapper for backend routes
│   ├── types/db.ts            # Shared database and API TypeScript interfaces
│   ├── utils/                 # Pure domain logic + *.test.ts unit test suites
│   └── components/
│       ├── dashboards/        # UserDashboard, HospitalDashboard, AdminDashboard
│       ├── charts/            # D3 regional trends chart & regional hospital map
│       ├── ui/                # DataTable, Modal, StatusText
│       ├── EligibilityQuizView.tsx
│       ├── ResourceAvailabilityCard.tsx
│       ├── GeminiChatbot.tsx
│       ├── HomeLanding.tsx
│       ├── LoginGateway.tsx
│       └── UserProfileView.tsx
├── package.json
└── .env.example
```

## Database Notes

- **Tables**: `hospital`, `donor`, `organ`, `recipient`, `medicaltest`, `allocation`, `hospital_resources`, `eligibility_assessments`, `recipient_status_audit`, `auth_accounts`, `system_activity_log`.
- **Views**: `v_active_waitlist`, `v_organ_inventory`, `v_allocation_pipeline`.
- **Triggers**:
  - `trg_AuditRecipientStatusChange`: Logs every `RecipientStatus` change into `recipient_status_audit`.
  - `trg_SyncOrganStatusOnAllocation`: Marks the linked organ as `Transplanted` when an allocation transitions to `Completed`.
- **Resetting Data**: Delete `data/organ_donation.db*` and restart the server, or trigger **Reset Database** inside the Administrator **Audit Logs** tab (`POST /api/dbms/reset`).
