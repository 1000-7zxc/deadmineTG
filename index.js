require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const token = process.env.BOT_TOKEN;
const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(id => parseInt(id.trim())) : [];

if (!token) {
    console.error('❌ BOT_TOKEN не установлен в .env файле!');
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

// Хранилище тикетов: ticketId -> { userId, username, messages: [], status, createdAt }
const tickets = new Map();

// Активные тикеты пользователей: userId -> ticketId
const userActiveTickets = new Map();

// Контекст админа: adminId -> { mode, ticketId }
const adminContext = new Map();

console.log('🤖 Бот запущен!');

// Проверка, является ли пользователь админом
function isAdmin(userId) {
    return adminIds.includes(userId);
}

// Главное меню для пользователя
function getUserMenu() {
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

// Главное меню для админа
function getAdminMenu() {
    return {
        reply_markup: {
            keyboard: [
                [{ text: '🟢 Открытые тикеты' }],
                [{ text: '🚫 Заблокированные пользователи' }],
                [{ text: '📊 Статистика' }]
            ],
            resize_keyboard: true
        }
    };
}


// Меню в тикете для админа
function getAdminTicketMenu(ticketId) {
    return {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '✉️ Ответить', callback_data: `admin_reply_${ticketId}` },
                    { text: '✅ Закрыть', callback_data: `admin_close_${ticketId}` }
                ],
                [{ text: '🔙 К списку тикетов', callback_data: 'admin_tickets_list' }]
            ]
        }
    };
}

// Форматирование тикета для отображения
function formatTicketForAdmin(ticketId) {
    const ticket = tickets.get(ticketId);
    if (!ticket) return null;
    
    let text = `📋 История тикета #${ticketId}\n\n`;
    text += `👤 Пользователь: ${ticket.username} (ID: ${ticket.userId})\n`;
    text += `📅 Создан: ${new Date(ticket.createdAt).toLocaleString('ru-RU')}\n`;
    text += `📊 Статус: ${ticket.status}\n`;
    text += `💬 Сообщений: ${ticket.messages.length}\n\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    // Показываем все сообщения с нумерацией
    ticket.messages.forEach((msg, index) => {
        const time = new Date(msg.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        const role = msg.isAdmin ? '👨‍💼 Админ:' : '👤 Игрок:';
        text += `${index + 1}. ${time} ${role}\n${msg.text}\n\n`;
    });
    
    return text;
}

// Команда /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username || msg.from.first_name;
    
    if (isAdmin(chatId)) {
        bot.sendMessage(chatId, 
            `👋 Добро пожаловать, ${username}!\n\n` +
            `🛡️ Панель администратора DeadMine\n\n` +
            `Выберите действие:`,
            getAdminMenu()
        );
    } else {
        bot.sendMessage(chatId, 
            `👋 Добро пожаловать, ${username}!\n\n` +
            `🎫 Панель технической поддержки DeadMine\n\n` +
            `Выберите действие:`,
            getUserMenu()
        );
    }
});

// ============= ОБРАБОТЧИКИ ДЛЯ ПОЛЬЗОВАТЕЛЕЙ =============

// Кнопка "Ваши тикеты"
bot.on('message', async (msg) => {
    if (msg.text === '📋 Ваши тикеты' && !isAdmin(msg.chat.id)) {
        const userId = msg.chat.id;
        const userTickets = Array.from(tickets.entries())
            .filter(([, ticket]) => ticket.userId === userId);
        
        if (userTickets.length === 0) {
            bot.sendMessage(userId, '🚫 У вас пока нет тикетов', getUserMenu());
        } else {
            let ticketList = '📋 Ваши тикеты:\n\n';
            userTickets.forEach(([ticketId, ticket]) => {
                ticketList += `🎫 Тикет #${ticketId}\n`;
                ticketList += `Статус: ${ticket.status}\n`;
                ticketList += `Сообщений: ${ticket.messages.length}\n\n`;
            });
            bot.sendMessage(userId, ticketList, getUserMenu());
        }
    }
});

