# Tamil Nadu Microfinance Field Operations Platform

A web and mobile-friendly operations system for Tamil Nadu microfinance teams, enabling Admins to configure districts, centres, and agent credentials dynamically while Field Agents log GPS-verified centre visits and daily field activities without entering loan amounts or being locked to assigned centres.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The plan below incorporates all choices confirmed during clarification alongside recommended architectural defaults. Review and approve to begin implementation.

- **Confirmed Storage & Backend**: Local Node/Express server backed by a persistent SQLite database so Admin and Agent records stay synchronized across sessions.
- **Confirmed Authentication**: Custom login where Admin creates Agent accounts using an Agent ID or email plus PIN/password; Admin access uses a server environment passcode or an inline first-run Admin setup/claim flow on initial launch.
- **Confirmed 100m GPS Geofence**: Soft warning when an Agent is beyond 100 metres of a centre's Google Maps coordinates—check-in and check-out remain allowed, with the exact distance and verification flag logged for Admin review.
- **Confirmed Visual Aesthetic**: Clean, high-contrast daylight field operations palette designed for bright outdoor legibility on agent phones and dense operational clarity on Admin desktops.

---

## 1. Overview & Core Concept

- **What It Does**: Provides two role-specific workspaces behind a unified login portal:
  1. **Admin Command Workspace**: Switch between **Collection Status** (drill down by Location → Day Order → Centre Name & Slot to audit agent In-Time, Out-Time, and GPS accuracy) and **Field Status** (review Sourcing, Loan, Training, and Collection logs with remarks), plus dynamic management drawers/tabs for **Locations**, **Centres** (with Google Maps link coordinate extraction), and **Agents**.
  2. **Field Agent Portal**: Mobile-optimized thumb-friendly interface with two primary tabs—**Collection Status** (select Location, Day Order, Centre; capture live GPS coordinates; verify 100m proximity; record Centre In-Time and Centre Out-Time per visit) and **Field Status** (select Sourcing, Loan, Training, or Collection; pick Centre and enter Remarks as required).
- **Target Audience / Persona**: Regional microfinance operations Admins overseeing Tamil Nadu hubs (Coimbatore, Madurai, Chennai, and expanding districts) and roaming Field Agents conducting daily centre meetings and sourcing runs.
- **Key Value**: Eliminates static centre-to-agent lock-in and manual spreadsheets by giving any authorized agent dynamic access to every centre while giving Admins verifiable GPS timestamps and structured field reports.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Authentication & First-Run Bootstrap**:
   - Visitors land on a clean dual-role Sign-In view (Admin or Agent mode toggle, single identifier + PIN/password input).
   - On a fresh installation with no Admin password configured yet, an inline **First-Run Admin Setup** form lets the operator claim the Admin account immediately without terminal configuration.
2. **Admin — Collection Status Drill-Down**:
   - Top workspace switch toggles between **Collection Status**, **Field Status**, and **Directory Management** (Locations, Centres, Agents).
   - In **Collection Status**, an interactive cascading filter bar guides selection: **Location** (`Coimbatore`, `Madurai`, `Chennai`, etc.) → **Day Order** (`Mon`, `Tue`, `Wed`, etc.) → **Centre Name & Slot** (`Mars · 10:00 AM–11:00 AM`, `Saturn · 11:00 AM–12:00 PM`, `Neptune · 12:00 PM–01:00 PM`, etc.).
   - Below the filter cascade, a tabular audit grid displays every visit with Agent Name/ID, In-Time, Out-Time, GPS Distance (`42 m` vs `245 m`), and Verification State (`Within 100m` or `Outside 100m Warning`).
3. **Admin — Field Status & Dynamic Master Data**:
   - **Field Status** shows filterable logs by Location, Activity (`Sourcing`, `Loan`, `Training`, `Collection`), Agent, and Date, displaying selected Centre and Remarks (with zero loan-amount fields).
   - **Directory Management** allows Admins to add/edit/deactivate **Locations**, add **Centres** by pasting a Google Maps link (auto-extracting latitude/longitude with manual coordinate fallback and direct "Open in Maps" verification), and create/manage **Agents** (Name, Agent ID/Email, Mobile, PIN/Password).
4. **Agent — Collection Status (GPS In-Time & Out-Time)**:
   - Mobile-first daylight layout with a sticky top identity bar and bottom thumb-zone action bar.
   - Agent picks **Location**, **Day Order**, and **Centre** (open across all centres—no pre-assignment required).
   - Tapping **Verify GPS & Check In** reads browser geolocation (`enableHighAccuracy: true`), computes Haversine distance against the Centre's coordinates, displays a clear status banner (`Verified · 34 m from centre` in emerald or `Outside 100m · 185 m away — Check-in allowed with warning` in amber), and records **Centre In-Time**.
   - Active visits appear in an **In-Progress Visit** card where tapping **Verify GPS & Check Out** logs **Centre Out-Time** with exit coordinates and distance.
