import { redirect } from "react-router-dom";
import { fetchCurrentUser } from "@/api/auth";
import { bootstrapWorkspace } from "@/api/workspaces";
import { routePaths } from "@/app/routePaths";

async function findCurrentUser() {
  try {
    return await fetchCurrentUser();
  } catch {
    return null;
  }
}

async function redirectAuthenticatedUser() {
  const currentUser = await findCurrentUser();
  if (!currentUser) return null;

  const workspace = await bootstrapWorkspace(currentUser.id);
  throw redirect(routePaths.workspace(workspace.publicId));
}

export async function publicHomeLoader() {
  return redirectAuthenticatedUser();
}

export async function authPageLoader() {
  await redirectAuthenticatedUser();
  return null;
}
