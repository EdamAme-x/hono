import type { Params } from '../../router'
import { METHOD_NAME_ALL } from '../../router'
import type { Pattern } from '../../utils/url'
import { getPattern, splitPath, splitRoutingPath } from '../../utils/url'

const isStaticPath = (path: string): boolean => {
  const parts = splitRoutingPath(path)

  for (const part of parts) {
    if (getPattern(part)) {
      return false
    }
  }

  return true
}

type HandlerSet<T> = {
  handler: T
  possibleKeys: string[]
  score: number
}

type HandlerParamsSet<T> = HandlerSet<T> & {
  params: Record<string, string>
}

export class Node<T> {
  #methods: Record<string, HandlerSet<T>>[]

  #children: Map<string, Node<T>>
  #patterns: Pattern[]
  #order: number = 0
  #params: Record<string, string> = Object.create(null)
  #staticRoutes: Record<string, Record<string, HandlerParamsSet<T>[]>> = Object.create(null)

  constructor(method?: string, handler?: T, children?: Map<string, Node<T>>) {
    this.#children = children || new Map()
    this.#methods = []
    if (method && handler) {
      const m: Record<string, HandlerSet<T>> = Object.create(null)
      m[method] = { handler, possibleKeys: [], score: 0 }
      this.#methods = [m]
    }
    this.#patterns = []
  }

  insert(method: string, path: string, handler: T): Node<T> {
    this.#order = ++this.#order

    // Optmization for static routes
    if (isStaticPath(path)) {
      const methodMap = this.#staticRoutes[path] || Object.create(null)
      const staticHandlerSet: HandlerParamsSet<T> = {
        handler,
        score: this.#order,
        possibleKeys: [],
        params: Object.create(null),
      }

      methodMap[method] = [...(methodMap[method] || []), staticHandlerSet]
      this.#staticRoutes[path] = methodMap

      return this
    }

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let curNode: Node<T> = this
    const parts = splitRoutingPath(path)

    const possibleKeys: string[] = []

    for (const p of parts) {
      if ([...curNode.#children.keys()].includes(p)) {
        curNode = curNode.#children.get(p)!
        const pattern = getPattern(p)
        if (pattern) {
          possibleKeys.push(pattern[1])
        }
        continue
      }

      curNode.#children.set(p, new Node())

      const pattern = getPattern(p)
      if (pattern) {
        curNode.#patterns.push(pattern)
        possibleKeys.push(pattern[1])
      }
      curNode = curNode.#children.get(p)!
    }

    const m: Record<string, HandlerSet<T>> = Object.create(null)

    const handlerSet: HandlerSet<T> = {
      handler,
      possibleKeys: possibleKeys.filter((v, i, a) => a.indexOf(v) === i),
      score: this.#order,
    }

    m[method] = handlerSet
    curNode.#methods.push(m)

    return curNode
  }

  #getHandlerSets(
    node: Node<T>,
    method: string,
    nodeParams: Record<string, string>,
    params: Record<string, string>
  ): HandlerParamsSet<T>[] {
    const handlerSets: HandlerParamsSet<T>[] = []
    for (const m of node.#methods) {
      const handlerSet = (m[method] || m[METHOD_NAME_ALL]) as HandlerParamsSet<T>
      const processedSet: Record<number, boolean> = {}
      if (handlerSet !== undefined) {
        handlerSet.params = Object.create(null)
        for (const key of handlerSet.possibleKeys) {
          const processed = processedSet[handlerSet.score]
          handlerSet.params[key] =
            params[key] && !processed ? params[key] : nodeParams[key] ?? params[key]
          processedSet[handlerSet.score] = true
        }

        handlerSets.push(handlerSet)
      }
    }
    return handlerSets
  }

  search(method: string, path: string): [[T, Params][]] {
    const handlerSets: HandlerParamsSet<T>[] = []

    const methodMap = this.#staticRoutes[path]

    if (methodMap) {
      const staticHandlerSetsByMethod = methodMap[method]

      if (staticHandlerSetsByMethod) {
        handlerSets.push(...staticHandlerSetsByMethod)
      }

      const staticHandlerSetsByAll = methodMap[METHOD_NAME_ALL]

      if (staticHandlerSetsByAll) {
        handlerSets.push(...staticHandlerSetsByAll)
      }
    }

    this.#params = Object.create(null)

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const curNode: Node<T> = this
    let curNodes = [curNode]
    const parts = splitPath(path)

    for (let i = 0, len = parts.length; i < len; i++) {
      const part: string = parts[i]
      const isLast = i === len - 1
      const tempNodes: Node<T>[] = []

      for (let j = 0, len2 = curNodes.length; j < len2; j++) {
        const node = curNodes[j]
        const nextNode = node.#children.get(part)!

        if (nextNode) {
          nextNode.#params = node.#params
          if (isLast) {
            // '/hello/*' => match '/hello'
            if (nextNode.#children.has('*')) {
              handlerSets.push(
                ...this.#getHandlerSets(
                  nextNode.#children.get('*')!,
                  method,
                  node.#params,
                  Object.create(null)
                )
              )
            }
            handlerSets.push(
              ...this.#getHandlerSets(nextNode, method, node.#params, Object.create(null))
            )
          } else {
            tempNodes.push(nextNode)
          }
        }

        for (let k = 0, len3 = node.#patterns.length; k < len3; k++) {
          const pattern = node.#patterns[k]

          const params = { ...node.#params }

          // Wildcard
          // '/hello/*/foo' => match /hello/bar/foo
          if (pattern === '*') {
            const astNode = node.#children.get('*')
            if (astNode) {
              handlerSets.push(
                ...this.#getHandlerSets(astNode, method, node.#params, Object.create(null))
              )
              tempNodes.push(astNode)
            }
            continue
          }

          if (part === '') {
            continue
          }

          const [key, name, matcher] = pattern

          const child = node.#children.get(key)!

          // `/js/:filename{[a-z]+.js}` => match /js/chunk/123.js
          const restPathString = parts.slice(i).join('/')
          if (matcher instanceof RegExp && matcher.test(restPathString)) {
            params[name] = restPathString
            handlerSets.push(...this.#getHandlerSets(child, method, node.#params, params))
            continue
          }

          if (matcher === true || matcher.test(part)) {
            params[name] = part
            if (isLast) {
              handlerSets.push(...this.#getHandlerSets(child, method, params, node.#params))
              if (child.#children.has('*')) {
                handlerSets.push(
                  ...this.#getHandlerSets(child.#children.get('*')!, method, params, node.#params)
                )
              }
            } else {
              child.#params = params
              tempNodes.push(child)
            }
          }
        }
      }

      curNodes = tempNodes
    }

    if (handlerSets.length > 1) {
      handlerSets.sort((a, b) => a.score - b.score)
    }

    return [handlerSets.map(({ handler, params }) => [handler, params] as [T, Params])]
  }
}