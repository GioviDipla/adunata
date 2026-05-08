# GoblinAI Rules Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build GoblinAI, an in-app Magic: The Gathering rules assistant that answers only after it has grounded card facts in local oracle text and, for complex interactions, has restated the scenario in MTG order and received user confirmation.

**Architecture:** GoblinAI is server-side RAG plus deterministic MTG keyword routing. The client sends explicit `@mention` card IDs, the server loads local oracle text from `cards`, derives interaction keywords, retrieves relevant rules/rulings, asks DeepSeek only to reason over that grounded context, and stores a compact history/debug record. Multi-card or zone/effect/timing scenarios use a two-step Scenario Restatement Gate before final answer generation.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase/Postgres/RLS, local `cards.oracle_text`, DeepSeek API (`deepseek-v4-flash`, base URL `https://api.deepseek.com`), AI SDK v6 beta or direct OpenAI-compatible fetch, Upstash Redis rate limiting, TypeScript, Vitest for pure helper tests, Playwright for smoke UI.

---

## Locked Product Decisions

- V1 scope is **Rules Q&A only**. No scanner, no deckbuilding coach, no Reddit training, no model fine-tuning.
- GoblinAI identifies cards **only through explicit `@mention` tokens**. It does not guess untagged card names.
- Every `@mention` resolves to local DB `cards` row and uses local `oracle_text`, `card_faces`, `keywords`, `type_line`, `produced_mana`, and trigger flags.
- DeepSeek is **model-second**, never source of truth for card text.
- Complex scenarios use **Scenario Restatement Gate**:
  1. parse/restate MTG scenario,
  2. ask user to confirm or correct,
  3. generate final rules answer only after confirmation.
- Simple single-rule questions may answer immediately if no card/zone/effect ambiguity exists.
- User-facing answer should be rich, careful, and explanatory. Not terse. Caveman style is for Codex conversation, not GoblinAI product voice.
- Citations/rule IDs can remain internal in V1 UI, but backend must retain retrieved rule/ruling IDs for inspection and debugging.

## Repo Facts To Preserve

- `cards` table already has `oracle_text`, `keywords`, `card_faces`, `type_line`, `produced_mana`, `legalities`, and trigger flags.
- `CARD_DETAIL_COLUMNS` already includes oracle-level fields.
- Authenticated app shell is `src/app/(app)/layout.tsx`, with `Navbar` and `MainContent`.
- Existing rate-limit helper is `src/lib/rate-limit.ts`; add an assistant limiter there rather than creating a second Redis wrapper.
- Existing card search endpoint is `/api/cards/search`; reuse for `@mention` autocomplete.
- Current package has no AI SDK dependency and no TS unit-test runner. Add only the minimum needed for GoblinAI.

## External Docs Checked

- DeepSeek official API docs:
  - `deepseek-v4-flash` and `deepseek-v4-pro` are current API model IDs.
  - OpenAI-compatible base URL is `https://api.deepseek.com`.
  - legacy `deepseek-chat` and `deepseek-reasoner` are deprecated on 2026-07-24.
  - pricing/features page lists JSON Output and Tool Calls for V4 models.
- AI SDK v6 beta docs:
  - `streamText` in App Router route handlers can return `toUIMessageStreamResponse()`.
  - `useChat` can use `TextStreamChatTransport`.
  - `@ai-sdk/deepseek` exists, but direct `fetch` remains acceptable if provider version lags current model IDs.
- Wizards rules source:
  - Comprehensive Rules must come from official rules download page.
- Scryfall source:
  - Oracle text is already local; Scryfall bulk rulings can seed `card_rulings` for V1.1.

---

## Target User Flow

### Flow A - Complex Interaction

User writes:

```text
Se ho @Anikthea, Hand of Erebos sul campo insieme a 2 @Doubling Season, e con l'etb di Anikthea esilio dal cimitero @Summon: Bahamut, i segnalini saga vengono messi e duplicati?
```

GoblinAI:

1. Resolves exactly three mentions by ID:
   - Anikthea, Hand of Erebos
   - Doubling Season
   - Summon: Bahamut
2. Loads local oracle text.
3. Derives interaction keywords:
   - `triggered_ability`
   - `zone_change`
   - `token_creation`
   - `copy_effect`
   - `replacement_effect`
   - `counter_placement`
   - `saga_lore_counter`
4. Retrieves rule families:
   - 603 triggered abilities
   - 614 replacement effects
   - 707 copies
   - 111 tokens
   - 122 counters
   - 714 Sagas, if present in current CR text
5. Returns restatement only:

```text
Ho capito lo scenario cosi:

1. Tu controlli Anikthea, Hand of Erebos sul campo di battaglia.
2. Tu controlli due Doubling Season sul campo di battaglia.
3. Summon: Bahamut e nel tuo cimitero.
4. Anikthea entra nel campo di battaglia oppure attacca.
5. L'abilita innescata di Anikthea bersaglia Summon: Bahamut nel tuo cimitero.
6. Alla risoluzione, Summon: Bahamut viene esiliata.
7. L'effetto crea un token copia di Summon: Bahamut, con le modifiche indicate da Anikthea.
8. La domanda e se il token Saga entra con segnalini lore e se i due Doubling Season raddoppiano token e/o segnalini.

Confermi che questo e lo scenario corretto?
```

6. Final answer is generated only after user confirms.

### Flow B - Simple Rule

User writes:

```text
Se una creatura ha lifelink e doppio attacco, guadagno vita due volte?
```

