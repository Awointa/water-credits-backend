# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| `main` (pre-release) | ✅ Active development |

This project is in early development (v0.1) and has not yet had a formal security audit. Use on testnet only — do **not** deploy to mainnet or handle real funds until v1.0 and the audit are complete.

---

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.** Public disclosure before a fix is in place puts other users at risk.

### How to Report

1. **Email:** Send a report to [ogazipromise81@gmail.com](mailto:ogazipromise81@gmail.com)
   - Use the subject line: `[SECURITY] <brief description>`
   - Encrypt sensitive details using our PGP key if possible (key available on request)

2. **GitHub Private Advisory (alternative):** Use [GitHub's private security advisory](https://github.com/water-credits/water-credits-backend/security/advisories/new) feature to submit directly in the repository without public disclosure.

### What to Include

- A clear description of the vulnerability
- Steps to reproduce or a proof-of-concept (where safe to provide)
- The potential impact (data exposure, fund loss, privilege escalation, etc.)
- The component or module affected
- Any suggested mitigations you've identified

### Response Timeline

| Stage | Target timeframe |
|---|---|
| Acknowledgement | Within 48 hours |
| Initial assessment | Within 5 business days |
| Fix or mitigation | Within 30 days (critical issues prioritised) |
| Public disclosure | After fix is released and users have had time to update |

We will keep you informed throughout the process. If you do not hear back within 48 hours, follow up via [GitHub Discussions](https://github.com/water-credits/water-credits-backend/discussions) or Telegram [@Escelit](https://t.me/Escelit).

---

## Scope

### In scope

- Authentication and authorisation bypasses
- JWT vulnerabilities (forgery, secret leakage, algorithm confusion)
- SQL injection or ORM query manipulation
- Soroban contract interaction vulnerabilities (invalid transaction construction, nonce manipulation)
- Oracle data manipulation or spoofing
- Sensor data forgery that could result in fraudulent credit issuance
- Privilege escalation (role bypass, admin access)
- Secrets or credentials exposed in logs, responses, or headers
- Denial-of-service vulnerabilities with significant impact

### Out of scope

- Vulnerabilities in Stellar's core protocol or Soroban itself — report those to [Stellar's bug bounty](https://www.stellar.org/bug-bounty)
- Issues in third-party dependencies — report those upstream
- Theoretical attacks without a working proof of concept
- Rate limiting bypasses with minimal real-world impact
- Missing security headers on non-sensitive endpoints

---

## Disclosure Policy

We follow [coordinated vulnerability disclosure](https://cheatsheetseries.owasp.org/cheatsheets/Vulnerability_Disclosure_Cheat_Sheet.html). We ask that reporters:

- Give us a reasonable time to fix the issue before public disclosure
- Avoid accessing or modifying other users' data during testing
- Do not perform denial-of-service testing against shared infrastructure

In return, we commit to:

- Acknowledging your report promptly
- Working with you in good faith to understand and resolve the issue
- Crediting you in the release notes (unless you prefer to remain anonymous)
- Not pursuing legal action for good-faith security research

---

## Maintainer Contacts

| Name | Channel | Details |
|---|---|---|
| Ogazi Promise | GitHub | [@Escelit](https://github.com/Escelit) |
| Ogazi Promise | Telegram | [@Escelit](https://t.me/Escelit) |
| Ogazi Promise | Email | [ogazipromise81@gmail.com](mailto:ogazipromise81@gmail.com) |
