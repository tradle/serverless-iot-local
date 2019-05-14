// TODO: trim(), ltrim(), etc

const evalInContext = (js, context) => {
  const { clientid, topic, principal } = context
  try {
    return eval(js)
  } catch (err) {
    debugger
    console.log(`failed to evaluate: ${js}`)
    throw err
  }
}

const encode = (data, encoding) => {
  if (encoding !== 'base64') {
    throw new Error('AWS Iot SQL encode() function only supports base64 as an encoding')
  }

  return data.toString(encoding)
}

module.exports = evalInContext