GoblinAI can answer immediately:

```text
Scenario: una creatura con lifelink e double strike infligge danno da combattimento.

Si: guadagni vita ogni volta che quella creatura infligge danno. Se infligge danno sia nel first-strike combat damage step sia nel normal combat damage step, guadagni vita in entrambi gli step. Se nel secondo step non infligge danno, guadagni vita solo una volta.
```

---

## Data Model

### Migration: Rules And Assistant Tables

Create `supabase/migrations/YYYYMMDDHHMMSS_goblinai_rules_assistant.sql`.

SQL:

```sql
create extension if not exists pg_trgm;

create table if not exists public.mtg_rules (
  id uuid primary key default gen_random_uuid(),
  rule_number text not null,
  parent_rule_number text,
  section_title text,
  text text not null,
  source_version text not null,
  keywords text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rule_number, source_version)
);

create index if not exists mtg_rules_rule_number_idx
  on public.mtg_rules (rule_number);

create index if not exists mtg_rules_keywords_gin_idx
  on public.mtg_rules using gin (keywords);

create index if not exists mtg_rules_text_trgm_idx
  on public.mtg_rules using gin (text gin_trgm_ops);

create table if not exists public.card_rulings (
  id uuid primary key default gen_random_uuid(),
  card_id integer not null references public.cards(id) on delete cascade,
  scryfall_oracle_id text,
  ruling_date date,
  text text not null,
  source text not null default 'scryfall',
  keywords text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (card_id, ruling_date, text)
);

create index if not exists card_rulings_card_idx
  on public.card_rulings (card_id);

create index if not exists card_rulings_keywords_gin_idx
  on public.card_rulings using gin (keywords);

create table if not exists public.goblinai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.goblinai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.goblinai_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  mentioned_card_ids integer[] not null default '{}',
  interaction_keywords text[] not null default '{}',
  retrieved_rule_numbers text[] not null default '{}',
  retrieved_ruling_ids uuid[] not null default '{}',
  restatement_status text not null default 'none'
    check (restatement_status in ('none', 'pending_confirmation', 'confirmed')),
  model text,
  prompt_tokens integer,
  completion_tokens integer,
  created_at timestamptz not null default now()
);

create index if not exists goblinai_messages_conversation_idx
  on public.goblinai_messages (conversation_id, created_at);

alter table public.mtg_rules enable row level security;
alter table public.card_rulings enable row level security;
alter table public.goblinai_conversations enable row level security;
alter table public.goblinai_messages enable row level security;

drop policy if exists mtg_rules_read_all on public.mtg_rules;
create policy mtg_rules_read_all on public.mtg_rules
  for select using (true);

drop policy if exists card_rulings_read_all on public.card_rulings;
create policy card_rulings_read_all on public.card_rulings
  for select using (true);

drop policy if exists goblinai_conversations_owner_all on public.goblinai_conversations;
create policy goblinai_conversations_owner_all on public.goblinai_conversations
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists goblinai_messages_owner_all on public.goblinai_messages;
create policy goblinai_messages_owner_all on public.goblinai_messages
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

Important:
- Do not add pgvector in V1. Keyword routing and trigram are enough for first reliable version.
- Do not store full prompts with secret/system content. Store compact debug fields only.
- Keep `card_rulings.card_id integer` because current generated Supabase type uses `cards.id: number`.
- After migration, regenerate `src/types/supabase.ts`.

---

## File Structure

Create:

- `src/lib/goblinai/types.ts`
  - Shared request/response and domain types.
- `src/lib/goblinai/interaction-keywords.ts`
  - Deterministic oracle text classifier.
- `src/lib/goblinai/rule-router.ts`
  - Maps interaction keywords to rule families and DB filters.
- `src/lib/goblinai/context-builder.ts`
  - Loads mentioned cards, derived keywords, rules, rulings, and builds model context.
- `src/lib/goblinai/deepseek.ts`
  - Server-only DeepSeek client wrapper.
- `src/lib/goblinai/prompts.ts`
  - System prompts for restatement and final answer.
- `src/components/goblinai/GoblinAIButton.tsx`
  - Floating button.
- `src/components/goblinai/GoblinAIPanel.tsx`
  - Drawer/panel chat UI.
- `src/components/goblinai/GoblinAIComposer.tsx`
  - Textarea plus `@mention` autocomplete.
- `src/components/goblinai/GoblinAIMessage.tsx`
  - Message rendering, mentioned card chips, confirmation controls.
- `src/app/api/assistant/rules/restatement/route.ts`
  - First-step API: parse/restate scenario.
- `src/app/api/assistant/rules/answer/route.ts`
  - Second-step API: final answer after confirmation.
- `src/app/api/assistant/rules/simple/route.ts`
  - Simple-rule fast path, optional but recommended to keep route logic small.
- `scripts/ingest-mtg-rules.mjs`
  - Reads local Comprehensive Rules text file and upserts `mtg_rules`.
- `scripts/ingest-scryfall-rulings.mjs`
  - Downloads Scryfall rulings bulk and upserts `card_rulings`.
- `tests/goblinai/interaction-keywords.test.ts`
  - Unit tests for deterministic classifier.
- `tests/goblinai/rule-router.test.ts`
  - Unit tests for rule family routing.
- `tests/goblinai/scenario-gate.test.ts`
  - Unit tests for deciding restatement vs simple answer.
- `tests/goblinai/mention-contract.test.ts`
  - Unit tests proving unmentioned names are ignored.
- `tests/goblinai/goblinai-ui.spec.ts`
  - Playwright smoke test for panel and confirmation flow.

Modify:

- `package.json`
  - Add AI dependencies and test script.
- `src/env.ts`
  - Add server-only `DEEPSEEK_API_KEY`.
- `src/lib/rate-limit.ts`
  - Add assistant limiter.
- `src/app/(app)/layout.tsx`
  - Mount `GoblinAIButton` inside authenticated app shell.
- `src/lib/supabase/columns.ts`
  - Add GoblinAI card columns constant.
- `src/types/supabase.ts`
  - Regenerate after migration.

Do not modify:
- Deck editor behavior.
- Collection UI.
- Goldfish simulator.
- Game engine.

---

## Environment And Dependencies

### Package Additions

Install:

```bash
npm install ai@beta @ai-sdk/react@beta @ai-sdk/deepseek@beta zod
npm install -D vitest jsdom @testing-library/react @testing-library/user-event
```

Update `package.json` scripts:

```json
{
  "scripts": {
    "test:goblinai": "vitest run tests/goblinai",
    "test:goblinai:watch": "vitest tests/goblinai"
  }
}
```

If `@ai-sdk/deepseek` rejects `deepseek-v4-flash`, implement `src/lib/goblinai/deepseek.ts` with direct OpenAI-compatible `fetch` instead of blocking on provider support.

### Environment Variables

Add to local env, Vercel env, and deployment docs:

```bash
DEEPSEEK_API_KEY=sk-your-deepseek-key-from-dashboard
GOBLINAI_MODEL=deepseek-v4-flash
```

Rules:
- `DEEPSEEK_API_KEY` must never be prefixed with `NEXT_PUBLIC_`.
- Do not expose model response raw debug to client.
- Route handlers read env server-side only.

Update `src/env.ts`:

```ts
function optionalEnv(name: string): string | undefined {
  const value = process.env[name]
  return value && value.trim().length > 0 ? value : undefined
}

