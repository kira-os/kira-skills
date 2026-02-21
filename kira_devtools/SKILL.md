---
name: kira-devtools
description: "Development framework reference and best practices. Consult this when: (1) Building with Next.js App Router, (2) Using Vercel AI SDK for AI features, (3) Creating Inngest serverless functions, (4) Writing TypeScript with strict standards, (5) Styling with global design tokens. This skill provides patterns and conventions — not executable scripts."
metadata:
  openclaw:
    emoji: "🛠️"
---

# Kira Development Toolkit Reference

Reference guide for frameworks and tools Kira uses when building projects. Consult Context7 MCP for the latest API docs — this skill provides conventions and patterns.

---

## Next.js (App Router)

**Version**: 15+ with App Router (NOT Pages Router)

### Project Structure

```
app/
├── layout.tsx          # Root layout (providers, fonts, global CSS)
├── page.tsx            # Home page
├── globals.css         # Global styles
├── (auth)/             # Route group for auth pages
│   ├── login/page.tsx
│   └── signup/page.tsx
├── dashboard/
│   ├── layout.tsx      # Dashboard-specific layout
│   ├── page.tsx        # Dashboard home
│   └── [id]/page.tsx   # Dynamic route
├── api/                # Route Handlers (API endpoints)
│   └── webhook/route.ts
└── actions/            # Server Actions
    └── user.ts
```

### Key Conventions

- **Server Components by default** — only add `"use client"` when you need browser APIs, state, or effects
- **Server Actions** for mutations — `"use server"` functions, NOT API routes
- **Route Handlers** (`route.ts`) only for webhooks, external API integrations, streaming
- **Metadata** via `export const metadata` or `generateMetadata()` — never manual `<head>`
- **Loading states** via `loading.tsx` — never manual loading spinners in page components
- **Error boundaries** via `error.tsx` — automatic error handling per route segment
- **Dynamic routes** via `[param]` folders — access via `params` prop (awaited in Next.js 15+)

### Data Fetching

```typescript
// Server Component — fetch directly (no useEffect, no useState)
async function DashboardPage() {
  const data = await fetch_dashboard_data();
  return <Dashboard data={data} />;
}

// Server Action — mutations
"use server";
async function create_project(form_data: FormData) {
  const name = form_data.get("name") as string;
  const project = await db.projects.create({ name });
  revalidatePath("/dashboard");
  return project;
}
```

### Important Next.js 15+ Changes

- `params` and `searchParams` are now **Promises** — must `await` them
- `cookies()` and `headers()` are async
- Use `next/navigation` for `useRouter`, `usePathname`, `useSearchParams`
- Use `next/image` for all images (automatic optimization)

---

## Vercel AI SDK

**Package**: `ai` (core), `@ai-sdk/openai`, `@ai-sdk/anthropic`, etc.

### Core Pattern — `generateText` / `streamText`

```typescript
import { generateText, streamText } from "ai";
import { openai } from "@ai-sdk/openai";

// Simple generation
const { text } = await generateText({
  model: openai("gpt-4o"),
  prompt: "Explain quantum computing",
});

// Streaming
const result = streamText({
  model: openai("gpt-4o"),
  messages: [{ role: "user", content: "Hello" }],
});

// In a Route Handler
return result.toDataStreamResponse();
```

### Tool Calling

```typescript
import { generateText, tool } from "ai";
import { z } from "zod";

const result = await generateText({
  model: openai("gpt-4o"),
  tools: {
    get_weather: tool({
      description: "Get weather for a location",
      parameters: z.object({
        city: z.string().describe("City name"),
      }),
      execute: async ({ city }) => {
        const weather = await fetch_weather(city);
        return weather;
      },
    }),
  },
  prompt: "What's the weather in Tokyo?",
});
```

### useChat Hook (Client Component)

```typescript
"use client";
import { useChat } from "@ai-sdk/react";

export function ChatInterface() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: "/api/chat",
  });

  return (
    <form onSubmit={handleSubmit}>
      {messages.map((m) => (
        <div key={m.id}>{m.content}</div>
      ))}
      <input value={input} onChange={handleInputChange} />
    </form>
  );
}
```

### Structured Output

```typescript
import { generateObject } from "ai";
import { z } from "zod";

const { object } = await generateObject({
  model: openai("gpt-4o"),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    tags: z.array(z.string()),
  }),
  prompt: "Analyze this article...",
});
```

---

## Inngest

**Package**: `inngest`

Inngest provides durable serverless functions triggered by events. Functions automatically retry, can have steps, and support scheduling.

### Setup

```typescript
// lib/inngest/client.ts
import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "kira-os",
});
```

### Serve endpoint (Next.js App Router)

```typescript
// app/api/inngest/route.ts
import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { my_function } from "@/lib/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [my_function],
});
```

