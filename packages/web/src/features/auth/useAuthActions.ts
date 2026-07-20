import { useState } from "react";
import { login, register } from "@/api/auth";

export function useAuthActions() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn(input: { email: string; password: string }) {
    setSubmitting(true);
    setError(null);
    try {
      return await login(input);
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
      return await register(input);
    } catch (err) {
      const message = err instanceof Error ? err.message : "注册失败";
      setError(message);
      throw err;
    } finally {
      setSubmitting(false);
    }
  }

  return { submitting, error, signIn, signUp };
}
