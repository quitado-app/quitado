# Security policy

Quitado is non-custodial: it never holds private keys or funds. It only builds payment requests
and reads the Solana chain. Even so, a bug could mislead a freelancer about whether an invoice was
paid, so we take reports seriously.

## Reporting a vulnerability

Please do **not** open a public issue. Use GitHub's private vulnerability reporting:
**Security → Report a vulnerability** on this repository.

Include what you found, how to reproduce it, and the impact you see. We will acknowledge the
report as soon as we can and keep you informed until it is fixed.

## Scope

In scope: payment detection and validation, invoice handling, authentication of the instance
owner, and anything that could expose secrets or user data.

Out of scope: vulnerabilities in third-party services (Solana RPC providers, wallets) and issues
that require a compromised host or owner device.
