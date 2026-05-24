import { useState, useEffect, useCallback, useRef } from 'react';
import { Button, Spin, message, DatePicker } from 'antd';
import { LogoutOutlined, ReloadOutlined } from '@ant-design/icons';
import { Lightning, ChartLine, ChartHistogram, Timer } from '@icon-park/react';
import { Chart, registerables } from 'chart.js';
import dayjs from 'dayjs';
import { fetchCurrent, fetchHistory, triggerCollect, logout, fetchRecordsByDate } from '../api';

Chart.register(...registerables);

const styles = `
@media (max-width: 640px) {
   .d-header { flex-direction: column !important; gap: 12px !important; }
   .d-stats { grid-template-columns: 1fr !important; gap: 12px !important; }
  .d-stats-card { padding: 16px !important; }
  .d-stats-value { font-size: 28px !important; }
  .d-bottom { grid-template-columns: 1fr !important; gap: 12px !important; }
  .d-chart { height: 200px !important; }
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
  const [chartDate, setChartDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [dateRecords, setDateRecords] = useState(null);
  const [datePrevLast, setDatePrevLast] = useState(null);
  const [isToday, setIsToday] = useState(true);

  const hourlyChartRef = useRef(null);
  const trendChartRef = useRef(null);
  const hourlyInstance = useRef(null);
  const trendInstance = useRef(null);
  const intervalRef = useRef(null);
  const chartContainerRef = useRef(null);

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

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => {
      hourlyInstance.current?.resize();
      trendInstance.current?.resize();
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const today = dayjs().format('YYYY-MM-DD');
    setIsToday(chartDate === today);
    fetchRecordsByDate(chartDate).then(data => {
      if (data.success) {
        setDateRecords(data.records);
        setDatePrevLast(data.prevLastRecord);
      }
    });
  }, [chartDate]);

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

  const handleSendReport = async () => {
    try {
      const res = await fetch('/api/send-report');
      const data = await res.json();
      if (data.success) {
        message.success('日报已发送');
      } else {
        message.error('发送失败');
      }
    } catch {
      message.error('发送失败');
    }
  };

  useEffect(() => {
    const records = isToday ? currentData?.todayRecords : dateRecords;
    const prev = isToday ? currentData?.yesterdayLastRecord : datePrevLast;
    if (!records || records.length === 0) return;
    hourlyInstance.current?.destroy();

    const sorted = [...records].sort((a, b) => a.timestamp - b.timestamp);
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
  }, [currentData, dateRecords, datePrevLast, isToday]);

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
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: 'var(--bg-body)' }}>
        <Spin size="large" />
      </div>
    );
  }

  const current = currentData?.current;
  const stats = historyData?.stats || {};
  const statKey = days === 7 ? '7' : days === 15 ? '15' : '30';
  const avgDaily = stats[`avgDaily${statKey}`];
  const avgPower = stats[`avgPower${statKey}`];
  const estimatedDays = stats[`estimatedDays${statKey}`];

  const todayUsage = currentData?.todayUsage ?? 0;
  const todayCost = currentData?.todayCost ?? 0;

  return (
    <div className="d-body" ref={chartContainerRef} style={{ background: 'var(--bg-body)', minHeight: '100vh', padding: 20 }}>
      <style>{`${styles}
