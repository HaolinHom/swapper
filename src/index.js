import { Command } from 'commander';
import { fetchSwagger, parseSwagger } from './swagger.js';
import { generate } from './generator.js';
import { mergeTypes, mergeFunctions } from './merger.js';
import fs from 'fs';
import path from 'path';

const program = new Command();

program
  .name('swapper')
  .description('从swagger生成ts接口定义')
  .requiredOption('-u, --url <url>', 'swagger文档地址')
  .requiredOption('-t, --tag <tags>', '需要生成的接口，Controller名称或接口Method-地址，多个用逗号分隔')
  .requiredOption('-d, --dir <dir>', '生成文件存放目录')
  .requiredOption('-r, --request <request>', '请求函数导入语句')
  .option('--out-type <type>', '生成文件类型', 'ts')
  .option('-p, --prefix <prefix>', 'URL前缀，生成的接口URL会拼接此前缀')
  .option('--force', '全量覆盖，不进行增量合并');

program.parse();

const options = program.opts();

async function main() {
  try {
    // 解析 tag 参数
    const tags = options.tag.split(',').map(t => t.trim());

    // 获取 swagger 文档
    console.log('正在获取swagger文档...');
    const swaggerData = await fetchSwagger(options.url);

    // 解析 swagger
    console.log('正在解析swagger...');
    const parsed = parseSwagger(swaggerData, tags);

    // 生成代码
    console.log('正在生成代码...');
    const { typesCode, functionsCode } = await generate(parsed, {
      requestImport: options.request,
      outType: options.outType,
      prefix: options.prefix
    });

    // 确保目录存在
    const dirPath = path.resolve(options.dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    const typesPath = path.join(dirPath, 'types.ts');
    const indexPath = path.join(dirPath, 'index.ts');

    if (options.force) {
      // 全量覆盖
      fs.writeFileSync(typesPath, typesCode);
      fs.writeFileSync(indexPath, functionsCode);
      console.log(`生成成功: ${typesPath}, ${indexPath}`);
    } else {
      // 增量合并
      const existingTypes = fs.existsSync(typesPath) ? fs.readFileSync(typesPath, 'utf-8') : '';
      const existingFunctions = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf-8') : '';

      const mergedTypes = mergeTypes(existingTypes, typesCode);
      const mergedFunctions = mergeFunctions(existingFunctions, functionsCode, options.request);

      fs.writeFileSync(typesPath, mergedTypes);
      fs.writeFileSync(indexPath, mergedFunctions);
      console.log(`增量更新成功: ${typesPath}, ${indexPath}`);
    }
  } catch (error) {
    console.error('生成失败:', error.message);
    process.exit(1);
  }
}

main();
