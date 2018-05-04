const test = require('tape')
const sinon = require('sinon')
const evalInContext = require('../eval')

test('evalInContext - evals global variable', (t) => {
  global.property = 'property'
  t.equal(evalInContext('property', {}), 'property')
  t.end()
})

test('evalInContext - evals function in context', (t) => {
  const clientid = sinon.stub().returns('test')
  t.equal(evalInContext('clientid()', { clientid }), 'test')
  t.end()
})

test('throws error if variable does not exist', (t) => {
  t.throws((() => evalInContext('notHere', {})))
  t.end()
})
