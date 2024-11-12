import type { Params, Result, Router } from '../../router'
import { checkOptionalParameter } from '../../utils/url'
import { buildPreparedMatch } from './builder'
import { pathLexer } from './lexer'
import type { PathTree } from './lexer'

export type PreparedMatch = (method: string, path: string) => [number, Params][]
export type Routes<T> = [string, [string, PathTree], T][]

export class PreparedRouter<T> implements Router<T> {
  name: string = 'PreparedRouter'
  #preparedMatch = new Function('method', 'path', 'return (()=>[])()') as PreparedMatch
  #routes: Routes<T> = []

  constructor(init?: { PreparedMatch: Function }) {
    if (typeof Function === 'undefined') {
      throw new Error('This runtime does not support prepared router')
    }

    if (init?.PreparedMatch) {
      this.#preparedMatch = init.PreparedMatch as PreparedMatch
    }
  }

  add(method: string, path: string, handler: T) {
    const optionalParameter = checkOptionalParameter(path)
    if (optionalParameter) {
      optionalParameter.forEach((p) => this.add(method, p, handler))
    } else {
      this.#routes.push([method, [path, pathLexer(path)], handler])
      this.#buildPreparedMatch()
    }
  }

  match(method: string, path: string): Result<T> {
    return [
      this.#preparedMatch(method, path).map(([handlerIndex, params]) => [
        this.#routes[handlerIndex][2],
        params,
      ]),
    ]
  }

  #buildPreparedMatch() {
    this.#preparedMatch = buildPreparedMatch(this.#routes)
  }
}