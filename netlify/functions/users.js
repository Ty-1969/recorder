const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Supabase 環境變數未設定');
}

const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
};

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (!supabase) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: '資料庫連線未設定'
      })
    };
  }

  const path = event.path.split('/').pop();
  const token = event.headers.authorization?.replace('Bearer ', '');

  try {
    // 登入（使用使用者名稱和密碼）
    if (path === 'login' && event.httpMethod === 'POST') {
      const { username, password } = JSON.parse(event.body || '{}');

      if (!username || !username.trim()) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            error: '使用者名稱為必填'
          })
        };
      }

      if (!password) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            error: '密碼為必填'
          })
        };
      }

      // 檢查密碼是否為369
      if (password !== '369') {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({
            success: false,
            error: '密碼錯誤'
          })
        };
      }

      const usernameTrimmed = username.trim().toLowerCase();

      // 檢查使用者是否存在
      let { data: profile, error: fetchError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('username', usernameTrimmed)
        .single();

      // 如果使用者不存在，自動建立
      if (!profile || fetchError) {
        // 生成簡單的 UUID（使用 crypto 或 Supabase 的 uuid_generate_v4）
        // 在 Node.js 18+ 中，crypto.randomUUID() 可用
        let userId;
        try {
          const crypto = require('crypto');
          userId = crypto.randomUUID();
        } catch (e) {
          // 如果 crypto.randomUUID 不可用，使用簡單的 UUID v4 生成
          userId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
          });
        }

        const { data: newProfile, error: insertError } = await supabase
          .from('user_profiles')
          .insert({
            id: userId,
            username: usernameTrimmed,
            display_name: usernameTrimmed
          })
          .select()
          .single();

        if (insertError) {
          // 如果插入失敗，可能是使用者名稱已存在（並發情況）
          const { data: retryProfile } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('username', usernameTrimmed)
            .single();

          if (retryProfile) {
            profile = retryProfile;
          } else {
            throw insertError;
          }
        } else {
          profile = newProfile;
        }
      }

      // 生成簡單的 token（使用使用者 ID + 時間戳）
      const simpleToken = Buffer.from(`${profile.id}:${Date.now()}`).toString('base64');

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          token: simpleToken,
          user: {
            id: profile.id,
            username: profile.username,
            display_name: profile.display_name || profile.username
          }
        })
      };
    }

    // 取得當前使用者
    if (path === 'me' && event.httpMethod === 'GET') {
      if (!token) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({
            success: false,
            error: '未授權'
          })
        };
      }

      try {
        // 解析 token 取得使用者 ID
        const tokenData = Buffer.from(token, 'base64').toString('utf-8');
        const userId = tokenData.split(':')[0];

        const { data: profile, error: profileError } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', userId)
          .single();

        if (profileError || !profile) {
          throw new Error('使用者不存在');
        }

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            user: {
              id: profile.id,
              username: profile.username,
              display_name: profile.display_name || profile.username
            }
          })
        };
      } catch (error) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({
            success: false,
            error: '無效的 token'
          })
        };
      }
    }

    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({
        success: false,
        error: '找不到端點'
      })
    };

  } catch (error) {
    console.error('Function 錯誤:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message || '伺服器錯誤'
      })
    };
  }
};

