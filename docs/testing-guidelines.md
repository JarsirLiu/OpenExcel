# Testing Guidelines

## 1. Framework

All packages use **Vitest** as the test runner. Vitest is configured per package or uses its defaults.

- **`packages/server`**: own `vitest.config.ts` with `globals: true`, `environment: "node"`, `testTimeout: 30000`
- **Other packages**: Vitest defaults

## 2. File naming and placement

| Rule | Convention |
|---|---|
| Extension | `*.test.ts` for logic, `*.test.tsx` for components |
| Location | **Co-located** next to the source file (e.g., `src/foo/bar.test.ts` tests `src/foo/bar.ts`) |
| Cross-cutting tests | `src/tests/` at package level for config parsing, setup files, E2E |

**Examples:**

```
src/modules/sessions/title.ts          # source
src/modules/sessions/title.test.ts     # test (co-located)
src/modules/workspaces/service.ts
src/modules/workspaces/service.test.ts
src/tests/config.test.ts               # cross-cutting (src/tests/)
src/tests/test-setup.ts                # setup file (no test logic)
```

## 3. Test structure and naming

```typescript
import { describe, expect, it } from "vitest";

// outer: module or class name
describe("generateTitle", () => {
  // inner: function or scenario
  describe("happy path", () => {
    it("should extract headline from model output", () => {
      // Arrange
      // Act
      // Assert
      expect(result).toBe(expected);
    });
  });

  describe("fallback behavior", () => {
    it("falls back to first 10 chars when model throws", () => { /* ... */ });
  });
});
```

- Outer `describe("ModuleName")` — the unit under test
- Inner `describe("scenario or function name")` — groups related cases
- `it("should do something")` or `it("does something")` — present tense, describes the expectation

## 4. Assertions

Prefer Vitest native matchers:

```typescript
expect(value).toBe(42);
expect(value).toEqual({ id: 1, name: "foo" });
expect(array).toContain("item");
expect(array).toHaveLength(3);
expect(fn).toHaveBeenCalledWith(arg1, arg2);
expect(fn).toHaveBeenCalledTimes(1);
expect(promise).rejects.toThrow(ErrorClass);
expect(promise).resolves.toBe(value);
expect(value).toBeDefined();
expect(value).toBeNull();
expect(value).toBeTruthy();
expect(value).toBeFalsy();
```

## 5. Mocking

### 5.1 Hand-rolled `vi.fn()` (preferred)

Create mock objects with the exact interface needed:

```typescript
const mockRepo = {
  findWorkspaces: vi.fn(),
  findWorkspace: vi.fn(),
};
```

### 5.2 Module-level mocking with `vi.hoisted()` + `vi.mock()` (use sparingly)

Only when the module must be replaced before imports resolve:

```typescript
const mocks = vi.hoisted(() => ({
  findWorkspaces: vi.fn(),
}));

vi.mock("./repository.js", () => ({
  findWorkspaces: mocks.findWorkspaces,
}));

// Then in test:
mocks.findWorkspaces.mockResolvedValueOnce([{ id: 1 }]);
```

- Put `vi.mock()` calls at the top of the file, before any imports
- Use `vi.hoisted()` to declare variables that `vi.mock()` closures need access to
- Reset mocks in `beforeEach` with `.mockReset()` or `.mockClear()`

### 5.3 Environment variables

```typescript
// Option A: try/finally
const saved = process.env.MY_VAR;
delete process.env.MY_VAR;
try {
  // test
} finally {
  if (saved === undefined) delete process.env.MY_VAR;
  else process.env.MY_VAR = saved;
}

// Option B: vi.stubEnv / vi.unstubEnv (simpler)
vi.stubEnv("MY_VAR", "value");
afterEach(() => vi.unstubAllEnvs());
```

### 5.4 What NOT to do

- Do not use `jest.mock()` or Jest APIs (this is Vitest)
- Do not use auto-mocking (`vi.mock("./module")` without a factory) — it produces brittle, opaque mocks
- Avoid `vi.spyOn` for module-level spies when `vi.fn()` + dependency injection suffices

## 6. Temporary test data

```typescript
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "openexcel-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});
```

- Always clean up in `afterEach` or `afterAll`
- Use unique names (`Date.now()` + random suffix) to avoid collisions in parallel runs

## 7. Coverage and focus

- **Focus on service boundaries**: test the public API of a module, not private helpers
- **Critical areas** that must have tests:
  - Session title generation and fallback
  - Chat streaming and abort handling
  - Session history reconstruction
  - Workbook import / export
  - Sheet update / delete behavior
  - Undo restore behavior
- Coverage is not enforced, but use `--coverage` for critical modules

## 8. Common patterns by package

### packages/core — pure unit tests

No mocking needed. Pure function tests with Zod schema validation:

```typescript
import { describe, expect, it } from "vitest";
import { sheetChangePatchOutputSchema } from "./sheetChange.js";

describe("sheetChangePatchOutputSchema", () => {
  it("rejects invalid delta values", () => {
    const result = sheetChangePatchOutputSchema.safeParse({ delta: "abc" });
    expect(result.success).toBe(false);
  });
});
```

### packages/server — service-level tests with mocking

Heavy use of `vi.hoisted()` + `vi.mock()` to isolate Prisma and repository layers:

```typescript
const mocks = vi.hoisted(() => ({
  findWorkspaces: vi.fn(),
}));
vi.mock("./repository.js", () => ({
  findWorkspaces: mocks.findWorkspaces,
}));

import { getWorkspaces } from "./service.js";

describe("getWorkspaces", () => {
  beforeEach(() => mocks.findWorkspaces.mockReset());
  it("loads workspaces only for the current user", async () => {
    mocks.findWorkspaces.mockResolvedValue([{ id: 1 }]);
    await getWorkspaces(42);
    expect(mocks.findWorkspaces).toHaveBeenCalledWith(42);
  });
});
```

### packages/web — component tests

Use `@testing-library/react` (render, screen, waitFor):

```typescript
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MyComponent } from "./MyComponent.jsx";

vi.mock("../dependency.js", () => ({ /* ... */ }));

describe("MyComponent", () => {
  it("renders the expected text", () => {
    render(<MyComponent />);
    expect(screen.getByText("Hello")).toBeDefined();
  });
});
```

### packages/agent — lightweight unit tests

Keep tests short and focused. Mock only the model provider:

```typescript
const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
}));
vi.mock("@ai-sdk/openai", () => ({ generateText: mocks.generateText }));
```

## 9. Test scripts

```bash
# Run all tests across all packages
pnpm test

# Run one package's tests
pnpm test:server       # packages/server
pnpm test:web          # packages/web
pnpm test:core         # packages/core
pnpm test:agent        # packages/agent (if script exists)

# Filter tests by pattern
pnpm --filter @openexcel/server exec vitest run -- title
```

## 10. Checklist

Before submitting test changes, verify:

- [ ] File is co-located next to source (unless cross-cutting)
- [ ] Naming: `*.test.ts` or `*.test.tsx`
- [ ] No `.spec.ts` or `__tests__/` directories
- [ ] Mock paths match the actual import paths after file moves
- [ ] All mocks reset in `beforeEach` when shared between cases
- [ ] Temp directories cleaned up in `afterEach`/`afterAll`
- [ ] Test descriptions are in English (Chinese acceptable for domain-specific features)
- [ ] Tests cover the service boundary, not implementation internals