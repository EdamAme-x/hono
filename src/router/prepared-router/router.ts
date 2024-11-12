import type { Params, Result, Router } from '../../router'
import { checkOptionalParameter } from '../../utils/url'
import { pathLexer } from './lexer'
import type { PathTree } from './lexer'

/*
Generate Function
*/

export class PreparedRouter<T> implements Router<T> {
  name: string = 'PreparedRouter'
  #preparedMatchFunction = new Function('method', 'path', 'return (()=>[])()') as (
    method: string,
    path: string
  ) => [number, Params][]
  #routes: [string, [string, PathTree], T][] = []
 
  constructor(init?: {
    preparedMatchFunction: Function
  }) {
    if (typeof Function === 'undefined') {
      throw new Error('This runtime does not support prepared router')
    }

    Object.assign(this, init)
  }

  add(method: string, path: string, handler: T) {
    const optionalParameter = checkOptionalParameter(path)
    if (optionalParameter) {
      optionalParameter.forEach((p) => this.add(method, p, handler))
    }else {
      this.#routes.push([method, [path, pathLexer(path)], handler])
      this.#buildPreparedMatchFunction()
    }
  }

  match(method: string, path: string): Result<T> {
    return [this.#preparedMatchFunction(method, path).map(([handlerIndex, params]) => [this.#routes[handlerIndex][2], params])]
  }

  #buildPreparedMatchFunction() {
    const methodsWithRoutes: Record<string, [number, string, PathTree][]> = Object.create(null)

    for (let i = 0, len = this.#routes.length; i < len; i++) {
      const [method, [path, tree]] = this.#routes[i]

      if (!methodsWithRoutes[method]) {
        methodsWithRoutes[method] = []
      }

      methodsWithRoutes[method].push([i, path, tree])
    }


    this.#preparedMatchFunction = new Function(
      'method',
      'path',
      `return (() => {
        const matchResult = []

        return matchResult
      })()`
    ) as (method: string, path: string) => [number, Params][]
  }
}
