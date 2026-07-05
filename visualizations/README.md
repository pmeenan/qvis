# qvis visualizations

## Project setup
```
npm install
```

### Compiles and hot-reloads for development
```
npm run dev
```

### Compiles for production
```
npm run build
```

### Run your tests
```
npm run test
```

### Packaging

This fork publishes the built visualization bundle as the `qvis` npm package:

1. Build with Node 22: `npm run build`.
2. Verify parser/model tests: `npm run test`.
3. After review, publish from this directory with `npm publish`.

The package only includes `dist/`; source changes stay in the `third_party/qvis` submodule workspace. The waterfall-tools repo currently consumes this fork through a local `file:third_party/qvis/visualizations/qvis-0.1.0.tgz` tarball placeholder until Pat publishes the reviewed package.

### Embed mode

`?embedded=1&loadId=<id>` enables the postMessage loader used by waterfall-tools. qvis reads those parameters from `window.location.search`, posts `{type:"qvis-ready", loadId}` to the parent, then accepts `{type:"qvis-load-files", loadId, files:[{name,data}]}` from the same frame origin. Embedded mode disables the `/loadfiles` backend fallback.

### Notes

The app is Vite + Vue 3 + Pinia + Bootstrap 5. The D3 renderer classes remain framework-independent and should stay as untouched as possible when changing the UI shell.
