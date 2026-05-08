<?php

require __DIR__ . '/history-lib.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'POST') {
    gopt_method_not_allowed(['POST']);
    exit;
}

try {
    $data = gopt_read_json_body();
    $username = trim((string)($data['username'] ?? ''));
    $password = (string)($data['password'] ?? '');
    $versionId = (string)($data['versionId'] ?? '');

    if (!gopt_authenticate($username, $password)) {
        gopt_send_json(401, ['status' => 'error', 'message' => 'Invalid username or password.']);
        exit;
    }

    if ($versionId === '') {
        gopt_send_json(400, ['status' => 'error', 'message' => 'Choose a data version to restore.']);
        exit;
    }

    $result = gopt_with_history_lock(true, fn() => gopt_revert_history_version($versionId));
    gopt_send_json(200, [
        'status' => 'success',
        'currentId' => $result['metadata']['id'],
        'versionNumber' => (string)$result['metadata']['versionNumber'],
        'createdAt' => $result['metadata']['createdAt'],
        'label' => $result['metadata']['label'],
    ]);
} catch (Throwable $error) {
    gopt_send_json(gopt_exception_status($error), [
        'status' => 'error',
        'message' => $error->getMessage() ?: 'Revert failed.',
    ]);
}
