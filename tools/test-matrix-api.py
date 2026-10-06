#!/usr/bin/env python3
"""Exercise Matrix HTTP reads and stale-client writes against an isolated store."""
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen

root = Path(__file__).resolve().parent.parent
with tempfile.TemporaryDirectory(prefix='gopt-matrix-api-') as temp:
    store = Path(temp) / 'matrix'
    store.mkdir()
    fixture = {'matrices': [{'id': 'fixture', 'name': 'Fixture', 'createdAt': '2026-01-01T00:00:00Z',
        'updatedAt': '2026-01-01T00:00:00Z', 'deltaLockedDateId': '',
        'dates': [{'id': date, 'date': date} for date in ['2000-01-01', '2099-01-01', '2099-01-02']],
        'responses': {'legacy': {'2099-01-01': 'IN', '2000-01-01': 'OUT', '2099-01-02': 'QUESTIONABLE'}}}]}
    (store / 'matrices.json').write_text(json.dumps(fixture))
    env = dict(os.environ, GOPT_MATRIX_STORE_DIR=str(store), GOPT_HISTORY_STORE_DIR=temp + '/history')
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    server = subprocess.Popen([shutil.which('php'), '-S', f'127.0.0.1:{port}', '-t', str(root)], env=env,
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    def request(data=None, endpoint='api/matrix.php'):
        req = Request(f'http://127.0.0.1:{port}/{endpoint}',
                      data=json.dumps(data).encode() if data else None,
                      headers={'Content-Type': 'application/json'})
        try:
            with urlopen(req, timeout=3) as response:
                return response.status, json.load(response)
        except HTTPError as error:
            return error.code, json.load(error)
    try:
        for _ in range(50):
            try:
                status, response = request()
                break
            except OSError:
                time.sleep(.05)
        else:
            raise AssertionError('Isolated PHP server did not start')
        assert status == 200
        assert response['matrices'][0]['responses']['legacy']['2099-01-01'] == 'PROBABLE'
        data = {'action': 'update_response', 'matrixId': 'fixture', 'player': 'stale', 'responses': {'2099-01-01': ' in '}}
        status, response = request(data)
        assert status == 200
        assert response['matrices'][0]['responses']['stale']['2099-01-01'] == 'PROBABLE'
        persisted = (store / 'matrices.json').read_text()
        assert '"IN"' not in persisted
        data['responses']['2099-01-01'] = 'UNKNOWN'
        status, response = request(data)
        assert status == 400
        assert (store / 'matrices.json').read_text() == persisted
        lock = dict(action='set_delta_lock', matrixId='fixture', dateId='2099-01-01')
        assert request(lock)[0] == 200
        lock['dateId'] = '2099-01-02'
        assert request(lock)[0] == 409
        assert request()[1]['matrices'][0]['deltaLockedDateId'] == '2099-01-01'
        lock['dateId'] = ''
        assert request(lock)[0] == 200
        lock['dateId'] = '2099-01-02'
        assert request(lock)[0] == 200
        before = request()[1]['matrices'][0]
        def visibility(operation, **values):
            return request(dict(action='update_visibility', matrixId='fixture', operation=operation, **values))
        assert visibility('hide_date', dateId='2000-01-01')[0] == 200
        assert visibility('hide_date', dateId='2099-01-02')[0] == 200
        assert visibility('hide_date', dateId='2099-01-01')[0] == 409
        assert visibility('hide_date', dateId='missing')[0] == 400
        assert visibility('hide_player', player='legacy')[0] == 200
        # A separate HTTP read (another visitor) sees the persisted view.
        hidden = request()[1]['matrices'][0]
        assert hidden['hiddenDateIds'] == ['2000-01-01', '2099-01-02']
        assert hidden['hiddenPlayers'] == ['legacy']
        assert {k: v for k, v in hidden.items() if k not in ['hiddenDateIds', 'hiddenPlayers']} == {
            k: v for k, v in before.items() if k not in ['hiddenDateIds', 'hiddenPlayers']}
        exported = request(endpoint='api/matrix-export.php')[1]['matrices'][0]
        assert exported == hidden
        # Partial availability changes preserve hidden and past dates. Explicit empty clears just that date.
        patch = dict(action='update_response', matrixId='fixture', player='legacy', responses={'2099-01-01': 'DOUBTFUL'})
        status, response = request(patch)
        assert status == 200
        row = response['matrices'][0]['responses']['legacy']
        assert row == {'2000-01-01': 'OUT', '2099-01-01': 'DOUBTFUL', '2099-01-02': 'QUESTIONABLE'}
        patch['responses'] = {'2099-01-01': ''}
        assert request(patch)[1]['matrices'][0]['responses']['legacy'] == {'2000-01-01': 'OUT', '2099-01-02': 'QUESTIONABLE'}
        assert visibility('unhide_dates')[0] == 200
        assert visibility('unhide_players')[0] == 200
        restored = request()[1]['matrices'][0]
        assert restored['hiddenDateIds'] == restored['hiddenPlayers'] == []
        # Concurrent visibility patches are merged under the existing exclusive lock.
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda player: visibility('hide_player', player=player), ['one', 'two']))
        assert all(result[0] == 200 for result in results)
        assert set(request()[1]['matrices'][0]['hiddenPlayers']) == {'one', 'two'}
        print('Matrix HTTP API and shared visibility checks passed.')
    finally:
        server.terminate()
        server.wait(timeout=5)
