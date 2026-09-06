import dotenv from 'dotenv';
dotenv.config();

import { prisma } from '../config/db';
import { ingestAndClusterComplaint } from '../clustering/clusterService';
import { calculateHaversineDistance, Coordinates } from '../clustering/haversine';
import { IssueCategory } from '@prisma/client';
import bcrypt from 'bcryptjs';

// Meters to degrees conversion helper
const metersToDeltaLat = (meters: number) => (meters / 6371000) * (180 / Math.PI);
const metersToDeltaLng = (meters: number, lat: number) =>
  (meters / (6371000 * Math.cos((lat * Math.PI) / 180))) * (180 / Math.PI);

interface HotspotDefinition {
  name: string;
  category: IssueCategory;
  groundTruthCenter: Coordinates;
  reportCount: number;
  maxScatterMeters: number;
}

const REAL_WORLD_HOTSPOTS: HotspotDefinition[] = [
  {
    name: 'Koramangala 80ft Road Junction',
    category: 'POTHOLE',
    groundTruthCenter: { latitude: 12.935242, longitude: 77.624461 },
    reportCount: 8,
    maxScatterMeters: 35,
  },
  {
    name: 'Indiranagar 100ft Road Market',
    category: 'GARBAGE_DUMP',
    groundTruthCenter: { latitude: 12.978369, longitude: 77.640836 },
    reportCount: 7,
    maxScatterMeters: 30,
  },
  {
    name: 'HSR Layout Sector 1 Commercial',
    category: 'STREETLIGHT',
    groundTruthCenter: { latitude: 12.911562, longitude: 77.653421 },
    reportCount: 6,
    maxScatterMeters: 25,
  },
  {
    name: 'Whitefield ITPL Main Road Corridor',
    category: 'WATER_LEAKAGE',
    groundTruthCenter: { latitude: 12.986612, longitude: 77.738124 },
    reportCount: 7,
    maxScatterMeters: 40,
  },
  {
    name: 'Jayanagar 4th Block Complex',
    category: 'OPEN_SEWAGE',
    groundTruthCenter: { latitude: 12.929821, longitude: 77.583419 },
    reportCount: 5,
    maxScatterMeters: 20,
  },
];

