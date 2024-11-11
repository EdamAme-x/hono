import type { Params, Result, Router } from '../../router'
import { checkOptionalParameter } from '../../utils/url'

/*
Generate Function
*/

export class PreparedRouter<T> implements Router<T> {
  name: string = 'PreparedRouter'
  #preparedMatchFunction = new Function('method', 'path', 'return (()=>[])') as (
    method: string,
    path: string
  ) => [T, Params][]
  routes: [string, string, T][] = []

  constructor() {
    if (typeof Function === 'undefined') {
      throw new Error('This runtime does not support prepared router')
    }
  }

  add(method: string, path: string, handler: T) {
    const optionalParameter = checkOptionalParameter(path)
    if (optionalParameter) {
      optionalParameter.forEach((p) => this.add(method, p, handler))
    }else {
      this.routes.push([method, path, handler])
      this.#buildPreparedMatchFunction()
    }
  }

  match(method: string, path: string): Result<T> {
    return [this.#preparedMatchFunction(method, path)]
  }

  #buildPreparedMatchFunction() {

  }
}
