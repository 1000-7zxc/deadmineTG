require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const token = process.env.BOT_TOKEN;
const adminChatId = process.env.ADMIN_CHAT_ID;
const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(id => parseInt(id.trim())) : [];

if (!token) {
    console.error('❌ BOT_TOKEN не установлен в .env файле!');
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

// Хранилище активных тикетов: { userId: { ticketId, messageId, status } }
const activeTickets = new Map();

// Хранилище сообщений тикетов для связи админ <-> пользователь
// ticketId -> { userId, userMessageId, adminMessageId }
const ticketMessages = new Map();

console.log('🤖 Бот запущен!');

// Главное меню
function getMainMenu() {
    return {
        reply_markup: {
            keyboard: [
                [{ text: '📋 Ваши тикеты' }],
                [{ text: '📧 Создать новый тикет' }]
            ],
            resize_keyboard: true
        }
    };
}

// Проверка, является ли пользователь админом
function isAdmin(userId) {
    return adminIds.includes(userId);
}

// Команда /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username || msg.from.first_name;
    
    bot.sendMessage(chatId, 
        `👋 Добро пожаловать, ${username}!\n\n` +
        `🎫 Панель технической поддержки DeadMine\n\n` +
        `Выберите действие:`,
        getMainMenu()
    );
});

// Обработка кнопки "Ваши тикеты"
bot.on('message', async (msg) => {
    if (msg.text === '📋 Ваши тикеты') {
        const userId = msg.chat.id;
        const userTickets = Array.from(activeTickets.entries())
            .filter(([uid]) => uid === userId);
        
        if (userTickets.length === 0) {
            bot.sendMessage(userId, '🚫 У вас пока нет тикетов', getMainMenu());
        } else {
            let ticketList = '📋 Ваши активные тикеты:\n\n';
            userTickets.forEach(([, ticket]) => {
                ticketList += `🎫 Тикет #${ticket.ticketId}\n`;
                ticketList += `Статус: ${ticket.status}\n\n`;
            });
            bot.sendMessage(userId, ticketList, getMainMenu());
        }
    }
});

// Обработка кнопки "Создать новый тикет"
bot.on('message', async (msg) => {
    if (msg.text === '📧 Создать новый тикет') {
        const userId = msg.chat.id;
        
        // Проверка на существующий открытый тикет
        if (activeTickets.has(userId)) {
            bot.sendMessage(userId, 
                '⚠️ У вас уже есть открытый тикет!\n' +
                'Пожалуйста, дождитесь ответа или закройте текущий тикет.',
                getMainMenu()
            );
            return;
        }
        
        // Создание нового тикета
        const ticketId = Date.now();
        const username = msg.from.username ? `@${msg.from.username}` : msg.from.first_name;
        
        activeTickets.set(userId, {
            ticketId,
            status: 'Ожидает ответа',
            username
        });
        
        bot.sendMessage(userId,
            `✅ Тикет #${ticketId} создан!\n\n` +
            `Опишите вашу проблему или вопрос. Администрация ответит вам в ближайшее время.`,
            {
                reply_markup: {
                    keyboard: [
                        [{ text: '🔙 Назад' }]
                    ],
                    resize_keyboard: true
                }
            }
        );
        
        // Уведомление админов
        if (adminChatId) {
            bot.sendMessage(adminChatId,
                `🎫 Новый тикет #${ticketId}\n` +
                `👤 От: ${username} (ID: ${userId})\n` +
                `⏰ Время: ${new Date().toLocaleString('ru-RU')}\n\n` +
                `Ожидает сообщения от пользователя...`
            );
        }
    }
});

// Обработка кнопки "Назад"
bot.on('message', (msg) => {
    if (msg.text === '🔙 Назад') {
        bot.sendMessage(msg.chat.id, 'Главное меню:', getMainMenu());
    }
});

// Обработка сообщений в тикете
bot.on('message', async (msg) => {
    const userId = msg.chat.id;
    
    // Игнорируем команды и кнопки
    if (msg.text && (msg.text.startsWith('/') || 
        ['📋 Ваши тикеты', '📧 Создать новый тикет', '🔙 Назад'].includes(msg.text))) {
        return;
    }
    
    // Если у пользователя есть активный тикет
    if (activeTickets.has(userId)) {
        const ticket = activeTickets.get(userId);
        const username = msg.from.username ? `@${msg.from.username}` : msg.from.first_name;
        
        // Отправка сообщения админам
        if (adminChatId) {
            const adminMsg = await bot.sendMessage(adminChatId,
                `💬 Сообщение в тикете #${ticket.ticketId}\n` +
                `👤 От: ${username} (ID: ${userId})\n\n` +
                `${msg.text || '[Медиа файл]'}`,
                {
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '✉️ Ответить', callback_data: `reply_${userId}_${ticket.ticketId}` },
                            { text: '✅ Закрыть', callback_data: `close_${userId}_${ticket.ticketId}` }
                        ]]
                    }
                }
            );
            
            // Сохраняем связь сообщений
            ticketMessages.set(`${ticket.ticketId}_${msg.message_id}`, {
                userId,
                userMessageId: msg.message_id,
                adminMessageId: adminMsg.message_id
            });
        }
        
        bot.sendMessage(userId, '✅ Ваше сообщение отправлено администрации!');
    }
});

// Обработка callback от inline кнопок
bot.on('callback_query', async (query) => {
    const data = query.data;
    const adminId = query.from.id;
    
    if (!isAdmin(adminId) && adminChatId) {
        bot.answerCallbackQuery(query.id, { text: '❌ У вас нет прав!' });
        return;
    }
    
    // Ответить на тикет
    if (data.startsWith('reply_')) {
        const [, userId, ticketId] = data.split('_');
        
        bot.answerCallbackQuery(query.id, { text: 'Отправьте ваш ответ следующим сообщением' });
        
        // Сохраняем контекст для следующего сообщения админа
        bot.once('message', async (msg) => {
            if (msg.chat.id === adminId || msg.chat.id === parseInt(adminChatId)) {
                const response = msg.text;
                
                // Отправка ответа пользователю
                await bot.sendMessage(parseInt(userId),
                    `📨 Ответ от администрации:\n\n` +
                    `Админ: "${response}"`
                );
                
                // Подтверждение админу
                bot.sendMessage(msg.chat.id, `✅ Ответ отправлен пользователю в тикете #${ticketId}`);
            }
        });
    }
    
    // Закрыть тикет
    if (data.startsWith('close_')) {
        const [, userId, ticketId] = data.split('_');
        
        activeTickets.delete(parseInt(userId));
        
        bot.sendMessage(parseInt(userId),
            `✅ Ваш тикет #${ticketId} был закрыт администрацией.\n\n` +
            `Спасибо за обращение!`,
            getMainMenu()
        );
        
        bot.editMessageText(
            `🎫 Тикет #${ticketId} закрыт\n` +
            `👤 Пользователь: ID ${userId}`,
            {
                chat_id: query.message.chat.id,
                message_id: query.message.message_id
            }
        );
        
        bot.answerCallbackQuery(query.id, { text: 'Тикет закрыт!' });
    }
});

// Обработка ошибок
bot.on('polling_error', (error) => {
    console.error('❌ Ошибка polling:', error);
});

process.on('SIGINT', () => {
    console.log('\n👋 Бот остановлен');
    process.exit(0);
});
