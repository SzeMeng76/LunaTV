// 观影室首页 - 选项卡式界面
'use client';

import { useState, useEffect } from 'react';
import { Users, UserPlus, List as ListIcon, Lock, RefreshCw, Video, LogOut, Play } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useWatchRoomContext } from '@/components/WatchRoomProvider';
import PageLayout from '@/components/PageLayout';
import { getAuthInfoFromBrowserCookie } from '@/lib/auth';
import MiniVideoCard from '@/components/watch-room/MiniVideoCard';
import type { Room, PlayState } from '@/types/watch-room.types';

type TabType = 'create' | 'join' | 'list';

export default function WatchRoomPage() {
  const router = useRouter();
  const watchRoom = useWatchRoomContext();
  const { getRoomList, isConnected, createRoom, joinRoom, leaveRoom, currentRoom, isOwner, members, configLoading } = watchRoom;
  const [activeTab, setActiveTab] = useState<TabType>('create');

  // 获取当前登录用户
  const [currentUsername, setCurrentUsername] = useState<string>('游客');

  useEffect(() => {
    const authInfo = getAuthInfoFromBrowserCookie();
    setCurrentUsername(authInfo?.username || '游客');
  }, []);

  // 创建房间表单
  const [createForm, setCreateForm] = useState({
    roomName: '',
    description: '',
    password: '',
    isPublic: true,
  });

  // 加入房间表单
  const [joinForm, setJoinForm] = useState({
    roomId: '',
    password: '',
  });

  // 房间列表
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [joinLoading, setJoinLoading] = useState(false);

  // 加载房间列表
  const loadRooms = async () => {
    if (!isConnected) return;

    setLoading(true);
    try {
      const roomList = await getRoomList();
      setRooms(roomList);
    } catch (error) {
      console.error('[WatchRoom] Failed to load rooms:', error);
    } finally {
      setLoading(false);
    }
  };

  // 切换到房间列表 tab 时加载房间
  useEffect(() => {
    if (activeTab === 'list') {
      loadRooms();
      // 每1小时刷新一次
      const interval = setInterval(loadRooms, 60 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [activeTab, isConnected]);

  // 处理创建房间
  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.roomName.trim()) {
      alert('请输入房间名称');
      return;
    }

    setCreateLoading(true);
    try {
      await createRoom({
        name: createForm.roomName.trim(),
        description: createForm.description.trim(),
        password: createForm.password.trim() || undefined,
        isPublic: createForm.isPublic,
      });

      // 清空表单
      setCreateForm({
        roomName: '',
        description: '',
        password: '',
        isPublic: true,
      });
    } catch (error: any) {
      alert(error.message || '创建房间失败');
    } finally {
      setCreateLoading(false);
    }
  };

  // 处理加入房间
  const handleJoinRoom = async (e: React.FormEvent, roomId?: string) => {
    e.preventDefault();
    const targetRoomId = roomId || joinForm.roomId.trim().toUpperCase();
    if (!targetRoomId) {
      alert('请输入房间ID');
      return;
    }

    setJoinLoading(true);
    try {
      await joinRoom({
        roomId: targetRoomId,
        password: joinForm.password.trim() || undefined,
      });

      // 清空表单
      setJoinForm({
        roomId: '',
        password: '',
      });
    } catch (error: any) {
      alert(error.message || '加入房间失败');
    } finally {
      setJoinLoading(false);
    }
  };

  // 从房间列表加入房间
  const handleJoinFromList = (room: Room) => {
    setJoinForm({
      roomId: room.id,
      password: '',
    });
    setActiveTab('join');
  };

  // 离开/解散房间
  const handleLeaveRoom = () => {
    if (confirm(isOwner ? '确定要解散房间吗？所有成员将被踢出房间。' : '确定要退出房间吗？')) {
      leaveRoom();
    }
  };

  const formatTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}天前`;
    if (hours > 0) return `${hours}小时前`;
    if (minutes > 0) return `${minutes}分钟前`;
    return '刚刚';
  };

  const tabs = [
    { id: 'create' as TabType, label: '创建房间', icon: Users },
    { id: 'join' as TabType, label: '加入房间', icon: UserPlus },
    { id: 'list' as TabType, label: '房间列表', icon: ListIcon },
  ];

  // 配置加载中
  if (configLoading) {
    return (
      <PageLayout>
        <div className='flex items-center justify-center min-h-screen'>
          <div className='text-center max-w-md'>
            <RefreshCw className='w-16 h-16 mx-auto mb-4 text-indigo-500 animate-spin' />
            <h2 className='text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2'>
              加载配置中...
            </h2>
          </div>
        </div>
      </PageLayout>
    );
  }

  // 未启用提示
  if (!watchRoom.isEnabled) {
    return (
      <PageLayout>
        <div className='flex items-center justify-center min-h-screen'>
          <div className='text-center max-w-md'>
            <Video className='w-16 h-16 mx-auto mb-4 text-gray-400' />
            <h2 className='text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2'>
              观影室未启用
            </h2>
            <p className='text-gray-600 dark:text-gray-400 mb-4'>
              请联系管理员启用观影室功能
            </p>
          </div>
        </div>
      </PageLayout>
    );
  }

  // 连接中提示
  if (!isConnected) {
    return (
      <PageLayout>
        <div className='flex items-center justify-center min-h-screen'>
          <div className='text-center max-w-md'>
            <RefreshCw className='w-16 h-16 mx-auto mb-4 text-indigo-500 animate-spin' />
            <h2 className='text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2'>
              正在连接观影室服务器...
            </h2>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout activePath="/watch-room">
      <div className="flex flex-col gap-4 py-4 px-5 lg:px-[3rem] 2xl:px-20">
        {/* 页面标题 */}
        <div className="py-1">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Users className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-500" />
              观影室
              {currentRoom && (
                <span className="text-xs sm:text-sm font-normal text-gray-500 dark:text-gray-400">
                  ({isOwner ? '房主' : '房员'})
                </span>
              )}
            </h1>
            {/* 连接状态指示器 */}
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
              <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                {isConnected ? '已连接' : '未连接'}
              </span>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">
            与好友一起看视频，实时同步播放
          </p>
        </div>

        {/* 选项卡 */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-2.5 sm:py-3 text-xs sm:text-sm font-medium transition-colors relative whitespace-nowrap
                  ${
                    activeTab === tab.id
                      ? 'text-indigo-600 dark:text-indigo-400'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                  }
                `}
              >
                <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                {tab.label}
                {activeTab === tab.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400" />
                )}
              </button>
            );
          })}
        </div>

        {/* 选项卡内容 */}
        <div className="flex-1">
          {/* 创建房间 */}
          {activeTab === 'create' && (
            <div className="max-w-2xl mx-auto py-8">
              <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">
                  创建新房间
                </h2>

                {/* 如果已在房间内，显示当前房间信息 */}
                {currentRoom ? (
                  <div className="space-y-4">
                    {/* 房间信息卡片 */}
                    <div className="bg-linear-to-r from-indigo-500 to-purple-600 rounded-xl p-6 text-white">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h3 className="text-2xl font-bold mb-1">{currentRoom.name}</h3>
                          <p className="text-indigo-100 text-sm">{currentRoom.description || '暂无描述'}</p>
                        </div>
                        {isOwner && (
                          <span className="bg-yellow-400 text-yellow-900 px-3 py-1 rounded-full text-xs font-bold">
                            房主
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mt-4">
                        <div className="bg-white/10 backdrop-blur rounded-lg p-3">
                          <p className="text-indigo-100 text-xs mb-1">房间号</p>
                          <p className="text-lg sm:text-xl font-mono font-bold">{currentRoom.id}</p>
                        </div>
                        <div className="bg-white/10 backdrop-blur rounded-lg p-3">
                          <p className="text-indigo-100 text-xs mb-1">成员数</p>
                          <p className="text-lg sm:text-xl font-bold">{members.length} 人</p>
                        </div>
                      </div>
                    </div>

                    {/* 正在观看的影片 */}
                    {currentRoom.currentState && currentRoom.currentState.type === 'play' && (
                      <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <Play className="w-4 h-4 text-green-500" />
                          <h4 className="font-semibold text-gray-900 dark:text-gray-100">正在观看</h4>
                        </div>
                        <MiniVideoCard
                          title={currentRoom.currentState.videoName}
                          year={currentRoom.currentState.videoYear}
                          episode={currentRoom.currentState.episode}
                          poster={currentRoom.currentState.poster}
                          totalEpisodes={currentRoom.currentState.totalEpisodes}
                          onClick={() => {
                            const state = currentRoom.currentState as PlayState;
                            const params = new URLSearchParams();
                            params.set('id', state.videoId);
                            params.set('source', state.source);
                            params.set('title', state.videoName);
                            if (state.videoYear) params.set('year', state.videoYear);
                            if (state.searchTitle) params.set('stitle', state.searchTitle);
                            if (state.episode !== undefined && state.episode !== null) {
                              params.set('index', state.episode.toString());
                            }
                            if (state.currentTime) {
                              params.set('t', state.currentTime.toString());
                            }
                            params.set('prefer', 'true');
                            router.push(`/play?${params.toString()}`);
                          }}
                        />
                      </div>
                    )}

                    {/* 成员列表 */}
                    <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
                      <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">房间成员</h4>
                      <div className="space-y-2">
                        {members.map((member) => (
                          <div
                            key={member.id}
                            className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-lg p-3"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-linear-to-r from-indigo-400 to-purple-500 flex items-center justify-center text-white font-bold">
                                {member.name.charAt(0).toUpperCase()}
                              </div>
                              <span className="font-medium text-gray-900 dark:text-gray-100">
                                {member.name}
                              </span>
                            </div>
                            {member.isOwner && (
                              <span className="text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 px-2 py-1 rounded">
                                房主
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 提示信息 */}
                    <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-4 border border-indigo-200 dark:border-indigo-800">
                      <p className="text-sm text-indigo-800 dark:text-indigo-200">
                        💡 {currentRoom.currentState && currentRoom.currentState.type === 'play'
                          ? '点击上方视频卡片可跳转到播放页面继续观看'
                          : '前往播放页面开始观影，房间成员将自动同步您的操作'}
                      </p>
                    </div>

                    {/* 离开/解散房间按钮 */}
                    <button
                      onClick={handleLeaveRoom}
                      className="w-full flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 text-white font-medium py-3 rounded-lg transition-colors"
                    >
                      <LogOut className="h-5 w-5" />
                      {isOwner ? '解散房间' : '退出房间'}
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleCreateRoom} className="space-y-4">
                  {/* 显示当前用户 */}
                  <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 border border-indigo-200 dark:border-indigo-800">
                    <p className="text-sm text-indigo-800 dark:text-indigo-200">
                      <strong>当前用户：</strong>{currentUsername}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      房间名称 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={createForm.roomName}
                      onChange={(e) => setCreateForm({ ...createForm, roomName: e.target.value })}
                      placeholder="请输入房间名称"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      maxLength={50}
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      房间描述
                    </label>
                    <textarea
                      value={createForm.description}
                      onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                      placeholder="请输入房间描述（可选）"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                      rows={3}
                      maxLength={200}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      房间密码
                    </label>
                    <input
                      type="password"
                      value={createForm.password}
                      onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                      placeholder="留空表示无需密码"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      maxLength={20}
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="isPublic"
                      checked={createForm.isPublic}
                      onChange={(e) => setCreateForm({ ...createForm, isPublic: e.target.checked })}
                      className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                    />
                    <label htmlFor="isPublic" className="text-sm text-gray-700 dark:text-gray-300">
                      在房间列表中公开显示
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={createLoading || !createForm.roomName.trim()}
                    className="w-full bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-400 text-white font-medium py-3 rounded-lg transition-colors"
                  >
                    {createLoading ? '创建中...' : '创建房间'}
                  </button>
                </form>
                )}
              </div>

              {/* 使用说明 - 仅在未在房间内时显示 */}
              {!currentRoom && (
                <div className="mt-6 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-4 border border-indigo-200 dark:border-indigo-800">
                  <p className="text-sm text-indigo-800 dark:text-indigo-200">
                    <strong>提示：</strong>创建房间后，您将成为房主。所有成员的播放进度将自动跟随您的操作。
                  </p>
                </div>
              )}
            </div>
          )}

          {/* 加入房间 */}
          {activeTab === 'join' && (
            <div className="max-w-2xl mx-auto py-8">
              <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">
                  加入房间
                </h2>

                {/* 如果已在房间内，显示当前房间信息 */}
                {currentRoom ? (
                  <div className="space-y-4">
                    {/* 房间信息卡片 */}
                    <div className="bg-linear-to-r from-green-500 to-teal-600 rounded-xl p-6 text-white">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h3 className="text-2xl font-bold mb-1">{currentRoom.name}</h3>
                          <p className="text-green-100 text-sm">{currentRoom.description || '暂无描述'}</p>
                        </div>
                        {isOwner && (
                          <span className="bg-yellow-400 text-yellow-900 px-3 py-1 rounded-full text-xs font-bold">
                            房主
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-4 mt-4">
                        <div className="bg-white/10 backdrop-blur rounded-lg p-3">
                          <p className="text-green-100 text-xs mb-1">房间号</p>
                          <p className="text-xl font-mono font-bold">{currentRoom.id}</p>
                        </div>
                        <div className="bg-white/10 backdrop-blur rounded-lg p-3">
                          <p className="text-green-100 text-xs mb-1">成员数</p>
                          <p className="text-xl font-bold">{members.length} 人</p>
                        </div>
                      </div>
                    </div>

                    {/* 正在观看的影片 */}
                    {currentRoom.currentState && currentRoom.currentState.type === 'play' && (
                      <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <Play className="w-4 h-4 text-green-500" />
                          <h4 className="font-semibold text-gray-900 dark:text-gray-100">正在观看</h4>
                        </div>
                        <MiniVideoCard
                          title={currentRoom.currentState.videoName}
                          year={currentRoom.currentState.videoYear}
                          episode={currentRoom.currentState.episode}
                          poster={currentRoom.currentState.poster}
                          totalEpisodes={currentRoom.currentState.totalEpisodes}
                          onClick={() => {
                            const state = currentRoom.currentState as PlayState;
                            const params = new URLSearchParams();
                            params.set('id', state.videoId);
                            params.set('source', state.source);
                            params.set('title', state.videoName);
                            if (state.videoYear) params.set('year', state.videoYear);
                            if (state.searchTitle) params.set('stitle', state.searchTitle);
                            if (state.episode !== undefined && state.episode !== null) {
                              params.set('index', state.episode.toString());
                            }
                            if (state.currentTime) {
                              params.set('t', state.currentTime.toString());
                            }
                            params.set('prefer', 'true');
                            router.push(`/play?${params.toString()}`);
                          }}
                        />
                      </div>
                    )}

                    {/* 成员列表 */}
                    <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
                      <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">房间成员</h4>
                      <div className="space-y-2">
                        {members.map((member) => (
                          <div
                            key={member.id}
                            className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-lg p-3"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-linear-to-r from-green-400 to-teal-500 flex items-center justify-center text-white font-bold">
                                {member.name.charAt(0).toUpperCase()}
                              </div>
                              <span className="font-medium text-gray-900 dark:text-gray-100">
                                {member.name}
                              </span>
                            </div>
                            {member.isOwner && (
                              <span className="text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 px-2 py-1 rounded">
                                房主
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 提示信息 */}
                    <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
                      <p className="text-sm text-green-800 dark:text-green-200">
                        💡 {currentRoom.currentState && currentRoom.currentState.type === 'play'
                          ? '点击上方视频卡片可跳转到播放页面继续观看'
                          : isOwner
                            ? '前往播放页面开始观影，房间成员将自动同步您的操作'
                            : '等待房主开始播放，您的播放进度将自动跟随房主'}
                      </p>
                    </div>

                    {/* 离开/解散房间按钮 */}
                    <button
                      onClick={handleLeaveRoom}
                      className="w-full flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 text-white font-medium py-3 rounded-lg transition-colors"
                    >
                      <LogOut className="h-5 w-5" />
                      {isOwner ? '解散房间' : '退出房间'}
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleJoinRoom} className="space-y-4">
                  {/* 显示当前用户 */}
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 border border-green-200 dark:border-green-800">
                    <p className="text-sm text-green-800 dark:text-green-200">
                      <strong>当前用户：</strong>{currentUsername}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      房间号 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={joinForm.roomId}
                      onChange={(e) => setJoinForm({ ...joinForm, roomId: e.target.value.toUpperCase() })}
                      placeholder="请输入6位房间号"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-mono text-lg tracking-wider focus:outline-none focus:ring-2 focus:ring-green-500"
                      maxLength={6}
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      房间密码
                    </label>
                    <input
                      type="password"
                      value={joinForm.password}
                      onChange={(e) => setJoinForm({ ...joinForm, password: e.target.value })}
                      placeholder="如果房间有密码，请输入"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500"
                      maxLength={20}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={joinLoading || !joinForm.roomId.trim()}
                    className="w-full bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white font-medium py-3 rounded-lg transition-colors"
                  >
                    {joinLoading ? '加入中...' : '加入房间'}
                  </button>
                </form>
                )}
              </div>

              {/* 使用说明 - 仅在未在房间内时显示 */}
              {!currentRoom && (
                <div className="mt-6 bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
                  <p className="text-sm text-green-800 dark:text-green-200">
                    <strong>提示：</strong>加入房间后，您的播放进度将自动跟随房主的操作。
                  </p>
                </div>
              )}
            </div>
          )}

          {/* 房间列表 */}
          {activeTab === 'list' && (
            <div className="py-2 sm:py-4">
              {/* 顶部操作栏 */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                  找到 <span className="font-medium text-gray-900 dark:text-gray-100">{rooms.length}</span> 个公开房间
                </p>
                <button
                  onClick={loadRooms}
                  disabled={loading}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  刷新
                </button>
              </div>

              {/* 加载中 */}
              {loading && rooms.length === 0 && (
                <div className="flex items-center justify-center py-20">
                  <div className="text-center">
                    <RefreshCw className="mx-auto mb-4 h-12 w-12 animate-spin text-gray-400" />
                    <p className="text-gray-500 dark:text-gray-400">加载中...</p>
                  </div>
                </div>
              )}

              {/* 空状态 */}
              {!loading && rooms.length === 0 && (
                <div className="flex items-center justify-center py-20">
                  <div className="text-center">
                    <Users className="mx-auto mb-4 h-16 w-16 text-gray-400" />
                    <p className="mb-2 text-xl text-gray-600 dark:text-gray-400">暂无公开房间</p>
                    <p className="text-sm text-gray-500 dark:text-gray-500">
                      创建一个新房间或通过房间号加入私密房间
                    </p>
                  </div>
                </div>
              )}

              {/* 房间卡片列表 */}
              {rooms.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                  {rooms.map((room) => (
                    <div
                      key={room.id}
                      className="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow"
                    >
                      <div className="flex items-start justify-between mb-2.5">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-gray-100 truncate">
                            {room.name}
                          </h3>
                          {room.description && (
                            <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-1 mt-0.5">
                              {room.description}
                            </p>
                          )}
                        </div>
                        {room.password && (
                          <Lock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-yellow-500 shrink-0 ml-2" />
                        )}
                      </div>

                      <div className="space-y-1.5 text-xs sm:text-sm mb-3">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-500 dark:text-gray-400">房间号</span>
                          <span className="font-mono text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100">
                            {room.id}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                          <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          <span>{room.memberCount} 人在线</span>
                        </div>
                        <div className="flex items-center justify-between text-gray-600 dark:text-gray-400">
                          <span>房主</span>
                          <span className="font-medium truncate ml-2">{room.ownerName}</span>
                        </div>
                        <div className="flex items-center justify-between text-gray-600 dark:text-gray-400">
                          <span>创建时间</span>
                          <span className="whitespace-nowrap">{formatTime(room.createdAt)}</span>
                        </div>
                      </div>

                      {/* 正在观看的影片 - 小型卡片 */}
                      {room.currentState && room.currentState.type === 'play' && (() => {
                        const playState = room.currentState as PlayState;
                        return (
                          <div className="mb-3">
                            <div className="flex items-center gap-2 mb-2">
                              <Play className="w-4 h-4 text-green-500" />
                              <span className="text-sm font-medium text-green-600 dark:text-green-400">正在观看</span>
                            </div>
                            <MiniVideoCard
                              title={playState.videoName}
                              year={playState.videoYear}
                              episode={playState.episode}
                              poster={playState.poster}
                              totalEpisodes={playState.totalEpisodes}
                              onClick={() => {
                                // 房间列表：用户未加入房间，只跳转观看，不同步时间
                                const params = new URLSearchParams();
                                params.set('id', playState.videoId);
                                params.set('source', playState.source);
                                params.set('title', playState.videoName);
                                if (playState.videoYear) params.set('year', playState.videoYear);
                                if (playState.searchTitle) params.set('stitle', playState.searchTitle);
                                if (playState.episode !== undefined && playState.episode !== null) {
                                  params.set('index', playState.episode.toString());
                                }
                                // ⚠️ 不携带时间参数 t 和 prefer，因为用户还没加入房间

                                router.push(`/play?${params.toString()}`);
                              }}
                            />
                          </div>
                        );
                      })()}

                      <button
                        onClick={() => handleJoinFromList(room)}
                        className="w-full bg-purple-500 hover:bg-purple-600 text-white font-medium py-2.5 rounded-lg transition-colors"
                      >
                        加入房间
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
