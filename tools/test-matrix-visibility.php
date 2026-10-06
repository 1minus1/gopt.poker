<?php
$dir = sys_get_temp_dir() . '/gopt-visibility-' . bin2hex(random_bytes(6));
mkdir($dir,0700);
putenv('GOPT_HISTORY_STORE_DIR=' . $dir);
require __DIR__ . '/../api/matrix-lib.php';
function expect($condition, $message) { if (!$condition) throw new RuntimeException($message); }
try {
    $store = ['matrices' => [[
        'id' => 'closed', 'name' => 'Closed fixture', 'createdAt' => '2020-01-01T00:00:00Z', 'updatedAt' => '2020-01-01T00:00:00Z',
        'dates' => array_map(fn($date) => ['id'=>$date,'date'=>$date], ['2000-01-01','2000-01-02','2000-01-03']),
        'deltaLockedDateId' => '2000-01-01', 'responses' => ['player'=>['2000-01-01'=>'PROBABLE']],
    ]]];
    $canonical = gopt_normalize_matrix_store($store);
    expect($canonical['matrices'][0]['hiddenDateIds'] === [] && $canonical['matrices'][0]['hiddenPlayers'] === [], 'Old backups default to visible');
    $summary = gopt_build_matrix_attendance_summary_csv($canonical);
    $hidden = gopt_update_matrix_visibility($canonical,['matrixId'=>'closed','operation'=>'hide_date','dateId'=>'2000-01-01']);
    $hidden = gopt_update_matrix_visibility($hidden,['matrixId'=>'closed','operation'=>'hide_player','player'=>'player']);
    expect(gopt_build_matrix_attendance_summary_csv($hidden) === $summary, 'Hiding changed attendance export');
    foreach(['responses','dates','createdAt','updatedAt','deltaLockedDateId'] as $field) {
        expect($hidden['matrices'][0][$field] === $canonical['matrices'][0][$field], 'Changed '.$field);
    }
    expect(gopt_matrix_store_from_json(json_encode($hidden)) === $hidden, 'Backup import lost visibility');
    $two = $canonical;
    array_pop($two['matrices'][0]['dates']);
    try { gopt_update_matrix_visibility($two,['matrixId'=>'closed','operation'=>'hide_date','dateId'=>'2000-01-01']); throw new RuntimeException('Two-date hiding allowed'); }
    catch(GoptHistoryException $expected) {}
    $future = $canonical;
    $future['matrices'][0]['dates'] = array_map(fn($date) => ['id'=>$date,'date'=>$date], ['2099-01-01','2099-01-02','2099-01-03']);
    $future['matrices'][0]['deltaLockedDateId'] = '2099-01-01';
    try { gopt_set_matrix_delta_lock($future,['matrixId'=>'closed','dateId'=>'2099-01-02']); throw new RuntimeException('Switched lock without unlocking'); }
    catch(GoptHistoryException $expected) { expect(str_contains($expected->getMessage(),'Unlock'), 'Wrong lock error'); }
    $unlocked = gopt_set_matrix_delta_lock($future,['matrixId'=>'closed','dateId'=>'']);
    $relocked = gopt_set_matrix_delta_lock($unlocked,['matrixId'=>'closed','dateId'=>'2099-01-02']);
    expect($relocked['matrices'][0]['deltaLockedDateId'] === '2099-01-02', 'Could not relock after unlocking');
    echo "Matrix visibility, closed/locked preservation and backup checks passed.\n";
} finally {
    $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
    foreach ($files as $file) { if ($file->isDir()) rmdir($file->getPathname()); else unlink($file->getPathname()); }
    rmdir($dir);
}
