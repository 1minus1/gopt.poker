<?php

class GoptHistoryException extends Exception
{
    public int $statusCode;

    public function __construct(string $message, int $statusCode = 400)
    {
        parent::__construct($message);
        $this->statusCode = $statusCode;
    }
}

const GOPT_MAX_UPLOAD_BYTES = 1048576;

function gopt_site_root(): string
{
    $root = realpath(__DIR__ . '/..');
    return $root ?: dirname(__DIR__);
}

function gopt_history_store_dir(): string
{
    $env = getenv('GOPT_HISTORY_STORE_DIR');
    if ($env) {
        return rtrim($env, DIRECTORY_SEPARATOR);
    }

    return dirname(gopt_site_root()) . DIRECTORY_SEPARATOR . 'gopt-history-store';
}

function gopt_static_data_v2_path(): string
{
    return gopt_site_root() . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'GOPTdatav2.csv';
}

function gopt_history_version_dir(): string
{
    return gopt_history_store_dir() . DIRECTORY_SEPARATOR . 'versions';
}

function gopt_history_index_path(): string
{
    return gopt_history_store_dir() . DIRECTORY_SEPARATOR . 'index.json';
}

function gopt_history_lock_path(): string
{
    return gopt_history_store_dir() . DIRECTORY_SEPARATOR . 'history.lock';
}

function gopt_admin_config(): array
{
    $config = require __DIR__ . '/admin-config.php';
    return is_array($config) ? $config : [];
}

function gopt_verify_password(string $password, string $encodedHash): bool
{
    if (strpos($encodedHash, 'pbkdf2_sha256$') === 0) {
        $parts = explode('$', $encodedHash);
        if (count($parts) !== 4) {
            throw new GoptHistoryException('Invalid password hash format.', 500);
        }

        [, $iterationsRaw, $salt, $expectedHex] = $parts;
        $iterations = filter_var($iterationsRaw, FILTER_VALIDATE_INT);
        if (!$iterations || !ctype_xdigit($expectedHex)) {
            throw new GoptHistoryException('Invalid password hash format.', 500);
        }

        $actualHex = hash_pbkdf2('sha256', $password, $salt, $iterations, strlen($expectedHex), false);
        return hash_equals(strtolower($expectedHex), strtolower($actualHex));
    }

    return password_verify($password, $encodedHash);
}

function gopt_authenticate(string $username, string $password): bool
{
    $config = gopt_admin_config();
    $expectedUsername = (string)($config['username'] ?? '');
    $expectedHash = (string)($config['password_hash'] ?? '');

    return hash_equals($expectedUsername, $username) && gopt_verify_password($password, $expectedHash);
}

function gopt_send_json(int $statusCode, array $body): void
{
    $text = json_encode($body, JSON_UNESCAPED_SLASHES);
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    header('Content-Length: ' . strlen($text));
    echo $text;
}

function gopt_send_upload_result(array $params, int $statusCode = 200): void
{
    $accept = $_SERVER['HTTP_ACCEPT'] ?? '';
    if (strpos($accept, 'application/json') !== false) {
        gopt_send_json($statusCode, $params);
        return;
    }

    header('Location: /upload.html?' . http_build_query($params), true, 303);
}

function gopt_method_not_allowed(array $allowed): void
{
    header('Allow: ' . implode(', ', $allowed));
    gopt_send_json(405, ['status' => 'error', 'message' => 'Method not allowed.']);
}

function gopt_ensure_history_dirs(): void
{
    foreach ([gopt_history_store_dir(), gopt_history_version_dir()] as $dir) {
        if (is_dir($dir)) {
            continue;
        }
        if (!mkdir($dir, 0755, true) && !is_dir($dir)) {
            throw new GoptHistoryException('Could not create the history store directory.', 500);
        }
    }
}

