import { ContextBuilder } from '../../core/ContextBuilder.js';

type SkillInvocationResult =
  | {
      ok: true;
      skillName: string;
      input: string;
      forcedSkills: string[];
      toolOverride?: {
        profile?: string;
        allow?: string[];
      };
    }
  | {
      ok: false;
      message: string;
    };

export async function resolveSkillInvocation(
  agentId: string,
  rawArgs: string
): Promise<SkillInvocationResult> {
  const trimmed = rawArgs.trim();
  if (!trimmed) {
    return {
      ok: false,
      message: 'Usage: /skill <name> [input]',
    };
  }

  const [requestedName, ...rest] = trimmed.split(/\s+/g);
  if (!requestedName || !/^[a-zA-Z0-9_-]+$/.test(requestedName)) {
    return {
      ok: false,
      message: `Invalid skill name "${requestedName || ''}". Use letters, digits, "_" or "-".`,
    };
  }

  const builder = new ContextBuilder(undefined, agentId);
  await builder.init();
  const skill = await builder.loadSkillByName(requestedName, 8_000);
  if (!skill) {
    return {
      ok: false,
      message: `Skill "${requestedName}" not found for agent "${agentId}". Use /skills to list available skills.`,
    };
  }

  if (!skill.available) {
    const missing =
      skill.missingRequires && skill.missingRequires.length > 0
        ? ` Missing requirements: ${skill.missingRequires.join(', ')}.`
        : '';
    return {
      ok: false,
      message: `Skill "${skill.name}" is unavailable.${missing}`,
    };
  }

  const commandInput = rest.join(' ').trim();
  const input =
    commandInput.length > 0
      ? `Use the "${skill.name}" skill. Prefer only tools relevant to this skill and avoid unrelated filesystem/history tools unless explicitly required.\n\nUser request: ${commandInput}`
      : `Use the "${skill.name}" skill for this request and reply concisely. Prefer only tools relevant to this skill and avoid unrelated filesystem/history tools unless explicitly required.`;

  const lowerSkillName = skill.name.toLowerCase();
  const toolOverride =
    lowerSkillName === 'web-research'
      ? {
          // Keep this focused so /skill web-research doesn't wander into fs/memory loops.
          profile: 'minimal',
          allow: ['group:web'],
        }
      : undefined;

  return {
    ok: true,
    skillName: skill.name,
    input,
    forcedSkills: [skill.name],
    toolOverride,
  };
}
