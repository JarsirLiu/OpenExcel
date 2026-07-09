import { useEffect, useState } from "react";
import { type CurrentUser, fetchCurrentUser, login, logout, register } from "@/api/auth";
import { clearCachedUser, setCachedUser } from "@/api/authCache";
import { clearSessionStorage } from "@/shared/utils/storage";

export function useAuthState() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void fetchCurrentUser()
      .then((user) => {
        if (!cancelled) {
          setCurrentUser(user);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCurrentUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function signIn(input: { email: string; password: string }) {
    setSubmitting(true);
    setError(null);
    try {
      const user = await login(input);
      setCurrentUser(user);
      setCachedUser(user);
      return user;
    } catch (err) {
      const message = err instanceof Error ? err.message : "登录失败";
      setError(message);
      throw err;
    } finally {
      setSubmitting(false);
    }
  }

  async function signUp(input: { email: string; password: string; displayName?: string }) {
    setSubmitting(true);
    setError(null);
    try {
      const user = await register(input);
      setCurrentUser(user);
      setCachedUser(user);
      return user;
    } catch (err) {
      const message = err instanceof Error ? err.message : "注册失败";
      setError(message);
      throw err;
    } finally {
      setSubmitting(false);
    }
  }

  async function signOut() {
    setSubmitting(true);
    setError(null);
    try {
      await logout();
      setCurrentUser(null);
      clearCachedUser();
      clearSessionStorage();
    } catch (err) {
      const message = err instanceof Error ? err.message : "退出失败";
      setError(message);
      throw err;
    } finally {
      setSubmitting(false);
    }
  }

  return {
    currentUser,
    loading,
    submitting,
    error,
    signIn,
    signUp,
    signOut,
    setError,
  };
}
