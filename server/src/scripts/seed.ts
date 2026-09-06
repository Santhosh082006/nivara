import dotenv from 'dotenv';
dotenv.config();

import { prisma } from '../config/db';
import { ingestAndClusterComplaint } from '../clustering/clusterService';
import bcrypt from 'bcryptjs';

async function seed() {
  console.log('[Seed] Starting database seed...');

  // Reset existing data
  await prisma.clusterMembership.deleteMany();
  await prisma.upvote.deleteMany();
  await prisma.complaint.deleteMany();
  await prisma.issueCluster.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash('password123', 10);

  // 1. Create Users
  const citizen1 = await prisma.user.create({
    data: {
      name: 'Aarav Sharma',
      email: 'aarav@citizen.in',
      passwordHash,
      role: 'CITIZEN',
      phone: '+91 9845012345',
    },
  });

  const citizen2 = await prisma.user.create({
    data: {
      name: 'Priya Patel',
      email: 'priya@citizen.in',
      passwordHash,
      role: 'CITIZEN',
      phone: '+91 9845054321',
    },
  });

  const citizen3 = await prisma.user.create({
    data: {
      name: 'Rohan Mehta',
      email: 'rohan@citizen.in',
      passwordHash,
      role: 'CITIZEN',
      phone: '+91 9845098765',
    },
  });

  const authority = await prisma.user.create({
    data: {
      name: 'BBMP Ward 174 Engineer',
      email: 'authority@bbmp.gov.in',
      passwordHash,
      role: 'AUTHORITY',
      phone: '+91 8022221111',
    },
  });

  console.log('[Seed] Users created:');
  console.log('  - Citizen 1: aarav@citizen.in (password123)');
  console.log('  - Citizen 2: priya@citizen.in (password123)');
  console.log('  - Authority: authority@bbmp.gov.in (password123)');

  // 2. Ingest realistic civic issues across Bengaluru
  const sampleComplaints = [
    // Koramangala 80ft Road - Potholes
    {
      user: citizen1,
      category: 'POTHOLE' as const,
      description: 'Deep hazardous crater near Sony World Signal causing two-wheelers to skid.',
      latitude: 12.935242,
      longitude: 77.624461,
      imageUrl: 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?w=600',
    },
    {
      user: citizen2,
      category: 'POTHOLE' as const,
      description: 'Second pothole in the left lane directly adjacent to the bus stop.',
      latitude: 12.935310,
      longitude: 77.624510,
      imageUrl: 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?w=600',
    },
    {
      user: citizen3,
      category: 'POTHOLE' as const,
      description: 'Asphalt eroded creating jagged trench in the road.',
      latitude: 12.935200,
      longitude: 77.624410,
    },
    {
      user: citizen1,
      category: 'POTHOLE' as const,
      description: 'Severe traffic bottleneck during peak hours due to road crater.',
      latitude: 12.935270,
      longitude: 77.624480,
    },

    // Indiranagar 100ft Road - Garbage Dump
    {
      user: citizen2,
      category: 'GARBAGE_DUMP' as const,
      description: 'Commercial waste and plastic bags overflowing from blackspot corner.',
      latitude: 12.978369,
      longitude: 77.640836,
      imageUrl: 'https://images.unsplash.com/photo-1605600659908-0ef719419d41?w=600',
    },
    {
      user: citizen3,
      category: 'GARBAGE_DUMP' as const,
      description: 'Stray cattle and dogs scattering waste onto pedestrian walkway.',
      latitude: 12.978410,
      longitude: 77.640890,
    },
    {
      user: citizen1,
      category: 'GARBAGE_DUMP' as const,
      description: 'Uncollected refuse rotting for over 4 days, strong foul odor.',
      latitude: 12.978340,
      longitude: 77.640800,
    },

    // HSR Layout - Broken Streetlights
    {
      user: citizen1,
      category: 'STREETLIGHT' as const,
      description: 'Three consecutive streetlights non-functional on 14th Main Road.',
      latitude: 12.911562,
      longitude: 77.653421,
    },
    {
      user: citizen2,
      category: 'STREETLIGHT' as const,
      description: 'Pitch black road at night creating safety hazard for women commuters.',
      latitude: 12.911610,
      longitude: 77.653470,
    },
    {
      user: citizen3,
      category: 'STREETLIGHT' as const,
      description: 'Pole wiring exposed after recent rainstorm.',
      latitude: 12.911520,
      longitude: 77.653380,
    },

    // Whitefield ITPL - Water Leakage
    {
      user: citizen3,
      category: 'WATER_LEAKAGE' as const,
      description: 'Main BWSSB pipeline burst flooding the service road.',
      latitude: 12.986612,
      longitude: 77.738124,
      imageUrl: 'https://images.unsplash.com/photo-1541888946425-d0fbb186c5f8?w=600',
    },
    {
      user: citizen1,
      category: 'WATER_LEAKAGE' as const,
      description: 'Thousands of liters of potable water wasting onto ITPL main corridor.',
      latitude: 12.986670,
      longitude: 77.738180,
    },

    // Jayanagar 4th Block - Open Sewage
    {
      user: citizen2,
      category: 'OPEN_SEWAGE' as const,
      description: 'Manhole cover dislodged with sewage overflowing onto shopping street.',
      latitude: 12.929821,
      longitude: 77.583419,
    },
    {
      user: citizen3,
      category: 'OPEN_SEWAGE' as const,
      description: 'Severe health hazard near market entrance.',
      latitude: 12.929850,
      longitude: 77.583440,
    },
  ];

  console.log(`[Seed] Ingesting ${sampleComplaints.length} realistic complaints...`);

  for (const item of sampleComplaints) {
    await ingestAndClusterComplaint({
      userId: item.user.id,
      category: item.category,
      description: item.description,
      latitude: item.latitude,
      longitude: item.longitude,
      imageUrl: item.imageUrl,
    });
  }

  // 3. Add sample community upvotes
  const clusters = await prisma.issueCluster.findMany({ orderBy: { reportCount: 'desc' } });
  if (clusters.length > 0) {
    const topCluster = clusters[0];
    await prisma.upvote.create({
      data: { userId: citizen1.id, clusterId: topCluster.id },
    });
    await prisma.upvote.create({
      data: { userId: citizen2.id, clusterId: topCluster.id },
    });
    await prisma.issueCluster.update({
      where: { id: topCluster.id },
      data: {
        upvotes: 2,
        priorityScore: topCluster.priorityScore + 2,
      },
    });
  }

  console.log('[Seed] Database seeded successfully with realistic clusters and upvotes!');
  await prisma.$disconnect();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
