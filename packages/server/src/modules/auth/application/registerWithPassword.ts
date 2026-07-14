import { AuthError } from "../domain/authErrors.js";
import type {
  AuthCredentialsInput,
  AuthenticatedUserResult,
  AuthRequestMetadata,
} from "../domain/authTypes.js";
import * as authRepository from "../infrastructure/authRepository.js";
import { hashPassword } from "../infrastructure/passwordHasher.js";
import { buildSessionData, toCurrentUser, validateCredentialsInput } from "./authSupport.js";

export async function registerWithPassword(
  input: AuthCredentialsInput,
  metadata: AuthRequestMetadata,
): Promise<AuthenticatedUserResult> {
  const validated = validateCredentialsInput(input);
  const existingUser = await authRepository.findUserByEmail(validated.email);
  if (existingUser) {
    throw new AuthError("该邮箱已注册", "EMAIL_EXISTS", 409);
  }

  const { rawToken, session } = buildSessionData(metadata);
  const user = await authRepository.createUserWithSession({
    user: {
      email: validated.email,
      displayName: validated.displayName,
      passwordHash: hashPassword(validated.password),
    },
    session,
  });

  return { rawToken, user: toCurrentUser(user) };
}
