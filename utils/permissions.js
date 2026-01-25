// utils/permissions.js
const PermissionLevel = {
	EVERYONE: 'everyone',
	SERVER_OWNER: 'server_owner',
};

async function checkPermission(interaction, requiredLevel) {
	if (requiredLevel === PermissionLevel.SERVER_OWNER) {
		if (!interaction.guild) {
			return { allowed: false, reason: 'This command can only be used in a server.' };
		}
		if (interaction.user.id !== interaction.guild.ownerId) {
			return { allowed: false, reason: 'Only the server owner can use this command.' };
		}
	}
	return { allowed: true };
}

module.exports = { PermissionLevel, checkPermission };
