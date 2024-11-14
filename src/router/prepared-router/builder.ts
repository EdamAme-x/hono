import type { PreparedMatch, Routes } from './router'

const variables = {
  method: 'method',
  path: 'path',
  matchResult: 'matchResult',
  emptyParams: 'emptyParams',
  params: 'params',
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

/**
 * /abc => length = 1 && [0] = abc
 */
interface SourceTree {
  conditions: {
    mark: "separator" | "separator-empty" | "static" | "dynamic" | "dynamic-regex" | "wildcard",
    condition: string
  }[]
  process?: string
}

function buildConditions<T>(routes: Routes<T>): string {
  const sourceTrees: SourceTree[] = []

  const buildSourceTree = (route: Routes<T>[number], handlerIndex: number) => {
    const pathTree = route[1][1]

    const sourceTree: SourceTree = {
      conditions: [],
    }

    let pathIndex = 0
    let params: Record<string, number> = {}

    for (const pathTreePart of pathTree) {
      if (pathTreePart.type === 'separator') {
        pathIndex++

        sourceTree.conditions.push(
          {
            mark: "separator",
            condition: `(${variables.pathParts}.length === ${pathIndex + 1})`
          }
        )

        if (pathTree[pathIndex] === undefined) {
          sourceTree.conditions.push(
            {
              mark: "separator-empty",
              condition: `(${variables.pathParts}[${pathIndex}] === '')`
            }
          )
        }
      } else if (pathTreePart.type === 'static') {
        sourceTree.conditions.push(
          {
            mark: "static",
            condition: `(${variables.pathParts}[${pathIndex}] === '${pathTreePart.value}')`
          }
        )
      } else if (pathTreePart.type === 'dynamic') {
        sourceTree.conditions.push(
          {
            mark: "dynamic",
            condition: `(${variables.pathParts}.length === ${pathIndex + 1})`
          }
        )
        if (pathTreePart.regex) {
          sourceTree.conditions.push(
            {
              mark: "dynamic-regex",
              condition: `(/${pathTreePart.regex}/.test(${variables.pathParts}[${pathIndex}]))`
            }
          )
        }
        params[pathTreePart.value] = pathIndex
      } else if (pathTreePart.type === 'wildcard') {
        sourceTree.conditions.push(
          {
            mark: "wildcard",
            condition: `(${variables.pathParts}.length >= ${pathIndex})`
          }
        )
      }
    }

    const isAlreadyMarked: string[] = []

    const conditions: SourceTree["conditions"] = []

    // remove duplicated conditions
    for (let i = sourceTree.conditions.length - 1; i >= 0; i--) {
      if (isAlreadyMarked.includes(sourceTree.conditions[i].mark)) {
        continue
      } else {
        if (["separator", "wildcard"].includes(sourceTree.conditions[i].mark)) {
          isAlreadyMarked.push(sourceTree.conditions[i].mark)
        }
        conditions.push(sourceTree.conditions[i])
      }
    }

    // remove if wildcard or dynamic, remove separator abd dynamic

    let isHasWildcardOrDynamic = false

    for (let i = conditions.length - 1; i >= 0; i--) {
      if (["wildcard", "dynamic"].includes(conditions[i].mark)) {
        isHasWildcardOrDynamic = true
      }
    }

    const cleanedConditions: SourceTree["conditions"] = []

    for (let i = conditions.length - 1; i >= 0; i--) {
      if (!isHasWildcardOrDynamic || !["separator", "dynamic"].includes(conditions[i].mark)) {
        cleanedConditions.push(conditions[i])
      }
    }

    sourceTree.conditions = cleanedConditions
    sourceTree.process = `${variables.matchResult}.push([${handlerIndex
      }, ${Object.entries(params).length ? "{" + Object.entries(params).map(([key, pathIndex]) => `${key}: ${variables.pathParts}[${pathIndex}]`).join(',') + "}" : variables.emptyParams}])`

    return sourceTree
  }

  for (let i = 0, len = routes.length; i < len; i++) {
    sourceTrees.push(buildSourceTree(routes[i], i))
  }

  console.table(sourceTrees)

  const source = sourceTrees.map((sourceTree) => {
    const condition = sourceTree.conditions.map((condition) => condition.condition).join(' && ')
    return `if (${condition}) { ${sourceTree.process} }`
  }).join('\n')

  console.log(source)

  return `const ${variables.pathParts} = ${variables.path}.split('/');console.log(${variables.pathParts});${source}`
}
