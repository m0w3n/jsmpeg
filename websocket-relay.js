// Use the websocket-relay to serve a raw MPEG-TS over WebSockets. You can use
// ffmpeg to feed the relay. ffmpeg -> websocket-relay -> browser
// Example:
// node websocket-relay yoursecret 8080 8081 8082 8083
// nodemon websocket-relay yoursecret 8080 8081 8082 8083
// ffmpeg -i <some input> -f mpegts http://localhost:8081/yoursecret

var fs = require('fs'),
	http = require('http'),
	dgram = require('dgram'),
	WebSocket = require('ws'),
	url = require('url'),
	express = require('express'),
	multer = require('multer'),
	path = require('path'),
	redis = require('redis');

if (process.argv.length < 5) {
	console.log(
		'Usage: \n' +
		'node websocket-relay.js <secret> [<web-port> <stream-port> <websocket-port> <udp-port>]'
	);
	process.exit();
}

var STREAM_SECRET = process.argv[2],
	WEB_PORT = process.argv[3] || 8080,			// web
	STREAM_PORT = process.argv[4] || 8081,		// 用于ffmpeg视频流上传
	WEBSOCKET_PORT = process.argv[5] || 8082,	// 用于视频流下载
	UDP_PORT = process.argv[6] || 8083,			// 用于视频流上传
	RECORD_STREAM = false;

var dataImgBuffer;
var deviceCameraActivity = {} // {deviceId:[]}
var deviceCameraImgBuffer = {}  // {deviceId+cameraId:ImgBuffer,...}
var deviceCameraImgBufferlastActivity = {}  // {deviceId+cameraId:timestamp,...}

// Redis
var token_temp = [];
var redisClient = redis.createClient();
redisClient.on('error', function (err) {
    console.log(err);
});
redisClient.on('connect', function () {
    console.log('redis connect success!');
    redisClient.del('tokenLists');
});
// 连接
redisClient.connect(6379, '127.0.0.1')


// 计算帧速
let counter = 0;
const intervalId = setInterval(() => {
	if (counter != 0)
		console.log(`帧率 ${counter}`);
  	counter = 0;
}, 1000); // 每秒执行一次

// 定时清除不活跃图片
const intervalId1 = setInterval(() => {
	var currentTimeStamp = Date.now();
	// console.log(currentTimeStamp)
	for (const deviceCameraId in deviceCameraImgBufferlastActivity) {
		var timeStamp = deviceCameraImgBufferlastActivity[deviceCameraId];
		// console.log(currentTimeStamp, timeStamp, currentTimeStamp - timeStamp)
		if (currentTimeStamp - timeStamp > 2000) {
			// console.log(deviceCameraImgBuffer)
			deviceCameraImgBuffer[deviceCameraId] = Buffer.alloc(0);
			delete deviceCameraImgBufferlastActivity[deviceCameraId];
			// console.log(deviceCameraImgBuffer)
		}
	}
}, 1000); // 每秒执行一次


// 创建存储目录（兼容旧版fs）
function ensureDirectoryExists(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  } catch (err) {
    console.error('创建目录失败:', err);
  }
}
const uploadDir = path.join(__dirname, 'uploads');
ensureDirectoryExists(uploadDir);

