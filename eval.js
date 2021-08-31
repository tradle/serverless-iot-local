// TODO: trim(), ltrim(), etc

const evalInContext = (js, context) => {
  /* eslint-disable */
  const { clientid, topic, principal } = context
  try {
    return eval(js)
  } catch (err) {
    debugger
    console.log(`failed to evaluate: ${js}`)
    throw err
  }
  /* eslint-enable */
}

module.exports = evalInContext
