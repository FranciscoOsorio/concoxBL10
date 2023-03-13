var net = require('net');
try {
 var client = new net.Socket();
 client.connect({
   host: "localhost",
   port: 3003
 });
 //
 client.on('connect', function () {
	 var T_RFID_BICICLETA = '0355951091707997';
	console.log('Client: connection established with server');
	var buffer = Buffer.from("787811800B"+ T_RFID_BICICLETA + "53544154555323", 'hex'); //application socket command UNLOCK
	client.write(buffer);
 // var buffer = Buffer.from("787811800B"+ T_RFID_BICICLETA + "4750534f4e2c323023", 'hex'); //GPSON,20# COMMAND
 // client.write(buffer);
 });

 client.on('data', function(buffer) {
   console.log(buffer.subarray(13, buffer.byteLength).toString('ascii'));
 })
} catch (err) {
console.log(err);
}
