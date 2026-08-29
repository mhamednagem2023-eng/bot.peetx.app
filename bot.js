require('dotenv').config();
const { ethers } = require('ethers');

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.BOT_PRIVATE_KEY, provider);

const PANCAKE_ROUTER_ADDRESS = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";
const WBNB_ADDRESS = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";

const CONTRACT_ABI = [
  "event AddLiquidity(address indexed user, uint256 amount)",
  "function addLiquidity(address user) external",
  "function addLiquidityBatch(address[] calldata users) external",
  "function requestDynamicGas(uint256 usdtAmount) external"
];

const ERC20_ABI = [
  "function balanceOf(address account) external view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)"
];

const ROUTER_ABI = [
  "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)"
];

const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, CONTRACT_ABI, wallet);
const usdtContract = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, wallet);
const router = new ethers.Contract(PANCAKE_ROUTER_ADDRESS, ROUTER_ABI, wallet);

const transactionQueue = [];
let isProcessingQueue = false;

async function ensureGasSmartly() {
  try {
    const MIN_BNB_THRESHOLD = ethers.parseEther("0.005");
    const TARGET_BNB_BALANCE = ethers.parseEther("0.015");

    const currentBnbBalance = await provider.getBalance(wallet.address);

    if (currentBnbBalance < MIN_BNB_THRESHOLD) {
      console.log(`⛽ Current BNB Balance: ${ethers.formatEther(currentBnbBalance)} BNB`);
      
      const bnbNeeded = TARGET_BNB_BALANCE - currentBnbBalance;
      let calculatedUsdtAmount = (parseFloat(ethers.formatEther(bnbNeeded)) * 650).toFixed(2);
      
      if (calculatedUsdtAmount < 2) calculatedUsdtAmount = 2;
      if (calculatedUsdtAmount > 15) calculatedUsdtAmount = 15;

      console.log(`💡 Requesting ${calculatedUsdtAmount} USDT for gas refill...`);

      const usdtUnits = ethers.parseUnits(calculatedUsdtAmount.toString(), 18);
      const refillTx = await contract.requestDynamicGas(usdtUnits);
      await refillTx.wait();

      const usdtBalance = await usdtContract.balanceOf(wallet.address);
      if (usdtBalance > 0n) {
        const approveTx = await usdtContract.approve(PANCAKE_ROUTER_ADDRESS, usdtBalance);
        await approveTx.wait();

        const path = [USDT_ADDRESS, WBNB_ADDRESS];
        const deadline = Math.floor(Date.now() / 1000) + 600;

        const swapTx = await router.swapExactTokensForETH(
          usdtBalance,
          0,
          path,
          wallet.address,
          deadline
        );
        await swapTx.wait();
        console.log("⚡ Dynamic gas refilled and swapped successfully inside wallet.");
      }
    }
  } catch (error) {
    console.error("❌ Gas Refill Error:", error.message);
  }
}

async function processQueue() {
  if (isProcessingQueue || transactionQueue.length === 0) return;

  isProcessingQueue = true;

  try {
    await ensureGasSmartly();

    if (transactionQueue.length === 1) {
      const userAddress = transactionQueue.shift();
      console.log(`✍️ Signing single AddLiquidity for user: ${userAddress}`);
      const tx = await contract.addLiquidity(userAddress);
      console.log(`⏳ Tx Hash: ${tx.hash}`);
      await tx.wait();
      console.log(`✅ AddLiquidity executed successfully for: ${userAddress}`);
    } else {
      const batchSize = Math.min(transactionQueue.length, 50);
      const batchUsers = transactionQueue.splice(0, batchSize);

      console.log(`✍️ Signing Batch AddLiquidity for ${batchUsers.length} users...`);
      const tx = await contract.addLiquidityBatch(batchUsers);
      console.log(`⏳ Batch Tx Hash: ${tx.hash}`);
      await tx.wait();
      console.log(`✅ Batch of ${batchUsers.length} users executed successfully.`);
    }
  } catch (error) {
    console.error(`❌ Execution Error:`, error.message);
  } finally {
    isProcessingQueue = false;
    if (transactionQueue.length > 0) {
      processQueue();
    }
  }
}

function startAutoSigner() {
  console.log("🎧 Executor is listening to AddLiquidity events 24/7 with Batching Support...");
  
  contract.on("AddLiquidity", (user) => {
    transactionQueue.push(user);
    processQueue();
  });
}

async function main() {
  console.log("🤖 Auto Signer Bot Ready. Executor Wallet Address:", wallet.address);
  startAutoSigner();
}

main().catch((err) => console.error("Critical Main Error:", err));