// Кнопка "Создать новый тикет"
bot.on('message', async (msg) => {
    if (msg.text === '📧 Создать новый тикет' && !isAdmin(msg.chat.id)) {
        const userId = msg.chat.id;
        
        // Проверка на существующий открытый тикет
        if (userActiveTickets.has(userId)) {
            const existingTicketId = userActiveTickets.get(userId);
            const existingTicket = tickets.get(existingTicketId);
            if (existingTicket && existingTicket.status === 'Открыт') {
                bot.sendMessage(userId, 
                    `⚠️ У вас уже есть открытый тикет #${existingTicketId}!\n` +
                    'Пожалуйста, дождитесь ответа или закрытия текущего тикета.',
                    getUserMenu()
                );
                return;
            }
        }
        
        // Создание нового тикета
        const ticketId = Date.now();
        const username = msg.from.username ? `@${msg.from.username}` : msg.from.first_name;
        
        tickets.set(ticketId, {
            userId,
            username,
            messages: [],
            status: 'Открыт',
            createdAt: Date.now()
        });
        
        userActiveTickets.set(userId, ticketId);
        
        bot.sendMessage(userId,
            `✅ Тикет #${ticketId} создан!\n\n` +
            `Опишите вашу проблему или вопрос. Администрация ответит вам в ближайшее время.`,
            {
                reply_markup: {
                    keyboard: [
                        [{ text: '🔙 Главное меню' }]
                    ],
                    resize_keyboard: true
                }
            }
        );
        
        // Уведомляем всех админов
        adminIds.forEach(adminId => {
            bot.sendMessage(adminId,
                `🔔 Новый тикет #${ticketId}\n` +
                `👤 От: ${username} (ID: ${userId})\n` +
                `⏰ ${new Date().toLocaleString('ru-RU')}`
            );
        });
    }
});

// Кнопка "Главное меню"
bot.on('message', (msg) => {
    if (msg.text === '🔙 Главное меню') {
        if (isAdmin(msg.chat.id)) {
            bot.sendMessage(msg.chat.id, 'Главное меню:', getAdminMenu());
        } else {
            bot.sendMessage(msg.chat.id, 'Главное меню:', getUserMenu());
        }
    }
});

// ============= ОБРАБОТЧИКИ ДЛЯ АДМИНОВ =============

