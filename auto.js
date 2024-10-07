const { spawn } = require('child_process');
const fs = require('fs');
const schedule = require('node-schedule');
const { sendTelegramMessage } = require('./sendTelegramMessage'); // Import the function

// Fungsi untuk pengecekan apakah file ada
function checkFileExists(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
}

// Fungsi untuk menjalankan perintah dengan spawn dan promise
function runCommand(command) {
  return new Promise((resolve, reject) => {
    const [cmd, ...args] = command.split(' ');

    const process = spawn(cmd, args, { stdio: 'pipe' });

    process.stdout.on('data', (data) => {
      console.log(`\n${data}`);
    });

    process.stderr.on('data', (data) => {
      console.error(`\n${data}`);
    });

    process.on('close', (code) => {
      if (code === 0) {
        resolve(`Completed: ${command}`);
      } else {
        reject(new Error(`Command ${command} failed with exit code ${code}`));
      }
    });
  });
}

// Fungsi untuk membaca file JSON dan menangani error parsing
function readSummary(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } else {
      console.warn(`File ${filePath} tidak ditemukan, melewati...`);
      return null;
    }
  } catch (error) {
    console.error(`Error parsing JSON from ${filePath}: ${error.message}`);
    return null;
  }
}

// Fungsi untuk mengirim pesan Telegram dengan mekanisme retry
async function sendTelegramWithRetry(message, retries = 8) {
  if (!message || message.trim().length === 0) {
    console.log('Pesan kosong, tidak akan dikirim ke Telegram.');
    return;
  }

  while (retries > 0) {
    try {
      await sendTelegramMessage(message);
      console.log('Pesan Telegram berhasil dikirim.');
      return;
    } catch (error) {
      retries--;
      console.error(`Gagal mengirim pesan Telegram. Sisa percobaan: ${retries}. Error: ${error.message}`);
      if (retries === 0) {
        console.error('Gagal mengirim pesan Telegram setelah beberapa kali percobaan.');
      }
    }
  }
}

// Fungsi untuk menjalankan rangkaian perintah
async function runCommands() {
  try {
    console.log(`[ ${new Date().toISOString()} ] Starting the sequence of commands...`);

    console.log(`[ ${new Date().toISOString()} ] Running node index.js...`);
    checkFileExists('index.js');
    await runCommand('node index.js');

    console.log(`[ ${new Date().toISOString()} ] Running node daily.js...`);
    checkFileExists('daily.js');
    await runCommand('node daily.js');

    console.log(`[ ${new Date().toISOString()} ] Running node opentx.js...`);
    checkFileExists('opentx.js');
    await runCommand('node opentx.js');

    console.log(`[ ${new Date().toISOString()} ] Running node openbox.js...`);
    checkFileExists('openbox.js');
    await runCommand('node openbox.js');

    console.log(`[ ${new Date().toISOString()} ] Running node ring.js...`);
    checkFileExists('ring.js');
    await runCommand('node ring.js');

    // Mengumpulkan semua ringkasan
    const summaries = [];

    const indexSummary = readSummary('summary_index.json');
    if (indexSummary) summaries.push(indexSummary.summaryMessage);

    const dailySummary = readSummary('summary_daily.json');
    if (dailySummary) summaries.push(dailySummary.summaryMessage);

    const opentxSummary = readSummary('summary_opentx.json');
    if (opentxSummary) summaries.push(opentxSummary.summaryMessage);

    const openboxSummary = readSummary('summary_openbox.json');
    if (openboxSummary) summaries.push(openboxSummary.summaryMessage);

    const ringSummary = readSummary('summary_ring.json');
    if (ringSummary) summaries.push(ringSummary.summaryMessage);

    const finalSummaryMessage = summaries.filter(summary => summary).join('\n');

    if (finalSummaryMessage.trim()) {
      console.log(`Ringkasan Terbaru:\n${finalSummaryMessage}`);
      await sendTelegramWithRetry(finalSummaryMessage);
    } else {
      console.log('Tidak ada ringkasan yang akan dikirim.');
    }
  } catch (error) {
    console.error(`Error running commands: ${error.message}`);
  }
}

// Fungsi untuk penjadwalan ulang tugas berikutnya
function scheduleNextRun() {
  const now = new Date();
  const nextRun = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, now.getHours(), now.getMinutes(), 0, 0);

  schedule.scheduleJob(nextRun, async () => {
    console.log(`[ ${new Date().toISOString()} ] Scheduled task started at ${nextRun}`);
    await runCommands();
    scheduleNextRun(); // Jadwal ulang untuk hari berikutnya
  });

  fs.writeFileSync('lastRunTime.txt', now.toISOString(), 'utf-8');
  console.log(`[ ${new Date().toISOString()} ] First run time recorded: ${now.toISOString()}`);
}

// Fungsi utama untuk menjalankan skrip
(async () => {
  const lastRunTime = fs.existsSync('lastRunTime.txt') ? fs.readFileSync('lastRunTime.txt', 'utf-8') : null;

  if (lastRunTime) {
    const lastRunDate = new Date(lastRunTime);
    const now = new Date();

    if (now > lastRunDate) {
      console.log('Running commands immediately due to missed schedule.');
      await runCommands();
      scheduleNextRun();
    } else {
      console.log('Rescheduling for the next day.');
      scheduleNextRun();
    }
  } else {
    console.log('First time execution.');
    await runCommands();
    scheduleNextRun();
  }
})();
