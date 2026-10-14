import { View, Text } from '@tarojs/components';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Taro from '@tarojs/taro';
import { useState } from 'react';
import { useAuthStore } from '@/store/auth';

const LoginPage = () => {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const goBack = () => {
    const pages = Taro.getCurrentPages();
    if (pages.length > 1) {
      Taro.navigateBack();
    } else {
      Taro.switchTab({ url: '/pages/index/index' });
    }
  };

  const submit = async () => {
    if (!email.trim() || !password) {
      Taro.showToast({ title: '请填写邮箱和密码', icon: 'none' });
      return;
    }
    if (mode === 'signup') {
      if (password.length < 6) {
        Taro.showToast({ title: '密码至少6位', icon: 'none' });
        return;
      }
      if (password !== confirm) {
        Taro.showToast({ title: '两次密码不一致', icon: 'none' });
        return;
      }
    }
    setSubmitting(true);
    try {
      const { signIn, signUp } = useAuthStore.getState();
      if (mode === 'login') {
        await signIn(email.trim(), password);
      } else {
        await signUp(email.trim(), password);
        // mailer_autoconfirm=true 时注册即登录；若未返回 session 则引导去登录
        if (!useAuthStore.getState().user) {
          setMode('login');
          setConfirm('');
          Taro.showToast({ title: '注册成功，请登录', icon: 'none' });
          return;
        }
      }
      Taro.showToast({ title: mode === 'login' ? '登录成功' : '注册成功', icon: 'success' });
      setTimeout(goBack, 500);
    } catch (err) {
      Taro.showToast({ title: err.message || '操作失败', icon: 'none' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className="min-h-screen bg-white px-6 pt-16">
      <Text className="text-3xl font-bold text-center block">花遇鲜花</Text>
      <Text className="text-sm text-gray-400 text-center mt-2 mb-10">
        {mode === 'login' ? '欢迎回来，登录后继续' : '注册账号，开启鲜花之旅'}
      </Text>

      <Input
        className="bg-gray-50 rounded-xl px-4 py-3 text-sm mb-3"
        placeholder="邮箱"
        type="text"
        value={email}
        onInput={(e) => setEmail(e.detail.value)}
      />
      <Input
        className="bg-gray-50 rounded-xl px-4 py-3 text-sm mb-3"
        placeholder="密码"
        password
        value={password}
        onInput={(e) => setPassword(e.detail.value)}
      />
      {mode === 'signup' && (
        <Input
          className="bg-gray-50 rounded-xl px-4 py-3 text-sm mb-3"
          placeholder="确认密码"
          password
          value={confirm}
          onInput={(e) => setConfirm(e.detail.value)}
        />
      )}

      <Button
        className="!bg-rose-500 !text-white !rounded-full text-sm font-medium mt-2"
        disabled={submitting}
        onClick={submit}
      >
        {mode === 'login' ? '登录' : '注册'}
      </Button>

      <View className="text-center mt-6">
        <Text className="text-xs text-gray-400">
          {mode === 'login' ? '还没有账号？' : '已有账号？'}{' '}
          <Text
            className="text-rose-500"
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login');
              setConfirm('');
            }}
          >
            {mode === 'login' ? '去注册' : '去登录'}
          </Text>
        </Text>
      </View>
    </View>
  );
};

export default LoginPage;
