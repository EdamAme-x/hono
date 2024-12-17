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
  })
})
