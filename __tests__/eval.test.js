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


/* describe('evalInContext', () => {
  it('evals global variable', () => {
    global.property = 'property'
    expect(evalInContext('property', {})).toBe('property')
  })

  it('evals function in context', () => {
    const clientid = jest.fn().mockReturnValue('test')
    expect(evalInContext('clientid()', { clientid })).toBe('test')
  })

  it('throws error if variable does not exist', () => {
    expect(() => evalInContext('notHere', {})).toThrowError()
  })
}) */