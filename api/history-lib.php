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

function gopt_static_history_path(): string
{
    return gopt_site_root() . DIRECTORY_SEPARATOR . 'files' . DIRECTORY_SEPARATOR . 'GOPThistory.txt';
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
        throw new GoptHistoryException('The history version index is invalid.', 500);
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
        throw new GoptHistoryException('Could not write the history version index.', 500);
    }
    if (!rename($tempPath, $path)) {
        @unlink($tempPath);
        throw new GoptHistoryException('Could not save the history version index.', 500);
    }
}

function gopt_safe_slug(string $value): string
{
    $slug = strtolower(preg_replace('/[^a-z0-9]+/', '-', $value));
    $slug = trim($slug, '-');
    $slug = substr($slug, 0, 40);
    return $slug !== '' ? $slug : 'history';
}

function gopt_validate_history(string $text): array
{
    $normalized = trim(str_replace(["\r\n", "\r"], "\n", $text));
    $lines = $normalized === '' ? [''] : explode("\n", $normalized);
    $errors = [];
    $warnings = [];

    if (!preg_match('/^\d+$/', $lines[0] ?? '')) {
        $errors[] = 'Line 1 must be a numeric version marker.';
    }

    if (count($lines) < 2) {
        $errors[] = 'The file must include at least one tournament row.';
    }

    $previousTimestamp = PHP_INT_MAX;
    $majorRows = 0;

    for ($index = 1; $index < count($lines); $index += 1) {
        $lineNumber = $index + 1;
        $line = trim($lines[$index]);
        if ($line === '') {
            $errors[] = "Line {$lineNumber} is blank.";
            continue;
        }

        $cells = array_map('trim', explode(',', $line));
        if (count($cells) < 7) {
            $errors[] = "Line {$lineNumber} must have at least 7 comma-separated fields.";
            continue;
        }

        $league = $cells[0] ?? '';
        $season = $cells[1] ?? '';
        $timestampRaw = $cells[2] ?? '';
        $isMajor = strtoupper($cells[3] ?? '');
        $majorName = $cells[4] ?? '';
        $pointsRaw = $cells[5] ?? '';
        $timestamp = filter_var($timestampRaw, FILTER_VALIDATE_INT);
        $players = array_values(array_filter(array_slice($cells, 6), fn($player) => $player !== ''));

        if ($league === '') {
            $errors[] = "Line {$lineNumber} is missing a league.";
        }
        if ($season === '') {
            $errors[] = "Line {$lineNumber} is missing a season.";
        }
        if ($timestamp === false || $timestamp <= 0) {
            $errors[] = "Line {$lineNumber} has an invalid Unix timestamp.";
        }
        if ($isMajor !== 'YES' && $isMajor !== 'NO') {
            $errors[] = "Line {$lineNumber} IsMajor must be YES or NO.";
        }
        if ($isMajor === 'YES') {
            $majorRows += 1;
            if ($majorName === '' || strtoupper($majorName) === 'NO') {
                $errors[] = "Line {$lineNumber} is a major and needs a major name.";
            }
        }
        if (!is_numeric($pointsRaw) || (float)$pointsRaw <= 0) {
            $errors[] = "Line {$lineNumber} has invalid points at stake.";
        }
        if (!count($players)) {
            $errors[] = "Line {$lineNumber} needs at least one player result.";
        }
        if ($timestamp !== false && $timestamp > $previousTimestamp) {
            $warnings[] = "Line {$lineNumber} is newer than the row above it.";
        }
        if ($timestamp !== false) {
            $previousTimestamp = $timestamp;
        }
    }

    return [
        'errors' => $errors,
        'warnings' => $warnings,
        'rowCount' => max(count($lines) - 1, 0),
        'majorRows' => $majorRows,
        'normalizedText' => $normalized . "\n",
        'versionNumber' => intval($lines[0] ?? 0),
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
            throw new GoptHistoryException('History version ' . $validation['versionNumber'] . ' already exists.', 409);
        }
    }

    $source = gopt_safe_slug((string)($options['source'] ?? 'upload'));
    $createdAt = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.u\Z');
    $id = preg_replace('/[:.]/', '-', $createdAt) . '-' . bin2hex(random_bytes(4));
    $filename = $id . '-' . $source . '-v' . $validation['versionNumber'] . '.txt';
    $filePath = gopt_history_version_dir() . DIRECTORY_SEPARATOR . $filename;
    $tempPath = $filePath . '.tmp';
    $normalizedText = $validation['normalizedText'];

    if (file_put_contents($tempPath, $normalizedText, LOCK_EX) === false) {
        throw new GoptHistoryException('Could not write the history version file.', 500);
    }
    if (!rename($tempPath, $filePath)) {
        @unlink($tempPath);
        throw new GoptHistoryException('Could not save the history version file.', 500);
    }

    $metadata = [
        'id' => $id,
        'createdAt' => $createdAt,
        'filename' => $filename,
        'label' => $options['label'] ?? 'Uploaded history file',
        'source' => $source,
        'versionNumber' => $validation['versionNumber'],
        'rowCount' => $validation['rowCount'],
        'majorRows' => $validation['majorRows'],
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

    $seedPath = gopt_static_history_path();
    if (!is_file($seedPath)) {
        throw new GoptHistoryException('No seed history file was found.', 500);
    }

    $seedText = file_get_contents($seedPath);
    $seeded = gopt_save_history_version($seedText ?: '', [
        'label' => 'Imported from files/GOPThistory.txt',
        'source' => 'seed-static-file',
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
        throw new GoptHistoryException('No current history version is available.', 500);
    }

    $path = gopt_history_version_dir() . DIRECTORY_SEPARATOR . $current['filename'];
    $text = file_get_contents($path);
    if ($text === false) {
        throw new GoptHistoryException('Could not read the current history version.', 500);
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
        throw new GoptHistoryException('Selected history version was not found.', 404);
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
        throw new GoptHistoryException('Selected history version was not found.', 404);
    }

    $oldest = gopt_get_oldest_history_version($index);
    if (($target['id'] ?? null) === ($oldest['id'] ?? null)) {
        throw new GoptHistoryException('The oldest history version cannot be deleted.', 409);
    }

    if (($target['id'] ?? null) === ($index['currentId'] ?? null)) {
        throw new GoptHistoryException('The current history version cannot be deleted. Restore another version first.', 409);
    }

    $index['versions'] = array_values(array_filter(
        $index['versions'],
        fn($version) => ($version['id'] ?? null) !== $target['id']
    ));
    gopt_write_index($index);

    $path = gopt_history_version_dir() . DIRECTORY_SEPARATOR . $target['filename'];
    if (is_file($path) && !unlink($path)) {
        throw new GoptHistoryException('The version was removed from the index, but its text file could not be deleted.', 500);
    }

    return ['metadata' => $target, 'index' => $index];
}

function gopt_history_archive_filename(array $version, array $index, int $position): string
{
    $timestamp = preg_replace('/[^0-9TZ-]/', '-', str_replace([':', '.'], '-', (string)($version['createdAt'] ?? '')));
    $current = ($version['id'] ?? null) === ($index['currentId'] ?? null) ? '-current' : '';
    return str_pad((string)($position + 1), 3, '0', STR_PAD_LEFT) . '-' . $timestamp . '-v' . $version['versionNumber'] . $current . '.txt';
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
            throw new GoptHistoryException('Could not read one of the history versions.', 500);
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
        'label' => $options['label'] ?? 'Uploaded history file',
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
