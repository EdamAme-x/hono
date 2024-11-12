import { METHOD_NAME_ALL } from '../../router'
import type { PathTree } from './lexer'
import type { PreparedMatch, Routes } from './router'

type MRoutes = [number, string, PathTree][]

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
  const source = ''

  return source
}
