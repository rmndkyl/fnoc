require('dotenv').config();
const fs = require('fs');
const axios = require('axios').default;
const { Keypair, Transaction } = require('@solana/web3.js');
const base58 = require('bs58');
const nacl = require('tweetnacl');
const { HEADERS } = require('./src/headers');
const { connection, delay } = require('./src/solanaUtils');
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
    console.log(`Error fetching token: ${error.message}`.red);
    throw error;
  }
}

async function openMysteryBox(token, keypair, retries = 8) {
  try {
    const { data } = await axios({
      url: 'https://odyssey-api-beta.sonic.game/testnet/user/rewards/mystery-box/build-tx',
      method: 'GET',
      headers: { ...HEADERS, Authorization: `Bearer ${token}` },
    });

    const txBuffer = Buffer.from(data.data.hash, 'base64');
    const tx = Transaction.from(txBuffer);
    tx.partialSign(keypair);
    const signature = await doTransactions(tx, keypair);
    const response = await axios({
      url: 'https://odyssey-api-beta.sonic.game/testnet/user/rewards/mystery-box/open',
      method: 'POST',
      headers: { ...HEADERS, Authorization: `Bearer ${token}` },
      data: { hash: signature },
    });

    return response.data;
  } catch (error) {
    if (retries > 0) {
      console.log(`Retrying opening mystery box... (${retries} retries left)`.yellow);
      await new Promise((res) => setTimeout(res, 1000));
      return openMysteryBox(token, keypair, retries - 1);
    } else if (error.message.includes('InvalidSupply')) {
      console.log('Error: Supply untuk Mystery Box tidak valid atau sudah habis.'.red);
      return { success: false, message: 'Invalid supply', errorCode: 6004 };
    } else {
      console.log(`Error opening mystery box: ${error.message}`.red);
      throw error;
    }
  }
}

async function doTransactions(tx, keypair, retries = 8) {
  try {
    const bufferTransaction = tx.serialize();
    const signature = await connection.sendRawTransaction(bufferTransaction);
    await connection.confirmTransaction(signature);
    return signature;
  } catch (error) {
    if (error.logs) {
      console.log('Transaction Logs:', error.logs);
    }
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

async function openAllBoxes(privateKey) {
  const keypair = getKeypair(privateKey);
  const token = await getToken(privateKey);

  try {
    const { data } = await axios({
      url: 'https://odyssey-api-beta.sonic.game/testnet/user/rewards/info',
      method: 'GET',
      headers: { ...HEADERS, Authorization: `Bearer ${token}` },
    });

    const availableBoxes = data.data.ring_monitor;
    let successfullyOpened = 0;

    if (availableBoxes > 0) {
      console.log(`[ ${moment().format('HH:mm:ss')} ] Membuka ${availableBoxes} kotak...`.yellow);
      for (let i = 0; i < availableBoxes; i++) {
        const openedBox = await openMysteryBox(token, keypair);
        if (openedBox.success) {
          console.log(`[ ${moment().format('HH:mm:ss')} ] Kotak berhasil dibuka! Status: ${openedBox.status} | Jumlah: ${openedBox.data.amount}`.green);
          successfullyOpened++;
        } else if (openedBox.errorCode === 6004) {
          console.log(`[ ${moment().format('HH:mm:ss')} ] Supply tidak cukup untuk membuka kotak.`.yellow);
          break; // Hentikan loop karena supply habis
        }
      }
      return successfullyOpened === availableBoxes
        ? `Akun ${keypair.publicKey.toBase58().slice(0, 6)}... : Berhasil membuka semua box (${availableBoxes})`
        : `Akun ${keypair.publicKey.toBase58().slice(0, 6)}... : Gagal membuka semua box (${availableBoxes - successfullyOpened} box tersisa)`;
    } else {
      return `Akun ${keypair.publicKey.toBase58().slice(0, 6)}... : Tidak ada kotak yang tersedia untuk dibuka.`;
    }
  } catch (error) {
    console.log(`Error opening boxes: ${error.message}`.red);
    return `Akun ${keypair.publicKey.toBase58().slice(0, 6)}... : Gagal membuka semua box - ${error.message}`;
  }
}

(async () => {
  const successfulClaims = [];
  const failedClaims = [];

  try {
    for (const privateKey of PRIVATE_KEYS) {
      const result = await openAllBoxes(privateKey);
      if (result.includes('Berhasil')) {
        successfulClaims.push(result);
      } else {
        failedClaims.push(result);
      }
    }

    const totalSuccessful = successfulClaims.length;
    const totalFailed = failedClaims.length;

    const summaryMessage = `*Buka Semua Box*\nSukses: ${totalSuccessful} Akun\nGagal: ${totalFailed} Akun\n\n`;
    fs.writeFileSync('summary_openbox.json', JSON.stringify({ summaryMessage }));
    console.log(summaryMessage.green);

  } catch (error) {
    console.log(`Terjadi kesalahan: ${error.message}`.red);
  } finally {
    console.log('Bot By HCA Edit by SKW'.magenta);
  }
})();
