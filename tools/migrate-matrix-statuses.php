<?php
// CLI only: install maintenance tools outside the public site on the server.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once (getenv('GOPT_SITE_ROOT') ?: dirname(__DIR__)) . '/api/matrix-lib.php';

function gopt_migrate_matrix_statuses(bool $apply): array
{
    return gopt_with_matrix_lock(true, function () use ($apply) {
        $path = gopt_matrix_store_path();
        if (!is_file($path)) throw new RuntimeException('Matrix store does not exist.');
        $original = file_get_contents($path);
        $store = json_decode($original, false, 512, JSON_THROW_ON_ERROR);
        if (!is_object($store) || !is_array($store->matrices ?? null)) {
            throw new RuntimeException('Expected a matrices array.');
        }
        $count = 0;
        $matrixCount = 0;
        foreach ($store->matrices as $matrix) {
            $changed = false;
            if (!is_object($matrix) || !is_object($matrix->responses ?? null)) continue;
            foreach ($matrix->responses as $dateMap) {
                if (!is_object($dateMap)) continue;
                foreach ($dateMap as $dateId => $status) {
                    if (is_string($status) && strtoupper(trim($status)) === 'IN') {
                        $dateMap->{$dateId} = 'PROBABLE';
                        $count++;
                        $changed = true;
                    }
                }
            }
            if ($changed) $matrixCount++;
        }
        $result = ['apply' => $apply, 'responsesChanged' => $count, 'matricesChanged' => $matrixCount, 'backup' => null];
        if (!$apply || !$count) return $result;
        // Encode before making any changes. Preserve empty objects, all fields and timestamps.
        $text = json_encode($store, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) . "\n";
        $backup = $path . '.before-probable-' . gmdate('Ymd\THis\Z') . '-' . bin2hex(random_bytes(4)) . '.bak';
        $handle = fopen($backup, 'x');
        if (!$handle) throw new RuntimeException('Cannot create private backup.');
        try {
            if (!chmod($backup, 0600) || fwrite($handle, $original) !== strlen($original) || !fflush($handle)) {
                throw new RuntimeException('Cannot save complete backup.');
            }
        } finally { fclose($handle); }
        $temp = tempnam(dirname($path), '.probable-');
        if ($temp === false) throw new RuntimeException('Cannot create migration file.');
        try {
            if (file_put_contents($temp, $text) !== strlen($text) || !chmod($temp, fileperms($path) & 0777) || !rename($temp, $path)) {
                throw new RuntimeException('Cannot replace matrix store.');
            }
        } finally { if (is_file($temp)) unlink($temp); }
        $result['backup'] = $backup;
        return $result;
    });
}

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    try {
        echo json_encode(gopt_migrate_matrix_statuses(in_array('--apply', $argv, true)), JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR) . "\n";
    } catch (Throwable $error) {
        fwrite(STDERR, $error->getMessage() . "\n");
        exit(1);
    }
}
