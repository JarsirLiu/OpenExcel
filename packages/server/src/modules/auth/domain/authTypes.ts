export interface CurrentUserContext {
  id: number;
  email: string;
  displayName: string;
}

export interface AuthCredentialsInput {
  email: string;
  password: string;
  displayName?: string;
}

export interface AuthRequestMetadata {
  userAgent: string | null;
  ipAddress: string | null;
}

export interface AuthenticatedUserResult {
  user: CurrentUserContext;
  rawToken: string;
}
