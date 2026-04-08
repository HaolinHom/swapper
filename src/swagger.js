/**
 * 获取 swagger 文档
 */
export async function fetchSwagger(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`获取swagger文档失败: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

/**
 * 解析 swagger 文档，提取需要的接口
 * @param {Object} swaggerData - swagger 文档
 * @param {string[]} tags - 要生成的接口列表
 */
export function parseSwagger(swaggerData, tags) {
  const { paths, definitions, tags: swaggerTags } = swaggerData;

  // 分类 tags：Controller名称 和 Method-Path 对
  const controllerTags = [];
  const methodPathTags = [];

  for (const tag of tags) {
    if (tag.includes('-')) {
      methodPathTags.push(tag);
    } else {
      controllerTags.push(tag);
    }
  }

  const result = [];

  // 处理 paths
  for (const [path, methods] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (method === 'parameters') continue;

      const operationTags = operation.tags || [];
      const operationId = operation.operationId || '';

      // 检查是否匹配
      let matched = false;

      // 匹配 Controller
      for (const tag of controllerTags) {
        if (operationTags.includes(tag)) {
          matched = true;
          break;
        }
      }

      // 匹配 Method-Path
      if (!matched) {
        const methodPath = `${method.toUpperCase()}-${path}`;
        if (methodPathTags.includes(methodPath)) {
          matched = true;
        }
      }

      if (matched) {
        result.push({
          path,
          method: method.toUpperCase(),
          summary: operation.summary || '',
          operationId,
          tags: operationTags,
          parameters: operation.parameters || [],
          requestBody: operation.requestBody,
          responses: operation.responses || {},
        });
      }
    }
  }

  return {
    paths: result,
    definitions: definitions || {},
    swaggerTags: swaggerTags || [],
  };
}
