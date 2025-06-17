apt install redis nodejs npm
npm install -g nodemon
cd video-frame-server
npm install express multer ws redis
node server.js

sudo mv /usr/lib/python3.12/EXTERNALLY-MANAGED /usr/lib/python3.12/EXTERNALLY-MANAGED.bak
pip install opencv-python

redis 操作：
keys * 获取所有key
get key 取字符串值
HGETALL user:1000 取哈希的所有值
HGET user:1000 name 取哈希的所有值
LRANGE xxxxx:cameraIds 0 -1 获取列表的值

token生成规则
token=hash(ip,port,deviceNo)

userId：用户id（32位hash）抗暴力破解
deviceId：设备id（32位hash）抗暴力破解
cameraId：摄像头id（00-99）

udp
上传帧： deviceId+cameraId+imgData
















