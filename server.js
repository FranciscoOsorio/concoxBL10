var net = require('net');
const { Pool } = require('pg');
const axios = require('axios');
const https = require('https');
const pool = new Pool({
  user: 'postgres',
  host: '10.10.30.58',
  database: 'cykelDB',
  password: 'postgres2019',
  port: 5432,
});

// creates the server
var clients = {};
var transactions = {};
var server = net.createServer({ allowHalfOpen: true });

//emitted when server closes ...not emitted until all connections closes.
server.on('close', function () {
  console.log('Server closed !');
});

// emitted when new client connects
server.on('connection', function (socket) {
  socket.setMaxListeners(0);
  // socket.pipe(socket);
  var loginResponse = Buffer.from('78780C0100000000000000000000000D0A', 'hex');
  var heartbeatResponse = Buffer.from('78780523000000000D0A', 'hex');
  var commandResponse = Buffer.from('787811800B00000000554E4C4F434B23000100000D0A', 'hex');
  var commandResponseWhere = Buffer.from('787810800A00000000574845524523000100000D0A', 'hex');
  var commandResponseLJDW = Buffer.from('78780F8009000000004C4A445723000100000D0A', 'hex');
  var commandResponseStatus = Buffer.from('787811800B0000000053544154555323000100000D0A', 'hex');
  var commandResponseGps = Buffer.from('787813800D000000004750534F4E2C323023000100000D0A', 'hex');
  var commandResponseGpsOff = Buffer.from('787811800B000000004750534f464623000100000D0A', 'hex');
  var locationPacketResponse32 = Buffer.from('7979000532000000000D0A', 'hex');
  var locationPacketResponse33 = Buffer.from('7979000533000000000D0A', 'hex');

  socket.setEncoding('hex');

  socket.on('data', function (data) {
    var sendCRC = 0;
    var IMEI = "";
    var serialNumber = Buffer.alloc(2);

    var buffer = Buffer.from(data, 'hex');
    var startByte = buffer[0].toString(16);

    switch (startByte) {
      case "78":
      var protocolNumber = buffer[3].toString(16);
      switch (protocolNumber) {
        case "1":
        console.log("-----------------------------" + new Date().toString() + "----------------------------------");
        serialNumber = buffer.subarray(buffer.byteLength - 6, buffer.byteLength - 4);
        IMEI = buffer.subarray(4, buffer.byteLength - 10).toString('hex');
        if (!(IMEI in clients))
        clients[IMEI] = socket;
        else {
          delete clients[IMEI];
          clients[IMEI] = socket;
        }

        console.log("Login information received from " + IMEI);
        console.log(buffer.toString('hex'));
        serialNumber.copy(loginResponse, 11);
        var date = new Date();
        loginResponse[4] = parseInt(date.getFullYear().toString().slice(-2));
        loginResponse[5] = date.getMonth() + 1;
        loginResponse[6] = date.getDate();
        loginResponse[7] = date.getHours();
        loginResponse[8] = date.getMinutes();
        loginResponse[9] = date.getSeconds();

        sendCRC = crc_bytes(loginResponse.subarray(2, loginResponse.byteLength - 4));
        loginResponse[loginResponse.byteLength - 4] = ((sendCRC >> 8) & 0xFF);
        loginResponse[loginResponse.byteLength - 3] = ((sendCRC) & 0xFF);

        console.log("Send to: " + IMEI + " Message : " + loginResponse.toString('hex'));
        var is_kernel_buffer_full = clients[IMEI].write(loginResponse);
        break;

        case "23":
        console.log("-----------------------------" + new Date().toString() + "----------------------------------");
        IMEI = Object.keys(clients)[Object.values(clients).indexOf(socket)];
        // clients[IMEI].heartbeat = true;
        serialNumber = buffer.subarray(buffer.byteLength - 6, buffer.byteLength - 4);
        var terminalInfo = Array.from(hexToBin(buffer[4].toString(16)).padStart(8, "0")).reverse();
        var isLocked = terminalInfo[0];
        var isCharging = terminalInfo[2];
        var isGPSPositioned = terminalInfo[6];
        var voltage = hexToDec(buffer.subarray(5, 7)) / 100;
        var gsmSignal = getSignalStrength(buffer[7].toString(16));

        console.log("Heartbeat packet received from " + IMEI + ":");
        console.log("Voltage Level: " + voltage);
        console.log("GMS Signal Strength: " + gsmSignal);
        console.log(isLocked == "1" ? isLocked + " - Locked" : isLocked + " - Unlocked");
        console.log(isCharging == "1" ? isCharging + " - Charging" : isCharging + " - Not Charging");
        console.log(isGPSPositioned == "1" ? isGPSPositioned + " - GPS Positioned" : isGPSPositioned + " - GPS not Positioned");


        serialNumber.copy(heartbeatResponse, 4);
        sendCRC = crc_bytes(heartbeatResponse.subarray(2, heartbeatResponse.byteLength - 4));
        heartbeatResponse[heartbeatResponse.byteLength - 4] = ((sendCRC >> 8) & 0xFF);
        heartbeatResponse[heartbeatResponse.byteLength - 3] = ((sendCRC) & 0xFF);

        console.log("Send to: " + IMEI + " Message : " + heartbeatResponse.toString('hex'));

        var is_kernel_buffer_full = socket.write(heartbeatResponse);
        var ultimaConexion = new Date();
        pool.query('update ctrl_bikes set "E_DISPONIBLE" = $1, "D_BATERIA" = $2, "B_CARGANDO" = $3, "T_SIGNAL" = $4, "FH_ULTIMA_CONEXION" = $5 where "T_TAG" = $6', [isLocked, voltage, isCharging, gsmSignal, ultimaConexion, IMEI ] )
        .then(response => {
          console.log(response.rowCount + " Row(s) affected");
        })
        .catch(err => {
          console.log(err);
        });
        console.log('Written successfully!');
        break;

        case "80":
        console.log("-----------------------------" + new Date().toString() + "----------------------------------");
        console.log("Online command to send received");
        console.log(buffer.subarray(13, buffer.byteLength).toString('ascii'));

        switch (buffer.subarray(13, buffer.byteLength).toString('ascii')) {
          case "GPSOFF#":
          IMEI = buffer.subarray(5, 13).toString('hex');
          if(!isLockConnected(IMEI, socket)) break;

          sendCRC = crc_bytes(commandResponseGpsOff.subarray(2, commandResponseGpsOff.byteLength - 4));
          commandResponseGps[commandResponseGpsOff.byteLength - 4] = ((sendCRC >> 8) & 0xFF);
          commandResponseGps[commandResponseGpsOff.byteLength - 3] = ((sendCRC) & 0xFF);
          var is_kernel_buffer_full = clients[IMEI].write(commandResponseGpsOff);

          console.log('TURNING OFF GPS');
          break;

          case "GPSON,20#":
          IMEI = buffer.subarray(5, 13).toString('hex');
          if(!isLockConnected(IMEI, socket)) break;

          sendCRC = crc_bytes(commandResponseGps.subarray(2, commandResponseGps.byteLength - 4));
          commandResponseGps[commandResponseGps.byteLength - 4] = ((sendCRC >> 8) & 0xFF);
          commandResponseGps[commandResponseGps.byteLength - 3] = ((sendCRC) & 0xFF);
          var is_kernel_buffer_full = clients[IMEI].write(commandResponseGps);

          console.log('TURNING ON GPS');
          break;

          case "STATUS#":
          IMEI = buffer.subarray(5, 13).toString('hex');

          if(!isLockConnected(IMEI, socket)) break;

          sendCRC = crc_bytes(commandResponseStatus.subarray(2, commandResponseStatus.byteLength - 4));
          commandResponseStatus[commandResponseStatus.byteLength - 4] = ((sendCRC >> 8) & 0xFF);
          commandResponseStatus[commandResponseStatus.byteLength - 3] = ((sendCRC) & 0xFF);
          var is_kernel_buffer_full = clients[IMEI].write(commandResponseStatus);

          console.log('GETTING STATUS');
          break;

          case "WHERE#":
          IMEI = buffer.subarray(5, 13).toString('hex');

          if(!isLockConnected(IMEI, socket)) break;

          sendCRC = crc_bytes(commandResponseWhere.subarray(2, commandResponseWhere.byteLength - 4));
          commandResponseWhere[commandResponseWhere.byteLength - 4] = ((sendCRC >> 8) & 0xFF);
          commandResponseWhere[commandResponseWhere.byteLength - 3] = ((sendCRC) & 0xFF);
          var is_kernel_buffer_full = clients[IMEI].write(commandResponseWhere);

          console.log('GETTING LOCATION');
          break;

          case "LJDW#":
          IMEI = buffer.subarray(5, 13).toString('hex');

          if(!isLockConnected(IMEI, socket)) break;

          sendCRC = crc_bytes(commandResponseLJDW.subarray(2, commandResponseLJDW.byteLength - 4));
          commandResponseLJDW[commandResponseLJDW.byteLength - 4] = ((sendCRC >> 8) & 0xFF);
          commandResponseLJDW[commandResponseLJDW.byteLength - 3] = ((sendCRC) & 0xFF);
          var is_kernel_buffer_full = clients[IMEI].write(commandResponseLJDW);

          console.log('GETTING LOCATION');
          break;

          default:
          IMEI = buffer.subarray(5, buffer.byteLength - 2).toString('hex');

          if(!isLockConnected(IMEI, socket)) break;

          sendCRC = crc_bytes(commandResponse.subarray(2, commandResponse.byteLength - 4));
          commandResponse[commandResponse.byteLength - 4] = ((sendCRC >> 8) & 0xFF);
          commandResponse[commandResponse.byteLength - 3] = ((sendCRC) & 0xFF);
          var is_kernel_buffer_full = clients[IMEI].write(commandResponse);

          console.log("Send to: " + IMEI + " Message : " + commandResponse.toString('hex'));
          is_kernel_buffer_full = socket.write("BIKE_LOCK_OPENED");
          console.log('Written successfully!');

          break;
        }
        break;

        default:
        console.log("-----------------------------" + new Date().toString() + "----------------------------------");
        var is_kernel_buffer_full = socket.write("BAD_PROTOCOL_NUMBER");
        console.log('BAD_PROTOCOL_NUMBER');
        break;
      }
      break;

      case "79":
      var protocolNumber = buffer[4].toString(16);
      switch (protocolNumber) {
        case "21":
        console.log("-----------------------------" + new Date().toString() + "----------------------------------");
        console.log("Online command response by terminal received");
        var commandContent = buffer.subarray(10, buffer.byteLength - 6).toString('ascii');
        IMEI = Object.keys(clients)[Object.values(clients).indexOf(socket)];
        try {
          validateTerminalResponse(commandContent, IMEI);
        } catch (err) {
          console.log(err);
        }

        break;

        case "32":
        console.log("-----------------------------" + new Date().toString() + "----------------------------------");
        IMEI = Object.keys(clients)[Object.values(clients).indexOf(socket)];
        serialNumber = buffer.subarray(buffer.byteLength - 6, buffer.byteLength - 4);
        console.log("Location packet received from " + IMEI);
        console.log(buffer.toString('hex'));
        var latitude = hexToDec(buffer.subarray(13, 17)) / 1800000;
        var longitude = (hexToDec(buffer.subarray(17, 21)) / 1800000) * -1;
        var speed = hexToDec(buffer.subarray(21, 22));
        console.log("LATITUDE: " + latitude.toFixed(10));
        console.log("LONGITUDE: " + longitude.toFixed(10));

        console.log("GPS POSITION AND SPEED: " + latitude.toFixed(10) + ", " + longitude.toFixed(10) + " SPEED: " + speed);

        serialNumber.copy(locationPacketResponse32, 5);
        sendCRC = crc_bytes(locationPacketResponse32.subarray(2, locationPacketResponse32.byteLength - 4));
        locationPacketResponse32[locationPacketResponse32.byteLength - 4] = ((sendCRC >> 8) & 0xFF);
        locationPacketResponse32[locationPacketResponse32.byteLength - 3] = ((sendCRC) & 0xFF);

        console.log("Send Message: " + locationPacketResponse32.toString('hex'));
        var is_kernel_buffer_full = socket.write(locationPacketResponse32);

        if(transactions[IMEI] != undefined)
        {
          //UPDATELOCATION
          transactions[IMEI].T_LATITUD = latitude;
          transactions[IMEI].T_LONGITUD = longitude;
          transactions[IMEI].FH_FECHA_HORA = new Date();
          transactions[IMEI].createdAt = new Date();
          transactions[IMEI].updatedAt = new Date();
          var query = "INSERT INTO ctrl_travels (\"E_ID_SUSCRIPTOR\", \"T_RFID_BICICLETA\", \"E_ID_TRANSACCION\", \"FH_FECHA_HORA\", \"T_LATITUD\", \"T_LONGITUD\", \"createdAt\", \"updatedAt\") VALUES($1, $2, $3, $4, $5, $6, $7, $8)";
          var values = [
            transactions[IMEI].E_ID_SUSCRIPTOR,
            transactions[IMEI].T_TAG,
            transactions[IMEI].id,
            transactions[IMEI].FH_FECHA_HORA,
            transactions[IMEI].T_LATITUD,
            transactions[IMEI].T_LONGITUD,
            transactions[IMEI].createdAt,
            transactions[IMEI].updatedAt
          ];
          pool.query(query, values)
          .then(response => {
            if(response.rowCount > 0)
            console.log("LOCATION UPDATED");
            else
            console.log("FAILED UPDATING LOCATION");
          })
          .catch(err => {
            console.log(err);
          });
          //ENDUPDATELOCATION
        }

        updateLocation(latitude, longitude, IMEI);

        console.log('Written successfully!');
        break;
      }
      break;

      default:
      console.log("-----------------------------" + new Date().toString() + "----------------------------------");
      var is_kernel_buffer_full = socket.write("BAD_START_BYTES");
      console.log('BAD_START_BYTES');
      break;
    }

  });

  socket.on('drain', function () {
    console.log('Empty write buffer');
    socket.resume();
  });

  socket.on('error', function (error) {
    console.log('Error : ' + error);
  });

  // socket.setTimeout(90000);
  socket.on('timeout', function () {
    console.log('Socket timed out !');
    var IMEI = Object.keys(clients)[Object.values(clients).indexOf(socket)];
    delete clients[IMEI];
  });

  socket.on('end', function (data) {
    console.log('Socket ended from other end!');
  });

  socket.on('close', function (error) {
    console.log('Socket closed!');
    if (error) {
      console.log('Socket was closed: transmission error');
    }
  });

});

