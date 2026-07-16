# Security policy

## Supported versions

The latest `0.2.x` release and the current `main` branch receive security
updates.

## Reporting a vulnerability

Use GitHub's **Report a vulnerability** link in the repository Security tab.
Please do not open a public issue for an undisclosed vulnerability.

Include the affected version or commit, a minimal reproduction, the expected
impact, and any suggested mitigation. Do not include a real Apple Health export
or other personal health information; use a synthetic fixture instead.

You should receive an acknowledgement within seven days. Valid reports will be
coordinated privately through remediation and disclosure.

## Security and privacy boundary

recovery-trail is a static, client-side application. Apple Health exports are
parsed in the browser and are not intentionally uploaded, stored remotely, or
sent to analytics. Reports that show data leaving that boundary, untrusted XML
causing script execution, path or resource-exhaustion problems, or misleading
privacy behavior are especially useful.

This policy covers software vulnerabilities. Questions about the training
methodology or medical suitability belong in a normal issue and must not include
personal health information.