// Кнопка "Открытые тикеты"
bot.on('message', async (msg) => {
    if (msg.text === '🟢 Открытые тикеты' && isAdmin(msg.chat.id)) {
        const openTickets = Array.from(tickets.entries()).filter(([, t]) => t.status === 'Открыт');
        
        if (openTickets.length === 0) {
            bot.sendMessage(msg.chat.id, '📭 Нет открытых тикетов', getAdminMenu());
            return;
        }
        
        let text = '🟢 Открытые тикеты:\n\n';
        openTickets.forEach(([ticketId, ticket]) => {
            text += `🎫 #${ticketId} - ${ticket.username}\n`;
            text += `💬 Сообщений: ${ticket.messages.length}\n\n`;
        });
        
        const keyboard = [];
        openTickets.forEach(([ticketId]) => {
            keyboard.push([{ text: `📂 Открыть тикет #${ticketId}`, callback_data: `admin_open_${ticketId}` }]);
        });
        keyboard.push([{ text: '🔙 Главное меню', callback_data: 'admin_main_menu' }]);
        
        bot.sendMessage(msg.chat.id, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
    }
});

// Кнопка "Заблокированные пользователи"
bot.on('message', async (msg) => {
    if (msg.text === '🚫 Заблокированные пользователи' && isAdmin(msg.chat.id)) {
        bot.sendMessage(msg.chat.id, 
            '🚫 Функция блокировки пользователей\n\n' +
            'В разработке...',
            getAdminMenu()
        );
    }
});

// Кнопка "Все тикеты" (старая, оставляем для совместимости)
bot.on('message', async (msg) => {
    if (msg.text === '📋 Все тикеты' && isAdmin(msg.chat.id)) {
        const allTickets = Array.from(tickets.entries());
        
        if (allTickets.length === 0) {
            bot.sendMessage(msg.chat.id, '📭 Нет активных тикетов', getAdminMenu());
            return;
        }
        
        // Группируем по статусу
        const openTickets = allTickets.filter(([, t]) => t.status === 'Открыт');
        const closedTickets = allTickets.filter(([, t]) => t.status === 'Закрыт');
        
        let text = '📋 Список всех тикетов:\n\n';
        
        if (openTickets.length > 0) {
            text += '🟢 Открытые тикеты:\n\n';
            openTickets.forEach(([ticketId, ticket]) => {
                text += `🎫 #${ticketId} - ${ticket.username}\n`;
                text += `� Сообщений: ${ticket.messages.length}\n\n`;
            });
        }
        
        if (closedTickets.length > 0) {
            text += '\n🔴 Закрытые тикеты:\n\n';
            closedTickets.slice(-5).forEach(([ticketId, ticket]) => {
                text += `🎫 #${ticketId} - ${ticket.username}\n\n`;
            });
        }
        
        // Создаём inline кнопки для открытых тикетов
        const keyboard = [];
        openTickets.forEach(([ticketId]) => {
            keyboard.push([{ text: `📂 Открыть тикет #${ticketId}`, callback_data: `admin_open_${ticketId}` }]);
        });
        keyboard.push([{ text: '� Главное меню', callback_data: 'admin_main_menu' }]);
        
        bot.sendMessage(msg.chat.id, text, {
            reply_markup: { inline_keyboard: keyboard }
        });
    }
});

// Кнопка "Статистика"
bot.on('message', async (msg) => {
    if (msg.text === '📊 Статистика' && isAdmin(msg.chat.id)) {
        const allTickets = Array.from(tickets.values());
        const openCount = allTickets.filter(t => t.status === 'Открыт').length;
        const closedCount = allTickets.filter(t => t.status === 'Закрыт').length;
        const totalMessages = allTickets.reduce((sum, t) => sum + t.messages.length, 0);
        
        const text = `📊 Статистика:\n\n` +
            `🎫 Всего тикетов: ${allTickets.length}\n` +
            `🟢 Открытых: ${openCount}\n` +
            `🔴 Закрытых: ${closedCount}\n` +
            `💬 Всего сообщений: ${totalMessages}`;
        
        bot.sendMessage(msg.chat.id, text, getAdminMenu());
    }
});

// ============= ОБРАБОТКА СООБЩЕНИЙ =============

// Сообщения от пользователей в тикете
bot.on('message', async (msg) => {
    const userId = msg.chat.id;
    
    // Игнорируем команды и кнопки
    if (msg.text && (msg.text.startsWith('/') || 
        ['📋 Ваши тикеты', '📧 Создать новый тикет', '🔙 Главное меню', '📋 Все тикеты', '📊 Статистика', '🟢 Открытые тикеты', ' Заблокированные пользователи'].includes(msg.text))) {
        return;
    }
    
    // Если админ в режиме ответа
    if (isAdmin(userId)) {
        const context = adminContext.get(userId);
        if (context && context.mode === 'replying') {
            const ticketId = context.ticketId;
            const ticket = tickets.get(ticketId);
            
            if (ticket) {
                // Добавляем сообщение админа в тикет
                ticket.messages.push({
                    text: msg.text,
                    isAdmin: true,
                    timestamp: Date.now()
                });
                
                // Отправляем пользователю
                bot.sendMessage(ticket.userId,
                    `📨 Ответ от администрации:\n\n` +
                    `Админ: ${msg.text}`,
                    getUserMenu()
                );
                
                // Подтверждение админу
                bot.sendMessage(userId, `✅ Ответ отправлен пользователю в тикете #${ticketId}`);
                
                // Показываем обновлённый тикет
                const ticketText = formatTicketForAdmin(ticketId);
                if (ticketText) {
                    bot.sendMessage(userId, ticketText, getAdminTicketMenu(ticketId));
                }
                
                // Сбрасываем контекст
                adminContext.delete(userId);
            }
        }
        return;
    }
    
    // Если у пользователя есть активный тикет
    if (userActiveTickets.has(userId)) {
        const ticketId = userActiveTickets.get(userId);
        const ticket = tickets.get(ticketId);
        
        if (ticket && ticket.status === 'Открыт') {
            // Добавляем сообщение в тикет
            ticket.messages.push({
                text: msg.text,
                isAdmin: false,
                timestamp: Date.now()
            });
            
            bot.sendMessage(userId, '✅ Ваше сообщение отправлено администрации!');
            
            // Уведомляем админов
            adminIds.forEach(adminId => {
                bot.sendMessage(adminId,
                    `💬 Новое сообщение в тикете #${ticketId}\n` +
                    `👤 От: ${ticket.username}\n\n` +
                    `"${msg.text}"`,
                    {
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '📂 Открыть тикет', callback_data: `admin_open_${ticketId}` }
                            ]]
                        }
                    }
                );
            });
        }
    }
});

