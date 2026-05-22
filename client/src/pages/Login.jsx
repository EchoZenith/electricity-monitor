import { useState } from 'react';
import { Card, Form, Input, Button, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { Lightning } from '@icon-park/react';
import { login } from '../api';

export default function Login({ onLogin }) {
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (values) => {
    setLoading(true);
    try {
      const data = await login(values.username, values.password);
      if (data.success) {
        onLogin();
      } else {
        message.error(data.message || '用户名或密码错误');
      }
    } catch {
      message.error('网络错误，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: '#f5f7fa',
      padding: 0,
    }}>
      <Card
        style={{
          width: '100%',
          maxWidth: 400,
          borderRadius: 12,
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        }}
        styles={{ body: { padding: '48px 40px', textAlign: 'center' } }}
      >
        <div style={{ marginBottom: 32 }}>
          <Lightning theme="filled" size="40" fill="#4a90e2" style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }} />
          <h2 style={{
            margin: 0,
            fontSize: 24,
            fontWeight: 600,
            color: '#1a1a1a',
          }}>
            智能电量监控
          </h2>
          <p style={{ color: '#999', fontSize: 14, marginTop: 8, marginBottom: 0 }}>
            请登录后查看用电数据
          </p>
        </div>

        <Form
          layout="vertical"
          onFinish={handleSubmit}
          autoComplete="off"
        >
          <Form.Item
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input
              prefix={<UserOutlined style={{ color: '#999' }} />}
              placeholder="用户名"
              size="large"
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#999' }} />}
              placeholder="密码"
              size="large"
            />
          </Form.Item>

          <Form.Item style={{ marginTop: 32, marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              size="large"
              style={{
                height: 44,
                fontWeight: 600,
                fontSize: 16,
              }}
            >
              登 录
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
