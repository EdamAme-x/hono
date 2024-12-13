import { MESSAGE_MATCHER_IS_ALREADY_BUILT } from '../../router'
import type { Params, Result, Router } from '../../router'
import { checkOptionalParameter } from '../../utils/url'
import { buildPreparedMatch } from './builder'
import { pathLexer } from './lexer'
import type { PathTree } from './lexer'

export type PreparedMatch<T> = (method: string, path: string, createParams: new () => Params, ...handlers: T[]) => [T, Params][]
export type Routes<T> = [string, [string, PathTree], T, number][]

const emptyParams = Object.create(null)
const createParams = (() => {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const E = function () {}
  E.prototype = emptyParams
  return E
})() as unknown as { new (): Params }

export class PreparedRouter<T> implements Router<T> {
  name: string = 'PreparedRouter'
  #isBuilt = false
  #preparedMatch = new Function('method', 'path', 'return (()=>[])()') as PreparedMatch<T>
  #routes: Routes<T> = []
  #handlers: T[] = []

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
      this.#routes.push([method, [path, pathLexer(path)], handler, this.#routes.length])
    }
  }

  match(method: string, path: string): Result<T> {
    this.#buildPreparedMatch()

    this.#isBuilt = true

    this.match = (method: string, path: string) => {
      return [this.#preparedMatch(method, path, createParams, ...this.#handlers)]
    }

    return this.match(method, path)
  }

  #buildPreparedMatch() {
    this.#handlers = this.#routes.map((route) => route[2])
    this.#preparedMatch = buildPreparedMatch(this.#routes)
  }
}

const router = new PreparedRouter()

router.add('GET', '/', '/')
router.add('GET', '/*', '/*')
router.add('GET', '*', '*')
router.add('GET', '/x', '/x')
router.add('GET', '/x/*', '/x/*')

console.log(router.match('GET', '/x'))
