import prettier from 'prettier';
import { extractExportedTypeNames } from './type-parser.js';

/**
 * 生成代码
 * @param {Object} parsed - 解析后的 swagger 数据
 * @param {Object} options - 生成选项
 */
export async function generate(parsed, options) {
  const { paths, definitions } = parsed;
  const { requestImport, outType, prefix } = options;

  const ext = outType === 'js' ? 'js' : 'ts';
  const isTs = ext === 'ts';

  // 收集所有额外生成的类型（如 query params interface）
  const allExtraTypes = [];

  // 生成类型定义代码
  let typesCode = '';
  if (isTs) {
    typesCode += '// 类型定义\n';
    typesCode += generateTypeDefinitions(definitions, paths);
  }

  // 生成接口函数代码
  let functionsCode = '';

  for (const item of paths) {
    const { code, extraTypes } = generateFunction(item, isTs, prefix);
    allExtraTypes.push(...extraTypes);
    functionsCode += code;
  }

  // 添加 Query 参数类型定义到 typesCode
  if (allExtraTypes.length > 0) {
    if (typesCode) typesCode += '\n';
    typesCode += '// Query 参数类型\n';
    typesCode += allExtraTypes.join('\n\n');
  }

  // 生成类型导入语句 - 从 typesCode 中提取所有类型名
  let importStatements = `${requestImport}\n\n`;
  const allTypeNames = new Set();
  if (isTs) {
    const uniqueTypeNames = extractExportedTypeNames(typesCode);
    for (const typeName of uniqueTypeNames) {
      allTypeNames.add(typeName);
    }
    if (uniqueTypeNames.length > 0) {
      importStatements += `import type { ${uniqueTypeNames.join(', ')} } from './types';\n\n`;
    }
  }

  // 格式化代码
  const formattedTypes = typesCode ? await formatCode(typesCode, ext) : '';
  const formattedFunctions = await formatCode(importStatements + functionsCode, ext);

  return {
    typesCode: formattedTypes,
    functionsCode: formattedFunctions,
    allTypeNames
  };
}

/**
 * 生成类型定义
 */
