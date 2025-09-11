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
        this.maxDataPoints = 50; // 最大数据点数量
        this.datasets = new Map(); // 存储多个数据系列
        
        // 检查Chart.js是否可用
        if (typeof Chart === 'undefined') {
            console.error('Chart.js库未加载');
            throw new Error('Chart.js库未加载');
        }
        
        this.initChart();
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
                        type: 'linear',
                        title: {
                            display: true,
                            text: '时间'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: '数值'
                        },
                        beginAtZero: true
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
        
        } catch (error) {
            console.error('Chart.js图表初始化失败:', error);
            throw error;
        }
    }

    /**
     * 添加数据点
     */
    addDataPoint(timestamp, data) {
        const timeLabel = this.formatTimestamp(timestamp);

        // 如果是对象数据，处理多个数据系列
        if (typeof data === 'object' && data !== null) {
            this.addMultipleDataPoints(timeLabel, data);
        } else {
            // 单一数据点
            this.addSingleDataPoint(timeLabel, parseFloat(data) || 0, 'data');
        }

        this.updateChart();
    }

    /**
     * 添加多个数据系列
     */
    addMultipleDataPoints(timeLabel, dataObject) {
        Object.entries(dataObject).forEach(([key, value]) => {
            if (typeof value === 'number' || !isNaN(parseFloat(value))) {
                this.addSingleDataPoint(timeLabel, parseFloat(value) || 0, key);
            }
        });
    }

    /**
     * 添加单个数据点到指定系列
     */
    addSingleDataPoint(timeLabel, value, seriesName) {
        // 获取或创建数据系列
        let dataset = this.datasets.get(seriesName);
        if (!dataset) {
            dataset = this.createDataset(seriesName);
            this.datasets.set(seriesName, dataset);
            this.chart.data.datasets.push(dataset);
        }

        // 添加数据点 - 使用当前数据点数量作为x轴值
        const xValue = dataset.data.length;
        dataset.data.push({
            x: xValue,
            y: value
        });

        // 更新时间标签（只在第一个系列时更新）
        if (this.chart.data.datasets[0] === dataset) {
            this.chart.data.labels.push(timeLabel);
        }

        // 限制数据点数量
        if (dataset.data.length > this.maxDataPoints) {
            dataset.data.shift();
            if (this.chart.data.datasets[0] === dataset) {
                this.chart.data.labels.shift();
            }
        }
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
            pointHoverRadius: 5
        };
    }

    /**
     * 更新图表
     */
    updateChart() {
        this.chart.update('none'); // 使用 'none' 模式以提高性能
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
        this.maxDataPoints = maxPoints;
        
        // 如果当前数据超过新的限制，进行裁剪
        this.datasets.forEach(dataset => {
            if (dataset.data.length > maxPoints) {
                dataset.data = dataset.data.slice(-maxPoints);
            }
        });

        if (this.chart.data.labels.length > maxPoints) {
            this.chart.data.labels = this.chart.data.labels.slice(-maxPoints);
        }

        this.updateChart();
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
                const value = dataset.data[index] ? dataset.data[index].y : '';
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
