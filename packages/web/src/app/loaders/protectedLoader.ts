import { type LoaderFunctionArgs, redirect } from "react-router-dom";
import { fetchCurrentUser } from "@/api/auth";
import { bootstrapWorkspace } from "@/api/workspaces";

export async function protectedLoader({ params }: LoaderFunctionArgs) {
  const currentUser = await resolveUser();

  if (!params.workspacePublicId) {
    const workspace = await bootstrapWorkspace(currentUser.id);
    throw redirect(`/workspaces/${workspace.publicId}`);
  }

  return { currentUser };
}

async function resolveUser() {
  try {
    return await fetchCurrentUser();
  } catch {
    throw redirect("/login");
  }
}
