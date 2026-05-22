import ReactDOM from 'react-dom/client';
import { ConfigProvider } from 'antd';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')).render(
  <ConfigProvider
    theme={{
      token: {
        colorPrimary: '#4a90e2',
        borderRadius: 8,
        fontSize: 14,
      },
    }}
  >
    <App />
  </ConfigProvider>
);