export const serverEnv = {
  deepseekApiKey: optionalEnv('DEEPSEEK_API_KEY'),
  goblinAiModel: optionalEnv('GOBLINAI_MODEL') ?? 'deepseek-v4-flash',
}
```

Do not put `serverEnv` inside client-imported files. If `src/env.ts` is imported by client components today, split into:
- `src/env.ts` for public env,
- `src/env.server.ts` for server-only env.

---

## Core Types

Create `src/lib/goblinai/types.ts`:

```ts
export type InteractionKeyword =
  | 'activated_ability'
  | 'attack_trigger'
  | 'cast_trigger'
  | 'continuous_effect'
  | 'copy_effect'
  | 'counter_placement'
  | 'dies_trigger'
  | 'double_strike'
  | 'etb_trigger'
  | 'first_strike'
  | 'keyword_lifelink'
  | 'layer_effect'
  | 'replacement_effect'
  | 'saga_lore_counter'
  | 'state_based_action'
  | 'static_ability'
  | 'targeting'
  | 'token_creation'
  | 'triggered_ability'
  | 'zone_change'

export interface MentionedCardRef {
  id: number
  name: string
}

export interface GoblinAICardContext {
  id: number
  name: string
  mana_cost: string | null
  type_line: string
  oracle_text: string | null
  keywords: string[] | null
  card_faces: unknown
  produced_mana: string[] | null
}

export interface GoblinAIRuleContext {
  rule_number: string
  section_title: string | null
  text: string
  keywords: string[]
}

export interface GoblinAIRulingContext {
  id: string
  card_id: number
  ruling_date: string | null
  text: string
  keywords: string[]
}

export interface RestatementRequest {
  message: string
  mentions: MentionedCardRef[]
  conversationId?: string
}

export interface RestatementResponse {
  conversationId: string
  messageId: string
  requiresConfirmation: boolean
  restatement: string
  assumptions: string[]
  missingInfoQuestions: string[]
  interactionKeywords: InteractionKeyword[]
  mentionedCards: GoblinAICardContext[]
}

export interface AnswerRequest {
  conversationId: string
  restatementMessageId: string
  confirmedRestatement: string
  userCorrection?: string
}

export interface AnswerResponse {
  answer: string
  interactionKeywords: InteractionKeyword[]
  mentionedCards: GoblinAICardContext[]
  usedRuleNumbers: string[]
}
```

---

## Deterministic Keyword Layer

Create `src/lib/goblinai/interaction-keywords.ts`.

The classifier must:
- scan all oracle text, including `card_faces`,
- return stable sorted keywords,
- never call an LLM,
- never infer from card name alone.

Initial mapping:

| Pattern | Keyword |
| --- | --- |
| `whenever`, `when`, `at the beginning`, `at end of combat` | `triggered_ability` |
| `enters the battlefield` | `etb_trigger` |
| `attacks` | `attack_trigger` |
| `dies` | `dies_trigger` |
| `whenever you cast`, `when you cast` | `cast_trigger` |
| `if .* would .* instead`, `instead`, `replacement` | `replacement_effect` |
| `create .* token`, `token copy` | `token_creation` |
| `copy`, `token that's a copy` | `copy_effect` |
| `counter`, `counters`, `lore counter` | `counter_placement` |
| `saga`, `lore counter` | `saga_lore_counter` |
| `exile`, `graveyard`, `battlefield`, `hand`, `library`, `return` | `zone_change` |
| `target` | `targeting` |
| keyword array includes `Lifelink` | `keyword_lifelink` |
| keyword array includes `Double strike` | `double_strike` |
| keyword array includes `First strike` | `first_strike` |

