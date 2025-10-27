# Security Policy

## Project
PlayFab-Catalog-Service-Bedrock  
Repository: https://github.com/Daniel-Ric/PlayFab-Catalog-Service-Bedrock

---

## Supported Versions

The following versions receive security-related fixes:

| Version                             | Security Fixes Provided |
|-------------------------------------|-------------------------|
| `main` branch (current development) | ✅                      |
| Tags/releases named `vX.Y.Z`        | ✅ if not marked end-of-life |
| Forks / modified copies             | ❌                      |

If you are running a fork or a significantly modified version, I may not be able to provide a direct patch for you. You are still encouraged to report vulnerabilities so they can be fixed upstream.

---

## What Is Considered a Security Issue

Please report anything that could impact the confidentiality, integrity, or availability of data, users, or systems. For example:

### Authentication / Authorization
- Bypassing authentication or access controls
- Escalating privileges to perform actions you should not be allowed to do
- Accessing admin/debug functionality without permission

### Data Exposure / Integrity
- Reading data without authorization
- Modifying data without authorization
- Secrets, tokens, API keys, credentials or other sensitive values being exposed in code, config, logs, or responses

### Code Execution / Injection
- Remote Code Execution (RCE)
- Command injection
- Deserialization attacks
- Any form of injection including SQL-like injection, NoSQL injection, etc.

### Denial of Service
- Inputs that can intentionally crash the service or make it unavailable with a realistic request pattern

### Input Handling
- Unsafe or missing validation of user input that could be used to break out of expected behavior
- Directly forwarding untrusted input to external services, system commands, or internal services without sanitization

### Insecure Configuration
- Insecure default configuration that would likely be used in production by mistake
- Missing transport security on production-like communication paths

---

## Out of Scope

The following are generally **not** treated as security vulnerabilities (but they can still be filed as normal GitHub issues):

- Typos, dead links, grammar issues, or comments in code
- Theoretical attacks that require unrealistic conditions and have no practical impact
- Extremely high request volumes that are obviously abusive and not representative of real-world traffic
- Vulnerabilities in third-party libraries that:
  - are not actually reachable in normal use of this project, or
  - only apply if you deliberately misconfigure the project in a way it is not intended to be run
- Issues that only affect a local development environment that is already fully trusted and under your control

---

## How To Report a Vulnerability

**Do not open a public GitHub issue with exploit details.**

Instead, please report privately using one of these methods:

1. **Preferred:** Contact me directly on Discord  
   User: `discord.com/users/252138923952832523`

2. **If Discord is not possible:**  
   You may open a GitHub issue in the repository with a title beginning with  
   `SECURITY:`  
   and include a way for me to contact you (for example your Discord username).  
   Do **not** include full exploit details in the public issue. Just let me know that you believe you found a security problem.

### Your report should include:
- A clear description of the issue
- Which part of the project is affected (file, endpoint, function, etc.)
- Exact steps to reproduce the issue
- What you expected to happen
- What actually happened
- The potential impact (for example: "unauthorized read of item data," "service crash," "remote code execution," etc.)
- A minimal proof-of-concept request or payload, if you have one

The more specific the report, the faster I can reproduce and confirm it.

---

## Disclosure Policy

- Please give me reasonable time to investigate, fix, and release a patch before sharing details publicly.
- After the issue is fixed, I may document the fix in release notes or commit messages. I will not include sensitive exploit details that make it easy to attack users who haven't updated yet.
- Credit:  
  - If you would like public credit for discovering the issue, tell me in your report.  
  - If you prefer to stay anonymous, say that instead. I will respect that.

---

## Handling of Leaked Secrets

This project may interact with external services such as PlayFab, Bedrock, or other backend services. These integrations often rely on credentials (API keys, tokens, etc.). Protecting those secrets is critical.

If you discover exposed credentials (for example in source code, commit history, configuration files, or logs):

1. Contact me privately on Discord at `discord.com/users/252138923952832523`.
2. Do **not** post the secret in a public issue, pull request, screenshot, or anywhere else public.
3. I will revoke / rotate the exposed secret and clean up the repository history if required.

---

## Security Practices in This Project

The project aims to follow these principles:

- **No secrets committed to the repository.**  
  Configuration such as service tokens or API keys should be provided through environment variables (for example in a local `.env` file that is not committed).

- **Least privilege.**  
  Any external service credentials used by PlayFab-Catalog-Service-Bedrock should have only the minimal required permissions, not blanket admin rights.

- **Validation and sanitization.**  
  Inputs from outside the service should be validated before being used internally or forwarded to other services.

- **Dependency hygiene.**  
  Dependencies should be kept reasonably up to date, and high-impact security vulnerabilities in dependencies will be addressed.

If you notice a part of the codebase that clearly violates these principles, that is worth reporting privately as a security concern.

---

## Proof-of-Concept / Exploit Testing

You are allowed to create proof-of-concept payloads or requests **only** under the following conditions:

- You test against your own local/dev environment.
- You are not attacking infrastructure, accounts, or data that you do not own.
- You do not attempt to access data belonging to other people without permission.
- You do not intentionally perform large-scale denial-of-service testing against someone else's environment.

A simple "I believe I can do X by sending Y" is enough for a report. You do not need to demonstrate real damage.

---

## Final Notes

Security reports are extremely valuable, whether the issue is critical (like remote code execution) or more subtle (like being able to read data that should be private).

If you are unsure whether something is in scope, assume it might be and contact me privately on Discord:  
`discord.com/users/252138923952832523`.

Thank you for helping keep PlayFab-Catalog-Service-Bedrock safe.