body { margin: 0; }
.d-container { border-radius: 12px !important; box-shadow: none !important; }
`}</style>
      <div className="d-container" style={{ maxWidth: 1200, margin: '0 auto', background: 'var(--bg-card)', padding: 32, borderRadius: 12 }}>
        <div className="d-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 24, fontWeight: 600, color: 'var(--text-primary)' }}>
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
                border: '1px solid var(--border-light)',
                borderRadius: 20,
                color: 'var(--text-secondary)',
                fontSize: 13,
              }}
            >
              手动获取
            </Button>
            <Button
              onClick={handleSendReport}
              size="small"
              style={{
                border: '1px solid var(--border-light)',
                borderRadius: 20,
                color: 'var(--text-secondary)',
                fontSize: 13,
              }}
            >
              发送日报
            </Button>
            <Button
              icon={<LogoutOutlined />}
              onClick={handleLogout}
              size="small"
              style={{
                border: '1px solid var(--border-light)',
                borderRadius: 20,
                color: 'var(--text-secondary)',
                fontSize: 13,
              }}
            >
              退出
            </Button>
          </div>
        </div>

        <div className="d-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24, marginBottom: 32 }}>
          <div className="d-stats-card" style={{ padding: 20 }}>
            <div style={{ fontSize: 14, color: 'var(--text-tertiary)', marginBottom: 8 }}>剩余电量</div>
            <div className="d-stats-value" style={{ fontSize: 36, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'baseline', gap: 6 }}>
              {current?.surplus?.toFixed(1) ?? '--'}
              <span style={{ fontSize: 16, fontWeight: 400, color: 'var(--text-tertiary)' }}>kWh</span>
            </div>
          </div>
          <div className="d-stats-card" style={{ padding: 20 }}>
            <div style={{ fontSize: 14, color: 'var(--text-tertiary)', marginBottom: 8 }}>剩余余额</div>
            <div className="d-stats-value" style={{ fontSize: 36, fontWeight: 700, color: 'var(--text-primary)' }}>
              ¥{current?.amount?.toFixed(2) ?? '--'}
            </div>
          </div>
          <div className="d-stats-card" style={{ padding: 20 }}>
            <div style={{ fontSize: 14, color: 'var(--text-tertiary)', marginBottom: 8 }}>今日用电</div>
            <div className="d-stats-value" style={{ fontSize: 36, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'baseline', gap: 6 }}>
              {todayUsage.toFixed(1)}
              <span style={{ fontSize: 16, fontWeight: 400, color: 'var(--text-tertiary)' }}>kWh</span>
            </div>
          </div>
          <div className="d-stats-card" style={{ padding: 20 }}>
            <div style={{ fontSize: 14, color: 'var(--text-tertiary)', marginBottom: 8 }}>今日电费</div>
            <div className="d-stats-value" style={{ fontSize: 36, fontWeight: 700, color: 'var(--text-primary)' }}>
              ¥{todayCost.toFixed(2)}
            </div>
          </div>
        </div>

        <div className="d-section-gap" style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
              <ChartLine theme="filled" size="20" fill="#4a90e2" style={{ display: 'flex' }} />
              用电趋势
              <span style={{ fontSize: 13, color: 'var(--text-tertiary)', fontWeight: 400 }}>(每时段)</span>
            </div>
            <DatePicker
              value={dayjs(chartDate)}
              onChange={(d) => d && setChartDate(d.format('YYYY-MM-DD'))}
              allowClear={false}
              size="small"
              style={{ width: 130 }}
            />
          </div>
          <div className="d-chart" style={{ position: 'relative', height: 280, background: 'var(--bg-chart)', borderRadius: 8 }}>
            {(!isToday && (!dateRecords || dateRecords.length === 0)) || (isToday && (!currentData?.todayRecords || currentData.todayRecords.length === 0)) ? (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)' }}>暂无数据</div>
            ) : <div style={{ padding: 20, height: '100%', boxSizing: 'border-box' }}><canvas ref={hourlyChartRef} /></div>}
          </div>
        </div>

        <div className="d-section-gap" style={{ marginBottom: 32 }}>
          <div className="d-trend-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
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
                    background: days === d ? 'var(--tab-bg-active)' : 'var(--tab-bg)',
                    color: days === d ? 'var(--tab-text-active)' : 'var(--tab-text)',
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
          <div className="d-chart" style={{ position: 'relative', height: 280, background: 'var(--bg-chart)', borderRadius: 8 }}>
            {(!historyData?.dailyRecords || historyData.dailyRecords.length === 0) ? (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)' }}>暂无历史数据</div>
            ) : <div style={{ padding: 20, height: '100%', boxSizing: 'border-box' }}><canvas ref={trendChartRef} /></div>}
          </div>
        </div>

        <div className="d-bottom" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, background: 'var(--bg-item)', borderRadius: 8 }}>
            <div style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, background: 'var(--bg-item-blue)' }}>
              <ChartHistogram theme="filled" size="22" fill="#4a90e2" style={{ display: 'flex' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 2 }}>日均耗电</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>
                {avgDaily != null ? `${avgDaily.toFixed(1)} kWh` : '--'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, background: 'var(--bg-item)', borderRadius: 8 }}>
            <div style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, background: 'var(--bg-item-purple)' }}>
              <Lightning theme="filled" size="22" fill="#9b59b6" style={{ display: 'flex' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 2 }}>平均功率</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>
                {avgPower != null ? `${(avgPower * 1000).toFixed(0)} W` : '--'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, background: 'var(--bg-item)', borderRadius: 8 }}>
            <div style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, background: 'var(--bg-item-green)' }}>
              <Timer theme="filled" size="22" fill="#27ae60" style={{ display: 'flex' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 2 }}>预计可用</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>
                {estimatedDays != null ? `${estimatedDays.toFixed(0)} 天` : '--'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