// Websocket Server
var socketServer = new WebSocket.Server({port: WEBSOCKET_PORT, perMessageDeflate: false});
socketServer.connectionCount = 0;
socketServer.on('connection', function(socket, upgradeReq) {
	socketServer.connectionCount++;
	var wsurl = upgradeReq.url;
    console.log('url is ' + wsurl); // "/path?token=yoursecret&deviceId=xxx[&cameraId=20]"
    var params = url.parse(wsurl, true).query;// {token:xxxxxxx}
	// console.log(params)
    if (!params.token || params.token !== STREAM_SECRET
		|| !params.deviceId || params.deviceId.length !== 32
	) {
		socket.close()
		console.log('close ws!')
		return
	}

	var deviceId = params.deviceId
	console.log('New WebSocket Connection: ', deviceId)

	socket.on('message', function(message){
		// console.log(deviceId, typeof message, `收到消息: ${message}`);
		var msgList = message.toString().split(":")
		if (msgList.length !== 2) return

		var action = msgList[0]
		var msg = msgList[1]
		// console.log("action,msg", action,msg)
		if (action === "getImage" && msg.length === 2) {
			var CameraId = msg;
			var deviceCameraId = deviceId+CameraId;
			// console.log("deviceCameraId", deviceCameraId, deviceCameraId in deviceCameraImgBuffer)
			// console.log("deviceCameraImgBuffer", deviceCameraImgBuffer)
			if (deviceCameraId in deviceCameraImgBuffer) {
				// console.log("返回数据", deviceCameraImgBuffer[deviceCameraId].length)
				socket.send(deviceCameraImgBuffer[deviceCameraId]);
			}

		}

		// 发送回复
		// if (deviceCameraId in deviceCameraImgBuffer)
		// 	socket.send(deviceCameraImgBuffer[deviceCameraId]);
		// else
		// 	socket.send(Buffer.alloc(0));
		// if (dataImgBuffer) socket.send(dataImgBuffer);
	});
	socket.on('close', function(code, message){
		socketServer.connectionCount--;
		console.log(
			'Disconnected WebSocket ('+socketServer.connectionCount+' total)'
		);
	});
});
socketServer.broadcast = function(data) {
	socketServer.clients.forEach(function each(client) {
		if (client.readyState === WebSocket.OPEN) {
			client.send(data);
		}
	});
};

// UDP Server to accept incomming jpg
var udpServer = dgram.createSocket('udp4'); // 'udp4' 表示 IPv4
udpServer.on('message', (msg, clientInfo) => {
	// console.log(clientInfo, msg)
	if (msg.length <= 34) return
	deviceCameraId = msg.subarray(0, 34).toString(); // 获取前32字节deviceId + 2字节CameraId
	timeStampMSecs = msg.subarray(34, 47).toString(); // 获取毫秒时间戳
	// console.log(deviceCameraId, timeStampMSecs, 'udp上传中！')
	dataImgBuffer = msg.slice(32)	// 保存帧： 2字节CameraId + 13字节时间戳 + imageData
	deviceCameraImgBuffer[deviceCameraId] = dataImgBuffer
	deviceCameraImgBufferlastActivity[deviceCameraId] = Date.now()
	// console.log('tttttttt',deviceCameraImgBufferlastActivity[deviceCameraId])
	// socketServer.broadcast(dataImgBuffer);
	counter+=1;
});
udpServer.bind(UDP_PORT);

// WEB Sever
// 配置 multer 存储（兼容旧语法）
// 磁盘型
// const storage = multer.diskStorage({
//   destination: function (req, file, cb) {
//     cb(null, uploadDir);
//   },
//   filename: function (req, file, cb) {
//     const timestamp = Date.now();
//     const frameIndex = req.body.frameIndex || 'unknown';
//     cb(null, 'frame_' + frameIndex + '_' + timestamp + '.jpg');
//   }
// });
// 内存型
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 限制 10MB
});

