# Sonic Odyssey Testnet Frontier



## Fitur Bot
* Otomatis send 100 tx 
* Otomatis daily login 
* Otomatis claim box tx Milestone 
* Otomatis buka semua box
* Cek Total Semua Ring
* Kirim Status sukses atau gagal ke telegram

### [Link Testnet](https://odyssey.sonic.game/?join=waiivL)

### [Link Faucet](https://faucet.sonic.game/#/?network=testnet)

### [Bot Ori](https://github.com/dante4rt/sonic-odyssey-bot) by HCA (HappyCuanAirdrop) 


### Step
1. Clone repo & masuk ke folder
```
git clone https://github.com/gilkur23/sonic-testnet && cd sonic-testnet
```

2. Install Nodejs & module
```
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash && source ~/.bashrc && nvm install v22.3.0 && nvm use v22.3.0 && nvm alias default v22.3.0 && npm i 
```

3. Submit Private Key di `privateKeys.json`
```
nano privateKeys.json
```
 Format Private key 
```
[ 
  "privatekey1", 
  "privatekey2",
  "privatekey3"
]
```
4. Edit file `.env` Untuk Memggunakan fitur send status ke Telegram 
```
nano .env
```
Format `.env`
```
TELEGRAM_BOT_TOKEN=API BOT buat di @botfather 
TELEGRAM_CHAT_ID=User id Telegram
```
Contoh `.env`
```
TELEGRAM_BOT_TOKEN=123456789:AAErhakaYXXkzk1DBiksss_AgB1wGSa
TELEGRAM_CHAT_ID=123456789 
```

5. Jalankan bot ( auto run setiap hari )
```
node auto.js
```




*Gunakan Vps mempermudah pertuyulan*
