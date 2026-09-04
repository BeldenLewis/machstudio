import { prisma } from "@/lib/prisma";

export async function findMetaConnection(projectId: string, userId: string) {
  const local = await prisma.metaAdConnection.findUnique({ where: { projectId } });
  if (local) return local;
  return prisma.metaAdConnection.findFirst({
    where: { connectedById: userId },
    orderBy: { updatedAt: "desc" },
  });
}