function generateTypeDefinitions(definitions, paths, isTs) {
  const types = [];
  const generatedRefs = new Set();

  // 已知的泛型包装器类型
  const knownGenericWrappers = new Set(['ResultVo', 'List', 'Pager', 'Set', 'Map', 'Array', 'Optional']);

  // 从泛型字符串中提取 ref 名称，如 ResultVo«List«支付渠道resDto»»
  const extractRefsFromGenericString = (str) => {
    if (typeof str !== 'string') return;

    // 使用栈匹配配对的 «» 或 <>
    const stack = [];
    let current = '';
    let i = 0;

    while (i < str.length) {
      const char = str[i];

      if (char === '«' || char === '<') {
        stack.push(current);
        current = '';
      } else if (char === '»' || char === '>') {
        if (stack.length > 0) {
          // 检查 current 是否是 swagger 的 $ref 格式
          const defMatch = current.match(/^#\/definitions\/(.+)$/);
          if (defMatch) {
            generatedRefs.add(defMatch[1]);
          } else if (!knownGenericWrappers.has(current) && current.trim()) {
            // 如果不是已知的泛型包装器，且不是空的，则可能是类型名
            generatedRefs.add(current.trim());
          }
          current = stack.pop();
        }
      } else {
        current += char;
      }
      i++;
    }
  };

  // 从路径参数和响应中收集引用的定义
  const collectRefs = (obj) => {
    if (!obj) return;

    // 处理泛型字符串格式（如 ResultVo«List«支付渠道resDto»»）
    if (typeof obj === 'string') {
      extractRefsFromGenericString(obj);
      return;
    }

    if (typeof obj !== 'object') return;

    if (obj.$ref) {
      const ref = obj.$ref;
      const match = ref.match(/^#\/definitions\/(.+)$/);
      if (match) {
        generatedRefs.add(match[1]);
      }
    }

    for (const value of Object.values(obj)) {
      collectRefs(value);
    }
  };

  for (const path of paths) {
    for (const param of path.parameters) {
      collectRefs(param.schema);
    }
    if (path.requestBody) {
      collectRefs(path.requestBody.content?.['application/json']?.schema);
    }
    for (const response of Object.values(path.responses)) {
      collectRefs(response.schema || response.content?.['application/json']?.schema);
    }
  }

  // 循环生成类型，直到没有新的引用
  let prevSize = -1;

  while (prevSize !== generatedRefs.size) {
    prevSize = generatedRefs.size;

    // 获取需要生成的类型列表
    const refsToGenerate = [...generatedRefs].filter(ref => {
      // 检查是否已经生成过该类型
      const pascalName = toPascalCase(ref);
      return !types.some(t => t.includes(`interface ${pascalName}`) || t.includes(`type ${pascalName}`));
    });

    for (const ref of refsToGenerate) {
      if (definitions[ref]) {
        // 收集该类型内部引用的定义
        collectRefs(definitions[ref]);
        const typeCode = generateDefinition(ref, definitions[ref], definitions, new Set());
        if (typeCode) {
          types.push(typeCode);
        }
      }
    }
  }

  return types.join('\n\n');
}

/**
 * 生成单个类型定义
 */
function generateDefinition(name, schema, definitions, visited = new Set()) {
  if (visited.has(name)) return '';
  visited.add(name);

  const type = schema.type;
  const format = schema.format;

  if (schema.$ref) {
    const refName = schema.$ref.replace('#/definitions/', '');
    return `export type ${toPascalCase(name)} = ${toPascalCase(refName)};`;
  }

  if (type === 'object' && schema.properties) {
    const props = [];
    for (const [propName, propSchema] of Object.entries(schema.properties)) {
      const required = schema.required?.includes(propName);
      const propType = resolveType(propSchema, definitions, visited);
      const optional = required ? '' : '?';
      const description = propSchema.description ? ` // ${propSchema.description}` : '';
      props.push(`  ${propName}${optional}: ${propType};${description}`);
    }
    return `export interface ${toPascalCase(name)} {\n${props.join('\n')}\n}`;
  }

  if (type === 'array' && schema.items) {
    return `export type ${toPascalCase(name)} = ${resolveType(schema.items, definitions, visited)}[];`;
  }

  // 基础类型
  const baseType = mapSchemaToTsType(type, format);
  return `export type ${toPascalCase(name)} = ${baseType};`;
}

/**
 * 解析类型
 */
function resolveType(schema, definitions, visited) {
  if (!schema) return 'unknown';

  if (schema.$ref) {
    const refName = schema.$ref.replace('#/definitions/', '');
    return toGenericTypeString(refName);
  }

  if (schema.type === 'array' && schema.items) {
    return `${resolveType(schema.items, definitions, visited)}[]`;
  }

  if (schema.type === 'object' && schema.properties) {
    const props = [];
    for (const [propName, propSchema] of Object.entries(schema.properties)) {
      const required = schema.required?.includes(propName);
      const propType = resolveType(propSchema, definitions, visited);
      const optional = required ? '' : '?';
      props.push(`${propName}${optional}: ${propType}`);
    }
    return `{ ${props.join(', ')} }`;
  }

  return mapSchemaToTsType(schema.type, schema.format);
}

/**
 * 生成接口函数
 */
function generateFunction(item, isTs, prefix = '') {
  const { path, method, summary, operationId, parameters, requestBody, responses } = item;
  const funcName = operationId || generateFunctionName(method, path);
  const params = [];
  const queryParams = [];
  const pathParams = [];
  const bodyParam = [];
  const extraTypes = [];

  // 完整的 URL
  const fullUrl = prefix ? `${prefix}${path}` : path;

  // 计算返回类型
  let returnType = 'any';
  if (isTs && responses) {
    const successResponse = responses['200'] || responses['201'] || responses.default;
    if (successResponse) {
      const schema = successResponse.schema || successResponse.content?.['application/json']?.schema;
      if (schema) {
        returnType = resolveType(schema, {}, new Set());
      }
    }
  }

  // 处理参数
  for (const param of parameters) {
    if (param.in === 'path') {
      pathParams.push(param);
    } else if (param.in === 'query') {
      queryParams.push(param);
    } else if (param.in === 'body') {
      bodyParam.push(param);
    }
  }

  // 处理 requestBody
  if (requestBody) {
    const content = requestBody.content?.['application/json'];
    if (content?.schema) {
      bodyParam.push({ name: 'data', schema: content.schema });
    }
  }

  // 构建参数
  if (pathParams.length > 0) {
    for (const p of pathParams) {
      const paramType = isTs ? resolveType(p.schema || { type: 'string' }, {}, new Set()) : 'any';
      params.push(`${p.name}: ${paramType}`);
    }
  }

  if (queryParams.length > 0) {
    const queryObj = {};
    for (const p of queryParams) {
      queryObj[p.name] = p.schema?.type || 'string';
    }
    if (isTs) {
      const queryTypeName = `${funcName}Params`;
      const queryInterface = generateQueryInterface(queryTypeName, queryObj);
      extraTypes.push(queryInterface);
      params.push(`params?: ${queryTypeName}`);
    } else {
      params.push(`params?: ${generateQueryType(queryObj)}`);
    }
  }

  if (bodyParam.length > 0) {
    const bodySchema = bodyParam[0].schema;
    const bodyType = isTs ? resolveType(bodySchema || { type: 'object' }, {}, new Set()) : 'any';
    params.push(`data?: ${bodyType}`);
  }


  const paramStr = params.join(', ');
  const summaryComment = summary ? `/** ${summary} */\n` : '';
  const paramsComment = params.length > 0 ? `  // params: ${[...pathParams.map(p => p.name), ...queryParams.map(p => p.name), ...bodyParam.map(p => p.name)].join(', ')}\n` : '';

  // 构建 request 配置项
  const requestOptions = [];
  if (pathParams.length > 0) {
    requestOptions.push(`path: { ${pathParams.map(p => `${p.name}`).join(', ')} }`);
  }
  if (queryParams.length > 0) {
    requestOptions.push('params');
  }
  if (bodyParam.length > 0) {
    requestOptions.push('data');
  }

  const requestConfig = requestOptions.length > 0
    ? `,\n    ${requestOptions.join(',\n    ')}`
    : '';

  const code = `${summaryComment}export const ${funcName} = (${paramStr}): Promise<${returnType}> => {
${paramsComment}  return request({
    url: \`${fullUrl}\`,
    method: '${method}'${requestConfig}
  });
};
`;

  return { code, extraTypes };
}

/**
 * 生成查询参数类型
 */
function generateQueryType(queryObj) {
  const props = [];
  for (const [name, type] of Object.entries(queryObj)) {
    // 属性名需要用引号包裹（如 qp-code-eq）
    const quotedName = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name) ? name : `'${name}'`;
    props.push(`${quotedName}: ${mapSchemaToTsType(type)}`);
  }
  return `{ ${props.join(', ')} }`;
}

/**
 * 生成查询参数 interface
 */
function generateQueryInterface(name, queryObj) {
  const props = [];
  for (const [propName, type] of Object.entries(queryObj)) {
    // 属性名需要用引号包裹（如 qp-code-eq）
    const quotedName = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(propName) ? propName : `'${propName}'`;
    props.push(`  ${quotedName}?: ${mapSchemaToTsType(type)};`);
  }
  return `export interface ${name} {\n${props.join('\n')}\n}`;
}

/**
 * 生成函数名
 */
function generateFunctionName(method, path) {
  const methodUpper = method.toUpperCase();
  const pathParts = path.split('/').filter(Boolean).map(part => {
    if (part.startsWith('{') && part.endsWith('}')) {
      return `By${toPascalCase(part.slice(1, -1))}`;
    }
    return toPascalCase(part);
  });
  return `${methodUpper}${pathParts.join('')}`;
}

/**
 * 转换为首字母大写的驼峰命名
 * 将泛型类型组合成唯一名称，如 ResultDTO<Pager<CalcConfigResVo>> -> ResultDTOPagerCalcConfigResVo
 */
function toPascalCase(str) {
  const normalized = str.replace(/«/g, '<').replace(/»/g, '>');

  // 找到第一个 <
  const firstAngle = normalized.indexOf('<');
  if (firstAngle !== -1) {
    const baseName = normalized.substring(0, firstAngle);
    const genericPart = normalized.substring(firstAngle + 1, normalized.lastIndexOf('>'));
    // 递归处理泛型参数（可能包含嵌套泛型），移除所有尖括号
    const processedGeneric = toPascalCase(genericPart);
    return baseName + processedGeneric;
  }

  return normalized
    .replace(/>+$/, '') // 移除末尾多余的 >
    .replace(/-(\w)/g, (_, c) => c ? c.toUpperCase() : '')
    .replace(/^(\w)/, (_, c) => c ? c.toUpperCase() : '');
}

/**
 * 将泛型类型名转换为类型引用字符串
 * 如 ResultDTO«Pager«CalcConfigResVo»» -> ResultDTOPagerCalcConfigResVo
 */
function toGenericTypeString(str) {
  const normalized = str.replace(/«/g, '<').replace(/»/g, '>');

  // 找到第一个 <
  const firstAngle = normalized.indexOf('<');
  if (firstAngle === -1) {
    return toPascalCase(normalized);
  }

  const baseName = normalized.substring(0, firstAngle);

  // 解析嵌套的泛型参数
  const args = [];
  let depth = 0;
  let current = '';
  for (let i = firstAngle + 1; i < normalized.length; i++) {
    const char = normalized[i];
    if (char === '<') {
      depth++;
      current += char;
    } else if (char === '>') {
      depth--;
      // 不把 > 加入 current，只用 depth 来判断是否完成
    } else if (char === ',' && depth === 0) {
      args.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) {
    args.push(current.trim());
  }

  // 处理每个参数（递归或直接pascalCase）
  const processedArgs = args.map(arg => {
    if (arg.includes('<')) {
      return toGenericTypeString(arg);
    }
    return toPascalCase(arg);
  });

  const pascalBase = baseName.replace(/-(\w)/g, (_, c) => c ? c.toUpperCase() : '')
    .replace(/^(\w)/, (_, c) => c ? c.toUpperCase() : '');

  return `${pascalBase}${processedArgs.join('')}`;
}

/**
 * 将 schema 类型映射为 ts 类型
 */
function mapSchemaToTsType(type, format) {
  if (!type) return 'any';

  switch (type) {
    case 'string':
      if (format === 'date-time' || format === 'date') return 'string';
      if (format === 'email') return 'string';
      if (format === 'uri') return 'string';
      return 'string';
    case 'number':
      return format === 'float' || format === 'double' ? 'number' : 'number';
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'array':
      return 'any[]';
    case 'object':
      return 'Record<string, any>';
    default:
      return 'any';
  }
}

/**
 * 格式化代码
 */
async function formatCode(code, ext) {
  try {
    return await prettier.format(code, {
      parser: ext === 'ts' ? 'typescript' : 'babel',
      semi: true,
      singleQuote: true,
      trailingComma: 'es5',
      printWidth: 100,
    });
  } catch {
    return code;
  }
}