5. **Agent — Field Status**:
   - Segmented selector for **Sourcing**, **Loan**, **Training**, or **Collection**.
   - Selecting **Sourcing** reveals a required **Centre** picker (plus optional remarks).
   - Selecting **Loan** reveals a required **Centre** picker and a required **Remarks** field (strictly excluding any loan amount inputs).
   - Selecting **Training** or **Collection** provides an optional Centre picker and Remarks field, followed by a recent-submissions feed for immediate confirmation.

### Visual Identity & Theme

- **Aesthetic Direction**: Crisp, high-contrast **Daylight Field Operations** aesthetic—engineered for outdoor smartphone glare readability and structured desktop audit clarity.
- **Color Palette & Mood (60-30-10)**:
  - *60% Neutral Canvas*: Pure White (`#FFFFFF`) and Cool Slate Alabaster (`#F8FAFC`).
  - *30% Structural Surfaces*: Crisp White cards/tables with subtle 1px Slate Hairlines (`#E2E8F0`) and Deep Charcoal Slate typography (`#0F172A` primary, `#475569` secondary).
  - *10% Accent & Semantic States*: Deep Cobalt Blue (`#1D4ED8`) for primary actions and active workspace tabs; Emerald (`#16A34A`) for `Within 100m` verified visits; Amber (`#D97706`) for `Outside 100m` soft warnings; Crimson (`#DC2626`) for validation errors—always paired with explicit text labels and icons.
- **Typography & Hierarchy**:
  - *Display & Headings*: `Plus Jakarta Sans` (SemiBold 600 / Bold 700, `text-wrap: balance`).
  - *Body & Controls*: `DM Sans` (Regular 400 / Medium 500, 14px–16px).
  - *Data, GPS Coordinates & Timestamps*: `JetBrains Mono` with `tabular-nums` for vertical alignment across In-Time, Out-Time, and distance readouts.
- **Component Styling & Layout**:
  - *Desktop Admin*: Fixed left sidebar (`240px`) + clean breadcrumb top bar + single-elevation flat tables with `40px` compact rows and zero nested card boxes.
  - *Mobile Agent*: Full-width responsive cards expanding to a clean 2-column grid on desktop, `>= 44px` touch hitboxes, natural thumb-zone bottom navigation (`Collection Status` | `Field Status` | `My Visits`), and unboxed metadata separated by `·`.
- **Interactive Feedback & Motion**:
  - Fast `150ms` settling transitions on tabs and selectors; clear GPS acquisition spinner state, coordinate accuracy readout (`±12m`), skeleton table rows during loads, and actionable empty states.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Local Express + SQLite Backend Over Browser-Only Storage**
  - *Chosen Approach*: Embed a lightweight SQLite database served through Express REST endpoints on the same server as the React app.
  - *Why*: Browser `localStorage` cannot share data between an Admin's desktop and multiple Field Agents' phones. SQLite gives durable multi-user persistence with zero external cloud setup.
  - *Alternatives Considered*: Firebase Firestore (deferred per user preference for local server DB) and in-memory JSON (unsafe under concurrent writes).

- **Decision 2: Safe Google Maps Coordinate Extraction + Manual Fallback**
  - *Chosen Approach*: Parse latitude/longitude directly from standard Google Maps URLs (`@lat,lng`, `?q=lat,lng`, `!3dlat!4dlng`) and safely resolve official `maps.app.goo.gl` / `goo.gl/maps` short links via a strict allowlisted server-side redirect check, while exposing optional Latitude/Longitude fields so an Admin can fine-tune or enter coordinates if a link omits them.
  - *Why*: Field teams frequently share `maps.app.goo.gl` short links from WhatsApp/mobile Maps; supporting both full links and short-link resolution prevents broken geofences without requiring paid Maps API keys.
  - *Alternatives Considered*: Requiring raw coordinates only (error-prone for Admins) or Google Maps Geocoding API (requires external billing/API key).

- **Decision 3: Soft-Warning 100m Geofence Verification**
  - *Chosen Approach*: Calculate real Haversine distance between device GPS and Centre coordinates. Flag `<= 100m` as `Verified (Within 100m)` and `> 100m` as `Warning (Outside 100m)` while permitting submission.
  - *Why*: Indoor concrete centres and urban signal drift in Chennai/Madurai/Coimbatore can occasionally push browser GPS accuracy past 100m; soft warnings protect field productivity while preserving full audit transparency for Admins.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Component Diagram

