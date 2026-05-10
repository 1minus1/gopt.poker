# GOPT local test copy

This folder is a local copy of the public `gopt.poker` site and browsable `/files/` assets.

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

The built-in admin password is stored as a hash in `api/admin-config.php`; set `GOPT_ADMIN_USERNAME` and `GOPT_ADMIN_PASSWORD_HASH` in the server environment if you want to override the defaults without editing code. Use HTTPS when this is deployed publicly, because Admin and Record submit credentials.

The `record.html` page records a currently played night. It downloads a generated `GOPTdatav2.csv` file when results are finished and can create a new current server data version after the same admin authentication used by Admin.

Local-only cleanup already applied:

- Logo references point at `assets/logo.GIF` instead of hotlinking `scottzero.co`.
- `styles.css` is a small real stylesheet; the production `styles.css` URL currently returns a 404 page.
- The Rules page has valid closing HTML and uses the local payout memo PDF.
