import { parseStandaloneSlashCommand } from '../commands/parse.js';
import { dispatchGatewayCommand } from '../commands/dispatch.js';
import { resolveSkillInvocation } from '../commands/skill.js';

export type ParsedAgentRequest = 
  | { type: 'command'; summary: string }
  | { type: 'skill'; input: string; forcedSkills: string[]; toolConfigOverride?: any }
  | { type: 'normal'; input: string; forcedSkills: string[] };

export async function parseAgentRequest(
  input: string,
  agentId: string,
  sessionId: string,
  profile?: string
): Promise<ParsedAgentRequest> {
  const parsedCommand = parseStandaloneSlashCommand(input);

  if (parsedCommand && parsedCommand.name !== 'skill') {
    const summary = await dispatchGatewayCommand(parsedCommand, {
      agentId,
      sessionId,
      profile,
    });
    return { type: 'command', summary };
  }

  if (parsedCommand?.name === 'skill') {
    const resolved = await resolveSkillInvocation(agentId, parsedCommand.rawArgs);
    if (!resolved.ok) {
      return { type: 'command', summary: resolved.message };
    }
    
    let toolConfigOverride: any = undefined;
    if (!profile && resolved.toolOverride) {
      toolConfigOverride = resolved.toolOverride;
    }

    return { 
      type: 'skill', 
      input: resolved.input, 
      forcedSkills: resolved.forcedSkills, 
      toolConfigOverride 
    };
  }

  return { type: 'normal', input, forcedSkills: [] };
}
