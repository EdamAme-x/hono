import { MESSAGE_MATCHER_IS_ALREADY_BUILT, METHOD_NAME_ALL } from '../../router'
import type { Params, Result, Router } from '../../router'
import { checkOptionalParameter, splitRoutingPath, getPattern } from '../../utils/url'
import { buildPreparedMatch } from './builder'
import { pathLexer } from './lexer'
import type { PathTree } from './lexer'

export type PreparedMatch<T> = (
  method: string,
  path: string,
  createParams: new () => Params,
  staticHandlers: Record<string, Record<string, [T, Params, number][]>>,
  preparedHandlers: Record<string, Record<string, [T, Params][]>>,
  handlers: T[]
) => [[T, Params][]]

export type Route<T> = {
  method: string
  path: [string, PathTree]
  handler: T
  order: number
  tag: number
  isStatic: boolean
}
export type Routes<T> = Route<T>[]

const emptyParams = Object.create(null)
const createParams = (() => {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const E = function () {}
  E.prototype = emptyParams
  return E
})() as unknown as { new (): Params }

const isStaticPath = (path: string) => splitRoutingPath(path).every((p) => getPattern(p) === null)

/**
 * @expertimental
 */
export class PreparedRouter<T> implements Router<T> {
  name: string = 'PreparedRouter'
  #preparedMatch?: PreparedMatch<T>
  #routes: Routes<T> = []
  #handlers: T[] = []
  #staticHandlers: Record<string, Record<string, [T, Params, number][]>> = Object.create(null)
  #preparedHandlers: Record<string, Record<string, [T, Params][]>> = Object.create(null)

  constructor() {
    if (typeof Function === 'undefined') {
      throw new Error('This runtime does not support `PreparedRouter`')
    }
  }

  add(method: string, path: string, handler: T) {
    if (this.#preparedMatch) {
      throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT)
    }

    const optionalParameter = checkOptionalParameter(path)
    if (optionalParameter) {
      optionalParameter.forEach((p) => this.add(method, p, handler))
    } else {
      let isStatic = false

      if (isStaticPath(path)) {
        isStatic = true
      }

      this.#routes.push({
        method,
        path: [path, pathLexer(path)],
        handler,
        order: this.#routes.length,
        tag: NaN,
        isStatic,
      })
    }
  }

  match(method: string, path: string): Result<T> {
    this.#buildPreparedMatch()

    const preparedMatch = this.#preparedMatch!
    const staticHandlers = this.#staticHandlers
    const preparedHandlers = this.#preparedHandlers
    const handlers = this.#handlers

    this.match = (method: string, path: string) =>
      preparedMatch(method, path, createParams, staticHandlers, preparedHandlers, handlers)

    return this.match(method, path)
  }

  #buildPreparedMatch() {
    if (this.#preparedMatch) {
      return
    }

    const middleware: Routes<T> = []

    for (let tagIndex = 0, routes = [...this.#routes]; ; ) {
      const route = routes.shift()
      if (!route) {
        break
      }
      if (route.isStatic) {
        const path = route.path[0]
        const method = route.method

        this.#staticHandlers[path] ||= Object.create(null)
        this.#staticHandlers[path][method] ||= []

        this.#staticHandlers[path][method].push([route.handler, emptyParams, route.order])
      } else {
        route.tag = ++tagIndex
        this.#handlers.push(route.handler)
        middleware.push(route)
      }
    }

    const prePreparedMatch = buildPreparedMatch(middleware, false, false)

    let isNoStaticHandlers = true

    for (const path in this.#staticHandlers) {
      const staticMethods = this.#staticHandlers[path]

      for (const method in staticMethods) {
        if (method === METHOD_NAME_ALL) {
          isNoStaticHandlers = false
          continue
        }
        const matchResult = prePreparedMatch(
          method,
          path,
          createParams,
          this.#staticHandlers,
          this.#preparedHandlers,
          this.#handlers
        )

        this.#preparedHandlers[path] ||= Object.create(null)
        this.#preparedHandlers[path][method] = matchResult[0]

        delete this.#staticHandlers[path][method]
      }
    }
    this.#preparedMatch = buildPreparedMatch(middleware, true, isNoStaticHandlers)

    console.log(this.#preparedMatch.toString())
  }

  build(): string {
    if (!this.#preparedMatch) {
      this.#buildPreparedMatch()
    }

    return `new (function () {
        const preparedMatch = ${this.#preparedMatch!.toString()};
        const emptyParams = Object.create(null)
        const createParams = (() => {
          const E = function () {}
          E.prototype = emptyParams
          return E
        })();
        const staticHandlers =  ${JSON.stringify(
          Object.entries(this.#staticHandlers).reduce((prev, cur) => {
            for (const method in cur[1]) {
              prev[cur[0]] ||= Object.create(null)
              prev[cur[0]][method] ||= []
            }
            return prev
          }, {} as Record<string, Record<string, []>>)
        )};
        const preparedHandlers = ${JSON.stringify(
          Object.entries(this.#preparedHandlers).reduce((prev, cur) => {
            for (const method in cur[1]) {
              prev[cur[0]] ||= Object.create(null)
              prev[cur[0]][method] ||= []
            }
            return prev
          }, {} as Record<string, Record<string, []>>)
        )};
        const handlers = [];

        return {
          name: '${this.name}',
          add: function (method, path, handler) {
            if (method in (staticHandlers[path] || emptyParams)) {
              staticHandlers[path][method].push([handler, emptyParams])
            }else if (method in (preparedHandlers[path] || emptyParams)) {
              preparedHandlers[path][method].push([handler, emptyParams])
            }else {
              handlers.push(handler)
            }
          },
          match: function (method, path) {
            return preparedMatch(method, path, createParams, staticHandlers, preparedHandlers, handlers)
          }
        }
      })()`
  }
}

const routes = [
  { method: 'GET', path: '/user' },
  { method: 'GET', path: '/user/comments' },
  { method: 'GET', path: '/user/avatar' },
  { method: 'GET', path: '/user/lookup/username/:username' },
  { method: 'GET', path: '/user/lookup/email/:address' },
  { method: 'GET', path: '/event/:id' },
  { method: 'GET', path: '/event/:id/comments' },
  { method: 'POST', path: '/event/:id/comment' },
  { method: 'GET', path: '/map/:location/events' },
  { method: 'GET', path: '/status' },
  { method: 'GET', path: '/very/deeply/nested/route/hello/there' },
  { method: 'GET', path: '/static/*' },
]

const router = new PreparedRouter()
for (const route of routes) {
  router.add(route.method, route.path, `${route.method} ${route.path}`)
}

console.log(router.match('GET', '/event/123'))
