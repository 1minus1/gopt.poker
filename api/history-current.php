<?php

require __DIR__ . '/history-lib.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'GET' && $method !== 'HEAD') {
    gopt_method_not_allowed(['GET', 'HEAD']);
    exit;
}

try {
    $current = gopt_with_history_lock(true, fn() => gopt_get_current_history());
    $text = $current['text'];
    $metadata = $current['metadata'];

    header('Cache-Control: no-store');
    $contentType = ($metadata['format'] ?? 'legacy') === 'v2' ? 'text/csv' : 'text/plain';
    header('Content-Type: ' . $contentType . '; charset=utf-8');
    header('Content-Length: ' . strlen($text));
    header('X-GOPT-History-Version: ' . $metadata['versionNumber']);
    header('X-GOPT-History-Version-Id: ' . $metadata['id']);
    header('X-GOPT-History-Format: ' . ($metadata['format'] ?? 'legacy'));

    if ($method !== 'HEAD') {
        echo $text;
    }
} catch (Throwable $error) {
    http_response_code(gopt_exception_status($error));
    header('Content-Type: text/plain; charset=utf-8');
    echo $error->getMessage() ?: 'Could not load current data.';
}
