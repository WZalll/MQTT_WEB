/**
 * 图表管理类
 */
class ChartManager {
    constructor(canvasId) {
        console.log('初始化图表管理器, canvasId:', canvasId);
        
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            console.error('找不到canvas元素:', canvasId);
            throw new Error(`找不到canvas元素: ${canvasId}`);
        }
        
        this.ctx = this.canvas.getContext('2d');
    this.chart = null;
    // 展示窗口：固定显示最近 60 秒；横轴每 5 秒一个刻度
    this.windowMs = 60 * 1000;
    this.slotMs = 5 * 1000;
    this.datasets = new Map(); // 存储多个数据系列（Chart.js 数据集）
    this.dataBuffers = new Map(); // 每个系列的原始数据缓冲：key -> [{t:number, v:number}]
        
        // 检查Chart.js是否可用
        if (typeof Chart === 'undefined') {
            console.error('Chart.js库未加载');
            throw new Error('Chart.js库未加载');
        }
        
        this.initChart();

        // 监听窗口尺寸与可见性变化，主动触发 resize
        window.addEventListener('resize', () => this.handleResize());
        document.addEventListener('visibilitychange', () => this.handleResize());

        // 使用 ResizeObserver 监听容器尺寸变化
        try {
            const container = this.canvas.parentElement || this.canvas;
            if (window.ResizeObserver && container) {
                this._ro = new ResizeObserver(() => this.handleResize());
                this._ro.observe(container);
            }
        } catch (e) {
            console.warn('ResizeObserver 不可用:', e);
        }
    }

    /**
     * 初始化图表
     */
    initChart() {
        console.log('开始初始化Chart.js图表');
        
        try {
            this.chart = new Chart(this.ctx, {
                type: 'line',
            data: {
                labels: [],
                datasets: []
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: '实时数据监控',
                        font: {
                            size: 16
                        }
                    },
                    legend: {
                        position: 'top',
                    }
                },
                scales: {
                    x: {
                        type: 'category',
                        title: {
                            display: true,
                            text: '时间 (最近60秒，5秒/格)'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: '数值'
                        },
                        beginAtZero: false
                    }
                },
                animation: {
                    duration: 0 // 禁用动画以提高性能
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                }
            }
        });
        
        console.log('Chart.js图表初始化成功');
    // 初始化一次窗口刻度
    try { this.rebuildWindow(); } catch {}
        
        } catch (error) {
            console.error('Chart.js图表初始化失败:', error);
            throw error;
        }
    }

    /**
     * 添加数据点
     */
    addDataPoint(timestamp, data) {
        // 统一为时间戳（毫秒）
        let t;
        if (!timestamp) t = Date.now();
        else if (typeof timestamp === 'string') t = new Date(timestamp).getTime();
        else if (typeof timestamp === 'number') t = timestamp;
        else t = timestamp.getTime ? timestamp.getTime() : Date.now();

        // 收集数值型条目
        let entries = [];
        if (typeof data === 'object' && data !== null) {
            entries = Object.entries(data).filter(([, v]) => typeof v === 'number' || !isNaN(parseFloat(v)));
        } else {
            entries = [['data', parseFloat(data) || 0]];
        }

        // 写入缓冲并裁剪到窗口范围
        const windowStart = Date.now() - this.windowMs;
        entries.forEach(([key, raw]) => {
            const v = parseFloat(raw);
            if (isNaN(v)) return;
            let buf = this.dataBuffers.get(key);
            if (!buf) {
                buf = [];
                this.dataBuffers.set(key, buf);
            }
            buf.push({ t, v });
            // 裁剪过期数据
            while (buf.length > 0 && buf[0].t < windowStart - this.slotMs) {
                buf.shift();
            }
        });

        // 重建窗口视图（标签与每系列数据对齐到 5s 槽）
        this.rebuildWindow();

        // 在下一帧强制一次尺寸校正与绘制，避免浏览器跳过重绘
        requestAnimationFrame(() => {
            try {
                if (this.chart) {
                    this.chart.resize();
                    this.chart.update();
                }
            } catch (e) { /* noop */ }
        });
    }

    /**
     * 添加多个数据系列
     */
    addMultipleDataPoints(timeLabel, dataObject) {
        // 保持兼容：转换为 addDataPoint 调用
        this.addDataPoint(timeLabel, dataObject);
    }

    /**
     * 添加单个数据点到指定系列
     */
    addSingleDataPoint(timeLabel, value, seriesName) {
        // 兼容旧接口：转换为统一入口
        this.addDataPoint(timeLabel, { [seriesName]: value });
    }

    /**
     * 创建新的数据系列
     */
    createDataset(name) {
        const colors = [
            'rgb(75, 192, 192)',   // 青色
            'rgb(255, 99, 132)',   // 红色
            'rgb(54, 162, 235)',   // 蓝色
            'rgb(255, 206, 86)',   // 黄色
            'rgb(153, 102, 255)',  // 紫色
            'rgb(255, 159, 64)',   // 橙色
            'rgb(199, 199, 199)',  // 灰色
            'rgb(83, 102, 255)'    // 深蓝色
        ];

        const colorIndex = this.datasets.size % colors.length;
        const color = colors[colorIndex];

        return {
            label: name,
            data: [],
            borderColor: color,
            backgroundColor: color + '20', // 添加透明度
            borderWidth: 2,
            fill: false,
            tension: 0.1,
            pointRadius: 3,
            pointHoverRadius: 5,
            spanGaps: true
        };
    }

    /**
     * 更新图表
     */
    updateChart() {
        // 安全刷新：如果 canvas 当前不可见或尺寸为 0，则稍后再强制 resize+update
        const needsDefer = !this.canvas.isConnected || this.canvas.offsetWidth === 0 || this.canvas.offsetHeight === 0;
        if (needsDefer) {
            requestAnimationFrame(() => {
                try {
                    if (this.chart) {
                        this.chart.resize();
                        this.chart.update();
                    }
                } catch (e) { console.warn('延迟刷新失败:', e); }
            });
        } else {
            this.chart.update('none');
        }
    }

    /**
     * 处理尺寸/可见性变化，强制图表自适应容器
     */
    handleResize() {
        try {
            if (this.chart) {
                this.chart.resize();
            }
        } catch (e) {
            console.warn('Chart resize 失败:', e);
        }
    }

    /**
     * 清空所有数据
     */
    clearData() {
        this.chart.data.labels = [];
        this.chart.data.datasets.forEach(dataset => {
            dataset.data = [];
        });
        this.chart.data.datasets = [];
        this.datasets.clear();
        this.updateChart();
    }

    /**
     * 设置最大数据点数量
     */
    setMaxDataPoints(maxPoints) {
    // 兼容旧接口：改为调整窗口显示的总槽数（每槽5秒）
    const totalSlots = Math.max(1, Math.floor(maxPoints));
    this.windowMs = totalSlots * this.slotMs;
    this.rebuildWindow();
    }

    /**
     * 格式化时间戳
     */
    formatTimestamp(timestamp) {
        if (!timestamp) {
            timestamp = new Date();
        } else if (typeof timestamp === 'string') {
            timestamp = new Date(timestamp);
        } else if (typeof timestamp === 'number') {
            timestamp = new Date(timestamp);
        }

        return timestamp.toISOString().replace('T', ' ').substr(0, 19);
    }

    // 生成短时间标签 HH:MM:SS
    _formatShort(tMs) {
        const d = new Date(tMs);
        const pad = (n) => String(n).padStart(2, '0');
        return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    // 重建 60s 窗口与 5s 槽数据
    rebuildWindow() {
        const now = Date.now();
        const start = now - this.windowMs;
        const startAligned = Math.floor(start / this.slotMs) * this.slotMs;
        const endAligned = Math.floor(now / this.slotMs) * this.slotMs;

        // 生成标签（包含起点到终点的所有 5s 槽）
        const labels = [];
        const slots = [];
        for (let t = startAligned; t <= endAligned; t += this.slotMs) {
            labels.push(this._formatShort(t));
            slots.push(t);
        }

        // 确保图上已有的系列与缓冲区中的系列并集
        const keys = new Set([
            ...Array.from(this.datasets.keys()),
            ...Array.from(this.dataBuffers.keys()),
        ]);

        // 更新/创建系列并填充数据
        keys.forEach((key) => {
            let ds = this.datasets.get(key);
            if (!ds) {
                ds = this.createDataset(key);
                this.datasets.set(key, ds);
                this.chart.data.datasets.push(ds);
            }

            const buf = this.dataBuffers.get(key) || [];
            const values = new Array(labels.length).fill(null);

            // 为每个槽选择该槽时间范围内的“最新”值
            let j = 0; // 指向缓冲区当前位置
            for (let i = 0; i < labels.length; i++) {
                const slotStart = slots[i];
                const slotEnd = slotStart + this.slotMs;
                let latest = null;
                while (j < buf.length && buf[j].t <= slotEnd) {
                    if (buf[j].t > slotStart) {
                        latest = buf[j].v;
                    }
                    j++;
                }
                if (latest !== null) values[i] = latest;
            }

            ds.data = values;
        });

        this.chart.data.labels = labels;

        // 自动计算Y轴建议范围（带10%边距）
        let minVal = Infinity;
        let maxVal = -Infinity;
        this.chart.data.datasets.forEach(ds => {
            ds.data.forEach(v => {
                if (v != null && !isNaN(v)) {
                    if (v < minVal) minVal = v;
                    if (v > maxVal) maxVal = v;
                }
            });
        });
        const yScale = this.chart.options.scales.y || {};
        if (isFinite(minVal) && isFinite(maxVal)) {
            const pad = (maxVal - minVal) * 0.1 || 1;
            yScale.suggestedMin = minVal - pad;
            yScale.suggestedMax = maxVal + pad;
        } else {
            // 无数据时移除限制，让Chart.js自行决定（默认0~1）
            delete yScale.suggestedMin;
            delete yScale.suggestedMax;
        }
        this.chart.options.scales.y = yScale;

        this.updateChart();
    }

    /**
     * 导出图表数据为CSV
     */
    exportToCSV() {
        if (this.chart.data.labels.length === 0) {
            alert('没有数据可导出');
            return;
        }

        let csvContent = 'Timestamp';
        
        // 添加列标题
        this.chart.data.datasets.forEach(dataset => {
            csvContent += ',' + dataset.label;
        });
        csvContent += '\n';

        // 添加数据行
        this.chart.data.labels.forEach((label, index) => {
            csvContent += label;
            this.chart.data.datasets.forEach(dataset => {
                const value = (dataset.data && dataset.data[index] != null) ? dataset.data[index] : '';
                csvContent += ',' + value;
            });
            csvContent += '\n';
        });

        // 下载CSV文件
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'mqtt_data_' + new Date().toISOString().substr(0, 10) + '.csv';
        link.click();
    }

    /**
     * 销毁图表
     */
    destroy() {
        if (this.chart) {
            this.chart.destroy();
            this.chart = null;
        }
        this.datasets.clear();
    }
}

// 导出给全局使用
window.ChartManager = ChartManager;
