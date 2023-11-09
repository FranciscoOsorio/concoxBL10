const net = require('net');

const server = net.createServer();

const PORT = process.env.PORT || 8080;

server.on('connection', (socket) => {
  console.log('GPS device connected.');

  // Send login packet
  const loginPacket = Buffer.from('78780d0101234567890123450000e4160d0a', 'hex');
  socket.write(loginPacket);

  socket.on('data', (data) => {
    const dataString = data.toString('hex');
    console.log('Received data:', dataString);

    // Check if data packet is a heartbeat packet
    if (dataString.substr(6, 2) === '13') {
      console.log('Received heartbeat packet.');

      // Send heartbeat response packet
      const heartbeatResponsePacket = Buffer.from('78780a1300010000000f0d0a', 'hex');
      socket.write(heartbeatResponsePacket);
    } else if (dataString.substr(6, 2) === '80') {
      console.log('Received response to login packet.');

      // Send heartbeat packet
      const heartbeatPacket = Buffer.from('78780a1300000000000e0d0a', 'hex');
      socket.write(heartbeatPacket);
    }
  });

  socket.on('end', () => {
    console.log('GPS device disconnected.');
  });
});

server.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
