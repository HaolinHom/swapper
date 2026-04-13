import { Command } from 'commander';
import { fetchSwagger, parseSwagger } from './swagger.js';
import { generate } from './generator.js';
import { mergeTypes, mergeFunctions, parseExistingTypes } from './merger.js';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const program = new Command();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SKILL_NAME = 'generate-swagger-types';
const KNOWN_COMMANDS = new Set(['generate', 'install-skill', 'help', '-h', '--help']);

program.name('swapper').description('从swagger生成ts接口定义');
program.addHelpText(
  'after',
  '\n兼容旧用法:\n  swapper -u <swagger-url> -t <tags> -d <output-dir> -r <request-import>\n'
);

program
  .command('generate')
  .description('从swagger生成ts接口定义')
  .requiredOption('-u, --url <url>', 'swagger文档地址')
  .requiredOption('-t, --tag <tags>', '需要生成的接口，Controller名称或接口Method-地址，多个用逗号分隔')
  .requiredOption('-d, --dir <dir>', '生成文件存放目录')
  .requiredOption('-r, --request <request>', '请求函数导入语句')
  .option('--out-type <type>', '生成文件类型', 'ts')
  .option('-p, --prefix <prefix>', 'URL前缀，生成的接口URL会拼接此前缀')
  .option('--force', '全量覆盖，不进行增量合并')
  .action(async options => {
    await generateTypes(options);
  });

program
  .command('install-skill')
  .description('安装内置的 Codex skill 到本地 Agent')
  .option('--dest <dir>', 'skill 安装根目录，默认 $CODEX_HOME/skills 或 ~/.codex/skills')
  .option('--force', '覆盖已存在的同名 skill')
  .action(options => {
    installSkill(options);
  });

program.showHelpAfterError();

function getBundledSkillDir() {
  return path.resolve(__dirname, '..', 'skills', SKILL_NAME);
}

function getDefaultSkillRoot() {
  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  return path.join(codexHome, 'skills');
}

async function generateTypes(options) {
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
      const mergedTypeNames = new Set(parseExistingTypes(mergedTypes).typeOrder);
      const mergedFunctions = mergeFunctions(
        existingFunctions,
        functionsCode,
        options.request,
        mergedTypeNames
      );

      fs.writeFileSync(typesPath, mergedTypes);
      fs.writeFileSync(indexPath, mergedFunctions);
      console.log(`增量更新成功: ${typesPath}, ${indexPath}`);
    }
  } catch (error) {
    console.error('生成失败:', error.message);
    process.exit(1);
  }
}

function installSkill(options) {
  try {
    const bundledSkillDir = getBundledSkillDir();
    if (!fs.existsSync(bundledSkillDir)) {
      throw new Error(`未找到内置 skill: ${bundledSkillDir}`);
    }

    const skillRoot = path.resolve(options.dest || getDefaultSkillRoot());
    const targetSkillDir = path.join(skillRoot, SKILL_NAME);

    fs.mkdirSync(skillRoot, { recursive: true });

    if (fs.existsSync(targetSkillDir)) {
      if (!options.force) {
        throw new Error(`skill 已存在: ${targetSkillDir}，如需覆盖请使用 --force`);
      }
      fs.rmSync(targetSkillDir, { recursive: true, force: true });
    }

    fs.cpSync(bundledSkillDir, targetSkillDir, { recursive: true });

    console.log(`skill 安装成功: ${targetSkillDir}`);
    console.log('请重启 Codex 以加载新 skill。');
  } catch (error) {
    console.error('安装 skill 失败:', error.message);
    process.exit(1);
  }
}

function normalizeArgv(argv) {
  const args = argv.slice(2);
  if (args.length === 0) {
    return argv;
  }

  if (KNOWN_COMMANDS.has(args[0])) {
    return argv;
  }

  if (args[0].startsWith('-')) {
    return [...argv.slice(0, 2), 'generate', ...args];
  }

  return argv;
}

program.parseAsync(normalizeArgv(process.argv)).catch(error => {
  console.error(error.message);
  process.exit(1);
});
