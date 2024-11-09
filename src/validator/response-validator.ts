import { HTTPException } from '../http-exception'
import type { Env, MiddlewareHandler } from '../types'
import { parse } from '../utils/cookie'

type ValidationTargetKeys = 'text' | 'json' | 'header' | 'cookie'

const textRegex = /^text\/plain(;\s*[a-zA-Z0-9\-]+\=([^;]+))*$/
const jsonRegex = /^application\/([a-z-\.]+\+)?json(;\s*[a-zA-Z0-9\-]+\=([^;]+))*$/

export const responseValidator = <
    U extends ValidationTargetKeys,
    P extends string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    E extends Env = any, 
>(
    target: U
): MiddlewareHandler<E, P> => {
    return async (c, next) => {
        await next()

        let value
        const contentType = c.res.headers.get('content-type')

        switch (target) {
            case 'json':
                if (!contentType || !jsonRegex.test(contentType)) {
                    break
                }
                try {
                    value = await c.res.clone().json()
                } catch {
                    const message = 'Malformed JSON in response body'
                    throw new HTTPException(500, { message })
                }

                break
            case 'text':
                if (!contentType || !textRegex.test(contentType)) {
                    break
                }
                value = await c.res.clone().text()
                break
            case 'header':
                value = Object.fromEntries(await c.res.headers.entries())
                break
            case 'cookie':
                value = parse(c.res.headers.get('set-cookie') || '')
                break
        }

        console.log(value)
    }
}