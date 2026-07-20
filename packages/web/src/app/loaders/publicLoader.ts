import { type LoaderFunctionArgs, redirect } from "react-router-dom";
import { fetchCurrentUser } from "@/api/auth";
import { ApiError } from "@/api/http";
import { getInternalReturnTo, routePaths } from "@/app/routePaths";

async function findCurrentUser() {
  try {
    return await fetchCurrentUser();
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    return null;
  }
}

async function redirectAuthenticatedUser(returnTo?: string | null) {
  const currentUser = await findCurrentUser();
  if (!currentUser) return null;

  if (returnTo) throw redirect(returnTo);

  throw redirect(routePaths.home);
}

export async function authPageLoader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  await redirectAuthenticatedUser(getInternalReturnTo(url.searchParams.get("returnTo")));
  return null;
}
