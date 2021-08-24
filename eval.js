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

module.exports = evalInContext