function gopt_with_history_lock(bool $exclusive, callable $callback)
{
    gopt_ensure_history_dirs();
    $handle = fopen(gopt_history_lock_path(), 'c');
    if (!$handle) {
        throw new GoptHistoryException('Could not open the history lock file.', 500);
    }

    $lockType = $exclusive ? LOCK_EX : LOCK_SH;
    if (!flock($handle, $lockType)) {
        fclose($handle);
        throw new GoptHistoryException('Could not lock the history store.', 500);
    }

    try {
        return $callback();
    } finally {
        flock($handle, LOCK_UN);
        fclose($handle);
    }
}

function gopt_read_index(): array
{
    $path = gopt_history_index_path();
    if (!is_file($path)) {
        return ['currentId' => null, 'versions' => []];
    }

    $data = file_get_contents($path);
    $parsed = json_decode($data ?: '', true);
    if (!is_array($parsed) || !isset($parsed['versions']) || !is_array($parsed['versions'])) {
        throw new GoptHistoryException('The data version index is invalid.', 500);
    }

    return [
        'currentId' => $parsed['currentId'] ?? null,
        'versions' => $parsed['versions'],
    ];
}

function gopt_write_index(array $index): void
{
    gopt_ensure_history_dirs();
    $path = gopt_history_index_path();
    $tempPath = $path . '.tmp';
    $text = json_encode($index, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";

    if (file_put_contents($tempPath, $text, LOCK_EX) === false) {
        throw new GoptHistoryException('Could not write the data version index.', 500);
    }
    if (!rename($tempPath, $path)) {
        @unlink($tempPath);
        throw new GoptHistoryException('Could not save the data version index.', 500);
    }
}

function gopt_keep_supported_history_versions(array $index): array
{
    $changed = false;
    $versions = [];

    foreach ($index['versions'] as $version) {
        if (($version['format'] ?? '') === 'v2') {
            $versions[] = $version;
            continue;
        }

        $changed = true;
        $filename = (string)($version['filename'] ?? '');
        if ($filename !== '') {
            $path = gopt_history_version_dir() . DIRECTORY_SEPARATOR . $filename;
            if (is_file($path)) {
                @unlink($path);
            }
        }
    }

    if (!$changed) {
        return $index;
    }

    $index['versions'] = $versions;
    $validIds = array_map(fn($version) => $version['id'] ?? null, $versions);
    if (!in_array($index['currentId'] ?? null, $validIds, true)) {
        $index['currentId'] = $versions[0]['id'] ?? null;
    }
    gopt_write_index($index);

    return $index;
}

function gopt_safe_slug(string $value): string
{
    $slug = strtolower(preg_replace('/[^a-z0-9]+/', '-', $value));
    $slug = trim($slug, '-');
    $slug = substr($slug, 0, 40);
    return $slug !== '' ? $slug : 'history';
}

function gopt_normalized_upload_text(string $text): string
{
    $normalized = trim(str_replace(["\r\n", "\r"], "\n", $text));
    $withoutBom = preg_replace('/^\xEF\xBB\xBF/', '', $normalized);
    return $withoutBom === null ? $normalized : $withoutBom;
}

function gopt_csv_rows(string $text): array
{
    $lines = explode("\n", $text);
    $rows = [];
    foreach ($lines as $line) {
        if (trim($line) === '') {
            continue;
        }
        $rows[] = array_map('trim', str_getcsv($line));
    }
    return $rows;
}

function gopt_date_is_valid(string $dateText): bool
{
    if (!preg_match('/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/', trim($dateText), $matches)) {
        return false;
    }

    $year = intval($matches[3]);
    if ($year < 100) {
        $year += 2000;
    }

    return checkdate(intval($matches[1]), intval($matches[2]), $year);
}

function gopt_date_sort_value(string $dateText): int
{
    if (!preg_match('/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/', trim($dateText), $matches)) {
        return 0;
    }

    $year = intval($matches[3]);
    if ($year < 100) {
        $year += 2000;
    }

    return intval(sprintf('%04d%02d%02d', $year, intval($matches[1]), intval($matches[2])));
}

function gopt_looks_like_data_v2(string $text): bool
{
    $rows = gopt_csv_rows($text);
    return strtolower((string)($rows[0][0] ?? '')) === 'history_version';
}

function gopt_validate_data_v2(string $text): array
{
    $normalized = gopt_normalized_upload_text($text);
    $rows = gopt_csv_rows($normalized);
    $errors = [];
    $warnings = [];
    $majorRows = 0;

    if (!count($rows)) {
        $errors[] = 'The CSV file is empty.';
        return [
            'errors' => $errors,
            'warnings' => $warnings,
            'rowCount' => 0,
            'majorRows' => 0,
            'normalizedText' => "\n",
            'versionNumber' => 0,
            'format' => 'v2',
        ];
    }

    $headers = array_map(fn($header) => strtolower(trim((string)$header)), $rows[0]);
    $headerMap = [];
    foreach ($headers as $index => $header) {
        $headerMap[$header] = $index;
    }

    $required = [
        'history_version',
        'league',
        'season',
        'date',
        'is_major',
        'major_name',
        'host',
        'points_at_stake',
        'tournament_number',
        'is_ordered',
    ];

    foreach ($required as $column) {
        if (!array_key_exists($column, $headerMap)) {
            $errors[] = "The CSV file is missing {$column}.";
        }
    }

    $finisherColumns = [];
    foreach ($headers as $index => $header) {
        if (preg_match('/^finisher_(\d+)$/', $header, $matches)) {
            $finisherColumns[intval($matches[1])] = $index;
        }
    }
    ksort($finisherColumns);
    if (!count($finisherColumns)) {
        $errors[] = 'The CSV file needs at least one finisher column.';
    }

    if (count($rows) < 2) {
        $errors[] = 'The CSV file must include at least one tournament row.';
    }

    $versionNumbers = [];
    $previousDate = 0;

    for ($index = 1; $index < count($rows); $index += 1) {
        $lineNumber = $index + 1;
        $row = $rows[$index];
        $cell = fn($name) => trim((string)($row[$headerMap[$name] ?? -1] ?? ''));

        $versionRaw = $cell('history_version');
        $version = filter_var($versionRaw, FILTER_VALIDATE_INT);
        $league = $cell('league');
        $season = $cell('season');
        $dateText = $cell('date');
        $isMajor = strtoupper($cell('is_major'));
        $majorName = $cell('major_name');
        $pointsRaw = $cell('points_at_stake');
        $tournamentRaw = $cell('tournament_number');
        $isOrdered = strtoupper($cell('is_ordered'));
        $finishers = [];

        foreach ($finisherColumns as $finisherIndex) {
            $finisher = trim((string)($row[$finisherIndex] ?? ''));
            if ($finisher !== '') {
                $finishers[] = $finisher;
            }
        }

        if ($version === false || $version <= 0) {
            $errors[] = "Line {$lineNumber} has an invalid history version.";
        } else {
            $versionNumbers[] = intval($version);
        }
        if ($league === '') {
            $errors[] = "Line {$lineNumber} is missing a league.";
        }
        if ($season === '') {
            $errors[] = "Line {$lineNumber} is missing a season.";
        }
        if (!gopt_date_is_valid($dateText)) {
            $errors[] = "Line {$lineNumber} has an invalid MM/DD/YYYY date.";
        } else {
            $sortValue = gopt_date_sort_value($dateText);
            if ($previousDate && $sortValue < $previousDate) {
                $warnings[] = "Line {$lineNumber} is older than the row above it.";
            }
            $previousDate = $sortValue;
        }
        if ($isMajor !== 'YES' && $isMajor !== 'NO') {
            $errors[] = "Line {$lineNumber} is_major must be YES or NO.";
        }
        if ($isMajor === 'YES') {
            $majorRows += 1;
            if ($majorName === '') {
                $errors[] = "Line {$lineNumber} is a major and needs a major name.";
            }
        }
        if (!is_numeric($pointsRaw) || (float)$pointsRaw <= 0) {
            $errors[] = "Line {$lineNumber} has invalid points at stake.";
        }
        if (filter_var($tournamentRaw, FILTER_VALIDATE_INT) === false || intval($tournamentRaw) <= 0) {
            $errors[] = "Line {$lineNumber} has an invalid tournament number.";
        }
        if ($isOrdered !== 'YES' && $isOrdered !== 'NO') {
            $errors[] = "Line {$lineNumber} is_ordered must be YES or NO.";
        }
        if (!count($finishers)) {
            $errors[] = "Line {$lineNumber} needs at least one player result.";
        }
    }

    $uniqueVersions = array_values(array_unique($versionNumbers));
    if (count($uniqueVersions) > 1) {
        $errors[] = 'All CSV rows must use the same history_version value.';
    }

    return [
        'errors' => $errors,
        'warnings' => $warnings,
        'rowCount' => max(count($rows) - 1, 0),
        'majorRows' => $majorRows,
        'normalizedText' => $normalized . "\n",
        'versionNumber' => count($uniqueVersions) ? intval($uniqueVersions[0]) : 0,
        'format' => 'v2',
    ];
}

function gopt_validate_history(string $text): array
{
    $normalized = gopt_normalized_upload_text($text);
    if (gopt_looks_like_data_v2($normalized)) {
        return gopt_validate_data_v2($normalized);
    }

    return [
        'errors' => ['Unsupported data file format. Upload GOPTdatav2.csv.'],
        'warnings' => [],
        'rowCount' => 0,
        'majorRows' => 0,
        'normalizedText' => $normalized . "\n",
        'versionNumber' => 0,
        'format' => 'v2',
    ];
}

function gopt_save_history_version(string $fileText, array $options = []): array
{
    if (empty($options['skipEnsure'])) {
        gopt_ensure_history_store();
    } else {
        gopt_ensure_history_dirs();
    }

    $validation = gopt_validate_history($fileText);
    if (count($validation['errors'])) {
        throw new GoptHistoryException(implode(' ', array_slice($validation['errors'], 0, 4)), 400);
    }

    $index = gopt_read_index();
    foreach ($index['versions'] as $version) {
        if (intval($version['versionNumber'] ?? 0) === intval($validation['versionNumber'])) {
            throw new GoptHistoryException('Data version ' . $validation['versionNumber'] . ' already exists.', 409);
        }
    }

    $source = gopt_safe_slug((string)($options['source'] ?? 'upload'));
    $createdAt = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.u\Z');
    $id = preg_replace('/[:.]/', '-', $createdAt) . '-' . bin2hex(random_bytes(4));
    $extension = '.csv';
    $filename = $id . '-' . $source . '-v' . $validation['versionNumber'] . $extension;
    $filePath = gopt_history_version_dir() . DIRECTORY_SEPARATOR . $filename;
    $tempPath = $filePath . '.tmp';
    $normalizedText = $validation['normalizedText'];

    if (file_put_contents($tempPath, $normalizedText, LOCK_EX) === false) {
        throw new GoptHistoryException('Could not write the data version file.', 500);
    }
    if (!rename($tempPath, $filePath)) {
        @unlink($tempPath);
        throw new GoptHistoryException('Could not save the data version file.', 500);
    }

    $metadata = [
        'id' => $id,
        'createdAt' => $createdAt,
        'filename' => $filename,
        'label' => $options['label'] ?? 'Uploaded data file',
        'source' => $source,
        'versionNumber' => $validation['versionNumber'],
        'rowCount' => $validation['rowCount'],
        'majorRows' => $validation['majorRows'],
        'format' => 'v2',
        'sha256' => hash('sha256', $normalizedText),
    ];

    array_unshift($index['versions'], $metadata);
    if (($options['setCurrent'] ?? true) !== false) {
        $index['currentId'] = $id;
    }
    gopt_write_index($index);

    return $validation + ['metadata' => $metadata, 'index' => $index];
}

function gopt_ensure_history_store(): array
{
    gopt_ensure_history_dirs();
    $index = gopt_read_index();
    $index = gopt_keep_supported_history_versions($index);

    if (count($index['versions'])) {
        $currentId = $index['currentId'] ?? null;
        $hasCurrent = false;
        foreach ($index['versions'] as $version) {
            if (($version['id'] ?? null) === $currentId) {
                $hasCurrent = true;
                break;
            }
        }

        if (!$hasCurrent) {
            $index['currentId'] = $index['versions'][0]['id'] ?? null;
            gopt_write_index($index);
        }

        return $index;
    }

    $seedPath = gopt_static_data_v2_path();

    if (!is_file($seedPath)) {
        throw new GoptHistoryException('No seed GOPTdatav2.csv file was found.', 500);
    }

    $seedText = file_get_contents($seedPath);
    $seeded = gopt_save_history_version($seedText ?: '', [
        'label' => 'Imported from data/GOPTdatav2.csv',
        'source' => 'seed-static-data-v2',
        'setCurrent' => true,
        'skipEnsure' => true,
    ]);

    return $seeded['index'];
}

function gopt_get_oldest_history_version(array $index): ?array
{
    $oldest = null;
    foreach ($index['versions'] as $version) {
        if ($oldest === null) {
            $oldest = $version;
            continue;
        }

        $versionCreated = (string)($version['createdAt'] ?? '');
        $oldestCreated = (string)($oldest['createdAt'] ?? '');
        if ($oldestCreated === '' || ($versionCreated !== '' && strcmp($versionCreated, $oldestCreated) < 0)) {
            $oldest = $version;
        }
    }

    return $oldest;
}

function gopt_version_list(array $index): array
{
    $oldest = gopt_get_oldest_history_version($index);
    return array_map(function ($version) use ($index, $oldest) {
        $version['isCurrent'] = ($version['id'] ?? null) === ($index['currentId'] ?? null);
        $version['isOldest'] = ($version['id'] ?? null) === ($oldest['id'] ?? null);
        return $version;
    }, $index['versions']);
}

function gopt_get_current_history(): array
{
    $index = gopt_ensure_history_store();
    $current = null;
    foreach ($index['versions'] as $version) {
        if (($version['id'] ?? null) === ($index['currentId'] ?? null)) {
            $current = $version;
            break;
        }
    }

    if (!$current) {
        throw new GoptHistoryException('No current data version is available.', 500);
    }

    $path = gopt_history_version_dir() . DIRECTORY_SEPARATOR . $current['filename'];
    $text = file_get_contents($path);
    if ($text === false) {
        throw new GoptHistoryException('Could not read the current data version.', 500);
    }

    return ['text' => $text, 'metadata' => $current, 'index' => $index];
}

function gopt_revert_history_version(string $versionId): array
{
    $index = gopt_ensure_history_store();
    $target = null;
    foreach ($index['versions'] as $version) {
        if (($version['id'] ?? null) === $versionId) {
            $target = $version;
            break;
        }
    }

    if (!$target) {
        throw new GoptHistoryException('Selected data version was not found.', 404);
    }

    $index['currentId'] = $target['id'];
    gopt_write_index($index);
    return ['metadata' => $target, 'index' => $index];
}

function gopt_delete_history_version(string $versionId): array
{
    $index = gopt_ensure_history_store();
    $target = null;
    foreach ($index['versions'] as $version) {
        if (($version['id'] ?? null) === $versionId) {
            $target = $version;
            break;
        }
    }

    if (!$target) {
        throw new GoptHistoryException('Selected data version was not found.', 404);
    }

    $oldest = gopt_get_oldest_history_version($index);
    if (($target['id'] ?? null) === ($oldest['id'] ?? null)) {
        throw new GoptHistoryException('The oldest data version cannot be deleted.', 409);
    }

    if (($target['id'] ?? null) === ($index['currentId'] ?? null)) {
        throw new GoptHistoryException('The current data version cannot be deleted. Restore another version first.', 409);
    }

    $index['versions'] = array_values(array_filter(
        $index['versions'],
        fn($version) => ($version['id'] ?? null) !== $target['id']
    ));
    gopt_write_index($index);

    $path = gopt_history_version_dir() . DIRECTORY_SEPARATOR . $target['filename'];
    if (is_file($path) && !unlink($path)) {
        throw new GoptHistoryException('The version was removed from the index, but its data file could not be deleted.', 500);
    }

    return ['metadata' => $target, 'index' => $index];
}

function gopt_history_archive_filename(array $version, array $index, int $position): string
{
    $timestamp = preg_replace('/[^0-9TZ-]/', '-', str_replace([':', '.'], '-', (string)($version['createdAt'] ?? '')));
    $current = ($version['id'] ?? null) === ($index['currentId'] ?? null) ? '-current' : '';
    return str_pad((string)($position + 1), 3, '0', STR_PAD_LEFT) . '-' . $timestamp . '-v' . $version['versionNumber'] . $current . '.csv';
}

function gopt_dos_date_time(string $value): array
{
    $timestamp = strtotime($value) ?: time();
    $parts = getdate($timestamp);
    $year = max(intval($parts['year']), 1980);

    return [
        'dosTime' => (intval($parts['hours']) << 11) | (intval($parts['minutes']) << 5) | intdiv(intval($parts['seconds']), 2),
        'dosDate' => (($year - 1980) << 9) | (intval($parts['mon']) << 5) | intval($parts['mday']),
    ];
}

function gopt_create_zip_buffer(array $entries): string
{
    $localParts = [];
    $centralParts = [];
    $offset = 0;

    foreach ($entries as $entry) {
        $name = (string)$entry['name'];
        $data = (string)$entry['data'];
        $nameLength = strlen($name);
        $dataLength = strlen($data);
        $crc = intval(hexdec(hash('crc32b', $data)));
        $dos = gopt_dos_date_time((string)($entry['createdAt'] ?? 'now'));

        $localHeader = pack(
            'Vv5V3v2',
            0x04034b50,
            20,
            0,
            0,
            $dos['dosTime'],
            $dos['dosDate'],
            $crc,
            $dataLength,
            $dataLength,
            $nameLength,
            0
        );
        $localParts[] = $localHeader . $name . $data;

        $centralHeader = pack(
            'Vv6V3v5V2',
            0x02014b50,
            20,
            20,
            0,
            0,
            $dos['dosTime'],
            $dos['dosDate'],
            $crc,
            $dataLength,
            $dataLength,
            $nameLength,
            0,
            0,
            0,
            0,
            0,
            $offset
        );
        $centralParts[] = $centralHeader . $name;
        $offset += strlen($localHeader) + $nameLength + $dataLength;
    }

    $centralDirectory = implode('', $centralParts);
    $endRecord = pack(
        'Vv4V2v',
        0x06054b50,
        0,
        0,
        count($entries),
        count($entries),
        strlen($centralDirectory),
        $offset,
        0
    );

    return implode('', $localParts) . $centralDirectory . $endRecord;
}

function gopt_build_history_versions_zip(): string
{
    $index = gopt_ensure_history_store();
    $entries = [];

    foreach ($index['versions'] as $position => $version) {
        $path = gopt_history_version_dir() . DIRECTORY_SEPARATOR . $version['filename'];
        $text = file_get_contents($path);
        if ($text === false) {
            throw new GoptHistoryException('Could not read one of the data versions.', 500);
        }

        $entries[] = [
            'name' => gopt_history_archive_filename($version, $index, $position),
            'data' => $text,
            'createdAt' => $version['createdAt'] ?? 'now',
        ];
    }

    return gopt_create_zip_buffer($entries);
}

function gopt_save_history_upload(string $fileText, array $options = []): array
{
    return gopt_save_history_version($fileText, [
        'label' => $options['label'] ?? 'Uploaded data file',
        'source' => $options['source'] ?? 'upload',
        'setCurrent' => true,
    ]);
}

function gopt_read_json_body(): array
{
    $raw = file_get_contents('php://input');
    $data = json_decode($raw ?: '{}', true);
    if (!is_array($data)) {
        throw new GoptHistoryException('Request body must be valid JSON.', 400);
    }

    return $data;
}

function gopt_exception_status(Throwable $error): int
{
    return $error instanceof GoptHistoryException ? $error->statusCode : 500;
}
