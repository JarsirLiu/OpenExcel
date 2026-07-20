import { type LoaderFunctionArgs, redirect } from "react-router-dom";
import { fetchCurrentUser } from "@/api/auth";
import { routePaths } from "@/app/routePaths";

export async function protectedLoader(_args: LoaderFunctionArgs) {
  const currentUser = await resolveUser();
  return { currentUser };
}

async function resolveUser() {
  try {
    return await fetchCurrentUser();
  } catch {
    throw redirect(routePaths.login);
  }
}
