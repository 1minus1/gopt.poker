<?php

require __DIR__ . '/history-lib.php';
require __DIR__ . '/matrix-lib.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'GET' && $method !== 'HEAD') {
    gopt_method_not_allowed(['GET', 'HEAD']);
    exit;
}

try {
    $matrixSummary = gopt_with_matrix_lock(false, fn() => gopt_build_matrix_attendance_summary_csv(gopt_read_matrix_store()));
    $zip = gopt_with_history_lock(true, fn() => gopt_build_history_versions_zip([
        [
            'name' => 'matrix-attendance-summary.csv',
            'data' => $matrixSummary,
            'createdAt' => gmdate('c'),
        ],
    ]));
    $filename = 'gopt-data-versions-' . gmdate('Y-m-d') . '.zip';

    header('Cache-Control: no-store');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Content-Type: application/zip');
    header('Content-Length: ' . strlen($zip));

    if ($method !== 'HEAD') {
        echo $zip;
    }
} catch (Throwable $error) {
    http_response_code(gopt_exception_status($error));
    header('Content-Type: text/plain; charset=utf-8');
    echo $error->getMessage() ?: 'Could not build data archive.';
}