### Defining Functions

```typescript
// lib/inngest/functions.ts
import { inngest } from "./client";

export const process_upload = inngest.createFunction(
  {
    id: "process-upload",
    retries: 3,
  },
  { event: "app/upload.created" },
  async ({ event, step }) => {
    // Step 1 — each step retries independently
    const file = await step.run("fetch-file", async () => {
      return await download_file(event.data.file_url);
    });

    // Step 2 — runs after step 1 succeeds
    const result = await step.run("process-file", async () => {
      return await process_file(file);
    });

    // Step 3 — wait for external event
    const approval = await step.waitForEvent("wait-for-approval", {
      event: "app/upload.approved",
      timeout: "24h",
      match: "data.upload_id",
    });

    // Step 4 — scheduled delay
    await step.sleep("cool-down", "5m");

    return { status: "complete", result };
  }
);
```

### Sending Events

```typescript
// From anywhere in your app
import { inngest } from "@/lib/inngest/client";

await inngest.send({
  name: "app/upload.created",
  data: {
    file_url: "https://...",
    user_id: "user_123",
  },
});
```

### Cron / Scheduled Functions

```typescript
export const daily_cleanup = inngest.createFunction(
  { id: "daily-cleanup" },
  { cron: "0 4 * * *" },  // 4am daily
  async ({ step }) => {
    await step.run("cleanup", async () => {
      return await prune_old_records();
    });
  }
);
```

### Fan-out Pattern

```typescript
export const batch_process = inngest.createFunction(
  { id: "batch-process" },
  { event: "app/batch.start" },
  async ({ event, step }) => {
    const items = event.data.items;

    // Fan out — send individual events
    await step.run("fan-out", async () => {
      const events = items.map((item) => ({
        name: "app/item.process" as const,
        data: { item_id: item.id },
      }));
      await inngest.send(events);
    });
  }
);
```

---

## TypeScript Standards

### Strict Mode Always

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "exactOptionalPropertyTypes": true
  }
}
```

### Naming Convention — snake_case

```typescript
// Variables, functions, parameters, properties
const user_id = "abc123";
const is_active = true;
function get_user_by_id(user_id: string): Promise<User> { ... }

// Types and interfaces — PascalCase (only exception)
interface UserProfile {
  user_id: string;
  display_name: string;
  created_at: Date;
}

// Constants — UPPER_SNAKE_CASE
const MAX_RETRIES = 3;
const API_BASE_URL = "https://api.example.com";
```

### Error Handling

```typescript
// Custom error classes with context
class UserNotFoundError extends Error {
  constructor(public user_id: string) {
    super(`User not found: ${user_id}`);
    this.name = "UserNotFoundError";
  }
}

// Explicit null handling — no fallbacks
async function get_user(id: string): Promise<User> {
  const user = await db.users.find(id);
  if (user === null) {
    throw new UserNotFoundError(id);
  }
  return user;
}
```

### Zero Tolerance

- **No `any`** — define proper types
- **No `as` assertions** — fix the type
- **No `!` non-null** — handle null explicitly
- **No `@ts-ignore`** — fix the error
- **No `|| fallback`** — use explicit conditionals

---

## Global Styles

When building UI, always use a design system approach:

### Tailwind CSS Conventions

```typescript
// Use semantic class names from the design system
<div className="glass-card p-6 space-y-4">
  <h2 className="text-xl font-semibold text-primary">Title</h2>
  <p className="text-secondary">Description</p>
  <Button variant="primary" size="md">Action</Button>
</div>

// NEVER inline styles
// WRONG: style={{ padding: "24px", color: "#333" }}
```

### Theme-Aware Colors

```css
/* Use CSS custom properties for theme support */
:root {
  --color-primary: #6366f1;
  --color-secondary: #a1a1aa;
  --color-background: #09090b;
  --color-surface: #18181b;
  --color-border: #27272a;
}
```

### Spacing Scale

Use consistent spacing: `p-2` (8px), `p-4` (16px), `p-6` (24px), `p-8` (32px). Never use arbitrary values like `p-[13px]` unless matching an exact external spec.

---

## Lookup Commands

When you need the latest API docs for any of these frameworks, use Context7 MCP:

```
# Next.js
resolve-library-id("next.js") → query-docs(id, "app router server actions")

# AI SDK
resolve-library-id("vercel ai sdk") → query-docs(id, "streamText with tools")

# Inngest
resolve-library-id("inngest") → query-docs(id, "step.run retry")

# Supabase
resolve-library-id("supabase") → query-docs(id, "RLS policies")

# Tailwind
resolve-library-id("tailwindcss") → query-docs(id, "dark mode")
```

Use the Supabase MCP to directly query and modify your database tables, run migrations, and check for security advisories.