var app = express();
app.use('/public', express.static('public'));
// 管理员添加用户设备
app.get('/registerDevice', async function(req, res) {
	// console.log(req.query)	// ?token=yoursecret&deviceId=xxx&cameraIds=xxx
	var flag = false;
	if (req.query.token && req.query.token === STREAM_SECRET
		&& req.query.deviceId && req.query.deviceId.length === 32
		&& req.query.cameraIds && req.query.cameraIds.length === 2
	) {
		var deviceId = req.query.deviceId + ":cameraIds";
		var cameraIds = req.query.cameraIds.split(',');
		// console.log(deviceId, cameraIds);

		await redisClient.lRange(deviceId, 0, -1).then((value) => {
			// console.log(deviceId, value)
			cameraIds.forEach(element => {
				// console.log(deviceId, value, value.indexOf(element))
				if (value.indexOf(element) < 0) {
					flag = true;
					redisClient.rPush(deviceId, element);
					// console.log(deviceId, value)
				}
			});
		});
	}
	// console.log('返回')
	res.status(200).json({
		success: flag,
		message: '',
		timestamp: Date.now()
	});
});
// 查看可用摄像头id
app.get('/getCameras', async function(req, res) {
	// console.log(req.query)	// ?token=yoursecret&deviceId=xxx
	var flag = false;
	var cameraIds = '';
	if (req.query.token && req.query.token === STREAM_SECRET
		&& req.query.deviceId && req.query.deviceId.length === 32
	) {
		var deviceId = req.query.deviceId + ":cameraIds";
		// console.log('getCameras', deviceId)
		await redisClient.lRange(deviceId, 0, -1).then((value) => {
			flag = true;
			cameraIds = value.join(',');
		});
	}
	// console.log('返回')
	res.status(200).json({
		success: flag,
		message: cameraIds,
		timestamp: Date.now()
	});
});
// 处理图片上传
app.post('/upload', upload.single('image'), async function(req, res) {
	if (!req.file) {
		return res.status(400).json({ error: '未接收到图片' });
	}
	// console.log('收到帧 #' + (req.body.frameIndex || 'N/A') + ' | 大小: ' + req.file.size + ' 字节');
	// console.log(req.file)
	// 可选：保存为文件
	// const timestamp = Date.now();
	// const frameIndex = req.body.frameIndex || 'unknown';
	// const outputPath = path.join(__dirname, 'uploads', 'frame_' + frameIndex + '_' + timestamp + '.jpg');
	// fs.writeFileSync(outputPath, req.file.buffer);
	socketServer.broadcast(req.file.buffer);
	counter+=1;

	res.status(200).json({
		message: '帧接收成功',
		filename: req.file.filename,
		frameIndex: req.body.frameIndex,
		timestamp: Date.now()
	});
});
app.get('/index.html', async function (req, res) {
	// console.log(req.query)	// ?token=yoursecret&deviceId=xxx&action=x
	var cameraIds = '';
	var action = '404';
	if (req.query.token && req.query.token === STREAM_SECRET
		&& req.query.action
		&& req.query.deviceId && req.query.deviceId.length === 32
	) {
		var deviceId = req.query.deviceId + ":cameraIds";
		// console.log('deviceId', deviceId)
		await redisClient.lRange(deviceId, 0, -1).then((value) => {
			action = req.query.action;
			cameraIds = value.join(',');
			// console.log('getCameras', cameraIds)
		});
	}
	switch (action) {
	case '0':
		return res.sendFile( __dirname + "/page/index.html");
	case '1':
		return res.sendFile( __dirname + "/page/index1.html");
	case '2':
		return res.sendFile( __dirname + "/page/index2.html");
	case '10':
		return res.sendFile( __dirname + "/page/view-stream.html");
	default:
		return res.sendFile( __dirname + "/page/404.html" );
	}
})
app.get('/view-stream.html', function (req, res) {
	res.sendFile( __dirname + "/" + "view-stream.html" );
})
app.get('/view-stream1.html', function (req, res) {
	res.sendFile( __dirname + "/" + "view-stream1.html" );
})
// 启动服务器
app.listen(WEB_PORT);

// HTTP Server to accept incomming MPEG-TS Stream from ffmpeg
var streamServer = http.createServer( function(request, response) {
	var params = request.url.substr(1).split('/');

	if (params[0] !== STREAM_SECRET) {
		console.log(
			'Failed Stream Connection: '+ request.socket.remoteAddress + ':' +
			request.socket.remotePort + ' - wrong secret.'
		);
		response.end();
	}

	response.connection.setTimeout(0);
	console.log(
		'Stream Connected: ' +
		request.socket.remoteAddress + ':' +
		request.socket.remotePort
	);
	request.on('data', function(data){
		socketServer.broadcast(data);
		if (request.socket.recording) {
			request.socket.recording.write(data);
		}
	});
	request.on('end',function(){
		console.log('close');
		if (request.socket.recording) {
			request.socket.recording.close();
		}
	});

	// Record the stream to a local file?
	if (RECORD_STREAM) {
		var path = 'recordings/' + Date.now() + '.ts';
		request.socket.recording = fs.createWriteStream(path);
	}
})
// Keep the socket open for streaming
streamServer.headersTimeout = 0;
streamServer.listen(STREAM_PORT);

console.log('Listening for web Server on http://127.0.0.1:'+WEB_PORT+'/<secret>');
console.log('Listening for incomming MPEG-TS Stream on http://127.0.0.1:'+STREAM_PORT+'/<secret>');
console.log('Listening for incomming jpg Stream on ws://127.0.0.1:'+UDP_PORT+'/<secret>');
console.log('Awaiting WebSocket connections on ws://127.0.0.1:'+WEBSOCKET_PORT+'/');
