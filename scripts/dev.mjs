import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import finance from '../api/finance.js';
import telegram from '../api/telegram.js';
try { process.loadEnvFile('.env.local'); } catch {}
const root=process.cwd();
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/api/')) {
    req.query=Object.fromEntries(url.searchParams);
    let body=''; for await (const chunk of req) body+=chunk;
    if(body) { try { req.body=JSON.parse(body); } catch {res.writeHead(400);res.end('Invalid JSON');return;} }
    res.status=code=>{res.statusCode=code;return res;};
    res.json=data=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));return res;};
    return (url.pathname==='/api/telegram' ? telegram : finance)(req,res);
  }
  const file=url.pathname==='/' ? 'index.html' : url.pathname.slice(1);
  if(!['index.html','app.js','style.css'].includes(file)) {res.writeHead(404);res.end('Not found');return;}
  try {
    const contents=await readFile(path.join(root,file));
    res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css':'text/javascript');res.end(contents);
  } catch {res.writeHead(404);res.end('Not found');}
});
server.listen(3004,'127.0.0.1',()=>console.log('Friends Included: http://127.0.0.1:3004'));
