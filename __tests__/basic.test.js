if (process.env.SLS_DEBUG === undefined) {
  process.env.SLS_DEBUG = '*'
}

const test = require('tape')
const ServerlessIoTLocal = require('../')
const { randomBytes } = require('crypto')
const awsIot = require('aws-iot-device-sdk')
const promisify = require('pify')
const debug = require('debug')('serverless-iot-local-test')

const serverless = {
  cli: {
    log: debug
  },
  service: {
    custom: {},
    service: 'x',
    provider: {
      environment: '',
      stage: '',
      runtime: '',
      region: '',
      timeout: 0
    },
    functions: {},
    getFunction (key) {}
  },
  
  getProvider (_name /* aws */) {
    return {
      naming: {
        getStackName () {
          return ''
        }
      }
    }
  },
  config: {
    servicePath: 'abcd'
  },
  pluginManager: {
    plugins: []
  }
}

function createClient () {
  const client = awsIot.device({
    protocol: 'ws',
    port: 1884,
    host: 'localhost'
  })
  return promisify(client)
}

test('Basic server test', async t => {
  const inst = new ServerlessIoTLocal(serverless, {
    redis: {
      host: process.env.REDIS_HOST || process.env.TRADLE_LOCAL_IP ,
      port: process.env.REDIS_PORT
    }
  })
  inst.startHandler()
  t.pass('waiting 300ms')
  await new Promise(resolve => setTimeout(resolve, 300))
  t.pass('creating clients')
  const client1 = createClient()
  const client2 = createClient()
  t.pass('subscribing client')
  await client2.subscribe('test', { qos: 1 })
  t.pass('init receiving client')
  const receive = new Promise(resolve => {
    client2.handleMessage = message => resolve(message.payload.toString())
  })
  t.pass('publishing message')
  const payload = randomBytes(6).toString('hex')
  const [_, data] = await Promise.all([
    client1.publish('test', payload, { qos: 1 }).then(() => t.pass('data sent')),
    receive
  ])
  t.equals(data, payload, `expected test data "${payload}" received`)
  
  await Promise.all([
    client2.end(),
    client1.end()
  ])
  inst.endHandler()
})
