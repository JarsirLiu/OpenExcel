import { AuthError } from "../domain/authErrors.js";
import type {
  AuthCredentialsInput,
  AuthenticatedUserResult,
  AuthRequestMetadata,
} from "../domain/authTypes.js";
import * as authRepository from "../infrastructure/authRepository.js";
import { verifyPassword } from "../infrastructure/passwordHasher.js";
import { buildSessionData, toCurrentUser, validateCredentialsInput } from "./authSupport.js";

export async function loginWithPassword(
  input: AuthCredentialsInput,
  metadata: AuthRequestMetadata,
): Promise<AuthenticatedUserResult> {
  const validated = validateCredentialsInput(input);
  const user = await authRepository.findUserByEmail(validated.email);
  if (!user) {
    throw new AuthError("邮箱或密码错误", "INVALID_CREDENTIALS", 401);
  }

  if (!verifyPassword(validated.password, user.passwordHash)) {
    throw new AuthError("邮箱或密码错误", "INVALID_CREDENTIALS", 401);
  }

  const { rawToken, session } = buildSessionData(metadata);
  await authRepository.createSession({ userId: user.id, ...session });

  return { rawToken, user: toCurrentUser(user) };
}
