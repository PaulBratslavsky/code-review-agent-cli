---
name: security-audit
description: >
  Deep security-focused code review aligned with OWASP Top 10 (2021) and CWE.
  Activated when the --security flag is used. Checks for injection, broken access
  control, cryptographic failures, secrets in code, SSRF, and more.
---

# Security Audit

When security audit mode is enabled, perform a thorough security-focused review using the OWASP Top 10 (2021) as your framework.

## Review Process

Analyze the code in this exact order. For each category, check every applicable rule. Skip categories that don't apply to the codebase.

### A01: Broken Access Control

- Routes/endpoints require authentication unless explicitly public
- Authorization checks happen server-side, not just client-side
- Record ownership is verified before CRUD operations (no IDOR)
- CORS is configured with specific allowed origins, not wildcard `*`
- API endpoints are rate-limited
- Directory traversal is prevented (validate file paths against a base directory)
- JWT/session tokens are validated on every request

### A02: Cryptographic Failures

- No hardcoded secrets, API keys, passwords, or tokens in source code
- No secrets in git history, config files, or environment variable defaults
- Strong algorithms only (no MD5, SHA1 for security purposes, no DES/3DES)
- HTTPS/TLS enforced for data in transit
- Passwords hashed with bcrypt/scrypt/argon2, never stored in plaintext
- Sensitive data (PII, financial, health) identified and protected
- Cryptographic keys are not embedded in code

### A03: Injection

- All SQL uses parameterized queries — flag any string concatenation in queries
- No `eval()`, `exec()`, `Function()`, or `new Function()` with user input
- No OS command injection via `child_process.exec` or `shell: true` with user data
- HTML output is escaped to prevent XSS (check template engines, `innerHTML`, `dangerouslySetInnerHTML`)
- NoSQL injection checked (MongoDB `$where`, `$regex` with user input)
- Template injection checked (user input in template strings sent to template engines)
- Path traversal in file operations (`../` sequences in user-supplied paths)

### A04: Insecure Design

- Rate limiting on authentication, password reset, and payment flows
- Input validation at the business logic level (not just format validation)
- Fail-secure defaults — errors and exceptions do not grant access
- Multi-step flows cannot be bypassed by skipping steps

### A05: Security Misconfiguration

- No debug modes or verbose error output in production
- Default credentials are not present
- Security headers configured (CSP, X-Frame-Options, X-Content-Type-Options, HSTS)
- Stack traces and internal details not leaked in error responses
- Unnecessary features, routes, and endpoints are disabled

### A06: Vulnerable Components

- Dependencies checked for known CVEs (suggest running `npm audit` / `pip audit` / etc.)
- No unmaintained or deprecated packages
- Lock file present and consistent
- Minimal dependency footprint — flag unnecessary dependencies

### A07: Authentication Failures

- Password strength requirements enforced
- Brute force protection (account lockout, rate limiting, CAPTCHA)
- Session management is secure (proper expiry, rotation after login, secure cookie flags)
- Credentials never appear in URLs, logs, or error messages
- MFA supported for sensitive operations

### A08: Data Integrity Failures

- Deserialization of untrusted data is guarded (no `JSON.parse` on unvalidated external input without schema validation)
- CI/CD pipeline configuration reviewed for security
- Package integrity verified (checksums, signatures)

### A09: Logging & Monitoring

- Authentication events logged (login success, failure, lockout)
- Access control failures logged
- Logs do NOT contain sensitive data (passwords, tokens, PII, credit cards)
- Log injection prevented (user input sanitized before logging)

### A10: Server-Side Request Forgery (SSRF)

- All URLs from user input are validated and sanitized
- Allowlist for outbound requests where possible
- Internal service responses are not exposed raw to users
- Private IP ranges blocked in user-supplied URLs (127.0.0.1, 10.x, 172.16-31.x, 192.168.x)

## Output Format

For each security finding, report:

- **File:Line** — Title
  - **Severity**: Critical | High | Medium | Low
  - **OWASP**: A01-A10 category
  - **CWE**: CWE number if applicable (e.g., CWE-89 for SQL injection)
  - **Confidence**: High | Medium | Low
  - **Issue**: What is vulnerable and how it could be exploited
  - **Attack scenario**: A concrete 1-2 sentence example of how an attacker would exploit this
  - **Fix**: Corrected code in a fenced code block

## Rules

- Only report findings you are confident about (medium or high confidence).
- Prioritize exploitable vulnerabilities over theoretical risks.
- For each finding, describe a realistic attack scenario — not just "this could be exploited."
- If you find hardcoded secrets or credentials, flag as Critical immediately.
- If the codebase has no security issues, explicitly state: "No security vulnerabilities found."
- Do not flag issues that are already mitigated by existing code (check for existing validation/sanitization before reporting).

## Example Finding

### [Critical] src/api/users.ts:45 — SQL Injection via string concatenation

- **Severity**: Critical
- **OWASP**: A03 — Injection
- **CWE**: CWE-89
- **Confidence**: High
- **Issue**: User-supplied `userId` is concatenated directly into a SQL query string without parameterization.
- **Attack scenario**: An attacker sends `userId=1; DROP TABLE users--` in the request, which executes arbitrary SQL and deletes the users table.
- **Fix**:
```sql
-- Before (vulnerable)
const query = `SELECT * FROM users WHERE id = ${userId}`;

-- After (parameterized)
const query = `SELECT * FROM users WHERE id = $1`;
const result = await db.query(query, [userId]);
```

## Summary

End with a security summary table:

| OWASP Category | Findings | Highest Severity |
|----------------|----------|-----------------|
| A01: Access Control | N | ... |
| ... | ... | ... |

If any Critical or High findings exist, add a prominent warning:
"**This codebase has [N] critical security issues that should be fixed before deployment.**"
