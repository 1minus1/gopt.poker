# DreamHost shared deploy notes

This build is designed for a shared DreamHost account. It uses normal static
files plus PHP endpoints in `api/`; it does not require Node, a reverse proxy, or
a long-running process.

## What to upload

Upload the site files into the `gopt.poker` web directory, including:

- `index.html`, `record.html`, `upload.html`, `rules.html`, `technote.html`
- `styles.css`, `record.js`, `wachs-action.js`
- `.htaccess`
- `router.php` if you want local PHP testing with `php -S`
- `api/`
- `assets/`
- `files/`

Do not upload local-only folders such as `deploy/`, `.history-store/`, or
`gopt-history-store/`.

## History storage

By default, the PHP backend creates this folder beside the web root:

```text
../gopt-history-store/
```

For a DreamHost domain directory like:

```text
/home/USERNAME/gopt.poker/
```

the default history store becomes:

```text
/home/USERNAME/gopt-history-store/
```

That keeps the version database outside the public web directory. If DreamHost
permissions block automatic creation, create the folder once over SSH/SFTP and
make sure the PHP user can write to it.

The first request seeds the history store from `data/GOPTdatav2.csv`. The live
pages and Admin tools only support that v2 CSV format.

## Admin password

The default admin username and hashed password are in `api/admin-config.php`.
For production, prefer replacing the hash or setting environment variables:

```text
GOPT_ADMIN_USERNAME
GOPT_ADMIN_PASSWORD_HASH
```

`GOPT_ADMIN_PASSWORD_HASH` may be either the existing `pbkdf2_sha256$...` format
or a PHP `password_hash()` value. Use HTTPS for the public site because Admin and
Record submit credentials.

## Verify after upload

Open these URLs:

```text
https://gopt.poker/
https://gopt.poker/api/history/current
https://gopt.poker/api/history/versions
https://gopt.poker/record.html
https://gopt.poker/upload.html
```

The direct PHP files such as `/api/history-current.php` also work, but the site
uses the cleaner API routes above.
