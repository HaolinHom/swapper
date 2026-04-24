import { Command } from 'commander';
import { fetchSwagger, parseSwagger } from './swagger.js';
import { generate } from './generator.js';
import { mergeTypes, mergeFunctions, parseExistingTypes } from './merger.js';
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as readline from 'node:readline';
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
  .description('安装内置 skill 到本地 Agent')
  .option('-a, --agent <agent>', '目标 Agent：codex 或 claude-code；不指定时终端列表选择')
  .option('--dest <dir>', 'skill 安装根目录，默认根据 Agent 使用 ~/.codex/skills 或 ~/.claude/skills')
  .option('--force', '覆盖已存在的同名 skill（默认开启）', true)
  .option('--no-force', '如果目标 skill 已存在则报错，不覆盖')
  .action(async options => {
    await installSkill(options);
  });

program.showHelpAfterError();

function getBundledSkillDir() {
  return path.resolve(__dirname, '..', 'skills', SKILL_NAME);
}

const AGENT_CONFIGS = {
  codex: {
    displayName: 'Codex',
    envHome: 'CODEX_HOME',
    homeDir: '.codex'
  },
  'claude-code': {
    displayName: 'Claude Code',
    envHome: 'CLAUDE_CONFIG_DIR',
    homeDir: '.claude'
  }
};

const AGENT_CHOICES = [
  { value: 'codex', label: 'Codex' },
  { value: 'claude-code', label: 'Claude Code' }
];

function normalizeAgent(agent) {
  const normalized = String(agent || 'codex')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/_/g, '-');

  if (normalized === 'claude') {
    return 'claude-code';
  }

  if (AGENT_CONFIGS[normalized]) {
    return normalized;
  }

  throw new Error(`不支持的 Agent: ${agent}，可选值: codex, claude-code`);
}

function getDefaultSkillRoot(agent) {
  const config = AGENT_CONFIGS[agent];
  const agentHome = process.env[config.envHome] || path.join(os.homedir(), config.homeDir);
  return path.join(agentHome, 'skills');
}

async function promptAgent() {
  return new Promise(resolve => {
    const input = process.stdin;
    const output = process.stdout;
    const wasRaw = input.isRaw;
    let selectedIndex = 0;
    let renderedLines = 0;

    const render = () => {
      if (renderedLines > 0) {
        output.write(`\x1b[${renderedLines}F\x1b[0J`);
      }

      const lines = [
        '请选择要安装 skill 的 Agent（↑/↓ 选择，Enter 确认）:',
        ...AGENT_CHOICES.map((choice, index) => {
          const marker = index === selectedIndex ? '❯' : ' ';
          return `${marker} ${choice.label}`;
        })
      ];

      output.write(`${lines.join('\n')}\n`);
      renderedLines = lines.length;
    };

    const cleanup = () => {
      input.off('keypress', onKeypress);
      if (input.isTTY) {
        input.setRawMode(Boolean(wasRaw));
      }
      input.pause();
      output.write('\x1b[?25h');
    };

    const choose = index => {
      selectedIndex = index;
      cleanup();
      const choice = AGENT_CHOICES[selectedIndex];
      output.write(`已选择: ${choice.label}\n`);
      resolve(choice.value);
    };

    const onKeypress = (character, key = {}) => {
      if (key.ctrl && key.name === 'c') {
        cleanup();
        output.write('\n');
        process.exit(130);
      }

      if (key.name === 'up' || character === 'k') {
        selectedIndex = (selectedIndex - 1 + AGENT_CHOICES.length) % AGENT_CHOICES.length;
        render();
        return;
      }

      if (key.name === 'down' || character === 'j') {
        selectedIndex = (selectedIndex + 1) % AGENT_CHOICES.length;
        render();
        return;
      }

      if (key.name === 'return' || key.name === 'enter') {
        choose(selectedIndex);
        return;
      }

      if (/^\d$/.test(character)) {
        const choiceIndex = Number(character) - 1;
        if (AGENT_CHOICES[choiceIndex]) {
          choose(choiceIndex);
        }
      }
    };

    readline.emitKeypressEvents(input);
    if (input.isTTY) {
      input.setRawMode(true);
    }
    output.write('\x1b[?25l');
    input.on('keypress', onKeypress);
    input.resume();
    render();
  });
}

async function resolveInstallAgent(agent) {
  if (agent) {
    return normalizeAgent(agent);
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.log('未指定 Agent 且当前不是交互终端，默认安装到 Codex。');
    return 'codex';
  }

  return promptAgent();
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

async function installSkill(options) {
  try {
    const agent = await resolveInstallAgent(options.agent);
    const agentConfig = AGENT_CONFIGS[agent];
    const bundledSkillDir = getBundledSkillDir();
    if (!fs.existsSync(bundledSkillDir)) {
      throw new Error(`未找到内置 skill: ${bundledSkillDir}`);
    }

    const skillRoot = path.resolve(options.dest || getDefaultSkillRoot(agent));
    const targetSkillDir = path.join(skillRoot, SKILL_NAME);

    fs.mkdirSync(skillRoot, { recursive: true });

    if (fs.existsSync(targetSkillDir)) {
      if (!options.force) {
        throw new Error(`skill 已存在: ${targetSkillDir}，已启用 --no-force，不覆盖`);
      }
      fs.rmSync(targetSkillDir, { recursive: true, force: true });
    }

    fs.cpSync(bundledSkillDir, targetSkillDir, { recursive: true });

    console.log(`skill 已安装到 ${agentConfig.displayName}: ${targetSkillDir}`);
    console.log(`请重启 ${agentConfig.displayName} 以加载新 skill。`);
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
