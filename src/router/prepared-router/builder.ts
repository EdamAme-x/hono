import { METHOD_NAME_ALL } from '../../router'
import type { PreparedMatch, Route, Routes } from './router'

const variables = {
  method: 'method',
  path: 'path',
  matchResult: 'matchResult',
  emptyParams: 'emptyParams',
  params: 'params',
  pathParts: 'pathParts',
  createParams: 'createParams',
  staticHandlers: 'staticHandlers',
  staticMethods: 'staticMethods',
  preparedHandlers: 'preparedHandlers',
  preparedMethods: 'preparedMethods',
  preparedResult: 'preparedResult',
  handler: (i: number) => `handler${i}`,
}

let buildConditionsCache: [
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Routes<any>[],
  string[]
] = [[], []]

export function buildPreparedMatch<T>(
  routes: Routes<T>,
  isRebuild: boolean,
  isNoStaticHandlers: boolean,
  isNoPreparedHandlers: boolean
): PreparedMatch<T> {
  const methodWithRoutes: Record<string, Routes<T>> = {}

  for (const route of routes) {
    methodWithRoutes[route.method] ||= []
    methodWithRoutes[route.method].push(route)
  }

  const source = `
      ${
        isNoPreparedHandlers ? '' : `
            const ${variables.preparedMethods} = ${variables.preparedHandlers}[path];
            const ${variables.preparedResult} = ${variables.preparedMethods}?.[method]

            if (${variables.preparedResult}) {
              return ${variables.preparedResult};
            }
            `
      }

      ${
        isNoStaticHandlers
          ? `
        const ${variables.matchResult} = [];
        `
          : `
        const ${variables.staticMethods} = ${variables.staticHandlers}[path];
        const ${variables.matchResult} = ${variables.staticMethods} ? (${variables.staticMethods}[method] || ${variables.staticMethods}['${METHOD_NAME_ALL}'] || []) : [];
        `
      }
      const ${variables.emptyParams} = Object.create(null);
      const ${variables.pathParts} = ${variables.path}.split('/');

      ${methodWithRoutes[METHOD_NAME_ALL] ? buildConditions(methodWithRoutes[METHOD_NAME_ALL]) : ''}
      ${(() => {
        delete methodWithRoutes[METHOD_NAME_ALL]
        const conditions: string[] = []
        for (const [method, routes] of Object.entries(methodWithRoutes)) {
          conditions.push(
            `${conditions.length ? 'else if' : 'if'} (method === '${method}') {${buildConditions(
              routes
            )}}`
          )
        }

        return conditions.join('\n')
      })()}
      
     ${
      routes.length > 0 ? 
        `
        if (${variables.matchResult}.length > 1) {
          ${variables.matchResult}.sort((a, b) => a[2] - b[2]);   
        }
        ` : ''
     }

      return [${variables.matchResult}.map(([handler, params]) => [handler, params])];`

  if (isRebuild) {
    buildConditionsCache = [[], []]
  }

  return new Function(
    variables.method,
    variables.path,
    variables.createParams,
    variables.staticHandlers,
    variables.preparedHandlers,
    `[${routes.map((route) => variables.handler(route.tag)).join(',')}]`,
    source
  ) as PreparedMatch<T>
}

interface Condition {
  mark:
    | 'separator'
    | 'separator-empty'
    | 'static'
    | 'dynamic-param'
    | 'dynamic-wildcard'
    | 'dynamic-regex'
    | 'wildcard'
  condition: {
    left: string
    operator: '===' | '!==' | '>='
    right?: string
  }
}

interface ConditionTree {
  conditions: Condition[]
  process?: string
}

