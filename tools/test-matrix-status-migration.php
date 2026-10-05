<?php
$dir = sys_get_temp_dir() . '/gopt-status-test-' . bin2hex(random_bytes(6));
mkdir($dir, 0700);
putenv('GOPT_MATRIX_STORE_DIR=' . $dir);
putenv('GOPT_HISTORY_STORE_DIR=' . $dir . '/history');
require __DIR__ . '/migrate-matrix-statuses.php';
function check($condition, $message) { if (!$condition) throw new RuntimeException($message); }
try {
    $fixture = (object)['extra' => 'keep', 'matrices' => [(object)[
        'id' => 'closed', 'name' => 'Keep name', 'createdAt' => 'original', 'updatedAt' => 'original',
        'dates' => [(object)['id' => '2000-01-01', 'date' => '2000-01-01']], 'deltaLockedDateId' => '2000-01-01',
        'extra' => 'keep', 'responses' => (object)['a' => (object)['2000-01-01' => ' in '],
        'b' => (object)['2000-01-01' => 'PROBABLE'], 'c' => (object)['2000-01-01' => 'QUESTIONABLE'],
        'd' => (object)['2000-01-01' => 'DOUBTFUL'], 'e' => (object)['2000-01-01' => 'OUT'],
        'empty' => (object)['2000-01-01' => ''], 'blank' => new stdClass()],
    ]]];
    $original = json_encode($fixture);
    file_put_contents(gopt_matrix_store_path(), $original);
    $dry = gopt_migrate_matrix_statuses(false);
    check($dry['responsesChanged'] === 1 && file_get_contents(gopt_matrix_store_path()) === $original, 'Dry run changed store');
    $result = gopt_migrate_matrix_statuses(true);
    check(file_get_contents($result['backup']) === $original, 'Backup mismatch');
    check((fileperms($result['backup']) & 0777) === 0600, 'Backup must be private');
    $fixture->matrices[0]->responses->a->{'2000-01-01'} = 'PROBABLE';
    check(json_decode(file_get_contents(gopt_matrix_store_path())) == $fixture, 'Migration changed unrelated fields');
    $after = file_get_contents(gopt_matrix_store_path());
    check(gopt_migrate_matrix_statuses(true)['responsesChanged'] === 0, 'Migration not idempotent');
    check(file_get_contents(gopt_matrix_store_path()) === $after, 'Second run rewrote store');
    $fixture->matrices[0]->responses->a->{'2000-01-01'} = 'IN';
    $import = gopt_matrix_store_from_json(json_encode($fixture));
    check($import['matrices'][0]['responses']['a']['2000-01-01'] === 'PROBABLE', 'Import alias failed');
    $rows = gopt_build_matrix_attendance_summary_rows($import);
    check(count($rows) === 5, 'Summary lost responses');
    check(gopt_matrix_projection_weight('IN') === '1' && gopt_matrix_projection_weight('PROBABLE') === '1', 'Weights mismatch');
    $editable = ['matrices' => [['id' => 'future', 'name' => 'test', 'dates' => [['id' => '2099-01-01', 'date' => '2099-01-01']], 'responses' => []]]];
    $data = ['matrixId' => 'future', 'player' => 'test', 'responses' => ['2099-01-01' => ' in ']];
    $updated = gopt_update_matrix_response($editable, $data);
    check($updated['matrices'][0]['responses']['test']['2099-01-01'] === 'PROBABLE', 'Stale client alias failed');
    $data['responses']['2099-01-01'] = 'UNKNOWN';
    try { gopt_update_matrix_response($editable, $data); throw new RuntimeException('Invalid status accepted'); }
    catch (GoptHistoryException $expected) { check($expected->getCode() !== 0 || str_contains($expected->getMessage(), 'Invalid'), 'Wrong rejection'); }
    // A concurrent writer holds the same lock, then commits an update before migration reads.
    file_put_contents(gopt_matrix_store_path(), $original);
    $child = $dir . '/writer.php';
    file_put_contents($child, '<?php require ' . var_export(realpath(__DIR__ . '/../api/matrix-lib.php'), true) . '; gopt_with_matrix_lock(true, function () { file_put_contents(' . var_export($dir . '/ready', true) . ', "ready"); usleep(300000); $s=json_decode(file_get_contents(gopt_matrix_store_path())); $s->concurrent="preserved"; file_put_contents(gopt_matrix_store_path(),json_encode($s)); });');
    $proc = proc_open([PHP_BINARY, $child], [], $pipes);
    $deadline = microtime(true) + 5;
    while (!is_file($dir . '/ready') && microtime(true) < $deadline) usleep(10000);
    check(is_file($dir . '/ready'), 'Writer did not acquire lock');
    gopt_migrate_matrix_statuses(true);
    check(proc_close($proc) === 0, 'Writer failed');
    $final = json_decode(file_get_contents(gopt_matrix_store_path()));
    check($final->concurrent === 'preserved' && $final->matrices[0]->responses->a->{'2000-01-01'} === 'PROBABLE', 'Concurrent update lost');
    echo "Matrix migration checks passed.\n";
} finally {
    $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
    foreach ($files as $file) { if ($file->isDir()) rmdir($file->getPathname()); else unlink($file->getPathname()); }
    rmdir($dir);
}
