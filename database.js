const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Инициализация таблиц
async function initDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tickets (
                id BIGINT PRIMARY KEY,
                user_id BIGINT NOT NULL,
                username TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at BIGINT NOT NULL
            )
        `);
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                ticket_id BIGINT NOT NULL REFERENCES tickets(id),
                text TEXT,
                media_type TEXT,
                media_file_id TEXT,
                is_admin BOOLEAN NOT NULL,
                timestamp BIGINT NOT NULL
            )
        `);
        
        console.log('✅ Database initialized');
    } catch (error) {
        console.error('❌ Database initialization error:', error);
    }
}

// Создать тикет
async function createTicket(ticketId, userId, username) {
    await pool.query(
        'INSERT INTO tickets (id, user_id, username, status, created_at) VALUES ($1, $2, $3, $4, $5)',
        [ticketId, userId, username, 'Открыт', Date.now()]
    );
}

// Добавить сообщение
async function addMessage(ticketId, text, mediaType, mediaFileId, isAdmin) {
    await pool.query(
        'INSERT INTO messages (ticket_id, text, media_type, media_file_id, is_admin, timestamp) VALUES ($1, $2, $3, $4, $5, $6)',
        [ticketId, text, mediaType, mediaFileId, isAdmin, Date.now()]
    );
}

// Получить тикет
async function getTicket(ticketId) {
    const result = await pool.query('SELECT * FROM tickets WHERE id = $1', [ticketId]);
    return result.rows[0];
}

// Получить сообщения тикета
async function getTicketMessages(ticketId) {
    const result = await pool.query(
        'SELECT * FROM messages WHERE ticket_id = $1 ORDER BY timestamp ASC',
        [ticketId]
    );
    return result.rows;
}

// Получить все тикеты
async function getAllTickets() {
    const result = await pool.query('SELECT * FROM tickets ORDER BY created_at DESC');
    return result.rows;
}

// Получить открытые тикеты
async function getOpenTickets() {
    const result = await pool.query('SELECT * FROM tickets WHERE status = $1 ORDER BY created_at DESC', ['Открыт']);
    return result.rows;
}

// Получить активный тикет пользователя
async function getUserActiveTicket(userId) {
    const result = await pool.query(
        'SELECT * FROM tickets WHERE user_id = $1 AND status = $2 ORDER BY created_at DESC LIMIT 1',
        [userId, 'Открыт']
    );
    return result.rows[0];
}

// Получить количество активных тикетов пользователя
async function getUserActiveTicketsCount(userId) {
    const result = await pool.query(
        'SELECT COUNT(*) FROM tickets WHERE user_id = $1 AND status = $2',
        [userId, 'Открыт']
    );
    return parseInt(result.rows[0].count);
}

// Удалить старые тикеты (старше 3 суток)
async function deleteOldTickets() {
    const threeDaysAgo = Date.now() - (3 * 24 * 60 * 60 * 1000);
    
    // Сначала удаляем сообщения старых тикетов
    await pool.query(`
        DELETE FROM messages 
        WHERE ticket_id IN (
            SELECT id FROM tickets WHERE created_at < $1
        )
    `, [threeDaysAgo]);
    
    // Затем удаляем сами тикеты
    const result = await pool.query(
        'DELETE FROM tickets WHERE created_at < $1',
        [threeDaysAgo]
    );
    
    return result.rowCount;
}

// Закрыть тикет
async function closeTicket(ticketId) {
    await pool.query('UPDATE tickets SET status = $1 WHERE id = $2', ['Закрыт', ticketId]);
}

module.exports = {
    initDatabase,
    createTicket,
    addMessage,
    getTicket,
    getTicketMessages,
    getAllTickets,
    getOpenTickets,
    getUserActiveTicket,
    getUserActiveTicketsCount,
    deleteOldTickets,
    closeTicket
};