function buildConditions<T>(routes: Routes<T>): string {
  const cacheIndex = buildConditionsCache[0].indexOf(routes)
  if (cacheIndex !== -1) {
    return buildConditionsCache[1][cacheIndex]
  }

  const conditionTrees: ConditionTree[] = []

  const buildConditionTree = (route: Route<T>, handlerIndex: number, tagIndex: number) => {
    const pathTree = route.path[1]

    const conditionTree: ConditionTree = {
      conditions: [],
    }

    let pathIndex = 0
    const params: Record<string, string> = Object.create(null)
    let isEncounteredWildcard = false

    for (const pathTreePart of pathTree) {
      if (pathTreePart.type === 'separator') {
        pathIndex++

        conditionTree.conditions.push({
          mark: 'separator',
          condition: {
            left: `${variables.pathParts}.length`,
            operator: '===',
            right: `${pathIndex + 1}`,
          },
        })

        if (pathTree[pathIndex] === undefined) {
          conditionTree.conditions.push({
            mark: 'separator-empty',
            condition: {
              left: `${variables.pathParts}[${pathIndex}]`,
              operator: '===',
              right: '""',
            },
          })
        }
      } else if (pathTreePart.type === 'static') {
        conditionTree.conditions.push({
          mark: 'static',
          condition: {
            left: `${variables.pathParts}${isEncounteredWildcard ? '.at(-1)' : `[${pathIndex}]`}`,
            operator: '===',
            right: `'${pathTreePart.value}'`,
          },
        })
      } else if (pathTreePart.type === 'dynamic') {
        if (pathTreePart.regex) {
          if (pathTreePart.regex.split('/').length > 1) {
            conditionTree.conditions.push({
              mark: 'dynamic-wildcard',
              condition: {
                left: `(/${pathTreePart.regex}/.test(${variables.pathParts}.slice(${pathIndex}).join("/")))`,
                operator: '===',
                right: 'true',
              },
            })
            params[pathTreePart.value] = `${variables.pathParts}.slice(${pathIndex}).join("/")`
          } else {
            conditionTree.conditions.push({
              mark: 'dynamic-regex',
              condition: {
                left: `(/${pathTreePart.regex}/.test(${variables.pathParts}${
                  isEncounteredWildcard ? '.at(-1)' : `[${pathIndex}]`
                }))`,
                operator: '===',
                right: 'true',
              },
            })
          }
        } else {
          conditionTree.conditions.push({
            mark: 'dynamic-param',
            condition: {
              left: `!!${variables.pathParts}${
                isEncounteredWildcard ? '.at(-1)' : `[${pathIndex}]`
              }`,
              operator: '===',
              right: 'true',
            },
          })
        }

        if (!params[pathTreePart.value]) {
          if (isEncounteredWildcard) {
            params[pathTreePart.value] = `${variables.pathParts}.at(-1)`
          } else {
            params[pathTreePart.value] = `${variables.pathParts}[${pathIndex}]`
          }
        }
      } else if (pathTreePart.type === 'wildcard') {
        isEncounteredWildcard = true
        conditionTree.conditions.push({
          mark: 'wildcard',
          condition: {
            left: `${variables.pathParts}.length`,
            operator: '>=',
            right: `${pathIndex}`,
          },
        })
      }
    }

    const isAlreadyMarked: string[] = []

    const uniqueConditions: Condition[] = []

    // note: remove duplicated conditions
    for (let i = conditionTree.conditions.length - 1; i >= 0; i--) {
      if (isAlreadyMarked.includes(conditionTree.conditions[i].mark)) {
        continue
      } else {
        if (['separator', 'wildcard'].includes(conditionTree.conditions[i].mark)) {
          isAlreadyMarked.push(conditionTree.conditions[i].mark)
        }
        const sameCondition = uniqueConditions.find(
          (condition) =>
            condition.condition.left === conditionTree.conditions[i].condition.left &&
            condition.condition.operator === conditionTree.conditions[i].condition.operator &&
            condition.condition.right === conditionTree.conditions[i].condition.right
        )
        if (!sameCondition) {
          uniqueConditions.push(conditionTree.conditions[i])
        }
      }
    }

    // note: remove if wildcard or dynamic, remove separator and dynamic
    let isHasWildcard = false

    for (let i = uniqueConditions.length - 1; i >= 0; i--) {
      if (['wildcard', 'dynamic-wildcard'].includes(uniqueConditions[i].mark)) {
        isHasWildcard = true
      }
    }

    const optimizedConditions: Condition[] = []
    for (let i = uniqueConditions.length - 1; i >= 0; i--) {
      if (!isHasWildcard || !['separator'].includes(uniqueConditions[i].mark)) {
        optimizedConditions.push(uniqueConditions[i])
      }
    }

    conditionTree.conditions = optimizedConditions
    const paramEntries = Object.entries(params)
    const isParams = paramEntries.length

    conditionTree.process = `
    ${
      isParams
        ? `
        const ${variables.params} = new ${variables.createParams}();
        ${paramEntries
          .map(([paramKey, paramValue]) => `${variables.params}.${paramKey} = ${paramValue};`)
          .join('')}
      `
        : ''
    }
    ${variables.matchResult}.push([${variables.handler(tagIndex)}, ${
      isParams ? variables.params : variables.emptyParams
    }, ${handlerIndex}])`

    return conditionTree
  }

  for (const route of routes) {
    conditionTrees.push(buildConditionTree(route, route.order, route.tag))
  }

  /*
    if (A & B) {
      ...
    }else if (A & C) {
      ...
    }

    to 

    if (A) {
      if (B) {
        ...
      }else if (C) {
        ...
      }
    }
  */

  const isEqualCondition = (a: Condition, b: Condition) => {
    return (
      a.condition.left === b.condition.left &&
      a.condition.operator === b.condition.operator &&
      a.condition.right === b.condition.right
    )
  }

  const isExclusiveCondition  = (a: Condition, b: Condition) => {
    return (
      a.condition.left === b.condition.left &&
            a.condition.operator === '===' &&
            b.condition.operator === '===' &&
            a.condition.right !== b.condition.right
    )
  }

  const buildSource = (conditionTrees: ConditionTree[], prevCondition?: Condition): string => {
    const getSortedConditions = (): Condition[] => {
      const conditions: Condition[] = []

      for (const conditionTree of conditionTrees) {
        conditions.push(...conditionTree.conditions)
      }

      const countMap: [Condition, number][] = []

      for (const condition of conditions) {
        const index = countMap.findIndex(([c]) => isEqualCondition(c, condition))
        if (index === -1) {
          countMap.push([condition, 1])
        } else {
          countMap[index][1]++
        }
      }

      return countMap.sort((a, b) => b[1] - a[1]).map(([c]) => c)
    }

    const sortedConditions = getSortedConditions()

    if (!sortedConditions.length) {
      return conditionTrees.map((conditionTree) => conditionTree.process).join('\n')
    }

    const mostCommonCondition = sortedConditions[0]

    const [includeConditionTrees, excludeConditionTrees] = conditionTrees.reduce(
      ([include, exclude], conditionTree) => {
        const conditionIndex = conditionTree.conditions.findIndex((c) =>
          isEqualCondition(c, mostCommonCondition)
        )

        if (conditionIndex !== -1) {
          conditionTree.conditions.splice(conditionIndex, 1)

          return [[...include, conditionTree], exclude]
        } else {
          return [include, [...exclude, conditionTree]]
        }
      },
      [[], []] as [ConditionTree[], ConditionTree[]]
    )

    if (!includeConditionTrees.length) {
      return buildSource(excludeConditionTrees, prevCondition)
    }

    const noLengthConditionTrees = includeConditionTrees.filter(
      (conditionTree) => !conditionTree.conditions.length
    )

    return `
      ${
        prevCondition
          ? isExclusiveCondition(prevCondition, mostCommonCondition)
            ? 'else '
            : ''
          : ''
      }if (${mostCommonCondition.condition.left} ${mostCommonCondition.condition.operator} ${
      mostCommonCondition.condition.right
    }) {
        ${noLengthConditionTrees.map((conditionTree) => conditionTree.process).join('\n')}
        ${buildSource(
          includeConditionTrees.filter(
            (conditionTree) => !noLengthConditionTrees.includes(conditionTree)
          ),
          mostCommonCondition
        )}
      }
      ${buildSource(excludeConditionTrees, mostCommonCondition)}
    `
  }

  const source = buildSource(conditionTrees)

  buildConditionsCache[0].push(routes)
  buildConditionsCache[1].push(source)

  return source
}
