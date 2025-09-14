// /functions/api/messages.js

// 引入 Neon 的 serverless 驱动
import { Pool } from '@neondatabase/serverless';

// 全局变量，用于缓存连接池实例
let pool;

function getPool(context) {
  // 如果连接池还没有被创建，就创建一个新的
  if (!pool) {
    console.log("Creating new database connection pool.");
    pool = new Pool({ connectionString: context.env.DATABASE_URL });
  }
  // 否则，返回已经存在的连接池
  return pool;
}

// 初始化数据库表的函数保持不变
async function initializeSchema(context) {
    const dbPool = getPool(context);
    const client = await dbPool.connect();
    console.log("Initializing schema if not exists...");
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                text VARCHAR(255) NOT NULL,
                timestamp TIMESTAMPTZ DEFAULT NOW()
            );
        `);
        console.log("Schema initialization successful.");
    } catch (e) {
        console.error("CRITICAL ERROR during schema initialization!", e.message, e.stack);
        // 如果建表失败，直接抛出异常，阻止后续操作
        throw e; 
    } finally {
        client.release();
    }
}

// 处理 GET 请求
async function handleGet(context) {
    console.log("handleGet: Received a GET request.");
    try {
        const dbPool = getPool(context);
        console.log("handleGet: Attempting to query database.");
        const { rows: messages } = await dbPool.query(
            'SELECT id, text, timestamp FROM messages ORDER BY timestamp DESC LIMIT 50;'
        );
        console.log("handleGet: Database query successful.");
        return new Response(JSON.stringify(messages), {
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (e) {
        console.error("handleGet: CRITICAL ERROR fetching messages!", e.message, e.stack);
        return new Response('Error fetching messages: ' + e.message, { status: 500 });
    }
}

// 处理 POST 请求
async function handlePost(context) {
    console.log("handlePost: Received a POST request.");
    try {
        const { text } = await context.request.json();
        if (!text || typeof text !== 'string' || text.trim() === '') {
            return new Response('Invalid "text" in request body', { status: 400 });
        }
        
        const dbPool = getPool(context);
        await dbPool.query(
            'INSERT INTO messages (text) VALUES ($1);', 
            [text.trim()]
        );
        console.log("handlePost: Message added successfully.");
        return new Response('Message added successfully', { status: 201 });
    } catch (e) {
        console.error("handlePost: CRITICAL ERROR adding message!", e.message, e.stack);
        return new Response('Error adding message: ' + e.message, { status: 500 });
    }
}

// Pages Functions 的主入口点
export async function onRequest(context) {
    // 确保数据库表只在第一次调用时初始化
    // 我们使用一个简单的技巧，通过全局变量来确保只执行一次
    if (!globalThis.schemaInitialized) {
        try {
            await initializeSchema(context);
            globalThis.schemaInitialized = true;
        } catch (initError) {
             // 如果初始化失败，后续所有请求都返回错误
            return new Response('Database initialization failed. Please check logs.', { status: 500 });
        }
    }

    if (context.request.method === 'GET') {
        return await handleGet(context);
    }

    if (context.request.method === 'POST') {
        return await handlePost(context);
    }

    return new Response('Method Not Allowed', { status: 405 });
}