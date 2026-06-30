require('dotenv').config();
const {
    Client,
    GatewayIntentBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    PermissionsBitField,
    PermissionFlagsBits,
    EmbedBuilder,
    SlashCommandBuilder,
    REST,
    Routes,
    ChannelType
} = require('discord.js');

// ===================== CONFIGURAÇÃO =====================
const CONFIG = {
    CANAL_REGISTRO_NOME: '✅┃registro',
    CANAL_APROVACAO_NOME: '🔔┃aprovação',
    CANAL_LOGS_NOME: '📜┃logs-registro', // opcional, cria esse canal ou troque o nome
    CARGO_MEMBRO_NOME: '👤| Membro',
    COR_PENDENTE: '#FFD400',
    COR_APROVADO: '#00FF88',
    COR_REPROVADO: '#FF4040'
};

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ]
});

const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

// Cache em memória das solicitações pendentes (userId -> dados do formulário)
// Evita guardar tudo dentro do customId do botão (que tem limite de 100 caracteres)
const registrosPendentes = new Map();

// ===================== FUNÇÕES AUXILIARES =====================

function buscarCanalPorNome(guild, nome) {
    return guild.channels.cache.find(c => c.name === nome) ?? null;
}

function criarEmbedRegistro({ usuario, nome, id, recrutador, status = 'pendente', responsavel = null, motivo = null }) {
    const cores = {
        pendente: CONFIG.COR_PENDENTE,
        aprovado: CONFIG.COR_APROVADO,
        reprovado: CONFIG.COR_REPROVADO
    };

    const titulos = {
        pendente: '📋 Nova Solicitação de Registro',
        aprovado: '✅ Registro Aprovado',
        reprovado: '❌ Registro Reprovado'
    };

    const embed = new EmbedBuilder()
        .setColor(cores[status])
        .setTitle(titulos[status])
        .setDescription(`Usuário: <@${usuario.id}>`)
        .addFields(
            { name: '🆔 ID informado', value: id, inline: true },
            { name: '👤 Nome', value: nome, inline: true },
            { name: '🎯 Recrutador', value: recrutador, inline: true },
            { name: '🗓️ Conta criada em', value: `<t:${Math.floor(usuario.createdTimestamp / 1000)}:D>`, inline: true },
            { name: '📅 Solicitado em', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
        )
        .setThumbnail(usuario.displayAvatarURL())
        .setFooter({ text: 'Sistema de Registro' })
        .setTimestamp();

    if (motivo) {
        embed.addFields({ name: '📝 Motivo da reprovação', value: motivo });
    }

    if (responsavel) {
        embed.setFooter({ text: `${titulos[status]} por ${responsavel.tag}` });
    }

    return embed;
}

async function enviarLog(guild, mensagem) {
    const canalLogs = buscarCanalPorNome(guild, CONFIG.CANAL_LOGS_NOME);
    if (canalLogs) {
        canalLogs.send(mensagem).catch(() => null);
    }
}

async function avisarPorDM(usuario, mensagem) {
    try {
        await usuario.send(mensagem);
    } catch {
        // Usuário com DM fechada — apenas ignora, não quebra o fluxo
    }
}

async function enviarPainelRegistro(canal) {
    const botao = new ButtonBuilder()
        .setCustomId('registrar')
        .setLabel('📋 Registrar')
        .setStyle(ButtonStyle.Success);

    const row = new ActionRowBuilder().addComponents(botao);

    const embed = new EmbedBuilder()
        .setColor('#2B2D31')
        .setTitle('📋 SISTEMA DE REGISTRO')
        .setDescription(`
Seja muito bem-vindo(a)! 👋

Para liberar seu acesso total e interagir na facção **Marrokan**, você precisa realizar o seu registro.

━━━━━━━━━━━━━━━━━━━━━━━
**📝 Como realizar o registro?**

**1.** Clique no botão verde abaixo
**2.** Preencha o formulário com o seu **nome** e **ID** no jogo
**3.** Aguarde a aprovação de um recrutador
━━━━━━━━━━━━━━━━━━━━━━━

⚠️ Certifique-se de preencher as informações corretamente para evitar reprovação.
`)
        .setFooter({ text: '🛡️ Sistema de Whitelist e Recrutamento' })
        .setTimestamp();

    return canal.send({ embeds: [embed], components: [row] });
}

// ===================== SLASH COMMANDS =====================

const commands = [
    new SlashCommandBuilder()
        .setName('painelregistro')
        .setDescription('Envia o painel de registro neste canal (ou em outro, se especificado)')
        .addChannelOption(option =>
            option
                .setName('canal')
                .setDescription('Canal onde o painel será enviado (padrão: este canal)')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
].map(c => c.toJSON());

async function registrarSlashCommands() {
    if (!CLIENT_ID || !GUILD_ID) {
        console.log('⚠️ CLIENT_ID ou GUILD_ID não definidos no .env — slash commands não registrados.');
        return;
    }

    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

    try {
        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: commands }
        );
        console.log('✅ Slash Commands registrados');
    } catch (err) {
        console.error('Erro ao registrar slash commands:', err);
    }
}