Test cases:

```ts
import { describe, expect, it } from 'vitest'
import { deriveInteractionKeywords } from '@/lib/goblinai/interaction-keywords'

describe('deriveInteractionKeywords', () => {
  it('detects Anikthea style token/copy/zone trigger', () => {
    const keywords = deriveInteractionKeywords({
      oracle_text: 'Whenever Anikthea enters or attacks, exile up to one target non-Aura enchantment card from your graveyard. Create a token that is a copy of that card, except it is a 3/3 black Zombie creature in addition to its other types.',
      keywords: [],
      type_line: 'Legendary Enchantment Creature - Demigod',
      card_faces: null,
    })
    expect(keywords).toEqual([
      'attack_trigger',
      'copy_effect',
      'etb_trigger',
      'targeting',
      'token_creation',
      'triggered_ability',
      'zone_change',
    ])
  })

  it('detects Doubling Season replacement and counters', () => {
    const keywords = deriveInteractionKeywords({
      oracle_text: 'If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead. If an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead.',
      keywords: [],
      type_line: 'Enchantment',
      card_faces: null,
    })
    expect(keywords).toEqual([
      'counter_placement',
      'replacement_effect',
      'token_creation',
    ])
  })

  it('detects lifelink and double strike from keyword array', () => {
    const keywords = deriveInteractionKeywords({
      oracle_text: null,
      keywords: ['Lifelink', 'Double strike'],
      type_line: 'Creature - Human Knight',
      card_faces: null,
    })
    expect(keywords).toEqual(['double_strike', 'keyword_lifelink'])
  })
})
```

---

## Rule Router

Create `src/lib/goblinai/rule-router.ts`.

Map keywords to rule families:

```ts
export const RULE_FAMILY_BY_KEYWORD: Record<InteractionKeyword, string[]> = {
  activated_ability: ['602'],
  attack_trigger: ['508', '603'],
  cast_trigger: ['601', '603'],
  continuous_effect: ['611', '613'],
  copy_effect: ['707'],
  counter_placement: ['122'],
  dies_trigger: ['700', '603'],
  double_strike: ['702'],
  etb_trigger: ['603'],
  first_strike: ['702'],
  keyword_lifelink: ['120', '702'],
  layer_effect: ['613'],
  replacement_effect: ['614', '616'],
  saga_lore_counter: ['714', '122'],
  state_based_action: ['704'],
  static_ability: ['604'],
  targeting: ['115'],
  token_creation: ['111'],
  triggered_ability: ['603'],
  zone_change: ['400'],
}
```

Routing behavior:
- Deduplicate rule families.
- Query `mtg_rules` by `rule_number = family OR rule_number LIKE family + '.%'`.
- Limit to max 40 rule rows before prompt assembly.
- If no rules are loaded, route still returns cards/oracle context and marks `rulesAvailable: false`.

Unit tests:

```ts
import { describe, expect, it } from 'vitest'
import { getRuleFamiliesForKeywords } from '@/lib/goblinai/rule-router'

describe('getRuleFamiliesForKeywords', () => {
  it('routes token replacement Saga scenario', () => {
    expect(getRuleFamiliesForKeywords([
      'token_creation',
      'replacement_effect',
      'copy_effect',
      'counter_placement',
      'saga_lore_counter',
    ])).toEqual(['111', '122', '614', '616', '707', '714'])
  })
})
```

---

## Context Builder

Create `src/lib/goblinai/context-builder.ts`.

Responsibilities:

1. Reject missing mentions for complex card scenarios.
2. Load mentioned card rows using admin Supabase client.
3. Preserve mention order from client.
4. Derive per-card and aggregate interaction keywords.
5. Retrieve rules via rule router.
6. Retrieve card-specific rulings for mentioned cards.
7. Build compact model context.

Public function:

```ts
export async function buildGoblinAIContext(input: {
  message: string
  mentions: MentionedCardRef[]
}): Promise<{
  cards: GoblinAICardContext[]
  interactionKeywords: InteractionKeyword[]
  rules: GoblinAIRuleContext[]
  rulings: GoblinAIRulingContext[]
  requiresConfirmation: boolean
  rulesAvailable: boolean
}>
```

`requiresConfirmation` is true when any condition matches:
- mentions length >= 2,
- aggregate keywords include any of:
  - `triggered_ability`
  - `replacement_effect`
  - `copy_effect`
  - `token_creation`
  - `counter_placement`
  - `zone_change`
  - `layer_effect`
  - `state_based_action`
- user text includes zone/timing terms:
  - battlefield, campo, cimitero, graveyard, stack, pila, attacco, combat, upkeep, end step, ETB, enters, trigger, innescata.

`requiresConfirmation` is false for:
- no mentions and simple rules keyword questions,
- one mention with no interaction keywords,
- keyword-only definitions.

Never auto-detect card names from message text. Only `mentions`.

---

## Prompt Policy

Create `src/lib/goblinai/prompts.ts`.

### Restatement System Prompt

