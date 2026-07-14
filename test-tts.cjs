const http = require('http');
const fs = require('fs');
const options = {
  hostname: '127.0.0.1',
  port: 3000,
  path: '/api/nova/speech',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
};
const req = http.request(options, res => {
  let data = '';
  res.on('data', chunk => { data += chunk; });
  res.on('end', () => {
    const pd = JSON.parse(data);
    if(pd.audio) { 
      const buffer = Buffer.from(pd.audio, 'base64');
      fs.writeFileSync('output.pcm', buffer);
    }
  });
});
req.write(JSON.stringify({ text: "Hello!" }));
req.end();
