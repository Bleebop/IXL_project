let net = require('net');
const { Buffer } = require('node:buffer');

let output_vector = new Uint8Array(4);
let input_vector = new Uint8Array(11);
let i_hmi = 0;

const WebSocket = require('ws');

// Create a WebSocket server on port 9960
const HMI_ws = new WebSocket.Server({ port: 9960 });

HMI_ws.binaryType = "arraybuffer";

console.log('WebSocket server is running on ws://localhost:9960');

// Connection event handler
HMI_ws.on('connection', (ws) => {
  console.log('Connected to HMI');
  
  let interval = setInterval(() => {
    ws.send(output_vector);
  }, 50);

  // Message event handler
  ws.on('message', (message) => {
    i_hmi += 1;
    input_vector = new Uint8Array(message);
    if (i_hmi % 20 === 0) {
      console.log(`Received from HMI: ${input_vector}`);
    }
  });

  // Close event handler
  ws.on('close', () => {
    console.log('Client disconnected');
  });
});


let i_plc = 0;

const PLC_socket = new net.Socket();

PLC_socket.connect(8080, '127.0.0.1', function() {
  console.log('Connected to PLC');
  let interval = setInterval(() => {
    PLC_socket.write(input_vector);
  }, 1000);
});

PLC_socket.on('data', function(data) {
  i_plc += 1;
  output_vector = new Uint8Array(data);
  if (i_plc % 20 === 0) {
    console.log(`Received from PLC: ${output_vector}`);
  }
});

PLC_socket.on('close', function() {
  console.log('Connection closed');
});

