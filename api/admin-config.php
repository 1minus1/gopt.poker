<?php

// Credentials belong outside Git and, on production, outside the web root.
$siteRoot = dirname(__DIR__);
$privatePath = getenv('GOPT_ADMIN_CONFIG_FILE');
if (!$privatePath) {
    $privatePath = dirname($siteRoot) . '/gopt-admin-config.php';
    if (!is_file($privatePath)) {
        $privatePath = $siteRoot . '/.admin.local.php';
    }
}
$privateConfig = is_file($privatePath) ? require $privatePath : [];
$privateAdmins = is_array($privateConfig) ? ($privateConfig['admins'] ?? [$privateConfig]) : [];
$admins = [];
foreach (['GOPT_ADMIN', 'GOPT_SECONDARY_ADMIN'] as $index => $prefix) {
    $fallback = $privateAdmins[$index] ?? [];
    $username = getenv($prefix . '_USERNAME') ?: ($fallback['username'] ?? '');
    $passwordHash = getenv($prefix . '_PASSWORD_HASH') ?: ($fallback['password_hash'] ?? '');
    if (is_string($username) && is_string($passwordHash) && $username !== '' && $passwordHash !== '') {
        $admins[] = ['username' => $username, 'password_hash' => $passwordHash];
    }
}

// An unconfigured installation has no valid admin login.
return [
    'username' => $admins[0]['username'] ?? '',
    'password_hash' => $admins[0]['password_hash'] ?? '',
    'admins' => $admins,
];
