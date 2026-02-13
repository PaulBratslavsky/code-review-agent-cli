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

### 2. Security
- Injection vulnerabilities (SQL, command, XSS)
- Hardcoded secrets, exposed credentials
- Unsafe input handling, missing validation
- Insecure dependencies or configurations

### 3. Error Handling
- Missing try/catch around operations that can fail
- Swallowed errors, uninformative error messages
- Unhandled promise rejections or missing async error paths
- Missing cleanup in error paths (file handles, connections)

### 4. Performance
- Unnecessary loops, repeated computations
- Memory leaks, unclosed resources
- N+1 queries, blocking operations in async code
- Inefficient data structures or algorithms

### 5. Readability & Maintainability
- Confusing naming, overly complex logic
- Code duplication that should be extracted
- Functions doing too many things
- Missing or misleading comments on non-obvious logic

## Output Format

For each issue found, report:
- **File and line**: exact location
- **Severity**: Critical / Warning / Suggestion
- **Issue**: what's wrong
- **Fix**: how to fix it with a code snippet

End with a summary table counting issues by severity per file.

## Guidelines

- Read each file fully before reporting issues
- Focus on real problems, not style nitpicks
- Prioritize Critical issues first
- If no issues are found in a category, skip it
- Provide actionable fixes, not vague suggestions
