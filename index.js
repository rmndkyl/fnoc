require('dotenv').config();
const fs = require('fs');
const colors = require('colors');
const moment = require('moment');
const { sendTelegramMessage } = require('./sendTelegramMessage');

const {
  sendSol,
  generateRandomAddresses,
  getKeypairFromPrivateKey,
  PublicKey,
  connection,
  LAMPORTS_PER_SOL,
  delay,
  getTransactionCountToday, // Import fungsi untuk mendapatkan transaksi hari ini
} = require('./src/solanaUtils');

const { displayHeader } = require('./src/displayUtils');

// Fungsi untuk mengirim SOL dengan retry
async function sendSolWithRetry(fromKeypair, toAddress, amountToSend, retries = 8) {
  while (retries > 0) {
    try {
      await sendSol(fromKeypair, new PublicKey(toAddress), amountToSend);
      console.log(colors.green(`Berhasil mengirim ${amountToSend} SOL ke ${toAddress}`));
      return true;
    } catch (error) {
      retries--;
      console.error(colors.red(`Gagal mengirim SOL ke ${toAddress}, mencoba lagi. Retries left: ${retries}`), error);
      if (retries === 0) {
        console.error(colors.red(`Gagal mengirim SOL ke ${toAddress} setelah beberapa kali mencoba.`));
        return false;
      }
    }
  }
}

// Fungsi untuk mendapatkan transaksi harian dengan filter hanya transaksi hari ini
async function getTransactionCountWithLogs(publicKey) {
  try {
    console.log(colors.cyan(`Mendapatkan jumlah transaksi untuk akun ${publicKey.toBase58()}...`));
    const transactionCount = await getTransactionCountToday(publicKey);
    console.log(colors.cyan(`Jumlah transaksi hari ini untuk ${publicKey.toBase58()}: ${transactionCount}`));
    return transactionCount;
  } catch (error) {
    console.error(colors.red(`Gagal mendapatkan jumlah transaksi untuk akun ${publicKey.toBase58()}: ${error.message}`));
    throw error;
  }
}

// Fungsi utama
(async () => {
  displayHeader();

  const addressCount = 105;
  const amountToSend = 0.00089088;
  const delayBetweenTx = 1000;

  const seedPhrasesOrKeys = JSON.parse(fs.readFileSync('privateKeys.json', 'utf-8'));

  if (!Array.isArray(seedPhrasesOrKeys) || seedPhrasesOrKeys.length === 0) {
    throw new Error(colors.red('privateKeys.json tidak diatur dengan benar atau kosong'));
  }

  const randomAddresses = generateRandomAddresses(addressCount);
  let rentExemptionAmount = await connection.getMinimumBalanceForRentExemption(0) / LAMPORTS_PER_SOL || 0.001;

  if (amountToSend < rentExemptionAmount) {
    console.log(colors.red(`Jumlah yang ditentukan tidak valid. Jumlah harus setidaknya ${rentExemptionAmount} SOL.`));
    return;
  }

  let totalSuccessful = 0;
  let totalFailed = 0;
  
  const now = moment();
  const formattedDate = now.format('Do MMMM YYYY, HH:mm:ss');
  console.log(colors.magenta(`Script dimulai pada: ${formattedDate}`));

  for (const [index, privateKey] of seedPhrasesOrKeys.entries()) {
    let fromKeypair;
    try {
      fromKeypair = getKeypairFromPrivateKey(privateKey);
      console.log(colors.yellow(`Memproses akun ${index + 1}: ${fromKeypair.publicKey}`));

      // Mengecek transaksi hari ini
      const transactionCount = await getTransactionCountWithLogs(fromKeypair.publicKey);
      
      // Jika sudah ada 100 transaksi atau lebih hari ini, lanjutkan ke akun berikutnya
      if (transactionCount >= 100) {
        console.log(colors.cyan(`Akun ${fromKeypair.publicKey} sudah melakukan lebih dari 100 transaksi hari ini, melewati...`));
        continue;
      }

      for (const address of randomAddresses) {
        const success = await sendSolWithRetry(fromKeypair, address, amountToSend);
        if (success) totalSuccessful++;
        else totalFailed++;
        await delay(delayBetweenTx);
      }
    } catch (error) {
      console.error(colors.red(`Gagal memproses keypair dari private key ke-${index + 1}:`), error);
    }
  }

  const summaryMessage = `*Sonic Testnet ${formattedDate}*\n\n*Send Sol 100x*\nSukses: ${totalSuccessful} Akun\nGagal: ${totalFailed} Akun\n`;
  fs.writeFileSync('summary_index.json', JSON.stringify({ summaryMessage }));
  console.log(summaryMessage.green);

  // Mengirim ringkasan ke Telegram
  await sendTelegramMessage(summaryMessage);
})();
