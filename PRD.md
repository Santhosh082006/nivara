# Product Requirements Document (PRD)
## Project: Nivara — Civic Issue Clustering & Reporting Engine

---

## 1. Executive Summary & Problem Statement

### 1.1 The Civic Triage Dilemma
In modern urban municipalities, citizen complaints regarding civic infrastructure failures—such as potholes, open manholes, overflowing garbage dumps, broken streetlights, and contaminated water pipelines—flood civic portals (e.g., BBMP Sahaaya, Swachhata, CPGRAMS) at massive volumes. 

However, existing civic reporting platforms suffer from three major systemic flaws:
1. **Duplicate Ticket Avalanche**: When a large pothole emerges on a high-density commuter corridor, dozens or hundreds of citizens report the exact same defect independently. Traditional municipal CRM systems treat each report as an isolated ticket. This creates an exponential administrative backlog, artificially inflates open ticket counts, and drains call center bandwidth.
2. **Citizen Fatigue & Disengagement**: Citizens report issues into a "black hole." Without visibility into whether neighbors have already flagged the same issue or how many people are affected, citizens feel ignored and stop reporting.
3. **Misallocated Municipal Resources**: Field inspection teams are dispatched to duplicate locations repeatedly rather than tackling distinct, geographically severe civic hazards. High-impact clusters that affect entire communities get buried under isolated single-report tickets.

### 1.2 The Nivara Solution
**Nivara** is an intelligent civic reporting platform powered by a real-time **Geospatial Issue Clustering Engine**. When a citizen submits a complaint with GPS coordinates and a category:
- The engine pre-filters nearby candidate clusters using spatial bounding-box geometry ($O(1)$ indexed pruning).
- It calculates geodesic proximity via the **Haversine formula** to detect if the complaint falls within a strict street-level threshold ($50\text{m}$) of an existing cluster of the same category.
- If a match exists, the new complaint joins the cluster, dynamically recalculating the cluster's geographic centroid and incrementing its priority weight.
- During the submission flow, the system actively prompts the citizen: *"A similar issue has already been reported 28m away by 4 neighbors. Would you like to upvote it instead?"*
- Municipal authorities are presented with a **Priority-Ranked Command Dashboard**, aggregating dozens of duplicate reports into a single actionable incident sorted by real civic impact.

---

## 2. Target User Personas

| Persona | Role | Key Pain Points | Goals & User Stories |
| :--- | :--- | :--- | :--- |
| **Citizen (Aarav, Daily Commuter)** | Resident submitting civic reports via mobile/desktop web | - Frustrated by lack of progress on reported issues.<br>- Dislikes filling repetitive forms for known issues.<br>- Doesn't know if neighbors already complained. | *"As a citizen, I want to quickly report a pothole or upvote an existing neighbor's report in two clicks, so that the municipality recognizes its collective severity without wasting my time."* |
| **Ward Official / Engineer (Lakshmi, BBMP/Muncipality)** | Authority triaging and dispatching field repair crews | - Drowning in hundreds of duplicate tickets for the same street corner.<br>- Cannot identify which civic issues impact the most citizens.<br>- Lacks high-level geospatial visibility of acute issue density. | *"As a municipal officer, I want a single clustered view of civic defects ranked by urgency and community impact, so that I can dispatch crews to the highest-priority hazards first."* |
| **Community Organizer (Kavita, Resident Welfare Assoc.)** | RWA representative tracking ward health | - Needs transparent data to hold local corporators accountable.<br>- Wants community issues to gain momentum through civic consensus. | *"As an RWA leader, I want to mobilize neighborhood upvotes on critical water leakages and see the issue climb the municipal priority leaderboard."* |

---

## 3. Product Scope & Functional Requirements

### 3.1 Module 1: Citizen Ingestion & Authentication
- **FR-1.1 User Auth**: Secure JWT-based authentication (Sign up, Login, Profile) with role differentiation (`CITIZEN`, `AUTHORITY`).
- **FR-1.2 Report Submission**: Form accepting:
  - **Category**: Fixed taxonomy (`Pothole`, `Garbage Dump`, `Streetlight`, `Water Leakage`, `Open Sewage`, `Footpath Obstruction`).
  - **Location**: Latitude and Longitude captured via device GPS geolocation or interactive pin placement on a map.
  - **Description**: Textual details of the incident.
  - **Photo URL**: Optional image attachment showing the defect.
- **FR-1.3 Deduplication Intercept**: If an open cluster of the same category is detected within 50 meters during form filling, prompt the citizen to upvote the existing cluster instead of creating a duplicate ticket.

