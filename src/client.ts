import { KNOWN_POSES, Poses, type KnownPose } from "@/generated/poses.js";
import { errorFromResponse, SkinApiError } from "@/errors.js";

export const DEFAULT_BASE_URL = "https://api.createrington.com";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_USER_AGENT = "createrington-skin-api";
const BACKOFF_BASE_MS = 200;
const BACKOFF_MAX_MS = 5_000;

/**
 * A pose name. Autocompletes to a {@link KnownPose}, but any string is
 * accepted so poses added to the server after this SDK release still work.
 */
export type PoseName = KnownPose | (string & {});

/** The skin to render. Provide exactly one variant. */
export type SkinSource =
  | {
      /** Mojang UUID; the official skin is resolved server-side. */
      uuid: string;
    }
  | {
      /** Mojang username; the current skin is resolved server-side. */
      username: string;
    }
  | {
      /** Public URL to a 64x64 PNG skin. */
      skinUrl: string;
    }
  | {
      /** Base64-encoded 64x64 PNG (with or without a data URL prefix). */
      skinBase64: string;
    }
  | {
      /** Raw 64x64 PNG bytes, sent as `multipart/form-data`. */
      png: Uint8Array;
    };

/** Optional render tuning. Unset values fall back to server defaults. */
export interface RenderOptions {
  /**
   * Force slim ("Alex") arm geometry. When omitted, the server uses the
   * skin's own model metadata.
   */
  slim?: boolean;
  /**
   * Draw a contrasting outline around the rendered figure. Off by default;
   * omitted from the request entirely unless `true`.
   */
  outline?: boolean;
  /** Output width in pixels. Default `400`; clamped to 64..2048. */
  width?: number;
  /** Output height in pixels. Default `600`; clamped to 64..2048. */
  height?: number;
}

/** Arguments to {@link SkinApi.render}. */
export interface RenderParams {
  /** The pose to render, e.g. `"wave"`. See {@link KNOWN_POSES}. */
  pose: PoseName;
  /** The skin to render; exactly one source. */
  source: SkinSource;
  /** Optional render tuning (slim, outline, width, height). */
  options?: RenderOptions;
  /** An `AbortSignal` to cancel the request. */
  signal?: AbortSignal;
}

/** Options for the {@link SkinApi} constructor. */
export interface SkinApiOptions {
  /** Your API key. Required. Sent as `Authorization: Bearer <apiKey>`. */
  apiKey: string;
  /** API base URL. Default `"https://api.createrington.com"`. */
  baseUrl?: string;
  /** Per-request timeout in milliseconds. Default `30_000`. */
  timeoutMs?: number;
  /**
   * Number of retries for `429`/`502`/`503`/`504` responses and network
   * errors, with exponential backoff. Default `2`.
   */
  retries?: number;
  /**
   * `User-Agent` header value. Default `"createrington-skin-api"`. Ignored in
   * browser-like environments, where `User-Agent` is a forbidden header.
   */
  userAgent?: string;
  /** A custom `fetch` implementation. Default `globalThis.fetch`. */
  fetch?: typeof fetch;
}

/**
 * Client for the Createrington Skin API. Create one and reuse it.
 *
 * @example
 * ```ts
 * const api = new SkinApi({ apiKey: process.env.SKIN_API_KEY! });
 * const png = await api.render({ pose: "wave", source: { uuid } });
 * ```
 */
export class SkinApi {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly userAgent: string;
  private readonly fetchImpl: typeof fetch;

  /** @param opts - Client options. Only {@link SkinApiOptions.apiKey} is required. */
  constructor(opts: SkinApiOptions) {
    if (!opts.apiKey) throw new Error("SkinApi: apiKey is required");
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.retries = opts.retries ?? DEFAULT_RETRIES;
    this.userAgent = opts.userAgent ?? DEFAULT_USER_AGENT;
    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
  }

  /**
   * Render a pose for the given skin source and return the PNG bytes.
   *
   * Retries `429`/`502`/`503`/`504` and network errors per the `retries`
   * option, honouring a `429` `retryAfterMs` when present.
   *
   * @param params - Pose, skin source, and optional tuning. See {@link RenderParams}.
   * @returns The rendered PNG image as a `Uint8Array`.
   * @throws {SkinApiError} On any non-2xx response, network error, timeout, or abort.
   * @example
   * ```ts
   * const png = await api.render({
   *   pose: "wave",
   *   source: { username: "Notch" },
   *   options: { slim: true, width: 512, height: 768 },
   * });
   * ```
   */
  async render(params: RenderParams): Promise<Uint8Array> {
    const headers: Record<string, string> = this.authHeaders();

    const getSource = querySource(params.source);
    let method: "GET" | "POST";
    let body: BodyInit | undefined;
    if (getSource) {
      method = "GET";
    } else {
      method = "POST";
      const built = buildRenderBody(params.source);
      body = built.body;
      if (built.contentType) headers["content-type"] = built.contentType;
    }

    const query = buildQuery(params.pose, params.options, getSource);
    const url = `${this.baseUrl}/v1/render${query}`;

    const res = await this.request(url, {
      method,
      headers,
      body,
      signal: params.signal,
    });
    const ab = await res.arrayBuffer();
    return new Uint8Array(ab);
  }

