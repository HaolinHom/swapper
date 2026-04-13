# swapper

A CLI tool for generating TypeScript API functions and type definitions from Swagger/OpenAPI documents.

By default, the generated output is written into two files inside the target directory:

- `types.ts`: type definitions
- `index.ts`: API request functions

## Requirements

- Node.js `>= 18`

## Installation

For local development:

```bash
pnpm install

pnpm link
```

Install it globally with:

```bash
npm install -g @aircan/swapper
```

Then run the CLI with:

```bash
swapper --help
```

You can also run the published package directly with:

```bash
npx @aircan/swapper --help
```

Install the built-in Codex skill:

```bash
swapper install-skill
```

## Usage

```bash
swapper -u <swagger-url> -t <tags> -d <output-dir> -r <request-import> [options]
```

An explicit subcommand form is also supported:

```bash
swapper generate -u <swagger-url> -t <tags> -d <output-dir> -r <request-import> [options]
```

### Basic Examples

Generate by controller:

```bash
swapper \
  -u https://mep-api-test.ur.com.cn/promotion/api/v2/api-docs \
  --tag activity \
  --dir ./api \
  --prefix /promotion/api \
  -r "import request from '@/utils/request';"
```

Generate specific endpoints:

```bash
swapper \
  -u https://mep-api-test.ur.com.cn/promotion/api/v2/api-docs \
  --tag GET-/calcProcessConfig,POST-/calcProcessConfig \
  --dir ./api \
  --prefix /promotion/api \
  -r "import request from '@/utils/request';"
```

Generate a mixed selection:

```bash
swapper \
  -u https://petstore.swagger.io/v2/swagger.json \
  --tag DyLkProductMapping,POST-/dyLkProductMapping \
  --dir ./src/services \
  -r "import { request } from 'umi';"
```

## Options

| Option | Short | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `--url` | `-u` | Yes | None | Swagger document URL |
| `--tag` | `-t` | Yes | None | Interfaces to generate. Supports controller names or `METHOD-/path`, separated by commas |
| `--dir` | `-d` | Yes | None | Output directory |
| `--request` | `-r` | Yes | None | Import statement for the request function |
| `--out-type` |  | No | `ts` | Output file type. Currently supports `ts` and `js` |
| `--prefix` | `-p` | No | None | Prefix appended to generated request URLs |
| `--force` |  | No | `false` | Fully overwrite output files instead of incremental merge |

## Install the Skill

Install the bundled `generate-swagger-types` skill into Codex on the current machine:

```bash
swapper install-skill
```

By default, it installs to:

```text
${CODEX_HOME:-~/.codex}/skills/generate-swagger-types
```

Optional flags:

| Option | Required | Default | Description |
| --- | --- | --- | --- |
| `--dest` | No | `$CODEX_HOME/skills` or `~/.codex/skills` | Custom skill installation root |
| `--force` | No | `false` | Overwrite the destination if the skill already exists |

Examples:

```bash
swapper install-skill --force
swapper install-skill --dest ~/.codex/skills
```

Restart Codex after installation so the new skill can be loaded.

## Generation Behavior

Incremental merge is the default mode:

- Existing `types.ts` and `index.ts` files are read first
- Newly generated types are merged into `types.ts`
- Newly generated functions are merged into `index.ts`
- Existing types and functions with the same name are replaced by the latest generated versions

When `--force` is used:

- `types.ts` and `index.ts` in the target directory are overwritten directly

## Output Example

Running:

```bash
swapper \
  -u https://mep-api-test.ur.com.cn/promotion/api/v2/api-docs \
  --tag activity \
  --dir ./api \
  --prefix /promotion/api \
  -r "import request from '@/utils/request';"
```

will generate:

```text
api/
├── index.ts
└── types.ts
```

Where:

- `types.ts` contains response, request body, and query parameter type definitions
- `index.ts` contains request functions and `import type` statements

## Development

Show help:

```bash
node bin/swapper.js --help
```

Run directly:

```bash
node bin/swapper.js \
  -u https://mep-api-test.ur.com.cn/promotion/api/v2/api-docs \
  --tag activity \
  --dir ./api \
  --prefix /promotion/api \
  -r "import request from '@/utils/request';"
```
