---
name: testing-review
description: >
  Test quality and coverage assessment. Evaluates test completeness, isolation,
  naming, edge case coverage, and mock usage patterns.
  Activated when the --test-review flag is used.
---

# Testing Review

When testing review mode is enabled, evaluate the quality and completeness of the test suite.

## Review Process

### Step 1: Discover Tests

1. Find all test files (patterns: `*.test.*`, `*.spec.*`, `__tests__/`, `test/`, `tests/`)
2. Find the test configuration (jest.config, vitest.config, pytest.ini, .mocharc, etc.)
3. Identify the testing framework in use
4. Map test files to the source files they cover

### Step 2: Identify Coverage Gaps

For each source file, check:

- Does a corresponding test file exist?
- Are the public functions/methods tested?
- Are error paths tested (what happens when things fail)?
- Are edge cases tested (empty input, null, boundary values, large input)?
- Are async operations tested (promises, callbacks, streams)?

Flag untested source files as the highest priority finding.

### Step 3: Evaluate Test Quality

Check each test file against these criteria:

#### Test Structure
| Rule | What to flag |
|------|-------------|
| Descriptive test names | Flag names like `test1`, `should work`, `test the thing` — names should describe the expected behavior |
| Arrange-Act-Assert | Tests that mix setup, action, and verification without clear separation |
| One concept per test | Tests that verify multiple unrelated behaviors |
| Test independence | Tests that depend on execution order or shared mutable state |
| No logic in tests | Tests with `if`, `for`, `switch` — tests should be straightforward |

#### Assertions
| Rule | What to flag |
|------|-------------|
| Specific assertions | Using `toBeTruthy()` or `assert(result)` when `toEqual(expected)` is more precise |
| No assertions | Test functions that never assert anything (always pass) |
| Assertion count | Tests with more than 3-5 assertions — consider splitting |
| Error assertions | Catching expected errors but not asserting on the error type/message |

#### Mocking & Isolation
| Rule | What to flag |
|------|-------------|
| Over-mocking | Mocking implementation details rather than interfaces/contracts |
| Under-mocking | Tests that make real network calls, file system writes, or database queries |
| Mock not restored | Mocks/spies not cleaned up between tests (`afterEach`, `restore`) |
| Testing mocks | Assertions on mock internals rather than observable behavior |

#### Edge Cases & Error Paths
| Rule | What to flag |
|------|-------------|
| Missing null/undefined | Functions that accept optional params but tests never pass null/undefined |
| Missing empty input | Arrays, strings, objects not tested with empty values |
| Missing boundary values | Numbers not tested with 0, -1, MAX_SAFE_INTEGER, NaN |
| Missing error paths | try/catch blocks in source code with no corresponding error test |
| Missing async errors | Async functions with no test for rejection/failure |

#### Test Performance
| Rule | What to flag |
|------|-------------|
| Slow tests | Tests with `setTimeout`, `sleep`, or unnecessary waits |
| Real I/O | Tests hitting real APIs, databases, or file systems without mocking |
| Heavy setup | `beforeAll`/`beforeEach` doing expensive operations that could be simplified |

## Output Format

### Coverage Report

Start with a coverage overview:

| Source File | Test File | Status |
|-------------|-----------|--------|
| src/auth.ts | tests/auth.test.ts | Covered |
| src/orders.ts | — | **Missing** |
| src/utils.ts | tests/utils.test.ts | Partial (error paths untested) |

### Findings

For each finding, report:

- **File:Line** — Title
  - **Severity**: Warning | Suggestion
  - **Category**: Coverage Gap | Test Quality | Isolation | Edge Case | Performance
  - **Confidence**: High | Medium | Low
  - **Issue**: What is missing or wrong
  - **Fix**: Show the test code that should be added or changed

## Rules

- Prioritize missing coverage over test quality issues.
- When flagging a coverage gap, write out the specific test case that should be added (with code).
- Don't flag test style issues (indentation, import ordering) — focus on correctness and coverage.
- If the codebase has no tests at all, recommend a testing setup and list the top 5 functions/modules that should be tested first, prioritized by risk.
- If the test suite is comprehensive, say so: "This project has good test coverage."

## Example Finding

### [Warning] src/auth.ts — Missing test for expired token handling

- **Severity**: Warning
- **Category**: Coverage Gap
- **Confidence**: High
- **Issue**: `validateToken()` on line 23 handles expired tokens with a specific error, but no test verifies this behavior. If this logic breaks, the app would accept expired tokens silently.
- **Fix**:
```typescript
describe("validateToken", () => {
  it("throws TokenExpiredError for expired tokens", () => {
    const expiredToken = createToken({ exp: Date.now() / 1000 - 3600 });
    expect(() => validateToken(expiredToken)).toThrow(TokenExpiredError);
  });
});
```

## Summary

End with:

| Category | Findings |
|----------|----------|
| Coverage Gaps | N |
| Test Quality | N |
| Isolation Issues | N |
| Missing Edge Cases | N |
| Performance | N |

### Testing Priorities

List the top 3-5 untested areas ranked by risk (what would hurt most if it broke).
