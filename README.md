# GOPT local test copy

This folder is a local copy of the public `gopt.poker` site and browsable `/files/` assets.

The Git repository lives in this directory. Its private GitHub remote is
[1minus1/gopt.poker](https://github.com/1minus1/gopt.poker), configured as
`origin`; `main` tracks `origin/main`. Commit local changes before pushing them
with `git push`. Release tags can be uploaded with `git push origin --tags`.
GitHub pushes do not deploy the live site. See
[DREAMHOST_DEPLOY.md](DREAMHOST_DEPLOY.md) for SSH/rsync deployment.

Run the full test site from this directory with PHP:

```sh
php -S localhost:8000 router.php
```

Then open:

```text
http://localhost:8000/index.html
```

The standings, Matrix, Admin, and Record pages use clean API routes that DreamHost rewrites to PHP endpoints in `api/` for current data, matrix storage, version management, authenticated uploads, restore/delete actions, and zip archive downloads. This is intended to work on a shared DreamHost account without Node.

Successful uploads create a new version in the history store and move the current-data pointer to that version. By default the PHP backend stores versions in a sibling directory outside the web root:

```text
../gopt-history-store/
```

The first request imports the known static `data/GOPTdatav2.csv` into that version store. `GOPTdatav2.csv` is now the only supported import/export format for the live site.

The Matrix page stores public-editable availability matrices separately in:

```text
../gopt-matrix-store/matrices.json
```

Admin credentials are loaded from a private file outside the web root or from `GOPT_ADMIN_USERNAME` and `GOPT_ADMIN_PASSWORD_HASH` environment settings. No built-in login is stored in Git. See `DREAMHOST_DEPLOY.md` for configuration. Use HTTPS when this is deployed publicly, because Admin and Record submit credentials.

The `record.html` page records a currently played night. It downloads a generated `GOPTdatav2.csv` file when results are finished and can create a new current server data version after the same admin authentication used by Admin.

## Versioning

The current site release is stored in `VERSION` using semantic versioning. Public shorthand can use `vMAJOR.MINOR`, so `1.2.0` is the current `v1.2` release.

Record release notes in `CHANGELOG.md` before tagging or deploying a versioned release.

Local-only cleanup already applied:

- Logo references point at `assets/logo.GIF` instead of hotlinking `scottzero.co`.
- `styles.css` is a small real stylesheet; the production `styles.css` URL currently returns a 404 page.
- The Rules page has valid closing HTML and uses the local payout memo PDF.
