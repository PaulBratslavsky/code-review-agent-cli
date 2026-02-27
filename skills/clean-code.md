---
name: clean-code
description: >
  Code quality review based on Clean Code principles (Robert C. Martin),
  refactoring patterns (Martin Fowler), and common code smells.
  Activated when the --clean-code flag is used.
---

# Clean Code Review

When clean code mode is enabled, evaluate the codebase against established code quality principles. Focus on actionable improvements, not style nitpicks.

## Review Categories

Check each category in order. Only report issues you are confident about.

### 1. Naming

| Rule | What to flag |
|------|-------------|
| Descriptive names | Single-letter variables (except `i`, `j`, `k` in loops), vague names like `data`, `temp`, `info`, `result`, `val` |
| Pronounceable names | Names with no vowels or unpronounceable abbreviations (`cstmrMgr`, `fltPrc`) |
| Searchable names | Very short names used in broad scopes |
| No encodings | Hungarian notation (`strName`, `iCount`, `bIsActive`) |
| Meaningful distinctions | Numbered suffixes (`data1`, `data2`), noise words (`theList`, `accountInfo` vs `account`) |
| Verb/noun convention | Functions should be verbs (`getUser`, `calculateTotal`), classes/types should be nouns |

### 2. Functions

| Rule | What to flag |
|------|-------------|
| Keep functions small | Functions longer than 25-30 lines |
| Single responsibility | Functions that do multiple distinct things (check for "and" in the name: `validateAndSave`) |
| Few parameters | Functions with more than 3 parameters |
| No flag arguments | Boolean parameters that switch behavior — suggest splitting into two functions |
| No side effects | Functions that modify non-local state unexpectedly |
| Command-query separation | Functions that both mutate state AND return a value |
| One level of abstraction | Functions mixing high-level orchestration with low-level details |

### 3. Code Smells — Bloaters

| Smell | Detection | Suggested refactoring |
|-------|-----------|----------------------|
| **Long Method** | > 25-30 lines | Extract Function |
| **Large Class/Module** | > 200-300 lines | Extract Class/Module |
| **Long Parameter List** | > 3 parameters | Introduce Parameter Object |
| **Primitive Obsession** | Repeated primitive groups representing a concept (e.g., `street`, `city`, `zip` always together) | Replace with value object / Extract Class |
| **Data Clumps** | Same 3+ fields always appear together across functions | Extract into a type/interface |

### 4. Code Smells — Change Preventers

| Smell | Detection | Suggested refactoring |
|-------|-----------|----------------------|
| **Divergent Change** | One module changed for many unrelated reasons | Extract Module (split by concern) |
| **Shotgun Surgery** | One logical change touches many files | Move Function/Field, consolidate |

### 5. Code Smells — Dispensables

| Smell | Detection | Suggested refactoring |
|-------|-----------|----------------------|
| **Dead Code** | Unused functions, variables, imports, unreachable branches | Remove Dead Code |
| **Duplicated Code** | Similar code blocks (3+ lines repeated) | Extract Function |
| **Commented-out Code** | Code blocks that are commented out | Delete (use version control instead) |
| **Speculative Generality** | Unused abstractions, empty interfaces, unused parameters | Collapse Hierarchy, Remove |
| **Magic Numbers/Strings** | Unnamed numeric or string literals in logic | Extract to named constant |

### 6. Code Smells — Couplers

| Smell | Detection | Suggested refactoring |
|-------|-----------|----------------------|
| **Feature Envy** | A function uses another module's data more than its own | Move Function |
| **Message Chains** | Deep property access chains `a.b.c.d.e` | Hide Delegate, Extract Function |
| **Middle Man** | Module that delegates almost everything | Remove Middle Man, Inline |

### 7. Complexity

| Rule | What to flag |
|------|-------------|
| Nesting depth | Code nested more than 3 levels deep — suggest early returns or extraction |
| Complex conditionals | Boolean expressions with 3+ conditions — suggest extracting to named variable or function |
| Long switch/if-else chains | More than 3-4 branches on the same type — suggest polymorphism or lookup table |
| Cognitive complexity | Functions that are hard to follow even if short — multiple breaks in linear flow |

### 8. Design Principles

| Principle | What to flag |
|-----------|-------------|
| **DRY** | Duplicated logic (not just duplicated text — same intent) |
| **KISS** | Overcomplicated solutions for simple problems |
| **YAGNI** | Features, abstractions, or configurations that nothing uses |
| **SRP** | Classes/modules with multiple unrelated responsibilities |
| **Law of Demeter** | Reaching through objects more than one level |

### 9. Error Handling

| Rule | What to flag |
|------|-------------|
| Don't return null | Functions that return null where they could throw or return a default |
| Don't pass null | Null passed as argument where a real value is expected |
| Use exceptions, not error codes | Mixing error codes with exception-based error handling |
| Catch specific exceptions | Catching generic `Error` or `Exception` when a specific type is available |
| Don't swallow errors | Empty catch blocks or catch blocks that only log |

### 10. Miscellaneous

| Rule | What to flag |
|------|-------------|
| TODO/FIXME/HACK comments | Surface as informational items — these are tracked debt |
| Console.log / print statements | Flag `console.log`, `print()`, `System.out.println` in production code |
| Inconsistent patterns | Same thing done different ways in the same codebase |

## Output Format

For each finding, report:

- **File:Line** — Title
  - **Severity**: Warning | Suggestion
  - **Category**: Naming | Functions | Code Smell | Complexity | Design | Error Handling
  - **Smell**: Name of the code smell (if applicable)
  - **Confidence**: High | Medium | Low
  - **Issue**: What's wrong and why it hurts maintainability
  - **Refactoring**: Named refactoring pattern to apply (e.g., "Extract Function", "Introduce Parameter Object")
  - **Fix**: Show the refactored code

## Rules

- Focus on structural and design issues, not formatting or style.
- Only flag issues with medium or high confidence.
- Suggest the **specific named refactoring** from Fowler's catalog when applicable.
- Don't flag code that is intentionally simple (e.g., small scripts, CLI tools) with enterprise patterns.
- If the code is clean, say so: "This codebase follows Clean Code principles well."
- Group related smells when they share a root cause.

## Example Finding

### [Warning] src/orders.ts:34 — Long Parameter List

- **Severity**: Warning
- **Category**: Functions
- **Smell**: Long Parameter List
- **Confidence**: High
- **Issue**: `createOrder` takes 7 parameters. Functions with many parameters are hard to call correctly and hard to test.
- **Refactoring**: Introduce Parameter Object
- **Fix**:
```typescript
// Before
function createOrder(userId: string, items: Item[], address: string, city: string, zip: string, coupon: string | null, priority: boolean) { ... }

// After
interface OrderParams {
  userId: string;
  items: Item[];
  shipping: { address: string; city: string; zip: string };
  coupon?: string;
  priority?: boolean;
}

function createOrder(params: OrderParams) { ... }
```

## Summary

End with a summary table:

| Category | Warnings | Suggestions |
|----------|----------|-------------|
| Naming | N | N |
| Functions | N | N |
| Code Smells | N | N |
| Complexity | N | N |
| Design | N | N |
| Error Handling | N | N |

### Top 3 Improvements

After the table, list the 3 most impactful changes that would improve the codebase quality the most. Frame these as positive next steps.
