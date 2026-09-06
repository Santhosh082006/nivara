# Traceability & Alignment Matrix (PRD ↔ HLD ↔ LLD ↔ Implementation)
## Project: Nivara — Civic Issue Clustering & Reporting Engine

---

| PRD Feature ID | PRD Requirement Description | HLD Architecture Component | LLD API Endpoint / Schema Entity | Code Implementation File | Test Verification |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **FR-1.1** | User Authentication (Signup, Login, JWT, Roles) | API Gateway / Auth Controller | `POST /api/auth/register`<br>`POST /api/auth/login`<br>`GET /api/auth/me`<br>Table: `users` | `server/src/controllers/authController.ts`<br>`server/src/middleware/authMiddleware.ts` | Verified via simulation script & API |
| **FR-1.2** | Citizen Report Ingestion with Lat/Lng, Category, Photo | Ingestion Pipeline / Complaint Controller | `POST /api/complaints`<br>`GET /api/complaints`<br>Table: `complaints` | `server/src/controllers/complaintController.ts`<br>`client/src/components/ReportModal.tsx` | `server/src/scripts/simulateReports.ts` |
| **FR-1.3** | Proactive Duplicate Detection & Upvote Intercept | Spatial Deduplication Engine | `GET /api/clusters/nearby`<br>`POST /api/clusters/:id/upvote` | `client/src/components/ReportModal.tsx`<br>`server/src/controllers/clusterController.ts` | Tested in frontend modal & API |
| **FR-2.1** | Spatial Bounding Box Pre-Filter ($O(1)$) | Core Geospatial Clustering Engine | `calculateBoundingBox()`<br>Indexed range query on `(centroidLat, centroidLng)` | `server/src/clustering/haversine.ts`<br>`server/src/clustering/clusterService.ts` | Unit test: `clustering.test.ts` (PASS) |
| **FR-2.2** | Strict Category Isolation | Category Filter Guard | `where: { category: P.category }` | `server/src/clustering/clusterService.ts` | Tested: Koramangala Pothole vs Streetlight (PASS) |
| **FR-2.3** | Geodesic Haversine Distance ($R=6371\text{km}$) | Mathematical Haversine Calculator | `calculateHaversineDistance()` | `server/src/clustering/haversine.ts` | Unit test: `clustering.test.ts` (PASS) |
| **FR-2.4** | 50-Meter Proximity Threshold | Threshold Evaluator | `DEFAULT_CLUSTER_DISTANCE_THRESHOLD_METERS = 50.0` | `server/src/config/constants.ts`<br>`server/src/clustering/clusterService.ts` | Edge case test: `edgeCases.test.ts` (49.8m vs 50.2m PASS) |
| **FR-2.5** | Dynamic Centroid Recalculation (Running Mean) | Dynamic Centroid Engine | `recomputeCentroidIncremental()`<br>`UPDATE issue_clusters SET centroidLat...` | `server/src/clustering/haversine.ts`<br>`server/src/clustering/clusterService.ts` | Unit test: `clustering.test.ts` (PASS) |
| **FR-2.6** | Equidistant Tie-Breaking Logic | Tie-Breaker Module | Deterministic sort: distance $\to$ `reportCount` $\to$ `createdAt` | `server/src/clustering/clusterService.ts` | Tested in `edgeCases.test.ts` (PASS) |
| **FR-3.1** | Citizen Upvoting (1 vote per user) | Upvote Service | `POST /api/clusters/:id/upvote`<br>Table: `upvotes` with `UNIQUE(userId, clusterId)` | `server/src/controllers/clusterController.ts`<br>`client/src/components/ClusterDetailModal.tsx` | Tested in simulation & API |
| **FR-3.2** | Composite Priority Formula ($2N + \text{Upvotes} + W$) | Priority Scoring Engine | `calculatePriorityScore()`<br>`issue_clusters.priorityScore` | `server/src/clustering/clusterService.ts`<br>`server/src/config/constants.ts` | Verified in simulation output |
| **FR-4.1** | Interactive Civic Map with Dynamic Cluster Pins | Client Presentation Layer | Leaflet OpenStreetMap<br>`GET /api/clusters?bounds=...` | `client/src/components/CivicMapView.tsx` | Interactive UI verified |
| **FR-4.2** | Cluster Inspection Modal with Timeline | Inspection Component | `GET /api/clusters/:id`<br>Table: `cluster_memberships` | `client/src/components/ClusterDetailModal.tsx` | Interactive UI verified |
| **FR-4.3** | Municipal Authority Priority Triage Dashboard | Authority Command Center | `GET /api/clusters/top`<br>`PATCH /api/clusters/:id/status` | `client/src/components/AuthorityDashboard.tsx` | Interactive UI verified |

---

## Conclusion
Every functional requirement in `PRD.md` maps directly to an architectural component in `HLD.md`, an API endpoint and database model in `LLD.md`, and is fully implemented and tested in the codebase.
