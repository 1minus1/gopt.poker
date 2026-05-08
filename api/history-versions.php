<?php

require __DIR__ . '/history-lib.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'GET') {
    gopt_method_not_allowed(['GET']);
    exit;
}

try {
    $payload = gopt_with_history_lock(true, function () {
        $index = gopt_ensure_history_store();
        return [
            'currentId' => $index['currentId'],
            'versions' => gopt_version_list($index),
        ];
    });

    gopt_send_json(200, $payload);
} catch (Throwable $error) {
    gopt_send_json(gopt_exception_status($error), [
        'status' => 'error',
        'message' => $error->getMessage() ?: 'Could not list data versions.',
    ]);
}
