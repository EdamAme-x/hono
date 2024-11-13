import type { PreparedMatch, Routes } from './router'

const variables = {
  method: 'method',
  path: 'path',
  matchResult: 'matchResult',
  emptyParams: 'emptyParams',
  pathParts: 'pathParts',
}

export function buildPreparedMatch<T>(routes: Routes<T>): PreparedMatch {
  return new Function(
    'method',
    'path',
    `return (() => {
        const ${variables.matchResult} = [];
        const ${variables.emptyParams} = Object.create(null);

        ${buildConditions(routes)}

        ${variables.matchResult}.sort((a, b) => a[0] - b[0]);   

        return ${variables.matchResult};
      })()`
  ) as PreparedMatch
}

type SourceTree<T extends "condition" | "process" = "condition" | "process"> = ((
  T extends "condition" ? {
    type: T
    condition: string | null
    children: SourceTree[]
  } : never
) | (
    T extends "process" ? {
      type: T
      process: string
      children: SourceTree[]
    } : never
  ))

/**
 * /abc => length =>1 && 0 => abc
 */

function buildConditions<T>(routes: Routes<T>): string {
  let sourceTree: SourceTree[] = []

  const buildSourceTree = (route: Routes<T>[number], handlerIndex: number) => {
    const [method, [path, pathTree]] = route

    const sourceBranch: SourceTree<"condition"> = {
      type: "condition",
      condition: method === "ALL" ? null : `${variables.method} === '${method}'`,
      children: [],
    }

    for (let pathIndex = 0, len = pathTree.length; pathIndex < len; pathIndex++) {
      const { type } = pathTree[pathIndex]

      if (type === "separator") {
        sourceBranch.children.push({
          type: "condition",
          condition: null,
          children: [],
        })
      }
    }
  }

  for (let i = 0, len = routes.length; i < len; i++) {
    buildSourceTree(routes[i], i)
  }

  return `const ${variables.pathParts} = ${variables.path}.split('/').slice(1);`
}
