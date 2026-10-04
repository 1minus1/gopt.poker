#!/usr/bin/env python3
"""Preview or deploy the canonical site with macOS/OpenSSH and rsync."""
import argparse
import datetime
import json
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
PAGES = ('index.html', 'record.html', 'matrix.html', 'upload.html', 'rules.html',
         'technote.html', 'data.html', '.htaccess', 'VERSION')
SKIP = {'.DS_Store', '.git', '.history-store', '.history-backups', 'nightsummaries'}


def manifest():
    paths = [ROOT / name for name in PAGES]
    paths += sorted(ROOT.glob('*.js')) + sorted(ROOT.glob('*.css'))
    paths += [ROOT / 'data/GOPTdatav2.csv']
    for folder in ('api', 'assets', 'files'):
        for path in sorted((ROOT / folder).rglob('*')):
            relative = path.relative_to(ROOT)
            if any(part in SKIP or part.startswith('.') and part != '.htaccess'
                   for part in relative.parts):
                continue
            if path.name.endswith(('.bkp', '.xlsx', '.xls', '.lock')):
                continue
            if path.is_symlink():
                raise ValueError(f'Symlinks are not deployable: {relative}')
            if path.is_file():
                paths.append(path)
    for path in paths:
        if not path.is_file() or path.is_symlink():
            raise ValueError(f'Missing file or symlink: {path.relative_to(ROOT)}')
    return paths


def configuration(path):
    config = json.loads(path.read_text())
    host, user, directory = (config[key] for key in ('host', 'user', 'remote_dir'))
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9.-]*', host):
        raise ValueError('Invalid host')
    if not re.fullmatch(r'[A-Za-z0-9_][A-Za-z0-9_-]*', user) or user == 'YOUR_USERNAME':
        raise ValueError('Set your DreamHost username in the local configuration')
    # A specific absolute domain directory prevents accidental uploads to HOME.
    if not re.fullmatch(r'/home/[A-Za-z0-9_-]+/gopt\.poker/?', directory):
        raise ValueError('remote_dir must be /home/USERNAME/gopt.poker/')
    if directory.split('/')[2] != user:
        raise ValueError('remote_dir must belong to the configured user')
    port = config.get('port', 22)
    if type(port) is not int or not 1 <= port <= 65535:
        raise ValueError('Invalid SSH port')
    ssh = ['ssh', '-p', str(port), '-o', 'BatchMode=yes',
           '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=15']
    if config.get('identity_file'):
        ssh += ['-i', str(Path(config['identity_file']).expanduser())]
    return host, user, directory.rstrip('/'), ssh


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, default=ROOT / '.deploy.local.json')
    action = parser.add_mutually_exclusive_group()
    action.add_argument('--plan', action='store_true', help='List upload files offline')
    action.add_argument('--check', action='store_true', help='Check SSH and destination without uploading')
    action.add_argument('--apply', action='store_true', help='Upload; default is rsync dry run')
    args = parser.parse_args()
    paths = manifest()
    if args.plan:
        for path in paths:
            print(path.relative_to(ROOT))
        print(f'{len(paths)} files; source: {ROOT}')
        return
    host, user, directory, ssh = configuration(args.config)
    destination = f'{user}@{host}'
    check = f'test -d {shlex.quote(directory)} && test -w {shlex.quote(directory)} && command -v rsync'
    subprocess.run(ssh + [destination, check], check=True)
    if args.check:
        print('SSH, destination and remote rsync are ready.')
        return
    backup = f'/home/{user}/gopt-code-backups/' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    with tempfile.TemporaryDirectory(prefix='gopt-deploy-') as temporary:
        staging = Path(temporary)
        for path in paths:
            target = staging / path.relative_to(ROOT)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, target)
        command = ['rsync', '-rltz', '--checksum', '--itemize-changes', '--backup',
                   f'--backup-dir={backup}', '-e', shlex.join(ssh)]
        if not args.apply:
            command.append('--dry-run')
        command += [str(staging) + '/', destination + ':' + directory + '/']
        print(('Uploading' if args.apply else 'Previewing') + f' {len(paths)} files to {destination}:{directory}', flush=True)
        subprocess.run(command, check=True)
    if args.apply:
        print(f'Replaced files backed up at {backup}')
    else:
        print('Preview complete. Run with --apply to upload these files.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError) as error:
        raise SystemExit(str(error))
