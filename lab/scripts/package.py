from pathlib import Path
import hashlib,zipfile,shutil
r=Path(__file__).resolve().parent.parent
folder=r/'downloads/offline'
assert (folder/'ASTRAVA-Lab.html').exists() and (folder/'ASTRAVA-V5-test.html').exists()
for name in ['PLAN.md','QA.md','models.json','benchmark.json']:
 shutil.copy2(r/'docs'/name,folder/name)
models=folder/'models';models.mkdir(exist_ok=True)
for source in (r/'public/models').glob('*.glb'):shutil.copy2(source,models/source.name)
files=sorted(p for p in folder.rglob('*') if p.is_file() and p.name!='SHA256SUMS.txt')
(folder/'SHA256SUMS.txt').write_text(''.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.relative_to(folder).as_posix()+'\n' for p in files))
archive=r/'downloads/ASTRAVA-Lab-test.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for p in sorted(folder.rglob('*')):
  if p.is_file():z.write(p,p.relative_to(folder).as_posix())
with zipfile.ZipFile(archive) as z:
 assert z.testzip() is None
 for p in folder.rglob('*'):
  if p.is_file():assert z.read(p.relative_to(folder).as_posix())==p.read_bytes()
(r/'downloads/SHA256SUMS.txt').write_text(hashlib.sha256(archive.read_bytes()).hexdigest()+'  '+archive.name+'\n')
print('Verified ZIP:',archive.stat().st_size,'bytes')
