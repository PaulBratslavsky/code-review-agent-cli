---
name: detailed-review
description: >
  Extended review format with educational explanations for each finding.
  Activated when the --details flag is used. Adds best practice rationale,
  real-world consequences, and learning resources to every issue reported.
---

# Detailed Review

When detailed mode is enabled, use this extended format for EVERY issue you report.

## Output Format Per Issue

### [Severity] File:Line — Title

**What's wrong**
Describe the specific problem in this code. Reference the actual variable names, function names, and values involved. Explain what happens at runtime when this code executes.

**Why it matters**
Explain the real-world consequences. Be specific:
- For **security** issues: describe the attack vector and what an attacker could do.
- For **bugs**: describe the user-facing symptoms or data corruption that would occur.
- For **performance**: quantify the impact where possible (O(n^2) vs O(n), memory growth, blocking time).
- For **maintainability**: describe how this makes future changes harder or more error-prone.

Give a concrete scenario, e.g.: "If a user submits a name containing `<script>`, this value is rendered unescaped into the HTML, allowing stored XSS that executes for every visitor."

**Best practice**
Name the principle, convention, or standard that applies:
- OWASP guidelines, CWE numbers for security issues
- Language idioms and official style guides
- SOLID principles, design patterns
- Framework-specific conventions and recommendations

Explain WHY this is the recommended approach — don't just state the rule, help the developer understand the reasoning behind it.

**Fix**
Show the corrected code in a fenced code block. Keep the fix minimal and focused on the issue.

```
// corrected code here
```

**Learn more**
Provide 1-2 specific resources:
- Official documentation pages (not just "see the docs")
- Well-known articles or blog posts
- Relevant standard or specification sections (e.g., "OWASP Top 10 A03:2021 — Injection")

---

## Rules

- Write for a developer who wants to LEARN, not just copy-paste a fix.
- Be specific to the actual codebase — use real variable names, file paths, and function names from the code you reviewed.
- Keep each section concise but complete — aim for 3-5 sentences per section.
- Do NOT skip any section for Critical or Warning issues.
- For Suggestions, the "Why it matters" and "Best practice" sections can be briefer.
- Group related issues together when they share the same root cause, but still explain each fix individually.

## Summary Table

End the report with the same summary table as a standard review, but add a column:

| File | Critical | Warning | Suggestion |
|------|----------|---------|------------|
| ...  | ...      | ...     | ...        |

### Key Takeaways

After the table, add a "Key Takeaways" section with 3-5 bullet points summarizing the most important patterns and practices the developer should adopt from this review. Frame these as positive habits, not criticisms.
