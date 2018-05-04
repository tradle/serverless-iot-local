const test = require('tape')
const sinon = require('sinon')
const { parseSelect, applySelect } = require('../sql.js')

test('parseSelect - parses simple SQL correctly', (t) => {
  const subject = "SELECT * FROM 'topic'"
  const results = parseSelect(subject)
  t.deepEqual(results.select, [{ field: '*', alias: undefined }])
  t.equal(results.topic, 'topic')
  t.equal(results.where, undefined)
  t.end()
})

test('parseSelect - parses lowercase simple SQL correctly', (t) => {
  const subject = "select * from 'topic'"
  const results = parseSelect(subject)
  t.deepEqual(results.select, [{ field: '*', alias: undefined }])
  t.equal(results.topic, 'topic')
  t.equal(results.where, undefined)
  t.end()
})

test('parseSelect - parses where clause correctly', (t) => {
  const subject = "SELECT * FROM 'topic' WHERE name='Bob'"
  const results = parseSelect(subject)
  t.deepEqual(results.select, [{ field: '*', alias: undefined }])
  t.equal(results.topic, 'topic')
  t.equal(results.where, "name='Bob'")
  t.end()
})

test('parseSelect - parses multiple SELECT properties correctly', (t) => {
  const subject = "SELECT name, age, maleOrFemale AS gender FROM 'topic'"
  const results = parseSelect(subject)
  t.deepEqual(results.select, [
    { field: 'name', alias: undefined},
    { field: 'age', alias: undefined },
    { field: 'maleOrFemale', alias: 'gender'}
  ])
  t.end()
})

test('applySelect - Simple select with buffered string handled correctly', (t) => {
  const select = [{ field: '*', alias: undefined }]
  const payload = Buffer.from(JSON.stringify({name: 'Bob'}), 'utf8')
  const context = {}
  const event = applySelect({ select, payload, context })
  t.deepEqual(event, { name: 'Bob' })
  t.end()
})

test('applySelect - Simple select with non-JSON handled correctly', (t) => {
  const select = [{ field: '*', alias: undefined }]
  const payload = 'Bob'
  const context = {}
  const event = applySelect({ select, payload, context })
  t.equal(event, 'Bob')
  t.end()
})

test('applySelect - Aliased wildcard with non-JSON handled correctly', (t) => {
  const select = [{ field: '*', alias: 'name' }]
  const payload = 'Bob'
  const context = {}
  const event = applySelect({ select, payload, context })
  t.deepEqual(event, { 'name': 'Bob'})
  t.end()
})

test('applySelect - Unaliased wildcard plus function results in flattened output', (t) => {
  const select = [
    { field: '*', alias: undefined },
    { field: 'clientid()', alias: undefined }
  ]
  const clientIdFunc = sinon.stub().returns(undefined);
  const payload = Buffer.from(JSON.stringify({name: 'Bob'}), 'utf8')
  const context = { clientid: clientIdFunc }
  const event = applySelect({ select, payload, context })
  t.ok(clientIdFunc.calledOnce)
  t.deepEqual(event, { name: 'Bob', 'clientid()': undefined })
  t.end()
})

test('applySelect - Aliased wildcard plus function results in nested output', (t) => {
  const select = [
    { field: '*', alias: 'message' },
    { field: 'clientid()', alias: undefined }
  ]
  const clientIdFunc = sinon.stub().returns(undefined);
  const payload = Buffer.from(JSON.stringify({name: 'Bob'}), 'utf8')
  const context = { clientid: clientIdFunc }
  const event = applySelect({ select, payload, context })
  t.ok(clientIdFunc.calledOnce)
  t.deepEqual(event, { message: { name: 'Bob' }, 'clientid()': undefined })
  t.end()
})

test('applySelect - Function results are appeneded to output', (t) => {
  const select = [
    { field: '*', alias: 'message' },
    { field: 'clientid()', alias: 'theClientId' }
  ]
  const clientIdFunc = sinon.stub().returns('12345')
  const payload = Buffer.from(JSON.stringify({name: 'Bob'}), 'utf8')
  const context = { clientid: clientIdFunc }
  const event = applySelect({ select, payload, context })
  t.ok(clientIdFunc.calledOnce)
  t.deepEqual(event, { message: { name: 'Bob' }, 'theClientId': '12345' })
  t.end()
})
