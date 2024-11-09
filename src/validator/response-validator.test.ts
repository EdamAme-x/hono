import { Hono } from '..'
import { responseValidator } from './response-validator'

const app = new Hono()

app.get('/', (c) => {
    return c.text('hello world')
}, responseValidator('text'))

export default app