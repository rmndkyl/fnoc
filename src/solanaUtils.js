const {
  Connection,
  LAMPORTS_PER_SOL,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
  PublicKey,
  Keypair,
} = require('@solana/web3.js');
const bip39 = require('bip39');
const { derivePath } = require('ed25519-hd-key');
const base58 = require('bs58');
const colors = require('colors');
const moment = require('moment'); // Import moment untuk manipulasi waktu

const TESTNET_URL = 'https://api.testnet.sonic.game/';
const connection = new Connection(TESTNET_URL, 'confirmed');

// Fungsi untuk mengirim SOL
async function sendSol(fromKeypair, toPublicKey, amount) {
  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: fromKeypair.publicKey,
      toPubkey: toPublicKey,
      lamports: amount * LAMPORTS_PER_SOL,
    })
  );
  const signature = await sendAndConfirmTransaction(connection, transaction, [
    fromKeypair,
  ]);
  console.log(colors.green('Transaction confirmed with signature:'), signature);
}

// Generate address random
function generateRandomAddresses(count) {
  return Array.from({ length: count }, () =>
    Keypair.generate().publicKey.toString()
  );
}

// Dapatkan keypair dari seed phrase
async function getKeypairFromSeed(seedPhrase) {
  const seed = await bip39.mnemonicToSeed(seedPhrase);
  const derivedSeed = derivePath("m/44'/501'/0'/0'", seed.toString('hex')).key;
  return Keypair.fromSeed(derivedSeed.slice(0, 32));
}

// Dapatkan keypair dari private key
function getKeypairFromPrivateKey(privateKey) {
  return Keypair.fromSecretKey(base58.decode(privateKey));
}

// Fungsi tambahan untuk mendapatkan jumlah transaksi dari akun hanya untuk hari ini
async function getTransactionCountToday(publicKey) {
  try {
    // Mendapatkan waktu awal hari ini (00:00 UTC)
    const startOfTodayUTC = moment.utc().startOf('day').unix();

    // Mengambil semua transaksi dari akun
    const signatures = await connection.getConfirmedSignaturesForAddress2(
      publicKey
    );

    // Filter transaksi yang terjadi setelah jam 00:00 UTC hari ini
    const todaysTransactions = signatures.filter((sig) => {
      return sig.blockTime >= startOfTodayUTC;
    });

    return todaysTransactions.length;
  } catch (error) {
    console.error(colors.red(`Gagal mendapatkan transaksi untuk akun ${publicKey.toBase58()}: ${error.message}`));
    throw error;
  }
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = {
  sendSol,
  generateRandomAddresses,
  getKeypairFromSeed,
  getKeypairFromPrivateKey,
  getTransactionCountToday, // Export fungsi untuk mendapatkan transaksi hari ini
  TESTNET_URL,
  connection,
  PublicKey,
  LAMPORTS_PER_SOL,
  delay,
};
