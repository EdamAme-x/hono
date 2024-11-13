import { MESSAGE_MATCHER_IS_ALREADY_BUILT, type Params, type Result, type Router } from '../../router'
import { checkOptionalParameter } from '../../utils/url'
import { buildPreparedMatch } from './builder'
import { pathLexer } from './lexer'
import type { PathTree } from './lexer'

export type PreparedMatch = (method: string, path: string) => [number, Params][]
export type Routes<T> = [string, [string, PathTree], T][]

export class PreparedRouter<T> implements Router<T> {
  name: string = 'PreparedRouter'
  #isInitlized = false
  #isBuilt = false
  #preparedMatch = new Function('method', 'path', 'return (()=>[])()') as PreparedMatch
  #routes: Routes<T> = []

  constructor(init?: { preparedMatch: PreparedMatch }) {
    if (typeof Function === 'undefined') {
      throw new Error('This runtime does not support prepared router')
    }

    if (init?.preparedMatch) {
      this.#isInitlized = true
      this.#preparedMatch = init.preparedMatch
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
      if (!path.startsWith("/")) {
        path = `/${path}`
      }
      this.#routes.push([method, [path, pathLexer(path)], handler])
    }
  }

  match(method: string, path: string): Result<T> {
    if (!this.#isInitlized) {
      this.#buildPreparedMatch()
    }

    this.#isBuilt = true

    this.match = (method: string, path: string) => {
      return [
        this.#preparedMatch(method, path).map(([handlerIndex, params]) => [
          this.#routes[handlerIndex][2],
          params,
        ]),
      ]
    }

    return this.match(method, path)
  }

  #buildPreparedMatch() {
    this.#preparedMatch = buildPreparedMatch(this.#routes)
  }
}
