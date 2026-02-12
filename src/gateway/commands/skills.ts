import { ContextBuilder } from '../../core/ContextBuilder.js';

export async function runSkillsCommand(agentId: string): Promise<string> {
  const builder = new ContextBuilder(undefined, agentId);
  await builder.init();
  const skills = await builder.loadSkills(1_500);
  if (skills.length === 0) {
    return `No skills available for agent "${agentId}".`;
  }

  const lines = ['Available skills:'];
  for (let i = 0; i < skills.length; i++) {
    const skill = skills[i];
    lines.push(`${i + 1}. ${skill.name} - ${skill.description}`);
  }
  return lines.join('\n');
}
