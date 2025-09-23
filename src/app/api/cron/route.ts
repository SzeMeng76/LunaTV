/* eslint-disable no-console,@typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from 'next/server';

import { getConfig, refineConfig } from '@/lib/config';
import { db } from '@/lib/db';
import { fetchVideoDetail } from '@/lib/fetchVideoDetail';
import { refreshLiveChannels } from '@/lib/live';
import { SearchResult } from '@/lib/types';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  console.log(request.url);
  try {
    console.log('Cron job triggered:', new Date().toISOString());

    cronJob();

    return NextResponse.json({
      success: true,
      message: 'Cron job executed successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Cron job failed:', error);

    return NextResponse.json(
      {
        success: false,
        message: 'Cron job failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

async function cronJob() {
  console.log('🚀 开始执行定时任务...');

  try {
    console.log('📝 刷新配置...');
    await refreshConfig();
    console.log('✅ 配置刷新完成');
  } catch (err) {
    console.error('❌ 配置刷新失败:', err);
  }

  try {
    console.log('📺 刷新直播频道...');
    await refreshAllLiveChannels();
    console.log('✅ 直播频道刷新完成');
  } catch (err) {
    console.error('❌ 直播频道刷新失败:', err);
  }

  try {
    console.log('📊 刷新播放记录和收藏...');
    await refreshRecordAndFavorites();
    console.log('✅ 播放记录和收藏刷新完成');
  } catch (err) {
    console.error('❌ 播放记录和收藏刷新失败:', err);
  }

  try {
    console.log('🧹 执行用户清理任务...');
    await cleanupInactiveUsers();
    console.log('✅ 用户清理任务完成');
  } catch (err) {
    console.error('❌ 用户清理任务失败:', err);
  }

  console.log('🎉 定时任务执行完成');
}

async function refreshAllLiveChannels() {
  const config = await getConfig();

  // 并发刷新所有启用的直播源
  const refreshPromises = (config.LiveConfig || [])
    .filter(liveInfo => !liveInfo.disabled)
    .map(async (liveInfo) => {
      try {
        const nums = await refreshLiveChannels(liveInfo);
        liveInfo.channelNumber = nums;
      } catch (error) {
        console.error(`刷新直播源失败 [${liveInfo.name || liveInfo.key}]:`, error);
        liveInfo.channelNumber = 0;
      }
    });

  // 等待所有刷新任务完成
  await Promise.all(refreshPromises);

  // 保存配置
  await db.saveAdminConfig(config);
}

async function refreshConfig() {
  let config = await getConfig();
  if (config && config.ConfigSubscribtion && config.ConfigSubscribtion.URL && config.ConfigSubscribtion.AutoUpdate) {
    try {
      const response = await fetch(config.ConfigSubscribtion.URL);

      if (!response.ok) {
        throw new Error(`请求失败: ${response.status} ${response.statusText}`);
      }

      const configContent = await response.text();

      // 对 configContent 进行 base58 解码
      let decodedContent;
      try {
        const bs58 = (await import('bs58')).default;
        const decodedBytes = bs58.decode(configContent);
        decodedContent = new TextDecoder().decode(decodedBytes);
      } catch (decodeError) {
        console.warn('Base58 解码失败:', decodeError);
        throw decodeError;
      }

      try {
        JSON.parse(decodedContent);
      } catch (e) {
        throw new Error('配置文件格式错误，请检查 JSON 语法');
      }
      config.ConfigFile = decodedContent;
      config.ConfigSubscribtion.LastCheck = new Date().toISOString();
      config = refineConfig(config);
      await db.saveAdminConfig(config);
    } catch (e) {
      console.error('刷新配置失败:', e);
    }
  } else {
    console.log('跳过刷新：未配置订阅地址或自动更新');
  }
}

async function refreshRecordAndFavorites() {
  try {
    const users = await db.getAllUsers();
    console.log('📋 数据库中的用户列表:', users);
    
    if (process.env.USERNAME && !users.includes(process.env.USERNAME)) {
      users.push(process.env.USERNAME);
      console.log(`➕ 添加环境变量用户: ${process.env.USERNAME}`);
    }
    
    console.log('📋 最终处理用户列表:', users);
    // 函数级缓存：key 为 `${source}+${id}`，值为 Promise<VideoDetail | null>
    const detailCache = new Map<string, Promise<SearchResult | null>>();

    // 获取详情 Promise（带缓存和错误处理）
    const getDetail = async (
      source: string,
      id: string,
      fallbackTitle: string
    ): Promise<SearchResult | null> => {
      const key = `${source}+${id}`;
      let promise = detailCache.get(key);
      if (!promise) {
        promise = fetchVideoDetail({
          source,
          id,
          fallbackTitle: fallbackTitle.trim(),
        })
          .then((detail) => {
            // 成功时才缓存结果
            const successPromise = Promise.resolve(detail);
            detailCache.set(key, successPromise);
            return detail;
          })
          .catch((err) => {
            console.error(`获取视频详情失败 (${source}+${id}):`, err);
            return null;
          });
      }
      return promise;
    };

    for (const user of users) {
      console.log(`开始处理用户: ${user}`);
      
      // 检查用户是否真的存在
      const userExists = await db.checkUserExist(user);
      console.log(`用户 ${user} 是否存在: ${userExists}`);

      // 播放记录
      try {
        const playRecords = await db.getAllPlayRecords(user);
        const totalRecords = Object.keys(playRecords).length;
        let processedRecords = 0;

        for (const [key, record] of Object.entries(playRecords)) {
          try {
            const [source, id] = key.split('+');
            if (!source || !id) {
              console.warn(`跳过无效的播放记录键: ${key}`);
              continue;
            }

            const detail = await getDetail(source, id, record.title);
            if (!detail) {
              console.warn(`跳过无法获取详情的播放记录: ${key}`);
              continue;
            }

            const episodeCount = detail.episodes?.length || 0;
            if (episodeCount > 0 && episodeCount !== record.total_episodes) {
              await db.savePlayRecord(user, source, id, {
                title: detail.title || record.title,
                source_name: record.source_name,
                cover: detail.poster || record.cover,
                index: record.index,
                total_episodes: episodeCount,
                play_time: record.play_time,
                year: detail.year || record.year,
                total_time: record.total_time,
                save_time: record.save_time,
                search_title: record.search_title,
              });
              console.log(
                `更新播放记录: ${record.title} (${record.total_episodes} -> ${episodeCount})`
              );
            }

            processedRecords++;
          } catch (err) {
            console.error(`处理播放记录失败 (${key}):`, err);
            // 继续处理下一个记录
          }
        }

        console.log(`播放记录处理完成: ${processedRecords}/${totalRecords}`);
      } catch (err) {
        console.error(`获取用户播放记录失败 (${user}):`, err);
      }

      // 收藏
      try {
        let favorites = await db.getAllFavorites(user);
        favorites = Object.fromEntries(
          Object.entries(favorites).filter(([_, fav]) => fav.origin !== 'live')
        );
        const totalFavorites = Object.keys(favorites).length;
        let processedFavorites = 0;

        for (const [key, fav] of Object.entries(favorites)) {
          try {
            const [source, id] = key.split('+');
            if (!source || !id) {
              console.warn(`跳过无效的收藏键: ${key}`);
              continue;
            }

            const favDetail = await getDetail(source, id, fav.title);
            if (!favDetail) {
              console.warn(`跳过无法获取详情的收藏: ${key}`);
              continue;
            }

            const favEpisodeCount = favDetail.episodes?.length || 0;
            if (favEpisodeCount > 0 && favEpisodeCount !== fav.total_episodes) {
              await db.saveFavorite(user, source, id, {
                title: favDetail.title || fav.title,
                source_name: fav.source_name,
                cover: favDetail.poster || fav.cover,
                year: favDetail.year || fav.year,
                total_episodes: favEpisodeCount,
                save_time: fav.save_time,
                search_title: fav.search_title,
              });
              console.log(
                `更新收藏: ${fav.title} (${fav.total_episodes} -> ${favEpisodeCount})`
              );
            }

            processedFavorites++;
          } catch (err) {
            console.error(`处理收藏失败 (${key}):`, err);
            // 继续处理下一个收藏
          }
        }

        console.log(`收藏处理完成: ${processedFavorites}/${totalFavorites}`);
      } catch (err) {
        console.error(`获取用户收藏失败 (${user}):`, err);
      }
    }

    console.log('刷新播放记录/收藏任务完成');
  } catch (err) {
    console.error('刷新播放记录/收藏任务启动失败', err);
  }
}

async function cleanupInactiveUsers() {
  try {
    const config = await getConfig();

    // 检查是否启用自动清理功能
    const autoCleanupEnabled = config.UserConfig?.AutoCleanupInactiveUsers ?? false;
    if (!autoCleanupEnabled) {
      console.log('⏭️ 自动清理非活跃用户功能已禁用，跳过清理任务');
      return;
    }

    console.log('🧹 开始清理非活跃用户...');

    const allUsers = config.UserConfig.Users;
    const envUsername = process.env.USERNAME;
    const inactiveUserDays = config.UserConfig?.InactiveUserDays ?? 7; // 默认7天

    const cutoffTime = Date.now() - (inactiveUserDays * 24 * 60 * 60 * 1000);
    let deletedCount = 0;

    for (const user of allUsers) {
      try {
        // 跳过管理员和owner用户
        if (user.role === 'admin' || user.role === 'owner') {
          continue;
        }

        // 跳过环境变量中的用户
        if (user.username === envUsername) {
          continue;
        }

        // 检查用户是否存在于数据库中
        const userExists = await db.checkUserExist(user.username);
        if (!userExists) {
          console.log(`⚠️ 用户 ${user.username} 在配置中存在但数据库中不存在，跳过处理`);
          continue;
        }

        // 获取用户统计信息
        const userStats = await db.getUserPlayStat(user.username);
        const userCreatedAt = user.createdAt || Date.now(); // 如果没有创建时间，使用当前时间（不会被删除）

        // 检查是否满足删除条件：
        // 1. 注册时间超过配置的天数
        // 2. 从未播放过内容（lastPlayTime为0或非常小的值）
        const isOldEnough = userCreatedAt < cutoffTime;
        const hasNeverPlayed = userStats.lastPlayTime === 0 || userStats.totalPlays === 0;

        if (isOldEnough && hasNeverPlayed) {
          console.log(`🗑️ 删除非活跃用户: ${user.username} (注册于: ${new Date(userCreatedAt).toISOString()}, 播放次数: ${userStats.totalPlays}, 设置阈值: ${inactiveUserDays}天)`);

          // 从数据库删除用户数据
          await db.deleteUser(user.username);

          // 从配置中移除用户
          const userIndex = config.UserConfig.Users.findIndex(u => u.username === user.username);
          if (userIndex !== -1) {
            config.UserConfig.Users.splice(userIndex, 1);
          }

          deletedCount++;
        } else {
          const reason = !isOldEnough ? `注册时间不足${inactiveUserDays}天` : '用户有播放记录';
          console.log(`✅ 保留用户 ${user.username}: ${reason}`);
        }

      } catch (err) {
        console.error(`❌ 处理用户 ${user.username} 时出错:`, err);
      }
    }

    // 如果有删除操作，保存更新后的配置
    if (deletedCount > 0) {
      await db.saveAdminConfig(config);
      console.log(`✨ 清理完成，共删除 ${deletedCount} 个非活跃用户`);
    } else {
      console.log('✨ 清理完成，无需删除任何用户');
    }

  } catch (err) {
    console.error('🚫 清理非活跃用户任务失败:', err);
  }
}
