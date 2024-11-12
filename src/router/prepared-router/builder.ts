import { METHOD_NAME_ALL } from '../../router'
import type { PathTree } from './lexer'
import type { PreparedMatch, Routes } from './router'

type MRoute = [number, string, PathTree]
type MRoutes = MRoute[]

const variables = {
  matchResult: 'matchResult',
  emptyParams: 'emptyParams',
}

export function buildPreparedMatch<T>(routes: Routes<T>): PreparedMatch {
  const methodsWithRoutes: Record<string, MRoutes> = Object.create(null)

  for (let i = 0, len = routes.length; i < len; i++) {
    const [method, [path, tree]] = routes[i]

    if (!methodsWithRoutes[method]) {
      methodsWithRoutes[method] = []
    }

    methodsWithRoutes[method].push([i, path, tree])
  }

  return new Function(
    'method',
    'path',
    `return (() => {
        const ${variables.matchResult} = [];
        const ${variables.emptyParams} = Object.create(null);

        ${
          methodsWithRoutes[METHOD_NAME_ALL]
            ? buildConditions(methodsWithRoutes[METHOD_NAME_ALL])
            : ''
        }

        ${(() => {
          delete methodsWithRoutes[METHOD_NAME_ALL]

          let source = ''

          for (const [method, routes] of Object.entries(methodsWithRoutes)) {
            source += `${source ? 'else' : ''} if (method === '${method}') {`
            source += buildConditions(routes)
            source += '}'
          }

          return source
        })()}

        ${variables.matchResult}.sort((a, b) => a[0] - b[0]);   

        return ${variables.matchResult};
      })()`
  ) as PreparedMatch
}

function buildConditions(routes: MRoutes): string {
  let source = [
    '', // head
    '', // meta
    '' // body
  ]

  const buildCondition = (route: MRoute): string => {
    const conditions: string[] = []
    const paramAssignments: string[] = []

    let pathIndex = -1

    for (let i = 0, pathTree = route[2], len = pathTree.length; i < len; i++) {
      const element = pathTree[i]

      switch (element.type) {
        case 'separator':
          conditions.push(`pathParts[${pathIndex + 1}] === '/'`);
          pathIndex += 2
          break;
        case 'static':
          conditions.push(`pathParts[${pathIndex}] === '${element.value}'`);
          break;
        case 'dynamic':
          conditions.push(`pathParts[${pathIndex}] !== undefined`);
          paramAssignments.push(`params['${element.value}'] = pathParts[${pathIndex}]`);
          if (element.regex) {
            conditions.push(`/${element.regex}/.test(pathParts[${pathIndex}])`);
          }
          break;
        case 'always':
          conditions.push(`pathParts.length > ${pathIndex}`);
          break;
      }
    }

    const condition = conditions.length ? `if (${conditions.join(' && ')})` : ''

    const paramAssignmentCode = paramAssignments.length
      ? paramAssignments.join('; ') + '; '
      : '';

    return `${condition} { ${paramAssignments.length ? 'const params = Object.create(null);' : ''} ${paramAssignmentCode} ${variables.matchResult}.push([${route[0]}, ${paramAssignments.length ? 'params' : variables.emptyParams}]); }`;
  }

  source[0] = `const pathParts = path.split("/");`

  for (const route of routes) {
    source[2] += buildCondition(route)
  }

  console.log(source.join(""))

  return source.join("")
}
