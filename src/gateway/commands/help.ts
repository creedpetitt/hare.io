export function runHelpCommand(): string {
  return [
    'Gateway slash commands:',
    '/help                 Show this message',
    '/status               Show current session/model status',
    '/skills               List available skills for this agent',
    '/skill <name> [input] Run one turn with a specific skill activated',
    '/models               List curated model catalog',
    '/model <value>        Set default model (index, alias, or provider/model)',
    '/model clear          Clear default provider selection',
  ].join('\n');
}
