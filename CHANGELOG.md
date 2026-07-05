# createrington-skin-api (TypeScript)

This changelog tracks the Createrington Skin API TypeScript SDK. A release
publishes to npm when a version bump is merged to `main`.

## v2.6.0

### Added

- `resolve({ uuid } | { username })`: resolves a player identity in either
  direction over `GET /v1/resolve` and returns the canonical profile, where
  `uuid` is always the dashed lowercase form and `username` carries the
  canonical casing (`null` only when a degraded fallback provider could not
  supply the name). Exactly one identifier is required; passing both or
  neither throws a client-side `SkinApiError` with `code: "bad_request"`.
  Resolutions do not count toward the volume quota, and lookups follow the
  server's resolution cache, so a recent name change can take up to a day to
  appear. Adds the `ResolveParams` and `ResolvedPlayer` exported types.
  Additive and non-breaking.

## v2.5.0

### Added

- `avatar({ source, options? })`: renders the flat 2D front-view avatar (the
  head's face with the hat layer composited on top) and returns the square PNG
  bytes. It takes the same `SkinSource` as `render` over the same GET/POST
  transport, with avatar-only `AvatarOptions` (`size`, default 64, clamped to
  8..512; `overlay`, default true, sent only when set to `false`). Adds the
  `AvatarOptions` and `AvatarParams` exported types. Additive and non-breaking.
- `idle` pose: regenerated `Poses`/`KNOWN_POSES` from the published OpenAPI
  document now include the new server-side `idle` pose.

## v2.4.0

### Changed

- `render()` now calls the API over HTTP `GET` for `uuid` and `username` sources
  (the identifier rides in the query string), so these renders are plain
  cacheable URLs. `skinUrl`, `skinBase64`, and PNG uploads still use `POST`. The
  public API is unchanged and the server supports both, so this is non-breaking.

## v2.3.3

### Fixed

- Repository links in the package metadata now point to the public GitHub
  repository instead of the internal Gitea host.

## v2.3.2

### Changed

- Relicensed under Apache-2.0 (previously unlicensed). The public API is unchanged.
- The SDK now lives in its own open-source repository, and `src/generated/poses.ts`
  is generated from the published OpenAPI document rather than from server-side files.
- Version aligned with the other Createrington Skin API SDKs (.NET, Python) so all
  clients share one version line.

## v2.3.1 (2026-06-03)

### Changed

- Boolean render params now serialize as `true`/`false` on the wire instead of
  `1`/`0` (`slim=true`, `outline=true`); `outline` is still omitted when off. The
  public API is unchanged (still booleans) and the server accepts both forms, so
  this is non-breaking.

## v2.3.0 (2026-06-03)

### Added

- `RenderOptions.outline`: optional boolean that draws a contrasting outline
  around the rendered figure. Off by default; the SDK sends `outline=1` only
  when `true` and omits the parameter otherwise. Additive and non-breaking.

## v2.2.0 (2026-06-01)

### Added

- `Poses`: named constants for every pose known to the SDK (e.g. `Poses.wave`),
  for discoverability and autocompletion. This is the recommended way to
  reference a pose by name. Additive and non-breaking.

### Changed

- Docs now lead with `Poses`. `KNOWN_POSES` and `KnownPose` remain exported for
  iteration and validation.

## v2.1.0 (2026-05-31)

### Added

- `randomPose()` returns a uniformly random pose name from `KNOWN_POSES`,
  typed as `KnownPose`. Additive and non-breaking.

## v2.0.0 (2026-05-30)

### Breaking

- Removed `listPoses()` along with the `PoseSummary` and
  `ListPosesOptions` types. The method only saved one round-trip over the
  bundled `KNOWN_POSES` list and shipped an unvalidated response cast, so
  it was not worth carrying in the public surface. Consumers who need the
  live catalogue (with descriptions and `hasCustomCamera`) can call
  `GET /v1/poses` directly. `KNOWN_POSES` / `KnownPose` still cover
  compile-time pose names, and `render` accepts any pose string so
  server-added poses keep working without an SDK upgrade.

## v1.0.0 (2026-05-27)

Initial public release on npm.

### Surface

- `SkinApi` class with `render({ pose, source, options? })` returning
  `Promise<Uint8Array>` and `listPoses()` returning the live pose
  catalogue from the server.
- `baseUrl` defaults to `https://api.createrington.com`; consumers
  only need to supply `apiKey`.
- `KNOWN_POSES` const array + `KnownPose` type generated from the
  server's pose data at SDK build time.
- Single `SkinApiError` class carrying `code`, `status`, and
  `retryAfterMs`.
- Browser-safe: uses `globalThis.fetch`, `FormData`, and
  `Uint8Array`. No Node-only imports.

### Behaviour

- Retries `429`, `502`, `503`, `504`, and network errors up to
  `retries` times (default 2) with exponential backoff + jitter.
- `429` responses honour `retryAfterMs` from the server body when
  present.
- Per-request timeout (`timeoutMs`, default 30s) via `AbortController`.
