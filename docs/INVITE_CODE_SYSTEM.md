# 邀请码注册系统

基于 Redis + nanoid 实现的邀请码注册系统，用于控制用户注册。

## 功能特性

- ✅ 管理员生成邀请码
- ✅ 邀请码使用次数限制
- ✅ 邀请码自动过期
- ✅ 追踪邀请关系
- ✅ 邀请码统计信息
- ✅ 8位友好邀请码（排除易混淆字符）

## 配置

在配置文件中添加以下选项：

```json
{
  "UserConfig": {
    "AllowRegister": true,
    "RequireInviteCode": true  // 启用邀请码系统
  }
}
```

## API 接口

### 管理员接口

#### 1. 生成邀请码
```http
POST /api/admin/invites
Authorization: Required (Admin)

Body:
{
  "maxUses": 10,        // 最大使用次数，默认 10
  "expiresIn": 604800   // 过期时间（秒），默认 7天
}

Response:
{
  "ok": true,
  "code": "A3K9M2P7",
  "message": "邀请码生成成功"
}
```

#### 2. 获取邀请码列表
```http
GET /api/admin/invites
Authorization: Required (Admin)

Response:
{
  "ok": true,
  "codes": [
    {
      "code": "A3K9M2P7",
      "createdBy": "admin",
      "createdAt": "2024-03-30T10:00:00.000Z",
      "maxUses": 10,
      "currentUses": 3,
      "remainingUses": 7,
      "expiresAt": "2024-04-06T10:00:00.000Z",
      "expired": false,
      "users": ["user1", "user2", "user3"]
    }
  ],
  "total": 1
}
```

#### 3. 删除邀请码
```http
DELETE /api/admin/invites?code=A3K9M2P7
Authorization: Required (Admin)

Response:
{
  "ok": true,
  "message": "邀请码已删除"
}
```

### 公开接口

#### 验证邀请码
```http
POST /api/invites/validate

Body:
{
  "code": "A3K9M2P7"
}

Response (成功):
{
  "valid": true,
  "remainingUses": 7
}

Response (失败):
{
  "valid": false,
  "error": "邀请码不存在或已失效"
}
```

#### 注册（使用邀请码）
```http
POST /api/register

Body:
{
  "username": "newuser",
  "password": "password123",
  "confirmPassword": "password123",
  "inviteCode": "A3K9M2P7"  // 当 RequireInviteCode=true 时必填
}
```

## Redis 数据结构

```
# 邀请码详情
HASH invite:A3K9M2P7
  code: "A3K9M2P7"
  createdBy: "admin"
  createdAt: 1711800000000
  maxUses: 10
  currentUses: 3
  expiresAt: 1712404800000

# 邀请码使用者列表
LIST invite:A3K9M2P7:users
  ["user1", "user2", "user3"]

# 活跃邀请码集合
SET invites:active
  ["A3K9M2P7", "B4H8N3Q9", ...]

# 管理员的邀请码列表
SET admin:USERNAME:invites
  ["A3K9M2P7", "B4H8N3Q9", ...]
```

## 邀请码格式

- 长度：8位
- 字符集：`23456789ABCDEFGHJKLMNPQRSTUVWXYZ`
- 排除易混淆字符：`0/O`, `1/I/l`
- 示例：`A3K9M2P7`, `B4H8N3Q9`

## 使用流程

1. **管理员生成邀请码**
   ```bash
   curl -X POST http://localhost:3000/api/admin/invites \
     -H "Cookie: user_auth=..." \
     -H "Content-Type: application/json" \
     -d '{"maxUses": 10, "expiresIn": 604800}'
   ```

2. **用户验证邀请码**（可选，前端实时验证）
   ```bash
   curl -X POST http://localhost:3000/api/invites/validate \
     -H "Content-Type: application/json" \
     -d '{"code": "A3K9M2P7"}'
   ```

3. **用户注册**
   ```bash
   curl -X POST http://localhost:3000/api/register \
     -H "Content-Type: application/json" \
     -d '{
       "username": "newuser",
       "password": "password123",
       "confirmPassword": "password123",
       "inviteCode": "A3K9M2P7"
     }'
   ```

## 注意事项

- 邀请码系统需要 Redis 存储（不支持 localStorage 模式）
- 邀请码达到最大使用次数后自动失效
- 邀请码过期后自动清理
- 管理员可以手动删除邀请码
- 邀请码不区分大小写（自动转大写）

## 依赖

- `nanoid`: ^5.1.7 - 生成唯一ID
- `redis`: ^4.6.7 - Redis客户端
