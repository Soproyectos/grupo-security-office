# Supabase TLS for the Hostinger Node.js API

The API uses its own NestJS/Prisma database connection, not the Supabase browser SDK. A successful `/api/health` response does not prove login can query PostgreSQL.

## Hostinger settings

For the `api-dev.gruposecurity.com.co` Node.js application, set these in Hostinger's environment-variable panel (not in a ZIP or Git):

| Variable | Value |
| --- | --- |
| `DATABASE_DRIVER` | `pg` |
| `DATABASE_URL` | The Supabase **Session pooler** URL for the target project, port `5432`, with the password URL-encoded and `?sslmode=require`. Keep it private. |
| `DATABASE_SSL_CA_BASE64` | Base64 of the **PEM certificate downloaded from this Supabase project's Database Settings → SSL Configuration → Download Certificate**. No filename, path, quotes, or line breaks. |

Generate the base64 value on a trusted local machine after downloading the certificate:

```bash
base64 -w 0 prod-ca-2021.crt
```

On macOS, use `base64 < prod-ca-2021.crt | tr -d '\n'`. Copy the result privately into Hostinger; do not share it in chat or commit it. The certificate is public trust material, but using the wrong project's CA will correctly fail closed.

The runtime's `pg` adapter removes `sslmode` from an internal copy of the URL because node-postgres otherwise replaces its explicit SSL settings. It supplies the decoded CA, `rejectUnauthorized: true`, and the URL hostname as the TLS server name. It rejects missing/invalid CA values and conflicting TLS URL parameters. Do **not** set `NODE_TLS_REJECT_UNAUTHORIZED=0`, `sslaccept=accept_invalid_certs`, or `sslmode=disable`.

The existing `JWT_SECRET`, `MFA_ENCRYPTION_KEY`, `CORS_ORIGIN`, and other working application variables remain unchanged. This fix does not create or migrate Supabase tables, reset the admin password, or deploy the ZIP automatically.

## Deploy and validate

Upload the backend ZIP to Hostinger's existing Node.js deployment flow for `api-dev.gruposecurity.com.co`, then rebuild/redeploy and restart the application. Do not upload it to the frontend site. Check the deployment logs for a clean startup; test `/api/health`, then one login attempt with the retained admin account. A successful health response alone is insufficient. Do not paste database passwords, the full connection URL, MFA keys, or login credentials into support logs/screenshots.

If TLS still fails, verify that the CA came from the **same Supabase project** and that the Session pooler hostname in `DATABASE_URL` matches its certificate; do not disable certificate checks. This repository cannot verify Hostinger's live connection without an authorized deployment and runtime access.

References: [Supabase SSL enforcement](https://supabase.com/docs/guides/platform/ssl-enforcement), [Supabase psql connection with pooler and CA](https://supabase.com/docs/guides/database/psql), [node-postgres SSL configuration](https://node-postgres.com/features/ssl).
