const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const sessions = new Map();

app.use(express.static(path.join(__dirname, 'public')));

// ====== PAIRING ROUTE ======
app.get('/pair', async (req, res) => {
  const number = req.query.number?.replace(/\D/g, '');
  if (!number) return res.json({ error: 'Number is required' });

  try {
    const sessionPath = path.join(__dirname, 'sessions', number);
    if (!fs.existsSync(sessionPath)) {
      fs.mkdirSync(sessionPath, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      browser: ['Ubuntu', 'Chrome', '20.0.04'],
      markOnlineOnConnect: true
    });

    sessions.set(number, sock);
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === 'open') {
        console.log(`✅ ${number} is connected`);
        try {
          await sock.sendMessage(sock.user.id, {
            text: '✅ *Successfully Connected!*\n\nType *.menu* to see commands'
          });
        } catch (e) {}
      }

      if (connection === 'close') {
        const code = lastDisconnect?.error instanceof Boom ? lastDisconnect.error.output?.statusCode : 0;
        if (code === DisconnectReason.loggedOut) {
          sessions.delete(number);
          fs.rmSync(sessionPath, { recursive: true, force: true });
        }
      }
    });

    setupCommands(sock);

    if (!sock.authState.creds.registered) {
      const code = await sock.requestPairingCode(number);
      return res.json({ code });
    } else {
      return res.json({ error: 'This number is already paired' });
    }

  } catch (err) {
    console.error(err);
    res.json({ error: 'Failed to generate pairing code' });
  }
});

