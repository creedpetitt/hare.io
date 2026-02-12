export function runHelpCommand(): string {
  return [
    'Gateway slash commands:',
    '/help                 Show this message',
    '/status               Show current session/model status',
    '/skills               List available skills for this agent',
    '/models               List curated model catalog',
    '/model <value>        Set session model override (index, alias, or provider/model)',
    '/model clear          Clear session model override',
  ].join('\n');
}
