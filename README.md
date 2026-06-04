# createrington-skin-api

Official TypeScript client for the Createrington Skin API. Renders Minecraft
player skins into named poses and returns PNG bytes.

```sh
npm install createrington-skin-api
```

> Access is invite-only. Request an API key at https://api.createrington.com.

## Quickstart

```ts
import { SkinApi } from "createrington-skin-api";

const api = new SkinApi({ apiKey: process.env.SKIN_API_KEY! });

// Render a known pose for a Minecraft account by UUID.
const png = await api.render({
  pose: "wave",
  source: { uuid: "069a79f444e94726a5befca90e38aaf5" },
});

// `png` is a Uint8Array of PNG bytes. In Node:
import { writeFile } from "node:fs/promises";
await writeFile("notch-waving.png", png);

// In the browser:
const url = URL.createObjectURL(new Blob([png], { type: "image/png" }));
document.querySelector("img")!.src = url;
```

## Constructor

```ts
new SkinApi({
  apiKey:    string,                    // required
  baseUrl?:  string,                    // default "https://api.createrington.com"
  timeoutMs?: number,                   // default 30_000
  retries?:  number,                    // default 2 (retries 429/502/503/504 and network errors)
  userAgent?: string,                   // default "createrington-skin-api"
  fetch?:    typeof globalThis.fetch,   // default globalThis.fetch
})
```

The SDK uses `globalThis.fetch` and `FormData`. It runs in Node 22+,
Bun, Deno, Cloudflare Workers, and modern browsers without polyfills.

## API

### `render({ pose, source, options? }): Promise<Uint8Array>`

Renders the given pose using the supplied skin source and returns the PNG
bytes.

```ts
type SkinSource =
  | { uuid: string } // Mojang UUID, resolved server-side
  | { username: string } // Mojang username, resolved server-side
  | { skinUrl: string } // public URL to a 64x64 PNG
  | { skinBase64: string } // base64-encoded 64x64 PNG (with or without data URL prefix)
  | { png: Uint8Array }; // raw 64x64 PNG bytes, sent as multipart/form-data

interface RenderOptions {
  slim?: boolean; // override slim/Alex arm geometry; default uses skin metadata
  outline?: boolean; // draw a contrasting outline around the figure; default off
  width?: number; // default 400 (64..2048)
  height?: number; // default 600 (64..2048)
}
```

```ts
// Render with a slim model and an outline.
const png = await api.render({
  pose: "wave",
  source: { username: "Notch" },
  options: { slim: true, outline: true },
});
```

`pose` is autocompleted to a `KnownPose` (e.g. `"wave"`, `"cheer"`), but any
string is accepted so newly added server poses work without an SDK upgrade.

### `Poses`

Named constants for every pose known to the SDK at publish time, so you can
reference one by name instead of a bare string:

```ts
import { Poses } from "createrington-skin-api";

const png = await api.render({
  pose: Poses.wave,
  source: { uuid: "069a79f444e94726a5befca90e38aaf5" },
});
```

`pose` accepts any string, so server-side poses added after this release still
work without an SDK upgrade; fetch `GET /v1/poses` directly if you need the
live catalogue with descriptions.

### `randomPose()`

Returns a uniformly random known pose name, typed as `KnownPose`.

```ts
import { randomPose } from "createrington-skin-api";

const png = await api.render({
  pose: randomPose(),
  source: { uuid: "069a79f444e94726a5befca90e38aaf5" },
});
```

## Errors

All non-2xx responses (and network/timeout failures) throw `SkinApiError`:

```ts
import { SkinApiError } from "createrington-skin-api";

try {
  await api.render({ pose: "wave", source: { uuid: "bad-uuid" } });
} catch (err) {
  if (err instanceof SkinApiError) {
    console.error(err.code, err.status, err.message);
    if (err.code === "rate_limited" && err.retryAfterMs) {
      // back off and retry
    }
  }
}
```

`err.code` is one of `"bad_request" | "unauthorized" | "forbidden" |
"not_found" | "conflict" | "unsupported_media_type" | "rate_limited" |
"internal" | "render_failed" | "upstream_unavailable" | "timeout" |
"aborted" | "network_error" | "unknown"`. `err.status` is the HTTP
status (or `0` for network/timeout/abort failures).

The SDK retries `429`, `502`, `503`, `504`, and network errors up to
`retries` times with exponential backoff. `429` responses honour
`retryAfterMs` from the server when present.

## Cancellation

`render` accepts an optional `AbortSignal`. Pass one when you need to
cancel a request that has become irrelevant (SPA route change, request
superseded by user input, server-side request cancellation):

```ts
const ac = new AbortController();
const inflight = api.render({
  pose: "wave",
  source: { uuid: "..." },
  signal: ac.signal,
});
ac.abort();
// inflight rejects with SkinApiError({ code: "aborted" })
```

User-initiated aborts surface as `code: "aborted"`. The SDK's own
`timeoutMs` continues to surface as `code: "timeout"`, so consumer
cancellation is always distinguishable from a request that simply
took too long.

## Building

```sh
npm install
npm run build
npm test
```

`npm run lint` and `npm run typecheck` are the other checks CI runs.

`src/generated/poses.ts` is generated from the published OpenAPI document
(fetched live, not committed from a snapshot):

```sh
npm run generate:poses
```

`render` accepts any pose string, so a new server-side pose works without an
SDK change; `Poses` and `KNOWN_POSES` only provide names known at build time.

## Contributing

Issues and pull requests are welcome. By submitting a contribution you agree it
is licensed under the project's Apache-2.0 terms (section 5 of the license); no
separate CLA is required.

## License

Apache-2.0. See [LICENSE](LICENSE).