### 3.2 Module 2: Geospatial Clustering Engine
- **FR-2.1 Spatial Bounding Box Pre-Filter**: Compute bounding box $(\text{lat}_{\min}, \text{lng}_{\min}, \text{lat}_{\max}, \text{lng}_{\max})$ around the complaint location for $O(1)$ candidate retrieval.
- **FR-2.2 Strict Category Isolation**: A pothole report must NEVER cluster with a streetlight or garbage complaint, even at identical coordinates.
- **FR-2.3 Haversine Geodesic Distance**: Calculate true surface distance on the WGS-84 sphere between the complaint point and cluster centroids.
- **FR-2.4 50-Meter Proximity Threshold**:
  - Distance $\le 50.0\text{m}$: Candidate for cluster membership.
  - Distance $> 50.0\text{m}$: Spawns a new independent cluster.
- **FR-2.5 Dynamic Centroid Recalculation**: When a complaint joins a cluster, update the cluster's coordinates using the arithmetic mean of all constituent complaints:
  $$\text{Centroid}_{\text{new}} = \left( \frac{\sum_{i=1}^{N} \text{lat}_i}{N}, \frac{\sum_{i=1}^{N} \text{lng}_i}{N} \right)$$
- **FR-2.6 Equidistant Determinism**: If a complaint is equidistant to two clusters of the same category, tie-break by:
  1. Cluster with higher `reportCount` (greater established mass).
  2. Cluster with earlier `createdAt` timestamp (FIFO stability).

### 3.3 Module 3: Community Upvoting & Priority Scoring
- **FR-3.1 Cluster Upvoting**: Authenticated citizens can upvote an existing cluster (maximum 1 upvote per user per cluster).
- **FR-3.2 Composite Priority Formula**:
  $$\text{Priority Score} = (\text{reportCount} \times 2.0) + (\text{upvotes} \times 1.0) + \text{CategoryWeight}$$
  Where category weights emphasize immediate safety hazards (e.g., Open Manhole / Sewage = 10, Pothole = 5, Streetlight = 3).

### 3.4 Module 4: Interactive Civic Map & Authority Dashboard
- **FR-4.1 Interactive Map (Leaflet)**:
  - Real-time OpenStreetMap rendering.
  - Cluster pins dynamically sized and colored by report count:
    - Normal (1–2 reports): Amber / Teal small pin.
    - Moderate (3–6 reports): Orange medium pin.
    - Critical (7+ reports): Crimson pulsating pin.
  - Viewport-bounded query (`GET /api/clusters?bounds=...`) for high performance.
- **FR-4.2 Inspection Modal**: Clicking a cluster displays full details: category, report count, upvote count, member complaint timeline, and photos.
- **FR-4.3 Authority Priority Triage**:
  - Tabular and card views sorted by `priorityScore` descending.
  - Status management workflow: `OPEN` $\to$ `IN_PROGRESS` $\to$ `RESOLVED`.
  - Filtering by category, status, and search query.

---

## 4. Non-Functional Requirements (NFR)

| Category | Requirement | Metric / Target |
| :--- | :--- | :--- |
| **Clustering Latency** | Clustering calculation during complaint ingestion must execute synchronously within API response window. | $< 50\text{ms}$ execution time for clustering evaluation per report. |
| **Spatial Precision** | Geodesic distance must account for spherical curvature, preventing planar distortion. | $< 0.5\%$ error margin against Great Circle distance. |
| **Scalability & Indexing**| Bounding box pre-filtering must avoid $O(N)$ full-table scans. | Composite index on `(category, status, centroidLat, centroidLng)`. |
| **Data Integrity** | Complaint insertion, cluster assignment, and centroid updates must be atomic. | Strict ACID database transactions (rollback on any failure). |
| **Security & Privacy** | Passwords salted with bcrypt; JWT verification on protected routes. | Minimum 10 bcrypt salt rounds; stateless JWT tokens. |
| **Usability & Access** | Mobile-first responsive UI supporting geolocation permissions gracefully. | Usable on mobile (360px) and desktop (1920px) screens. |

---

## 5. Success Metrics & Key Performance Indicators (KPIs)

1. **Deduplication Rate**:
   $$\text{Deduplication Rate} = \left( 1 - \frac{\text{Total Active Clusters}}{\text{Total Submitted Complaints}} \right) \times 100\%$$
   *Target: $> 65\%$ deduplication in high-density test scenarios.*
2. **Authority Triage Time**: Time required for a ward engineer to identify the top 5 urgent civic hazards reduced from minutes to under 5 seconds.
3. **Clustering Accuracy**: 100% adherence to the 50m threshold and strict category isolation across simulated test fixtures.
4. **Citizen Engagement**: Percentage of citizens choosing to upvote an existing cluster when prompted vs submitting redundant duplicate reports.
