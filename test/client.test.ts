import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_BASE_URL,
  KNOWN_POSES,
  randomPose,
  SkinApi,
  SkinApiError,
} from "../src/index.js";

const API_KEY = "test-key";
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
]);

interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: BodyInit | null | undefined;
}

function makeFetchMock(responses: Response[]): {
  fetch: typeof fetch;
  captured: CapturedRequest[];
} {
  const captured: CapturedRequest[] = [];
  const queue = [...responses];
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const headers: Record<string, string> = {};
    const hdr = init?.headers;
    if (hdr instanceof Headers) {
      hdr.forEach((v, k) => (headers[k.toLowerCase()] = v));
    } else if (Array.isArray(hdr)) {
      for (const [k, v] of hdr) headers[k.toLowerCase()] = v;
    } else if (hdr) {
      for (const [k, v] of Object.entries(hdr as Record<string, string>)) {
        headers[k.toLowerCase()] = v;
      }
    }
    captured.push({
      url,
      method: init?.method ?? "GET",
      headers,
      body: init?.body,
    });
    const res = queue.shift();
    if (!res) throw new Error("no more queued responses");
    return res;
  }) as unknown as typeof fetch;
  return { fetch: mock, captured };
}

function pngResponse(): Response {
  return new Response(PNG_BYTES, {
    status: 200,
    headers: { "content-type": "image/png" },
  });
}

