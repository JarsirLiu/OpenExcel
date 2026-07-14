export class AuthError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, code: string, statusCode = 400) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    this.statusCode = statusCode;
  }
}
