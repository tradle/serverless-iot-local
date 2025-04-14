const evalInContext = require('./eval')
const BASE64_PLACEHOLDER = '*b64'
const SQL_REGEX = /^SELECT (.*)\s+FROM\s+'([^']+)'\s*(?:WHERE\s(.*))?$/i
const SELECT_PART_REGEX = /^(.*?)(?: AS (.*))?$/i

const parseSelect = (options) => {
  if (typeof options === 'string') {
    options = { sql: options }
  }
  let { sql, stackName } = options
  // if (/\([^)]/.test(sql)) {
  //   throw new Error(`AWS Iot SQL functions in this sql are not yet supported: ${sql}`)
  // }

  if (typeof sql === 'object') {
    const sub = sql['Fn::Sub']
    if (!sub) {
      throw new Error('expected sql to be a string or have Fn::Sub')
    }

    sql = sub.replace(/\$\{AWS::StackName\}/g, stackName)
  }

  const [select, topic, where] = sql.match(SQL_REGEX).slice(1)
  return {
    select: select
      // hack
      .replace("encode(*, 'base64')", BASE64_PLACEHOLDER)
      .split(',')
      .map(s => s.trim())
      .map(parseSelectPart),
    where,
    topic
  }
}

const parseSelectPart = part => {
  const [field, alias] = part.match(SELECT_PART_REGEX).slice(1)
  return {
    field,
    alias
  }
}

const brace = Buffer.from('{')[0]
const bracket = Buffer.from('[')[0]
const doubleQuote = Buffer.from('"')[0]
// to avoid stopping here when Stop on Caught Exceptions is on
const maybeParseJSON = val => {
  switch (val[0]) {
    case brace:
    case bracket:
    case doubleQuote:
      try {
        return JSON.parse(val)
      } catch (err) {}
  }

  return val
}

const applySelect = ({ select, payload, context }) => {
  const event = {}
  const json = maybeParseJSON(payload)
  if (select.length === 1 && !select[0].alias) {
    return json
  }

  const payloadReplacement = Buffer.isBuffer(payload)
    ? `Buffer.from('${payload.toString('base64')}', 'base64')`
    : payload

  for (const part of select) {
    const { alias, field } = part
    const key = alias || field
    if (field === '*') {
      /*
       * If there is an alias for the wildcard selector, we want to include the fields in a nested key.
       * SELECT * as message, clientid() from 'topic'
       * { message: { fieldOne: 'value', ...}}
       *
       * Otherwise, we want the fields flat in the resulting event object.
       * SELECT *, clientid() from 'topic'
       * { fieldOne: 'value', ...}
       */
      if (alias) {
        event[key] = json
      } else {
        Object.assign(event, json)
      }
      continue
    }

    const js = field.replace(BASE64_PLACEHOLDER, payloadReplacement)
    event[key] = evalInContext(js, context)
  }

  return event
}

module.exports = {
  parseSelect,
  applySelect
  // parseWhere
}
