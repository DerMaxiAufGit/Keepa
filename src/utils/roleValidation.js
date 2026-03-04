function validateAssignableRole(role, guild) {
  if (role.id === guild.id) {
    return { valid: false, reason: 'the @everyone role cannot be assigned' };
  }

  if (role.managed) {
    return { valid: false, reason: 'it is a managed role (integration, boost, or subscription)' };
  }

  const botMember = guild.members.me;
  if (!botMember) {
    return { valid: false, reason: 'could not resolve the bot member in this guild' };
  }

  if (role.position >= botMember.roles.highest.position) {
    return {
      valid: false,
      reason: `it is not below the bot's highest role (**${botMember.roles.highest.name}**)`,
    };
  }

  return { valid: true, reason: null };
}

function validateAssignableRoles(roles, guild) {
  const validRoles = [];
  const invalidRoles = [];

  for (const role of roles) {
    const result = validateAssignableRole(role, guild);
    if (result.valid) {
      validRoles.push(role);
    } else {
      invalidRoles.push({ role, reason: result.reason });
    }
  }

  return { validRoles, invalidRoles };
}

module.exports = { validateAssignableRole, validateAssignableRoles };
