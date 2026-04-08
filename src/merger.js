/**
 * 从现有文件中解析出类型定义
 */
export function parseExistingTypes(content) {
  const types = new Map();
  const typeOrder = []; // 保留类型定义的顺序

  if (!content) return { types, typeOrder };

  // 匹配所有 export interface 和 export type
  const exportRegex = /export\s+(interface\s+\w+\s*\{[^}]*\}|type\s+\w+\s*=\s*[^;]+;)/gs;
  const matches = [];
  let match;

  while ((match = exportRegex.exec(content)) !== null) {
    matches.push({
      index: match.index,
      length: match[0].length,
      fullMatch: match[0]
    });
  }

  // 提取类型定义
  for (const m of matches) {
    const typeNameMatch = m.fullMatch.match(/(?:interface|type)\s+(\w+)/);
    if (typeNameMatch) {
      const typeName = typeNameMatch[1];
      types.set(typeName, m.fullMatch);
      typeOrder.push(typeName);
    }
  }

  return { types, typeOrder };
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
    const type = existingTypes.get(name) || newTypes.get(name);
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
export function mergeFunctions(existingContent, newFunctionsContent, requestImport) {
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

  // 提取类型导入
  const typeImports = new Set();
  const funcMatchRegex = /Promise<(\w+)>/g;
  for (const [, func] of sortedFunctions) {
    let match;
    while ((match = funcMatchRegex.exec(func)) !== null) {
      typeImports.add(match[1]);
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
