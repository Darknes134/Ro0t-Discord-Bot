const { Client, GatewayIntentBits, PermissionsBitField, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const config = require('./config.json');

// --- AYARLAR ---
const TOKEN = config.token;
const CLIENT_ID = config.clientId;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// --- VERİTABANI ---
let database = { otorol: {}, gelengiden: {} };
if (fs.existsSync('./database.json')) {
    try {
        database = JSON.parse(fs.readFileSync('./database.json', 'utf8'));
        if (!database.gelengiden) database.gelengiden = {};
        if (!database.otorol) database.otorol = {};
    } catch (e) { console.error("Veritabanı okuma hatası:", e); }
}

function saveDB() {
    fs.writeFileSync('./database.json', JSON.stringify(database, null, 2));
}

// --- KOMUTLAR (Hatalı isimler düzeltildi) ---
const commands = [
    new SlashCommandBuilder().setName('yardim').setDescription('Komut listesini gösterir.'),
    new SlashCommandBuilder().setName('otorol').setDescription('Otorol ayarlar.')
        .addRoleOption(opt => opt.setName('rol').setDescription('Verilecek rol').setRequired(true)),
    new SlashCommandBuilder().setName('sil').setDescription('Mesajları temizler.')
        .addIntegerOption(opt => opt.setName('miktar').setDescription('1-100 arası').setRequired(true).setMinValue(1).setMaxValue(100)),
    new SlashCommandBuilder().setName('ban').setDescription('Kullanıcıyı yasaklar.')
        .addUserOption(opt => opt.setName('kullanici').setDescription('Yasaklanacak kişi').setRequired(true))
        .addStringOption(opt => opt.setName('sure').setDescription('Süre (10m, 1h, 1d)'))
        .addStringOption(opt => opt.setName('sebep').setDescription('Sebep')),
    new SlashCommandBuilder().setName('unban').setDescription('ID ile ban kaldırır.')
        .addStringOption(opt => opt.setName('id').setDescription('Kullanıcı ID').setRequired(true)),
    new SlashCommandBuilder().setName('mute').setDescription('Süreli susturma atar.')
        .addUserOption(opt => opt.setName('kullanici').setDescription('Susturulacak kişi').setRequired(true))
        .addStringOption(opt => opt.setName('sure').setDescription('Süre (Örn: 15m)').setRequired(true))
        .addStringOption(opt => opt.setName('sebep').setDescription('Sebep')),
    new SlashCommandBuilder().setName('unmute').setDescription('Susturmayı kaldırır.')
        .addUserOption(opt => opt.setName('kullanici').setDescription('Susturması açılacak kişi').setRequired(true)),
    new SlashCommandBuilder().setName('gelengiden').setDescription('Giriş/çıkış log kanalını ayarlar.')
        .addChannelOption(opt => opt.setName('kanal').setDescription('Gelen giden kanalı').setRequired(true))
].map(cmd => cmd.toJSON());

// --- HAZIRLIK ---
const rest = new REST({ version: '10' }).setToken(TOKEN);
client.once('ready', async () => {
    try {
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log(`🚀 Bot aktif: ${client.user.tag}`);
        client.user.setActivity('/yardim | Moderasyon');
    } catch (e) { console.error(e); }
});

// --- ZAMAN PARSE ---
function parseTime(str) {
    if (!str) return null;
    const timeDict = { 's': 1000, 'm': 60000, 'h': 3600000, 'd': 86400000 };
    const unit = str.slice(-1).toLowerCase();
    const val = parseInt(str.slice(0, -1));
    return (timeDict[unit] && !isNaN(val)) ? val * timeDict[unit] : null;
}

// --- OTOROL & GELEN SİSTEMİ ---
client.on('guildMemberAdd', async member => {
    // Otorol
    const rolId = database.otorol[member.guild.id];
    if (rolId) {
        const rol = member.guild.roles.cache.get(rolId);
        if (rol && member.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageRoles) && rol.position < member.guild.members.me.roles.highest.position) {
            member.roles.add(rol).catch(() => {});
        }
    }

    // Gelen Sistemi
    const gelengidenKanalId = database.gelengiden[member.guild.id];
    if (gelengidenKanalId) {
        const kanal = member.guild.channels.cache.get(gelengidenKanalId);
        if (kanal) {
            const embed = new EmbedBuilder()
                .setColor('Green')
                .setDescription(` **${member.user.username}** Sunucumuza Katıldı. Üye Sayımız **${member.guild.memberCount}** olarak güncellendi.`);
            kanal.send({ embeds: [embed] }).catch(() => {});
        }
    }
});

