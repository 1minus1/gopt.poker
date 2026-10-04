# DreamHost shared deploy notes

This build is designed for a shared DreamHost account. It uses normal static
files plus PHP endpoints in `api/`; it does not require Node, a reverse proxy, or
a long-running process.

## Command-line deployment

Run from this directory (the Git repository is here, inside the workspace):

```sh
cp deploy.example.json .deploy.local.json
# Edit .deploy.local.json with your SSH username and domain directory.
python3 tools/deploy.py --plan
python3 tools/deploy.py --check
python3 tools/deploy.py
python3 tools/deploy.py --apply
```

If `.deploy.local.json` already exists, keep it rather than copying over it.
The local configuration is Git-ignored. The migrated machine has a known-host
entry for `server.example.com`; confirm that it is still your server.
The configured account needs DreamHost shell access and rsync, as well as SSH
key authentication or an available SSH agent. An optional `identity_file` in
the JSON configuration selects an existing private key. Passwords are never
stored by the script. If you have only an SFTP account, enable shell access for
this workflow, or upload the files listed by `--plan` with an SFTP client.

This machine now has a dedicated key at `~/.ssh/gopt_dreamhost_ed25519`, selected
by its local config. Install its public half once from your terminal, entering
the DreamHost account password at the SSH prompt:

```sh
ssh-copy-id -i ~/.ssh/gopt_dreamhost_ed25519.pub YOUR_USERNAME@server.example.com
```

The key has no passphrase to support unattended deployments. Keep its private
file on this machine; the `.pub` file is the part installed on the server. The
public key was installed on 2026-10-04. Key-only authentication, the writable
`/home/USERNAME/gopt.poker/` destination, and remote rsync were verified. A full
53-file deployment dry run succeeded; it reported timestamp differences only,
with no file-content differences or missing files. No upload was performed.

`--plan` lists files without connecting. `--check` checks SSH authentication,
directory writability, and remote rsync. With no action flag, the script runs an
rsync dry run; only `--apply` uploads. Host-key verification remains enabled.

Uploads always use `gopt-site-production/`, never `rebrands/` or the workspace
landing page. The manifest includes the PHP API, `.htaccess`, published pages,
JavaScript, CSS, public assets/files, VERSION, and `data/GOPTdatav2.csv`. It
excludes local tools, migration notes, page backups, spreadsheets, night-summary
evidence, Git metadata, and runtime stores. `api/admin-config.php` is included:
its local fallback hashes will replace the server copy, so keep server-specific
credentials in the documented environment overrides. Review the dry run first.

The script does not delete remote files. Replaced files are saved outside the
web root under `/home/USERNAME/gopt-code-backups/TIMESTAMP/`. These are code
backups, not backups of live history or matrix data. To restore one, inspect its
contents and copy the desired files back over SSH/SFTP. Deployment updates
files individually; it is not an atomic release switch. Backups need periodic
manual retention cleanup.

After uploading, check the public responses without a browser:

```sh
curl --fail --silent --show-error https://gopt.poker/VERSION
curl --fail --silent --show-error https://gopt.poker/api/history/current
curl --fail --silent --show-error https://gopt.poker/api/matrix
```

## Migration findings (2026-10-04)

The canonical directory retained its original `.git` history (93 commits at
inspection), despite the workspace parent not being a repository. The private
GitHub remote is now `https://github.com/1minus1/gopt.poker.git` (`origin`), with
`main` and release tags pushed. Old deployment ZIPs remain under `deploy/`. Migration
notes and these DreamHost instructions survived, but no old deployment script,
SSH config, or private key file was found in the project or `~/.ssh/`.

## What to upload

Upload the site files into the `gopt.poker` web directory, including:

- `index.html`, `record.html`, `matrix.html`, `upload.html`, `rules.html`, `technote.html`
- `styles.css`, `record.js`, `matrix.js`, `wachs-action.js`
- `.htaccess`
- `router.php` if you want local PHP testing with `php -S`
- `api/`
- `assets/`
- `files/`

Do not upload local-only folders such as `deploy/`, `.history-store/`,
`gopt-history-store/`, or `gopt-matrix-store/`.

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

## Matrix storage

The Matrix page creates a separate public-editable JSON store beside the web
root:

```text
/home/USERNAME/gopt-matrix-store/matrices.json
```

If automatic folder creation is blocked, create `/home/USERNAME/gopt-matrix-store/`
over SSH/SFTP and make sure PHP can write to it.

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
https://gopt.poker/matrix.html
https://gopt.poker/api/matrix
https://gopt.poker/upload.html
```

The direct PHP files such as `/api/history-current.php` also work, but the site
uses the cleaner API routes above.
