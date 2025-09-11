/**
 * MQTT客户端管理类
 */
class MQTTClient {
    constructor() {
        console.log('初始化MQTT客户端');
        this.client = null;
        this.isConnected = false;
        this.heartbeatInterval = null;
        this.heartbeatTimer = null;
        this.config = this.loadConfig();
        this.callbacks = {
            onConnect: null,
            onDisconnect: null,
            onMessage: null,
            onError: null
        };
        console.log('MQTT客户端初始化完成');
    }

    /**
     * 设置回调函数
     */
    setCallbacks(callbacks) {
        Object.assign(this.callbacks, callbacks);
    }

    /**
     * 连接MQTT服务器
     */
    async connect(config) {
        console.log('MQTT客户端开始连接:', config);
        
        if (this.isConnected) {
            this.log('已经连接到MQTT服务器', 'info');
            return;
        }

        try {
            this.updateStatus('connecting', '连接中...');
            console.log('更新状态为连接中...');
            
            // 生成客户端ID（如果为空）
            if (!config.clientId.trim()) {
                config.clientId = 'mqtt_web_client_' + Math.random().toString(16).substr(2, 8);
            }

            const options = {
                clientId: config.clientId,
                clean: true,
                connectTimeout: 4000,
                reconnectPeriod: 1000,
            };

            // 添加用户名和密码（如果提供）
            if (config.username && config.username.trim()) {
                options.username = config.username;
            }
            if (config.password && config.password.trim()) {
                options.password = config.password;
            }

            console.log('MQTT连接选项:', options);
            console.log('尝试连接到:', config.brokerUrl);

            this.client = mqtt.connect(config.brokerUrl, options);
            console.log('MQTT客户端已创建');

            this.client.on('connect', () => {
                console.log('MQTT连接成功');
                this.isConnected = true;
                this.updateStatus('connected', '已连接');
                this.log(`成功连接到 ${config.brokerUrl}`, 'info');

                // 订阅主题
                if (config.subscribeTopic && config.subscribeTopic.trim()) {
                    this.subscribe(config.subscribeTopic);
                }

                if (this.callbacks.onConnect) {
                    this.callbacks.onConnect();
                }
            });

            this.client.on('error', (error) => {
                this.log(`连接错误: ${error.message}`, 'error');
                this.updateStatus('disconnected', '连接错误');
                if (this.callbacks.onError) {
                    this.callbacks.onError(error);
                }
            });

            this.client.on('close', () => {
                this.isConnected = false;
                this.updateStatus('disconnected', '连接已断开');
                this.log('连接已断开', 'info');
                this.stopHeartbeat();
                if (this.callbacks.onDisconnect) {
                    this.callbacks.onDisconnect();
                }
            });

            this.client.on('message', (topic, message) => {
                const messageStr = message.toString();
                this.log(`收到消息 [${topic}]: ${messageStr}`, 'received');
                
                if (this.callbacks.onMessage) {
                    try {
                        const data = JSON.parse(messageStr);
                        this.callbacks.onMessage(topic, data);
                    } catch (e) {
                        this.callbacks.onMessage(topic, messageStr);
                    }
                }
            });

        } catch (error) {
            this.log(`连接失败: ${error.message}`, 'error');
            this.updateStatus('disconnected', '连接失败');
        }
    }

    /**
     * 断开连接
     */
    disconnect() {
        if (this.client) {
            this.client.end();
            this.client = null;
        }
        this.isConnected = false;
        this.stopHeartbeat();
        this.updateStatus('disconnected', '未连接');
    }

    /**
     * 订阅主题
     */
    subscribe(topic) {
        if (!this.isConnected || !this.client) {
            this.log('未连接到MQTT服务器', 'error');
            return;
        }

        this.client.subscribe(topic, (error) => {
            if (error) {
                this.log(`订阅失败 [${topic}]: ${error.message}`, 'error');
            } else {
                this.log(`成功订阅主题: ${topic}`, 'info');
            }
        });
    }

    /**
     * 取消订阅
     */
    unsubscribe(topic) {
        if (!this.isConnected || !this.client) {
            this.log('未连接到MQTT服务器', 'error');
            return;
        }

        this.client.unsubscribe(topic, (error) => {
            if (error) {
                this.log(`取消订阅失败 [${topic}]: ${error.message}`, 'error');
            } else {
                this.log(`成功取消订阅主题: ${topic}`, 'info');
            }
        });
    }

    /**
     * 发布消息
     */
    publish(topic, message, qos = 0) {
        if (!this.isConnected || !this.client) {
            this.log('未连接到MQTT服务器，无法发送消息', 'error');
            return false;
        }

        const messageStr = typeof message === 'object' ? JSON.stringify(message) : message;
        
        this.client.publish(topic, messageStr, { qos }, (error) => {
            if (error) {
                this.log(`发送失败 [${topic}]: ${error.message}`, 'error');
            } else {
                this.log(`发送消息 [${topic}]: ${messageStr}`, 'sent');
            }
        });

        return true;
    }

    /**
     * 启动心跳
     */
    startHeartbeat(intervalSeconds, topic) {
        this.stopHeartbeat(); // 先停止现有的心跳

        this.heartbeatInterval = intervalSeconds * 1000;
        this.heartbeatTimer = setInterval(() => {
            const heartbeatMessage = {
                timestamp: new Date().toISOString(),
                clientId: this.config.clientId,
                status: 'alive'
            };
            this.publish(topic, heartbeatMessage);
        }, this.heartbeatInterval);

        this.log(`心跳已启动，间隔: ${intervalSeconds}秒`, 'info');
    }

    /**
     * 停止心跳
     */
    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
            this.log('心跳已停止', 'info');
        }
    }

    /**
     * 保存配置到本地存储
     */
    saveConfig(config) {
        localStorage.setItem('mqttConfig', JSON.stringify(config));
        this.config = config;
        this.log('配置已保存', 'info');
    }

    /**
     * 从本地存储加载配置
     */
    loadConfig() {
        const saved = localStorage.getItem('mqttConfig');
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (e) {
                this.log('加载配置失败，使用默认配置', 'error');
            }
        }
        
        // 默认配置
        return {
            brokerUrl: 'ws://broker.emqx.io:8083/mqtt',
            clientId: '',
            username: '',
            password: '',
            subscribeTopic: 'device/data',
            publishTopic: 'device/control',
            heartbeatInterval: 30,
            heartbeatTopic: 'device/heartbeat'
        };
    }

    /**
     * 更新连接状态显示
     */
    updateStatus(status, text) {
        const indicator = document.getElementById('statusIndicator');
        const statusText = document.getElementById('statusText');
        
        if (indicator && statusText) {
            indicator.className = `status-indicator ${status}`;
            statusText.textContent = text;
        }
    }

    /**
     * 记录日志
     */
    log(message, type = 'info') {
        if (window.logger) {
            window.logger.addLog(message, type);
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }
}

// 导出给全局使用
window.MQTTClient = MQTTClient;
