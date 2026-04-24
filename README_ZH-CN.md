# swapper

从 Swagger/OpenAPI 文档生成 TypeScript 接口函数和类型定义的命令行工具。

生成结果默认输出到目标目录下的两个文件：

- `types.ts`：类型定义
- `index.ts`：接口函数

## 要求

- Node.js `>= 18`

## 安装

本地开发安装：

```bash
pnpm install

pnpm link
```

全局安装命令为：

```bash
npm install -g @aircan/swapper
```

运行 CLI 命令：

```bash
swapper --help
```

也可以直接运行已发布的包：

```bash
npx @aircan/swapper --help
```

安装内置 skill 到 Codex 或 Claude Code：

```bash
swapper install-skill
```

命令会在终端打开交互选项，可用方向键选择 Codex 或 Claude Code。

当 Agent 使用这个 skill 时，预期行为是优先尝试已经全局安装的 `swapper` 命令。如果不确定命令是否可用，应先运行 `swapper --help` 验证，再决定是否回退到仓库内的本地入口。

## 用法

```bash
swapper -u <swagger-url> -t <tags> -d <output-dir> -r <request-import> [options]
```

也支持显式子命令写法：

```bash
swapper generate -u <swagger-url> -t <tags> -d <output-dir> -r <request-import> [options]
```

### 基础示例

按 Controller 生成：

```bash
swapper \
  -u https://swagger-page.com/promotion/api/v2/api-docs \
  --tag activity \
  --dir ./api \
  --prefix /promotion/api \
  -r "import request from '@/utils/request';"
```

按具体接口生成：

```bash
swapper \
  -u https://swagger-page.com/promotion/api/v2/api-docs \
  --tag GET-/calcProcessConfig,POST-/calcProcessConfig \
  --dir ./api \
  --prefix /promotion/api \
  -r "import request from '@/utils/request';"
```

混合生成：

```bash
swapper \
  -u https://petstore.swagger.io/v2/swagger.json \
  --tag DyLkProductMapping,POST-/dyLkProductMapping \
  --dir ./src/services \
  -r "import { request } from 'umi';"
```

## 参数

| 参数 | 简写 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `--url` | `-u` | 是 | 无 | Swagger 文档地址 |
| `--tag` | `-t` | 是 | 无 | 需要生成的接口。支持 Controller 名称或 `METHOD-/path`，多个用逗号分隔 |
| `--dir` | `-d` | 是 | 无 | 输出目录 |
| `--request` | `-r` | 是 | 无 | 请求函数导入语句 |
| `--out-type` |  | 否 | `ts` | 生成文件类型，当前支持 `ts`、`js` |
| `--prefix` | `-p` | 否 | 无 | 给生成的接口地址统一追加前缀 |
| `--force` |  | 否 | `false` | 全量覆盖输出文件，不做增量合并 |

## 安装 Skill

安装包内置的 `generate-swagger-types` skill 到当前机器的 Codex 或 Claude Code：

```bash
swapper install-skill
```

命令会在终端打开 Codex 或 Claude Code 的交互选项。选择 Codex 时会安装到：

```text
${CODEX_HOME:-~/.codex}/skills/generate-swagger-types
```

选择 Claude Code 时会安装到：

```text
${CLAUDE_CONFIG_DIR:-~/.claude}/skills/generate-swagger-types
```

如果想跳过交互，可以传入 `--agent`：

```bash
swapper install-skill --agent claude-code
```

可选参数：

| 参数 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `--agent` | 否 | 交互终端中打开选项列表；非交互终端默认 `codex` | 目标 Agent，支持 `codex`、`claude-code`、`claude` |
| `--dest` | 否 | 根据 `--agent` 决定 | 自定义 skill 安装根目录 |
| `--force` | 否 | `true` | 如果目标目录已存在则覆盖 |
| `--no-force` | 否 | `false` | 如果目标 skill 已存在则报错，不覆盖 |

示例：

```bash
swapper install-skill --dest ~/.codex/skills
swapper install-skill --agent claude-code
swapper install-skill --no-force
```

安装完成后，重启 Codex 或 Claude Code 以加载新 skill。

## 生成行为

默认是增量合并模式：

- 会读取已有的 `types.ts` 和 `index.ts`
- 新生成的类型会合并进 `types.ts`
- 新生成的函数会合并进 `index.ts`
- 已有同名类型和函数会被新的定义覆盖

使用 `--force` 时：

- 直接覆盖目标目录下的 `types.ts` 和 `index.ts`

## 输出示例

执行：

```bash
swapper \
  -u https://swagger-page.com/promotion/api/v2/api-docs \
  --tag activity \
  --dir ./api \
  --prefix /promotion/api \
  -r "import request from '@/utils/request';"
```

会在 `./api` 下生成：

```text
api/
├── index.ts
└── types.ts
```

其中：

- `types.ts` 包含响应体、请求体、query 参数等类型定义
- `index.ts` 包含请求函数和 `import type` 引入

## 开发

查看帮助：

```bash
node bin/swapper.js --help
```

直接运行：

```bash
node bin/swapper.js \
  -u https://swagger-page.com/promotion/api/v2/api-docs \
  --tag activity \
  --dir ./api \
  --prefix /promotion/api \
  -r "import request from '@/utils/request';"
```
