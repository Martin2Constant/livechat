require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const WebSocket = require('ws');
const http = require('http'); // On importe le module HTTP natif de Node.js

// --- 1. CRÉATION DU MINI-SERVEUR WEB POUR UPTIMEROBOT ---
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Le bot Livechat est réveillé !');
});

// --- 2. CONFIGURATION WEBSOCKET (Branché sur le serveur web) ---
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    console.log('Un client (Overlay) vient de se connecter au WebSocket !');
    ws.on('close', () => console.log('Un client s\'est déconnecté.'));
});

function broadcastMedia(url, text, author, avatar) {
    wss.clients.forEach(function each(client) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ 
                type: 'play_media', url: url, text: text, author: author, avatar: avatar 
            }));
        }
    });
}

// --- 3. CONFIGURATION DISCORD BOT ---
const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

client.once('ready', () => {
    console.log(`Bot Discord connecté en tant que ${client.user.tag}`);
});

client.on('messageCreate', (message) => {
    if (message.author.bot) return;

    if (message.content.startsWith('!livechat')) {
        let mediaUrl = null;
        let textContent = '';

        if (message.attachments.size > 0) {
            mediaUrl = message.attachments.first().url;
            textContent = message.content.replace('!livechat', '').trim();
        } else {
            const args = message.content.split(' ');
            mediaUrl = args[1];
            textContent = args.slice(2).join(' ').trim();
        }

        if (mediaUrl) {
            const avatarUrl = message.author.displayAvatarURL({ extension: 'png', size: 128 });
            broadcastMedia(mediaUrl, textContent, message.author.username, avatarUrl);
            message.reply('🎥 Média envoyé sur l\'overlay !');
        } else {
            message.reply('❌ Tu dois fournir un lien OU glisser-déposer une vidéo avec ton message !');
        }
    }
});

// --- 4. LANCEMENT GLOBAL ---
client.login(process.env.DISCORD_TOKEN);

// Le serveur écoute sur le port défini par l'hébergeur, ou 8080 en local
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`Serveur Web et WebSocket en écoute sur le port ${PORT}`);
});