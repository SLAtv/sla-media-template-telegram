# Security policy

## Reporting a vulnerability

Please do not publish credentials or exploit details in a public issue. Contact the repository owner privately through GitHub with a short description, affected version, reproduction steps, and potential impact.

## Secrets

Real credentials belong only in local `.env` files or in the secret manager of the deployment provider. This repository intentionally tracks `.env.example` with empty placeholders and ignores every other `.env*` file.

If a Telegram token is exposed, revoke it immediately with BotFather, create a replacement, update the deployment environment, and register the webhook again.
