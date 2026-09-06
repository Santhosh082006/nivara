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

## 🧪 Testing & Verification

### Run Mathematical Clustering Unit Tests
```bash
cd server
npm test
```
*Executes 13 automated tests covering Haversine distance, bounding-box pre-filtering, incremental centroid drift, threshold boundaries (49.8m vs 50.2m), and equidistant tie-breaking.*

### Run Real-World Messy Data Simulation
```bash
cd server
npm run simulate
```
*Simulates 38 realistic citizen complaints across 6 distinct Bangalore zones with GPS jitter, demonstrating an impressive **76.3% deduplication rate** and verified category isolation.*

---

## 🔑 Demo Accounts

| Role | Email | Password | Access Privileges |
| :--- | :--- | :--- | :--- |
| **Citizen** | `aarav@citizen.in` | `password123` | Submit reports, upvote clusters, view live map |
| **Citizen** | `priya@citizen.in` | `password123` | Submit reports, upvote clusters |
| **Authority** | `authority@bbmp.gov.in` | `password123` | Municipal priority triage, status transition |

*(Both accounts are pre-filled in the Sign-In modal for instant one-click demo testing)*

---

## 📚 Project Documentation

- **[`PRD.md`](./PRD.md)**: Product Requirements Document (Problem, Personas, Scope, KPIs).
- **[`HLD.md`](./HLD.md)**: High-Level Design (Architecture, Components, Tech Justification).
- **[`LLD.md`](./LLD.md)**: Low-Level Design (Database ER Diagram, API Contracts, Algorithm Pseudocode).
- **[`TRACEABILITY.md`](./TRACEABILITY.md)**: PRD $\leftrightarrow$ HLD $\leftrightarrow$ LLD $\leftrightarrow$ Code Traceability Matrix.
- **[`VIVA_NOTES.md`](./VIVA_NOTES.md)**: Comprehensive Viva & Defense guide answering all examiner checklist questions.
