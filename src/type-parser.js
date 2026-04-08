function readTypeName(content, start) {
  let index = start;

  while (/\s/u.test(content[index] || '')) {
    index += 1;
  }

  const nameStart = index;
  while (index < content.length && !/[\s<{=]/u.test(content[index])) {
    index += 1;
  }

  return {
    name: content.slice(nameStart, index),
    nextIndex: index,
  };
}

function findMatchingBrace(content, startIndex) {
  let depth = 0;
  let inLineComment = false;
  let inBlockComment = false;
  let stringQuote = '';
  let escaped = false;

  for (let index = startIndex; index < content.length; index += 1) {
    const char = content[index];
    const nextChar = content[index + 1];

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === '*' && nextChar === '/') {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }

    if (stringQuote) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === stringQuote) {
        stringQuote = '';
      }
      continue;
    }

    if (char === '/' && nextChar === '/') {
      inLineComment = true;
      index += 1;
      continue;
    }

    if (char === '/' && nextChar === '*') {
      inBlockComment = true;
      index += 1;
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      stringQuote = char;
      continue;
    }

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function findTypeAliasEnd(content, startIndex) {
  let braceDepth = 0;
  let bracketDepth = 0;
  let parenDepth = 0;
  let inLineComment = false;
  let inBlockComment = false;
  let stringQuote = '';
  let escaped = false;

  for (let index = startIndex; index < content.length; index += 1) {
    const char = content[index];
    const nextChar = content[index + 1];

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === '*' && nextChar === '/') {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }

    if (stringQuote) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === stringQuote) {
        stringQuote = '';
      }
      continue;
    }

    if (char === '/' && nextChar === '/') {
      inLineComment = true;
      index += 1;
      continue;
    }

    if (char === '/' && nextChar === '*') {
      inBlockComment = true;
      index += 1;
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      stringQuote = char;
      continue;
    }

    if (char === '{') {
      braceDepth += 1;
      continue;
    }

    if (char === '}') {
      braceDepth -= 1;
      continue;
    }

    if (char === '[') {
      bracketDepth += 1;
      continue;
    }

    if (char === ']') {
      bracketDepth -= 1;
      continue;
    }

    if (char === '(') {
      parenDepth += 1;
      continue;
    }

    if (char === ')') {
      parenDepth -= 1;
      continue;
    }

    if (char === ';' && braceDepth === 0 && bracketDepth === 0 && parenDepth === 0) {
      return index;
    }
  }

  return -1;
}

export function parseExportedTypes(content) {
  const types = new Map();
  const typeOrder = [];

  if (!content) {
    return { types, typeOrder };
  }

  const exportRegex = /export\s+(interface|type)\s+/g;
  let match;

  while ((match = exportRegex.exec(content)) !== null) {
    const kind = match[1];
    const startIndex = match.index;
    const { name, nextIndex } = readTypeName(content, exportRegex.lastIndex);

    if (!name) {
      continue;
    }

    if (kind === 'interface') {
      const braceIndex = content.indexOf('{', nextIndex);
      if (braceIndex === -1) {
        continue;
      }

      const endIndex = findMatchingBrace(content, braceIndex);
      if (endIndex === -1) {
        continue;
      }

      const declaration = content.slice(startIndex, endIndex + 1);
      types.set(name, declaration);
      typeOrder.push(name);
      exportRegex.lastIndex = endIndex + 1;
      continue;
    }

    const equalsIndex = content.indexOf('=', nextIndex);
    if (equalsIndex === -1) {
      continue;
    }

    const endIndex = findTypeAliasEnd(content, equalsIndex + 1);
    if (endIndex === -1) {
      continue;
    }

    const declaration = content.slice(startIndex, endIndex + 1);
    types.set(name, declaration);
    typeOrder.push(name);
    exportRegex.lastIndex = endIndex + 1;
  }

  return { types, typeOrder };
}

export function extractExportedTypeNames(content) {
  return parseExportedTypes(content).typeOrder;
}
