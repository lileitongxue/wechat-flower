import { View, Text, Picker } from '@tarojs/components';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Taro, { useLoad } from '@tarojs/taro';
import { useState } from 'react';
import { Api, Appointment } from '@/api';
import { useAuthStore } from '@/store/auth';

const AppointmentPage = () => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [note, setNote] = useState('');
  const [myAppointments, setMyAppointments] = useState<Appointment[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const timeSlots = ['10:00-12:00', '12:00-14:00', '14:00-16:00', '16:00-18:00', '18:00-20:00'];

  useLoad(async () => {
    const user = useAuthStore.getState().user;
    if (!user) {
      Taro.showToast({ title: '请先登录', icon: 'none' });
      setTimeout(() => {
        Taro.navigateTo({ url: '/pages/login/index?redirect=/pages/appointment/index' });
      }, 500);
      return;
    }
    try {
      const list = await Api.getAppointments();
      setMyAppointments(list || []);
    } catch (err) {
      console.error(err);
    }
  });

  const submit = async () => {
    if (!name.trim() || !phone.trim()) {
      Taro.showToast({ title: '请填写联系信息', icon: 'none' });
      return;
    }
    if (!date || !time) {
      Taro.showToast({ title: '请选择到店时间', icon: 'none' });
      return;
    }
    setSubmitting(true);
    try {
      await Api.createAppointment({
        type: 'custom',
        title: '到店预约',
        description: `${time}${note.trim() ? '，备注：' + note.trim() : ''}`,
        appointment_date: date,
        contact_name: name.trim(),
        contact_phone: phone.trim(),
      });
      Taro.showToast({ title: '预约成功', icon: 'success' });
      setName('');
      setPhone('');
      setDate('');
      setTime('');
      setNote('');
      const list = await Api.getAppointments();
      setMyAppointments(list || []);
    } catch (err) {
      Taro.showToast({ title: err.message || '预约失败', icon: 'none' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className="min-h-screen bg-gray-50 pb-6">
      {/* 预约表单 */}
      <View className="bg-white px-4 py-4 mt-3 mx-3 rounded-xl">
        <Text className="text-base font-bold mb-3">预约到店</Text>
        <Input
          className="bg-gray-50 rounded-lg px-3 py-2 text-sm mb-2"
          placeholder="您的称呼"
          value={name}
          onInput={(e) => setName(e.detail.value)}
        />
        <Input
          className="bg-gray-50 rounded-lg px-3 py-2 text-sm mb-2"
          placeholder="手机号"
          type="number"
          value={phone}
          onInput={(e) => setPhone(e.detail.value)}
        />
        <Picker
          mode="date"
          value={date}
          onChange={(e) => setDate(e.detail.value)}
        >
          <View className="bg-gray-50 rounded-lg px-3 py-2 text-sm mb-2">
            <Text className={date ? 'text-gray-800' : 'text-gray-400'}>
              {date || '选择到店日期'}
            </Text>
          </View>
        </Picker>
        <Picker
          mode="selector"
          range={timeSlots}
          onChange={(e) => setTime(timeSlots[Number(e.detail.value)])}
        >
          <View className="bg-gray-50 rounded-lg px-3 py-2 text-sm mb-2">
            <Text className={time ? 'text-gray-800' : 'text-gray-400'}>
              {time || '选择到店时段'}
            </Text>
          </View>
        </Picker>
        <Input
          className="bg-gray-50 rounded-lg px-3 py-2 text-sm"
          placeholder="备注（可选，如送花对象/用途）"
          value={note}
          onInput={(e) => setNote(e.detail.value)}
        />
        <Button
          className="!bg-rose-500 !text-white !rounded-full text-sm font-medium mt-3"
          disabled={submitting}
          onClick={submit}
        >
          提交预约
        </Button>
      </View>

      {/* 我的预约 */}
      <View className="px-4 py-4">
        <Text className="text-base font-bold mb-2">我的预约</Text>
        {myAppointments.length === 0 ? (
          <Text className="text-xs text-gray-400">暂无预约记录</Text>
        ) : (
          (myAppointments || []).map((a) => (
            <View key={a.id} className="bg-white rounded-xl p-3 mb-2">
              <View className="flex justify-between items-center">
                <Text className="text-sm font-medium">
                  {a.appointment_date ? String(a.appointment_date).slice(0, 10) : ''}
                </Text>
                <Text className="text-xs text-rose-500">
                  {a.status === 'pending' ? '待确认' : a.status === 'confirmed' ? '已确认' : '已取消'}
                </Text>
              </View>
              <Text className="text-xs text-gray-400 mt-1">
                {a.contact_name} · {a.contact_phone}
              </Text>
              {a.description && <Text className="text-xs text-gray-400 mt-1">备注：{a.description}</Text>}
            </View>
          ))
        )}
      </View>
    </View>
  );
};

export default AppointmentPage;
