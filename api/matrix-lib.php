<?php

require_once __DIR__ . '/history-lib.php';

const GOPT_MATRIX_STATUSES = ['', 'IN', 'OUT', 'DOUBTFUL', 'QUESTIONABLE', 'PROBABLE'];

function gopt_matrix_store_dir(): string
{
    $env = getenv('GOPT_MATRIX_STORE_DIR');
    if ($env) {
        return rtrim($env, DIRECTORY_SEPARATOR);
    }

    return dirname(gopt_site_root()) . DIRECTORY_SEPARATOR . 'gopt-matrix-store';
}

function gopt_matrix_store_path(): string
{
    return gopt_matrix_store_dir() . DIRECTORY_SEPARATOR . 'matrices.json';
}

function gopt_matrix_lock_path(): string
{
    return gopt_matrix_store_dir() . DIRECTORY_SEPARATOR . 'matrices.lock';
}

function gopt_ensure_matrix_store_dir(): void
{
    $dir = gopt_matrix_store_dir();
    if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
        throw new GoptHistoryException('Could not create the matrix store directory.', 500);
    }
}

function gopt_with_matrix_lock(bool $exclusive, callable $callback)
{
    gopt_ensure_matrix_store_dir();
    $handle = fopen(gopt_matrix_lock_path(), 'c');
    if (!$handle) {
        throw new GoptHistoryException('Could not open the matrix lock file.', 500);
    }

    $lockType = $exclusive ? LOCK_EX : LOCK_SH;
    if (!flock($handle, $lockType)) {
        fclose($handle);
        throw new GoptHistoryException('Could not lock the matrix store.', 500);
    }

    try {
        return $callback();
    } finally {
        flock($handle, LOCK_UN);
        fclose($handle);
    }
}

function gopt_eastern_today_key(): string
{
    return (new DateTimeImmutable('now', new DateTimeZone('America/New_York')))->format('Y-m-d');
}

function gopt_matrix_date_is_valid(string $dateText): bool
{
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', trim($dateText), $matches)) {
        return false;
    }

    return checkdate(intval($matches[2]), intval($matches[3]), intval($matches[1]));
}

function gopt_matrix_date_is_editable(string $dateText): bool
{
    return gopt_matrix_date_is_valid($dateText) && strcmp($dateText, gopt_eastern_today_key()) > 0;
}

function gopt_status_is_valid(string $status): bool
{
    return in_array($status, GOPT_MATRIX_STATUSES, true);
}

function gopt_normalize_matrix_dates(array $dates): array
{
    $unique = [];
    foreach ($dates as $dateInput) {
        $date = is_array($dateInput)
            ? trim((string)($dateInput['date'] ?? $dateInput['id'] ?? ''))
            : trim((string)$dateInput);
        if ($date === '') {
            continue;
        }
        if (!gopt_matrix_date_is_valid($date)) {
            throw new GoptHistoryException('Matrix dates must use YYYY-MM-DD.', 400);
        }
        $unique[$date] = [
            'id' => $date,
            'date' => $date,
        ];
    }

    if (!count($unique)) {
        throw new GoptHistoryException('Add at least one candidate date.', 400);
    }

    ksort($unique);
    return array_values($unique);
}

function gopt_matrix_date_ids(array $matrix): array
{
    $ids = [];
    foreach (($matrix['dates'] ?? []) as $date) {
        $id = trim((string)($date['id'] ?? $date['date'] ?? ''));
        if ($id !== '') {
            $ids[] = $id;
        }
    }
    return $ids;
}

function gopt_get_delta_locked_date_id(array $matrix): string
{
    $locked = trim((string)($matrix['deltaLockedDateId'] ?? ''));
    if ($locked !== '') {
        return $locked;
    }

    foreach (($matrix['dates'] ?? []) as $date) {
        if (!empty($date['deltaLocked']) || !empty($date['locked'])) {
            return trim((string)($date['id'] ?? $date['date'] ?? ''));
        }
    }

    return '';
}