// emits when any error occurs -> calls closed event immediately after this.
server.on('error', function (error) {
  console.log('Error: ' + error);
});

//emits when server is bound with server.listen
server.on('listening', function () {
  console.log('Server is listening on port 3003');
});

server.maxConnections = 100;
//static port allocation
server.listen(3003);

//constant client to check the travels in course and save bike location

var client = new net.Socket();
client.connect({
  host: "localhost",
  port: 3003
});

client.on('close', function(err){
});


client.on('connect', function () {
  console.log('Client: connection established with server');
});

setInterval(function () {
  pool.query('select cb.\"T_TAG\" from ctrl_bikes cb where cb.\"T_TIPO_BICI\" = \'ELECTRICA\' and cb.\"FH_ULTIMA_CONEXION\" > cb.\"FH_ULTIMA_CONEXION\" + \'1.5 min\':: interval')
  .then(response => {
    if (response.T_TAG in clients)
    delete clients[IMEI];
  })
  .catch(err => {
    console.log(err);
  });
}, 90000);

setInterval(() => {
  pool.query('select cb.\"T_TAG\", ct.\"E_ID_SUSCRIPTOR\", ct.\"id\" from ctrl_transactions ct join ctrl_bikes cb on ct.\"T_RFID_BICICLETA\" = cb.\"T_TAG\" where ct.\"E_ESTATUS\" = 1 and cb.\"E_DISPONIBLE\" = false and cb.\"T_TIPO_BICI\" = \'ELECTRICA\'')
  .then(response => {
    response.rows.forEach(transaction => {
      transactions[transaction.T_TAG] = transaction;
      var buffer = Buffer.from("787811800B"+ transaction.T_TAG + "574845524523", 'hex'); //WHERE# COMMAND
      // var buffer = Buffer.from("787811800B"+ transaction.T_TAG + "4C4A445723", 'hex'); //LJDW# COMMAND
      client.write(buffer);
    });
  })
  .catch(err => {
    console.log(err);
  });
}, 2000);

