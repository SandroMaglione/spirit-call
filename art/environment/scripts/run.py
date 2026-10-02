"""Run the authoring pipeline with concise output and per-stage diagnostic logs."""
import argparse
import shutil
import subprocess
import time
from pathlib import Path

scripts = Path(__file__).resolve().parent
env = scripts.parent
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--kit', required=True)
p.add_argument('--blender', default=shutil.which('blender') or '/Applications/Blender.app/Contents/MacOS/Blender')
p.add_argument('--threads', type=int, default=4, help='Limit Blender CPU threads when other art jobs are running')
p.add_argument('--device', choices=['CPU', 'METAL'], default='CPU')
p.add_argument('--build', action='store_true')
p.add_argument('--replace-generated', action='store_true')
p.add_argument('--render', action='store_true')
p.add_argument('--compositions-only', action='store_true')
p.add_argument('--overview-only', action='store_true')
p.add_argument('--asset')
p.add_argument('--crow', type=Path)
p.add_argument('--validator', type=Path)
args = p.parse_args()
root = env / args.kit
assert (root / 'kit.json').is_file(), 'Unknown kit'
logs = root / '.logs'
logs.mkdir(exist_ok=True)
steps = (['build'] if args.build else []) + ['export', 'verify'] + (['render'] if args.render else [])
for step in steps:
    command = [args.blender, '--background', '--threads', str(args.threads), '--python-exit-code', '1', '--python', str(scripts / (step + '.py')), '--', '--kit', args.kit]
    if step == 'build' and args.replace_generated:
        command.append('--replace-generated')
    if step == 'render':
        command += ['--device', args.device]
        if args.crow:
            command += ['--crow', str(args.crow.resolve())]
        if args.compositions_only:
            command += ['--compositions-only']
        if args.overview_only:
            command += ['--overview-only']
        if args.asset:
            command += ['--asset', args.asset]
    start = time.monotonic()
    print(step.upper(), args.kit, flush=True)
    log = logs / (step + '.log')
    with log.open('w') as output:
        result = subprocess.run(command, stdout=output, stderr=subprocess.STDOUT)
    if result.returncode:
        print('\n'.join(log.read_text().splitlines()[-45:]), flush=True)
        raise SystemExit(result.returncode)
    print('PASS', step, round(time.monotonic() - start, 1), 'seconds', flush=True)
if args.validator:
    subprocess.run(['node', str(scripts / 'validate-gltf.cjs'), str(root), str(args.validator.resolve())], check=True)