function gopt_matrix_is_editable(array $matrix): bool
{
    $lockedDateId = gopt_get_delta_locked_date_id($matrix);
    if ($lockedDateId !== '') {
        return gopt_matrix_date_is_editable($lockedDateId);
    }

    foreach (gopt_matrix_date_ids($matrix) as $dateId) {
        if (gopt_matrix_date_is_editable($dateId)) {
            return true;
        }
    }

    return false;
}

function gopt_matrix_date_can_accept_response(array $matrix, string $dateId): bool
{
    return gopt_matrix_is_editable($matrix) && gopt_matrix_date_is_editable($dateId);
}

function gopt_normalize_matrix_responses($responses, array $dateIds): array
{
    if (!is_array($responses)) {
        return [];
    }

    $allowedDates = array_fill_keys($dateIds, true);
    $clean = [];
    foreach ($responses as $player => $dateMap) {
        $playerName = trim((string)$player);
        if ($playerName === '' || !is_array($dateMap)) {
            continue;
        }

        $cleanDateMap = [];
        foreach ($dateMap as $dateId => $status) {
            $dateKey = trim((string)$dateId);
            $statusValue = strtoupper(trim((string)$status));
            if (!isset($allowedDates[$dateKey]) || !gopt_status_is_valid($statusValue) || $statusValue === '') {
                continue;
            }
            $cleanDateMap[$dateKey] = $statusValue;
        }

        if (count($cleanDateMap)) {
            $clean[$playerName] = $cleanDateMap;
        }
    }

    return $clean;
}

function gopt_normalize_matrix(array $matrix): array
{
    $dates = gopt_normalize_matrix_dates(is_array($matrix['dates'] ?? null) ? $matrix['dates'] : []);
    $dateIds = array_map(fn($date) => $date['id'], $dates);
    $lockedDateId = gopt_get_delta_locked_date_id($matrix);
    if ($lockedDateId !== '' && !in_array($lockedDateId, $dateIds, true)) {
        $lockedDateId = '';
    }
    $responses = gopt_normalize_matrix_responses($matrix['responses'] ?? [], $dateIds);

    return [
        'id' => trim((string)($matrix['id'] ?? '')),
        'name' => trim((string)($matrix['name'] ?? 'Untitled Matrix')),
        'createdAt' => trim((string)($matrix['createdAt'] ?? '')),
        'updatedAt' => trim((string)($matrix['updatedAt'] ?? '')),
        'dates' => $dates,
        'deltaLockedDateId' => $lockedDateId,
        'responses' => count($responses) ? $responses : new stdClass(),
    ];
}

function gopt_normalize_matrix_store(array $store): array
{
    $matrices = [];
    foreach (($store['matrices'] ?? []) as $matrix) {
        if (!is_array($matrix)) {
            continue;
        }
        $normalized = gopt_normalize_matrix($matrix);
        if ($normalized['id'] === '') {
            $normalized['id'] = preg_replace('/[:.]/', '-', gmdate('Y-m-d\TH:i:s.u\Z')) . '-' . bin2hex(random_bytes(4));
        }
        if ($normalized['createdAt'] === '') {
            $normalized['createdAt'] = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.u\Z');
        }
        if ($normalized['updatedAt'] === '') {
            $normalized['updatedAt'] = $normalized['createdAt'];
        }
        $matrices[] = $normalized;
    }

    return gopt_sort_matrices(['matrices' => $matrices]);
}

function gopt_matrix_store_from_json(string $text): array
{
    $parsed = json_decode($text ?: '', true);
    if (!is_array($parsed) || !isset($parsed['matrices']) || !is_array($parsed['matrices'])) {
        throw new GoptHistoryException('Matrix history must be JSON with a matrices array.', 400);
    }

    return gopt_normalize_matrix_store($parsed);
}

function gopt_read_matrix_store(): array
{
    $path = gopt_matrix_store_path();
    if (!is_file($path)) {
        return ['matrices' => []];
    }

    $text = file_get_contents($path);
    return gopt_matrix_store_from_json($text ?: '{"matrices":[]}');
}

