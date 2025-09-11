# 测试用MQTT服务器配置

## 使用Node.js快速启动测试服务器

如果你想快速测试应用，可以使用以下Node.js脚本启动一个简单的MQTT服务器：

### 安装依赖
```bash
npm install mosca
```

### 服务器脚本 (mqtt-server.js)
```javascript
const mosca = require('mosca');

const settings = {
  port: 1883,
  backend: {
    type: 'memory'
  },
  http: {
    port: 8080,
    bundle: true,
    static: './'
  }
};

const server = new mosca.Server(settings);

server.on('ready', function() {
  console.log('MQTT服务器启动成功!');
  console.log('MQTT端口: 1883');
  console.log('WebSocket端口: 8080');
  console.log('访问地址: http://localhost:8080');
});

server.on('clientConnected', function(client) {
  console.log('客户端连接:', client.id);
});

server.on('published', function(packet, client) {
  if (client) {
    console.log('收到消息:', packet.topic, packet.payload.toString());
  }
});
```

### 启动服务器
```bash
node mqtt-server.js
```

然后在浏览器中使用以下配置：
- 服务器地址: `ws://localhost:8080`
- 其他参数按需配置

## 使用Docker快速启动

### EMQ X
```bash
docker run -d --name emqx -p 1883:1883 -p 8083:8083 -p 8084:8084 -p 8883:8883 -p 18083:18083 emqx/emqx:latest
```
- WebSocket地址: `ws://localhost:8083/mqtt`
- 管理界面: `http://localhost:18083` (admin/public)

### Mosquitto
```bash
# 创建配置文件
echo "listener 1883
listener 8083
protocol websockets" > mosquitto.conf

# 启动容器
docker run -it -p 1883:1883 -p 8083:8083 -v $(pwd)/mosquitto.conf:/mosquitto/config/mosquitto.conf eclipse-mosquitto
```
- WebSocket地址: `ws://localhost:8083`
