require('dotenv').config();
const fs = require('fs');
const { PublicKey, Keypair, Transaction } = require('@solana/web3.js');
const axios = require('axios').default;
const base58 = require('bs58');
const nacl = require('tweetnacl');
const { HEADERS } = require('./src/headers');
const { connection } = require('./src/solanaUtils');
const moment = require('moment');
const { sendTelegramMessage } = require('./sendTelegramMessage');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

let PRIVATE_KEYS;
try {
  PRIVATE_KEYS = JSON.parse(fs.readFileSync('privateKeys.json', 'utf-8'));
  if (!Array.isArray(PRIVATE_KEYS) || PRIVATE_KEYS.length === 0) {
    throw new Error('Format privateKeys.json tidak valid atau kosong');
  }
} catch (error) {
  console.error('Error membaca file privateKeys.json:', error.message);
  process.exit(1);
}

function getKeypair(privateKey) {
  try {
    const decodedPrivateKey = base58.decode(privateKey);
    return Keypair.fromSecretKey(decodedPrivateKey);
  } catch (error) {
    console.error(`Error decoding private key: ${error.message}`);
    throw error;
  }
}

async function getToken(privateKey) {
  try {
    const keypair = getKeypair(privateKey);
    const { data } = await axios({
      url: 'https://odyssey-api-beta.sonic.game/testnet/auth/sonic/challenge',
      params: { wallet: keypair.publicKey.toBase58() },
      headers: HEADERS,
    });

    const sign = nacl.sign.detached(Buffer.from(data.data), keypair.secretKey);
    const signature = Buffer.from(sign).toString('base64');
    const publicKey = keypair.publicKey;
    const encodedPublicKey = Buffer.from(publicKey.toBytes()).toString('base64');

    const response = await axios({
      url: 'https://odyssey-api-beta.sonic.game/testnet/auth/sonic/authorize',
      method: 'POST',
      headers: HEADERS,
      data: {
        address: publicKey.toBase58(),
        address_encoded: encodedPublicKey,
        signature,
      },
    });

    return response.data.data.token;
  } catch (error) {
    console.log(`Error fetching token: ${error.response?.data?.message || error.message}`.red);
    throw error;
  }
}

async function doTransactions(tx, keypair, retries = 3) {
  try {
    const bufferTransaction = tx.serialize();
    const signature = await connection.sendRawTransaction(bufferTransaction);
    await connection.confirmTransaction(signature);
    return signature;
  } catch (error) {
    if (retries > 0) {
      console.log(`Retrying transaction... (${retries} retries left)`.yellow);
      await new Promise((res) => setTimeout(res, 1000));
      return doTransactions(tx, keypair, retries - 1);
    } else {
      console.log(`Error in transaction: ${error.message}`.red);
      throw error;
    }
  }
}

async function dailyLogin(token, keypair) {
  try {
    // Mendapatkan transaksi check-in
    const { data } = await axios({
      url: 'https://odyssey-api-beta.sonic.game/testnet/user/check-in/transaction',
      method: 'GET',
      headers: { ...HEADERS, Authorization: `Bearer ${token}` },
    });

    if (!data || !data.data || !data.data.hash) {
      throw new Error("Transaksi check-in tidak ditemukan atau hash tidak tersedia.");
    }

    const txBuffer = Buffer.from(data.data.hash, 'base64');
    const tx = Transaction.from(txBuffer);

    // Menandatangani transaksi
    tx.partialSign(keypair);

    // Mengirim transaksi
    const signature = await doTransactions(tx, keypair);

    if (!signature) {
      throw new Error("Transaksi gagal dikirim.");
    }

    // Mengirim transaksi check-in dengan signature
    const response = await axios({
      url: 'https://odyssey-api-beta.sonic.game/testnet/user/check-in',
      method: 'POST',
      headers: { ...HEADERS, Authorization: `Bearer ${token}` },
      data: { hash: signature },
    });

    if (response.data.status === "success") {
      console.log(`[ ${moment().format('HH:mm:ss')} ] Login harian berhasil.`.green);
      return response.data;
    } else {
      console.log(`[ ${moment().format('HH:mm:ss')} ] Error dalam login harian: ${response.data.message || "Status tidak sukses"}`.red);
      throw new Error(response.data.message || "Status tidak sukses");
    }

  } catch (error) {
    console.log(`[ ${moment().format('HH:mm:ss')} ] Error dalam login harian: ${error.response?.data?.message || error.message}`.red);
    throw error;
  }
}

(async () => {
  const successfulLogins = [];
  const failedLogins = [];

  try {
    for (const privateKey of PRIVATE_KEYS) {
      try {
        const keypair = getKeypair(privateKey);
        const publicKey = keypair.publicKey.toBase58();

        // Mendapatkan token untuk akun ini
        const token = await getToken(privateKey);

        // Melakukan check-in harian
        const loginResult = await dailyLogin(token, keypair);

        if (loginResult) {
          successfulLogins.push(`Akun ${publicKey.slice(0, 6)}...: Berhasil Login`);
          console.log(`[ ${moment().format('HH:mm:ss')} ] Login harian berhasil untuk ${publicKey}: ${loginResult.status}`.green);
        } else {
          failedLogins.push(`Akun ${publicKey.slice(0, 6)}...: Error ${error.response?.data?.message || error.message}`);
          console.log(`[ ${moment().format('HH:mm:ss')} ] Login harian gagal untuk ${publicKey}`.red);
          continue; // Lewati akun ini jika login gagal
        }
      } catch (error) {
        const keypair = getKeypair(privateKey);
        const publicKey = keypair.publicKey.toBase58();
        console.log(`[ ${moment().format('HH:mm:ss')} ] Error dalam memproses Address ${publicKey.slice(0, 6)}...: ${error.message}`.red);
        failedLogins.push(`Akun ${publicKey.slice(0, 6)}...: ${error.response?.data?.message || error.message}`);
      }
    }

    const totalSuccessful = successfulLogins.length;
    const totalFailed = failedLogins.length;
    const summaryMessage = `*Daily Login*\nSukses: ${totalSuccessful} Akun\nGagal: ${totalFailed} Akun\n`;

    fs.writeFileSync('summary_daily.json', JSON.stringify({ summaryMessage }));
    console.log(summaryMessage.green);

  } catch (error) {
    console.log(`Terjadi kesalahan: ${error.message}`.red);
  } finally {
    console.log('Bot By HCA Edit by SKW'.magenta);
  }
})();