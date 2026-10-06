<?php

require __DIR__ . '/matrix-lib.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

try {
    if ($method === 'GET') {
        $store = gopt_with_matrix_lock(false, fn() => gopt_sort_matrices(gopt_read_matrix_store()));
        gopt_send_json(200, ['status' => 'success'] + $store);
        exit;
    }

    if ($method !== 'POST') {
        gopt_method_not_allowed(['GET', 'POST']);
        exit;
    }

    $data = gopt_read_json_body();
    $action = (string)($data['action'] ?? '');

    $store = gopt_with_matrix_lock(true, function () use ($action, $data) {
        $store = gopt_read_matrix_store();

        if ($action === 'create') {
            array_unshift($store['matrices'], gopt_create_matrix($data));
        } elseif ($action === 'update_response') {
            $store = gopt_update_matrix_response($store, $data);
        } elseif ($action === 'update_visibility') {
            $store = gopt_update_matrix_visibility($store, $data);
        } elseif ($action === 'set_delta_lock') {
            $store = gopt_set_matrix_delta_lock($store, $data);
        } elseif ($action === 'delete') {
            $store = gopt_delete_matrix($store, $data);
        } else {
            throw new GoptHistoryException('Unsupported matrix action.', 400);
        }

        $store = gopt_sort_matrices($store);
        gopt_write_matrix_store($store);
        return $store;
    });

    gopt_send_json(200, ['status' => 'success'] + $store);
} catch (Throwable $error) {
    gopt_send_json(gopt_exception_status($error), [
        'status' => 'error',
        'message' => $error->getMessage() ?: 'Matrix request failed.',
    ]);
}
