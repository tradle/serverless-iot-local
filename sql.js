const evalInContext = require('./eval')
const BASE64_PLACEHOLDER = '*b64'
const SQL_REGEX = /^SELECT (.*) FROM '([^']+)'$/
const SELECT_PART_REGEX = /^(.*?)(?: as (.*))?$/

const parseSelect = sql => {
  // if (/\([^)]/.test(sql)) {
  //   throw new Error(`AWS Iot SQL functions in this sql are not yet supported: ${sql}`)
  // }

  const [select, topic] = sql.match(SQL_REGEX).slice(1)
  return {
    select: select
      // hack
      .replace("encode(*, 'base64')", BASE64_PLACEHOLDER)
      .split(',')
      .map(s => s.trim())
      .map(parseSelectPart),
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

const applySelect = ({ select, payload, context }) => {
  const event = {}
  let json
  try {
    json = JSON.parse(payload)
  } catch (err) {
    json = payload
  }

  if (select.length === 1 && !select[0].alias) {
    return json
  }

  const payloadReplacement = Buffer.isBuffer(payload)
    ? `new Buffer('${payload.toString('base64')}', 'base64')`
    : payload

  for (const part of select) {
    const { alias, field } = part
    const key = alias || field
    if (field === '*') {
      event[key] = json
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
}