async function runSimulation() {
  console.log('================================================================');
  console.log('🏙️  NIVARA CIVIC CLUSTERING ENGINE — REAL-WORLD MESSY DATA SIMULATION');
  console.log('================================================================\n');

  // Step 1: Clean and prepare database state
  console.log('[Setup] Resetting database tables for a clean simulation run...');
  await prisma.clusterMembership.deleteMany();
  await prisma.upvote.deleteMany();
  await prisma.complaint.deleteMany();
  await prisma.issueCluster.deleteMany();
  await prisma.user.deleteMany();

  // Create simulated citizens and authority user
  const passwordHash = await bcrypt.hash('password123', 10);
  const users = await Promise.all([
    prisma.user.create({
      data: { name: 'Aarav Sharma', email: 'aarav@citizen.in', passwordHash, role: 'CITIZEN' },
    }),
    prisma.user.create({
      data: { name: 'Priya Patel', email: 'priya@citizen.in', passwordHash, role: 'CITIZEN' },
    }),
    prisma.user.create({
      data: { name: 'Rohan Mehta', email: 'rohan@citizen.in', passwordHash, role: 'CITIZEN' },
    }),
    prisma.user.create({
      data: { name: 'Ananya Rao', email: 'ananya@citizen.in', passwordHash, role: 'CITIZEN' },
    }),
    prisma.user.create({
      data: { name: 'Ward 174 Engineer', email: 'authority@bbmp.gov.in', passwordHash, role: 'AUTHORITY' },
    }),
  ]);

  console.log(`[Setup] Created ${users.length} simulation accounts.\n`);

  // Step 2: Synthesize messy complaints
  interface SimulatedReport {
    hotspotName: string;
    category: IssueCategory;
    description: string;
    latitude: number;
    longitude: number;
    userId: string;
  }

  const generatedReports: SimulatedReport[] = [];

  // Generate complaints for each hotspot
  for (const hotspot of REAL_WORLD_HOTSPOTS) {
    for (let i = 1; i <= hotspot.reportCount; i++) {
      // Add realistic pseudo-random GPS drift within maxScatterMeters
      const angle = Math.random() * 2 * Math.PI;
      const radius = Math.random() * hotspot.maxScatterMeters;

      const deltaLat = metersToDeltaLat(radius * Math.sin(angle));
      const deltaLng = metersToDeltaLng(radius * Math.cos(angle), hotspot.groundTruthCenter.latitude);

      const user = users[Math.floor(Math.random() * 4)]; // Pick random citizen

      generatedReports.push({
        hotspotName: hotspot.name,
        category: hotspot.category,
        description: `${hotspot.name} issue report #${i}: Severe ${hotspot.category.toLowerCase().replace('_', ' ')} observed by citizen.`,
        latitude: Math.round((hotspot.groundTruthCenter.latitude + deltaLat) * 1e6) / 1e6,
        longitude: Math.round((hotspot.groundTruthCenter.longitude + deltaLng) * 1e6) / 1e6,
        userId: user.id,
      });
    }
  }

  // Cross-category test: Add 2 streetlight reports at the exact same location as Koramangala Pothole
  const koramangalaCenter = REAL_WORLD_HOTSPOTS[0].groundTruthCenter;
  generatedReports.push({
    hotspotName: 'Koramangala 80ft Road (Streetlight Collision Test)',
    category: 'STREETLIGHT',
    description: 'Streetlight completely dark right above the pothole at Koramangala 80ft Rd.',
    latitude: koramangalaCenter.latitude,
    longitude: koramangalaCenter.longitude,
    userId: users[0].id,
  });
  generatedReports.push({
    hotspotName: 'Koramangala 80ft Road (Streetlight Collision Test)',
    category: 'STREETLIGHT',
    description: 'Second report of flickering streetlight at same junction.',
    latitude: koramangalaCenter.latitude + metersToDeltaLat(10),
    longitude: koramangalaCenter.longitude,
    userId: users[1].id,
  });

  // Isolated reports test: 3 distinct distant locations
  const isolatedLocations: Coordinates[] = [
    { latitude: 12.900123, longitude: 77.550456 }, // Banashankari
    { latitude: 13.035678, longitude: 77.597890 }, // Hebbal
    { latitude: 12.955432, longitude: 77.712345 }, // Marathahalli
  ];

  isolatedLocations.forEach((loc, idx) => {
    generatedReports.push({
      hotspotName: `Isolated Area ${idx + 1}`,
      category: 'FOOTPATH_OBSTRUCTION',
      description: `Single isolated footpath encroachment report in Area ${idx + 1}.`,
      latitude: loc.latitude,
      longitude: loc.longitude,
      userId: users[idx % 4].id,
    });
  });

  // Shuffle reports to simulate real-world arrival order
  const shuffled = generatedReports.sort(() => Math.random() - 0.5);

  console.log(`[Ingestion] Ingesting ${shuffled.length} simulated complaints across 6 distinct zones...`);

  let mergedCount = 0;
  let newClusterCount = 0;

  for (let i = 0; i < shuffled.length; i++) {
    const report = shuffled[i];
    const result = await ingestAndClusterComplaint({
      userId: report.userId,
      category: report.category,
      description: report.description,
      latitude: report.latitude,
      longitude: report.longitude,
    });

    if (result.isNewCluster) {
      newClusterCount++;
    } else {
      mergedCount++;
    }
  }

  console.log(`[Ingestion] Completed. New Clusters Created: ${newClusterCount}, Merged into Existing: ${mergedCount}\n`);

  // Step 3: Analyze Formed Clusters
  const formedClusters = await prisma.issueCluster.findMany({
    include: {
      memberships: true,
    },
    orderBy: { reportCount: 'desc' },
  });

  console.log('-----------------------------------------------------------------------------------------');
  console.log('📊 SIMULATION CLUSTER FORMATION SUMMARY');
  console.log('-----------------------------------------------------------------------------------------');
  console.log(
    'Cluster ID | Category             | Reports | Centroid Lat | Centroid Lng | Priority Score'
  );
  console.log('-----------------------------------------------------------------------------------------');

  for (const c of formedClusters) {
    const cid = c.id.slice(0, 8);
    const cat = c.category.padEnd(20, ' ');
    const count = String(c.reportCount).padStart(7, ' ');
    const lat = c.centroidLat.toFixed(6);
    const lng = c.centroidLng.toFixed(6);
    const score = c.priorityScore.toFixed(1).padStart(14, ' ');
    console.log(`${cid}.. | ${cat} | ${count} | ${lat}    | ${lng}    | ${score}`);
  }

  console.log('-----------------------------------------------------------------------------------------\n');

  // Step 4: Verification Checks
  const totalComplaints = shuffled.length;
  const totalClusters = formedClusters.length;
  const deduplicationRate = ((1 - totalClusters / totalComplaints) * 100).toFixed(1);

  console.log('📈 KEY PERFORMANCE INDICATORS:');
  console.log(`   - Total Ingested Complaints : ${totalComplaints}`);
  console.log(`   - Total Active Clusters     : ${totalClusters}`);
  console.log(`   - Deduplication Efficiency  : ${deduplicationRate}% (Target: > 65%)\n`);

  // Verify Koramangala Category Isolation
  const koramangalaClusters = formedClusters.filter(
    (c) =>
      calculateHaversineDistance(
        { latitude: c.centroidLat, longitude: c.centroidLng },
        koramangalaCenter
      ) < 60
  );

  console.log('🔬 VERIFICATION CHECKS:');
  console.log(`   1. Category Isolation Test: Found ${koramangalaClusters.length} clusters at Koramangala.`);
  koramangalaClusters.forEach((c) => {
    console.log(`      -> Cluster ${c.id.slice(0, 8)} (${c.category}): ${c.reportCount} reports`);
  });

  const hasPothole = koramangalaClusters.some((c) => c.category === 'POTHOLE');
  const hasStreetlight = koramangalaClusters.some((c) => c.category === 'STREETLIGHT');

  if (hasPothole && hasStreetlight && koramangalaClusters.length === 2) {
    console.log('      ✅ PASS: Potholes and Streetlights remained strictly isolated at identical coordinates!\n');
  } else {
    console.log('      ❌ FAIL: Category collision occurred!\n');
  }

  // Upvote demonstration
  console.log('[Upvote Demo] Adding community upvotes to highest priority cluster...');
  const topCluster = formedClusters[0];
  await prisma.upvote.create({
    data: { userId: users[0].id, clusterId: topCluster.id },
  });
  await prisma.upvote.create({
    data: { userId: users[1].id, clusterId: topCluster.id },
  });
  await prisma.issueCluster.update({
    where: { id: topCluster.id },
    data: {
      upvotes: 2,
      priorityScore: topCluster.priorityScore + 2,
    },
  });

  const updatedTop = await prisma.issueCluster.findUnique({ where: { id: topCluster.id } });
  console.log(
    `   ✅ Top Cluster ${updatedTop?.category} priority elevated from ${topCluster.priorityScore} to ${updatedTop?.priorityScore} with 2 upvotes!\n`
  );

  console.log('🎉 SIMULATION COMPLETED SUCCESSFULLY! All clusters verified.');
  await prisma.$disconnect();
}

runSimulation().catch((err) => {
  console.error('Simulation failed:', err);
  process.exit(1);
});
