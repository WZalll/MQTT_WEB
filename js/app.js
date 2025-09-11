/**
 * 主应用程序
 */
class App {
    constructor() {
        console.log('开始初始化App...');
        
        try {
            this.mqttClient = new MQTTClient();
            console.log('MQTT客户端创建成功');
        } catch (error) {
            console.error('MQTT客户端创建失败:', error);
        }
        
        try {
            this.chartManager = new ChartManager('dataChart');
            console.log('图表管理器创建成功');
        } catch (error) {
            console.error('图表管理器创建失败:', error);
        }
        
        try {
            this.logger = new Logger();
            console.log('日志管理器创建成功');
        } catch (error) {
            console.error('日志管理器创建失败:', error);
        }
        
        this.isHeartbeatRunning = false;
        
        // 将logger设置为全局变量供其他模块使用
        window.logger = this.logger;
        
        this.init();
    }

    /**
     * 初始化应用
     */
    init() {
        console.log('开始初始化应用...');
        this.bindEvents();
        this.loadSavedConfig();
        this.setupMQTTCallbacks();
        console.log('应用初始化完成');
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        // MQTT连接控制
        const connectBtn = document.getElementById('connectBtn');
        if (connectBtn) {
            connectBtn.addEventListener('click', () => {
                console.log('连接按钮被点击');
                this.connectMQTT();
            });
        } else {
            console.error('找不到连接按钮元素');
        }

        const disconnectBtn = document.getElementById('disconnectBtn');
        if (disconnectBtn) {
            disconnectBtn.addEventListener('click', () => {
                console.log('断开按钮被点击');
                this.disconnectMQTT();
            });
        }

        // 配置管理
        document.getElementById('saveConfigBtn').addEventListener('click', () => {
            this.saveConfig();
        });

        document.getElementById('loadConfigBtn').addEventListener('click', () => {
            this.loadSavedConfig();
        });

        // 消息发送
        document.getElementById('sendControlBtn').addEventListener('click', () => {
            this.sendControlMessage();
        });

        // 心跳控制
        document.getElementById('startHeartbeatBtn').addEventListener('click', () => {
            this.startHeartbeat();
        });

        document.getElementById('stopHeartbeatBtn').addEventListener('click', () => {
            this.stopHeartbeat();
        });

        // 日志控制
        document.getElementById('clearLogBtn').addEventListener('click', () => {
            this.logger.clearLog();
        });

        // 回车发送消息
        document.getElementById('controlMessage').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendControlMessage();
            }
        });
    }

    /**
     * 设置MQTT回调
     */
    setupMQTTCallbacks() {
        this.mqttClient.setCallbacks({
            onConnect: () => {
                this.onMQTTConnected();
            },
            onDisconnect: () => {
                this.onMQTTDisconnected();
            },
            onMessage: (topic, data) => {
                this.onMQTTMessage(topic, data);
            },
            onError: (error) => {
                this.logger.addLog(`MQTT错误: ${error.message}`, 'error');
            }
        });
    }

    /**
     * MQTT连接成功回调
     */
    onMQTTConnected() {
        // 更新按钮状态
        document.getElementById('connectBtn').disabled = true;
        document.getElementById('disconnectBtn').disabled = false;
        document.getElementById('sendControlBtn').disabled = false;
        document.getElementById('startHeartbeatBtn').disabled = false;
    }

    /**
     * MQTT断开连接回调
     */
    onMQTTDisconnected() {
        // 更新按钮状态
        document.getElementById('connectBtn').disabled = false;
        document.getElementById('disconnectBtn').disabled = true;
        document.getElementById('sendControlBtn').disabled = true;
        document.getElementById('startHeartbeatBtn').disabled = true;
        document.getElementById('stopHeartbeatBtn').disabled = true;
        
        this.isHeartbeatRunning = false;
    }

    /**
     * MQTT消息接收回调
     */
    onMQTTMessage(topic, data) {
        // 如果数据包含时间戳和数值，添加到图表
        if (typeof data === 'object' && data !== null) {
            // 尝试找到数值数据
            const timestamp = data.timestamp || data.time || new Date().toISOString();
            
            // 提取数值字段
            const numericData = {};
            Object.entries(data).forEach(([key, value]) => {
                if (typeof value === 'number' || (!isNaN(parseFloat(value)) && key !== 'timestamp' && key !== 'time')) {
                    numericData[key] = value;
                }
            });

            if (Object.keys(numericData).length > 0) {
                this.chartManager.addDataPoint(timestamp, numericData);
            }
        } else if (typeof data === 'number' || !isNaN(parseFloat(data))) {
            // 纯数值数据
            this.chartManager.addDataPoint(new Date(), parseFloat(data));
        }
    }

    /**
     * 连接MQTT
     */
    connectMQTT() {
        console.log('开始连接MQTT...');
        
        // 检查MQTT库是否加载
        if (typeof mqtt === 'undefined') {
            console.error('MQTT.js库未加载');
            alert('MQTT.js库未加载，请检查网络连接');
            return;
        }
        
        const config = this.getConfigFromForm();
        console.log('MQTT配置:', config);
        
        if (!config.brokerUrl) {
            alert('请填写服务器地址');
            return;
        }
        
        this.mqttClient.connect(config);
    }

    /**
     * 断开MQTT连接
     */
    disconnectMQTT() {
        this.mqttClient.disconnect();
    }

    /**
     * 从表单获取配置
     */
    getConfigFromForm() {
        return {
            brokerUrl: document.getElementById('brokerUrl').value.trim(),
            clientId: document.getElementById('clientId').value.trim(),
            username: document.getElementById('username').value.trim(),
            password: document.getElementById('password').value.trim(),
            subscribeTopic: document.getElementById('subscribeTopic').value.trim(),
            publishTopic: document.getElementById('publishTopic').value.trim(),
            heartbeatInterval: parseInt(document.getElementById('heartbeatInterval').value) || 30,
            heartbeatTopic: document.getElementById('heartbeatTopic').value.trim()
        };
    }

    /**
     * 将配置填入表单
     */
    setConfigToForm(config) {
        document.getElementById('brokerUrl').value = config.brokerUrl || '';
        document.getElementById('clientId').value = config.clientId || '';
        document.getElementById('username').value = config.username || '';
        document.getElementById('password').value = config.password || '';
        document.getElementById('subscribeTopic').value = config.subscribeTopic || '';
        document.getElementById('publishTopic').value = config.publishTopic || '';
        document.getElementById('heartbeatInterval').value = config.heartbeatInterval || 30;
        document.getElementById('heartbeatTopic').value = config.heartbeatTopic || '';
    }

    /**
     * 保存配置
     */
    saveConfig() {
        const config = this.getConfigFromForm();
        this.mqttClient.saveConfig(config);
    }

    /**
     * 加载保存的配置
     */
    loadSavedConfig() {
        const config = this.mqttClient.loadConfig();
        this.setConfigToForm(config);
    }

    /**
     * 发送控制消息
     */
    sendControlMessage() {
        const message = document.getElementById('controlMessage').value.trim();
        const topic = document.getElementById('publishTopic').value.trim();

        if (!message || !topic) {
            alert('请输入消息内容和发布主题');
            return;
        }

        // 尝试解析为JSON，如果失败则作为普通字符串发送
        let messageToSend;
        try {
            messageToSend = JSON.parse(message);
        } catch (e) {
            messageToSend = message;
        }

        const success = this.mqttClient.publish(topic, messageToSend);
        if (success) {
            // 清空输入框
            document.getElementById('controlMessage').value = '';
        }
    }

    /**
     * 启动心跳
     */
    startHeartbeat() {
        if (this.isHeartbeatRunning) {
            return;
        }

        const interval = parseInt(document.getElementById('heartbeatInterval').value) || 30;
        const topic = document.getElementById('heartbeatTopic').value.trim();

        if (!topic) {
            alert('请设置心跳主题');
            return;
        }

        this.mqttClient.startHeartbeat(interval, topic);
        this.isHeartbeatRunning = true;
        
        document.getElementById('startHeartbeatBtn').disabled = true;
        document.getElementById('stopHeartbeatBtn').disabled = false;
    }

    /**
     * 停止心跳
     */
    stopHeartbeat() {
        this.mqttClient.stopHeartbeat();
        this.isHeartbeatRunning = false;
        
        document.getElementById('startHeartbeatBtn').disabled = false;
        document.getElementById('stopHeartbeatBtn').disabled = true;
    }
}

