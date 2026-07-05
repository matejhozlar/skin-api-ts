/** Categorises a {@link SkinApiError}. `"timeout"`, `"aborted"`, and
 * `"network_error"` are client-side (`"bad_request"` can be too, for invalid
 * arguments); the rest map from HTTP responses. */
export type SkinApiErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "unsupported_media_type"
  | "rate_limited"
  | "internal"
  | "render_failed"
  | "upstream_unavailable"
  | "timeout"
  | "aborted"
  | "network_error"
  | "unknown";

/** Thrown for every non-2xx response and for network/timeout/abort failures. */
export class SkinApiError extends Error {
  /** Categorised error code. */
  readonly code: SkinApiErrorCode;
  /** HTTP status code, or `0` for client-side failures. */
  readonly status: number;
  /** Server-suggested retry delay in milliseconds, when a `429` provides one. */
  readonly retryAfterMs: number | undefined;

  constructor(
    message: string,
    options: {
      code: SkinApiErrorCode;
      status: number;
      retryAfterMs?: number;
    },
  ) {
    super(message);
    this.name = "SkinApiError";
    this.code = options.code;
    this.status = options.status;
    this.retryAfterMs = options.retryAfterMs;
  }
}

const STATUS_TO_CODE: Record<number, SkinApiErrorCode> = {
  400: "bad_request",
  401: "unauthorized",
  403: "forbidden",
  404: "not_found",
  409: "conflict",
  415: "unsupported_media_type",
  429: "rate_limited",
  500: "internal",
  502: "upstream_unavailable",
  503: "upstream_unavailable",
  504: "upstream_unavailable",
};

const KNOWN_CODES: ReadonlySet<SkinApiErrorCode> = new Set([
  "bad_request",
  "unauthorized",
  "forbidden",
  "not_found",
  "conflict",
  "unsupported_media_type",
  "rate_limited",
  "internal",
  "render_failed",
  "upstream_unavailable",
  "timeout",
  "aborted",
  "network_error",
  "unknown",
]);

interface ServerErrorBody {
  error?: {
    code?: unknown;
    message?: unknown;
    retryAfterMs?: unknown;
  };
}

// The server emits codes in UPPER_SNAKE (NOT_FOUND, RATE_LIMITED). The SDK
// type and README document the lower_snake form (not_found, rate_limited).
// Lowercase and validate against the documented enum so consumer code
// like `if (err.code === "rate_limited")` actually matches.
function normalizeServerCode(raw: string): SkinApiErrorCode | undefined {
  const lowered = raw.toLowerCase() as SkinApiErrorCode;
  return KNOWN_CODES.has(lowered) ? lowered : undefined;
}

export function errorFromResponse(status: number, body: unknown): SkinApiError {
  const info = (body as ServerErrorBody | undefined)?.error;
  const messageFromBody =
    info && typeof info.message === "string" ? info.message : undefined;
  const codeFromBody =
    info && typeof info.code === "string"
      ? normalizeServerCode(info.code)
      : undefined;
  const retryAfterMs =
    info && typeof info.retryAfterMs === "number"
      ? info.retryAfterMs
      : undefined;

  return new SkinApiError(messageFromBody ?? `HTTP ${status}`, {
    code: codeFromBody ?? STATUS_TO_CODE[status] ?? "unknown",
    status,
    retryAfterMs,
  });
}
