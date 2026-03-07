import fs from 'fs/promises';
import path from 'path';
import cron from 'node-cron';
import { CONFIG_DIR } from '../core/config.js';
import { runChannelAgent } from './channels/runner.js';
import { broadcastTelegramMessage } from './channels/telegram.js';
import { broadcastDiscordMessage } from './channels/discord.js';

type AutomationConfig = {
  id: string;
  cron: string;
  input: string;
  agentId?: string;
  enabled?: boolean;
};

let activeJobs = new Map<string, cron.ScheduledTask>();
let heartbeatJob: cron.ScheduledTask | undefined;

export async function startScheduler() {
  await reloadAutomations();
  startHeartbeat();

  // Watch for changes to automations.json every 60 seconds
  setInterval(() => {
    reloadAutomations().catch(err => console.error('[scheduler] Failed to reload automations', err));
  }, 60_000);
}

export async function stopScheduler() {
  for (const job of activeJobs.values()) {
    job.stop();
  }
  activeJobs.clear();
  if (heartbeatJob) {
    heartbeatJob.stop();
    heartbeatJob = undefined;
  }
}

function startHeartbeat() {
  if (heartbeatJob) return;

  // Run every 30 minutes
  heartbeatJob = cron.schedule('*/30 * * * *', async () => {
    console.log(`[heartbeat] Triggering internal heartbeat`);
    try {
      const prompt = "Read HEARTBEAT.md if it exists (workspace context). Follow it strictly. Do not infer or repeat old tasks from prior chats. If nothing needs attention, reply HEARTBEAT_OK.";
      const result = await runChannelAgent(prompt, {
        agentId: 'main',
        sessionId: 'main', // Run in main session to check memory
      });

      const text = result.trim();
      if (text.includes('HEARTBEAT_OK') && text.length < 300) {
        console.log(`[heartbeat] All good. Dropping response.`);
        return;
      }

      console.log(`[heartbeat] Alert generated. Broadcasting to channels.`);
      const broadcastMsg = `[Heartbeat Alert]\n\n${text}`;
      await broadcastTelegramMessage(broadcastMsg);
      await broadcastDiscordMessage(broadcastMsg);

    } catch (error: any) {
      console.error(`[heartbeat] Failed:`, error);
    }
  });
}

async function reloadAutomations() {
  const automationsPath = path.join(CONFIG_DIR, 'automations.json');
  let configContent: string;

  try {
    configContent = await fs.readFile(automationsPath, 'utf-8');
  } catch (e: any) {
    if (e.code === 'ENOENT') {
      // Seed an example if it doesn't exist
      const example: AutomationConfig[] = [
        {
          id: "example-daily-summary",
          cron: "0 9 * * *",
          input: "/skill web-research Summarize the top tech news today and save to daily_news.md",
          agentId: "main",
          enabled: false
        }
      ];
      await fs.mkdir(CONFIG_DIR, { recursive: true });
      await fs.writeFile(automationsPath, JSON.stringify(example, null, 2), 'utf-8');
      return;
    }
    console.error(`[scheduler] Error reading automations.json:`, e);
    return;
  }

  let automations: AutomationConfig[];
  try {
    automations = JSON.parse(configContent);
  } catch (e) {
    console.error(`[scheduler] Invalid JSON in automations.json`);
    return;
  }

  const currentIds = new Set(automations.map(a => a.id));

  // Stop jobs that were removed or disabled
  for (const [id, job] of activeJobs.entries()) {
    if (!currentIds.has(id)) {
      job.stop();
      activeJobs.delete(id);
      console.log(`[scheduler] Stopped job: ${id}`);
    }
  }

  // Start or update jobs
  for (const auto of automations) {
    if (auto.enabled === false) {
      if (activeJobs.has(auto.id)) {
        activeJobs.get(auto.id)?.stop();
        activeJobs.delete(auto.id);
        console.log(`[scheduler] Disabled job: ${auto.id}`);
      }
      continue;
    }

    if (activeJobs.has(auto.id)) {
      // For simplicity, we just stop and recreate to ensure cron expression is up to date
      activeJobs.get(auto.id)?.stop();
      activeJobs.delete(auto.id);
    }

    if (!cron.validate(auto.cron)) {
      console.error(`[scheduler] Invalid cron expression for job ${auto.id}: ${auto.cron}`);
      continue;
    }

    const job = cron.schedule(auto.cron, async () => {
      console.log(`[scheduler] Triggering job: ${auto.id}`);
      try {
        // We reuse the channel runner since it safely wraps the Agent execution logic
        await runChannelAgent(auto.input, {
          agentId: auto.agentId || 'main',
          sessionId: `cron-${auto.id}`,
        });
        console.log(`[scheduler] Job completed: ${auto.id}`);
      } catch (error: any) {
        console.error(`[scheduler] Job failed: ${auto.id}`, error);
      }
    });

    activeJobs.set(auto.id, job);
    console.log(`[scheduler] Scheduled job: ${auto.id} [${auto.cron}]`);
  }
}
