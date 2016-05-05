# igsubscriber - Stream live data from IG.com's Livestreamer API into Redis

## What?

This program logs in to IG.com's API, subscribes to live updates for several market epics, and pushes the live pricing data in to Redis.

igsubscriber is written in ES6 and runs on Node 5.0+ using Babel.

By default, these epics are tracked:

* MARKET:IX.D.DOW.DAILY.IP
* MARKET:IX.D.FTSE.DAILY.IP
* MARKET:CS.D.GBPUSD.TODAY.IP

Market state, update time, bid and offer prices are tracked for each in real time.

## Configuration

Use environment variables or a `.env` file to provide the information you get/set with IG:

    IG_API_KEY=.....
    IG_USERNAME=.....
    IG_PASSWORD=.....
    IG_API_HOST=demo-api.ig.com
