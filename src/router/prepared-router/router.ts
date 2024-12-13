import { MESSAGE_MATCHER_IS_ALREADY_BUILT } from '../../router'
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
  ...handlers: T[]
) => [T, Params][]

export type Route<T> = [string, [string, PathTree], T, number, number, boolean]
export type Routes<T> = Route<T>[]

const emptyParams = Object.create(null)
const createParams = (() => {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const E = function () {}
  E.prototype = emptyParams
  return E
})() as unknown as { new (): Params }

const isStaticPath = (path: string) => splitRoutingPath(path).every(p => getPattern(p) === null)

export class PreparedRouter<T> implements Router<T> {
  name: string = 'PreparedRouter'
  #isBuilt = false
  #preparedMatch = new Function('method', 'path', 'return (()=>[])()') as PreparedMatch<T>
  #routes: Routes<T> = []
  #handlers: T[] = []
  #staticHandlers: Record<string, Record<string, [T, Params, number][]>> = Object.create(null)

  constructor() {
    if (typeof Function === 'undefined') {
      throw new Error('This runtime does not support prepared router')
    }
  }

  add(method: string, path: string, handler: T) {
    if (this.#isBuilt) {
      throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT)
    }

    const optionalParameter = checkOptionalParameter(path)
    if (optionalParameter) {
      optionalParameter.forEach((p) => this.add(method, p, handler))
    } else {
      if (!path.startsWith('/')) {
        path = `/${path}`
      }

      let isStatic = false

      if (isStaticPath(path)) {
        isStatic = true
      }

      this.#routes.push([method, [path, pathLexer(path)], handler, this.#routes.length, NaN, isStatic])
    }
  }

  match(method: string, path: string): Result<T> {
    this.#buildPreparedMatch()

    this.#isBuilt = true

    this.match = (method: string, path: string) => {
      return [this.#preparedMatch(method, path, createParams, this.#staticHandlers, ...this.#handlers)]
    }

    return this.match(method, path)
  }

  #buildPreparedMatch() {
    for (let i = 0; i < this.#routes.length; i++) {
      const route = this.#routes[i]
      if (route[4]) {
        this.#staticHandlers[route[1][0]] ||= Object.create(null)
        this.#staticHandlers[route[1][0]][route[0]] ||= []

        this.#staticHandlers[route[1][0]][route[0]].push([route[2], emptyParams, route[3]])
        this.#routes.splice(i, 1)
      }
    }
    this.#handlers = this.#routes.map((route, index) => {
      route[3] = index
      return route[2]
    })
    this.#preparedMatch = buildPreparedMatch(this.#routes)
  }
}
