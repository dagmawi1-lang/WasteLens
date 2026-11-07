# WasteLens V22 Test Report

- `node --test src/*.test.js server/*.test.js`: PASS (32 tests)
- `node --check server/server.js`: PASS
- `node --check server/security.js`: PASS
- `node --check public/sw.js`: PASS
- `node --check src/storage.js`: PASS
- `node --check src/splits.js`: PASS
- `node --check src/fieldTrials.js`: PASS
- `node --check src/localRules.js`: PASS
- ZIP integrity: to be checked after packaging

Not executed: Vite production build, Docker image build/run, browser PWA installation/offline testing, Express integration tests, or external HTTPS deployment. Frontend dependencies could not be installed in this environment. Treat the container configuration and CSP as a baseline requiring a real deployment review.
