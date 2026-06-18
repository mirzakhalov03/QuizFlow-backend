import * as chaiModule from 'chai'

declare global {
  var chai: typeof chaiModule
  var expect: typeof chaiModule.expect
}

;(globalThis as unknown as { chai: typeof chaiModule }).chai = chaiModule
;(globalThis as unknown as { expect: typeof chaiModule.expect }).expect = chaiModule.expect

const expect = chaiModule.expect
const chai = chaiModule

export { chai, expect }
