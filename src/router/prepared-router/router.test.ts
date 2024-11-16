import { runTest } from '../common.case.test'
import { PreparedRouter } from './router'

describe('PreparedRouter', () => {
  runTest({
    newRouter: () => new PreparedRouter(),
  })

  describe('Works', () => {
    it('No prefix "/"', () => {
      const router = new PreparedRouter<string>()
      router.add('GET', 'posts', 'get post')

      expect(router.match('GET', '/posts')).toEqual([[['get post', {}]]])
    })
  })
})
