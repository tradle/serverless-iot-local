const Aedes = require('aedes')
const { createServer } = require('aedes-server-factory')
const aedesPersistenceRedis = require('aedes-persistence-redis')
const mqEmitterRedis = require('mqemitter-redis')

function createAWSLifecycleEvent ({ type, clientId, topics }) {
  // http://docs.aws.amazon.com/iot/latest/developerguide/life-cycle-events.html#subscribe-unsubscribe-events
  const event = {
    clientId,
    timestamp: Date.now(),
    eventType: type,
    sessionIdentifier: '00000000-0000-0000-0000-000000000000',
    principalIdentifier: '000000000000/ABCDEFGHIJKLMNOPQRSTU:some-user/ABCDEFGHIJKLMNOPQRSTU:some-user'
  }

  if (topics) {
    event.topics = topics
  }

  return event
}

/**
 * https://github.com/aws/aws-sdk-js/blob/master/clients/iot.d.ts#L349
 * 
 * @param {Object} opts Module options
 * @param {Object} aedesOpts Aedes options
 */
function createMQTTBroker ({ host, port, httpPort, redis }, debug) {
  const persistence = aedesPersistenceRedis(redis)
  const mq = mqEmitterRedis(redis)
  const aedes = new Aedes({ mq, persistence })
  aedes.on('ready', () => debug('Aedes server is up and running'))
  aedes.on('client', client => publishClient('connected', client.id))
  aedes.on('clientDisconnect', client => publishClient('disconnected', client.id))
  aedes.on('subscribe', (subscriptions, client) => publishSubscription('subscribed', client.id, subscriptions))
  aedes.on('unsubscribe', (subscriptions, client) => publishSubscription('unsubscribed', client.id, subscriptions))

  const tcp = createServer(aedes)
  const http = createServer(aedes, {
    ws: true
  })

  debug(`Listening to Aedes tcp at ${host}:${port}`)
  tcp.listen(port, () => {
    debug(`Aedes tcp is up and running at ${host}:${port}`)
  })
  debug(`Listening to Aedes http at ${host}:${httpPort}`)
  http.listen(httpPort, () => {
    debug(`Aedes http is up and running at ${host}:${httpPort}`)
  })

  return { aedes, tcp, http, persistence, mq }

  function publishClient (type, clientId) {
    debug(`Publishing client ${type}/${clientId}`)
    aedes.publish({
      topic: `$aws/events/presence/${type}/${clientId}`,
      payload: JSON.stringify(createAWSLifecycleEvent({
        type,
        clientId
      }))
    })
  }

  function publishSubscription (type, clientId, subscriptions) {
    debug(`Publishing subscription ${type}/${clientId}`)
    aedes.publish({
      topic: `$aws/events/subscriptions/${type}/${clientId}`,
      payload: JSON.stringify(createAWSLifecycleEvent({
        type,
        clientId,
        topics: subscriptions
      }))
    })
  }
}

module.exports = createMQTTBroker
