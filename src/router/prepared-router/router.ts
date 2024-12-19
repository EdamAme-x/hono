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
  staticHandlers: Record<string, Record<string, {
    handler: T,
    params: Params,
    order: number
  }[]>>,
  preparedHandlers: Record<string, Record<string, Result<T>>>,
  handlers: Record<`handler${number}`, T>
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
  #handlers: Record<`handler${number}`, T> = Object.create(null)
  #staticHandlers: Record<string, Record<string, {
    handler: T,
    params: Params,
    order: number
  }[]>> = Object.create(null)
  #preparedHandlers: Record<string, Record<string, Result<T>>> = Object.create(null)

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
      if (path === '*') {
        path = '/*'
      }

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

        this.#staticHandlers[path][method].push({
          handler: route.handler,
          params: emptyParams,
          order: route.order
        })
      } else {
        route.tag = ++tagIndex
        this.#handlers[`handler${route.tag}`] = route.handler
        middleware.push(route)
      }
    }

    const prePreparedMatch = buildPreparedMatch(middleware, false, false, false)

    let isNoStaticHandlers = true
    let isNoPreparedHandlers = true

    for (const path in this.#staticHandlers) {
      const staticMethods = this.#staticHandlers[path]

      for (const method in staticMethods) {
        if (method === METHOD_NAME_ALL) {
          isNoStaticHandlers = false
          continue
        }
        isNoPreparedHandlers = false
        const matchResult = prePreparedMatch(
          method,
          path,
          createParams,
          this.#staticHandlers,
          this.#preparedHandlers,
          this.#handlers
        )

        this.#preparedHandlers[path] ||= Object.create(null)
        this.#preparedHandlers[path][method] = matchResult

        delete this.#staticHandlers[path][method]
      }
    }
    this.#preparedMatch = buildPreparedMatch(middleware, true, isNoStaticHandlers, isNoPreparedHandlers)
  }

  // current not working well
  build(): string {
    if (!this.#preparedMatch) {
      this.#buildPreparedMatch()
    }

    return ``
  }
}
