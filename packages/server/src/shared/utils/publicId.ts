import { randomUUID } from "node:crypto";

export function generatePublicId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

export function generateWorkspacePublicId(): string {
  return generatePublicId("ws");
}

export function generateWorkbookPublicId(): string {
  return generatePublicId("wb");
}

export function generateSessionPublicId(): string {
  return generatePublicId("ss");
}