```text
┌───────────────────────────────────────────────────────────────────────────┐
│                         CLIENT SPA (React + Tailwind)                     │
│                                                                           │
│  ┌───────────────────────┐   ┌─────────────────────────────────────────┐  │
│  │  Auth Gate & First-   │   │       In-Memory Session Context         │  │
│  │  Run Admin Setup      │──▶│  (Bearer Token, Role, Agent/Admin Info) │  │
│  └───────────────────────┘   └────────────────────┬────────────────────┘  │
│                                                   │                       │
│          ┌────────────────────────────────────────┴──────────┐            │
│          ▼                                                   ▼            │
│  ┌───────────────────────────────┐   ┌─────────────────────────────────┐  │
│  │       ADMIN WORKSPACE         │   │       FIELD AGENT PORTAL        │  │
│  │  - Collection Status Cascade  │   │  - Collection Status Tab        │  │
│  │    (Location -> Day -> Centre)│   │    (GPS Check-In / Check-Out)   │  │
│  │  - Field Status Audit Log     │   │  - Field Status Tab             │  │
│  │  - Dynamic Master Directory   │   │    (Sourcing/Loan/Train/Coll.)  │  │
│  │    (Locations, Centres, Agents│   │  - Recent Personal Activity Feed │  │
│  └───────────────┬───────────────┘   └───────────────┬─────────────────┘  │
└──────────────────┼───────────────────────────────────┼────────────────────┘
                   │  HTTPS / JSON (Authorization: Bearer)
                   ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                   NODE / EXPRESS API SERVER (Port 3000)                   │
│                                                                           │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌─────────────────┐  │
│  │ Auth & Role Guards   │  │ Master Data & Maps   │  │ Visit & Field   │  │
│  │ (scrypt + HMAC token)│  │ Link Parser (SSRF-   │  │ Status Routes   │  │
│  │                      │  │ safe allowlist check)│  │ (Haversine calc)│  │
│  └──────────┬───────────┘  └──────────┬───────────┘  └────────┬────────┘  │
│             └─────────────────────────┼───────────────────────┘           │
│                                       ▼                                   │
│                        ┌─────────────────────────────┐                    │
│                        │   SQLite Database (WAL)     │                    │
│                        │  - users (admins & agents)  │                    │
│                        │  - locations                │                    │
│                        │  - centres (lat/lng, slot)  │                    │
│                        │  - collection_visits        │                    │
│                        │  - field_status_logs        │                    │
│                        └─────────────────────────────┘                    │
└───────────────────────────────────────────────────────────────────────────┘
```

### Data Model & State

- **Users (`users`)**: `id`, `role` (`admin` | `agent`), `identifier` (Agent ID or email, unique), `full_name`, `phone`, `district`, `password_hash` (`scrypt`), `active` (`boolean`), `created_at`.
- **Locations (`locations`)**: `id`, `name` (seeded: `Coimbatore`, `Madurai`, `Chennai`), `active`, `created_at`.
- **Centres (`centres`)**: `id`, `location_id` (FK), `day_order` (`Mon`, `Tue`, `Wed`, `Thu`, `Fri`, `Sat`), `name` (seeded: `Mars`, `Saturn`, `Neptune` with slots), `time_slot` (e.g., `10:00 AM - 11:00 AM`), `google_maps_url`, `latitude`, `longitude`, `active`, `created_at`.
- **Collection Visits (`collection_visits`)**: `id`, `agent_id` (FK), `centre_id` (FK), `visit_date`, `in_time`, `in_lat`, `in_lng`, `in_accuracy_m`, `in_distance_m`, `in_within_100m`, `out_time`, `out_lat`, `out_lng`, `out_accuracy_m`, `out_distance_m`, `out_within_100m`, `status` (`checked_in` | `completed`).
- **Field Status Logs (`field_status_logs`)**: `id`, `agent_id` (FK), `activity_type` (`Sourcing` | `Loan` | `Training` | `Collection`), `centre_id` (nullable FK, required for `Sourcing` and `Loan`), `remarks` (required for `Loan`), `logged_at`, `lat`, `lng`.

### Interactive Component & State Mapping

- **Admin Cascading Filters**: Selecting a Location fetches/filters matching Day Orders and Centres dynamically; clearing Location resets downstream Day Order and Centre filters cleanly.
- **Dynamic Directory Forms**: Submitting a new Location, Centre (with automatic Google Maps URL parsing + instant coordinate preview), or Agent immediately updates SQLite and refreshes all Admin and Agent dropdowns without page reload.
- **Agent GPS Check-In / Check-Out**: Clicking Check-In triggers `navigator.geolocation.getCurrentPosition`, shows live distance vs the 100m threshold, warns softly if `> 100m`, submits to the server, and transitions the visit into an active `Checked In` card ready for `Check Out` (or supports starting a new visit after checking out).
- **Agent Field Status Form**: Changing activity type dynamically toggles required validation on Centre (required for `Sourcing` and `Loan`) and Remarks (required for `Loan`), disabling submission until valid and resetting cleanly upon save.

### Security & Integrity Safeguards

- **Password & Session Integrity**: Admin and Agent credentials are hashed server-side with Node `crypto.scrypt` using per-user salts; sessions use HMAC-signed `Authorization: Bearer` tokens stored strictly in React memory (never in `localStorage`).
- **Parameterized Persistence**: All SQLite reads and writes use prepared parameterized statements with strict server-side role checks (`admin` vs `agent`) on every endpoint.
- **Safe Maps Link Parsing**: Outbound resolution of shortened Google Maps URLs validates `https:` schemes against an explicit allowlist of Google Maps hosts, blocking local/private network addresses.
