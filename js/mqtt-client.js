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
        this.fallbackTried = false;            // 是否已尝试备用代理
    this.isReconnecting = false;           // 是否处于重连中
    this.disconnectRequested = false;      // 是否为用户主动断开
    this.closeDebounceTimer = null;        // 断开防抖计时器
        this.config = this.loadConfig();
        this.callbacks = {
            onConnect: null,
            onDisconnect: null,
            onMessage: null,
            onError: null
        };
        // 连接稳定性监控
        this._lastConnectAt = 0;
        this._connectsInWindow = 0;
        this._unstableWarned = false;
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

            // 若用户误用 ws 8083（EMQX 公共代理），自动升级为 wss 8084 提升稳定性
            try {
                const url = (config.brokerUrl || '').trim();
                if (/^ws:\/\/broker\.emqx\.io:8083(\/mqtt)?$/i.test(url)) {
                    config.brokerUrl = 'wss://broker.emqx.io:8084/mqtt';
                    this.log('检测到 ws://broker.emqx.io:8083，已自动切换到 wss://broker.emqx.io:8084/mqtt', 'info');
                }
            } catch {}

            const options = {
                clientId: config.clientId,
                clean: true,
                connectTimeout: 4000,
                reconnectPeriod: 1000,
                keepalive: 30, // 缩短 keepalive，减少中间设备空闲断开
                protocolVersion: 4, // 显式使用 MQTT 3.1.1 提升兼容性
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

            // 重置断开标志
            this.disconnectRequested = false;
            this.isReconnecting = false;
            if (this.closeDebounceTimer) {
                clearTimeout(this.closeDebounceTimer);
                this.closeDebounceTimer = null;
            }

            this.client = mqtt.connect(config.brokerUrl, options);
            console.log('MQTT客户端已创建');

            this.client.on('connect', () => {
                console.log('MQTT连接成功');
                this.isConnected = true;
                this.isReconnecting = false;
                if (this.closeDebounceTimer) {
                    clearTimeout(this.closeDebounceTimer);
                    this.closeDebounceTimer = null;
                }
                this.updateStatus('connected', '已连接');
                this.log(`成功连接到 ${config.brokerUrl}`, 'info');
                this.log(`使用 clientId: ${config.clientId}`, 'info');

                // 统计短时间内反复重连
                const now = Date.now();
                if (now - this._lastConnectAt < 7000) {
                    this._connectsInWindow++;
                } else {
                    this._connectsInWindow = 1;
                }
                this._lastConnectAt = now;

                if (this._connectsInWindow >= 3 && !this._unstableWarned) {
                    this._unstableWarned = true;
                    this.log('检测到连接频繁重置：请确认 clientId 唯一，避免与设备端重复；或尝试使用 WSS、公网备用代理。', 'warning');
                }

                // 订阅主题
                if (config.subscribeTopic && config.subscribeTopic.trim()) {
                    this.subscribe(config.subscribeTopic);
                }

                if (this.callbacks.onConnect) {
                    this.callbacks.onConnect();
                }
            });

            // 进入重连流程（socket 尚未连上）
            this.client.on('reconnect', () => {
                this.isReconnecting = true;
                this.updateStatus('connecting', '重连中...');
                this.log('连接中断，正在重连...', 'info');
            });

            // 标记离线（网络不可用/代理切断）
            this.client.on('offline', () => {
                this.log('MQTT已离线，等待网络恢复', 'info');
                this.updateStatus('connecting', '已离线，等待重连...');
            });

            this.client.on('error', (error) => {
                this.log(`连接错误: ${error.message}`, 'error');
                // 遇到公共代理 Not authorized 时，尝试一次备用代理
                if (!this.fallbackTried && /Not authorized/i.test(error.message || '')) {
                    this.fallbackTried = true;
                    try {
                        const current = (config.brokerUrl || '').trim();
                        // 仅当当前是 EMQX 公共代理时启用切换
                        if (/broker\.emqx\.io/i.test(current)) {
                            const fallback = 'wss://broker.hivemq.com:8884/mqtt';
                            this.log(`检测到 Not authorized，自动切换到备用代理: ${fallback}`, 'warning');

                            // 主动结束当前连接，再次调用 connect 走同样流程
                            try { this.client.end(true); } catch {}
                            this.client = null;
                            const newConfig = { ...config, brokerUrl: fallback };
                            // 微延时，避免立即复用同一底层 socket 资源
                            setTimeout(() => this.connect(newConfig), 200);
                            return;
                        }
                    } catch {}
                }
                this.updateStatus('disconnected', '连接错误');
                if (this.callbacks.onError) {
                    this.callbacks.onError(error);
                }
            });

            // 使用防抖逻辑处理 close：短暂掉线不触发 onDisconnect
            this.client.on('close', () => {
                this.isConnected = false;

                // 主动断开：立即通知
                if (this.disconnectRequested) {
                    this.updateStatus('disconnected', '未连接');
                    this.log('连接已断开', 'info');
                    this.stopHeartbeat();
                    if (this.callbacks.onDisconnect) {
                        this.callbacks.onDisconnect();
                    }
                    return;
                }

                // 正在重连：仅更新状态，不重置业务
                if (this.isReconnecting) {
                    this.updateStatus('connecting', '重连中...');
                    this.log('连接关闭，等待自动重连...', 'info');
                    return;
                }

                // 未标记重连的 close：开启防抖窗口，若窗口内未重新连接则判定为真正断开
                if (this.closeDebounceTimer) {
                    clearTimeout(this.closeDebounceTimer);
                }
                this.closeDebounceTimer = setTimeout(() => {
                    if (!this.isConnected) {
                        this.updateStatus('disconnected', '连接已断开');
                        this.log('连接已断开（超时未重连）', 'info');
                        this.stopHeartbeat();
                        if (this.callbacks.onDisconnect) {
                            this.callbacks.onDisconnect();
                        }
                    }
                }, 5000); // 5 秒防抖
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
        // 标记为主动断开
        this.disconnectRequested = true;
        this.isReconnecting = false;
        if (this.closeDebounceTimer) {
            clearTimeout(this.closeDebounceTimer);
            this.closeDebounceTimer = null;
        }
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
                const cfg = JSON.parse(saved);
                // 迁移逻辑：将旧的 ws://broker.emqx.io:8083/mqtt 升级为 wss
                try {
                    if (typeof cfg.brokerUrl === 'string') {
                        const url = cfg.brokerUrl.trim();
                        if (url.startsWith('ws://broker.emqx.io:8083')) {
                            cfg.brokerUrl = 'wss://broker.emqx.io:8084/mqtt';
                        }
                    }
                    // 如主题为空，则预填为用户提供的主题
                    if (!cfg.subscribeTopic || !cfg.subscribeTopic.trim()) cfg.subscribeTopic = 'esp32/test/mah1ro';
                    if (!cfg.publishTopic || !cfg.publishTopic.trim()) cfg.publishTopic = 'esp32/test/mah1ro';
                    if (!cfg.heartbeatTopic || !cfg.heartbeatTopic.trim()) cfg.heartbeatTopic = 'esp32/test/mah1ro';
                } catch {}
                return cfg;
            } catch (e) {
                this.log('加载配置失败，使用默认配置', 'error');
            }
        }
        
        // 默认配置（使用 WSS 与预填主题）
        return {
            brokerUrl: 'wss://broker.emqx.io:8084/mqtt',
            clientId: '',
            username: '',
            password: '',
            subscribeTopic: 'esp32/test/mah1ro',
            publishTopic: 'esp32/test/mah1ro',
            heartbeatInterval: 30,
            heartbeatTopic: 'esp32/test/mah1ro'
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
