import { ContextBuilder } from '../../core/ContextBuilder.js';

export async function runSkillsCommand(agentId: string): Promise<string> {
  const builder = new ContextBuilder(undefined, agentId);
  await builder.init();
  const catalog = await builder.loadSkillCatalog(1_500);
  if (catalog.length === 0) {
    return `No skills available for agent "${agentId}".`;
  }

  const lines = ['Available skills:'];
  for (let i = 0; i < catalog.length; i++) {
    const skill = catalog[i];
    const source = skill.source || 'workspace';
    if (skill.available) {
      lines.push(`${i + 1}. ${skill.name} - ${skill.description} [${source}]`);
      continue;
    }

    const requires =
      skill.missingRequires && skill.missingRequires.length > 0
        ? `missing: ${skill.missingRequires.join(', ')}`
        : 'unavailable';
    lines.push(`${i + 1}. ${skill.name} - ${skill.description} [${source}, ${requires}]`);
  }
  return lines.join('\n');
}
