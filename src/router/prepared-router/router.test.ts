import { runTest } from '../common.case.test'
import { PreparedRouter } from './router'

describe('PreparedRouter', () => {
  runTest({
    newRouter: () => new PreparedRouter(),
  })

  describe('Works', () => {
    it("Includes ' and \n", () => {
      const router = new PreparedRouter<string>()
      router.add("CUSTOM'", '/posts/123\n', 'get post')

      expect(router.match("CUSTOM'", '/posts/123\n')).toEqual([[['get post', {}]]])
    })

    it("Precompiled", () => {
      const router = new PreparedRouter<string>()
      router.add('GET', '/posts', 'get posts')
      router.add('POST', '/post', 'create post')
      router.add('DELETE', '/posts/:id', 'delete post')
      router.add('POST', '/posts/:id/*', 'post assets')

      const precompiledRouter = new Function("return " + router.build())()

      precompiledRouter.add('GET', '/posts', 'get posts')
      precompiledRouter.add('POST', '/post', 'create post')
      precompiledRouter.add('DELETE', '/posts/:id', 'delete post')
      precompiledRouter.add('POST', '/posts/:id/*', 'post assets')

      expect(precompiledRouter.match('GET', '/posts')).toEqual([[['get posts', {}]]])
      expect(precompiledRouter.match('POST', '/post')).toEqual([[['create post', {}]]])
      expect(precompiledRouter.match('DELETE', '/posts/123')).toEqual([[['delete post', { id: '123' }]]])
      expect(precompiledRouter.match('POST', '/posts/123/abc')).toEqual([[['post assets', { id: '123' }]]])
    })
  })
})
