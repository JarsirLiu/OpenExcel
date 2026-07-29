# Web and UI Rules

> Status: Rule

- API clients only translate HTTP requests and responses; they do not own React state or business workflows.
- The workbook document is the browser's authoritative workbook state. Do not create a second full-data repository.
- Sheet data, the Chart model, chart render data, and layout geometry are separate state domains. Do not refresh them implicitly through one another.
- Sheet, chart, and layout commands must cross feature boundaries through narrow typed callbacks or ports. Do not reach into another feature's internal store.
- Use FortuneSheet instances only through editor adapters/hooks. Do not expose third-party instances as general application state.
- Keep the old workbook document visible until the replacement is ready. Ignore stale requests by generation or `AbortController`.
- A chart overlay owns view rendering and coordinate conversion. It must not reload the workbook or write Sheet data directly.
- Derive layout dimensions from parent grid/flex constraints. Do not compensate for a missing layout contract with CSS offsets.
- UI interaction changes must check workbook switching, Sheet switching, scroll/zoom, sidebar resize/collapse, chart dragging, and chat tool-result navigation.
