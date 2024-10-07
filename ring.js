const fs = require('fs');
const axios = require('axios').default;
const base58 = require('bs58');
const nacl = require('tweetnacl');
const colors = require('colors');
const { Keypair } = require('@solana/web3.js');
const { HEADERS } = require('./src/headers');

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
    console.error(`Error fetching token: ${error.message}`);
    throw error;
  }
}

async function getRing(token, publicKey) { // Ubah parameter dari PublicKey ke publicKey
  try {
    const response = await axios({
      url: 'https://odyssey-api-beta.sonic.game/testnet/user/rewards/info',
      method: 'GET',
      headers: { ...HEADERS, Authorization: `Bearer ${token}` },
    });

    const ring = response.data.data.ring;

    // Menampilkan nilai ring
    console.log(`Akun ${publicKey.slice(0, 6)}...: ${ring} ring`.green);
    return ring; // Mengembalikan nilai ring
  } catch (error) {
    console.log(`Error fetching ring: ${error.message}`);
    throw error;
  }
}

(async () => {
  let totalRings = 0;

  for (const privateKey of PRIVATE_KEYS) {
    try {
      const token = await getToken(privateKey);
      const keypair = getKeypair(privateKey);
      const publicKey = keypair.publicKey.toBase58();
      const ring = await getRing(token, publicKey); // Ganti PublicKey dengan publicKey

      if (ring !== undefined) {
        totalRings += ring; // Hanya tambahkan jika ring tidak undefined
      } else {
        console.warn(`Ring is undefined for private key: ${privateKey}`);
      }
    } catch (error) {
      console.error(`Terjadi kesalahan: ${error.message}`.red);
    }
  }

  const summaryMessage = `*Total Semua Ring : ${totalRings}*`;
  fs.writeFileSync('summary_ring.json', JSON.stringify({ summaryMessage }));
  console.log(summaryMessage.green);
})();
