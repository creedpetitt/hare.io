import { loadConfig } from '../../core/config.js';
import { ContextBuilder } from '../../core/ContextBuilder.js';
import { resolveActiveModel } from './model.js';
import type { CommandContext } from './types.js';

export async function runStatusCommand(context: CommandContext): Promise<string> {
  const config = await loadConfig();
  const activeModel = resolveActiveModel(config);

  const builder = new ContextBuilder(undefined, context.agentId);
  await builder.init();
  const catalog = await builder.loadSkillCatalog(200);
  const availableSkills = catalog.filter((skill) => skill.available);
  const unavailableCount = Math.max(0, catalog.length - availableSkills.length);

  const lines = ['Gateway status:'];
  lines.push(`agent: ${context.agentId}`);
  lines.push(`session: ${context.sessionId}`);
  lines.push(`profile: ${context.profile || 'default'}`);
  lines.push(
    `skills: ${availableSkills.length} available${unavailableCount > 0 ? ` (${unavailableCount} unavailable)` : ''}`
  );
  if (activeModel) {
    lines.push(`model: ${activeModel.provider}/${activeModel.model}`);
  } else {
    lines.push('model: unconfigured');
  }

  return lines.join('\n');
}