/**
 * 日志管理类
 */
class Logger {
    constructor() {
        console.log('初始化日志管理器');
        
        this.container = document.getElementById('logContainer');
        if (!this.container) {
            console.error('找不到日志容器元素');
            throw new Error('找不到日志容器元素');
        }
        
        this.autoScroll = document.getElementById('autoScroll');
        if (!this.autoScroll) {
            console.error('找不到自动滚动复选框元素');
            throw new Error('找不到自动滚动复选框元素');
        }
        
        this.maxLogs = 1000; // 最大日志条数
        console.log('日志管理器初始化完成');
    }

    /**
     * 添加日志
     */
    addLog(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${type}`;
        
        logEntry.innerHTML = `
            <span class="log-timestamp">${timestamp}</span>
            ${this.escapeHtml(message)}
        `;

        this.container.appendChild(logEntry);

        // 限制日志数量
        while (this.container.children.length > this.maxLogs) {
            this.container.removeChild(this.container.firstChild);
        }

        // 自动滚动
        if (this.autoScroll.checked) {
            this.container.scrollTop = this.container.scrollHeight;
        }
    }

    /**
     * 清空日志
     */
    clearLog() {
        this.container.innerHTML = '';
    }

    /**
     * HTML转义
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// 页面加载完成后初始化应用
document.addEventListener('DOMContentLoaded', () => {
    console.log('页面DOM加载完成');
    
    // 检查必要的库是否加载
    if (typeof mqtt === 'undefined') {
        console.error('MQTT.js库未加载！');
    } else {
        console.log('MQTT.js库已加载');
    }
    
    if (typeof Chart === 'undefined') {
        console.error('Chart.js库未加载！');
    } else {
        console.log('Chart.js库已加载');
    }
    
    // 初始化应用
    try {
        window.app = new App();
        console.log('应用初始化成功');
    } catch (error) {
        console.error('应用初始化失败:', error);
    }
});

// 页面关闭前断开MQTT连接
window.addEventListener('beforeunload', () => {
    if (window.app && window.app.mqttClient) {
        window.app.mqttClient.disconnect();
    }
});