setInterval(() => {
  pool.query('select ct.* from ctrl_transactions ct join ctrl_bikes cb on ct.\"T_RFID_BICICLETA\" = cb.\"T_TAG\" where ct.\"E_ESTATUS\" = 1 and cb.\"E_DISPONIBLE\" = true and cb.\"T_TIPO_BICI\" = \'ELECTRICA\'')
  .then(response => {
    response.rows.forEach(travel => {
      var transact = {
        idEstacion: 0,
        rfidBicicleta: travel.T_RFID_BICICLETA,
        posicionBicicleta: 0,
        idSlot: 0,
        fechaFinTransaccion: new Date()
      };
      axios.post(
        'https://10.10.30.80/electronics/endTransaction',
        transact,
        {
          httpsAgent: new https.Agent({
            rejectUnauthorized: false
          })
        })
        .then((res) => {
          if(res.data)
          {
            delete transactions[travel.T_RFID_BICICLETA];
            console.log("Viaje finalizado para: " + travel.T_RFID_BICICLETA);
          }
        })
        .catch((error) => {
          console.log(error);
        });
      });
    })
    .catch(err => {
      console.log(err);
    });
  }, 10000);

  var crcTable =
  [
    0X0000, 0X1189, 0X2312, 0X329B, 0X4624, 0X57AD, 0X6536, 0X74BF, 0X8C48, 0X9DC1, 0XAF5A,
    0XBED3, 0XCA6C, 0XDBE5, 0XE97E, 0XF8F7, 0X1081, 0X0108, 0X3393, 0X221A, 0X56A5, 0X472C,
    0X75B7, 0X643E, 0X9CC9, 0X8D40, 0XBFDB, 0XAE52, 0XDAED, 0XCB64, 0XF9FF, 0XE876, 0X2102,
    0X308B, 0X0210, 0X1399, 0X6726, 0X76AF, 0X4434, 0X55BD, 0XAD4A, 0XBCC3, 0X8E58, 0X9FD1,
    0XEB6E, 0XFAE7, 0XC87C, 0XD9F5, 0X3183, 0X200A, 0X1291, 0X0318, 0X77A7, 0X662E, 0X54B5,
    0X453C, 0XBDCB, 0XAC42, 0X9ED9, 0X8F50, 0XFBEF, 0XEA66, 0XD8FD, 0XC974, 0X4204, 0X538D,
    0X6116, 0X709F, 0X0420, 0X15A9, 0X2732, 0X36BB, 0XCE4C, 0XDFC5, 0XED5E, 0XFCD7, 0X8868,
    0X99E1, 0XAB7A, 0XBAF3, 0X5285, 0X430C, 0X7197, 0X601E, 0X14A1, 0X0528, 0X37B3, 0X263A,
    0XDECD, 0XCF44, 0XFDDF, 0XEC56, 0X98E9, 0X8960, 0XBBFB, 0XAA72, 0X6306, 0X728F, 0X4014,
    0X519D, 0X2522, 0X34AB, 0X0630, 0X17B9, 0XEF4E, 0XFEC7, 0XCC5C, 0XDDD5, 0XA96A, 0XB8E3,
    0X8A78, 0X9BF1, 0X7387, 0X620E, 0X5095, 0X411C, 0X35A3, 0X242A, 0X16B1, 0X0738, 0XFFCF,
    0XEE46, 0XDCDD, 0XCD54, 0XB9EB, 0XA862, 0X9AF9, 0X8B70, 0X8408, 0X9581, 0XA71A, 0XB693,
    0XC22C, 0XD3A5, 0XE13E, 0XF0B7, 0X0840, 0X19C9, 0X2B52, 0X3ADB, 0X4E64, 0X5FED, 0X6D76,
    0X7CFF, 0X9489, 0X8500, 0XB79B, 0XA612, 0XD2AD, 0XC324, 0XF1BF, 0XE036, 0X18C1, 0X0948,
    0X3BD3, 0X2A5A, 0X5EE5, 0X4F6C, 0X7DF7, 0X6C7E, 0XA50A, 0XB483, 0X8618, 0X9791, 0XE32E,
    0XF2A7, 0XC03C, 0XD1B5, 0X2942, 0X38CB, 0X0A50, 0X1BD9, 0X6F66, 0X7EEF, 0X4C74, 0X5DFD,
    0XB58B, 0XA402, 0X9699, 0X8710, 0XF3AF, 0XE226, 0XD0BD, 0XC134, 0X39C3, 0X284A, 0X1AD1,
    0X0B58, 0X7FE7, 0X6E6E, 0X5CF5, 0X4D7C, 0XC60C, 0XD785, 0XE51E, 0XF497, 0X8028, 0X91A1,
    0XA33A, 0XB2B3, 0X4A44, 0X5BCD, 0X6956, 0X78DF, 0X0C60, 0X1DE9, 0X2F72, 0X3EFB, 0XD68D,
    0XC704, 0XF59F, 0XE416, 0X90A9, 0X8120, 0XB3BB, 0XA232, 0X5AC5, 0X4B4C, 0X79D7, 0X685E,
    0X1CE1, 0X0D68, 0X3FF3, 0X2E7A, 0XE70E, 0XF687, 0XC41C, 0XD595, 0XA12A, 0XB0A3, 0X8238,
    0X93B1, 0X6B46, 0X7ACF, 0X4854, 0X59DD, 0X2D62, 0X3CEB, 0X0E70, 0X1FF9, 0XF78F, 0XE606,
    0XD49D, 0XC514, 0XB1AB, 0XA022, 0X92B9, 0X8330, 0X7BC7, 0X6A4E, 0X58D5, 0X495C, 0X3DE3,
    0X2C6A, 0X1EF1, 0X0F78
  ];

  function crc_bytes(data) {
    var fcs = 0xFFFF;
    for (let i = 0; i < data.length; i++) {
      fcs = ((fcs >> 8) ^ crcTable[(fcs ^ data[i]) & 0xFF]);
    }

    return ~fcs;
  }

  function hexToDec(data) {
    return parseInt(data.toString('hex'), 16);
  }

  function getSignalStrength(signal) {
    var strength = "";
    switch (signal) {
      case "0":
      strength = "NO_SIGNAL";
      break;

      case "1":
      strength = "EXTREMELY_WEAK_SIGNAL";
      break;

      case "2":
      strength = "VERY_WEAK_SIGNAL";
      break;

      case "3": ;
      strength = "GOOD_SIGNAL";
      break;

      case "4":
      strength = "STRONG_SIGNAL";
      break;
    }
    return strength;
  }

  function hexToBin(hex) {
    return (parseInt(hex, 16)).toString(2);
  }

  function isLockConnected(IMEI, socket){
    if (!(IMEI in clients)) {
      var is_kernel_buffer_full = socket.write("BIKE_LOCK_NOT_CONNECTED");
      if (is_kernel_buffer_full) {
        console.log('BIKE_LOCK_NOT_CONNECTED');
      } else {
        socket.pause();
      }
      return false;
    }
    else
    {
      return true;
    }
  }

  function validateTerminalResponse(commandContent, IMEI){
    console.log(commandContent);
    if(commandContent.includes('t position'))
    {
      var coords = commandContent.split(':');
      var Latitud = coords[1].substr(1, 9);
      var Longitud = '-' + coords[2].substr(1, 9);
      transactions[IMEI].T_LATITUD = Latitud;
      transactions[IMEI].T_LONGITUD = Longitud;
      transactions[IMEI].FH_FECHA_HORA = new Date();
      transactions[IMEI].createdAt = new Date();
      transactions[IMEI].updatedAt = new Date();
      // console.log(transactions);
      var query = "INSERT INTO ctrl_travels (\"E_ID_SUSCRIPTOR\", \"T_RFID_BICICLETA\", \"E_ID_TRANSACCION\", \"FH_FECHA_HORA\", \"T_LATITUD\", \"T_LONGITUD\", \"createdAt\", \"updatedAt\") VALUES($1, $2, $3, $4, $5, $6, $7, $8)";
      var values = [
        transactions[IMEI].E_ID_SUSCRIPTOR,
        transactions[IMEI].T_TAG,
        transactions[IMEI].id,
        transactions[IMEI].FH_FECHA_HORA,
        transactions[IMEI].T_LATITUD,
        transactions[IMEI].T_LONGITUD,
        transactions[IMEI].createdAt,
        transactions[IMEI].updatedAt
      ];
      pool.query(query, values)
      .then(response => {
        if(response.rowCount > 0)
        console.log("LOCATION UPDATED");
        else
        console.log("FAILED UPDATING LOCATION");
      })
      .catch(err => {
        console.log(err);
      });
      updateLocation(Latitud, Longitud, IMEI);
    }
    else if (commandContent.includes("Battery")) {
      var inf = commandContent.split(';');
      var infoLock = inf[(inf.length - 3)];
      var isLocked = infoLock.substr(infoLock.length - 8, 8).trim();
      console.log(isLocked);
      if(isLocked.includes('ON'))
      {
        isLocked = '1';
      }
      else if (isLocked.includes('OFF')) {
        isLocked = '0';
      }
      pool.query('update ctrl_bikes set "E_DISPONIBLE" = $1 where "T_TAG" = $2', [isLocked, IMEI])
      .then(response => {
        console.log(response.rowCount + " Row(s) affected");
      })
      .catch(err => {
        console.log(err);
      });
    }
    // else{
    //   console.log(commandContent);
    // }
  }

  async function updateLocation(latitude, longitude, IMEI)
  {
    pool.query('update ctrl_bikes set "T_LATITUD" = $1, "T_LONGITUD" = $2 where "T_TAG" = $3', [latitude, longitude, IMEI] )
    .then(response => {
      console.log(response.rowCount + " Row(s) affected");
    })
    .catch(err => {
      console.log(err);
    });
  }