// ============= CALLBACK ОБРАБОТЧИКИ =============

bot.on('callback_query', async (query) => {
    const data = query.data;
    const adminId = query.from.id;
    
    if (!isAdmin(adminId)) {
        bot.answerCallbackQuery(query.id, { text: '❌ У вас нет прав!' });
        return;
    }
    
    // Открыть тикет
    if (data.startsWith('admin_open_')) {
        const ticketId = parseInt(data.replace('admin_open_', ''));
        const ticketText = formatTicketForAdmin(ticketId);
        
        if (ticketText) {
            bot.sendMessage(adminId, ticketText, getAdminTicketMenu(ticketId));
            bot.answerCallbackQuery(query.id);
        } else {
            bot.answerCallbackQuery(query.id, { text: '❌ Тикет не найден' });
        }
    }
    
    // Ответить на тикет
    if (data.startsWith('admin_reply_')) {
        const ticketId = parseInt(data.replace('admin_reply_', ''));
        
        adminContext.set(adminId, { mode: 'replying', ticketId });
        
        bot.sendMessage(adminId, 
            `✍️ Введите ваш ответ для тикета #${ticketId}:\n\n` +
            `Следующее сообщение будет отправлено пользователю.`
        );
        
        bot.answerCallbackQuery(query.id, { text: 'Отправьте ваш ответ' });
    }
    
    // Закрыть тикет
    if (data.startsWith('admin_close_')) {
        const ticketId = parseInt(data.replace('admin_close_', ''));
        const ticket = tickets.get(ticketId);
        
        if (ticket) {
            ticket.status = 'Закрыт';
            userActiveTickets.delete(ticket.userId);
            
            bot.sendMessage(ticket.userId,
                `✅ Ваш тикет #${ticketId} был закрыт администрацией.\n\n` +
                `Спасибо за обращение!`,
                getUserMenu()
            );
            
            bot.sendMessage(adminId, `✅ Тикет #${ticketId} закрыт`, getAdminMenu());
            bot.answerCallbackQuery(query.id, { text: 'Тикет закрыт!' });
        }
    }
    
    // Вернуться к списку тикетов
    if (data === 'admin_tickets_list') {
        // Имитируем нажатие кнопки "Все тикеты"
        bot.emit('message', { text: '📋 Все тикеты', chat: { id: adminId }, from: { id: adminId } });
        bot.answerCallbackQuery(query.id);
    }
    
    // Главное меню
    if (data === 'admin_main_menu') {
        bot.sendMessage(adminId, 'Главное меню:', getAdminMenu());
        bot.answerCallbackQuery(query.id);
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
