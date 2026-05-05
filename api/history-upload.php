<?php

require __DIR__ . '/history-lib.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'POST') {
    gopt_method_not_allowed(['POST']);
    exit;
}

try {
    $username = trim((string)($_POST['username'] ?? ''));
    $password = (string)($_POST['password'] ?? '');

    if (!gopt_authenticate($username, $password)) {
        gopt_send_upload_result(['status' => 'error', 'message' => 'Invalid username or password.'], 401);
        exit;
    }

    $upload = $_FILES['historyFile'] ?? null;
    if (!$upload || !is_array($upload) || intval($upload['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        gopt_send_upload_result(['status' => 'error', 'message' => 'Choose a history text file to upload.'], 400);
        exit;
    }

    if (intval($upload['size'] ?? 0) > GOPT_MAX_UPLOAD_BYTES) {
        gopt_send_upload_result(['status' => 'error', 'message' => 'Upload too large.'], 413);
        exit;
    }

    $fileText = file_get_contents((string)$upload['tmp_name']);
    if ($fileText === false || $fileText === '') {
        gopt_send_upload_result(['status' => 'error', 'message' => 'Choose a history text file to upload.'], 400);
        exit;
    }

    $result = gopt_with_history_lock(true, function () use ($fileText, $upload) {
        $filename = basename((string)($upload['name'] ?? ''));
        return gopt_save_history_upload($fileText, [
            'label' => $_POST['label'] ?? ($filename ? 'Uploaded ' . $filename : 'Uploaded history file'),
            'source' => $_POST['source'] ?? 'upload',
        ]);
    });

    gopt_send_upload_result([
        'status' => 'success',
        'rows' => (string)$result['rowCount'],
        'versionId' => $result['metadata']['id'],
        'versionNumber' => (string)$result['metadata']['versionNumber'],
        'createdAt' => $result['metadata']['createdAt'],
        'label' => $result['metadata']['label'],
    ]);
} catch (Throwable $error) {
    gopt_send_upload_result([
        'status' => 'error',
        'message' => $error->getMessage() ?: 'Upload failed.',
    ], gopt_exception_status($error));
}
