# serverless-iot-local

AWS Iot lifecycle and regular topic subscription events

## Prerequisites
* serverless@1.x
* redis

## Install

1) `npm install --save serverless-iot-local`

2) In `serverless.yml` add `serverless-iot-local` to plugins:

```yaml
plugins:
  - serverless-iot-local
```

## Usage
1. Start redis:  
    `redis-server`

2. If you're using [serverless-offline](https://github.com/dherault/serverless-offline), you can run:  

    `sls offline start`

    Otherwise run: 
    
    `sls iot start`

CLI options are optional:

```
--port                -p  Port to listen on. Default: 1883
--httpPort            -h  Port for WebSocket connections. Default: 1884
--noStart             -n  Prevent Iot broker (Mosca MQTT brorker) from being started (if you already have one)
--skipCacheValidation -c  Tells the plugin to skip require cache invalidation. A script reloading tool like Nodemon might then be needed (same as serverless-offline)
```

The above options can be added to serverless.yml to set default configuration, e.g.:

```yml
custom:
  serverless-iot-local:
    start:
      port: 1884
    # Uncomment only if you already have an MQTT server running locally
    # noStart: true
```

### Using with serverless-offline plugin

Place `serverless-iot-local` above `serverless-offline`

```yaml
plugins:
  - serverless-iot-local
  - serverless-offline
```

## Todo

- Improve support of AWS Iot SQL syntax

## License
[MIT](LICENSE)