```text
You are GoblinAI, a careful Magic: The Gathering rules assistant.

Your job in this step is NOT to answer the rules question.
Your job is to restate the scenario in a precise MTG order so the user can confirm or correct it.

Use only the provided card context. Never rely on memory for oracle text.
Do not infer unmentioned cards.
If the user's phrasing conflicts with the provided oracle text, explicitly flag the conflict.
Write in Italian.

For complex scenarios, structure the restatement in this order:
1. Active player / turn / phase if known.
2. Objects on battlefield, including controller if known.
3. Objects in other zones.
4. Initial event.
5. Triggered abilities involved.
6. Replacement effects involved.
7. Targets, choices, or modes.
8. What the user is asking.
9. Assumptions and missing information.

End with exactly:
"Confermi che questo e lo scenario corretto?"
```

### Final Answer System Prompt

```text
You are GoblinAI, a careful Magic: The Gathering rules assistant.

Answer only using the provided scenario, card oracle text, retrieved rulings, and retrieved Comprehensive Rules excerpts.
Do not use memory to change card text.
Write in Italian for a player, not a judge.
Be complete, not rushed.

Answer structure:
1. Short answer.
2. Step-by-step MTG sequence.
3. Why each relevant triggered ability, replacement effect, counter, token, copy, or zone change works that way.
4. Important caveats.
5. Final result.

If context is insufficient, say what is missing and do not guess.
```

### Simple Rule System Prompt

```text
You are GoblinAI, a careful Magic: The Gathering rules assistant.

The user asks a simple rules question. Give a direct but complete answer in Italian.
Use examples when helpful.
Do not invent card text.
If the question actually requires card-specific context, ask for @mentions.
```

---

## API Routes

### `POST /api/assistant/rules/restatement`

Request:

```json
{
  "message": "Se ho @Anikthea, Hand of Erebos sul campo insieme a 2 @Doubling Season, cosa succede?",
  "mentions": [{ "id": 123, "name": "Anikthea, Hand of Erebos" }],
  "conversationId": "optional-uuid"
}
```

Behavior:
- Require authenticated user.
- Enforce assistant rate limit.
- Validate input with zod.
- Build context.
- If no mentions and simple question, return `requiresConfirmation: false` plus optional simple answer redirect flag.
- If complex, call DeepSeek restatement prompt.
- Create conversation if missing.
- Save user message and assistant restatement message.

Response:

```json
{
  "conversationId": "uuid",
  "messageId": "uuid",
  "requiresConfirmation": true,
  "restatement": "Ho capito lo scenario cosi:\n\n1. Tu controlli Anikthea, Hand of Erebos.\n2. Tu controlli due Doubling Season.\n\nConfermi che questo e lo scenario corretto?",
  "assumptions": [],
  "missingInfoQuestions": [],
  "interactionKeywords": ["triggered_ability", "replacement_effect"],
  "mentionedCards": []
}
```

Failure cases:
- Missing `DEEPSEEK_API_KEY`: 503 with `GoblinAI is not configured`.
- Mention ID not found locally: 404 with `Mentioned card not found`.
- No `@mentions` for card-specific wording: 400 with `Use @mention for every card involved`.
- Rate limited: 429 using existing `enforceLimit`.

### `POST /api/assistant/rules/answer`

Request:

```json
{
  "conversationId": "uuid",
  "restatementMessageId": "uuid",
  "confirmedRestatement": "Ho capito lo scenario cosi:\n\n1. Tu controlli Anikthea, Hand of Erebos.\n2. Tu controlli due Doubling Season.",
  "userCorrection": "optional correction"
}
```

Behavior:
- Require authenticated user.
- Verify conversation/message belongs to user.
- Rebuild context from original user message and mentions saved in DB.
- If `userCorrection` exists, include it in prompt as latest scenario correction.
- Call DeepSeek final answer prompt.
- Save assistant answer message with debug metadata.
- Stream response if AI SDK route is stable; otherwise return JSON in V1 and add streaming in V1.1.

### `POST /api/assistant/rules/simple`

Use for simple no-mention questions. Optional route if implementation prefers route split.

Request:

```json
{ "message": "Cosa significa lifelink?" }
```

Behavior:
- Require authenticated user.
- Enforce rate limit.
- Call simple prompt with no card context.
- If message appears card-specific but has no mentions, return 400:

```json
{ "error": "Per domande su carte specifiche usa @mention per ogni carta coinvolta." }
```

---

## DeepSeek Client

Create `src/lib/goblinai/deepseek.ts`.

Preferred AI SDK implementation:

```ts
import { deepseek } from '@ai-sdk/deepseek'
import { generateText } from 'ai'
import { serverEnv } from '@/env.server'

export async function generateGoblinAIText(input: {
  system: string
  prompt: string
  temperature?: number
}) {
  if (!serverEnv.deepseekApiKey) {
    throw new Error('GoblinAI is not configured')
  }

  return generateText({
    model: deepseek(serverEnv.goblinAiModel),
    system: input.system,
    prompt: input.prompt,
    temperature: input.temperature ?? 0.2,
  })
}
```

Fallback direct fetch if provider cannot target `deepseek-v4-flash`:

```ts
export async function generateGoblinAIText(input: {
  system: string
  prompt: string
  temperature?: number
}) {
  if (!serverEnv.deepseekApiKey) {
    throw new Error('GoblinAI is not configured')
  }

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${serverEnv.deepseekApiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: serverEnv.goblinAiModel,
      temperature: input.temperature ?? 0.2,
      messages: [
        { role: 'system', content: input.system },
        { role: 'user', content: input.prompt },
      ],
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`DeepSeek request failed: ${res.status} ${body.slice(0, 500)}`)
  }

  const json = await res.json() as {
    choices?: Array<{ message?: { content?: string } }>
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }

  return {
    text: json.choices?.[0]?.message?.content ?? '',
    usage: json.usage,
  }
}
```

