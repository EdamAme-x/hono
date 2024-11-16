import path from 'path'
import { METHOD_NAME_ALL } from '../../router'
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
  const methodWithRoutes: Record<string, Routes<T>> = {}

  for (const route of routes) {
    if (!methodWithRoutes[route[0]]) {
      methodWithRoutes[route[0]] = []
    }
    methodWithRoutes[route[0]].push(route)
  }

  const source = `return (() => {
      const ${variables.matchResult} = [];
      const ${variables.emptyParams} = Object.create(null);
      const ${variables.pathParts} = ${variables.path}.split('/');

      ${methodWithRoutes[METHOD_NAME_ALL] ? buildConditions(methodWithRoutes[METHOD_NAME_ALL]) : ''}
      ${(() => {
      delete methodWithRoutes[METHOD_NAME_ALL]
      const conditions = []
      for (const [method, routes] of Object.entries(methodWithRoutes)) {
        conditions.push(`${conditions.length ? 'else if' : 'if'} (method === '${method}') {${buildConditions(routes)}}`)
      }

      return conditions.join('\n')
    })()}
      
      if (${variables.matchResult}.length > 1) {
        ${variables.matchResult}.sort((a, b) => a[0] - b[0]);   
      }

      return ${variables.matchResult};
    })()`

  console.log(source)

  return new Function(
    'method',
    'path',
    source
  ) as PreparedMatch
}

interface Condition {
  mark: "separator" | "separator-empty" | "static" | "dynamic" | "dynamic-param" | "dynamic-regex" | "wildcard",
  condition: {
    left: string
    operator: "===" | "!==" | ">="
    right?: string
  }
}

interface ConditionTree {
  conditions: Condition[]
  process?: string
}

function buildConditions<T>(routes: Routes<T>): string {
  const conditionTrees: ConditionTree[] = []

  const buildConditionTree = (route: Routes<T>[number], handlerIndex: number) => {
    const pathTree = route[1][1]

    const conditionTree: ConditionTree = {
      conditions: [],
    }

    let pathIndex = 0
    let params: Record<string, string> = {}
    let isEncounteredWildcard = false

    for (const pathTreePart of pathTree) {
      if (pathTreePart.type === 'separator') {
        pathIndex++

        conditionTree.conditions.push(
          {
            mark: "separator",
            condition: {
              left: `${variables.pathParts}.length`,
              operator: "===",
              right: `${pathIndex + 1}`
            }
          }
        )

        if (pathTree[pathIndex] === undefined) {
          conditionTree.conditions.push(
            {
              mark: "separator-empty",
              condition: {
                left: `${variables.pathParts}[${pathIndex}]`,
                operator: "===",
                right: `''`
              }
            }
          )
        }
      } else if (pathTreePart.type === 'static') {
        conditionTree.conditions.push(
          {
            mark: "static",
            condition: {
              left: `${variables.pathParts}${isEncounteredWildcard ? ".slice(-1)" : `[${pathIndex}]`
                }`,
              operator: "===",
              right: `'${pathTreePart.value}'`
            }
          }
        )
      } else if (pathTreePart.type === 'dynamic') {
        conditionTree.conditions.push(
          {
            mark: "dynamic",
            condition: {
              left: `${variables.pathParts}.length`,
              operator: "===",
              right: `${pathIndex + 1}`
            }
          }
        )
        conditionTree.conditions.push(
          {
            mark: "dynamic-param",
            condition: {
              left: `${variables.pathParts}${isEncounteredWildcard ? ".slice(-1)" : `[${pathIndex}]`
                }`,
              operator: "!==",
              right: `undefined`
            }
          }
        )
        if (pathTreePart.regex) {
          conditionTree.conditions.push(
            {
              mark: "dynamic-regex",
              condition: {
                left: `(/${pathTreePart.regex}/.test(${variables.pathParts}${isEncounteredWildcard ? ".slice(-1)" : `[${pathIndex}]`
                  }))`,
                operator: "===",
                right: `true`
              }
            }
          )
        }
        if (isEncounteredWildcard) {
          params[pathTreePart.value] = `${variables.pathParts}.slice(-1)`
        } else {
          params[pathTreePart.value] = `${variables.pathParts}[${pathIndex}]`
        }
      } else if (pathTreePart.type === 'wildcard') {
        isEncounteredWildcard = true
        conditionTree.conditions.push(
          {
            mark: "wildcard",
            condition: {
              left: `${variables.pathParts}.length`,
              operator: ">=",
              right: `${pathIndex}`
            }
          }
        )
      }
    }

    const isAlreadyMarked: string[] = []

    const uniqueConditions: Condition[] = []

    // note: remove duplicated conditions
    for (let i = conditionTree.conditions.length - 1; i >= 0; i--) {
      if (isAlreadyMarked.includes(conditionTree.conditions[i].mark)) {
        continue
      } else {
        if (["separator", "wildcard"].includes(conditionTree.conditions[i].mark)) {
          isAlreadyMarked.push(conditionTree.conditions[i].mark)
        }
        uniqueConditions.push(conditionTree.conditions[i])
      }
    }

    // note: remove if wildcard or dynamic, remove separator abd dynamic

    let isHasWildcardOrDynamic = false

    for (let i = uniqueConditions.length - 1; i >= 0; i--) {
      if (["wildcard", "dynamic"].includes(uniqueConditions[i].mark)) {
        isHasWildcardOrDynamic = true
      }
    }

    const optimizedConditions: ConditionTree["conditions"] = []
    for (let i = uniqueConditions.length - 1; i >= 0; i--) {
      if (!isHasWildcardOrDynamic || !["separator", "dynamic"].includes(uniqueConditions[i].mark)) {
        optimizedConditions.push(uniqueConditions[i])
      }
    }

    conditionTree.conditions = optimizedConditions
    conditionTree.process = `${variables.matchResult}.push([${handlerIndex
      }, ${Object.entries(params).length ? "{" + Object.entries(params).map(([key, value]) => `${key}: ${value}`).join(',') + "}" : variables.emptyParams}])`

    return conditionTree
  }

  for (let i = 0, len = routes.length; i < len; i++) {
    conditionTrees.push(buildConditionTree(routes[i], i))
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
    return a.condition.left === b.condition.left && a.condition.operator === b.condition.operator && a.condition.right === b.condition.right
  }

  const buildSource = (conditionTrees: ConditionTree[]): string => {
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

    const [includeConditionTrees, excludeConditionTrees] = conditionTrees.reduce(([include, exclude], conditionTree) => {
      const conditionIndex = conditionTree.conditions.findIndex((c) => isEqualCondition(c, mostCommonCondition))

      if (conditionIndex !== -1) {
        conditionTree.conditions.splice(conditionIndex, 1)

        return [[...include, conditionTree], exclude]
      } else {
        return [include, [...exclude, conditionTree]]
      }
    }, [[], []] as [ConditionTree[], ConditionTree[]])

    if (!includeConditionTrees.length) {
      return buildSource(excludeConditionTrees)
    }

    const noLengthConditionTrees = includeConditionTrees.filter((conditionTree) => !conditionTree.conditions.length)

    return `
      if (${mostCommonCondition.condition.left} ${mostCommonCondition.condition.operator} ${mostCommonCondition.condition.right}) {
        ${noLengthConditionTrees.map((conditionTree) => conditionTree.process).join('\n')}
        ${buildSource(includeConditionTrees.filter((conditionTree) => !noLengthConditionTrees.includes(conditionTree)))}
      }
      ${buildSource(excludeConditionTrees)}
    `
  }

  return buildSource(conditionTrees)
}