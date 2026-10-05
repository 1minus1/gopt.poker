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
        'dates': [{'id': '2099-01-01', 'date': '2099-01-01'}],
        'responses': {'legacy': {'2099-01-01': 'IN'}}}]}
    (store / 'matrices.json').write_text(json.dumps(fixture))
    env = dict(os.environ, GOPT_MATRIX_STORE_DIR=str(store), GOPT_HISTORY_STORE_DIR=temp + '/history')
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    server = subprocess.Popen([shutil.which('php'), '-S', f'127.0.0.1:{port}', '-t', str(root)], env=env,
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    def request(data=None):
        req = Request(f'http://127.0.0.1:{port}/api/matrix.php',
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
        print('Matrix HTTP API checks passed.')
    finally:
        server.terminate()
        server.wait(timeout=5)
