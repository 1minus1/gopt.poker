<?php

require __DIR__ . '/matrix-lib.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'GET' && $method !== 'HEAD') {
    gopt_method_not_allowed(['GET', 'HEAD']);
    exit;
}

try {
    $store = gopt_with_matrix_lock(false, fn() => gopt_sort_matrices(gopt_read_matrix_store()));
    $json = json_encode($store, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
    $filename = 'gopt-matrix-history-' . gmdate('Y-m-d') . '.json';

    header('Cache-Control: no-store');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Content-Type: application/json; charset=utf-8');
    header('Content-Length: ' . strlen($json));

    if ($method !== 'HEAD') {
        echo $json;
    }
} catch (Throwable $error) {
    http_response_code(gopt_exception_status($error));
    header('Content-Type: text/plain; charset=utf-8');
    echo $error->getMessage() ?: 'Could not export matrix history.';
}
