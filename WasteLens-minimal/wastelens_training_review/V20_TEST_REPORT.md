# WasteLens V20 Test Report

- `node --test src/*.test.js`: PASS (24 tests)
- `node --check src/storage.js`: PASS
- `node --check src/splits.js`: PASS
- `node --check src/fieldTrials.js`: PASS
- `node --check src/localRules.js`: PASS
- `node --check server/server.js`: PASS
- ZIP integrity: to be checked after packaging

Not executed: external source authentication, municipal rule verification, browser end-to-end testing, or Vite production build. Local source records are user-entered and are not independently verified by the app.