Use `temperature: 0.2` for restatement and final answer. Do not use high temperature for rules.

---

## UI Design

### Placement

Mount `GoblinAIButton` in `src/app/(app)/layout.tsx` inside `MainContent` sibling or child:

```tsx
<MainContent>{children}</MainContent>
<GoblinAIButton />
```

Hide on:
- `/play/[lobbyId]/game` immersive game if overlay conflicts,
- optionally `/decks/[id]/goldfish` in first release.

### Floating Button

Visual:
- bottom-right desktop,
- bottom-right mobile above safe area,
- icon from lucide `Bot` or `MessageCircleQuestion`,
- label only on hover/expanded desktop,
- no card-in-card layout.

### Panel

Desktop:
- right drawer width 420px.
- full height minus safe padding.

Mobile:
- bottom sheet/full-height panel.
- input sticky bottom.

Panel states:
- empty: "Chiedi una regola. Usa @ per citare ogni carta coinvolta."
- typing mention: autocomplete list from `/api/cards/search?q=ani`
- restatement pending: show restatement bubble plus `Conferma scenario` and `Correggi` controls.
- confirmed: answer appears below.

### `@mention` Contract

The composer stores structured mentions separately from text:

```ts
interface ComposerMention {
  id: number
  name: string
  start: number
  end: number
}
```

When user selects a card, insert display text:

```text
@Anikthea, Hand of Erebos
```

Send both:

```json
{
  "message": "Se ho @Anikthea, Hand of Erebos sul campo insieme a @Doubling Season, cosa succede?",
  "mentions": [{ "id": 123, "name": "Anikthea, Hand of Erebos" }]
}
```

If user manually types `@Anikthea` but does not select autocomplete, treat it as plain text and show inline warning:

```text
Seleziona la carta dal menu @mention, cosi GoblinAI usa l'oracle text corretto.
```

Do not auto-resolve manually typed names in V1.

---

## Ingestion Plan

### Comprehensive Rules

Manual first:

1. Download official Comprehensive Rules as text/docx/pdf from Wizards.
2. Save source file locally under ignored path:
   - `data/private/MagicCompRules.txt`
3. Run script:

```bash
node scripts/ingest-mtg-rules.mjs data/private/MagicCompRules.txt "2026-05"
```

Parser behavior:
- Detect rule number lines with regex:

```js
/^(\d{3}(?:\.\d+[a-z]?)?)\.\s+(.+)$/
```

- Parent section is first three digits.
- Keywords derived using same deterministic classifier plus rule-text mapping.
- Upsert by `(rule_number, source_version)`.

### Scryfall Rulings

Run:

```bash
node scripts/ingest-scryfall-rulings.mjs
```

Behavior:
- Fetch Scryfall bulk-data endpoint.
- Locate rulings bulk URI.
- Download JSON.
- Map ruling `oracle_id` to local `cards.scryfall_id` or local Scryfall oracle field if available.
- If local mapping is ambiguous or missing, skip and log count.
- Derive keywords from ruling text.
- Upsert `card_rulings`.

Note: If current local `cards` table lacks `oracle_id`, add it in a later migration only if mapping quality is poor. Do not block V1 on perfect full rulings ingestion.

---

## Rate Limiting

Modify `src/lib/rate-limit.ts`:

```ts
export const assistantLimiter = makeLimiter(20, '60 s', 'rl:assistant')
```

Route usage:

```ts
const limited = await enforceLimit(assistantLimiter, getClientId(request, user.id))
if (limited) return limited
```

Default budget:
- 20 assistant calls per minute per authenticated user.
- Restatement and answer each count as one call in V1.
- Later optimization: count a restatement+answer pair as one paid interaction by creating a custom limiter key.

---

## Implementation Tasks

### Task 1: Add Dependencies And Env Split

**Files:**
- Modify: `package.json`
- Create: `src/env.server.ts`
- Modify: `src/env.ts`

- [ ] Install dependencies.

Run:

```bash
npm install ai@beta @ai-sdk/react@beta @ai-sdk/deepseek@beta zod
npm install -D vitest jsdom @testing-library/react @testing-library/user-event
```

- [ ] Add scripts.

Expected `package.json` additions:

```json
"test:goblinai": "vitest run tests/goblinai",
"test:goblinai:watch": "vitest tests/goblinai"
```

- [ ] Create `src/env.server.ts` with `DEEPSEEK_API_KEY` and `GOBLINAI_MODEL`.
- [ ] Run `npm run lint`.
- [ ] Commit:

```bash
git add package.json package-lock.json src/env.ts src/env.server.ts
git commit -m "chore: add GoblinAI dependencies"
```

### Task 2: Add Rules Assistant Migration

**Files:**
- Create: `supabase/migrations/YYYYMMDDHHMMSS_goblinai_rules_assistant.sql`
- Modify: `src/types/supabase.ts`

- [ ] Add migration SQL from Data Model section.
- [ ] Apply migration locally/remotely using project Supabase workflow.
- [ ] Regenerate Supabase types.
- [ ] Verify `cards.id` type remains `number` in generated type.
- [ ] Commit:

```bash
git add supabase/migrations/*_goblinai_rules_assistant.sql src/types/supabase.ts
git commit -m "feat: add GoblinAI rules schema"
```

### Task 3: Implement Keyword Classifier With Tests

