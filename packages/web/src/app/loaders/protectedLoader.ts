import { redirect } from "react-router-dom";
import { fetchCurrentUser } from "@/api/auth";
import { getCachedUser } from "@/api/authCache";

export async function protectedLoader() {
  const cached = getCachedUser();
  if (cached) return { currentUser: cached };

  try {
    const currentUser = await fetchCurrentUser();
    return { currentUser };
  } catch {
    throw redirect("/login");
  }
}
