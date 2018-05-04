const evalInContext = require('../eval')

describe('evalInContext', () => {
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
})