// ===================== BOT PRONTO =====================

client.once('ready', async () => {
    console.log(`✅ Bot online como ${client.user.tag}`);

    await registrarSlashCommands();

    for (const guild of client.guilds.cache.values()) {
        const canalRegistro = buscarCanalPorNome(guild, CONFIG.CANAL_REGISTRO_NOME);
        if (!canalRegistro) {
            console.log(`⚠️ Canal "${CONFIG.CANAL_REGISTRO_NOME}" não encontrado em ${guild.name}`);
            continue;
        }

        await enviarPainelRegistro(canalRegistro).catch(console.error);
    }
});

// ===================== INTERAÇÕES =====================

client.on('interactionCreate', async (interaction) => {
    try {
        // ---------- COMANDO: /painelregistro ----------
        if (interaction.isChatInputCommand() && interaction.commandName === 'painelregistro') {
            const canal = interaction.options.getChannel('canal') ?? interaction.channel;

            await enviarPainelRegistro(canal);

            return interaction.reply({
                content: `✅ Painel de registro enviado em ${canal}.`,
                ephemeral: true
            });
        }

        // ---------- BOTÃO: ABRIR FORMULÁRIO ----------
        if (interaction.isButton() && interaction.customId === 'registrar') {
            const membro = interaction.member;
            const cargoMembro = interaction.guild.roles.cache.find(r => r.name === CONFIG.CARGO_MEMBRO_NOME);

            if (cargoMembro && membro.roles.cache.has(cargoMembro.id)) {
                return interaction.reply({ content: '✅ Você já está registrado!', ephemeral: true });
            }

            if (registrosPendentes.has(interaction.user.id)) {
                return interaction.reply({
                    content: '⏳ Você já tem uma solicitação pendente. Aguarde a análise da equipe.',
                    ephemeral: true
                });
            }

            const modal = new ModalBuilder()
                .setCustomId('formRegistro')
                .setTitle('Formulário de Registro');

            const nome = new TextInputBuilder()
                .setCustomId('nome')
                .setLabel('Seu nome')
                .setStyle(TextInputStyle.Short)
                .setMinLength(2)
                .setMaxLength(32)
                .setRequired(true);

            const id = new TextInputBuilder()
                .setCustomId('id')
                .setLabel('Seu ID')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(16)
                .setRequired(true);

            const recrutador = new TextInputBuilder()
                .setCustomId('recrutador')
                .setLabel('Recrutador')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(32)
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(nome),
                new ActionRowBuilder().addComponents(id),
                new ActionRowBuilder().addComponents(recrutador)
            );

            return interaction.showModal(modal);
        }

        // ---------- MODAL: ENVIO DO FORMULÁRIO DE REGISTRO ----------
        if (interaction.isModalSubmit() && interaction.customId === 'formRegistro') {
            const nome = interaction.fields.getTextInputValue('nome').trim();
            const id = interaction.fields.getTextInputValue('id').trim();
            const recrutador = interaction.fields.getTextInputValue('recrutador').trim();

            const canalAprovacao = buscarCanalPorNome(interaction.guild, CONFIG.CANAL_APROVACAO_NOME);
            if (!canalAprovacao) {
                return interaction.reply({ content: '❌ Canal de aprovação não encontrado. Avise um administrador.', ephemeral: true });
            }

            registrosPendentes.set(interaction.user.id, { nome, id, recrutador, criadoEm: Date.now() });

            const aprovarBtn = new ButtonBuilder()
                .setCustomId(`aprovar_${interaction.user.id}`)
                .setLabel('✅ Aprovar')
                .setStyle(ButtonStyle.Success);

            const reprovarBtn = new ButtonBuilder()
                .setCustomId(`reprovar_${interaction.user.id}`)
                .setLabel('❌ Reprovar')
                .setStyle(ButtonStyle.Danger);

            const row = new ActionRowBuilder().addComponents(aprovarBtn, reprovarBtn);

            const embed = criarEmbedRegistro({
                usuario: interaction.user,
                nome,
                id,
                recrutador,
                status: 'pendente'
            });

            await canalAprovacao.send({ embeds: [embed], components: [row] });

            await enviarLog(interaction.guild, `📋 <@${interaction.user.id}> enviou uma solicitação de registro (ID: ${id}).`);

            return interaction.reply({
                content: '⏳ Seu registro foi enviado para aprovação. Você será avisado por DM assim que for analisado.',
                ephemeral: true
            });
        }

        // ---------- BOTÃO: APROVAR / REPROVAR ----------
        if (interaction.isButton() && (interaction.customId.startsWith('aprovar_') || interaction.customId.startsWith('reprovar_'))) {

            if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({ content: '❌ Você não tem permissão para fazer isso.', ephemeral: true });
            }

            const [acao, userId] = interaction.customId.split('_');
            const registro = registrosPendentes.get(userId);

            if (!registro) {
                return interaction.reply({
                    content: '⚠️ Essa solicitação não está mais disponível (talvez já tenha sido analisada).',
                    ephemeral: true
                });
            }

            // ---- REPROVAR: pede motivo antes de finalizar ----
            if (acao === 'reprovar') {
                const modal = new ModalBuilder()
                    .setCustomId(`modalReprovar_${userId}`)
                    .setTitle('Motivo da reprovação');

                const motivoInput = new TextInputBuilder()
                    .setCustomId('motivo')
                    .setLabel('Explique o motivo (opcional)')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(false)
                    .setMaxLength(300);

                modal.addComponents(new ActionRowBuilder().addComponents(motivoInput));

                return interaction.showModal(modal);
            }

            // ---- APROVAR ----
            const membro = await interaction.guild.members.fetch(userId).catch(() => null);
            if (!membro) {
                registrosPendentes.delete(userId);
                return interaction.reply({ content: '❌ Esse usuário não está mais no servidor.', ephemeral: true });
            }

            const cargo = interaction.guild.roles.cache.find(r => r.name === CONFIG.CARGO_MEMBRO_NOME);

            if (cargo) {
                await membro.roles.add(cargo).catch(err => console.log('Erro ao adicionar cargo:', err));
            } else {
                console.log(`⚠️ Cargo "${CONFIG.CARGO_MEMBRO_NOME}" não encontrado.`);
            }

            try {
                await membro.setNickname(`${registro.id} | ${registro.nome}`);
            } catch (err) {
                console.log('Erro ao alterar nickname (provavelmente cargo acima do bot):', err.message);
            }

            const embedAtualizado = criarEmbedRegistro({
                usuario: membro.user,
                nome: registro.nome,
                id: registro.id,
                recrutador: registro.recrutador,
                status: 'aprovado',
                responsavel: interaction.user
            });

            await interaction.update({ embeds: [embedAtualizado], components: [] });

            await avisarPorDM(membro.user, `✅ Seu registro em **${interaction.guild.name}** foi aprovado! Bem-vindo(a).`);
            await enviarLog(interaction.guild, `✅ Registro de <@${userId}> aprovado por <@${interaction.user.id}>.`);

            registrosPendentes.delete(userId);
            return;
        }

        // ---------- MODAL: MOTIVO DA REPROVAÇÃO ----------
        if (interaction.isModalSubmit() && interaction.customId.startsWith('modalReprovar_')) {
            const userId = interaction.customId.split('_')[1];
            const registro = registrosPendentes.get(userId);

            if (!registro) {
                return interaction.reply({ content: '⚠️ Essa solicitação não está mais disponível.', ephemeral: true });
            }

            const motivo = interaction.fields.getTextInputValue('motivo').trim() || 'Não informado';

            const usuario = await client.users.fetch(userId).catch(() => null);

            const embedAtualizado = criarEmbedRegistro({
                usuario: usuario ?? { id: userId, createdTimestamp: Date.now(), displayAvatarURL: () => null },
                nome: registro.nome,
                id: registro.id,
                recrutador: registro.recrutador,
                status: 'reprovado',
                responsavel: interaction.user,
                motivo
            });

            await interaction.update({ embeds: [embedAtualizado], components: [] });

            if (usuario) {
                await avisarPorDM(usuario, `❌ Seu registro em **${interaction.guild.name}** foi reprovado.\n📝 Motivo: ${motivo}`);
            }
            await enviarLog(interaction.guild, `❌ Registro de <@${userId}> reprovado por <@${interaction.user.id}>. Motivo: ${motivo}`);

            registrosPendentes.delete(userId);
            return;
        }

    } catch (err) {
        console.error('Erro no interactionCreate:', err);
        if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
            interaction.reply({ content: '❌ Ocorreu um erro inesperado. Tente novamente.', ephemeral: true }).catch(() => null);
        }
    }
});

client.login(process.env.TOKEN);
