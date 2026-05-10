<?php

require __DIR__ . '/history-lib.php';

const GOPT_MATRIX_STATUSES = ['', 'OUT', 'DOUBTFUL', 'QUESTIONABLE', 'PROBABLE'];

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

function gopt_read_matrix_store(): array
{
    $path = gopt_matrix_store_path();
    if (!is_file($path)) {
        return ['matrices' => []];
    }

    $text = file_get_contents($path);
    $parsed = json_decode($text ?: '', true);
    if (!is_array($parsed) || !isset($parsed['matrices']) || !is_array($parsed['matrices'])) {
        throw new GoptHistoryException('The matrix store is invalid.', 500);
    }

    return ['matrices' => $parsed['matrices']];
}

function gopt_write_matrix_store(array $store): void
{
    gopt_ensure_matrix_store_dir();
    $path = gopt_matrix_store_path();
    $tempPath = $path . '.tmp';
    $text = json_encode($store, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";

    if (file_put_contents($tempPath, $text, LOCK_EX) === false) {
        throw new GoptHistoryException('Could not write the matrix store.', 500);
    }
    if (!rename($tempPath, $path)) {
        @unlink($tempPath);
        throw new GoptHistoryException('Could not save the matrix store.', 500);
    }
}

function gopt_matrix_date_is_valid(string $dateText): bool
{
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', trim($dateText), $matches)) {
        return false;
    }

    return checkdate(intval($matches[2]), intval($matches[3]), intval($matches[1]));
}

function gopt_normalize_matrix_dates(array $dates): array
{
    $unique = [];
    foreach ($dates as $dateText) {
        $date = trim((string)$dateText);
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
        'responses' => new stdClass(),
    ];
}

function gopt_status_is_valid(string $status): bool
{
    return in_array($status, GOPT_MATRIX_STATUSES, true);
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
    $matrix = $store['matrices'][$index];
    $dateIds = [];
    foreach (($matrix['dates'] ?? []) as $date) {
        $dateIds[(string)($date['id'] ?? '')] = true;
    }

    $cleanResponses = [];
    foreach ($responses as $dateId => $status) {
        $dateKey = (string)$dateId;
        $statusValue = strtoupper(trim((string)$status));
        if (!isset($dateIds[$dateKey])) {
            continue;
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

function gopt_sort_matrices(array $store): array
{
    usort($store['matrices'], function ($a, $b) {
        return strcmp((string)($b['createdAt'] ?? ''), (string)($a['createdAt'] ?? ''));
    });
    return $store;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

try {
    if ($method === 'GET') {
        $store = gopt_with_matrix_lock(false, fn() => gopt_sort_matrices(gopt_read_matrix_store()));
        gopt_send_json(200, ['status' => 'success'] + $store);
        exit;
    }

    if ($method !== 'POST') {
        gopt_method_not_allowed(['GET', 'POST']);
        exit;
    }

    $data = gopt_read_json_body();
    $action = (string)($data['action'] ?? '');

    $store = gopt_with_matrix_lock(true, function () use ($action, $data) {
        $store = gopt_read_matrix_store();

        if ($action === 'create') {
            array_unshift($store['matrices'], gopt_create_matrix($data));
        } elseif ($action === 'update_response') {
            $store = gopt_update_matrix_response($store, $data);
        } else {
            throw new GoptHistoryException('Unsupported matrix action.', 400);
        }

        $store = gopt_sort_matrices($store);
        gopt_write_matrix_store($store);
        return $store;
    });

    gopt_send_json(200, ['status' => 'success'] + $store);
} catch (Throwable $error) {
    gopt_send_json(gopt_exception_status($error), [
        'status' => 'error',
        'message' => $error->getMessage() ?: 'Matrix request failed.',
    ]);
}
