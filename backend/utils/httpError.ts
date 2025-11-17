export class HttpError extends Error {
  public statusCode: number;
  public details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const isHttpError = (error: unknown): error is HttpError =>
  error instanceof Error && typeof (error as HttpError).statusCode === "number";

export default HttpError;
