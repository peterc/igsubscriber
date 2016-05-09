// This program logs in to IG.com's API, subscribes
// to live updates for several market epics, and
// pushes the live pricing data in to Redis.

// ===================================================
// CONFIGURE EPICS AND DATA TYPES
// ===================================================

const epics =       [ "MARKET:IX.D.DOW.DAILY.IP",
                      "MARKET:IX.D.FTSE.DAILY.IP",
                      "MARKET:CS.D.GBPUSD.TODAY.IP" ]

const data_types =  [ 'MARKET_STATE',
                      'UPDATE_TIME',
                      'BID',
                      'OFFER']

// other configuration comes from the environment or a .env file
//
// IG_API_KEY=.....
// IG_USERNAME=.....
// IG_PASSWORD=.....
// IG_API_HOST=demo-api.ig.com

// ===================================================
// PROGRAM FOLLOWS
// ===================================================

import dotenv from 'dotenv'
dotenv.config()

import https from 'https'
import ls from 'lightstreamer-client'
import redis from 'redis'
import moment from 'moment'

// Using IG.com API login details, get tokens for the live feed subscription
function createSession() {
  const body = JSON.stringify({ identifier: process.env.IG_USERNAME, password: process.env.IG_PASSWORD })

  const options = {
    hostname: process.env.IG_API_HOST,
    port: 443,
    path: '/gateway/deal/session',
    method: 'POST',
    headers: {
      'Accept': 'application/json; charset=UTF-8',
      'Content-Type': 'application/json; charset=UTF-8',
      'X-IG-API-KEY': process.env.IG_API_KEY,
      'Content-Length': body.length
    }
  }

  return new Promise((resolve, reject) => {
    try {
      const req = https.request(options, res => {
        const cst = res.headers['cst']
        const token = res.headers['x-security-token']

        let body = ''
        res.on('data', chunk => body += chunk.toString('utf8'))
        res.on('end', ()=> {
          body = JSON.parse(body)
          resolve({ cst, token, body, endpoint: body['lightstreamerEndpoint'] })
        })
      })

      req.write(body)
      req.end()
    } catch(err) {
      reject(err)
    }
  })
}

// Sugar to more easily create a new data subscription on IG's Lightstreamer
function createSubscription(key, type, callback) {
  const sub = new ls.Subscription("MERGE",key,type)

  sub.addListener({
    onItemUpdate: obj => {
     let data = {}
     data['MARKET'] = obj["By"]
     Object.keys(obj.la.bt).forEach(k => data[k] = obj.Sd[obj.la.bt[k] + 1])
     if (data['UPDATE_TIME']) {
       data['UPDATE_TIME'] = moment(data['UPDATE_TIME'], 'HH:mm:ss').unix()
       data['TIMESTAMP'] = (new Date).getTime()
     }
     callback(data)
    }
  })

  return sub
}

// Log in to IG, then hook up Redis and the Lightstreamer,
// create the subscription, and log all ticks to Redis.
createSession().then(tokens => {
  const db = redis.createClient()
  const lsClient = new ls.LightstreamerClient(tokens['endpoint'])
  lsClient.connectionDetails.setPassword("CST-" + tokens['cst'] + "|XST-" + tokens['token'])
  lsClient.addListener({ onStatusChange: newStatus => { console.warn(newStatus) } })
  lsClient.connect()

  lsClient.subscribe(createSubscription(epics, data_types, data => {
    console.log(JSON.stringify(data))

    let key = data['MARKET'] + ":" + data['TIMESTAMP']

    for (let k of Object.keys(data)) {
      db.set(data['MARKET'] + ":" + k, data[k])
      db.publish(data['MARKET'] + ":" + k, JSON.stringify(data))
      db.hset(key, k, data[k])
      db.zadd(data['MARKET'], data['TIMESTAMP'], data['BID'] + ":" + data['OFFER'])
      db.set(data['MARKET'] + ":LIVE", "true", "ex", 30)
    }
  }))
}).catch(reason => console.log('FAILURE: ' + reason))
