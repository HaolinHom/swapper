import { parseExportedTypes } from './type-parser.js';

/**
 * 从现有文件中解析出类型定义
 */
export function parseExistingTypes(content) {
  return parseExportedTypes(content);
}

/**
 * 从现有 index.ts 中解析出函数定义
 */
export function parseExistingFunctions(content) {
  const functions = new Map();
  if (!content) return functions;

  // 匹配 export const functionName = ( ... ): Promise<ReturnType> => { ... }
  const funcRegex = /export\s+const\s+(\w+)\s*=\s*\([^)]*\)[^:]*:\s*Promise<[^>]+>\s*=>\s*\{[\s\S]*?\n\};/g;

  let match;
  while ((match = funcRegex.exec(content)) !== null) {
    functions.set(match[1], match[0]);
  }

  return functions;
}

/**
 * 合并类型定义
 */
export function mergeTypes(existingContent, newTypesContent) {
  const { types: existingTypes, typeOrder } = parseExistingTypes(existingContent);
  const { types: newTypes } = parseExistingTypes(newTypesContent);

  // 合并：新的覆盖旧的，同时收集所有类型名
  const allTypeNames = new Set([...existingTypes.keys(), ...newTypes.keys()]);

  // 按原有顺序重建类型定义，新的类型名追加到末尾
  const resultOrder = [];
  for (const name of typeOrder) {
    if (existingTypes.has(name)) {
      resultOrder.push(name);
      allTypeNames.delete(name);
    }
  }
  // 添加剩余的新类型（按字母顺序）
  const remainingTypes = [...allTypeNames].sort((a, b) => a.localeCompare(b));
  resultOrder.push(...remainingTypes);

  if (resultOrder.length === 0) {
    return newTypesContent;
  }

  // 重建类型代码
  const lines = ['// 类型定义\n'];

  for (const name of resultOrder) {
    const type = newTypes.get(name) || existingTypes.get(name);
    if (type) {
      lines.push(type);
      lines.push('');
    }
  }

  return lines.join('\n').trim() + '\n';
}

/**
 * 合并函数定义
 */
export function mergeFunctions(existingContent, newFunctionsContent, requestImport, allTypeNames = new Set()) {
  const existingFunctions = parseExistingFunctions(existingContent);
  const newFunctions = parseExistingFunctions(newFunctionsContent);

  // 合并：新的覆盖旧的
  for (const [name, func] of newFunctions) {
    existingFunctions.set(name, func);
  }

  if (existingFunctions.size === 0) {
    return newFunctionsContent;
  }

  // 重建函数代码
  const sortedFunctions = [...existingFunctions.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const lines = [];

  // 提取类型导入 - 从函数签名中提取所有可能的类型名
  const typeImports = new Set();
  // 匹配 Promise<...> 中的类型
  const promiseMatchRegex = /Promise<([^>]+)>/g;
  // 匹配参数类型如 data?: TypeName, params?: TypeName
  const paramMatchRegex = /(?:data|params|body)\?:\s*(\w+)/g;
  // 匹配其他参数类型如 id: TypeName, path?: TypeName
  const otherParamMatchRegex = /(?:id|path|data|params|body)\s*\??:\s*(\w+)/g;

  for (const [, func] of sortedFunctions) {
    let match;
    // 从 Promise 中提取
    while ((match = promiseMatchRegex.exec(func)) !== null) {
      const typeName = match[1].trim();
      if (allTypeNames.has(typeName)) {
        typeImports.add(typeName);
      }
    }
    // 从参数类型中提取
    while ((match = paramMatchRegex.exec(func)) !== null) {
      const typeName = match[1];
      if (allTypeNames.has(typeName)) {
        typeImports.add(typeName);
      }
    }
    // 从其他参数类型中提取
    while ((match = otherParamMatchRegex.exec(func)) !== null) {
      const typeName = match[1];
      if (allTypeNames.has(typeName)) {
        typeImports.add(typeName);
      }
    }
  }

  // 生成导入语句
  lines.push(requestImport);
  lines.push('');

  if (typeImports.size > 0) {
    const sortedImports = [...typeImports].sort((a, b) => a.localeCompare(b));
    lines.push(`import type { ${sortedImports.join(', ')} } from './types';`);
    lines.push('');
  }

  lines.push('// 接口函数\n');

  for (const [, func] of sortedFunctions) {
    lines.push(func);
    lines.push('');
  }

  return lines.join('\n').trim() + '\n';
}
