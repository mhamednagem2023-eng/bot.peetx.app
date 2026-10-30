const { Telegraf } = require('telegraf');
const { ethers } = require('ethers');

// --- إعدادات البوت والقناة والعقد ---
const BOT_TOKEN = '9019514193:AAE0TOz0X-9PrAirWyw218U7RjPm0Tqaqdk';
const CHANNEL_ID = '@PeetX_Transactions';
const CONTRACT_ADDRESS = '0x9B3F6B83B07E5B313D960D47938800f0BCce206D';

// قائمة الـ RPC المجانية الاحتياطية (5 مصادر لضمان عدم التوقف وتحويل الاتصال تلقائياً عند الفشل)
const BSC_RPCS = [
    'https://bsc-dataseed1.binance.org/',
    'https://bsc-dataseed2.binance.org/',
    'https://bsc-dataseed3.binance.org/',
    'https://bsc-dataseed1.defibit.io/',
    'https://bsc-dataseed1.ninicoin.io/'
];

let rpcIndex = 0;
let provider;
let contract;

// واجهة العقد (ABI) المحدثة بناءً على الأحداث المطلوبة
const CONTRACT_ABI = [
    {
        "anonymous": false,
        "inputs": [
            {"indexed": true, "internalType": "uint256", "name": "id", "type": "uint256"},
            {"indexed": false, "internalType": "string", "name": "itemType", "type": "string"},
            {"indexed": true, "internalType": "address", "name": "user", "type": "address"},
            {"indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256"},
            {"indexed": false, "internalType": "bool", "name": "success", "type": "bool"}
        ],
        "name": "PoolEvent",
        "type": "event"
    }
];

const bot = new Telegraf(BOT_TOKEN);

// دالة لاختيار وتغيير الـ RPC تلقائياً في حال فشل الاتصال
function getNextProvider() {
    const rpcUrl = BSC_RPCS[rpcIndex];
    rpcIndex = (rpcIndex + 1) % BSC_RPCS.length;
    return new ethers.providers.JsonRpcProvider(rpcUrl);
}

// دالة تنسيق عنوان المحفظة لعرض أول 6 أخر 4 أرقام
function formatAddress(address) {
    if (!address) return 'N/A';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
}

// دالة إرسال الرسالة إلى قناة تيليجرام مع التنسيق الإنجليزي والأيقونات المرتبة
async function sendToTelegram(txData) {
    const formattedAmount = ethers.utils.formatUnits(txData.amount || 0, 18);
    
    // تحديد الأيقونات ونوع العملية بناءً على الحدث القادم من العقد
    let icon = '🔹';
    let actionTitle = txData.itemType || 'Smart Contract Action';
    
    if (actionTitle.toLowerCase().includes('deposit') || actionTitle.toLowerCase().includes('invest')) {
        icon = '📥';
        actionTitle = 'New Investment / Deposit';
    } else if (actionTitle.toLowerCase().includes('claim') || actionTitle.toLowerCase().includes('payout')) {
        icon = '📤';
        actionTitle = 'Instant Payout / Earnings';
    } else if (actionTitle.toLowerCase().includes('referral')) {
        icon = '🤝';
        actionTitle = 'Referral Reward';
    } else if (actionTitle.toLowerCase().includes('early')) {
        icon = '⚡';
        actionTitle = 'Early Withdrawal';
    }

    const message = `
${icon} **PeetX Live Transaction**

📌 **Type:** ${actionTitle}
💰 **Amount:** \`${parseFloat(formattedAmount).toLocaleString()} USDT\`
👤 **Wallet:** \`${formatAddress(txData.user)}\`
🆔 **Tx ID:** \`#${txData.id.toString()}\`
⚡ **Status:** ${txData.success ? '✅ Success' : '❌ Failed'}

🔍 **On-Chain Verification:**
[View Transaction on BscScan](https://bscscan.com/address/${CONTRACT_ADDRESS})

*PeetX | Live Transactions ⚡*
    `.trim();

    try {
        await bot.telegram.sendMessage(CHANNEL_ID, message, { 
            parse_mode: 'Markdown',
            disable_web_page_preview: true 
        });
        console.log(`[Notification Sent] ID: ${txData.id} - Type: ${actionTitle}`);
    } catch (error) {
        console.error('Error sending Telegram notification:', error.message);
    }
}

// مراقبة الأحداث وربطها مع نظام التبديل التلقائي عند انقطاع الشبكة
function startEventListener() {
    try {
        provider = getNextProvider();
        contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

        console.log(`[Connected] Listening to BSC network via: ${provider.connection.url}`);

        // الاستماع لحدث PoolEvent بشكل فوري
        contract.on("PoolEvent", async (id, itemType, user, amount, success, event) => {
            console.log(`[Event Detected] ID: ${id.toString()}, Type: ${itemType}`);
            await sendToTelegram({
                id,
                itemType,
                user,
                amount,
                success,
                txHash: event.transactionHash
            });
        });

        provider.on("error", (error) => {
            console.warn('Provider error detected, switching to backup RPC...', error.message);
            reconnect();
        });

    } catch (err) {
        console.error('Initialization error, retrying with another RPC...', err.message);
        reconnect();
    }
}

function reconnect() {
    if (contract && contract.removeAllListeners) {
        contract.removeAllListeners();
    }
    setTimeout(startEventListener, 3000);
}

// بدء تشغيل البوت وإرسال رسالة التأكيد
bot.launch().then(async () => {
    console.log('🤖 PeetX Bot is successfully running and monitoring events 100%!');
    
    // رسالة نجاح التشغيل إلى القناة لتأكيد أن البوت يعمل بكفاءة
    try {
        await bot.telegram.sendMessage(CHANNEL_ID, "🤖 **PeetX Notification Bot Initialized & Online!**\n\nSystem is actively monitoring the smart contract live transactions 24/7. 🚀", { parse_mode: 'Markdown' });
    } catch (e) {
        console.log('Could not send startup message to channel (Check admin permissions).');
    }
}).catch(err => {
    console.error('Failed to launch Telegram bot:', err);
});

// التعامل مع الإغلاق الآمن
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// تشغيل مراقب البلوكتشين
startEventListener();
