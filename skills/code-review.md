---
name: code-review
description: >
  Perform structured, multi-pass code reviews with severity-rated findings.
  Use when the user asks to review code, check for bugs, audit files, analyze
  code quality, find vulnerabilities, or requests a code audit. Also trigger
  when the user says "review this", "check this code", "find bugs", or
  "is this code safe".
---

# Code Review

When asked to review code, follow this structured methodology.

## Review Process

Go through each file and check these areas in order:

### 1. Bugs & Correctness
- Logic errors, off-by-one mistakes, race conditions
- Null/undefined access, unhandled edge cases
- Type mismatches or incorrect assumptions about data shapes
- Incorrect return values or missing return statements
- Unreachable code or dead branches
- Incorrect operator precedence or missing parentheses

### 2. Security
- Injection vulnerabilities (SQL, command, XSS, template)
- Hardcoded secrets, exposed credentials, API keys in source
- Unsafe input handling, missing validation at trust boundaries
- Insecure dependencies or configurations
- Path traversal in file operations
- `eval()`, `Function()`, or `exec()` with untrusted input

### 3. Error Handling
- Missing try/catch around operations that can fail
- Swallowed errors (empty catch blocks) or uninformative error messages
- Unhandled promise rejections or missing async error paths
- Missing cleanup in error paths (file handles, connections, timers)
- Generic exception catching where specific types are available

### 4. Performance
- Unnecessary loops, repeated computations, redundant work
- Memory leaks, unclosed resources, event listener buildup
- N+1 queries, blocking operations in async code
- Inefficient data structures or algorithms (e.g., O(n^2) where O(n) is possible)
- Unnecessary re-renders or re-computations in UI code

### 5. Readability & Maintainability
- Confusing naming, single-letter variables in broad scopes, vague names (`data`, `temp`, `result`)
- Code duplication (3+ lines of similar logic repeated)
- Functions doing too many things (> 25-30 lines, or multiple responsibilities)
- Deeply nested code (> 3 levels) — suggest early returns or extraction
- Complex boolean expressions (3+ conditions) — suggest named variables
- Missing or misleading comments on non-obvious logic

### 6. Dead Code & Debt
- Commented-out code blocks — flag for removal (version control preserves history)
- Unused imports, variables, functions, or parameters
- `console.log`, `print()`, or debug statements left in production code
- TODO/FIXME/HACK comments — surface as informational items (these are tracked debt)
- Magic numbers or strings — flag unnamed literals in logic

## Output Format

For each issue found, report:

- **File:Line** — Brief title
  - **Severity**: Critical / Warning / Suggestion
  - **Category**: Bug | Security | Error Handling | Performance | Maintainability | Dead Code
  - **Confidence**: High / Medium / Low
  - **Issue**: what's wrong
  - **Fix**: how to fix it with a code snippet

Only report findings with Medium or High confidence. If you are unsure about something, skip it rather than guessing.

## Summary

End with a summary table counting issues by severity and category per file:

| File | Critical | Warning | Suggestion |
|------|----------|---------|------------|
| ... | ... | ... | ... |
| **Total** | **N** | **N** | **N** |

If any Critical issues exist, add:
"**Priority: Fix [N] critical issues before deployment.**"

If no issues are found, explicitly state: "No issues found. The code looks good."

## Guidelines

- Read each file fully before reporting issues
- Check if issues are already mitigated before reporting (existing validation, guards, middleware)
- Focus on real problems, not style nitpicks handled by linters
- Prioritize Critical issues first — do not get distracted by suggestions while security issues exist
- Provide actionable fixes with corrected code, not vague descriptions
- If no issues are found in a category, skip it entirely
- Group related findings when they share a root cause