**Files:**
- Create: `src/lib/goblinai/types.ts`
- Create: `src/lib/goblinai/interaction-keywords.ts`
- Create: `tests/goblinai/interaction-keywords.test.ts`

- [ ] Write tests from Deterministic Keyword Layer section.
- [ ] Run `npm run test:goblinai`.
- [ ] Implement classifier until tests pass.
- [ ] Add extra tests for split cards/adventure/Saga `card_faces`.
- [ ] Commit:

```bash
git add src/lib/goblinai/types.ts src/lib/goblinai/interaction-keywords.ts tests/goblinai/interaction-keywords.test.ts
git commit -m "feat: derive GoblinAI interaction keywords"
```

### Task 4: Implement Rule Router With Tests

**Files:**
- Create: `src/lib/goblinai/rule-router.ts`
- Create: `tests/goblinai/rule-router.test.ts`

- [ ] Write tests for keyword to rule family mapping.
- [ ] Implement `getRuleFamiliesForKeywords`.
- [ ] Implement SQL filter helper returning families and `LIKE` patterns.
- [ ] Run `npm run test:goblinai`.
- [ ] Commit:

```bash
git add src/lib/goblinai/rule-router.ts tests/goblinai/rule-router.test.ts
git commit -m "feat: route GoblinAI keywords to rules"
```

### Task 5: Implement Context Builder

**Files:**
- Modify: `src/lib/supabase/columns.ts`
- Create: `src/lib/goblinai/context-builder.ts`
- Create: `tests/goblinai/mention-contract.test.ts`
- Create: `tests/goblinai/scenario-gate.test.ts`

- [ ] Add `CARD_GOBLINAI_COLUMNS`:

```ts
export const CARD_GOBLINAI_COLUMNS =
  'id, name, mana_cost, type_line, oracle_text, keywords, produced_mana, card_faces, has_upkeep_trigger, has_etb_trigger, has_attacks_trigger, has_dies_trigger, has_end_step_trigger, has_cast_trigger'
```

- [ ] Test that unmentioned card names in message are ignored.
- [ ] Test that two mentions plus replacement/token keywords require confirmation.
- [ ] Test that no mentions plus lifelink/double-strike simple text can use simple flow.
- [ ] Implement context builder.
- [ ] Run `npm run test:goblinai`.
- [ ] Commit:

```bash
git add src/lib/supabase/columns.ts src/lib/goblinai/context-builder.ts tests/goblinai/mention-contract.test.ts tests/goblinai/scenario-gate.test.ts
git commit -m "feat: build grounded GoblinAI context"
```

### Task 6: Implement DeepSeek Client And Prompts

**Files:**
- Create: `src/lib/goblinai/deepseek.ts`
- Create: `src/lib/goblinai/prompts.ts`

- [ ] Implement prompt constants from Prompt Policy.
- [ ] Implement AI SDK client.
- [ ] If AI SDK provider does not support `deepseek-v4-flash`, switch to direct OpenAI-compatible `fetch`.
- [ ] Add unit-testable prompt builder functions that accept context and return prompt text.
- [ ] Verify `DEEPSEEK_API_KEY` missing produces controlled 503 in route tasks.
- [ ] Commit:

```bash
git add src/lib/goblinai/deepseek.ts src/lib/goblinai/prompts.ts
git commit -m "feat: add GoblinAI model client"
```

### Task 7: Implement Restatement API

**Files:**
- Create: `src/app/api/assistant/rules/restatement/route.ts`
- Modify: `src/lib/rate-limit.ts`

- [ ] Add `assistantLimiter`.
- [ ] Implement zod request schema.
- [ ] Require authenticated user through existing Supabase server auth pattern.
- [ ] Build context.
- [ ] Reject manually typed unresolved `@` text if no matching `mentions`.
- [ ] Call restatement prompt when `requiresConfirmation = true`.
- [ ] Save user/restatement messages.
- [ ] Return JSON response.
- [ ] Manual test with `curl` using authenticated session or browser devtools.
- [ ] Commit:

```bash
git add src/app/api/assistant/rules/restatement/route.ts src/lib/rate-limit.ts
git commit -m "feat: add GoblinAI restatement API"
```

### Task 8: Implement Answer API

**Files:**
- Create: `src/app/api/assistant/rules/answer/route.ts`

- [ ] Validate request.
- [ ] Verify conversation belongs to user.
- [ ] Rebuild context from saved original user message and mentions.
- [ ] Include confirmed restatement and user correction in final prompt.
- [ ] Generate final answer.
- [ ] Save assistant answer with debug metadata.
- [ ] Return JSON in V1.
- [ ] Commit:

```bash
git add src/app/api/assistant/rules/answer/route.ts
git commit -m "feat: add GoblinAI answer API"
```

### Task 9: Implement Simple Rule API

**Files:**
- Create: `src/app/api/assistant/rules/simple/route.ts`

- [ ] Accept no-mention simple rules.
- [ ] Reject likely card-specific prompt without mentions.
- [ ] Generate direct rich answer.
- [ ] Save history.
- [ ] Commit:

```bash
git add src/app/api/assistant/rules/simple/route.ts
git commit -m "feat: add GoblinAI simple rules API"
```

### Task 10: Implement GoblinAI UI Shell

**Files:**
- Create: `src/components/goblinai/GoblinAIButton.tsx`
- Create: `src/components/goblinai/GoblinAIPanel.tsx`
- Create: `src/components/goblinai/GoblinAIComposer.tsx`
- Create: `src/components/goblinai/GoblinAIMessage.tsx`
- Modify: `src/app/(app)/layout.tsx`

