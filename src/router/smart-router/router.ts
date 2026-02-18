import type { Result, Router } from '../../router'
import { MESSAGE_MATCHER_IS_ALREADY_BUILT, UnsupportedPathError } from '../../router'

type Route<T> = [method: string, path: string, handler: T][]

export class SmartRouter<T> implements Router<T> {
  name: string = 'SmartRouter'
  #routers?: Router<T>[]
  #routes?: Route<T>
  #activeRouter?: Router<T>

  constructor(init: { routers: Router<T>[] }) {
    this.#routers = init.routers
    this.#routes = []
  }

  add(method: string, path: string, handler: T) {
    const routes = this.#routes
    if (!routes) {
      throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT)
    }

    routes.push([method, path, handler])
  }

  match(method: string, path: string): Result<T> {
    const routes = this.#routes
    const routers = this.#routers
    if (!routes || !routers) {
      throw new Error('Fatal error')
    }

    const [router, result] = this.#selectActiveRouter(routers, routes, method, path)

    this.match = router.match.bind(router)
    this.#activeRouter = router
    this.#routers = undefined
    this.#routes = undefined
    this.name = `SmartRouter + ${router.name}`

    return result
  }

  get activeRouter(): Router<T> {
    if (!this.#activeRouter) {
      throw new Error('No active router has been determined yet.')
    }

    return this.#activeRouter
  }

  #selectActiveRouter(
    routers: Router<T>[],
    routes: Route<T>,
    method: string,
    path: string
  ): [Router<T>, Result<T>] {
    for (let i = 0, len = routers.length; i < len; i++) {
      const router = routers[i]
      const result = this.#tryMatch(router, routes, method, path)
      if (result) {
        return [router, result]
      }
    }

    throw new Error('Fatal error')
  }

  #tryMatch(
    router: Router<T>,
    routes: Route<T>,
    method: string,
    path: string
  ): Result<T> | null {
    try {
      for (let i = 0, len = routes.length; i < len; i++) {
        const route = routes[i]
        router.add(route[0], route[1], route[2])
      }
      return router.match(method, path)
    } catch (error) {
      if (error instanceof UnsupportedPathError) {
        return null
      }
      throw error
    }
  }
}
