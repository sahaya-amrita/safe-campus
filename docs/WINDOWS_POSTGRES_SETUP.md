# Native Windows PostgreSQL setup

These steps use the installed PostgreSQL 18 Windows service. They do not edit `pg_hba.conf`, change the `postgres` administrator password, or modify the service.

## Prerequisites

Obtain the existing password for an authorized PostgreSQL administrator from the person who installed or manages PostgreSQL. Do not place that administrator password in `.env` or this repository.

The verified local executable is:

```powershell
$Psql = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
```

## Connect as an administrator

Use `-W` so `psql` prompts securely instead of placing the password in PowerShell history:

```powershell
& $Psql -h localhost -p 5432 -U postgres -d postgres -W
```

If the installation uses a different administrator role, replace only `postgres` after confirming that role with the database administrator. A failed password prompt is a credential issue; do not edit PostgreSQL authentication configuration to bypass it.

## Inspect before creating anything

At the `psql` prompt, check whether dedicated objects already exist:

```sql
\du sahaya
\l sahaya
\l sahaya_test
```

If an existing `sahaya` role or database is owned or used by another project, stop and coordinate with its owner. Do not drop or repurpose it.

## Create dedicated development objects

Run these only when the preceding inspection confirms the objects do not exist:

```sql
CREATE ROLE sahaya LOGIN;
\password sahaya
CREATE DATABASE sahaya OWNER sahaya ENCODING 'UTF8';
CREATE DATABASE sahaya_test OWNER sahaya ENCODING 'UTF8';
```

The `\password` command prompts for a new password without echoing it. This password belongs only to the new `sahaya` application role; it is not the PostgreSQL administrator password.

Exit with `\q`, then confirm the application role can connect:

```powershell
& $Psql -h localhost -p 5432 -U sahaya -d sahaya -W -c 'select current_database(), current_user, current_setting(''server_version'');'
```

## Configure the API

Copy the template if `services/api/.env` is absent:

```powershell
Copy-Item services/api/.env.example services/api/.env
```

Edit the ignored `services/api/.env` file. For native PostgreSQL, use port 5432:

```dotenv
DATABASE_URL=postgres://sahaya:<URL-ENCODED-APPLICATION-PASSWORD>@localhost:5432/sahaya
TEST_DATABASE_URL=postgres://sahaya:<URL-ENCODED-APPLICATION-PASSWORD>@localhost:5432/sahaya_test
JWT_SECRET=<RANDOM-SECRET-AT-LEAST-32-CHARACTERS>
```

Use a password manager to generate a strong URL-safe application password, or URL-encode reserved characters before placing the value in a PostgreSQL URL. Never commit `.env`.

Generate a JWT secret in PowerShell:

```powershell
$Bytes = New-Object byte[] 48
[Security.Cryptography.RandomNumberGenerator]::Fill($Bytes)
[Convert]::ToBase64String($Bytes)
```

Paste the result into `.env`; do not use the placeholder from `.env.example` outside local scaffolding.

## Apply and verify

From the repository root:

```powershell
pnpm db:migrate
pnpm db:seed
pnpm dev
```

In another PowerShell window:

```powershell
Invoke-RestMethod http://localhost:3000/api/v1/health
```

The expected response reports `status: ok`, `database: connected`, and `mode: DEMO`.
