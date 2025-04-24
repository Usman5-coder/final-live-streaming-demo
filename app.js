const express = require('express');
const http = require('http');
const cors = require('cors');

const port = 3000;

const app = express(); 
app.use(cors());
app.use('/', express.static(__dirname));
// app.use('/agents', express.static(__dirname));

app.get('/', function (req, res) {
  res.sendFile(__dirname + '/index-agents.html');
});

app.get('/ws-streaming', function (req, res) {
  res.sendFile(__dirname + '/index-ws.html');
});

app.get('/agents', function (req, res) {
  res.sendFile(__dirname + '/index.html');
});

app.listen(port, () =>
  console.log(
    `Server started on port localhost:${port}\nhttp://localhost:${port}\nhttp://localhost:${port}/agents\nhttp://localhost:${port}/ws-streaming`
  )
);
