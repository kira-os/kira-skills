import '/workspace/kira/scripts/load-env.js';
/**
 * Kira Router — LLM Response Generation
 *
 * Routes to the appropriate model based on classified intent
 * and generates a response with loaded context.
 *
 * Primary: Kimi K2.5 (all response generation)
 * Fallback: DeepSeek Chat (if Moonshot is down)
 * Bidirectional fallback: any provider can fall back to any other.
 */

import OpenAI from "openai";
import { execSync } from "child_process";
import { MODEL_ROUTES, PROVIDERS, PERSONAS, FALLBACK_ORDER, FALLBACK_MODELS } from "./config.js";

/**
 * Create an OpenAI-compatible client for a given provider.
 */
function create_client(provider_name) {
  const provider = PROVIDERS[provider_name];
  if (provider === undefined) {
    throw new Error(`Unknown provider: ${provider_name}`);
  }

  const api_key = process.env[provider.api_key_env];
  if (api_key === undefined || api_key === "") {
    throw new Error(`${provider.api_key_env} is not set`);
  }

  return new OpenAI({
    baseURL: provider.base_url,
    apiKey: api_key,
  });
}

/**
 * Execute a shell command and return stdout.
 * Returns null on failure.
 */
function exec_command(cmd, timeout_ms) {
  try {
    const output = execSync(cmd, {
      timeout: timeout_ms,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return output.trim();
  } catch (err) {
    console.error(`Command failed: ${cmd} — ${err.message}`);
    return null;
  }
}

/**
 * Handle local commands by actually executing them.
 * Returns a response string or null if unhandled.
 */
function handle_command(matched_command) {
  const skill_base = "skills/kira_solana/scripts/solana.js";
  const engagement_base = "skills/kira_engagement/scripts/engagement.js";

  switch (matched_command) {
    case "token_price": {
      const raw = exec_command(`node ${skill_base} token-info --token $KIRA_TOKEN_MINT`, 15000);
      if (raw !== null) {
        try {
          const data = JSON.parse(raw);
          return `$KIRA is at $${data.price} — market cap ${data.market_cap}, ${data.holders} holders.`;
        } catch (_) {
          return `Here's what I got: ${raw.slice(0, 300)}`;
        }
      }
      return "Having trouble reaching the Solana RPC right now. Try again in a bit.";
    }

    case "treasury": {
      const raw = exec_command(`node ${skill_base} treasury`, 15000);
      if (raw !== null) {
        try {
          const data = JSON.parse(raw);
          return `Treasury: ${data.balance_sol} SOL (~$${data.balance_usd}). We're good.`;
        } catch (_) {
          return `Treasury data: ${raw.slice(0, 300)}`;
        }
      }
      return "Can't reach the treasury right now. I'll check on it.";
    }

    case "holders": {
      const raw = exec_command(`node ${skill_base} token-info --token $KIRA_TOKEN_MINT`, 15000);
      if (raw !== null) {
        try {
          const data = JSON.parse(raw);
          return `$KIRA has ${data.holders} holders right now.`;
        } catch (_) {
          return `Holder info: ${raw.slice(0, 300)}`;
        }
      }
      return "Can't pull holder data right now. Try again shortly.";
    }

    case "leaderboard": {
      const raw = exec_command(`node ${engagement_base} leaderboard --limit 5`, 10000);
      if (raw !== null) {
        return `Top community members:\n${raw.slice(0, 500)}`;
      }
      return "Engagement leaderboard is taking a moment. Check kiraos.live for the live board.";
    }

    case "current_project": {
      const raw = exec_command(
        `node -e "const{createClient}=require('@supabase/supabase-js');const sb=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_KEY);const{data}=await sb.from('kira_project_registry').select('name,description,status').eq('status','active').order('last_worked_at',{ascending:false}).limit(3);console.log(JSON.stringify(data));"`,
        10000,
      );
      if (raw !== null) {
        try {
          const projects = JSON.parse(raw);
          if (projects.length === 0) {
            return "Between projects right now. About to pick something new from my backlog.";
          }
          const list = projects.map((p) => `• ${p.name}: ${p.description}`).join("\n");
          return `Currently working on:\n${list}`;
        } catch (_) {
          return `Active projects: ${raw.slice(0, 300)}`;
        }
      }
      return "Let me check my project registry...";
    }

    case "repos": {
      const raw = exec_command(`gh repo list kira-os --json name,description --limit 10`, 10000);
      if (raw !== null) {
        try {
          const repos = JSON.parse(raw);
          if (repos.length === 0) {
            return "Setting up my first repos. Watch this space.";
          }
          const list = repos.map((r) => `• ${r.name}${r.description ? `: ${r.description}` : ""}`).join("\n");
          return `My repos at github.com/kira-os:\n${list}`;
        } catch (_) {
          return `Repos: ${raw.slice(0, 300)}`;
        }
      }
      return "Check out github.com/kira-os for my latest work.";
    }

    case "status": {
      return "Running 24/7, building and learning. Check kiraos.live to see what I'm up to right now.";
    }

    default:
      return null;
  }
}

/**
 * Generate a response using the routed model with bidirectional fallback.
 *
 * @param {object} params
 * @param {string} params.message - The user's message
 * @param {string} params.intent - Classified intent
 * @param {string | null} params.matched_command - Command name if intent is "command"
 * @param {string} params.context_text - Loaded context string
 * @param {string} params.sender_name - Sender display name
 * @param {string} params.platform - Platform name
 * @returns {Promise<{response_text: string, model_used: string}>}
 */
export async function generate_response({
  message,
  intent,
  matched_command,
  context_text,
  sender_name,
  platform,
}) {
  // Handle spam — no response
  if (intent === "spam") {
    return {
      response_text: "",
      model_used: "none",
    };
  }

  // Handle commands by executing them
  if (intent === "command" && matched_command !== null) {
    const command_response = handle_command(matched_command);
    if (command_response !== null) {
      return {
        response_text: command_response,
        model_used: "local",
      };
    }
  }

  // Get route config
  const route = MODEL_ROUTES[intent];
  if (route === undefined || route.provider === "skip" || route.provider === "local") {
    return {
      response_text: "I hear you! Let me think about that.",
      model_used: "fallback",
    };
  }

  // Build system prompt
  const persona_key = route.persona;
  const persona = PERSONAS[persona_key];
  if (persona === undefined) {
    throw new Error(`Unknown persona: ${persona_key}`);
  }

  let system_prompt = persona;

  // Add context if available
  if (context_text.length > 0) {
    system_prompt += `\n\n--- Context ---\n${context_text}`;
  }

  // Add platform-specific instructions
  system_prompt += `\n\n--- Instructions ---\n`;
  system_prompt += `You are replying on ${platform}`;
  if (sender_name !== null && sender_name !== undefined && sender_name.length > 0) {
    system_prompt += ` to ${sender_name}`;
  }
  system_prompt += `. Keep your response concise and natural. Don't use markdown formatting unless the user is asking a technical question. Be direct. Have personality.`;

  const messages = [
    { role: "system", content: system_prompt },
    { role: "user", content: message },
  ];

  // Try primary provider
  const primary_result = await try_provider(route.provider, route.model, messages, route.max_tokens, route.temperature);
  if (primary_result !== null) {
    return primary_result;
  }

  // Try fallback provider
  const fallback_provider = FALLBACK_ORDER[route.provider];
  if (fallback_provider !== undefined) {
    const fallback_model = FALLBACK_MODELS[fallback_provider];
    console.error(`Primary ${route.provider} failed, trying fallback ${fallback_provider}/${fallback_model}`);

    const fallback_result = await try_provider(fallback_provider, fallback_model, messages, route.max_tokens, route.temperature);
    if (fallback_result !== null) {
      return {
        response_text: fallback_result.response_text,
        model_used: `${fallback_result.model_used} (fallback)`,
      };
    }
  }

  return {
    response_text: "Hit a snag generating a response. Give me a moment and try again.",
    model_used: "error",
  };
}

/**
 * Attempt to generate a response with a specific provider/model.
 * Returns null on failure.
 */
async function try_provider(provider_name, model, messages, max_tokens, temperature) {
  try {
    const client = create_client(provider_name);
    const response = await client.chat.completions.create({
      model,
      messages,
      max_tokens,
      temperature,
    });

    const choice = response.choices[0];
    if (choice === undefined) {
      return null;
    }

    return {
      response_text: choice.message.content.trim(),
      model_used: model,
    };
  } catch (err) {
    console.error(`Provider ${provider_name}/${model} failed: ${err.message}`);
    return null;
  }
}
