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
  EmbedBuilder
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

client.on('ready', async () => {
  console.log(`✅ Bot online como ${client.user.tag}`);

  const canal = client.channels.cache.find(c => c.name === '✅┃registro');

  if (!canal) return console.log('Canal registro não encontrado');

  const botao = new ButtonBuilder()
    .setCustomId('registrar')
    .setLabel('📋 Registrar')
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder().addComponents(botao);

  await canal.send({
    content: 'Clique no botão abaixo para se registrar 👇',
    components: [row]
  });
});

client.on('interactionCreate', async (interaction) => {

  // BOTÃO REGISTRAR
  if (interaction.isButton() && interaction.customId === 'registrar') {

    const modal = new ModalBuilder()
      .setCustomId('formRegistro')
      .setTitle('Registro');

    const nome = new TextInputBuilder()
      .setCustomId('nome')
      .setLabel('Seu nome')
      .setStyle(TextInputStyle.Short);

    const id = new TextInputBuilder()
      .setCustomId('id')
      .setLabel('Seu ID')
      .setStyle(TextInputStyle.Short);

    const recrutador = new TextInputBuilder()
      .setCustomId('recrutador')
      .setLabel('Recrutador')
      .setStyle(TextInputStyle.Short);

    modal.addComponents(
      new ActionRowBuilder().addComponents(nome),
      new ActionRowBuilder().addComponents(id),
      new ActionRowBuilder().addComponents(recrutador)
    );

    return interaction.showModal(modal);
  }

  // ENVIO DO FORMULÁRIO
  if (interaction.isModalSubmit()) {

    const nome = interaction.fields.getTextInputValue('nome');
    const id = interaction.fields.getTextInputValue('id');
    const recrutador = interaction.fields.getTextInputValue('recrutador');

    const canalAprovacao = interaction.guild.channels.cache.find(c => c.name === '🔔┃aprovação');

    if (!canalAprovacao) {
      return interaction.reply({ content: '❌ Canal de aprovação não encontrado', ephemeral: true });
    }

    // Encode seguro (resolve problema de espaço)
    const encodedNome = encodeURIComponent(nome);

    const aprovarBtn = new ButtonBuilder()
      .setCustomId(`aprovar_${interaction.user.id}_${id}_${encodedNome}`)
      .setLabel('✅ Aprovar')
      .setStyle(ButtonStyle.Success);

    const reprovarBtn = new ButtonBuilder()
      .setCustomId(`reprovar_${interaction.user.id}`)
      .setLabel('❌ Reprovar')
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder().addComponents(aprovarBtn, reprovarBtn);

    const embed = new EmbedBuilder()
      .setColor('#00ff88')
      .setTitle('📋 Nova Solicitação de Registro')
      .setDescription(`Usuário: <@${interaction.user.id}>`)
      .addFields(
        { name: '🆔 ID', value: id, inline: true },
        { name: '👤 Nome', value: nome, inline: true },
        { name: '🎯 Recrutador', value: recrutador, inline: true }
      )
      .setThumbnail(interaction.user.displayAvatarURL())
      .setFooter({ text: 'Sistema de Registro' })
      .setTimestamp();

    await canalAprovacao.send({
      embeds: [embed],
      components: [row]
    });

    return interaction.reply({
      content: '⏳ Seu registro foi enviado para aprovação.',
      ephemeral: true
    });
  }

  // APROVAÇÃO / REPROVAÇÃO
  if (interaction.isButton()) {

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
    }

    const parts = interaction.customId.split('_');
    const acao = parts[0];
    const userId = parts[1];

    const membro = await interaction.guild.members.fetch(userId);
    const cargo = interaction.guild.roles.cache.find(r => r.name === '👤| Membro');

    if (acao === 'aprovar') {

      const id = parts[2];
      const nome = decodeURIComponent(parts[3]);

      // Dá cargo
      if (cargo) {
        await membro.roles.add(cargo);
      }

      // 🔥 ALTERA NICKNAME
      try {
        await membro.setNickname(`${id} | ${nome}`);
      } catch (err) {
        console.log('Erro ao alterar nickname:', err);
      }

      const embed = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor('#00ff00')
        .setFooter({ text: `Aprovado por ${interaction.user.tag}` });

      await interaction.update({
        embeds: [embed],
        components: []
      });

    } else if (acao === 'reprovar') {

      const embed = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor('#ff0000')
        .setFooter({ text: `Reprovado por ${interaction.user.tag}` });

      await interaction.update({
        embeds: [embed],
        components: []
      });
    }
  }
});

client.login(process.env.TOKEN);