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
            if (typeof Chart !== 'undefined' && document.getElementById('dataChart')) {
                this.chartManager = new ChartManager('dataChart');
                console.log('图表管理器创建成功');
            } else {
                // 提供一个空实现，避免后续调用报错
                this.chartManager = {
                    addDataPoint: () => {},
                    addSingleDataPoint: () => {},
                    clearData: () => {},
                    setMaxDataPoints: () => {},
                    exportToCSV: () => {},
                };
                console.warn('Chart.js 未加载或画布不可用，已使用空图表管理器');
            }
        } catch (error) {
            console.error('图表管理器创建失败:', error);
            // 兜底：即使异常，也提供空实现，保障后续逻辑不报错
            this.chartManager = {
                addDataPoint: () => {},
                addSingleDataPoint: () => {},
                clearData: () => {},
                setMaxDataPoints: () => {},
                exportToCSV: () => {},
            };
        }
        
        try {
            this.logger = new Logger();
            console.log('日志管理器创建成功');
        } catch (error) {
            console.error('日志管理器创建失败:', error);
        }
        
        this.isHeartbeatRunning = false;
        this.currentPage = 'dashboard';
        this.dataValues = {
            temperature: '--',
            humidity: '--',
            speed: '--',
            pressure: '--'
        };
        
        // 设备状态监控
        this.deviceStatus = {
            isOnline: false,
            lastHeartbeat: null,
            heartbeatCount: 0,
            onlineStartTime: null,
            heartbeatTimeout: null,
            heartbeatTimeoutDuration: 30000 // 30秒无心跳则认为离线
        };
        
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
        this.initNavigation();
        this.initDeviceMonitoring();
        console.log('应用初始化完成');
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        // 侧边栏切换
        const sidebarToggle = document.getElementById('sidebarToggle');
        if (sidebarToggle) {
            sidebarToggle.addEventListener('click', () => {
                this.toggleSidebar();
            });
        }

        // 导航链接
        const navLinks = document.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = link.dataset.page;
                this.switchPage(page);
            });
        });

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

        // 快速连接按钮
        const quickConnectBtn = document.getElementById('quickConnectBtn');
        if (quickConnectBtn) {
            quickConnectBtn.addEventListener('click', () => {
                this.switchPage('settings');
            });
        }

        // 配置管理
        const saveConfigBtn = document.getElementById('saveConfigBtn');
        if (saveConfigBtn) {
            saveConfigBtn.addEventListener('click', () => {
                this.saveConfig();
            });
        }

        const loadConfigBtn = document.getElementById('loadConfigBtn');
        if (loadConfigBtn) {
            loadConfigBtn.addEventListener('click', () => {
                this.loadSavedConfig();
            });
        }

        const randomClientIdBtn = document.getElementById('randomClientIdBtn');
        if (randomClientIdBtn) {
            randomClientIdBtn.addEventListener('click', () => {
                const input = document.getElementById('clientId');
                input.value = 'mqtt_web_client_' + Math.random().toString(16).slice(2, 10);
            });
        }

        const resetDefaultsBtn = document.getElementById('resetDefaultsBtn');
        if (resetDefaultsBtn) {
            resetDefaultsBtn.addEventListener('click', () => {
                try {
                    localStorage.removeItem('mqttConfig');
                    const defaults = this.mqttClient.loadConfig();
                    this.setConfigToForm(defaults);
                    this.logger.addLog('已重置为默认配置', 'info');
                } catch (e) {
                    console.error('重置默认配置失败:', e);
                }
            });
        }

        // 消息发送
        const sendControlBtn = document.getElementById('sendControlBtn');
        if (sendControlBtn) {
            sendControlBtn.addEventListener('click', () => {
                this.sendControlMessage();
            });
        }

        // 预设控制按钮
        const presetBtns = document.querySelectorAll('.preset-btn');
        presetBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const command = btn.dataset.command;
                this.sendPresetCommand(command);
            });
        });

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
        const startHeartbeatBtn = document.getElementById('startHeartbeatBtn');
        if (startHeartbeatBtn) {
            startHeartbeatBtn.addEventListener('click', () => {
                this.startHeartbeat();
            });
        }

        const stopHeartbeatBtn = document.getElementById('stopHeartbeatBtn');
        if (stopHeartbeatBtn) {
            stopHeartbeatBtn.addEventListener('click', () => {
                this.stopHeartbeat();
            });
        }

        // 日志控制
        const clearLogBtn = document.getElementById('clearLogBtn');
        if (clearLogBtn) {
            clearLogBtn.addEventListener('click', () => {
                this.logger.clearLog();
            });
        }

        // 回车发送消息
        const controlMessage = document.getElementById('controlMessage');
        if (controlMessage) {
            controlMessage.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.sendControlMessage();
                }
            });
        }
    }

    /**
     * 初始化导航
     */
    initNavigation() {
        this.switchPage('dashboard'); // 默认显示用户页面
    }

    /**
     * 切换侧边栏
     */
    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        const mainContent = document.getElementById('mainContent');
        
        sidebar.classList.toggle('collapsed');
        mainContent.classList.toggle('expanded');
    }

    /**
     * 切换页面
     */
    switchPage(pageName) {
        console.log('切换到页面:', pageName);
        
        // 隐藏所有页面
        const pages = document.querySelectorAll('.page');
        pages.forEach(page => page.classList.add('hidden'));
        
        // 显示目标页面
        const targetPage = document.getElementById(`${pageName}-page`);
        if (targetPage) {
            targetPage.classList.remove('hidden');
        }
        
        // 更新导航状态
        const navLinks = document.querySelectorAll('.nav-link');
        navLinks.forEach(link => link.classList.remove('active'));
        
        const activeLink = document.querySelector(`[data-page="${pageName}"]`);
        if (activeLink) {
            activeLink.classList.add('active');
        }
        
        this.currentPage = pageName;

        // 若切换到包含图表的页面，触发一次尺寸计算
        if (pageName === 'dashboard' && this.chartManager && this.chartManager.handleResize) {
            this.chartManager.handleResize();
        }
    }

    /**
     * 初始化设备监控
     */
    initDeviceMonitoring() {
        // 定期更新在线时长显示
        setInterval(() => {
            this.updateOnlineTime();
        }, 1000);
        
        // 初始化设备状态显示
        this.updateDeviceStatusUI();
    }

    /**
     * 更新设备状态UI
     */
    updateDeviceStatusUI() {
        const statusDot = document.getElementById('deviceStatusDot');
        const statusText = document.getElementById('deviceStatusText');
        const lastHeartbeat = document.getElementById('lastHeartbeat');
        const heartbeatCount = document.getElementById('heartbeatCount');
        
        if (!statusDot || !statusText) return;
        
        if (this.deviceStatus.isOnline) {
            statusDot.className = 'device-status-dot online';
            statusText.className = 'device-status-text online';
            statusText.textContent = '在线';
        } else {
            statusDot.className = 'device-status-dot';
            statusText.className = 'device-status-text';
            statusText.textContent = '离线';
        }
        
        if (lastHeartbeat) {
            lastHeartbeat.textContent = this.deviceStatus.lastHeartbeat || '--';
        }
        
        if (heartbeatCount) {
            heartbeatCount.textContent = this.deviceStatus.heartbeatCount || '--';
        }
    }

    /**
     * 更新在线时长
     */
    updateOnlineTime() {
        const onlineTimeElement = document.getElementById('onlineTime');
        if (!onlineTimeElement) return;
        
        if (this.deviceStatus.isOnline && this.deviceStatus.onlineStartTime) {
            const now = new Date();
            const onlineMs = now - this.deviceStatus.onlineStartTime;
            const onlineSeconds = Math.floor(onlineMs / 1000);
            const onlineMinutes = Math.floor(onlineSeconds / 60);
            const onlineHours = Math.floor(onlineMinutes / 60);
            
            if (onlineHours > 0) {
                onlineTimeElement.textContent = `${onlineHours}时${onlineMinutes % 60}分${onlineSeconds % 60}秒`;
            } else if (onlineMinutes > 0) {
                onlineTimeElement.textContent = `${onlineMinutes}分${onlineSeconds % 60}秒`;
            } else {
                onlineTimeElement.textContent = `${onlineSeconds}秒`;
            }
        } else {
            onlineTimeElement.textContent = '--';
        }
    }

    /**
     * 处理设备上线
     */
    handleDeviceOnline() {
        console.log('设备上线');
        
        if (!this.deviceStatus.isOnline) {
            this.deviceStatus.isOnline = true;
            this.deviceStatus.onlineStartTime = new Date();
            this.deviceStatus.heartbeatCount = 0;
            this.updateDeviceStatusUI();
            this.logger.addLog('设备已上线', 'success');
        }
        
        // 重置心跳超时
        this.resetHeartbeatTimeout();
    }

    /**
     * 处理设备心跳
     */
    handleDeviceHeartbeat(heartbeatData) {
        console.log('收到设备心跳:', heartbeatData);
        
        // 确保设备在线
        if (!this.deviceStatus.isOnline) {
            this.handleDeviceOnline();
        }
        
        // 更新心跳信息
        this.deviceStatus.lastHeartbeat = new Date().toLocaleTimeString();
        this.deviceStatus.heartbeatCount++;
        
        // 重置心跳超时
        this.resetHeartbeatTimeout();
        
        // 更新UI
        this.updateDeviceStatusUI();
    }

    /**
     * 重置心跳超时定时器
     */
    resetHeartbeatTimeout() {
        // 清除现有定时器
        if (this.deviceStatus.heartbeatTimeout) {
            clearTimeout(this.deviceStatus.heartbeatTimeout);
        }
        
        // 设置新的超时定时器
        this.deviceStatus.heartbeatTimeout = setTimeout(() => {
            this.handleDeviceOffline();
        }, this.deviceStatus.heartbeatTimeoutDuration);
    }

    /**
     * 处理设备离线
     */
    handleDeviceOffline() {
        console.log('设备离线');
        
        this.deviceStatus.isOnline = false;
        this.deviceStatus.onlineStartTime = null;
        this.deviceStatus.lastHeartbeat = null;
        
        this.updateDeviceStatusUI();
        this.logger.addLog('设备已离线（心跳超时）', 'warning');
        
        // 清除超时定时器
        if (this.deviceStatus.heartbeatTimeout) {
            clearTimeout(this.deviceStatus.heartbeatTimeout);
            this.deviceStatus.heartbeatTimeout = null;
        }
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
        const connectBtn = document.getElementById('connectBtn');
        const disconnectBtn = document.getElementById('disconnectBtn');
        const sendControlBtn = document.getElementById('sendControlBtn');
        const startHeartbeatBtn = document.getElementById('startHeartbeatBtn');
        const quickConnectBtn = document.getElementById('quickConnectBtn');
        
        if (connectBtn) connectBtn.disabled = true;
        if (disconnectBtn) disconnectBtn.disabled = false;
        if (sendControlBtn) sendControlBtn.disabled = false;
        if (startHeartbeatBtn) startHeartbeatBtn.disabled = false;
        if (quickConnectBtn) {
            quickConnectBtn.disabled = true;
            quickConnectBtn.textContent = '已连接';
        }
        
        // 启用预设按钮
        const presetBtns = document.querySelectorAll('.preset-btn');
        presetBtns.forEach(btn => btn.disabled = false);
    }

    /**
     * MQTT断开连接回调
     */
    onMQTTDisconnected() {
        // 更新按钮状态
        const connectBtn = document.getElementById('connectBtn');
        const disconnectBtn = document.getElementById('disconnectBtn');
        const sendControlBtn = document.getElementById('sendControlBtn');
        const startHeartbeatBtn = document.getElementById('startHeartbeatBtn');
        const stopHeartbeatBtn = document.getElementById('stopHeartbeatBtn');
        const quickConnectBtn = document.getElementById('quickConnectBtn');
        
        if (connectBtn) connectBtn.disabled = false;
        if (disconnectBtn) disconnectBtn.disabled = true;
        if (sendControlBtn) sendControlBtn.disabled = true;
        if (startHeartbeatBtn) startHeartbeatBtn.disabled = true;
        if (stopHeartbeatBtn) stopHeartbeatBtn.disabled = true;
        if (quickConnectBtn) {
            quickConnectBtn.disabled = false;
            quickConnectBtn.textContent = '快速连接';
        }
        
        // 禁用预设按钮
        const presetBtns = document.querySelectorAll('.preset-btn');
        presetBtns.forEach(btn => btn.disabled = true);
        
        this.isHeartbeatRunning = false;
        
        // 重置设备状态
        this.resetDeviceStatus();
    }

    /**
     * 重置设备状态
     */
    resetDeviceStatus() {
        // 清除心跳超时定时器
        if (this.deviceStatus.heartbeatTimeout) {
            clearTimeout(this.deviceStatus.heartbeatTimeout);
            this.deviceStatus.heartbeatTimeout = null;
        }
        
        // 重置状态
        this.deviceStatus.isOnline = false;
        this.deviceStatus.lastHeartbeat = null;
        this.deviceStatus.heartbeatCount = 0;
        this.deviceStatus.onlineStartTime = null;
        
        // 更新UI
        this.updateDeviceStatusUI();
        
        console.log('设备状态已重置');
    }

    /**
     * MQTT消息接收回调
     */
    onMQTTMessage(topic, data) {
        // 解析和处理消息
        this.parseAndProcessMessage(data);
    }

    /**
     * 解析并处理收到的消息
     */
    parseAndProcessMessage(data) {
        const timestamp = new Date();
        let parsedData = {};

        if (typeof data === 'string') {
            const lowerCaseData = data.toLowerCase();
            if (lowerCaseData.includes('hello from esp32') || lowerCaseData.includes('connected') || lowerCaseData.includes('device online')) {
                this.handleDeviceOnline();
                return;
            }
            if (lowerCaseData.includes('heartbeat') || lowerCaseData.includes('ping') || lowerCaseData.includes('alive')) {
                this.handleDeviceHeartbeat(data);
            } else {
                this.handleDeviceOnline();
            }

            const regex = /(\w+)\s*=\s*([\d.-]+)/g;
            let match;
            let foundData = false;
            while ((match = regex.exec(data)) !== null) {
                foundData = true;
                const key = match[1].toLowerCase();
                const value = parseFloat(match[2]);
                parsedData[key] = value;
            }

            if (foundData) {
                this.updateDataCards(parsedData);
                // 调试日志：展示解析到的键值
                try { this.logger.addLog('解析数据: ' + JSON.stringify(parsedData), 'info'); } catch (e) { console.log('解析数据', parsedData); }
                // 统一触发绘图：一次性添加多个数据点
                this.chartManager.addDataPoint(timestamp, parsedData);
            }
        } else if (typeof data === 'object' && data !== null) {
            this.handleDeviceOnline();
            if (data.type === 'heartbeat' || data.status === 'alive') {
                this.handleDeviceHeartbeat(data);
            }
            this.updateDataCards(data);

            const jsonTimestamp = data.timestamp || data.time || timestamp;
            // 仅抽取数值字段
            const numericOnly = {};
            for (const key in data) {
                if (typeof data[key] === 'number') {
                    numericOnly[key] = data[key];
                }
            }
            if (Object.keys(numericOnly).length > 0) {
                this.chartManager.addDataPoint(jsonTimestamp, numericOnly);
            }
        }
    }

    /**
     * 更新数据卡片
     */
    updateDataCards(data) {
        if (typeof data !== 'object' || data === null) return;

        // 关键修复：为 temperature 添加 'temp' 作为别名
        const keyMap = {
            temperature: ['temperature', 'temp'],
            humidity: ['humidity'],
            speed: ['speed'],
            pressure: ['pressure']
        };

        for (const cardType in keyMap) {
            for (const key of keyMap[cardType]) {
                if (data[key] !== undefined) {
                    this.updateDataCard(cardType, data[key]);
                    break; 
                }
            }
        }
    }

    /**
     * 更新单个数据卡片
     */
    updateDataCard(type, value) {
        const element = document.getElementById(`${type}Value`);
        if (element) {
            element.textContent = value;
            this.dataValues[type] = value;
        }
    }

    /**
     * 发送预设命令
     */
    sendPresetCommand(commandJson) {
        try {
            const command = JSON.parse(commandJson);
            const topic = document.getElementById('publishTopic').value.trim();
            
            if (!topic) {
                alert('请先设置发布主题');
                return;
            }
            
            const success = this.mqttClient.publish(topic, command);
            if (success) {
                this.logger.addLog(`发送预设命令: ${commandJson}`, 'sent');
            }
        } catch (error) {
            console.error('预设命令格式错误:', error);
            alert('预设命令格式错误');
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
        
        // 更新按钮状态
        const startBtn = document.getElementById('startHeartbeatBtn');
        const stopBtn = document.getElementById('stopHeartbeatBtn');
        
        if (startBtn) startBtn.disabled = true;
        if (stopBtn) stopBtn.disabled = false;
    }

    /**
     * 停止心跳
     */
    stopHeartbeat() {
        this.mqttClient.stopHeartbeat();
        this.isHeartbeatRunning = false;
        
        // 更新按钮状态
        const startBtn = document.getElementById('startHeartbeatBtn');
        const stopBtn = document.getElementById('stopHeartbeatBtn');
        
        if (startBtn) startBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = true;
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
