const path = require('path')
const _ = require('lodash')
const mqtt = require('mqtt')
const mqttMatch = require('mqtt-match')
const realAWS = require('aws-sdk')
const AWS = require('aws-sdk-mock')
AWS.setSDK(path.resolve('node_modules/aws-sdk'))
const extend = require('xtend')
const IP = require('ip')
const redis = require('redis')
const SQL = require('./sql')
const evalInContext = require('./eval')
const createMQTTBroker = require('./broker')
// TODO: send PR to serverless-offline to export this
const functionHelper = require('serverless-offline/src/functionHelper')
let createLambdaContext;

try {
    createLambdaContext  = require('serverless-offline/src/createLambdaContext');
} catch (e) {
    try {
        // latest serverless-offline changed the file name
        createLambdaContext = require('serverless-offline/src/LambdaContext');
    } catch (e2) {
        throw new Error('Unable to find LambdaContext file');
    }
}

const VERBOSE = typeof process.env.SLS_DEBUG !== 'undefined'
const defaultOpts = {
  host: 'localhost',
  location: '.',
  port: 1883, // HTTP
  securePort: 8883, // HTTPS
  httpPort: 1884, // WS
  httpsPort: 1885, // WSS
  noStart: false,
  skipCacheInvalidation: false,
  endpointAddressSSL: false,
  keyPath: '',
  certPath: ''
}

const ascoltatoreOpts = {
  type: 'redis',
  redis,
  host: 'localhost',
  port: 6379,
  db: 12,
  return_buffers: true // to handle binary payloads
}

class ServerlessIotLocal {
  constructor(serverless, options) {
    this.serverless = serverless
    this.log = serverless.cli.log.bind(serverless.cli)
    this.service = serverless.service
    this.options = options
    this.provider = this.serverless.getProvider('aws')
    this.mqttBroker = null
    this.requests = {}

    this.commands = {
      iot: {
        commands: {
          start: {
            usage: 'Start local Iot broker.',
            lifecycleEvents: ['startHandler'],
            options: {
              host: {
                usage: 'host name to listen on. Default: localhost',
                // match serverless-offline option shortcuts
                shortcut: 'o'
              },
              port: {
                usage: 'MQTT port to listen on. Default: 1883',
                shortcut: 'p'
              },
              httpPort: {
                usage: 'http port for client connections over WebSockets. Default: 1884',
                shortcut: 'h'
              },
              httpsPort: {
                usage: 'https port for client connections over WebSockets. Default: 1885',
                shortcut: 's'
              },
              noStart: {
                shortcut: 'n',
                usage: 'Do not start local MQTT broker (in case it is already running)',
              },
              skipCacheInvalidation: {
                usage: 'Tells the plugin to skip require cache invalidation. A script reloading tool like Nodemon might then be needed',
                shortcut: 'c',
              },
              endpointAddressSSL: {
                usage: 'Instructs this plugin to use the SSL port for the endpoint address'
              },
              keyPath: {
                usage: 'Path to the private key file'
              },
              certPath: {
                usage: 'Path to the certificate file'
              },
            }
          }
        }
      }
    }

    this.hooks = {
      'iot:start:startHandler': this.startHandler.bind(this),
      'before:offline:start:init': this.startHandler.bind(this),
      'before:offline:start': this.startHandler.bind(this),
      'before:offline:start:end': this.endHandler.bind(this),
    }
  }

  debug() {
    if (VERBOSE) {
      this.log.apply(this, arguments)
    }
  }

  startHandler() {
    this.originalEnvironment = _.extend({ IS_OFFLINE: true }, process.env)

    const custom = this.service.custom || {}
    const inheritedFromServerlessOffline = _.pick(custom['serverless-offline'] || {}, ['skipCacheInvalidation'])

    this.options = _.merge(
      {},
      defaultOpts,
      inheritedFromServerlessOffline,
      custom['serverless-iot-local'],
      this.options
    )

    if (!this.options.noStart) {
      this._createMQTTBroker()
    }

    this._createMQTTClient()
  }

  endHandler() {
    this.log('Stopping Iot broker')
    this.mqttBroker.close()
  }

  _createMQTTBroker() {
    const { host, port, httpPort } = this.options
    const { securePort, httpsPort, keyPath, certPath, endpointAddressSSL } = this.options

    const mosca = {
      host,
      port,
      http: {
        host,
        port: httpPort,
        bundle: true
      }
    }

    if (httpsPort) {
      _.merge(mosca, {
        secure: {
          port: securePort
        },
        https: {
          host,
          port: httpsPort,
          bundle: true
        },
        onlyHttp: false
      })

      if(keyPath && certPath) {
        _.merge(mosca, {
          secure: {
            keyPath,
            certPath
          },
          allowNonSecure: true
        })
      }
    }

    // For now we'll only support redis backend.
    const redisConfigOpts = this.options.redis;

    const ascoltatore = _.merge({}, ascoltatoreOpts, redisConfigOpts)

    this.mqttBroker = createMQTTBroker(ascoltatore, mosca)

    const endpointPort = (endpointAddressSSL) ? httpsPort : httpPort;
    const endpointAddress = `${host}:${endpointPort}`

    // prime AWS IotData import
    // this is necessary for below mock to work
    // eslint-disable-next-line no-unused-vars
    const notUsed = new realAWS.IotData({
      endpoint: endpointAddress,
      region: 'us-east-1'
    })

    AWS.mock('IotData', 'publish', (params, callback) => {
      const { topic, payload } = params
      this.mqttBroker.publish({ topic, payload }, callback)
    })

    AWS.mock('Iot', 'describeEndpoint', (params, callback) => {
      process.nextTick(() => {
        // Parameter params is optional.
        (callback || params)(null, { endpointAddress })
      })
    })

    this.log(`Iot broker listening on ports: ${port} (mqtt) and ${httpPort} (http)`)
  }

