import { runTest } from '../common.case.test'
import { RadixRouter } from './router'

describe('RadixRouter', () => {
  runTest({
    newRouter: () => new RadixRouter(),
  })
})
