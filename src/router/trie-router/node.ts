import type { Params } from '../../router'
import { METHOD_NAME_ALL } from '../../router'
import type { Pattern } from '../../utils/url'
import { getPattern, splitPath, splitRoutingPath } from '../../utils/url'

type HandlerSet<T> = {
  handler: T
  possibleKeys: string[]
  order: number
}

type HandlerParamsSet<T> = HandlerSet<T> & {
  params: Record<string, string>
}

const emptyParams: Record<string, string> = Object.create(null)

const staticRoutes = new Map()

const isStaticPath = (path: string) => {
  for (const part of splitRoutingPath(path)) {
    if (getPattern(part)) {
      return false
    }
  }
  return true
}

export class Node<T> {
  #methods: Record<string, HandlerSet<T>>[] = []
  
  #children: Record<string, Node<T>> = Object.create(null)
  #patterns: Pattern[] = []
  #order: number = 0
  #params: Record<string, string> = Object.create(null)
  #staticRoutes: Map<string, Record<string, HandlerParamsSet<T>>[]> = staticRoutes

  constructor(method?: string, handler?: T) {
    if (method && handler) {
      const m: Record<string, HandlerSet<T>> = Object.create(null)
      m[method] = { handler, possibleKeys: [], order: 0 }
      this.#methods = [m]
    }
  }

  insert(method: string, path: string, handler: T): Node<T> {
    this.#order++

    if (isStaticPath(path)) {
      const m: Record<string, HandlerParamsSet<T>> = Object.create(null)
      m[method] = { handler, possibleKeys: [], order: this.#order, params: emptyParams }
      if (!this.#staticRoutes.has(path)) {
        this.#staticRoutes.set(path, [m])
      }else {
        this.#staticRoutes.get(path)!.push(m)
      }
      return this
    }

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let curNode: Node<T> = this
    const parts = splitRoutingPath(path)

    const possibleKeys: string[] = []

    for (let i = 0, len = parts.length; i < len; i++) {
      const p: string = parts[i]

      if (curNode.#children[p]) {
        curNode = curNode.#children[p]
        const pattern = getPattern(p)
        if (pattern) {
          possibleKeys.push(pattern[1])
        }
        continue
      }

      curNode.#children[p] = new Node()

      const pattern = getPattern(p)
      if (pattern) {
        curNode.#patterns.push(pattern)
        possibleKeys.push(pattern[1])
      }
      curNode = curNode.#children[p]
    }

    const m: Record<string, HandlerSet<T>> = Object.create(null)

    const handlerSet: HandlerSet<T> = {
      handler,
      possibleKeys: possibleKeys.filter((key, i) => possibleKeys.indexOf(key) === i),
      order: this.#order,
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

    for (let i = 0, len = node.#methods.length; i < len; i++) {
      const m = node.#methods[i]
      const handlerSet = (m[method] || m[METHOD_NAME_ALL]) as HandlerParamsSet<T>
      if (handlerSet) {
        const processedSet: Record<number, boolean> = {}

        handlerSet.params = Object.create(null)
        for (let i = 0, len = handlerSet.possibleKeys.length; i < len; i++) {
          const key = handlerSet.possibleKeys[i]
          const processed = processedSet[handlerSet.order]
          handlerSet.params[key] =
            params[key] && !processed ? params[key] : nodeParams[key] ?? params[key]
          processedSet[handlerSet.order] = true
        }

        handlerSets.push(handlerSet)
      }
    }
    return handlerSets
  }

  search(method: string, path: string): [[T, Params][]] {
    const handlerSets: HandlerParamsSet<T>[] = []

    if (this.#staticRoutes.has(path)) {
      const methods = this.#staticRoutes.get(path)!

      for (let i = 0, len = methods.length; i < len; i++) {
        const m = methods[i]
        const handlerSet = (m[method] || m[METHOD_NAME_ALL]) as HandlerParamsSet<T>
        if (handlerSet) {
          handlerSets.push(handlerSet)
        }
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let curNodes: Node<T>[] = [this]
    const parts = splitPath(path)

    for (let i = 0, len = parts.length; i < len; i++) {
      const part: string = parts[i]
      const isLwildcard = i === len - 1
      const tempNodes: Node<T>[] = []

      for (let j = 0, len2 = curNodes.length; j < len2; j++) {
        const node = curNodes[j]
        const nextNode = node.#children[part]

        if (nextNode) {
          nextNode.#params = node.#params
          if (isLwildcard) {
            // '/hello/*' => match '/hello'
            if (nextNode.#children['*']) {
              handlerSets.push(
                ...this.#getHandlerSets(nextNode.#children['*'], method, node.#params, emptyParams)
              )
            }
            handlerSets.push(...this.#getHandlerSets(nextNode, method, node.#params, emptyParams))
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
            const wildcardNode = node.#children['*']
            if (wildcardNode) {
              handlerSets.push(...this.#getHandlerSets(wildcardNode, method, node.#params, emptyParams))
              tempNodes.push(wildcardNode)
            }
            continue
          }

          if (part === '') {
            continue
          }

          const [key, name, matcher] = pattern

          const child = node.#children[key]

          // `/js/:filename{[a-z]+.js}` => match /js/chunk/123.js
          const restPathString = parts.slice(i).join('/')

          const isRegExp = matcher instanceof RegExp

          if (isRegExp && matcher.test(restPathString)) {
            params[name] = restPathString
            handlerSets.push(...this.#getHandlerSets(child, method, node.#params, params))
            continue
          }

          if (!isRegExp || matcher.test(part)) {
            params[name] = part
            if (isLwildcard) {
              handlerSets.push(...this.#getHandlerSets(child, method, params, node.#params))
              if (child.#children['*']) {
                handlerSets.push(
                  ...this.#getHandlerSets(child.#children['*'], method, params, node.#params)
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
      handlerSets.sort((a, b) => {
        return a.order - b.order
      })
    }

    this.#params = Object.create(null)

    return [handlerSets.map(({ handler, params }) => [handler, params] as [T, Params])]
  }
}