  private authHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.apiKey}`,
    };
    // User-Agent is a Forbidden header name for fetch in browsers and Web
    // Workers; setting it makes the underlying fetch throw a TypeError
    // before any request is sent. Server-side runtimes (Node, Bun, Deno
    // node-compat) allow it and benefit from the identifier.
    if (!isBrowserLikeEnv()) {
      headers["user-agent"] = this.userAgent;
    }
    return headers;
  }

  private async request(
    url: string,
    init: {
      method: string;
      headers: Record<string, string>;
      body?: BodyInit;
      signal?: AbortSignal;
    },
  ): Promise<Response> {
    let attempt = 0;
    for (;;) {
      if (init.signal?.aborted) throw abortedFromSignal(init.signal);

      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), this.timeoutMs);
      const signal = init.signal
        ? AbortSignal.any([init.signal, ac.signal])
        : ac.signal;
      let res: Response;
      try {
        res = await this.fetchImpl(url, {
          method: init.method,
          headers: init.headers,
          body: init.body,
          signal,
        });
      } catch (err) {
        clearTimeout(timer);
        // A user-initiated abort short-circuits retries and surfaces as
        // a distinct "aborted" code so consumers can tell their own
        // cancellation apart from the SDK's internal timeoutMs.
        if (init.signal?.aborted) throw abortedFromSignal(init.signal);
        const timedOut = isAbortError(err);
        if (attempt < this.retries) {
          await sleep(backoffMs(attempt));
          attempt++;
          continue;
        }
        if (timedOut) {
          throw new SkinApiError(
            `Request timed out after ${this.timeoutMs}ms`,
            {
              code: "timeout",
              status: 0,
            },
          );
        }
        throw new SkinApiError(
          err instanceof Error ? err.message : "Network error",
          { code: "network_error", status: 0 },
        );
      }
      clearTimeout(timer);

      if (res.ok) return res;

      const status = res.status;
      const body = await readJsonSafely(res);

      if (isRetryableStatus(status) && attempt < this.retries) {
        if (init.signal?.aborted) throw abortedFromSignal(init.signal);
        await sleep(retryDelay(status, body, attempt));
        attempt++;
        continue;
      }

      throw errorFromResponse(status, body);
    }
  }
}

function abortedFromSignal(signal: AbortSignal): SkinApiError {
  const reason = signal.reason;
  const message =
    reason instanceof Error
      ? reason.message
      : typeof reason === "string"
        ? reason
        : "Request aborted";
  return new SkinApiError(message, { code: "aborted", status: 0 });
}

function buildQuery(
  pose: string,
  options: RenderOptions | undefined,
  source?: QuerySource,
): string {
  const params = new URLSearchParams();
  params.set("pose", pose);
  if (options?.slim !== undefined)
    params.set("slim", options.slim ? "true" : "false");
  if (options?.outline) params.set("outline", "true");
  if (options?.width !== undefined) params.set("width", String(options.width));
  if (options?.height !== undefined)
    params.set("height", String(options.height));
  if (source) params.set(source.key, source.value);
  return `?${params.toString()}`;
}

interface QuerySource {
  key: "uuid" | "username";
  value: string;
}

// uuid/username carry no payload, so they ride in the query (GET); others POST a body.
function querySource(source: SkinSource): QuerySource | undefined {
  if ("uuid" in source) return { key: "uuid", value: source.uuid };
  if ("username" in source) return { key: "username", value: source.username };
  return undefined;
}

interface BuiltBody {
  body: BodyInit;
  contentType: string | undefined;
}

function buildRenderBody(source: SkinSource): BuiltBody {
  if ("png" in source) {
    const form = new FormData();
    const blob = new Blob([source.png as BlobPart], { type: "image/png" });
    form.append("skin", blob, "skin.png");
    return { body: form, contentType: undefined };
  }
  return {
    body: JSON.stringify(source),
    contentType: "application/json",
  };
}

function isBrowserLikeEnv(): boolean {
  const g = globalThis as {
    window?: unknown;
    document?: unknown;
    importScripts?: unknown;
  };
  return (
    typeof g.window !== "undefined" ||
    typeof g.document !== "undefined" ||
    typeof g.importScripts === "function"
  );
}

function isAbortError(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === "object" &&
    "name" in err &&
    (err as { name: unknown }).name === "AbortError"
  );
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

function retryDelay(status: number, body: unknown, attempt: number): number {
  if (status === 429 && body && typeof body === "object" && "error" in body) {
    const err = (body as { error?: { retryAfterMs?: unknown } }).error;
    if (err && typeof err.retryAfterMs === "number") return err.retryAfterMs;
  }
  return backoffMs(attempt);
}

function backoffMs(attempt: number): number {
  const exp = BACKOFF_BASE_MS * Math.pow(2, attempt);
  const capped = Math.min(exp, BACKOFF_MAX_MS);
  const jitter = capped * 0.25 * Math.random();
  return capped + jitter;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJsonSafely(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}

export { KNOWN_POSES, Poses, type KnownPose };