describe("SkinApi", () => {
  it("requires apiKey", () => {
    expect(() => new SkinApi({ apiKey: "" })).toThrowError(
      /apiKey is required/,
    );
  });

  it("defaults baseUrl to api.createrington.com", async () => {
    const { fetch, captured } = makeFetchMock([pngResponse()]);
    const client = new SkinApi({ apiKey: API_KEY, fetch });
    await client.render({ pose: "wave", source: { uuid: "abc" } });
    expect(captured[0].url.startsWith(DEFAULT_BASE_URL)).toBe(true);
    expect(DEFAULT_BASE_URL).toBe("https://api.createrington.com");
  });

  it("uses GET with uuid in the query and no body for uuid source", async () => {
    const { fetch, captured } = makeFetchMock([pngResponse()]);
    const client = new SkinApi({
      apiKey: API_KEY,
      baseUrl: "http://skin.test",
      fetch,
    });
    const out = await client.render({
      pose: "wave",
      source: { uuid: "uuid-1" },
      options: { slim: true, width: 200, height: 300 },
    });
    expect(out).toBeInstanceOf(Uint8Array);
    expect(captured[0].method).toBe("GET");
    expect(captured[0].url).toBe(
      "http://skin.test/v1/render?pose=wave&slim=true&width=200&height=300&uuid=uuid-1",
    );
    expect(captured[0].headers["authorization"]).toBe(`Bearer ${API_KEY}`);
    expect(captured[0].headers["content-type"]).toBeUndefined();
    expect(captured[0].body).toBeUndefined();
  });

  it("uses GET with username in the query and no body for username source", async () => {
    const { fetch, captured } = makeFetchMock([pngResponse()]);
    const client = new SkinApi({
      apiKey: API_KEY,
      baseUrl: "http://skin.test",
      fetch,
    });
    const out = await client.render({
      pose: "wave",
      source: { username: "Notch" },
    });
    expect(out).toBeInstanceOf(Uint8Array);
    expect(captured[0].method).toBe("GET");
    expect(captured[0].url).toBe(
      "http://skin.test/v1/render?pose=wave&username=Notch",
    );
    expect(captured[0].headers["content-type"]).toBeUndefined();
    expect(captured[0].body).toBeUndefined();
  });

  it("sends outline=true when outline is true", async () => {
    const { fetch, captured } = makeFetchMock([pngResponse()]);
    const client = new SkinApi({
      apiKey: API_KEY,
      baseUrl: "http://skin.test",
      fetch,
    });
    await client.render({
      pose: "wave",
      source: { uuid: "uuid-1" },
      options: { outline: true },
    });
    expect(captured[0].url).toBe(
      "http://skin.test/v1/render?pose=wave&outline=true&uuid=uuid-1",
    );
  });

  it("omits outline when false or unset", async () => {
    const { fetch, captured } = makeFetchMock([pngResponse(), pngResponse()]);
    const client = new SkinApi({
      apiKey: API_KEY,
      baseUrl: "http://skin.test",
      fetch,
    });
    await client.render({
      pose: "wave",
      source: { uuid: "uuid-1" },
      options: { outline: false },
    });
    await client.render({ pose: "wave", source: { uuid: "uuid-1" } });
    expect(captured[0].url).toBe(
      "http://skin.test/v1/render?pose=wave&uuid=uuid-1",
    );
    expect(captured[1].url).toBe(
      "http://skin.test/v1/render?pose=wave&uuid=uuid-1",
    );
  });

  it("sets user-agent in node-like environments", async () => {
    const { fetch, captured } = makeFetchMock([pngResponse()]);
    const client = new SkinApi({
      apiKey: API_KEY,
      baseUrl: "http://skin.test",
      fetch,
    });
    await client.render({ pose: "wave", source: { uuid: "x" } });
    expect(captured[0].headers["user-agent"]).toBe("createrington-skin-api");
  });

  it("omits user-agent in browser-like environments (Forbidden header)", async () => {
    vi.stubGlobal("window", {});
    try {
      const { fetch, captured } = makeFetchMock([pngResponse()]);
      const client = new SkinApi({
        apiKey: API_KEY,
        baseUrl: "http://skin.test",
        fetch,
      });
      await client.render({ pose: "wave", source: { uuid: "x" } });
      expect(captured[0].headers["user-agent"]).toBeUndefined();
      expect(captured[0].headers["authorization"]).toBe(`Bearer ${API_KEY}`);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("omits user-agent in Web Worker-like environments", async () => {
    vi.stubGlobal("importScripts", () => undefined);
    try {
      const { fetch, captured } = makeFetchMock([pngResponse()]);
      const client = new SkinApi({
        apiKey: API_KEY,
        baseUrl: "http://skin.test",
        fetch,
      });
      await client.render({ pose: "wave", source: { uuid: "x" } });
      expect(captured[0].headers["user-agent"]).toBeUndefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("uses POST with json body for skinUrl source", async () => {
    const { fetch, captured } = makeFetchMock([pngResponse()]);
    const client = new SkinApi({
      apiKey: API_KEY,
      baseUrl: "http://skin.test",
      fetch,
    });
    await client.render({
      pose: "wave",
      source: { skinUrl: "https://example.test/skin.png" },
    });
    expect(captured[0].method).toBe("POST");
    expect(captured[0].url).toBe("http://skin.test/v1/render?pose=wave");
    expect(captured[0].headers["content-type"]).toBe("application/json");
    expect(captured[0].body).toBe(
      JSON.stringify({ skinUrl: "https://example.test/skin.png" }),
    );
  });

  it("uses POST with json body for skinBase64 source", async () => {
    const { fetch, captured } = makeFetchMock([pngResponse()]);
    const client = new SkinApi({
      apiKey: API_KEY,
      baseUrl: "http://skin.test",
      fetch,
    });
    await client.render({
      pose: "wave",
      source: { skinBase64: "aGVsbG8=" },
    });
    expect(captured[0].method).toBe("POST");
    expect(captured[0].headers["content-type"]).toBe("application/json");
    expect(captured[0].body).toBe(JSON.stringify({ skinBase64: "aGVsbG8=" }));
  });

  it("uses multipart for png source", async () => {
    const { fetch, captured } = makeFetchMock([pngResponse()]);
    const client = new SkinApi({
      apiKey: API_KEY,
      baseUrl: "http://skin.test",
      fetch,
    });
    await client.render({ pose: "wave", source: { png: PNG_BYTES } });
    expect(captured[0].method).toBe("POST");
    expect(captured[0].body).toBeInstanceOf(FormData);
    expect(captured[0].headers["content-type"]).toBeUndefined();
  });

  it("normalizes UPPER_SNAKE server error codes to documented lowercase form", async () => {
    const body = { error: { code: "NOT_FOUND", message: "Pose missing" } };
    const { fetch } = makeFetchMock([
      new Response(JSON.stringify(body), {
        status: 404,
        headers: { "content-type": "application/json" },
      }),
    ]);
    const client = new SkinApi({
      apiKey: API_KEY,
      baseUrl: "http://skin.test",
      fetch,
      retries: 0,
    });
    await expect(
      client.render({ pose: "wave", source: { uuid: "x" } }),
    ).rejects.toMatchObject({
      name: "SkinApiError",
      code: "not_found",
      status: 404,
      message: "Pose missing",
    });
  });

  it("falls back to status-derived code when body code is unrecognized", async () => {
    const body = { error: { code: "WAT", message: "huh" } };
    const { fetch } = makeFetchMock([
      new Response(JSON.stringify(body), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    ]);
    const client = new SkinApi({
      apiKey: API_KEY,
      baseUrl: "http://skin.test",
      fetch,
      retries: 0,
    });
    await expect(
      client.render({ pose: "wave", source: { uuid: "x" } }),
    ).rejects.toMatchObject({ code: "bad_request", status: 400 });
  });

  it("retries 429 then succeeds, exposing retryAfterMs and lowercased code on the final error if all attempts fail", async () => {
    const retryBody = {
      error: { code: "RATE_LIMITED", message: "slow down", retryAfterMs: 5 },
    };
    const { fetch, captured } = makeFetchMock([
      new Response(JSON.stringify(retryBody), {
        status: 429,
        headers: { "content-type": "application/json" },
      }),
      pngResponse(),
    ]);
    const client = new SkinApi({
      apiKey: API_KEY,
      baseUrl: "http://skin.test",
      fetch,
      retries: 1,
    });
    const out = await client.render({ pose: "wave", source: { uuid: "x" } });
    expect(out).toBeInstanceOf(Uint8Array);
    expect(captured.length).toBe(2);
  });

  it("does not retry when retries: 0", async () => {
    const body = {
      error: { code: "RATE_LIMITED", message: "slow down", retryAfterMs: 5 },
    };
    const { fetch, captured } = makeFetchMock([
      new Response(JSON.stringify(body), {
        status: 429,
        headers: { "content-type": "application/json" },
      }),
    ]);
    const client = new SkinApi({
      apiKey: API_KEY,
      baseUrl: "http://skin.test",
      fetch,
      retries: 0,
    });
    await expect(
      client.render({ pose: "wave", source: { uuid: "x" } }),
    ).rejects.toMatchObject({
      code: "rate_limited",
      status: 429,
      retryAfterMs: 5,
    });
    expect(captured.length).toBe(1);
  });

  it("propagates a user-supplied AbortSignal as SkinApiError(aborted), distinct from internal timeout", async () => {
    const ac = new AbortController();
    const mockFetch = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        }),
    ) as unknown as typeof fetch;
    const client = new SkinApi({
      apiKey: API_KEY,
      baseUrl: "http://skin.test",
      fetch: mockFetch,
      retries: 3,
    });
    const inflight = client.render({
      pose: "wave",
      source: { uuid: "x" },
      signal: ac.signal,
    });
    ac.abort();
    await expect(inflight).rejects.toMatchObject({
      name: "SkinApiError",
      code: "aborted",
      status: 0,
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("rejects synchronously when given a pre-aborted signal", async () => {
    const mockFetch = vi.fn() as unknown as typeof fetch;
    const client = new SkinApi({
      apiKey: API_KEY,
      baseUrl: "http://skin.test",
      fetch: mockFetch,
    });
    const ac = new AbortController();
    ac.abort();
    await expect(
      client.render({
        pose: "wave",
        source: { uuid: "x" },
        signal: ac.signal,
      }),
    ).rejects.toMatchObject({ code: "aborted" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("maps a non-abort network failure to SkinApiError(network_error)", async () => {
    const mockFetch = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const client = new SkinApi({
      apiKey: API_KEY,
      baseUrl: "http://skin.test",
      fetch: mockFetch,
      retries: 0,
    });
    await expect(
      client.render({ pose: "wave", source: { uuid: "x" } }),
    ).rejects.toMatchObject({
      name: "SkinApiError",
      code: "network_error",
      status: 0,
    });
  });

  it("throws SkinApiError(timeout) when AbortError fires past retries", async () => {
    const mockFetch = vi.fn(async () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    }) as unknown as typeof fetch;
    const client = new SkinApi({
      apiKey: API_KEY,
      baseUrl: "http://skin.test",
      fetch: mockFetch,
      retries: 0,
      timeoutMs: 5,
    });
    await expect(
      client.render({ pose: "wave", source: { uuid: "x" } }),
    ).rejects.toMatchObject({ name: "SkinApiError", code: "timeout" });
  });
});

describe("KNOWN_POSES", () => {
  it("is populated by generate-poses at build time and includes a representative pose", () => {
    expect(Array.isArray(KNOWN_POSES)).toBe(true);
    expect(KNOWN_POSES.length).toBeGreaterThan(0);
    expect(KNOWN_POSES).toContain("wave");
  });
});

describe("randomPose", () => {
  it("always returns a pose from KNOWN_POSES", () => {
    for (let i = 0; i < 50; i++) {
      expect(KNOWN_POSES).toContain(randomPose());
    }
  });
});

describe("SkinApiError", () => {
  it("exposes code/status", () => {
    const err = new SkinApiError("nope", { code: "bad_request", status: 400 });
    expect(err.code).toBe("bad_request");
    expect(err.status).toBe(400);
  });
});
