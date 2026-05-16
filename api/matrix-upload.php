<?php

require __DIR__ . '/matrix-lib.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'POST') {
    gopt_method_not_allowed(['POST']);
    exit;
}

try {
    $username = trim((string)($_POST['username'] ?? ''));
    $password = (string)($_POST['password'] ?? '');

    if (!gopt_authenticate($username, $password)) {
        gopt_send_json(401, ['status' => 'error', 'message' => 'Invalid username or password.']);
        exit;
    }

    $upload = $_FILES['matrixFile'] ?? null;
    if (!$upload || !is_array($upload) || intval($upload['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        gopt_send_json(400, ['status' => 'error', 'message' => 'Choose a matrix history JSON file to upload.']);
        exit;
    }

    if (intval($upload['size'] ?? 0) > GOPT_MAX_UPLOAD_BYTES) {
        gopt_send_json(413, ['status' => 'error', 'message' => 'Upload too large.']);
        exit;
    }

    $fileText = file_get_contents((string)$upload['tmp_name']);
    if ($fileText === false || trim($fileText) === '') {
        gopt_send_json(400, ['status' => 'error', 'message' => 'Choose a matrix history JSON file to upload.']);
        exit;
    }

    $store = gopt_matrix_store_from_json($fileText);
    gopt_with_matrix_lock(true, function () use ($store) {
        gopt_write_matrix_store($store);
    });

    gopt_send_json(200, [
        'status' => 'success',
        'matrices' => count($store['matrices']),
    ]);
} catch (Throwable $error) {
    gopt_send_json(gopt_exception_status($error), [
        'status' => 'error',
        'message' => $error->getMessage() ?: 'Matrix history upload failed.',
    ]);
}
