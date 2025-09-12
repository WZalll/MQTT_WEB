// 额外图表刷新辅助：无需修改现有逻辑
// - 周期性检查：容器有尺寸则强制一次 resize+update
// - 页面重新可见后延迟强制刷新

(function () {
  document.addEventListener('DOMContentLoaded', function () {
    // 每秒检查一次
    setInterval(() => {
      const chartCanvas = document.querySelector('#dataChart');
      if (
        chartCanvas &&
        window.app &&
        window.app.chartManager &&
        window.app.chartManager.chart
      ) {
        const chart = window.app.chartManager.chart;
        if (chartCanvas.offsetWidth > 0 && chartCanvas.offsetHeight > 0) {
          try {
            chart.resize();
            chart.update();
          } catch (e) {
            // 忽略单次绘制异常
          }
        }
      }
    }, 1000);

    // 页面可见性变化
    document.addEventListener('visibilitychange', () => {
      if (
        !document.hidden &&
        window.app &&
        window.app.chartManager &&
        window.app.chartManager.chart
      ) {
        setTimeout(() => {
          try {
            const chart = window.app.chartManager.chart;
            chart.resize();
            chart.update();
          } catch (e) {}
        }, 100);
      }
    });
  });
})();
