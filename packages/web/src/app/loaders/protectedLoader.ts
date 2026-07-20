import { type LoaderFunctionArgs, redirect } from "react-router-dom";
import { fetchCurrentUser } from "@/api/auth";
import { ApiError } from "@/api/http";
import { getInternalReturnTo, routePaths } from "@/app/routePaths";

export async function protectedLoader({ request }: LoaderFunctionArgs) {
  const currentUser = await resolveUser(request);
  return { currentUser };
}

async function resolveUser(request: Request) {
  try {
    return await fetchCurrentUser();
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    const url = new URL(request.url);
    const returnTo = getInternalReturnTo(`${url.pathname}${url.search}`);
    throw redirect(returnTo ? routePaths.loginWithReturnTo(returnTo) : routePaths.login);
  }
}
