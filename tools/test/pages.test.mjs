import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
const built=path.join(root,'.pages-build');
test('Pages artifact includes the exact application, published data and runtime images without source copies or archives',()=>{
 const result=JSON.parse(execFileSync('python3',['tools/build-pages.py'],{cwd:root,encoding:'utf8'}));
 for(const name of ['index.html','data.json','anime-tierlist-2026-10-11.json','assets/astrava-mark.svg','assets/vendor/fonts.css']){
  assert.deepEqual(readFileSync(path.join(built,name)),readFileSync(path.join(root,name)),name);
 }
 for(const name of ['src','site','addons','tools','downloads','.git','.wrangler','NEWAnime tier list11-08-2026.html'])assert.equal(existsSync(path.join(built,name)),false,name+' is not published');
 const photos=JSON.parse(readFileSync(path.join(root,'assets/album/replacements.json'))).items;
 for(const entry of photos)assert.deepEqual(readFileSync(path.join(built,entry.file)),readFileSync(path.join(root,entry.file)));
 assert.ok(existsSync(path.join(built,'docs/images/astrava-observatory-banner.webp')));
 assert.ok(existsSync(path.join(built,'.nojekyll')));
 assert.equal(result.animeCount,69);
 assert.ok(result.runtimeBytes<40*1024*1024,'runtime artifact stays below 40 MiB');
 assert.deepEqual(readdirSync(built).sort(),['.astrava-pages-build','.nojekyll','SECURITY.md','anime-tierlist-2026-10-11.json','assets','build-info.json','data.json','docs','index.html'].sort());
});
