const { parseSelect, applySelect } = require('../sql.js')

describe('parseSelect', () => {
  it('parses simple SQL correctly', () => {
    const subject = "SELECT * FROM 'topic'"
    const results = parseSelect(subject)
    expect(results.select).toEqual([{ field: '*', alias: undefined }])
    expect(results.topic).toBe('topic')
    expect(results.where).toBe(undefined)
  })

  it('parses lowercase simple SQL correctly', () => {
    const subject = "select * from 'topic'"
    const results = parseSelect(subject)
    expect(results.select).toEqual([{ field: '*', alias: undefined }])
    expect(results.topic).toBe('topic')
    expect(results.where).toBe(undefined)
  })

  it('parses where clause correctly', () => {
    const subject = "SELECT * FROM 'topic' WHERE name='Bob'"
    const results = parseSelect(subject)
    expect(results.select).toEqual([{ field: '*', alias: undefined }])
    expect(results.topic).toBe('topic')
    expect(results.where).toBe("name='Bob'")
  })

  it('parses multiple SELECT properties correctly', () => {
    const subject = "SELECT name, age, maleOrFemale AS gender FROM 'topic'"
    const results = parseSelect(subject)
    expect(results.select).toEqual([
      { field: 'name', alias: undefined},
      { field: 'age', alias: undefined },
      { field: 'maleOrFemale', alias: 'gender'}
    ])
  })
})

describe('applySelect', () => {
  describe('Simple select with buffered string handled correctly', () => {
    const select = [{ field: '*', alias: undefined }]
    const payload = Buffer.from(JSON.stringify({name: 'Bob'}), 'utf8')
    const context = {}
    const event = applySelect({ select, payload, context })
    expect(event).toEqual({ name: 'Bob' })
  })

  describe('Simple select with non-JSON handled correctly', () => {
    const select = [{ field: '*', alias: undefined }]
    const payload = 'Bob'
    const context = {}
    const event = applySelect({ select, payload, context })
    expect(event).toEqual( 'Bob' )
  })

  describe('Aliased wildcard with non-JSON handled correctly', () => {
    const select = [{ field: '*', alias: 'name' }]
    const payload = 'Bob'
    const context = {}
    const event = applySelect({ select, payload, context })
    expect(event).toEqual({ 'name': 'Bob' })
  })

  describe('Unaliased wildcard plus function results in flattened output', () => {
    const select = [
      { field: '*', alias: undefined },
      { field: 'clientid()', alias: undefined }
    ]
    const clientIdFunc = jest.fn()
    const payload = Buffer.from(JSON.stringify({name: 'Bob'}), 'utf8')
    const context = { clientid: clientIdFunc }
    const event = applySelect({ select, payload, context })
    expect(clientIdFunc).toHaveBeenCalledTimes(1)
    expect(event).toEqual({ name: 'Bob' })
  })

  describe('Aliased wildcard plus function results in nested output', () => {
    const select = [
      { field: '*', alias: 'message' },
      { field: 'clientid()', alias: undefined }
    ]
    const clientIdFunc = jest.fn()
    const payload = Buffer.from(JSON.stringify({name: 'Bob'}), 'utf8')
    const context = { clientid: clientIdFunc }
    const event = applySelect({ select, payload, context })
    expect(clientIdFunc).toHaveBeenCalledTimes(1)
    expect(event).toEqual({ message: { name: 'Bob' } })
  })

  describe('Function results are appeneded to output', () => {
    const select = [
      { field: '*', alias: 'message' },
      { field: 'clientid()', alias: 'theClientId' }
    ]
    const clientIdFunc = jest.fn().mockReturnValue('12345')
    const payload = Buffer.from(JSON.stringify({name: 'Bob'}), 'utf8')
    const context = { clientid: clientIdFunc }
    const event = applySelect({ select, payload, context })
    expect(clientIdFunc).toHaveBeenCalledTimes(1)
    expect(event).toEqual({ message: { name: 'Bob' }, 'theClientId': '12345' })
  })

})
