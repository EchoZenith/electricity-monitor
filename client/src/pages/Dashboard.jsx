import { useState, useEffect, useCallback, useRef } from 'react';
import { Button, Spin, message } from 'antd';
import { LogoutOutlined, ReloadOutlined } from '@ant-design/icons';
import { BugOutlined } from '@ant-design/icons';
import { Lightning, ChartLine, ChartHistogram, Timer } from '@icon-park/react';
import { Chart, registerables } from 'chart.js';
import { fetchCurrent, fetchHistory, triggerCollect, logout } from '../api';

Chart.register(...registerables);

const styles = `
@media (max-width: 640px) {
   .d-header { flex-direction: column !important; gap: 12px !important; }
   .d-stats { grid-template-columns: 1fr !important; gap: 12px !important; }
  .d-stats-card { padding: 16px !important; }
  .d-stats-value { font-size: 28px !important; }
  .d-bottom { grid-template-columns: 1fr !important; gap: 12px !important; }
  .d-chart { height: 200px !important; padding: 12px !important; }
  .d-chart-empty { padding-top: 75px !important; }
  .d-section-gap { margin-bottom: 24px !important; }
  .d-container { padding: 16px !important; }
  .d-body { padding: 12px !important; }
  .d-trend-header { flex-direction: column !important; gap: 8px !important; }
}
`;

