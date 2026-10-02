const { ethers } = require("ethers");

const CONTRACT_ADDRESS = "0x9B3F6B83B07E5B313D960D47938800f0BCce206D";
const CONTRACT_ABI = [
    "function Chainlink() external view returns (bool)",
    "function pool() external"
];

const privateKey = process.env.PRIVATE_KEY;
if (!privateKey) {
    console.error("الخطأ: لم يتم العثور على PRIVATE_KEY في إعدادات البيئة (Variables)!");
    process.exit(1);
}

const provider = new ethers.JsonRpcProvider("https://bsc-dataseed.binance.org/");
const wallet = new ethers.Wallet(privateKey, provider);
const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

console.log("=========================================");
console.log(" تم تشغيل بوت PeetX الآلي بنجاح على السيرفر!");
console.log(" عنوان المحفظة المشغلة: " + wallet.address);
console.log("=========================================");

async function checkAndExecute() {
    try {
        const chainlinkStatus = await contract.Chainlink();

        if (chainlinkStatus === true) {
            console.log(`[${new Date().toLocaleTimeString()}] الحالة true! جاري استدعاء وتوقيع دالة pool...`);
            const tx = await contract.pool();
            console.log("تم إرسال المعاملة بنجاح. الهاش: " + tx.hash);

            const receipt = await tx.wait();
            console.log("تم تأكيد المعاملة في البلوك رقم: " + receipt.blockNumber);
        } else {
            console.log(`[${new Date().toLocaleTimeString()}] الحالة false، البوت ينتظر الشرط...`);
        }
    } catch (error) {
        console.error(`[${new Date().toLocaleTimeString()}] خطأ أثناء التنفيذ:`, error.reason || error.message);
    }
}

setInterval(checkAndExecute, 5000);
