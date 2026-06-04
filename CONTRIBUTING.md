# Contributing

Thanks for your interest in improving the Createrington Skin API TypeScript client.
Issues and pull requests are welcome.

## Licensing of contributions

By submitting a pull request you agree that your contribution is licensed under
the project's [Apache-2.0](LICENSE) terms (per section 5 of the license). There
is no separate CLA to sign.

## Prerequisites

- Node.js 20 or newer.

```sh
npm install
npm run format:check
npm run lint
npm run typecheck
npm run build
npm test
```

A clean format, lint, typecheck, build, and a green test run are the bar a PR has
to clear. The build runs in `strict` mode, so a type error is a failure.

## Project layout

- `src/` is the published library (client, errors, poses).
- `test/` holds the Vitest suite (it runs against a stubbed `fetch`, so it needs
  no network or API key).
- `scripts/generate-poses.ts` regenerates `src/generated/poses.ts`.

`src/generated/poses.ts` is **generated, not hand-edited**. It is produced from
the published OpenAPI document. If you need to refresh it:

```sh
npm run generate:poses
```

Note that `render` accepts any pose string, so a new server-side pose works
without changing the SDK; `Poses` and `KNOWN_POSES` only provide build-time
names.

## Branching and pull requests

- Branch off `dev`, and open your PR against `dev`. `main` is the released
  branch; merges to it publish to npm.
- Use short, descriptive branch names like `feat/retry-jitter`,
  `fix/timeout-mapping`, `chore/bump-vitest`.
- Keep a PR focused on one change, and make sure the build, lint, typecheck, and
  tests pass.

## Commit messages

Use Conventional Commit style:

```
type(scope): description
```

- Types: `feat`, `fix`, `chore`, `refactor`, `docs`, `style`, `test`, `perf`.
- Scope is optional.
- Description is lowercase, imperative, and has no trailing period.

Examples:

```
feat: add cancellation support to render
fix: map 503 to upstream_unavailable
docs: document the AbortSignal option
```

## Code style

- Formatting is handled by Prettier; a husky pre-commit hook formats staged files
  automatically. You can also run `npm run format` or `npm run format:check`.
- Public types and methods carry TSDoc comments.
- Default to no comments; add one only when the reasoning is not obvious from the
  code itself.
- Avoid em dashes in code, comments, and docs; use commas, parentheses, colons,
  or hyphens.

## Reporting issues

Open an issue with a clear description and, where relevant, a minimal repro (the
pose, the skin source, the client options, and the observed vs expected result).