// --- GİDEN SİSTEMİ ---
client.on('guildMemberRemove', async member => {
    const gelengidenKanalId = database.gelengiden[member.guild.id];
    if (gelengidenKanalId) {
        const kanal = member.guild.channels.cache.get(gelengidenKanalId);
        if (kanal) {
            const embed = new EmbedBuilder()
                .setColor('Red')
                .setDescription(` **${member.user.username}** Sunucudan ayrıldı. Üye Sayımız (**${member.guild.memberCount}** ) olarak güncellendi.`);
            kanal.send({ embeds: [embed] }).catch(() => {});
        }
    }
});

// --- KOMUT SİSTEMİ ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    await interaction.deferReply();

    const { commandName, options, guild, memberPermissions, channel } = interaction;
    const me = guild.members.me;

    try {
        if (commandName === 'yardim') {
            const embed = new EmbedBuilder()
                .setTitle('🛡️ Moderasyon Menüsü')
                .setColor('Blue')
                .addFields(
                    { name: '/otorol', value: 'Otomatik rol ayarlar.' },
                    { name: '/sil', value: 'Mesajları temizler.' },
                    { name: '/ban', value: 'Yasaklama yapar.' },
                    { name: '/mute', value: 'Susturma atar.' },
                    { name: '/gelengiden', value: 'Gelen giden kanalını ayarlar.' }
                );
            return interaction.editReply({ embeds: [embed] });
        }

        if (commandName === 'gelengiden') {
            if (!memberPermissions.has(PermissionsBitField.Flags.Administrator)) return interaction.editReply('❌ Yetkin yok');
            const logKanal = options.getChannel('kanal');
            database.gelengiden[guild.id] = logKanal.id;
            saveDB();
            return interaction.editReply(`✅ Gelen giden kanalı başarıyla ${logKanal} olarak ayarlandı!`);
        }

        if (commandName === 'otorol') {
            if (!memberPermissions.has(PermissionsBitField.Flags.Administrator)) return interaction.editReply('❌ Yetkin yok');
            const rol = options.getRole('rol');
            if (rol.position >= me.roles.highest.position) return interaction.editReply('❌ Rol benden yüksek');
            database.otorol[guild.id] = rol.id;
            saveDB();
            return interaction.editReply(`✅ Otorol ayarlandı: ${rol}`);
        }

        if (commandName === 'sil') {
            if (!memberPermissions.has(PermissionsBitField.Flags.ManageMessages)) return interaction.editReply('❌ Yetkin yok');
            const miktar = options.getInteger('miktar');
            const deleted = await channel.bulkDelete(miktar, true);
            return interaction.editReply(`🧹 ${deleted.size} mesaj silindi`);
        }

        if (commandName === 'ban') {
            if (!memberPermissions.has(PermissionsBitField.Flags.BanMembers)) return interaction.editReply('❌ Yetkin yok');
            const user = options.getUser('kullanici');
            const target = options.getMember('kullanici');
            const sebep = options.getString('sebep') || 'Sebep belirtilmedi';
            if (target && !target.bannable) return interaction.editReply('❌ Banlayamam');
            await guild.members.ban(user.id, { reason: sebep });
            return interaction.editReply(`🔨 ${user.tag} banlandı. **Sebep:** ${sebep}`);
        }

        if (commandName === 'mute') {
            if (!memberPermissions.has(PermissionsBitField.Flags.ModerateMembers)) return interaction.editReply('❌ Yetkin yok');
            const target = options.getMember('kullanici');
            const ms = parseTime(options.getString('sure'));
            const sebep = options.getString('sebep') || 'Sebep belirtilmedi';
            if (!target || !target.manageable) return interaction.editReply('❌ Yapılamadı');
            await target.timeout(ms, sebep);
            return interaction.editReply(`🔇 ${target.user.tag} susturuldu. **Sebep:** ${sebep}`);
        }

        if (commandName === 'unmute') {
            const target = options.getMember('kullanici');
            if (!target) return interaction.editReply('❌ Kullanıcı yok');
            await target.timeout(null);
            return interaction.editReply(`🔊 Susturma kaldırıldı`);
        }

        if (commandName === 'unban') {
            const id = options.getString('id');
            await guild.members.unban(id);
            return interaction.editReply(`✅ Ban kaldırıldı`);
        }

    } catch (e) {
        console.error(e);
        interaction.editReply('❌ Bir hata oluştu.');
    }
});

client.login(TOKEN);
