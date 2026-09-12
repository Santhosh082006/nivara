# Nivara — Civic Issue Clustering & Reporting Engine

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-24.x-green.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18-blue.svg)](https://www.postgresql.org/)
[![React](https://img.shields.io/badge/React-18-cyan.svg)](https://reactjs.org/)
[![Leaflet](https://img.shields.io/badge/Leaflet-1.9-emerald.svg)](https://leafletjs.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Nivara** is an intelligent civic reporting platform powered by a real-time **Geospatial Issue Clustering Engine**. It solves the municipal duplicate ticket crisis by automatically aggregating redundant citizen reports into unified, prioritized incidents using geodesic distance algorithms and dynamic centroid recalculation.

---

## 🎯 Key Features

1. **Mathematical Geospatial Clustering**:
   - **Haversine Distance**: Calculates exact great-circle geodesic distances on the WGS-84 terrestrial sphere, eliminating Cartesian planar projection distortions.
   - **Spatial Bounding-Box Pre-Filter**: Translates search radii into latitude/longitude envelopes, executing in $O(1)$ indexed time before running Haversine math.
   - **Strict Category Isolation**: Potholes never merge with broken streetlights, even at identical GPS coordinates.
   - **Dynamic Running Centroid**: Continuously recalculates cluster coordinates using incremental running mean in $O(1)$ time.
   - **Deterministic Tie-Breaking**: Resolves equidistant cluster candidates via distance, established report count, and FIFO timestamps.

2. **Deduplication & Citizen Engagement**:
   - **"Nearby Similar Issue" Intercept**: Proactively queries nearby clusters within 50m while a citizen fills the report form, offering a one-click upvote instead of creating a duplicate ticket.
   - **Community Upvoting**: Citizens upvote active clusters to signal urgency without cluttering the municipal backlog.

3. **Municipal Priority Command Center**:
   - **Composite Priority Formula**:
     $$\text{Priority Score} = (\text{reportCount} \times 2.0) + (\text{upvotes} \times 1.0) + \text{CategoryWeight}$$
   - **Interactive Leaflet Map**: Real-time OpenStreetMap rendering with dynamic cluster markers sized and color-coded by report volume and status.
   - **Workflow Triage**: Municipal officials update cluster workflow status (`OPEN` $\to$ `IN_PROGRESS` $\to$ `RESOLVED`).

---

## 🏗️ System Architecture

```
                    ┌──────────────────────────────────────────────┐
                    │        React + Vite + Tailwind Frontend      │
                    │   (Civic Map, Authority Triage, Report Form) │
                    └──────────────────────┬───────────────────────┘
                                           │ HTTP REST / JWT
                                           ▼
                    ┌──────────────────────────────────────────────┐
                    │          Express + TypeScript Backend        │
                    │  ├── Auth & Role Guards                      │
                    │  ├── Ingestion & Bounding Box Pre-Filter     │
                    │  ├── Geodesic Haversine Calculation          │
                    │  └── Dynamic Centroid & Priority Engine      │
                    └──────────────────────┬───────────────────────┘
                                           │ Prisma ORM
                                           ▼
                    ┌──────────────────────────────────────────────┐
                    │               PostgreSQL 18                  │
                    │  ├── users, complaints, issue_clusters       │
                    │  ├── cluster_memberships, upvotes            │
                    │  └── Compound Spatial & Category Indexes     │
                    └──────────────────────────────────────────────┘
```

---

## 🚀 Quickstart Guide

### Prerequisites
- Node.js (v20+ or v24 LTS recommended)
- PostgreSQL 18 (running on `localhost:5432`)

### 1. Backend Setup
```bash
cd server

# Install dependencies
npm install

# Push database schema to PostgreSQL
npm run prisma:push

# Seed database with realistic demonstration clusters
npm run seed

# Start development API server (runs on port 5000)
npm run dev
```

### 2. Frontend Setup
```bash
cd ../client

# Install dependencies
npm install

# Start Vite development server (runs on port 5173)
npm run dev
```
Open **`http://localhost:5173`** in your browser.

---

## 📧 Production Real-Time OTP Authentication & Security Architecture

Nivara implements a zero-trust, cryptographically secure real-time OTP authentication architecture across **Sign In**, **Sign Up**, and **Forgot Password / Password Reset**:

- **Real-Time Delivery Only**: No demo OTPs, no mock OTPs, no auto-fill codes, and no plaintext logging. OTPs are securely dispatched via SMTP email (Nodemailer) and Twilio SMS.
- **Dedicated HMAC-SHA256 OTP Hashing**: Decoupled from `JWT_SECRET` with a mandatory server-side `OTP_SECRET`. Codes are hashed with timing-safe comparisons (`crypto.timingSafeEqual`).
- **Two-Step Sign-In**: Validates credentials $\to$ dispatches real-time OTP to user's registered channel $\to$ issues short-lived `loginChallengeToken` (`purpose: 'LOGIN_OTP'`) $\to$ verifies 6-digit OTP $\to$ issues session JWT.
- **Dual-OTP Signup**: Requires simultaneous, independent verification of both Email and Mobile phone before the account is committed to the database.
- **Anti-Account-Enumeration**: Forgot Password requests always return a uniform generic response preventing attacker reconnaissance.
- **Strict Password Policy**: Minimum 12 characters requiring uppercase, lowercase, numeric digit, and special character (`!@#$%^&*()_+-=[]{}:;'",.?/`), enforced with live UI checklist feedback and show/hide eye toggles.
- **Atomic Concurrency Protection**: Transactions (`prisma.$transaction`) prevent concurrent replay or double-consumption attacks.
- **Sliding-Window Rate Limiting**: Enforces 30-second cooldowns per channel and locks verification sessions after 5 failed attempts.

### 1. Dedicated `OTP_SECRET` Configuration
Add a 64-character hex secret to `server/.env` to pepper all HMAC-SHA256 OTP hashes:
```env
OTP_SECRET="e9f4c8a1b3d567290f84a1e67c8b9d0e23456789abcdef0123456789abcdef01"
```

### 2. Configure Email Delivery (SMTP)
You can use **Gmail SMTP** (free with an App Password) or any transactional provider (Brevo, SendGrid, Resend, Mailgun, Amazon SES).

To use Gmail:
1. Enable **2-Step Verification** on your Google Account: [Google Account Security](https://myaccount.google.com/security)
2. Generate an **App Password** under Security $\to$ 2-Step Verification $\to$ App passwords.
3. Configure `server/.env`:
   ```env
   SMTP_HOST="smtp.gmail.com"
   SMTP_PORT=587
   SMTP_SECURE="false"
   SMTP_USER="your-email@gmail.com"
   SMTP_PASS="your-16-character-app-password"
   SMTP_FROM="\"Nivara Civic Engine\" <your-email@gmail.com>"
   ```

### 3. Configure SMS Delivery (Twilio)
You can use a **Twilio Trial Account** (provides free test SMS credits) or any standard Twilio project.

1. Sign up at [Twilio](https://www.twilio.com/) and grab an SMS-capable phone number.
2. Retrieve your **Account SID** and **Auth Token** from the Twilio Console dashboard.
3. Configure `server/.env`:
   ```env
   TWILIO_ACCOUNT_SID="ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
   TWILIO_AUTH_TOKEN="your_twilio_auth_token"
   TWILIO_PHONE_NUMBER="+1XXXXXXXXXX"
   ```

> [!NOTE]
> In automated Jest test environments (`NODE_ENV=test`), notifications are intercepted safely in memory (`__testNotificationStore`) without external network hits. In local production runs, if delivery credentials fail, the API returns HTTP 502 with: `"We couldn't send the verification code. Please try again or contact support."` Plaintext OTPs are never exposed to the client or leaked in logs.


## 🧪 Testing & Verification

### Run Full Test Suite (50 Automated Tests)
```bash
cd server
npm test
```
*Executes 50 automated tests covering:*
- **Two-Step Sign-In OTP Flow** (`authSignInOtp.test.ts`): Credential challenge, channel detection, 5-attempt lockout, 30s resend cooldown, atomic replay protection.
- **Dual OTP Signup Verification** (`authDualOtpSignup.test.ts`): Mobile format, 12+ char password enforcement, independent email & SMS OTP verification, duplicate prevention, partial delivery rollback.
- **Forgot Password Feature** (`authForgotPassword.test.ts`): Anti-account-enumeration, reset OTP delivery, passwordResetToken issuance, strong password validation.
- **Mathematical Geospatial Clustering** (`clustering.test.ts`): Haversine distance, bounding-box pre-filtering, incremental centroid drift, threshold discrimination.
- **Boundary & Edge Cases** (`edgeCases.test.ts`): 49.8m vs 50.2m threshold boundaries, antipodal inputs, dynamic cluster fusion.

### Run Real-World Messy Data Simulation
```bash
cd server
npm run simulate
```
*Simulates 38 realistic citizen complaints across 6 distinct Bangalore zones with GPS jitter, demonstrating an impressive **76.3% deduplication rate** and verified category isolation.*

---

## 📚 Project Documentation

- **[`PRD.md`](./PRD.md)**: Product Requirements Document (Problem, Personas, Scope, KPIs).
- **[`HLD.md`](./HLD.md)**: High-Level Design (Architecture, Components, Tech Justification).
- **[`LLD.md`](./LLD.md)**: Low-Level Design (Database ER Diagram, API Contracts, Algorithm Pseudocode).
- **[`TRACEABILITY.md`](./TRACEABILITY.md)**: PRD $\leftrightarrow$ HLD $\leftrightarrow$ LLD $\leftrightarrow$ Code Traceability Matrix.
- **[`VIVA_NOTES.md`](./VIVA_NOTES.md)**: Comprehensive Viva & Defense guide answering all examiner checklist questions.
