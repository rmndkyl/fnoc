require('dotenv').config();
const axios = require('axios');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const sendTelegramMessage = async (message) => {
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const response = await axios.post(url, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'MarkdownV2',
    });

    if (response.status === 200) {
      console.log('Pesan berhasil dikirim ke Telegram.');
    } else {
      console.error('Gagal mengirim pesan ke Telegram. Status:', response.status);
    }
  } catch (error) {
    console.error('Error sending message to Telegram:', error.message);
  }
};

module.exports = { sendTelegramMessage };
