// /functions/api/messages.js

// 引入 Neon 的 serverless 驱动
import { Pool } from '@neondatabase/serverless';

// 初始化数据库表的函数，现在它在内部创建自己的连接池
async function initializeSchema(context) {
    // !! 关键改动：在这里创建临时的 Pool !!
    const pool = new Pool({ connectionString: context.env.DATABASE_URL });
    const client = await pool.connect();
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
        throw e;
    } finally {
        client.release();
        // !! 关键改动：用完后立即结束这个临时 Pool !!
        await pool.end();
    }
}

// 处理 GET 请求
async function handleGet(context) {
    console.log("handleGet: Received a GET request.");
    // !! 关键改动：在这里创建本次请求专用的 Pool !!
    const pool = new Pool({ connectionString: context.env.DATABASE_URL });
    try {
        console.log("handleGet: Attempting to query database.");
        const { rows: messages } = await pool.query(
            'SELECT id, text, timestamp FROM messages ORDER BY timestamp DESC LIMIT 50;'
        );
        console.log("handleGet: Database query successful.");
        return new Response(JSON.stringify(messages), {
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (e) {
        console.error("handleGet: CRITICAL ERROR fetching messages!", e.message, e.stack);
        return new Response('Error fetching messages: ' + e.message, { status: 500 });
    } finally {
        // !! 关键改动：请求处理完后立即结束这个 Pool !!
        await pool.end();
    }
}

// 处理 POST 请求
async function handlePost(context) {
    console.log("handlePost: Received a POST request.");
    // !! 关键改动：在这里创建本次请求专用的 Pool !!
    const pool = new Pool({ connectionString: context.env.DATABASE_URL });
    try {
        const { text } = await context.request.json();
        if (!text || typeof text !== 'string' || text.trim() === '') {
            return new Response('Invalid "text" in request body', { status: 400 });
        }
        
        await pool.query(
            'INSERT INTO messages (text) VALUES ($1);', 
            [text.trim()]
        );
        console.log("handlePost: Message added successfully.");
        return new Response('Message added successfully', { status: 201 });
    } catch (e) {
        console.error("handlePost: CRITICAL ERROR adding message!", e.message, e.stack);
        return new Response('Error adding message: ' + e.message, { status: 500 });
    } finally {
        // !! 关键改动：请求处理完后立即结束这个 Pool !!
        await pool.end();
    }
}

// Pages Functions 的主入口点
export async function onRequest(context) {
    // 确保数据库表只在第一次调用时初始化
    if (!globalThis.schemaInitialized) {
        try {
            await initializeSchema(context);
            globalThis.schemaInitialized = true;
        } catch (initError) {
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