import { RegExpRouter } from '../../../src/router/reg-exp-router/index.ts'
import { PreparedRouter } from './../../../src/router/prepared-router/index.ts';
import { TrieRouter } from '../../../src/router/trie-router/index.ts'
import { PatternRouter } from '../../../src/router/pattern-router/index.ts'
import type { Router } from '../../../src/router.ts'
import type { RouterInterface } from './tool.mts'
import { routes, handler } from './tool.mts'
import { LinearRouter } from '../../../src/router/linear-router/index.ts';

const createHonoRouter = (name: string, router: Router<unknown>): RouterInterface => {
  for (const route of routes) {
    router.add(route.method, route.path, handler)
  }
  return {
    name: `Hono ${name}`,
    match: (route) => {
      router.match(route.method, route.path)
    }
  }
}

export const regExpRouter = createHonoRouter('RegExpRouter', new RegExpRouter())
const _preparedRouter = new PreparedRouter()
export const preparedRouter = [
  createHonoRouter('PreparedRouter', _preparedRouter),
  createHonoRouter('PreparedRouter (precompiled)', new Function('return ' + _preparedRouter.build())()),
]
export const trieRouter = createHonoRouter('TrieRouter', new TrieRouter())
export const patternRouter = createHonoRouter('PatternRouter', new PatternRouter())
export const linearRouter =  createHonoRouter('LinearRouter', new LinearRouter())
