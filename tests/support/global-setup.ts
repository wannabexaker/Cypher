import { cleanupRegisteredHost, prisma } from "./database";

export default async function globalSetup() {
  const staleFixtures = await prisma.user.findMany({
    where: {
      email: {
        startsWith: "e2e_",
        endsWith: "@example.test",
      },
    },
    select: { email: true },
  });

  try {
    for (const fixture of staleFixtures) {
      await cleanupRegisteredHost(fixture.email);
    }
  } finally {
    await prisma.$disconnect();
  }
}
