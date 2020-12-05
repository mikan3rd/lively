
## Set up functions configuration

```shell
firebase functions:config:set line.user_id="XXX"
firebase functions:config:get > .runtimeconfig.dev.json
```

## Set up emulators configuration

You must provide environment variables in `.runtimeconfig.json`

```
firebase emulators:start
```