function formatTime(ts) {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

export default function Dashboard({ onLogout }) {
  const [currentData, setCurrentData] = useState(null);
  const [historyData, setHistoryData] = useState(null);
  const [days, setDays] = useState(30);
  const [collecting, setCollecting] = useState(false);
  const [loading, setLoading] = useState(true);

  const hourlyChartRef = useRef(null);
  const trendChartRef = useRef(null);
  const hourlyInstance = useRef(null);
  const trendInstance = useRef(null);
  const intervalRef = useRef(null);

  const loadData = useCallback(async () => {
    try {
      const [c, h] = await Promise.all([fetchCurrent(), fetchHistory()]);
      if (c.success) setCurrentData(c);
      if (h.success) setHistoryData(h);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    intervalRef.current = setInterval(loadData, 60000);
    return () => {
      clearInterval(intervalRef.current);
      hourlyInstance.current?.destroy();
      trendInstance.current?.destroy();
    };
  }, [loadData]);

  const handleCollect = async () => {
    setCollecting(true);
    try {
      await triggerCollect();
      await loadData();
      message.success('获取成功');
    } catch {
      message.error('获取失败');
    } finally {
      setCollecting(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    onLogout();
  };

  const handleTestNotify = async () => {
    try {
      const res = await fetch('/api/test-notify');
      const data = await res.json();
      if (data.success) {
        message.success('测试消息已发送，请查看企业微信');
      } else {
        message.error('发送失败');
      }
    } catch {
      message.error('发送失败');
    }
  };

  useEffect(() => {
    if (!currentData?.todayRecords || currentData.todayRecords.length === 0) return;
    hourlyInstance.current?.destroy();

    const sorted = [...currentData.todayRecords].sort((a, b) => a.timestamp - b.timestamp);
    const prev = currentData.yesterdayLastRecord;
    const labels = sorted.map(r => formatTime(r.timestamp));
    const values = sorted.map((r, i) => {
      const prevRecord = i === 0 ? prev : sorted[i - 1];
      if (!prevRecord) return 0;
      return Math.round(Math.max(0, prevRecord.surplus - r.surplus) * 100) / 100;
    });
    const costValues = sorted.map((r, i) => {
      const prevRecord = i === 0 ? prev : sorted[i - 1];
      if (!prevRecord) return 0;
      return Math.round(Math.max(0, prevRecord.amount - r.amount) * 100) / 100;
    });

    const ctx = hourlyChartRef.current?.getContext('2d');
    if (!ctx) return;

    hourlyInstance.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: '用电量 (kWh)',
          data: values,
          borderColor: '#4a90e2',
          backgroundColor: 'rgba(74, 144, 226, 0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointBackgroundColor: '#4a90e2',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointHoverRadius: 5,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            mode: 'index',
            intersect: false,
            callbacks: {
              label: (context) => `用电量: ${context.parsed.y.toFixed(2)} kWh`,
              afterLabel: (context) => {
                const idx = context.dataIndex;
                return `电费: ¥${costValues[idx].toFixed(2)}`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { maxRotation: 45, minRotation: 45, font: { size: 11 }, color: '#999' },
          },
          y: {
            beginAtZero: true,
            grid: { color: '#e8e8e8' },
            ticks: { font: { size: 11 }, color: '#999' },
          },
        },
        interaction: { intersect: false, mode: 'index' },
      },
    });
  }, [currentData]);

  useEffect(() => {
    if (!historyData?.dailyRecords || historyData.dailyRecords.length === 0) return;
    trendInstance.current?.destroy();

    const display = historyData.dailyRecords.slice(-days);
    const labels = display.map(r => r.date.slice(5));
    const usageData = display.map(r => r.usage);
    const surplusData = display.map(r => r.lastSurplus);

    const maxUsage = Math.max(...usageData, 1);
    const maxSurplus = Math.max(...surplusData, 1);

    const ctx = trendChartRef.current?.getContext('2d');
    if (!ctx) return;

    trendInstance.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: '日用电量 (kWh)',
            data: usageData,
            borderColor: '#f39c12',
            backgroundColor: 'transparent',
            tension: 0.4,
            yAxisID: 'y',
            pointRadius: 4,
            pointBackgroundColor: '#fff',
            pointBorderColor: '#f39c12',
            pointBorderWidth: 2,
            pointHoverRadius: 6,
          },
          {
            label: '剩余电量 (kWh)',
            data: surplusData,
            borderColor: '#4a90e2',
            backgroundColor: 'transparent',
            borderDash: [5, 5],
            tension: 0.4,
            yAxisID: 'y1',
            pointRadius: 4,
            pointBackgroundColor: '#fff',
            pointBorderColor: '#4a90e2',
            pointBorderWidth: 2,
            pointHoverRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'top',
            align: 'center',
            labels: { usePointStyle: true, padding: 20, font: { size: 13 } },
          },
          tooltip: {
            mode: 'index',
            intersect: false,
            callbacks: {
              label: (context) => `${context.dataset.label}: ${context.parsed.y}`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { size: 11 }, color: '#999' },
          },
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            beginAtZero: true,
            max: Math.ceil(maxUsage * 1.2),
            title: {
              display: true,
              text: '用电量 (kWh)',
              color: '#f39c12',
              font: { size: 12 },
            },
            grid: { color: '#e8e8e8' },
            ticks: { color: '#f39c12', font: { size: 11 } },
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            beginAtZero: true,
            max: Math.ceil(maxSurplus * 1.1),
            title: {
              display: true,
              text: '剩余电量 (kWh)',
              color: '#4a90e2',
              font: { size: 12 },
            },
            grid: { drawOnChartArea: false },
            ticks: { color: '#4a90e2', font: { size: 11 } },
          },
        },
        interaction: { intersect: false, mode: 'index' },
      },
    });
  }, [historyData, days]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f5f7fa' }}>
        <Spin size="large" />
      </div>
    );
  }

  const current = currentData?.current;
  const stats = historyData?.stats || {};
  const statKey = days === 7 ? '7' : days === 15 ? '15' : '30';
  const avgDaily = stats[`avgDaily${statKey}`];
  const estimatedDays = stats[`estimatedDays${statKey}`];

  const todayUsage = currentData?.todayUsage ?? 0;
  const todayCost = currentData?.todayCost ?? 0;
  const todayAvgPower = currentData?.todayAvgPower ?? null;

  return (
    <div className="d-body" style={{ background: '#f5f7fa', minHeight: '100vh', padding: 20 }}>
      <style>{`${styles}
body { margin: 0; }
.d-container { border-radius: 12px !important; box-shadow: none !important; }
`}</style>
      <div className="d-container" style={{ maxWidth: 1200, margin: '0 auto', background: 'white', padding: 32, borderRadius: 12 }}>
        <div className="d-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 24, fontWeight: 600, color: '#1a1a1a' }}>
            <Lightning theme="filled" size="28" fill="#4a90e2" style={{ display: 'flex' }} />
            智能电量监控
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              icon={<ReloadOutlined />}
              onClick={handleCollect}
              loading={collecting}
              size="small"
              style={{
                border: '1px solid #d9d9d9',
                borderRadius: 20,
                color: '#666',
                fontSize: 13,
              }}
            >
              手动获取
            </Button>
            <Button
              icon={<BugOutlined />}
              onClick={handleTestNotify}
              size="small"
              style={{
                border: '1px solid #d9d9d9',
                borderRadius: 20,
                color: '#666',
                fontSize: 13,
              }}
            >
              测试通知
            </Button>
            <Button
              icon={<LogoutOutlined />}
              onClick={handleLogout}
              size="small"
              style={{
                border: '1px solid #d9d9d9',
                borderRadius: 20,
                color: '#666',
                fontSize: 13,
              }}
            >
              退出
            </Button>
          </div>
        </div>

        <div className="d-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24, marginBottom: 32 }}>
          <div className="d-stats-card" style={{ padding: 20 }}>
            <div style={{ fontSize: 14, color: '#999', marginBottom: 8 }}>剩余电量</div>
            <div className="d-stats-value" style={{ fontSize: 36, fontWeight: 700, color: '#1a1a1a', display: 'flex', alignItems: 'baseline', gap: 6 }}>
              {current?.surplus?.toFixed(1) ?? '--'}
              <span style={{ fontSize: 16, fontWeight: 400, color: '#999' }}>kWh</span>
            </div>
          </div>
          <div className="d-stats-card" style={{ padding: 20 }}>
            <div style={{ fontSize: 14, color: '#999', marginBottom: 8 }}>剩余余额</div>
            <div className="d-stats-value" style={{ fontSize: 36, fontWeight: 700, color: '#1a1a1a' }}>
              ¥{current?.amount?.toFixed(2) ?? '--'}
            </div>
          </div>
          <div className="d-stats-card" style={{ padding: 20 }}>
            <div style={{ fontSize: 14, color: '#999', marginBottom: 8 }}>今日用电</div>
            <div className="d-stats-value" style={{ fontSize: 36, fontWeight: 700, color: '#1a1a1a', display: 'flex', alignItems: 'baseline', gap: 6 }}>
              {todayUsage.toFixed(1)}
              <span style={{ fontSize: 16, fontWeight: 400, color: '#999' }}>kWh</span>
            </div>
          </div>
          <div className="d-stats-card" style={{ padding: 20 }}>
            <div style={{ fontSize: 14, color: '#999', marginBottom: 8 }}>今日电费</div>
            <div className="d-stats-value" style={{ fontSize: 36, fontWeight: 700, color: '#1a1a1a' }}>
              ¥{todayCost.toFixed(2)}
            </div>
          </div>
        </div>

        <div className="d-section-gap" style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 600, color: '#1a1a1a' }}>
              <ChartLine theme="filled" size="20" fill="#4a90e2" style={{ display: 'flex' }} />
              今日用电趋势
              <span style={{ fontSize: 13, color: '#999', fontWeight: 400 }}>(每时段)</span>
            </div>
          </div>
          <div className="d-chart" style={{ position: 'relative', height: 280, background: '#fafbfc', borderRadius: 8, padding: 20 }}>
            {(!currentData?.todayRecords || currentData.todayRecords.length === 0) ? (
              <div className="d-chart-empty" style={{ textAlign: 'center', paddingTop: 110, color: '#999' }}>暂无今日数据</div>
            ) : null}
            <canvas ref={hourlyChartRef} />
          </div>
        </div>

        <div className="d-section-gap" style={{ marginBottom: 32 }}>
          <div className="d-trend-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 600, color: '#1a1a1a' }}>
              <ChartHistogram theme="filled" size="20" fill="#4a90e2" style={{ display: 'flex' }} />
              用电 & 剩余电量趋势
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[7, 15, 30].map(d => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  style={{
                    padding: '8px 20px',
                    border: 'none',
                    background: days === d ? '#333' : '#f0f2f5',
                    color: days === d ? 'white' : '#666',
                    borderRadius: 20,
                    cursor: 'pointer',
                    fontSize: 14,
                    transition: 'all 0.3s',
                  }}
                >
                  {d}天
                </button>
              ))}
            </div>
          </div>
          <div className="d-chart" style={{ position: 'relative', height: 280, background: '#fafbfc', borderRadius: 8, padding: 20 }}>
            {(!historyData?.dailyRecords || historyData.dailyRecords.length === 0) ? (
              <div className="d-chart-empty" style={{ textAlign: 'center', paddingTop: 110, color: '#999' }}>暂无历史数据</div>
            ) : null}
            <canvas ref={trendChartRef} />
          </div>
        </div>

        <div className="d-bottom" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, background: '#f8f9fa', borderRadius: 8 }}>
            <div style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, background: '#e8f4fd' }}>
              <ChartHistogram theme="filled" size="22" fill="#4a90e2" style={{ display: 'flex' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: '#666', marginBottom: 2 }}>日均耗电</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: '#1a1a1a' }}>
                {avgDaily != null ? `${avgDaily.toFixed(1)} kWh` : '--'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, background: '#f8f9fa', borderRadius: 8 }}>
            <div style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, background: '#f0e8fd' }}>
              <Lightning theme="filled" size="22" fill="#9b59b6" style={{ display: 'flex' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: '#666', marginBottom: 2 }}>平均功率</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: '#1a1a1a' }}>
                {todayAvgPower != null ? `${(todayAvgPower * 1000).toFixed(0)} W` : '--'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, background: '#f8f9fa', borderRadius: 8 }}>
            <div style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, background: '#e8fdf4' }}>
              <Timer theme="filled" size="22" fill="#27ae60" style={{ display: 'flex' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: '#666', marginBottom: 2 }}>预计可用</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: '#1a1a1a' }}>
                {estimatedDays != null ? `${estimatedDays.toFixed(0)} 天` : '--'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
