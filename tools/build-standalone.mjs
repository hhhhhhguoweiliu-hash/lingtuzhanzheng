import { readFile, writeFile } from 'node:fs/promises';
const index=await readFile('dist/index.html','utf8');
const script=index.match(/<script[^>]*src="([^\"]+)"/)[1];
const stylesheet=index.match(/<link[^>]*href="([^\"]+\.css)"/)[1];
const js=await readFile('dist/'+script.replace(/^\.\//,''),'utf8');
const css=await readFile('dist/'+stylesheet.replace(/^\.\//,''),'utf8');
const html='<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>领土战争 · 可离线试玩</title><style>'+css+'</style></head><body><main id="app"></main><script>'+js.replaceAll('</script','<\\/script')+'</script></body></html>';
await writeFile('dist/领土战争.html',html);
console.log('Standalone offline game: dist/领土战争.html');
