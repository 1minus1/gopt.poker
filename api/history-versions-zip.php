<?php

require __DIR__ . '/history-lib.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'GET' && $method !== 'HEAD') {
    gopt_method_not_allowed(['GET', 'HEAD']);
    exit;
}

try {
    $zip = gopt_with_history_lock(true, fn() => gopt_build_history_versions_zip());
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