- [ ] Build floating button.
- [ ] Build drawer/sheet panel.
- [ ] Build composer with plain textarea first.
- [ ] Add `@mention` autocomplete using `/api/cards/search`.
- [ ] Store selected mentions as structured `{ id, name }`.
- [ ] Block submit when text contains unresolved `@` token.
- [ ] Implement restatement pending UI with:
  - `Conferma scenario`,
  - `Correggi scenario`.
- [ ] On confirm, call answer API.
- [ ] Render final answer.
- [ ] Mount in app layout.
- [ ] Commit:

```bash
git add src/components/goblinai src/app/\(app\)/layout.tsx
git commit -m "feat: add GoblinAI assistant UI"
```

### Task 11: Ingestion Scripts

**Files:**
- Create: `scripts/ingest-mtg-rules.mjs`
- Create: `scripts/ingest-scryfall-rulings.mjs`

- [ ] Implement rules parser.
- [ ] Implement Scryfall rulings bulk downloader.
- [ ] Use `SUPABASE_SERVICE_ROLE_KEY` server-side only.
- [ ] Print summary counts:
  - rules inserted,
  - rules updated,
  - rulings inserted,
  - skipped rulings.
- [ ] Run on local data.
- [ ] Commit:

```bash
git add scripts/ingest-mtg-rules.mjs scripts/ingest-scryfall-rulings.mjs
git commit -m "feat: add GoblinAI rules ingestion"
```

### Task 12: Test Suite And Manual QA

**Files:**
- Create: `tests/goblinai/goblinai-ui.spec.ts`
- Update: existing docs if needed.

- [ ] Unit tests:

```bash
npm run test:goblinai
```

Expected: all GoblinAI helper tests pass.

- [ ] Lint:

```bash
npm run lint
```

Expected: exit code 0. Existing warnings acceptable only if already present before feature branch.

- [ ] Build:

```bash
npm run build
```

Expected: compiled successfully.

- [ ] Manual QA prompts:

Complex Anikthea:

```text
Se ho @Anikthea, Hand of Erebos sul campo di battaglia insieme a 2 @Doubling Season, e con l'etb di Anikthea esilio dal cimitero @Summon: Bahamut, i segnalini saga vengono messi e duplicati?
```

Expected:
- restatement first,
- no final answer before confirmation,
- oracle text says Anikthea enters or attacks,
- answer discusses token creation and counter placement separately.

Simple lifelink:

```text
Se una creatura ha lifelink e doppio attacco, guadagno vita 2 volte?
```

Expected:
- direct answer,
- explains first-strike damage step and normal combat damage step,
- caveat if no second damage is dealt.

No mentions:

```text
Se ho Anikthea e Doubling Season cosa succede?
```

Expected:
- GoblinAI asks user to use `@mention` for each involved card.

Manual unresolved mention:

```text
Se ho @Anikthea e @Doubling Season cosa succede?
```

Expected:
- composer blocks submit until both mentions are selected from autocomplete.

- [ ] Commit:

```bash
git add tests/goblinai docs
git commit -m "test: cover GoblinAI rules assistant"
```

---

## Acceptance Criteria

- User can open GoblinAI from authenticated app shell.
- User can select cards via `@mention` autocomplete.
- Backend never auto-guesses unmentioned card names.
- Backend loads mentioned card oracle text from local DB.
- Complex multi-card scenario returns restatement and waits for confirmation.
- Final answer only generated after confirmation.
- Simple lifelink/double-strike style question can answer directly.
- DeepSeek API key remains server-only.
- Rate limiting applies to assistant endpoints.
- `npm run test:goblinai`, `npm run lint`, and `npm run build` pass.
- Plan does not require Reddit or fine-tuning.

---

## Risks And Mitigations

- **Rules source not ingested yet:** GoblinAI can still restate with oracle text, but final answer must mark `rulesAvailable: false` and avoid pretending CR context exists.
- **DeepSeek provider package lags model ID:** use direct OpenAI-compatible `fetch`.
- **Rulings mapping incomplete:** do not block V1; use local oracle and CR first, add `oracle_id` to cards only if skip rate is high.
- **Prompt too long:** context builder caps to mentioned cards, max 40 rules, max 20 rulings.
- **User wants answer during live game:** Scenario Restatement Gate is intentional. Accuracy beats speed for complex interactions.
- **User dislikes visible citations:** keep citations internal in V1 UI, but keep debug fields for trust and later UI toggle.

---

## Self-Review Checklist

- Spec coverage:
  - Oracle-first/model-second: covered by Context Builder and API tasks.
  - Only `@mention`: covered by composer contract, mention tests, API rejection.
  - Scenario Restatement Gate: covered by flows, prompts, routes, UI, QA.
  - DeepSeek-v4-flash: covered by env/client tasks.
  - No Reddit/fine-tune: explicitly out of scope.
  - Keyword simplification: covered by classifier and router tasks.
- Placeholder scan:
  - No forbidden placeholder markers remain.
  - No deferred implementation language remains.
  - No task refers to another task as a substitute for concrete instructions.
  - No vague error-path instruction remains without explicit cases.
- Type consistency:
  - `MentionedCardRef`, `RestatementRequest`, `RestatementResponse`, `AnswerRequest`, and `AnswerResponse` are used consistently across UI and API.
  - `card_id` for GoblinAI references current `cards.id` as `number`.
  - `interactionKeywords` uses `InteractionKeyword[]` throughout.
