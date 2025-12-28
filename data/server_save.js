var net = require('net');
const { Buffer } = require('node:buffer');

var output_vector = new Uint8Array(4);
var input_vector = new Uint8Array(11);
input_vector.fill(0);
output_vector.fill(0);


var client = new net.Socket();
client.connect(8080, '127.0.0.1', function() {
  console.log('Connected to PLC');
  var interval = setInterval(() => {
    client.write(input_vector);
  }, 1000);
});

client.on('data', function(data) {
  i += 1;
  output_vector = data
  if (i%20 == 0) {
    console.log(JSON.stringify(output_vector));
  }
});

client.on('close', function() {
  console.log('Connection closed');
});

const WebSocket = require('ws');

// Create a WebSocket server on port 8080
const wss = new WebSocket.Server({ port: 8080 });

console.log('WebSocket server is running on ws://localhost:8080');

// Connection event handler
wss.on('connection', (ws) => {
  console.log('New client connected');
  
  // Send a welcome message to the client
  ws.send('Welcome to the WebSocket server!');

  // Message event handler
  ws.on('message', (message) => {
    console.log(`Received: ${message}`);
    // Echo the message back to the client
    ws.send(`${message}`);
  });

  // Close event handler
  ws.on('close', () => {
    console.log('Client disconnected');
  });
});
