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

export class Node<T> {
  #methods: Record<string, HandlerSet<T>>[] = []

  #children: Record<string, Node<T>>
  #patterns: Pattern[] = []
  #order: number = 0
  #params: Record<string, string> = Object.create(null)

  constructor(method?: string, handler?: T, children?: Record<string, Node<T>>) {
    this.#children = children || Object.create(null)
    if (method && handler) {
      const m: Record<string, HandlerSet<T>> = Object.create(null)
      m[method] = { handler, possibleKeys: [], order: 0 }
      this.#methods = [m]
    }
  }

  insert(method: string, path: string, handler: T): Node<T> {
    this.#order++

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let curNode: Node<T> = this
    const parts = splitRoutingPath(path)

    const possibleKeys: string[] = []

    for (let i = 0, len = parts.length; i < len; i++) {
      const p: string = parts[i]

      if (Object.keys(curNode.#children).includes(p)) {
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

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let curNodes: Node<T>[] = [this]
    const parts = splitPath(path)

    for (let i = 0, len = parts.length; i < len; i++) {
      const part: string = parts[i]
      const isLast = i === len - 1
      const tempNodes: Node<T>[] = []

      console.log(curNodes)

      for (let j = 0, len2 = curNodes.length; j < len2; j++) {
        const node = curNodes[j]
        const nextNode = node.#children[part]

        if (nextNode) {
          nextNode.#params = node.#params
          if (isLast) {
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
            const astNode = node.#children['*']
            if (astNode) {
              handlerSets.push(...this.#getHandlerSets(astNode, method, node.#params, emptyParams))
              tempNodes.push(astNode)
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
            if (isLast) {
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
