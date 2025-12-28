// 观影室聊天悬浮窗和房间信息
'use client';

import { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, Send, Smile, Info, Users, LogOut, Mic, MicOff, Volume2, VolumeX, Play } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useWatchRoomContextSafe } from '@/components/WatchRoomProvider';
import { useVoiceChat } from '@/hooks/useVoiceChat';
import MiniVideoCard from '@/components/watch-room/MiniVideoCard';
import type { PlayState } from '@/types/watch-room.types';

const EMOJI_LIST = ['😀', '😂', '😍', '🥰', '😎', '🤔', '👍', '👏', '🎉', '❤️', '🔥', '⭐'];

export default function ChatFloatingWindow() {
  const router = useRouter();
  const watchRoom = useWatchRoomContextSafe();
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showRoomInfo, setShowRoomInfo] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastMessageCountRef = useRef(0);
  const isOpenRef = useRef(isOpen);
  const currentRoomIdRef = useRef<string | null>(null);

  // 语音聊天状态
  const [isMicEnabled, setIsMicEnabled] = useState(false);
  const [isSpeakerEnabled, setIsSpeakerEnabled] = useState(true);

  // 使用语音聊天hook
  const voiceChat = useVoiceChat({
    socket: watchRoom?.socket || null,
    roomId: watchRoom?.currentRoom?.id || null,
    isMicEnabled,
    isSpeakerEnabled,
    members: watchRoom?.members || [],
  });

  // 当房间变化时重置状态
  useEffect(() => {
    const roomId = watchRoom?.currentRoom?.id || null;
    if (roomId !== currentRoomIdRef.current) {
      currentRoomIdRef.current = roomId;
      lastMessageCountRef.current = 0;
      setUnreadCount(0);
      setIsOpen(false);
    }
  }, [watchRoom?.currentRoom?.id]);

  // 同步窗口状态到 ref
  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  // 自动滚动到底部
  useEffect(() => {
    if (messagesEndRef.current && watchRoom?.currentRoom) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [watchRoom?.chatMessages, watchRoom?.currentRoom]);

  // 跟踪未读消息数量
  useEffect(() => {
    if (!watchRoom?.chatMessages) {
      lastMessageCountRef.current = 0;
      return;
    }

    const currentCount = watchRoom.chatMessages.length;

    if (currentCount < lastMessageCountRef.current) {
      lastMessageCountRef.current = currentCount;
      setUnreadCount(0);
      return;
    }

    if (currentCount > lastMessageCountRef.current) {
      const newMessageCount = currentCount - lastMessageCountRef.current;
      if (!isOpenRef.current) {
        setUnreadCount((prev) => prev + newMessageCount);
      }
    }
    lastMessageCountRef.current = currentCount;
  }, [watchRoom?.chatMessages]);

  // 打开聊天窗口时清空未读计数
  useEffect(() => {
    if (isOpen) {
      setUnreadCount(0);
    }
  }, [isOpen]);

  // 如果没有加入房间或未启用，不显示
  if (!watchRoom?.currentRoom || !watchRoom?.isEnabled) {
    return null;
  }

  const { chatMessages, sendChatMessage, members, isOwner, currentRoom, leaveRoom } = watchRoom;

  const handleSendMessage = () => {
    if (!message.trim()) return;

    sendChatMessage(message.trim(), 'text');
    setMessage('');
    setShowEmojiPicker(false);
  };

  const handleSendEmoji = (emoji: string) => {
    sendChatMessage(emoji, 'emoji');
    setShowEmojiPicker(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleLeaveRoom = () => {
    if (confirm(isOwner ? '确定要解散房间吗？所有成员将被踢出房间。' : '确定要退出房间吗？')) {
      leaveRoom();
      setShowRoomInfo(false);
    }
  };

  // 悬浮按钮组
  if (!isOpen && !showRoomInfo) {
    return (
      <div className="fixed bottom-20 right-4 z-700 flex flex-col gap-2 sm:gap-3 sm:bottom-24 sm:right-6 md:bottom-24">
        {/* 房间信息按钮 */}
        <button
          onClick={() => setShowRoomInfo(true)}
          className="group relative flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full bg-indigo-500 text-white shadow-2xl transition-all hover:scale-110 hover:bg-indigo-600 active:scale-95"
          aria-label="房间信息"
          title="房间信息"
        >
          <Info className="h-5 w-5 sm:h-6 sm:w-6" />
        </button>

        {/* 聊天按钮 */}
        <button
          onClick={() => setIsOpen(true)}
          className="group relative flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full bg-green-500 text-white shadow-2xl transition-all hover:scale-110 hover:bg-green-600 active:scale-95"
          aria-label="打开聊天"
          title="聊天"
        >
          <MessageCircle className="h-5 w-5 sm:h-6 sm:w-6" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 sm:-right-1 sm:-top-1 flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full bg-red-500 text-[10px] sm:text-xs font-bold">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </div>
    );
  }

  // 房间信息面板
  if (showRoomInfo) {
    return (
      <div className="fixed inset-x-4 bottom-20 z-700 rounded-t-2xl sm:inset-x-auto sm:bottom-24 sm:right-6 sm:w-80 sm:rounded-2xl bg-white dark:bg-gray-800 shadow-2xl max-h-[70vh] sm:max-h-[600px] flex flex-col">
        {/* 头部 - Fixed */}
        <div className="shrink-0 flex items-center justify-between border-b border-gray-200 dark:border-gray-700 p-3 sm:p-4">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-500" />
            <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100">房间信息</h3>
          </div>
          <button
            onClick={() => setShowRoomInfo(false)}
            className="rounded-lg p-1 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors active:scale-95"
          >
            <X className="h-4 w-4 sm:h-5 sm:w-5 text-gray-500" />
          </button>
        </div>

        {/* 房间详情 - Scrollable */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3">
          <div>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">房间名称</p>
            <p className="text-sm sm:text-base font-medium text-gray-900 dark:text-gray-100 truncate">{currentRoom.name}</p>
          </div>

          {currentRoom.description && (
            <div>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">房间描述</p>
              <p className="text-sm sm:text-base text-gray-900 dark:text-gray-100 line-clamp-2">{currentRoom.description}</p>
            </div>
          )}

          <div>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">房间号</p>
            <p className="font-mono font-bold text-base sm:text-lg text-gray-900 dark:text-gray-100">{currentRoom.id}</p>
          </div>

          {/* 正在观看的影片 */}
          {currentRoom.currentState && currentRoom.currentState.type === 'play' && (
            <div>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1">
                <Play className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-green-500" />
                正在观看
              </p>
              <MiniVideoCard
                title={currentRoom.currentState.videoName}
                year={currentRoom.currentState.videoYear}
                episode={currentRoom.currentState.episode}
                poster={currentRoom.currentState.poster}
                totalEpisodes={currentRoom.currentState.totalEpisodes}
                onClick={() => {
                  const state = currentRoom.currentState as PlayState;
                  // 构建URL，携带时间参数实现同步
                  const params = new URLSearchParams();
                  params.set('id', state.videoId);
                  params.set('source', state.source);
                  params.set('title', state.videoName);
                  if (state.videoYear) params.set('year', state.videoYear);
                  if (state.searchTitle) params.set('stitle', state.searchTitle);
                  if (state.episode !== undefined && state.episode !== null) {
                    params.set('index', state.episode.toString());
                  }
                  // 🎯 关键：携带当前播放时间，实现时间同步
                  if (state.currentTime) {
                    params.set('t', state.currentTime.toString());
                  }
                  params.set('prefer', 'true');

                  router.push(`/play?${params.toString()}`);
                  setShowRoomInfo(false);
                }}
              />
            </div>
          )}

          <div>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1">
              <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              成员列表 ({members.length})
            </p>
            <div className="space-y-2 max-h-32 sm:max-h-40 overflow-y-auto">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 rounded-lg p-2"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-linear-to-r from-indigo-400 to-purple-500 flex items-center justify-center text-white font-bold text-xs sm:text-sm shrink-0">
                      {member.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm sm:text-base font-medium text-gray-900 dark:text-gray-100 truncate">{member.name}</span>
                  </div>
                  {member.isOwner && (
                    <span className="text-[10px] sm:text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded whitespace-nowrap ml-2 shrink-0">
                      房主
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={handleLeaveRoom}
            className="w-full flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white font-medium py-2 px-3 sm:px-4 rounded-lg transition-colors text-sm sm:text-base"
          >
            <LogOut className="h-4 w-4" />
            {isOwner ? '解散房间' : '退出房间'}
          </button>
        </div>
      </div>
    );
  }

  // 聊天窗口
  return (
    <div className="fixed inset-x-4 bottom-20 z-700 flex flex-col rounded-t-2xl sm:inset-x-auto sm:bottom-24 sm:right-6 sm:w-80 sm:rounded-2xl bg-white dark:bg-gray-800 shadow-2xl" style={{ height: 'min(500px, 70vh)' }}>
      {/* 头部 - Fixed */}
      <div className="shrink-0 flex items-center justify-between border-b border-gray-200 dark:border-gray-700 p-3 sm:p-4">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 sm:h-5 sm:w-5 text-green-500" />
          <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100">聊天室</h3>
          <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">({members.length}人)</span>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          {/* 麦克风开关 */}
          <button
            onClick={() => setIsMicEnabled(!isMicEnabled)}
            className={`rounded-lg p-1.5 sm:p-2 transition-colors ${
              isMicEnabled
                ? 'bg-green-500 text-white hover:bg-green-600'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
            title={isMicEnabled ? '关闭麦克风' : '打开麦克风'}
          >
            {isMicEnabled ? <Mic className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : <MicOff className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
          </button>
          {/* 扬声器开关 */}
          <button
            onClick={() => setIsSpeakerEnabled(!isSpeakerEnabled)}
            className={`rounded-lg p-1.5 sm:p-2 transition-colors ${
              isSpeakerEnabled
                ? 'bg-blue-500 text-white hover:bg-blue-600'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
            title={isSpeakerEnabled ? '关闭扬声器' : '打开扬声器'}
          >
            {isSpeakerEnabled ? <Volume2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : <VolumeX className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="rounded-lg p-1 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors active:scale-95"
          >
            <X className="h-4 w-4 sm:h-5 sm:w-5 text-gray-500" />
          </button>
        </div>
      </div>

      {/* 消息列表 - Scrollable */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2 sm:space-y-3">
        {chatMessages.map((msg) => (
          <div key={msg.id} className="flex flex-col gap-0.5 sm:gap-1">
            <div className="flex items-baseline gap-1.5 sm:gap-2">
              <span className="text-[10px] sm:text-xs font-medium text-indigo-600 dark:text-indigo-400 truncate max-w-[120px] sm:max-w-none">{msg.userName}</span>
              <span className="text-[10px] sm:text-xs text-gray-400 shrink-0">{formatTime(msg.timestamp)}</span>
            </div>
            <div
              className={`rounded-lg px-2.5 py-1.5 sm:px-3 sm:py-2 ${
                msg.type === 'emoji'
                  ? 'text-2xl sm:text-3xl'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm sm:text-base break-words'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入区 - Fixed */}
      <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 p-2.5 sm:p-4">
        {showEmojiPicker && (
          <div className="mb-2 sm:mb-3 grid grid-cols-6 gap-1.5 sm:gap-2 rounded-lg bg-gray-50 dark:bg-gray-700 p-1.5 sm:p-2">
            {EMOJI_LIST.map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleSendEmoji(emoji)}
                className="rounded p-1.5 sm:p-2 text-xl sm:text-2xl hover:bg-gray-200 dark:hover:bg-gray-600 active:scale-95 transition-all"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-1.5 sm:gap-2">
          <button
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="rounded-lg p-1.5 sm:p-2 hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-95 transition-all shrink-0"
          >
            <Smile className="h-4 w-4 sm:h-5 sm:w-5 text-gray-500" />
          </button>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息..."
            className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2.5 py-1.5 sm:px-3 sm:py-2 text-sm sm:text-base text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <button
            onClick={handleSendMessage}
            disabled={!message.trim()}
            className="rounded-lg bg-green-500 p-1.5 sm:p-2 text-white hover:bg-green-600 active:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            <Send className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
