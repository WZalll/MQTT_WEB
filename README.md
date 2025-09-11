# MQTT数据监控面板

一个基于Web的MQTT数据监控应用，支持实时数据可视化、MQTT参数配置、连接状态监控和心跳功能。

## 功能特性

### 🔌 MQTT连接管理
- 支持WebSocket over MQTT连接
- 可配置服务器地址、客户端ID、用户名密码
- 实时显示连接状态
- 自动重连机制

### 📊 实时数据可视化
- 基于Chart.js的实时图表展示
- 支持多条数据曲线同时显示
- 自动解析JSON数据中的数值字段
- 可配置最大数据点数量
- 支持数据导出为CSV格式

### ⚙️ MQTT参数配置
- 类似MQTTX的配置界面
- 支持订阅/发布主题配置
- 配置数据本地存储
- 一键保存/加载配置

### 💓 心跳机制
- 可配置心跳间隔时间
- 自定义心跳主题
- 自动发送心跳消息
- 启动/停止心跳控制

### 📝 消息日志
- 实时显示收发消息
- 不同类型消息颜色区分
- 自动滚动和手动控制
- 可清空日志历史

## 技术栈

- **前端**: HTML5 + CSS3 + JavaScript (ES6+)
- **图表**: Chart.js
- **MQTT**: MQTT.js
- **存储**: localStorage
- **样式**: 原生CSS（响应式设计）

## 安装使用

### 1. 直接使用（推荐）
1. 下载所有文件到本地文件夹
2. 用浏览器打开 `index.html` 即可使用
3. 无需安装任何依赖或服务器

### 2. 本地服务器运行
```bash
# Python 3
python -m http.server 8000

# Node.js (需要先安装http-server: npm install -g http-server)
http-server

# 或使用任何其他静态文件服务器
```

然后访问 `http://localhost:8000`

## MQTT服务器要求

### WebSocket支持
MQTT服务器必须支持WebSocket协议，常见配置：
- **EMQ X**: 默认WebSocket端口8083
- **Mosquitto**: 需要配置WebSocket监听器
- **HiveMQ**: 支持WebSocket over MQTT

### Mosquitto WebSocket配置示例
```conf
# mosquitto.conf
listener 1883
protocol mqtt

listener 8083
protocol websockets
```

## 使用说明

### 1. 配置MQTT连接
1. 填写服务器地址 (格式: `ws://ip:port/mqtt`)
2. 设置客户端ID（可留空自动生成）
3. 配置用户名密码（可选）
4. 设置订阅和发布主题

### 2. 连接服务器
1. 点击"连接"按钮
2. 观察连接状态指示器
3. 连接成功后可进行数据收发

### 3. 数据监控
- 应用会自动解析接收到的JSON数据
- 数值字段将自动添加到图表
- 支持的数据格式示例：
```json
{
  "timestamp": "2025-01-01T12:00:00Z",
  "temperature": 25.6,
  "humidity": 60.2,
  "pressure": 1013.25
}
```

### 4. 发送控制消息
1. 在控制消息框输入JSON或文本
2. 点击"发送"按钮或按回车键
3. 消息将发送到配置的发布主题

### 5. 心跳设置
1. 设置心跳间隔（秒）
2. 配置心跳主题
3. 点击"启动心跳"开始定时发送

## 数据格式说明

### 接收数据格式
应用支持以下数据格式：

1. **纯数值**:
```
25.6
```

2. **JSON对象**（推荐）:
```json
{
  "timestamp": "2025-01-01T12:00:00Z",
  "value": 25.6
}
```

3. **多值JSON对象**:
```json
{
  "timestamp": "2025-01-01T12:00:00Z",
  "temperature": 25.6,
  "humidity": 60.2,
  "pressure": 1013.25
}
```

### 心跳消息格式
```json
{
  "timestamp": "2025-01-01T12:00:00Z",
  "clientId": "mqtt_web_client_abc123",
  "status": "alive"
}
```

## 浏览器兼容性

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## 项目结构
```
├── index.html              # 主页面
├── css/
│   └── style.css          # 样式文件
├── js/
│   ├── app.js             # 主应用逻辑
│   ├── mqtt-client.js     # MQTT客户端封装
│   └── chart-manager.js   # 图表管理
└── README.md              # 说明文档
```

## 配置示例

### EMQ X服务器
```
服务器地址: ws://localhost:8083/mqtt
订阅主题: device/+/data
发布主题: device/001/control
心跳主题: device/001/heartbeat
```

### Mosquitto服务器
```
服务器地址: ws://localhost:8083
订阅主题: sensors/data
发布主题: actuators/control
心跳主题: system/heartbeat
```

## 故障排除

### 1. 无法连接MQTT服务器
- 检查服务器地址格式是否正确
- 确认MQTT服务器支持WebSocket
- 检查防火墙设置
- 验证用户名密码

### 2. 图表不显示数据
- 确认接收到的数据包含数值字段
- 检查数据格式是否正确
- 查看浏览器控制台错误信息

### 3. 心跳不工作
- 确认已成功连接MQTT服务器
- 检查心跳主题设置
- 查看日志中的心跳发送记录

## 扩展功能

### 添加新的数据处理
可以在 `app.js` 的 `onMQTTMessage` 方法中添加自定义数据处理逻辑：

```javascript
onMQTTMessage(topic, data) {
    // 自定义数据处理
    if (topic.includes('alarm')) {
        this.handleAlarmData(data);
    }
    
    // 原有的图表更新逻辑
    // ...
}
```

### 自定义图表类型
可以在 `chart-manager.js` 中修改图表类型：

```javascript
this.chart = new Chart(this.ctx, {
    type: 'bar', // 改为柱状图
    // 其他配置...
});
```

## 开源协议

MIT License

## 技术支持

如有问题或建议，请查看项目文档或提交Issue。
