const http = require('http'), fs = require('fs'), path = require('path');
const mime = {'.html':'text/html','.css':'text/css','.js':'text/javascript'};
const s = http.createServer((req,res)=>{
  let url = req.url === '/' ? '/index.html' : req.url;
  let fp = path.join('D:/zandel-diag/frontend', url);
  if(!fs.existsSync(fp)){res.writeHead(404);res.end('Not found');return;}
  const ext=path.extname(fp);
  res.writeHead(200,{'Content-Type':mime[ext]||'text/plain','Access-Control-Allow-Origin':'*'});
  fs.createReadStream(fp).pipe(res);
});
s.listen(8080, ()=>console.log('Server on 8080'));