function gopt_write_matrix_store(array $store): void
{
    gopt_ensure_matrix_store_dir();
    $path = gopt_matrix_store_path();
    $tempPath = $path . '.tmp';
    $text = json_encode(gopt_normalize_matrix_store($store), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";

    if (file_put_contents($tempPath, $text, LOCK_EX) === false) {
        throw new GoptHistoryException('Could not write the matrix store.', 500);
    }
    if (!rename($tempPath, $path)) {
        @unlink($tempPath);
        throw new GoptHistoryException('Could not save the matrix store.', 500);
    }
}

function gopt_find_matrix_index(array $store, string $matrixId): int
{
    foreach ($store['matrices'] as $index => $matrix) {
        if (($matrix['id'] ?? '') === $matrixId) {
            return $index;
        }
    }

    throw new GoptHistoryException('Matrix not found.', 404);
}

function gopt_create_matrix(array $data): array
{
    $name = trim((string)($data['name'] ?? ''));
    if ($name === '') {
        throw new GoptHistoryException('Name the matrix.', 400);
    }
    if (strlen($name) > 120) {
        throw new GoptHistoryException('Matrix names must be 120 characters or fewer.', 400);
    }

    $dates = gopt_normalize_matrix_dates(is_array($data['dates'] ?? null) ? $data['dates'] : []);
    $createdAt = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.u\Z');

    return [
        'id' => preg_replace('/[:.]/', '-', $createdAt) . '-' . bin2hex(random_bytes(4)),
        'name' => $name,
        'createdAt' => $createdAt,
        'updatedAt' => $createdAt,
        'dates' => $dates,
        'deltaLockedDateId' => '',
        'responses' => new stdClass(),
    ];
}

function gopt_update_matrix_response(array $store, array $data): array
{
    $matrixId = trim((string)($data['matrixId'] ?? ''));
    $player = trim((string)($data['player'] ?? ''));
    $responses = $data['responses'] ?? null;

    if ($matrixId === '') {
        throw new GoptHistoryException('Choose a matrix.', 400);
    }
    if ($player === '' || strlen($player) > 80) {
        throw new GoptHistoryException('Choose a player.', 400);
    }
    if (!is_array($responses)) {
        throw new GoptHistoryException('Responses must be a date/status map.', 400);
    }

    $index = gopt_find_matrix_index($store, $matrixId);
    $matrix = gopt_normalize_matrix($store['matrices'][$index]);
    if (!gopt_matrix_is_editable($matrix)) {
        throw new GoptHistoryException('This matrix is no longer editable.', 409);
    }

    $dateIds = array_fill_keys(gopt_matrix_date_ids($matrix), true);
    $cleanResponses = [];
    foreach ($responses as $dateId => $status) {
        $dateKey = (string)$dateId;
        $statusValue = strtoupper(trim((string)$status));
        if (!isset($dateIds[$dateKey])) {
            continue;
        }
        if (!gopt_matrix_date_can_accept_response($matrix, $dateKey)) {
            throw new GoptHistoryException('Past matrix dates cannot be edited.', 409);
        }
        if (!gopt_status_is_valid($statusValue)) {
            throw new GoptHistoryException('Invalid attendance designation.', 400);
        }
        if ($statusValue !== '') {
            $cleanResponses[$dateKey] = $statusValue;
        }
    }

    if (!isset($matrix['responses']) || !is_array($matrix['responses'])) {
        $matrix['responses'] = [];
    }
    if (count($cleanResponses)) {
        $matrix['responses'][$player] = $cleanResponses;
    } else {
        unset($matrix['responses'][$player]);
    }
    $matrix['updatedAt'] = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.u\Z');
    $store['matrices'][$index] = $matrix;

    return $store;
}

function gopt_set_matrix_delta_lock(array $store, array $data): array
{
    $matrixId = trim((string)($data['matrixId'] ?? ''));
    $dateId = trim((string)($data['dateId'] ?? ''));
    if ($matrixId === '') {
        throw new GoptHistoryException('Choose a matrix.', 400);
    }

    $index = gopt_find_matrix_index($store, $matrixId);
    $matrix = gopt_normalize_matrix($store['matrices'][$index]);
    if (!gopt_matrix_is_editable($matrix)) {
        throw new GoptHistoryException('This matrix is no longer editable.', 409);
    }

    if ($dateId !== '') {
        $dateIds = gopt_matrix_date_ids($matrix);
        if (!in_array($dateId, $dateIds, true)) {
            throw new GoptHistoryException('Choose a proposed date in this matrix.', 400);
        }
        if (!gopt_matrix_date_is_editable($dateId)) {
            throw new GoptHistoryException('Past dates cannot be delta-locked.', 409);
        }
    }

    $matrix['deltaLockedDateId'] = $dateId;
    $matrix['updatedAt'] = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.u\Z');
    $store['matrices'][$index] = $matrix;

    return $store;
}

function gopt_delete_matrix(array $store, array $data): array
{
    $matrixId = trim((string)($data['matrixId'] ?? ''));
    if ($matrixId === '') {
        throw new GoptHistoryException('Choose a matrix.', 400);
    }

    $index = gopt_find_matrix_index($store, $matrixId);
    array_splice($store['matrices'], $index, 1);

    return $store;
}

function gopt_sort_matrices(array $store): array
{
    usort($store['matrices'], function ($a, $b) {
        return strcmp((string)($b['createdAt'] ?? ''), (string)($a['createdAt'] ?? ''));
    });
    return $store;
}

function gopt_matrix_projection_weight(string $status): string
{
    switch ($status) {
        case 'IN':
            return '1';
        case 'PROBABLE':
            return '0.75';
        case 'QUESTIONABLE':
            return '0.5';
        case 'DOUBTFUL':
            return '0.25';
        default:
            return '0';
    }
}

function gopt_build_matrix_attendance_summary_rows(array $store): array
{
    $rows = [];
    foreach (gopt_normalize_matrix_store($store)['matrices'] as $matrix) {
        $lockedDateId = gopt_get_delta_locked_date_id($matrix);
        if ($lockedDateId === '') {
            continue;
        }

        foreach (($matrix['responses'] ?? []) as $player => $dateMap) {
            $status = strtoupper(trim((string)($dateMap[$lockedDateId] ?? '')));
            if ($status === '') {
                continue;
            }
            $rows[] = [
                'matrix_id' => $matrix['id'],
                'matrix_name' => $matrix['name'],
                'delta_locked_date' => $lockedDateId,
                'player' => $player,
                'projection' => $status,
                'projection_weight' => gopt_matrix_projection_weight($status),
                'matrix_created_at' => $matrix['createdAt'],
                'matrix_updated_at' => $matrix['updatedAt'],
            ];
        }
    }

    usort($rows, function ($a, $b) {
        $dateCompare = strcmp($a['delta_locked_date'], $b['delta_locked_date']);
        if ($dateCompare !== 0) return $dateCompare;
        $matrixCompare = strcmp($a['matrix_name'], $b['matrix_name']);
        if ($matrixCompare !== 0) return $matrixCompare;
        return strcmp($a['player'], $b['player']);
    });

    return $rows;
}

function gopt_csv_escape_field(string $value): string
{
    if (strpbrk($value, "\",\n\r") === false) {
        return $value;
    }

    return '"' . str_replace('"', '""', $value) . '"';
}

function gopt_build_matrix_attendance_summary_csv(array $store): string
{
    $fields = [
        'matrix_id',
        'matrix_name',
        'delta_locked_date',
        'player',
        'projection',
        'projection_weight',
        'matrix_created_at',
        'matrix_updated_at',
    ];
    $lines = [implode(',', $fields)];

    foreach (gopt_build_matrix_attendance_summary_rows($store) as $row) {
        $lines[] = implode(',', array_map(
            fn($field) => gopt_csv_escape_field((string)($row[$field] ?? '')),
            $fields
        ));
    }

    return implode("\n", $lines) . "\n";
}
