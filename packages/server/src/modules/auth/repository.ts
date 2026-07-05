import { prisma } from "../../infra/db.js";

export interface CreateUserData {
  email: string;
  displayName: string;
  passwordHash: string;
}

export interface CreateSessionData {
  userId: number;
  tokenHash: string;
  expiresAt: Date;
  userAgent?: string | null;
  ipAddress?: string | null;
}

export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email },
  });
}

export async function findUserById(id: number) {
  return prisma.user.findUnique({
    where: { id },
  });
}

export async function createUser(data: CreateUserData) {
  return prisma.user.create({
    data,
  });
}

export async function findSessionByTokenHash(tokenHash: string) {
  return prisma.authSession.findFirst({
    where: {
      tokenHash,
      revokedAt: null,
      expiresAt: {
        gt: new Date(),
      },
    },
    include: {
      user: true,
    },
  });
}

export async function createSession(data: CreateSessionData) {
  return prisma.authSession.create({
    data: {
      userId: data.userId,
      tokenHash: data.tokenHash,
      expiresAt: data.expiresAt,
      userAgent: data.userAgent ?? null,
      ipAddress: data.ipAddress ?? null,
    },
  });
}

export async function revokeSessionByTokenHash(tokenHash: string) {
  return prisma.authSession.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllSessionsByUser(userId: number) {
  return prisma.authSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
