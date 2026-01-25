// 观影室相关类型定义

// WebRTC 类型定义
export type RTCSessionDescriptionInit = {
  type: 'offer' | 'answer';
  sdp: string;
};

export type RTCIceCandidateInit = {
  candidate: string;
  sdpMLineIndex?: number | null;
  sdpMid?: string | null;
};

// 房间信息
export interface Room {
  id: string;
  name: string;
  description: string;
  password?: string;
  isPublic: boolean;
  ownerId: string;
  ownerName: string;
  ownerToken: string;
  memberCount: number;
  currentState: PlayState | LiveState | null;
  createdAt: number;
  lastOwnerHeartbeat: number;
}

// 成员信息
export interface Member {
  id: string;
  name: string;
  isOwner: boolean;
  lastHeartbeat: number;
}

// 播放状态
export interface PlayState {
  type: 'play';
  url: string;
  currentTime: number;
  isPlaying: boolean;
  videoId: string;
  videoName: string;
  videoYear?: string;
  searchTitle?: string;
  episode?: number;
  source: string;
  poster?: string;  // 海报图片
  totalEpisodes?: number;  // 总集数（用于判断是否显示集数信息）
  doubanId?: number;  // 豆瓣ID（用于准确判断是否是同一部视频）
}

// 直播状态
export interface LiveState {
  type: 'live';
  channelId: string;
  channelName: string;
  channelUrl: string;
}

// 聊天消息
export interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  content: string;
  type: 'text' | 'emoji';
  timestamp: number;
}

// 房间成员信息
export interface RoomMemberInfo {
  roomId: string;
  userId: string;
  userName: string;
  isOwner: boolean;
}

// Socket.IO 服务器到客户端事件
export interface ServerToClientEvents {
  'room:created': (room: Room) => void;
  'room:joined': (data: { room: Room; members: Member[] }) => void;
  'room:left': () => void;
  'room:list': (rooms: Room[]) => void;
  'room:member-joined': (member: Member) => void;
  'room:member-left': (userId: string) => void;
  'room:deleted': () => void;
  'play:update': (state: PlayState) => void;
  'play:seek': (currentTime: number) => void;
  'play:play': () => void;
  'play:pause': () => void;
  'play:change': (state: PlayState) => void;
  'live:change': (state: LiveState) => void;
  'chat:message': (message: ChatMessage) => void;
  'voice:offer': (data: { userId: string; offer: RTCSessionDescriptionInit }) => void;
  'voice:answer': (data: { userId: string; answer: RTCSessionDescriptionInit }) => void;
  'voice:ice': (data: { userId: string; candidate: RTCIceCandidateInit }) => void;
  'voice:mic-enabled': (data: { userId: string }) => void;
  'voice:audio-chunk': (data: { userId: string; audioData: number[]; sampleRate?: number }) => void;
  'state:cleared': () => void;
  'heartbeat:pong': (data: { timestamp: number }) => void;
  error: (message: string) => void;
}

// Socket.IO 客户端到服务器事件
export interface ClientToServerEvents {
  'room:create': (
    data: {
      name: string;
      description: string;
      password?: string;
      isPublic: boolean;
      userName: string;
    },
    callback: (response: { success: boolean; room?: Room; error?: string }) => void
  ) => void;

  'room:join': (
    data: {
      roomId: string;
      password?: string;
      userName: string;
      ownerToken?: string;
    },
    callback: (response: { success: boolean; room?: Room; members?: Member[]; error?: string }) => void
  ) => void;

  'room:leave': () => void;

  'room:list': (callback: (rooms: Room[]) => void) => void;

  'play:update': (state: PlayState) => void;
  'play:seek': (currentTime: number) => void;
  'play:play': () => void;
  'play:pause': () => void;
  'play:change': (state: PlayState) => void;

  'live:change': (state: LiveState) => void;

  'chat:message': (data: { content: string; type: 'text' | 'emoji' }) => void;

  'voice:offer': (data: { targetUserId: string; offer: RTCSessionDescriptionInit }) => void;
  'voice:answer': (data: { targetUserId: string; answer: RTCSessionDescriptionInit }) => void;
  'voice:ice': (data: { targetUserId: string; candidate: RTCIceCandidateInit }) => void;
  'voice:audio-chunk': (data: { roomId: string; audioData: number[]; sampleRate?: number }) => void;

  'state:clear': (callback?: (response: { success: boolean; error?: string }) => void) => void;

  heartbeat: () => void;
}

// 观影室配置
export interface WatchRoomConfig {
  enabled: boolean;
  serverUrl: string;
  authKey?: string;
}
