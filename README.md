# swapper

从 Swagger/OpenAPI 文档生成 TypeScript 接口函数和类型定义的命令行工具。

生成结果默认输出到目标目录下的两个文件：

- `types.ts`：类型定义
- `index.ts`：接口函数

## 要求

- Node.js `>= 18`

## 安装

```bash
pnpm install
```

本地开发执行：

```bash
node bin/swapper.js --help
```

如果已经发布到 npm，也可以这样使用：

```bash
npx swapper --help
```

## 用法

```bash
swapper -u <swagger-url> -t <tags> -d <output-dir> -r <request-import> [options]
```

### 基础示例

按 Controller 生成：

```bash
swapper \
  -u https://mep-api-test.ur.com.cn/promotion/api/v2/api-docs \
  --tag activity \
  --dir ./api \
  --prefix /promotion/api \
  -r "import request from '@/utils/request';"
```

按具体接口生成：

```bash
swapper \
  -u https://mep-api-test.ur.com.cn/promotion/api/v2/api-docs \
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
  -u https://mep-api-test.ur.com.cn/promotion/api/v2/api-docs \
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
  -u https://mep-api-test.ur.com.cn/promotion/api/v2/api-docs \
  --tag activity \
  --dir ./api \
  --prefix /promotion/api \
  -r "import request from '@/utils/request';"
```
