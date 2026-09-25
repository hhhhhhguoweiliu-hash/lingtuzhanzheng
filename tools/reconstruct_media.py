#!/usr/bin/env python3
"""Concatenate original-video chunks and verify exact source bytes; no re-encoding."""
from pathlib import Path
import argparse, hashlib, shutil, os
p=argparse.ArgumentParser();p.add_argument('parts_dir',type=Path);p.add_argument('--output',type=Path,default=Path('1000042572.mp4'));a=p.parse_args()
expected='22177a9ff18e8cc72162a47891caa90f5eb2bf18dbb89ed9fe7c724ac680e350'
parts=[a.parts_dir/f'1000042572.mp4.part{i:02d}' for i in (1,2)]
for part in parts:
 if not part.is_file():p.error(f'Missing {part}')
if a.output.exists():p.error('Output exists; choose a new path to avoid overwriting it')
temp=a.output.with_name(a.output.name+'.assembling')
if temp.exists():p.error('Temporary output exists; inspect it before retrying')
try:
 with temp.open('xb') as dst:
  for part in parts:
   with part.open('rb') as src:shutil.copyfileobj(src,dst)
 with temp.open('rb') as f: actual=hashlib.file_digest(f,'sha256').hexdigest()
 if actual!=expected:raise ValueError(f'SHA-256 mismatch: {actual}')
 if a.output.exists():raise FileExistsError(a.output)
 # Exclusive creation avoids replacing an existing destination.
 with a.output.open('xb') as dst, temp.open('rb') as src:shutil.copyfileobj(src,dst)
 temp.unlink()
 print(f'OK {a.output} ({a.output.stat().st_size} bytes) SHA-256 {actual}')
except Exception:
 if temp.exists():temp.unlink()
 raise
