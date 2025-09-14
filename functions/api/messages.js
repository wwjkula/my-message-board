// 引入 Neon 的 serverless 驱动
import { Pool } from '@neondatabase/serverless';

// 初始化数据库表 (如果不存在)
// 这个函数只在第一次被调用时，或者表被意外删除时执行
async function initializeSchema(context) {
    const pool = new Pool({ connectionString: context.env.DATABASE_URL });
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                text VARCHAR(255) NOT NULL,
                timestamp TIMESTAMPTZ DEFAULT NOW()
            );
        `);
    } finally {
        // 确保连接被释放回连接池
        client.release();
    }
}


// 处理 GET 请求 - 获取所有留言
async function handleGet(context) {
    // context.env.DATABASE_URL 是我们在 Cloudflare 后台设置的环境变量
    const pool = new Pool({ connectionString: context.env.DATABASE_URL });
    try {
        const { rows: messages } = await pool.query(
            'SELECT id, text, timestamp FROM messages ORDER BY timestamp DESC LIMIT 50;'
        );
        return new Response(JSON.stringify(messages), {
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (e) {
        console.error(e);
        return new Response('Error fetching messages', { status: 500 });
    }
    // 注意：这里的 pool 不需要手动关闭，驱动会自动管理
}

// 处理 POST 请求 - 新增一条留言
async function handlePost(context) {
    const pool = new Pool({ connectionString: context.env.DATABASE_URL });
    try {
        const { text } = await context.request.json();
        if (!text || typeof text !== 'string') {
            return new Response('Invalid "text" in request body', { status: 400 });
        }
        
        await pool.query(
            'INSERT INTO messages (text) VALUES ($1);', 
            [text] // 使用参数化查询防止 SQL 注入
        );
        
        return new Response('Message added successfully', { status: 201 });
    } catch (e) {
        console.error(e);
        return new Response('Error adding message', { status: 500 });
    }
}


// Pages Functions 的主入口点
export async function onRequest(context) {
    // 确保数据库表已创建
    await initializeSchema(context);

    if (context.request.method === 'GET') {
        return await handleGet(context);
    }

    if (context.request.method === 'POST') {
        return await handlePost(context);
    }

    return new Response('Method Not Allowed', { status: 405 });
}