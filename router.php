<?php

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

$routes = [
    '/api/history/current' => '/api/history-current.php',
    '/api/history/versions' => '/api/history-versions.php',
    '/api/history/versions.zip' => '/api/history-versions-zip.php',
    '/api/history/revert' => '/api/history-revert.php',
    '/api/history/delete' => '/api/history-delete.php',
    '/api/matrix' => '/api/matrix.php',
    '/api/matrix/export' => '/api/matrix-export.php',
    '/api/matrix/attendance-summary' => '/api/matrix-attendance-summary.php',
    '/upload-matrix-history' => '/api/matrix-upload.php',
    '/upload-history' => '/api/history-upload.php',
];

if (isset($routes[$path])) {
    require __DIR__ . $routes[$path];
    return true;
}

return false;