  _getServerlessOfflinePort() {
    // hackeroni!
    const offline = this.serverless.pluginManager.plugins.find(
      plugin => plugin.commands && plugin.commands.offline
    )

    if (offline) {
      return offline.options.port
    }
  }

  _createMQTTClient() {
    const { port, httpPort, location } = this.options
    const topicsToFunctionsMap = {}
    const { runtime } = this.service.provider
    const stackName = this.provider.naming.getStackName()
    Object.keys(this.service.functions).forEach(key => {
      const fun = this._getFunction(key)
      const funName = key
      const servicePath = path.join(this.serverless.config.servicePath, location)
      const funOptions = functionHelper.getFunctionOptions(fun, key, servicePath)
      this.debug(`funOptions ${JSON.stringify(funOptions, null, 2)} `)

      if (!fun.environment) {
        fun.environment = {}
      }

      fun.environment.AWS_LAMBDA_FUNCTION_NAME = `${this.service.service}-${this.service.provider.stage}-${funName}`

      this.debug('')
      this.debug(funName, 'runtime', runtime, funOptions.babelOptions || '')
      this.debug(`events for ${funName}:`)

      if (!(fun.events && fun.events.length)) {
        this.debug('(none)')
        return
      }

      fun.events.forEach(event => {
        if (!event.iot) return this.debug('(none)')

        const { iot } = event
        const { sql } = iot
        // hack
        // assumes SELECT ... topic() as topic
        const parsed = SQL.parseSelect({
          sql,
          stackName,
        })

        const topicMatcher = parsed.topic
        if (!topicsToFunctionsMap[topicMatcher]) {
          topicsToFunctionsMap[topicMatcher] = []
        }

        this.debug('topicMatcher')
        topicsToFunctionsMap[topicMatcher].push({
          fn: fun,
          name: key,
          options: funOptions,
          select: parsed.select
        })
      })
    })

    const client = mqtt.connect(`ws://localhost:${httpPort}/mqqt`)
    client.on('error', console.error)

    let connectMonitor
    const startMonitor = () => {
      clearInterval(connectMonitor)
      connectMonitor = setInterval(() => {
        this.log(`still haven't connected to local Iot broker!`)
      }, 5000).unref()
    }

    startMonitor()

    client.on('connect', () => {
      clearInterval(connectMonitor)
      this.log('connected to local Iot broker')
      for (let topicMatcher in topicsToFunctionsMap) {
        client.subscribe(topicMatcher)
      }
    })

    client.on('disconnect', startMonitor)

    client.on('message', (topic, message) => {
      const matches = Object.keys(topicsToFunctionsMap)
        .filter(topicMatcher => mqttMatch(topicMatcher, topic))

      if (!matches.length) return

      let clientId
      if (/^\$aws\/events/.test(topic)) {
        clientId = topic.slice(topic.lastIndexOf('/') + 1)
      } else {
        // hmm...
      }

      const apiGWPort = this._getServerlessOfflinePort()
      matches.forEach(topicMatcher => {
        let functions = topicsToFunctionsMap[topicMatcher]
        functions.forEach(fnInfo => {
          const { fn, name, options, select } = fnInfo
          const requestId = Math.random().toString().slice(2)
          this.requests[requestId] = { done: false }

          const event = SQL.applySelect({
            select,
            payload: message,
            context: {
              topic: () => topic,
              clientid: () => clientId,
              principal: () => {}
            }
          })

          let handler // The lambda function
          try {
            process.env = _.extend({}, this.service.provider.environment, this.service.functions[name].environment, this.originalEnvironment)
            process.env.SERVERLESS_OFFLINE_PORT = apiGWPort
            process.env.AWS_LAMBDA_FUNCTION_NAME = this.service.service + '-' + this.service.provider.stage
            process.env.AWS_REGION = this.service.provider.region
            handler = functionHelper.createHandler(options, this.options)
          } catch (err) {
            this.log(`Error while loading ${name}: ${err.stack}, ${requestId}`)
            return
          }

          const lambdaContext = createLambdaContext(fn)
          try {
            handler(event, lambdaContext, lambdaContext.done)
          } catch (error) {
            this.log(`Uncaught error in your '${name}' handler: ${error.stack}, ${requestId}`)
          }
        })
      })
    })
  }

  _getFunction(key) {
    const fun = this.service.getFunction(key)
    if (!fun.timeout) {
      fun.timeout = this.service.provider.timeout
    }

    return fun
  }
}

module.exports = ServerlessIotLocal
