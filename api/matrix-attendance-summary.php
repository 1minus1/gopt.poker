<?php

require __DIR__ . '/matrix-lib.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'GET' && $method !== 'HEAD') {
    gopt_method_not_allowed(['GET', 'HEAD']);
    exit;
}

try {
    $csv = gopt_with_matrix_lock(false, fn() => gopt_build_matrix_attendance_summary_csv(gopt_read_matrix_store()));
    $filename = 'gopt-matrix-attendance-summary-' . gmdate('Y-m-d') . '.csv';

    header('Cache-Control: no-store');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Length: ' . strlen($csv));

    if ($method !== 'HEAD') {
        echo $csv;
    }
} catch (Throwable $error) {
    http_response_code(gopt_exception_status($error));
    header('Content-Type: text/plain; charset=utf-8');
    echo $error->getMessage() ?: 'Could not export attendance summary.';
}
