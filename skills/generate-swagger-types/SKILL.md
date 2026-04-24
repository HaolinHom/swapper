---
name: generate-swagger-types
description: Generate or update TypeScript API definitions from Swagger/OpenAPI documents with the `swapper` CLI. Use when Codex or Claude Code needs to pull interfaces from a Swagger URL, generate or refresh `types.ts` and `index.ts`, select controllers or individual `METHOD-/path` endpoints, or choose between incremental merge and full overwrite for generated API files.
---

# Generate Swagger Types

## Overview

Use the `swapper` CLI to fetch a Swagger/OpenAPI document and generate request functions plus TypeScript types.
Prefer this skill when the user wants generated API files instead of handwritten wrappers.
Assume `swapper` may already be installed globally even if the current repo does not contain a local binary or dependency entry.

## Gather Inputs

Collect these values before running the generator:

- Swagger/OpenAPI document URL
- Tag selectors passed with `--tag`
- Output directory passed with `--dir`
- Request import statement passed with `--request`
- Optional URL prefix passed with `--prefix`
- Whether to preserve existing generated code or overwrite with `--force`

Ask only if a required value cannot be inferred from the repo or the user request. The CLI requires `--url`, `--tag`, `--dir`, and `--request`.

## Choose Selectors

Support these selector forms in `--tag`:

- Controller name such as `activity`
- Endpoint selector such as `GET-/calcProcessConfig`
- Mixed selectors separated by commas such as `activity,POST-/calcProcessConfig`

Treat any selector containing `-` as a `METHOD-/path` pair. Treat other selectors as Swagger tag names.

## Run The CLI

Always try the globally installed command first.
If availability is unclear, run `swapper --help` to confirm before deciding that the CLI is unavailable.
Do not give up only because the current project does not contain a local `swapper` dependency or binary.

Prefer the installed command when available:

```bash
swapper generate \
  -u <swagger-url> \
  -t <tag1,tag2> \
  -d <output-dir> \
  -r "<request-import>" \
  [--prefix <url-prefix>] \
  [--out-type ts] \
  [--force]
```

Use the repo-local entrypoint when working inside this project and the command is not installed globally:

```bash
node bin/swapper.js generate \
  -u <swagger-url> \
  -t <tag1,tag2> \
  -d <output-dir> \
  -r "<request-import>"
```

Prefer `--out-type ts` unless the user explicitly asks for JS output.

## Choose Merge Mode

Use incremental merge by default.
In incremental mode, `swapper` reads existing `types.ts` and `index.ts`, merges newly generated types and functions, and overwrites same-name exports with the latest definitions.

Use `--force` only when the user wants a full regeneration or when stale generated output should be discarded.

## Verify Output

Expect the output directory to contain:

- `types.ts` for generated type definitions
- `index.ts` for generated request functions

After generation:

- Confirm the command succeeded
- Inspect the generated files for the expected controllers or endpoints
- Mention whether the run used incremental merge or `--force`
- Summarize the files changed and any assumptions made about selectors, prefix, or request import

## Debug Failures

If generation fails, check these points in order:

- Verify whether `swapper --help` succeeds before assuming the CLI is missing
- Verify the Swagger URL is reachable and returns JSON
- Verify each selector matches either a Swagger tag or an exact `METHOD-/path`
- Verify the request import string is valid code for the target project
- Verify the output directory is correct for the consumer project
- If the global command is unavailable, retry with `node bin/swapper.js generate ...` only when the current repo actually contains the CLI source
- Retry with a narrower selector when isolating a bad endpoint
