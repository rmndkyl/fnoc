require('dotenv').config();
const fs = require('fs');
const axios = require('axios').default;
const { Keypair } = require('@solana/web3.js');
const base58 = require('bs58');
const nacl = require('tweetnacl');
const { HEADERS } = require('./src/headers');
const { delay } = require('./src/solanaUtils');
const moment = require('moment');
const { sendTelegramMessage } = require('./sendTelegramMessage');

const PRIVATE_KEYS = JSON.parse(fs.readFileSync('privateKeys.json', 'utf-8'));

function getKeypair(privateKey) {
  const decodedPrivateKey = base58.decode(privateKey);
  return Keypair.fromSecretKey(decodedPrivateKey);
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
    const response = await axios({
      url: 'https://odyssey-api-beta.sonic.game/testnet/auth/sonic/authorize',
      method: 'POST',
      headers: HEADERS,
      data: {
        address: keypair.publicKey.toBase58(),
        address_encoded: Buffer.from(keypair.publicKey.toBytes()).toString('base64'),
        signature,
      },
    });

    return response.data.data.token;
  } catch (error) {
    console.log(`Error fetching token: ${error.message}`.red);
    throw error;
  }
}

async function fetchDaily(token) {
  try {
    const { data } = await axios({
      url: 'https://odyssey-api-beta.sonic.game/testnet/user/transactions/state/daily',
      method: 'GET',
      headers: { ...HEADERS, Authorization: `Bearer ${token}` },
    });

    return data.data.total_transactions;
  } catch (error) {
    console.log(`[ ${moment().format('HH:mm:ss')} ] Error in daily fetching: ${error.response?.data?.message}`.red);
    throw error;
  }
}

async function dailyClaim(token, publicKey) {
  let counter = 1;
  const maxCounter = 3;
  let totalTransactions;
  try {
    totalTransactions = await fetchDaily(token);

    if (totalTransactions > 10) {
      while (counter <= maxCounter) {
        try {
          const { data } = await axios({
            url: 'https://odyssey-api-beta.sonic.game/testnet/user/transactions/rewards/claim',
            method: 'POST',
            headers: { ...HEADERS, Authorization: `Bearer ${token}` },
            data: { stage: counter },
          });

          console.log(`[ ${moment().format('HH:mm:ss')} ] Klaim harian untuk tahap ${counter} berhasil!`.green);
          counter++;
        } catch (error) {
          if (error.response?.data?.message === 'interact rewards already claimed') {
            console.log(`[ ${moment().format('HH:mm:ss')} ] Error klaim tahap ${counter}: ${error.response.data.message}`.red);
            return `Gagal klaim box : Total transaksi Anda: ${totalTransactions}`;
          } else if (error.response?.data?.message === 'interact task not finished') {
            console.log(`[ ${moment().format('HH:mm:ss')} ] Error klaim tahap ${counter}: ${error.response.data.message}`.red);
            counter++;
          } else {
            console.log(`[ ${moment().format('HH:mm:ss')} ] Error klaim: ${error.response?.data?.message || error.message}`.red);
            return `Gagal : ${error.response?.data?.message || error.message} - Total transaksi Anda - ${totalTransactions}`;
          }
        } finally {
          await delay(1000);
        }
      }

      return `Berhasil untuk ${counter - 1} tahap - Total transaksi Anda: ${totalTransactions}`;
    } else {
      throw new Error('Tidak cukup transaksi untuk klaim hadiah.');
    }
  } catch (error) {
    console.log(`[ ${moment().format('HH:mm:ss')} ] Error dalam klaim harian: ${error.message}`.red);
    return `Gagal Klaim Box : Total transaksi Anda - ${totalTransactions}`;
  }
}

(async () => {
  const successfulClaims = [];
  const failedClaims = [];

  try {
    for (const privateKey of PRIVATE_KEYS) {
      try {
        const keypair = getKeypair(privateKey);
        const publicKey = keypair.publicKey.toBase58();
        const token = await getToken(privateKey);
        const claimResult = await dailyClaim(token, publicKey);

        // Memindahkan hasil klaim ke dalam array yang sesuai
        if (claimResult.startsWith('Berhasil')) {
          successfulClaims.push(`Akun ${publicKey.slice(0, 6)}...: ${claimResult}`);
        } else {
          failedClaims.push(`Akun ${publicKey.slice(0, 6)}...: ${claimResult}`);
        }
      } catch (keyError) {
        console.log(`Error processing key ${privateKey.slice(0, 6)}...: ${keyError.message}`.red);
        failedClaims.push(`Akun ${privateKey.slice(0, 6)}...: Error - ${keyError.message}`);
      }
    }

    const totalSuccessful = successfulClaims.length;
    const totalFailed = failedClaims.length;

    const summaryMessage = `*Buka Tx Milestone*\nSukses: ${totalSuccessful} Akun\nGagal: ${totalFailed} Akun\n`;
    fs.writeFileSync('summary_opentx.json', JSON.stringify({ summaryMessage }));
    console.log(summaryMessage.green);

  } catch (error) {
    console.log(`Terjadi kesalahan: ${error.message}`.red);
  } finally {
    console.log('Bot By HCA Edit by SKW'.magenta);
  }
})();
