require('dotenv').config();
const { Client, Events, GatewayIntentBits } = require('discord.js');
const { createRelayServer } = require('./server');
const { createMessageHandler, readConfig } = require('./relay');

async function main() {
    const config = readConfig(process.env);
    const client = new Client({
        intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    });
    const relay = createRelayServer({ isReady: () => client.isReady() });
    let stopping = false;
    let shutdownPromise;
    const shutdown = () => {
        if (!shutdownPromise) {
            stopping = true;
            shutdownPromise = (async () => {
                try { await client.destroy(); }
                finally { await relay.close(); }
            })();
        }
        return shutdownPromise;
    };
    const onSignal = () => { shutdown().catch(error => {
        console.error('Erreur pendant l’arrêt :', error.message);
        process.exitCode = 1;
    }); };
    process.once('SIGINT', onSignal);
    process.once('SIGTERM', onSignal);
    client.once(Events.ClientReady, () => {
        console.log(`Bot Discord connecté en tant que ${client.user.tag}`);
    });
    client.on(Events.Error, error => console.error('Erreur Discord :', error.message));
    client.on(Events.ShardError, error => console.error('Erreur de connexion Discord :', error.message));
    client.on(Events.MessageCreate, createMessageHandler({ config, broadcast: relay.broadcast }));

    try {
        await relay.listen(config.port);
        if (stopping) return;
        console.log(`Serveur HTTP et WebSocket en écoute sur le port ${config.port}`);
        await client.login(config.token);
        if (stopping) await client.destroy();
    } catch (error) {
        await shutdown();
        throw error;
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error('Démarrage impossible :', error.message);
        process.exitCode = 1;
    });
}

module.exports = { main };