// ====== COMMAND HANDLER ======
function setupCommands(sock) {
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const jid = msg.key.remoteJid;
    const isGroup = jid.endsWith('@g.us');
    const body = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
    if (!body.startsWith('.')) return;

    const args = body.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const q = args.join(' ');

    try {
      switch (command) {
        case 'menu':
        case 'help':
          await sock.sendMessage(jid, {
            text: `╔═══════════════════╗
║   🔥 MULTI BOT 🔥   ║
╚═══════════════════╝

🤖 *AI*
• .ai <question>

🎮 *FUN*
• .quote
• .fact
• .joke
• .pickup
• .rizz
• .gayrate
• .simprate

🛠 *UTILITY*
• .calc <math>
• .weather <city>
• .crypto <coin>

👥 *GROUP*
• .tagall
• .hidetag <text>
• .ban @user
• .unban @user

⚙️ *SYSTEM*
• .ping
• .alive
• .runtime
• .owner`
          });
          break;

        case 'ping':
          const start = Date.now();
          await sock.sendMessage(jid, { text: 'Pong!' });
          await sock.sendMessage(jid, { text: `⚡ ${Date.now() - start}ms` });
          break;

        case 'alive':
          await sock.sendMessage(jid, { text: '✅ Multi Bot is Alive 🔥' });
          break;

        case 'runtime':
          const up = process.uptime();
          await sock.sendMessage(jid, {
            text: `⏱️ ${Math.floor(up/3600)}h ${Math.floor((up%3600)/60)}m ${Math.floor(up%60)}s`
          });
          break;

        case 'owner':
          await sock.sendMessage(jid, { text: '👑 This is a multi-session public bot' });
          break;

        case 'ai':
          if (!q) return sock.sendMessage(jid, { text: 'Example: .ai who are you' });
          const replies = [
            `Interesting question → ${q}`,
            `My answer: Yes`,
            `Hmm, I agree with you`,
            `Absolute facts 🔥`
          ];
          await sock.sendMessage(jid, { text: `🤖 ${replies[Math.floor(Math.random()*replies.length)]}` });
          break;

        case 'quote':
          const quotes = [
            "The only way to do great work is to love what you do.",
            "Stay hungry, stay foolish.",
            "Be yourself; everyone else is already taken."
          ];
          await sock.sendMessage(jid, { text: `💬 ${quotes[Math.floor(Math.random()*quotes.length)]}` });
          break;

        case 'fact':
          const facts = [
            "Honey never spoils.",
            "Octopuses have three hearts.",
            "Bananas are berries, strawberries are not."
          ];
          await sock.sendMessage(jid, { text: `🧠 ${facts[Math.floor(Math.random()*facts.length)]}` });
          break;

        case 'joke':
          const jokes = [
            "Why don't programmers like nature? Too many bugs.",
            "I'm not lazy, I'm on energy saving mode."
          ];
          await sock.sendMessage(jid, { text: `😂 ${jokes[Math.floor(Math.random()*jokes.length)]}` });
          break;

        case 'pickup':
          const pickups = [
            "Are you a magician? Because whenever I look at you, everyone else disappears.",
            "Do you have a map? I keep getting lost in your eyes."
          ];
          await sock.sendMessage(jid, { text: `💘 ${pickups[Math.floor(Math.random()*pickups.length)]}` });
          break;

        case 'rizz':
          const rizz = [
            "You must be a parking ticket because you've got FINE written all over you.",
            "If beauty were time, you'd be eternity."
          ];
          await sock.sendMessage(jid, { text: `😏 ${rizz[Math.floor(Math.random()*rizz.length)]}` });
          break;

        case 'gayrate':
          await sock.sendMessage(jid, { text: `🏳️‍🌈 Gay rate: *${Math.floor(Math.random()*101)}%*` });
          break;

        case 'simprate':
          await sock.sendMessage(jid, { text: `🥺 Simp rate: *${Math.floor(Math.random()*101)}%*` });
          break;

        case 'calc':
          if (!q) return sock.sendMessage(jid, { text: 'Example: .calc 10+5*2' });
          try {
            const result = eval(q.replace(/[^0-9+\-*/().]/g, ''));
            await sock.sendMessage(jid, { text: `🧮 Result: *${result}*` });
          } catch {
            await sock.sendMessage(jid, { text: '❌ Invalid calculation' });
          }
          break;

        case 'weather':
          if (!q) return sock.sendMessage(jid, { text: 'Example: .weather Lagos' });
          try {
            const res = await fetch(`https://wttr.in/${encodeURIComponent(q)}?format=3`);
            const text = await res.text();
            await sock.sendMessage(jid, { text: `🌤️ ${text}` });
          } catch {
            await sock.sendMessage(jid, { text: '❌ Weather not found' });
          }
          break;

        case 'crypto':
          if (!q) return sock.sendMessage(jid, { text: 'Example: .crypto bitcoin' });
          try {
            const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${q.toLowerCase()}&vs_currencies=usd`);
            const data = await res.json();
            const price = Object.values(data)[0]?.usd;
            if (!price) return sock.sendMessage(jid, { text: '❌ Coin not found' });
            await sock.sendMessage(jid, { text: `💰 ${q.toUpperCase()}: $${price}` });
          } catch {
            await sock.sendMessage(jid, { text: '❌ Failed to fetch price' });
          }
          break;

        case 'tagall':
          if (!isGroup) return sock.sendMessage(jid, { text: '❌ Group only' });
          const meta = await sock.groupMetadata(jid);
          let text = '╔══ *TAG ALL* ══╗\n\n';
          meta.participants.forEach(p => text += `@${p.id.split('@')[0]}\n`);
          await sock.sendMessage(jid, { text, mentions: meta.participants.map(p => p.id) });
          break;

        case 'hidetag':
          if (!isGroup) return sock.sendMessage(jid, { text: '❌ Group only' });
          const meta2 = await sock.groupMetadata(jid);
          await sock.sendMessage(jid, {
            text: q || 'Hello everyone 👋',
            mentions: meta2.participants.map(p => p.id)
          });
          break;

        // BAN
        case 'ban':
          if (!isGroup) return sock.sendMessage(jid, { text: '❌ This command only works in groups' });
          const banUser = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
          if (!banUser) return sock.sendMessage(jid, { text: '❌ Tag the user\nExample: .ban @user' });

          try {
            await sock.groupParticipantsUpdate(jid, [banUser], 'remove');
            await sock.sendMessage(jid, {
              text: `✅ Successfully banned @${banUser.split('@')[0]}`,
              mentions: [banUser]
            });
          } catch (err) {
            await sock.sendMessage(jid, { text: '❌ Failed to ban. Make sure I am admin.' });
          }
          break;

        // UNBAN
        case 'unban':
          if (!isGroup) return sock.sendMessage(jid, { text: '❌ This command only works in groups' });

          let unbanUser = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
          if (!unbanUser && q) {
            const number = q.replace(/\D/g, '');
            if (number) unbanUser = number + '@s.whatsapp.net';
          }

          if (!unbanUser) {
            return sock.sendMessage(jid, { text: '❌ Tag the user or type number\nExample: .unban @user' });
          }

          try {
            await sock.groupParticipantsUpdate(jid, [unbanUser], 'add');
            await sock.sendMessage(jid, {
              text: `✅ Successfully unbanned @${unbanUser.split('@')[0]}`,
              mentions: [unbanUser]
            });
          } catch (err) {
            await sock.sendMessage(jid, { text: '❌ Failed to unban.' });
          }
          break;

        default:
          await sock.sendMessage(jid, { text: '❌ Unknown command\nType *.menu*' });
      }
    } catch (err) {
      console.log('Command error:', err);
    }
  });
}

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Multi Bot running on port ${PORT}`);
});
