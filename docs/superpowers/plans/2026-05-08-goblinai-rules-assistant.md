# GoblinAI Rules Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build GoblinAI, an in-app MTG rules assistant that answers only after grounding card facts in local oracle text. Complex multi-card scenarios require user confirmation via Scenario Restatement Gate before final answer.

**Architecture:** Server-side RAG + deterministic MTG keyword routing. Client sends `@mention` card IDs, server loads oracle text from `cards`, derives interaction keywords, retrieves relevant rules/rulings, asks DeepSeek v4-flash only to reason over grounded context. Multi-card/zone/effect/timing scenarios use two-step restatement → confirmation → answer flow.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase/Postgres/RLS, local `cards.oracle_text`, DeepSeek API (`deepseek-v4-flash`, base URL `https://api.deepseek.com`), direct OpenAI-compatible fetch (prefer over `@ai-sdk/deepseek` to avoid model ID lag), Upstash Redis rate limiting, TypeScript, Vitest for pure helper tests.

---

## File Map

| File | Responsibility |
|------|---------------|
| `src/env.server.ts` (create) | Server-only env: `DEEPSEEK_API_KEY`, `GOBLINAI_MODEL` |
| `src/lib/goblinai/types.ts` (create) | Shared domain types |
| `src/lib/goblinai/interaction-keywords.ts` (create) | Deterministic oracle text → keyword classifier |
| `src/lib/goblinai/rule-router.ts` (create) | Keyword → MTG rule family mapping |
| `src/lib/goblinai/context-builder.ts` (create) | Load cards, derive keywords, retrieve rules/rulings |
| `src/lib/goblinai/deepseek.ts` (create) | Server-only DeepSeek client (fetch-based) |
| `src/lib/goblinai/prompts.ts` (create) | System prompts for restatement/final/simple |
| `src/lib/supabase/columns.ts` (modify) | Add `CARD_GOBLINAI_COLUMNS` |
| `src/lib/rate-limit.ts` (modify) | Add `assistantLimiter` |
| `src/app/api/assistant/rules/restatement/route.ts` (create) | First-step API: parse/restate scenario |
| `src/app/api/assistant/rules/answer/route.ts` (create) | Second-step API: final answer after confirmation |
| `src/app/api/assistant/rules/simple/route.ts` (create) | No-mention simple rule fast path |
| `src/components/goblinai/GoblinAIButton.tsx` (create) | Floating action button |
| `src/components/goblinai/GoblinAIPanel.tsx` (create) | Drawer/panel chat UI |
| `src/components/goblinai/GoblinAIComposer.tsx` (create) | Textarea + `@mention` autocomplete |
| `src/components/goblinai/GoblinAIMessage.tsx` (create) | Message rendering, card chips, confirm controls |
| `src/app/(app)/layout.tsx` (modify) | Mount `GoblinAIButton` |
| `supabase/migrations/20260508090000_goblinai_rules_assistant.sql` (create) | Migration for `mtg_rules`, `card_rulings`, `goblinai_conversations`, `goblinai_messages` |
| `src/types/supabase.ts` (modify) | Add new table types |
| `scripts/ingest-mtg-rules.mjs` (create) | Parse Comprehensive Rules text → `mtg_rules` |
| `scripts/ingest-scryfall-rulings.mjs` (create) | Download Scryfall rulings bulk → `card_rulings` |
| `tests/goblinai/interaction-keywords.test.ts` (create) | Keyword classifier unit tests |
| `tests/goblinai/rule-router.test.ts` (create) | Rule router unit tests |
| `tests/goblinai/scenario-gate.test.ts` (create) | Restatement vs simple decision tests |
| `tests/goblinai/mention-contract.test.ts` (create) | Unmentioned names ignored tests |
| `tests/goblinai/goblinai-ui.spec.ts` (create) | Playwright smoke test |
| `package.json` (modify) | Add AI deps, vitest, test scripts |

---

### Task 1: Add Dependencies And Env Split

**Files:**
- Modify: `package.json`
- Create: `src/env.server.ts`

- [ ] **Step 1: Install dependencies**

```bash
npm install ai@beta @ai-sdk/react@beta zod
npm install -D vitest
```

Note: skip `@ai-sdk/deepseek` — use direct fetch to avoid model ID lag. Keep `ai` and `@ai-sdk/react` for potential streaming in later tasks.

- [ ] **Step 2: Add test scripts to package.json**

Edit `package.json` — add after `"test:proxy-pdf"`:
```json
"test:goblinai": "vitest run tests/goblinai",
"test:goblinai:watch": "vitest tests/goblinai"
```

- [ ] **Step 3: Create `src/env.server.ts`**

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

- [ ] **Step 4: Verify lint passes**

```bash
npm run lint
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/env.server.ts
git commit -m "chore: add GoblinAI dependencies and server env"
```

---

### Task 2: Add Rules Assistant Migration

**Files:**
- Create: `supabase/migrations/20260508090000_goblinai_rules_assistant.sql`
- Modify: `src/types/supabase.ts`

- [ ] **Step 1: Write migration file**

Create `supabase/migrations/20260508090000_goblinai_rules_assistant.sql`:

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

- [ ] **Step 2: Apply migration via Supabase MCP**

Use `mcp__plugin_supabase_supabase__apply_migration` with project `wyujskkzqeexvmrwudup`.

- [ ] **Step 3: Verify schema in DB**

```sql
select column_name, data_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name in ('mtg_rules', 'card_rulings', 'goblinai_conversations', 'goblinai_messages')
  order by table_name, ordinal_position;
```

Expected: at least `mtg_rules` (8 cols), `card_rulings` (7 cols), `goblinai_conversations` (4 cols), `goblinai_messages` (14 cols).

- [ ] **Step 4: Update TypeScript types**

Add to `src/types/supabase.ts` Database Tables section after existing tables:

```ts
mtg_rules: {
  Row: {
    id: string
    rule_number: string
    parent_rule_number: string | null
    section_title: string | null
    text: string
    source_version: string
    keywords: string[]
    created_at: string
    updated_at: string
  }
  Insert: {
    id?: string
    rule_number: string
    parent_rule_number?: string | null
    section_title?: string | null
    text: string
    source_version: string
    keywords?: string[]
    created_at?: string
    updated_at?: string
  }
  Update: {
    id?: string
    rule_number?: string
    parent_rule_number?: string | null
    section_title?: string | null
    text?: string
    source_version?: string
    keywords?: string[]
    created_at?: string
    updated_at?: string
  }
}
card_rulings: {
  Row: {
    id: string
    card_id: number
    scryfall_oracle_id: string | null
    ruling_date: string | null
    text: string
    source: string
    keywords: string[]
    created_at: string
  }
  Insert: {
    id?: string
    card_id: number
    scryfall_oracle_id?: string | null
    ruling_date?: string | null
    text: string
    source?: string
    keywords?: string[]
    created_at?: string
  }
  Update: {
    id?: string
    card_id?: number
    scryfall_oracle_id?: string | null
    ruling_date?: string | null
    text?: string
    source?: string
    keywords?: string[]
    created_at?: string
  }
}
goblinai_conversations: {
  Row: {
    id: string
    user_id: string
    title: string | null
    created_at: string
    updated_at: string
  }
  Insert: {
    id?: string
    user_id: string
    title?: string | null
    created_at?: string
    updated_at?: string
  }
  Update: {
    id?: string
    user_id?: string
    title?: string | null
    created_at?: string
    updated_at?: string
  }
}
goblinai_messages: {
  Row: {
    id: string
    conversation_id: string
    user_id: string
    role: 'user' | 'assistant' | 'system'
    content: string
    mentioned_card_ids: number[]
    interaction_keywords: string[]
    retrieved_rule_numbers: string[]
    retrieved_ruling_ids: string[]
    restatement_status: 'none' | 'pending_confirmation' | 'confirmed'
    model: string | null
    prompt_tokens: number | null
    completion_tokens: number | null
    created_at: string
  }
  Insert: {
    id?: string
    conversation_id: string
    user_id: string
    role: 'user' | 'assistant' | 'system'
    content: string
    mentioned_card_ids?: number[]
    interaction_keywords?: string[]
    retrieved_rule_numbers?: string[]
    retrieved_ruling_ids?: string[]
    restatement_status?: 'none' | 'pending_confirmation' | 'confirmed'
    model?: string | null
    prompt_tokens?: number | null
    completion_tokens?: number | null
    created_at?: string
  }
  Update: {
    id?: string
    conversation_id?: string
    user_id?: string
    role?: 'user' | 'assistant' | 'system'
    content?: string
    mentioned_card_ids?: number[]
    interaction_keywords?: string[]
    retrieved_rule_numbers?: string[]
    retrieved_ruling_ids?: string[]
    restatement_status?: 'none' | 'pending_confirmation' | 'confirmed'
    model?: string | null
    prompt_tokens?: number | null
    completion_tokens?: number | null
    created_at?: string
  }
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260508090000_goblinai_rules_assistant.sql src/types/supabase.ts
git commit -m "feat: add GoblinAI rules schema"
```

---

### Task 3: Implement Keyword Classifier With Tests

**Files:**
- Create: `src/lib/goblinai/types.ts`
- Create: `src/lib/goblinai/interaction-keywords.ts`
- Create: `tests/goblinai/interaction-keywords.test.ts`

- [ ] **Step 1: Create types file**

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

- [ ] **Step 2: Write failing tests**

Create `tests/goblinai/interaction-keywords.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { deriveInteractionKeywords } from '../../src/lib/goblinai/interaction-keywords'

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

  it('returns empty array for vanilla creature', () => {
    const keywords = deriveInteractionKeywords({
      oracle_text: null,
      keywords: [],
      type_line: 'Creature - Grizzly Bears',
      card_faces: null,
    })
    expect(keywords).toEqual([])
  })

  it('scans card_faces oracle text for split cards', () => {
    const keywords = deriveInteractionKeywords({
      oracle_text: null,
      keywords: [],
      type_line: 'Instant',
      card_faces: [
        { oracle_text: 'Target creature gains lifelink until end of turn.' },
        { oracle_text: 'Exile target creature you control, then return it to the battlefield.' },
      ],
    })
    expect(keywords).toEqual([
      'etb_trigger',
      'keyword_lifelink',
      'targeting',
      'zone_change',
    ])
  })

  it('detects saga lore counter pattern', () => {
    const keywords = deriveInteractionKeywords({
      oracle_text: 'As this Saga enters and after your draw step, add a lore counter. I — Create a 2/2 Knight token.',
      keywords: [],
      type_line: 'Enchantment — Saga',
      card_faces: null,
    })
    expect(keywords).toEqual([
      'counter_placement',
      'saga_lore_counter',
      'token_creation',
    ])
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run tests/goblinai/interaction-keywords.test.ts
```

Expected: FAIL — module not found or function not exported.

- [ ] **Step 4: Implement classifier**

Create `src/lib/goblinai/interaction-keywords.ts`:

```ts
import type { InteractionKeyword, GoblinAICardContext } from './types'

interface CardFace {
  oracle_text?: string | null
}

const PATTERNS: Array<{ regex: RegExp; keyword: InteractionKeyword }> = [
  { regex: /enters the battlefield/i, keyword: 'etb_trigger' },
  { regex: /attacks\b/i, keyword: 'attack_trigger' },
  { regex: /\bdies\b/i, keyword: 'dies_trigger' },
  { regex: /whenever you cast|when you cast/i, keyword: 'cast_trigger' },
  { regex: /if .+ would .+ instead|instead/i, keyword: 'replacement_effect' },
  { regex: /create .* token|token copy/i, keyword: 'token_creation' },
  { regex: /\bcopy\b/i, keyword: 'copy_effect' },
  { regex: /\bcounter\b|\bcounters\b|lore counter/i, keyword: 'counter_placement' },
  { regex: /\bsaga\b|lore counter/i, keyword: 'saga_lore_counter' },
  { regex: /\bexile\b|\bgraveyard\b|\bbattlefield\b|\breturn to\b/i, keyword: 'zone_change' },
  { regex: /\btarget/i, keyword: 'targeting' },
  { regex: /whenever\b|when\b|at the beginning|at end of combat/i, keyword: 'triggered_ability' },
  { regex: /\bdouble strike\b/i, keyword: 'double_strike' },
  { regex: /\bfirst strike\b/i, keyword: 'first_strike' },
  { regex: /\blifelink\b/i, keyword: 'keyword_lifelink' },
  { regex: /\bstate.based\b/i, keyword: 'state_based_action' },
  { regex: /\bstatic\s+ability\b|\bstatic\b/i, keyword: 'static_ability' },
  { regex: /\blayers?\b/i, keyword: 'layer_effect' },
]

const KEYWORD_ARRAY_MAP: Array<{ needle: RegExp; keyword: InteractionKeyword }> = [
  { needle: /Double strike/i, keyword: 'double_strike' },
  { needle: /First strike/i, keyword: 'first_strike' },
  { needle: /Lifelink/i, keyword: 'keyword_lifelink' },
]

function scanText(text: string): InteractionKeyword[] {
  const found = new Set<InteractionKeyword>()
  for (const { regex, keyword } of PATTERNS) {
    if (regex.test(text)) found.add(keyword)
  }
  return Array.from(found).sort()
}

function scanKeywords(keywords: string[]): InteractionKeyword[] {
  const found = new Set<InteractionKeyword>()
  for (const kw of keywords) {
    for (const { needle, keyword } of KEYWORD_ARRAY_MAP) {
      if (needle.test(kw)) found.add(keyword)
    }
  }
  return Array.from(found).sort()
}

export function deriveInteractionKeywords(card: {
  oracle_text: string | null
  keywords: string[] | null
  type_line: string
  card_faces: unknown
}): InteractionKeyword[] {
  const set = new Set<InteractionKeyword>()
  const texts: string[] = []

  if (card.oracle_text) texts.push(card.oracle_text)

  if (Array.isArray(card.card_faces)) {
    for (const face of card.card_faces as CardFace[]) {
      if (face.oracle_text) texts.push(face.oracle_text)
    }
  }

  for (const t of texts) {
    for (const kw of scanText(t)) set.add(kw)
  }

  if (card.keywords && card.keywords.length > 0) {
    for (const kw of scanKeywords(card.keywords)) set.add(kw)
  }

  return Array.from(set).sort()
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/goblinai/interaction-keywords.test.ts
```

Expected: 6 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/goblinai/types.ts src/lib/goblinai/interaction-keywords.ts tests/goblinai/interaction-keywords.test.ts
git commit -m "feat: derive GoblinAI interaction keywords from oracle text"
```

---

### Task 4: Implement Rule Router With Tests

**Files:**
- Create: `src/lib/goblinai/rule-router.ts`
- Create: `tests/goblinai/rule-router.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/goblinai/rule-router.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { getRuleFamiliesForKeywords } from '../../src/lib/goblinai/rule-router'

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

  it('deduplicates multiple keywords pointing to same family', () => {
    expect(getRuleFamiliesForKeywords([
      'etb_trigger',
      'dies_trigger',
      'attack_trigger',
    ])).toEqual(['603', '700'])
  })

  it('handles empty keywords', () => {
    expect(getRuleFamiliesForKeywords([])).toEqual([])
  })

  it('handles unknown keyword gracefully', () => {
    expect(getRuleFamiliesForKeywords(['etb_trigger']))
      .toEqual(['603'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/goblinai/rule-router.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement rule router**

Create `src/lib/goblinai/rule-router.ts`:

```ts
import type { InteractionKeyword } from './types'

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

export function getRuleFamiliesForKeywords(keywords: InteractionKeyword[]): string[] {
  const families = new Set<string>()
  for (const kw of keywords) {
    const rules = RULE_FAMILY_BY_KEYWORD[kw]
    if (rules) {
      for (const r of rules) families.add(r)
    }
  }
  return Array.from(families).sort((a, b) => {
    const na = Number(a)
    const nb = Number(b)
    if (!isNaN(na) && !isNaN(nb)) return na - nb
    return a.localeCompare(b)
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/goblinai/rule-router.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/goblinai/rule-router.ts tests/goblinai/rule-router.test.ts
git commit -m "feat: route GoblinAI keywords to MTG rule families"
```

---

### Task 5: Implement Context Builder

**Files:**
- Modify: `src/lib/supabase/columns.ts`
- Create: `src/lib/goblinai/context-builder.ts`
- Create: `tests/goblinai/mention-contract.test.ts`
- Create: `tests/goblinai/scenario-gate.test.ts`

- [ ] **Step 1: Add CARD_GOBLINAI_COLUMNS**

In `src/lib/supabase/columns.ts`, add after `CARD_GAME_COLUMNS`:

```ts
/** GoblinAI rules assistant: oracle-level fields for grounding context */
export const CARD_GOBLINAI_COLUMNS =
  'id, name, mana_cost, type_line, oracle_text, keywords, produced_mana, card_faces, has_upkeep_trigger, has_etb_trigger, has_attacks_trigger, has_dies_trigger, has_end_step_trigger, has_cast_trigger'
```

- [ ] **Step 2: Write scenario gate tests**

Create `tests/goblinai/scenario-gate.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { requiresConfirmation } from '../../src/lib/goblinai/context-builder'

describe('requiresConfirmation', () => {
  it('requires confirmation for 2+ mentions', () => {
    expect(requiresConfirmation({
      mentionsLen: 2,
      interactionKeywords: [],
      message: 'cosa succede?',
    })).toBe(true)
  })

  it('requires confirmation when triggered ability present', () => {
    expect(requiresConfirmation({
      mentionsLen: 1,
      interactionKeywords: ['triggered_ability'],
      message: 'cosa succede?',
    })).toBe(true)
  })

  it('requires confirmation when replacement effect present', () => {
    expect(requiresConfirmation({
      mentionsLen: 1,
      interactionKeywords: ['replacement_effect'],
      message: 'cosa succede?',
    })).toBe(true)
  })

  it('does not require confirmation for keyword-only question with no mentions', () => {
    expect(requiresConfirmation({
      mentionsLen: 0,
      interactionKeywords: [],
      message: 'Cosa significa lifelink?',
    })).toBe(false)
  })

  it('detects zone terms in Italian text', () => {
    expect(requiresConfirmation({
      mentionsLen: 1,
      interactionKeywords: [],
      message: 'Se esilio una carta dal cimitero...',
    })).toBe(true)
  })

  it('detects ETB phrasing in Italian', () => {
    expect(requiresConfirmation({
      mentionsLen: 1,
      interactionKeywords: [],
      message: 'Quando entra nel campo di battaglia...',
    })).toBe(true)
  })
})
```

- [ ] **Step 3: Write mention contract tests**

Create `tests/goblinai/mention-contract.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { extractMentionIds } from '../../src/lib/goblinai/context-builder'

describe('extractMentionIds', () => {
  it('extracts mention IDs from structured mentions', () => {
    const ids = extractMentionIds([
      { id: 1, name: 'Anikthea, Hand of Erebos' },
      { id: 2, name: 'Doubling Season' },
    ])
    expect(ids).toEqual([1, 2])
  })

  it('preserves mention order', () => {
    const ids = extractMentionIds([
      { id: 3, name: 'Summon: Bahamut' },
      { id: 1, name: 'Anikthea'},
      { id: 2, name: 'Doubling Season'},
    ])
    expect(ids).toEqual([3, 1, 2])
  })

  it('returns empty for no mentions', () => {
    expect(extractMentionIds([])).toEqual([])
  })
})
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
npx vitest run tests/goblinai/scenario-gate.test.ts tests/goblinai/mention-contract.test.ts
```

Expected: FAIL.

- [ ] **Step 5: Implement context builder**

Create `src/lib/goblinai/context-builder.ts`:

```ts
import { createAdminClient } from '@/lib/supabase/admin'
import { CARD_GOBLINAI_COLUMNS } from '@/lib/supabase/columns'
import { deriveInteractionKeywords } from './interaction-keywords'
import { getRuleFamiliesForKeywords } from './rule-router'
import type {
  InteractionKeyword,
  MentionedCardRef,
  GoblinAICardContext,
  GoblinAIRuleContext,
  GoblinAIRulingContext,
} from './types'

export function extractMentionIds(mentions: MentionedCardRef[]): number[] {
  return mentions.map((m) => m.id)
}

const ZONE_TIMING_TERMS = [
  /battlefield/i, /campo/i, /cimitero/i, /graveyard/i,
  /stack/i, /pila/i, /attacco/i, /combat/i, /upkeep/i,
  /end step/i, /etb/i, /enters/i, /trigger/i, /innescata/i,
  /esilio/i, /exile/i, /mano/i, /hand/i, /biblioteca/i,
  /library/i, /turno/i, /fase/i, /step/i, /stack/i,
]

export function requiresConfirmation(input: {
  mentionsLen: number
  interactionKeywords: InteractionKeyword[]
  message: string
}): boolean {
  if (input.mentionsLen >= 2) return true

  const complexKeys: InteractionKeyword[] = [
    'triggered_ability', 'replacement_effect', 'copy_effect',
    'token_creation', 'counter_placement', 'zone_change',
    'layer_effect', 'state_based_action',
  ]
  const hasComplexKey = input.interactionKeywords.some((k) => complexKeys.includes(k))
  if (hasComplexKey) return true

  for (const term of ZONE_TIMING_TERMS) {
    if (term.test(input.message)) return true
  }

  return false
}

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
}> {
  const supabase = createAdminClient()

  const cards: GoblinAICardContext[] = []
  if (input.mentions.length > 0) {
    const ids = input.mentions.map((m) => m.id)
    const { data } = await supabase
      .from('cards')
      .select(CARD_GOBLINAI_COLUMNS)
      .in('id', ids)

    if (data) {
      const byId = new Map(data.map((c) => [c.id, c] as const))
      for (const m of input.mentions) {
        const card = byId.get(m.id)
        if (card) cards.push(card)
      }
    }
  }

  const interactionKeywords: InteractionKeyword[] = []
  for (const card of cards) {
    for (const kw of deriveInteractionKeywords(card)) {
      if (!interactionKeywords.includes(kw)) interactionKeywords.push(kw)
    }
  }
  interactionKeywords.sort()

  const ruleFamilies = getRuleFamiliesForKeywords(interactionKeywords)

  let rules: GoblinAIRuleContext[] = []
  let rulesAvailable = false
  if (ruleFamilies.length > 0) {
    const familyFilters = ruleFamilies.join('|')
    const { data: ruleData } = await supabase
      .from('mtg_rules')
      .select('rule_number, section_title, text, keywords')
      .or(
        ruleFamilies
          .map((f) => `rule_number.eq.${f},rule_number.like.${f}.*`)
          .join(','),
      )
      .limit(40)

    if (ruleData && ruleData.length > 0) {
      rules = ruleData.map((r: Record<string, unknown>) => ({
        rule_number: r.rule_number as string,
        section_title: r.section_title as string | null,
        text: r.text as string,
        keywords: r.keywords as string[],
      }))
      rulesAvailable = true
    }
  }

  let rulings: GoblinAIRulingContext[] = []
  if (cards.length > 0) {
    const cardIds = cards.map((c) => c.id)
    const { data: rulingData } = await supabase
      .from('card_rulings')
      .select('id, card_id, ruling_date, text, keywords')
      .in('card_id', cardIds)
      .limit(20)

    if (rulingData) {
      rulings = rulingData.map((r: Record<string, unknown>) => ({
        id: r.id as string,
        card_id: r.card_id as number,
        ruling_date: r.ruling_date as string | null,
        text: r.text as string,
        keywords: r.keywords as string[],
      }))
    }
  }

  const needsConfirmation = requiresConfirmation({
    mentionsLen: input.mentions.length,
    interactionKeywords,
    message: input.message,
  })

  return {
    cards,
    interactionKeywords,
    rules,
    rulings,
    requiresConfirmation: needsConfirmation,
    rulesAvailable,
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npx vitest run tests/goblinai/scenario-gate.test.ts tests/goblinai/mention-contract.test.ts
```

Expected: 8 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/supabase/columns.ts src/lib/goblinai/context-builder.ts tests/goblinai/scenario-gate.test.ts tests/goblinai/mention-contract.test.ts
git commit -m "feat: build grounded GoblinAI context from mentions and rules"
```

---

### Task 6: Implement DeepSeek Client And Prompts

**Files:**
- Create: `src/lib/goblinai/deepseek.ts`
- Create: `src/lib/goblinai/prompts.ts`

- [ ] **Step 1: Write prompts**

Create `src/lib/goblinai/prompts.ts`:

```ts
export const RESTATEMENT_SYSTEM_PROMPT = `
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
`.trim()

export const FINAL_ANSWER_SYSTEM_PROMPT = `
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
`.trim()

export const SIMPLE_RULE_SYSTEM_PROMPT = `
You are GoblinAI, a careful Magic: The Gathering rules assistant.

The user asks a simple rules question. Give a direct but complete answer in Italian.
Use examples when helpful.
Do not invent card text.
If the question actually requires card-specific context, ask for @mentions.
`.trim()

export function buildCardContextText(cards: Array<{ name: string; mana_cost: string | null; type_line: string; oracle_text: string | null }>): string {
  if (cards.length === 0) return 'Nessuna carta menzionata.'

  return cards
    .map(
      (c, i) =>
        `Carta ${i + 1}: ${c.name}\nCosto: ${c.mana_cost ?? '-'}\nTipo: ${c.type_line}\nTesto:\n${c.oracle_text ?? '(nessun testo)'}`,
    )
    .join('\n\n')
}

export function buildRuleContextText(rules: Array<{ rule_number: string; text: string }>): string {
  if (rules.length === 0) return 'Nessuna regola recuperata.'
  return rules.map((r) => `Regola ${r.rule_number}: ${r.text}`).join('\n\n')
}

export function buildRestatementPrompt(context: {
  message: string
  cards: Array<{ name: string; mana_cost: string | null; type_line: string; oracle_text: string | null }>
}): string {
  const cardText = buildCardContextText(context.cards)
  return `Contesto Carte:\n${cardText}\n\nDomanda dell'utente:\n${context.message}`
}

export function buildFinalAnswerPrompt(context: {
  confirmedRestatement: string
  userCorrection?: string
  cards: Array<{ name: string; mana_cost: string | null; type_line: string; oracle_text: string | null }>
  rules: Array<{ rule_number: string; text: string }>
  interactionKeywords: string[]
}): string {
  const cardText = buildCardContextText(context.cards)
  const ruleText = buildRuleContextText(context.rules)
  const correction = context.userCorrection
    ? `\n\nCorrezione dell'utente allo scenario:\n${context.userCorrection}`
    : ''

  return `Scenario Confermato:\n${context.confirmedRestatement}${correction}\n\nKeyword d'interazione: ${context.interactionKeywords.join(', ')}\n\nContesto Carte:\n${cardText}\n\nRegole Recuperate:\n${ruleText}`
}
```

- [ ] **Step 2: Implement DeepSeek client**

Create `src/lib/goblinai/deepseek.ts`:

```ts
import { serverEnv } from '@/env.server'

interface DeepSeekResponse {
  choices?: Array<{ message?: { content?: string } }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

export class GoblinAINotConfiguredError extends Error {
  constructor() {
    super('GoblinAI is not configured')
    this.name = 'GoblinAINotConfiguredError'
  }
}

export async function generateGoblinAIText(input: {
  system: string
  prompt: string
  temperature?: number
}): Promise<{ text: string; promptTokens?: number; completionTokens?: number }> {
  if (!serverEnv.deepseekApiKey) {
    throw new GoblinAINotConfiguredError()
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

  const json = (await res.json()) as DeepSeekResponse
  return {
    text: json.choices?.[0]?.message?.content ?? '',
    promptTokens: json.usage?.prompt_tokens,
    completionTokens: json.usage?.completion_tokens,
  }
}
```

- [ ] **Step 3: Verify build**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/lib/goblinai/deepseek.ts src/lib/goblinai/prompts.ts
git commit -m "feat: add GoblinAI DeepSeek client and prompts"
```

---

### Task 7: Implement Restatement API

**Files:**
- Modify: `src/lib/rate-limit.ts`
- Create: `src/app/api/assistant/rules/restatement/route.ts`

- [ ] **Step 1: Add assistant rate limiter**

In `src/lib/rate-limit.ts`, add after `bulkLimiter`:

```ts
export const assistantLimiter = makeLimiter(20, '60 s', 'rl:assistant')
```

- [ ] **Step 2: Create restatement endpoint**

Create `src/app/api/assistant/rules/restatement/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { enforceLimit, assistantLimiter, getClientId } from '@/lib/rate-limit'
import { buildGoblinAIContext } from '@/lib/goblinai/context-builder'
import { generateGoblinAIText, GoblinAINotConfiguredError } from '@/lib/goblinai/deepseek'
import { RESTATEMENT_SYSTEM_PROMPT, buildRestatementPrompt } from '@/lib/goblinai/prompts'
import type { MentionedCardRef } from '@/lib/goblinai/types'

const RESTATEMENT_REQUEST_SCHEMA = {
  validate: (body: unknown): body is { message: string; mentions: MentionedCardRef[]; conversationId?: string } => {
    if (!body || typeof body !== 'object') return false
    const b = body as Record<string, unknown>
    if (typeof b.message !== 'string' || !Array.isArray(b.mentions)) return false
    for (const m of b.mentions) {
      if (!m || typeof m !== 'object') return false
      const mention = m as Record<string, unknown>
      if (typeof mention.id !== 'number' || typeof mention.name !== 'string') return false
    }
    return true
  },
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const limited = await enforceLimit(assistantLimiter, getClientId(request, user.id))
  if (limited) return limited

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!RESTATEMENT_REQUEST_SCHEMA.validate(body)) {
    return NextResponse.json(
      { error: 'Request must include message (string) and mentions (array of {id, name})' },
      { status: 400 },
    )
  }

  const { message, mentions, conversationId } = body

  if (mentions.length === 0) {
    return NextResponse.json(
      { error: 'Use @mention for every card involved. Per domande su carte specifiche usa @mention per ogni carta coinvolta.' },
      { status: 400 },
    )
  }

  const ctx = await buildGoblinAIContext({ message, mentions })

  for (const m of mentions) {
    if (!ctx.cards.some((c) => c.id === m.id)) {
      return NextResponse.json(
        { error: `Mentioned card not found: ${m.name}` },
        { status: 404 },
      )
    }
  }

  const adminClient = createAdminClient()

  let convId = conversationId
  if (!convId) {
    const { data: conv } = await adminClient
      .from('goblinai_conversations')
      .insert({ user_id: user.id })
      .select('id')
      .single()
    if (conv) convId = conv.id
  }

  if (!ctx.requiresConfirmation) {
    return NextResponse.json({
      conversationId: convId,
      messageId: null,
      requiresConfirmation: false,
      restatement: '',
      assumptions: [],
      missingInfoQuestions: [],
      interactionKeywords: ctx.interactionKeywords,
      mentionedCards: ctx.cards,
      redirectTo: 'simple',
    })
  }

  try {
    const prompt = buildRestatementPrompt({
      message,
      cards: ctx.cards.map((c) => ({
        name: c.name,
        mana_cost: c.mana_cost,
        type_line: c.type_line,
        oracle_text: c.oracle_text,
      })),
    })

    const result = await generateGoblinAIText({
      system: RESTATEMENT_SYSTEM_PROMPT,
      prompt,
    })

    const { data: userMsg } = await adminClient
      .from('goblinai_messages')
      .insert({
        conversation_id: convId,
        user_id: user.id,
        role: 'user',
        content: message,
        mentioned_card_ids: mentions.map((m) => m.id),
        interaction_keywords: ctx.interactionKeywords,
        restatement_status: 'pending_confirmation',
      })
      .select('id')
      .single()

    const { data: restMsg } = await adminClient
      .from('goblinai_messages')
      .insert({
        conversation_id: convId,
        user_id: user.id,
        role: 'assistant',
        content: result.text,
        interaction_keywords: ctx.interactionKeywords,
        restatement_status: 'pending_confirmation',
        model: 'deepseek-v4-flash',
        prompt_tokens: result.promptTokens,
        completion_tokens: result.completionTokens,
      })
      .select('id')
      .single()

    return NextResponse.json({
      conversationId: convId,
      messageId: restMsg?.id ?? null,
      requiresConfirmation: true,
      restatement: result.text,
      assumptions: [],
      missingInfoQuestions: [],
      interactionKeywords: ctx.interactionKeywords,
      mentionedCards: ctx.cards,
    })
  } catch (err) {
    if (err instanceof GoblinAINotConfiguredError) {
      return NextResponse.json(
        { error: 'GoblinAI is not configured' },
        { status: 503 },
      )
    }
    console.error('Restatement generation failed:', err)
    return NextResponse.json(
      { error: 'Failed to generate restatement' },
      { status: 500 },
    )
  }
}
```

- [ ] **Step 3: Verify build**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/lib/rate-limit.ts src/app/api/assistant/rules/restatement/route.ts
git commit -m "feat: add GoblinAI restatement API"
```

---

### Task 8: Implement Answer API

**Files:**
- Create: `src/app/api/assistant/rules/answer/route.ts`

- [ ] **Step 1: Create answer endpoint**

Create `src/app/api/assistant/rules/answer/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { enforceLimit, assistantLimiter, getClientId } from '@/lib/rate-limit'
import { buildGoblinAIContext } from '@/lib/goblinai/context-builder'
import { generateGoblinAIText, GoblinAINotConfiguredError } from '@/lib/goblinai/deepseek'
import { FINAL_ANSWER_SYSTEM_PROMPT, buildFinalAnswerPrompt } from '@/lib/goblinai/prompts'
import type { MentionedCardRef } from '@/lib/goblinai/types'

const ANSWER_REQUEST_SCHEMA = {
  validate: (body: unknown): body is {
    conversationId: string
    restatementMessageId: string
    confirmedRestatement: string
    userCorrection?: string
  } => {
    if (!body || typeof body !== 'object') return false
    const b = body as Record<string, unknown>
    if (typeof b.conversationId !== 'string') return false
    if (typeof b.restatementMessageId !== 'string') return false
    if (typeof b.confirmedRestatement !== 'string') return false
    if (b.userCorrection !== undefined && typeof b.userCorrection !== 'string') return false
    return true
  },
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const limited = await enforceLimit(assistantLimiter, getClientId(request, user.id))
  if (limited) return limited

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!ANSWER_REQUEST_SCHEMA.validate(body)) {
    return NextResponse.json(
      { error: 'Request must include conversationId, restatementMessageId, and confirmedRestatement' },
      { status: 400 },
    )
  }

  const { conversationId, restatementMessageId, confirmedRestatement, userCorrection } = body
  const adminClient = createAdminClient()

  const { data: conv } = await adminClient
    .from('goblinai_conversations')
    .select('user_id')
    .eq('id', conversationId)
    .single()

  if (!conv || conv.user_id !== user.id) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  }

  const { data: restMsg } = await adminClient
    .from('goblinai_messages')
    .select('id, conversation_id')
    .eq('id', restatementMessageId)
    .eq('conversation_id', conversationId)
    .single()

  if (!restMsg) {
    return NextResponse.json({ error: 'Restatement message not found' }, { status: 404 })
  }

  const { data: userMsg } = await adminClient
    .from('goblinai_messages')
    .select('content, mentioned_card_ids')
    .eq('conversation_id', conversationId)
    .eq('role', 'user')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!userMsg) {
    return NextResponse.json({ error: 'Original user message not found' }, { status: 404 })
  }

  const mentions: MentionedCardRef[] = (userMsg.mentioned_card_ids || []).map((id: number) => ({
    id,
    name: '',
  }))

  const ctx = await buildGoblinAIContext({
    message: userMsg.content,
    mentions,
  })

  const familyNumbers = ctx.rules.map((r) => r.rule_number)

  await adminClient
    .from('goblinai_messages')
    .update({ restatement_status: 'confirmed' })
    .eq('id', restatementMessageId)

  try {
    const prompt = buildFinalAnswerPrompt({
      confirmedRestatement,
      userCorrection,
      cards: ctx.cards.map((c) => ({
        name: c.name,
        mana_cost: c.mana_cost,
        type_line: c.type_line,
        oracle_text: c.oracle_text,
      })),
      rules: ctx.rules.map((r) => ({
        rule_number: r.rule_number,
        text: r.text,
      })),
      interactionKeywords: ctx.interactionKeywords,
    })

    const result = await generateGoblinAIText({
      system: FINAL_ANSWER_SYSTEM_PROMPT,
      prompt,
    })

    const { data: answerMsg } = await adminClient
      .from('goblinai_messages')
      .insert({
        conversation_id: conversationId,
        user_id: user.id,
        role: 'assistant',
        content: result.text,
        interaction_keywords: ctx.interactionKeywords,
        retrieved_rule_numbers: familyNumbers,
        retrieved_ruling_ids: ctx.rulings.map((r) => r.id),
        restatement_status: 'confirmed',
        model: 'deepseek-v4-flash',
        prompt_tokens: result.promptTokens,
        completion_tokens: result.completionTokens,
      })
      .select('id')
      .single()

    return NextResponse.json({
      answer: result.text,
      interactionKeywords: ctx.interactionKeywords,
      mentionedCards: ctx.cards,
      usedRuleNumbers: familyNumbers,
      messageId: answerMsg?.id ?? null,
    })
  } catch (err) {
    if (err instanceof GoblinAINotConfiguredError) {
      return NextResponse.json(
        { error: 'GoblinAI is not configured' },
        { status: 503 },
      )
    }
    console.error('Answer generation failed:', err)
    return NextResponse.json(
      { error: 'Failed to generate answer' },
      { status: 500 },
    )
  }
}
```

- [ ] **Step 2: Verify build**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/assistant/rules/answer/route.ts
git commit -m "feat: add GoblinAI answer API"
```

---

### Task 9: Implement Simple Rule API

**Files:**
- Create: `src/app/api/assistant/rules/simple/route.ts`

- [ ] **Step 1: Create simple rule endpoint**

Create `src/app/api/assistant/rules/simple/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { enforceLimit, assistantLimiter, getClientId } from '@/lib/rate-limit'
import { generateGoblinAIText, GoblinAINotConfiguredError } from '@/lib/goblinai/deepseek'
import { SIMPLE_RULE_SYSTEM_PROMPT } from '@/lib/goblinai/prompts'

const CARD_SPECIFIC_PATTERNS = /se\s+(ho|controllo|hai|possiedo|possiedi)\b|@\w/i

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const limited = await enforceLimit(assistantLimiter, getClientId(request, user.id))
  if (limited) return limited

  let body: { message?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.message || typeof body.message !== 'string' || body.message.trim().length === 0) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 })
  }

  if (CARD_SPECIFIC_PATTERNS.test(body.message)) {
    return NextResponse.json(
      { error: 'Per domande su carte specifiche usa @mention per ogni carta coinvolta.' },
      { status: 400 },
    )
  }

  const adminClient = createAdminClient()

  const { data: conv } = await adminClient
    .from('goblinai_conversations')
    .insert({ user_id: user.id })
    .select('id')
    .single()

  const convId = conv?.id

  try {
    const result = await generateGoblinAIText({
      system: SIMPLE_RULE_SYSTEM_PROMPT,
      prompt: body.message,
    })

    if (convId) {
      await adminClient.from('goblinai_messages').insert([
        {
          conversation_id: convId,
          user_id: user.id,
          role: 'user',
          content: body.message,
        },
        {
          conversation_id: convId,
          user_id: user.id,
          role: 'assistant',
          content: result.text,
          model: 'deepseek-v4-flash',
          prompt_tokens: result.promptTokens,
          completion_tokens: result.completionTokens,
        },
      ])
    }

    return NextResponse.json({
      answer: result.text,
      conversationId: convId,
    })
  } catch (err) {
    if (err instanceof GoblinAINotConfiguredError) {
      return NextResponse.json(
        { error: 'GoblinAI is not configured' },
        { status: 503 },
      )
    }
    console.error('Simple rule generation failed:', err)
    return NextResponse.json(
      { error: 'Failed to generate answer' },
      { status: 500 },
    )
  }
}
```

- [ ] **Step 2: Verify build**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/assistant/rules/simple/route.ts
git commit -m "feat: add GoblinAI simple rules API"
```

---

### Task 10: Implement GoblinAI UI Shell

**Files:**
- Create: `src/components/goblinai/GoblinAIButton.tsx`
- Create: `src/components/goblinai/GoblinAIPanel.tsx`
- Create: `src/components/goblinai/GoblinAIComposer.tsx`
- Create: `src/components/goblinai/GoblinAIMessage.tsx`
- Modify: `src/app/(app)/layout.tsx`

- [ ] **Step 1: Create GoblinAIButton**

Create `src/components/goblinai/GoblinAIButton.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Bot } from 'lucide-react'
import { GoblinAIPanel } from './GoblinAIPanel'

export function GoblinAIButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary-600 text-white shadow-lg hover:bg-primary-700 transition-colors sm:bottom-8 sm:right-8"
        aria-label="GoblinAI Rules Assistant"
      >
        <Bot className="h-6 w-6" />
      </button>

      {open && <GoblinAIPanel onClose={() => setOpen(false)} />}
    </>
  )
}
```

- [ ] **Step 2: Create GoblinAIPanel**

Create `src/components/goblinai/GoblinAIPanel.tsx`:

```tsx
'use client'

import { useState, useRef, useEffect } from 'react'
import { X } from 'lucide-react'
import { GoblinAIMessage } from './GoblinAIMessage'
import { GoblinAIComposer } from './GoblinAIComposer'
import type { RestatementResponse, AnswerResponse, MentionedCardRef } from '@/lib/goblinai/types'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  pendingConfirmation?: boolean
}

export function GoblinAIPanel({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingRestatement, setPendingRestatement] = useState<{
    conversationId: string
    restatementMessageId: string
    restatement: string
  } | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function handleSend(message: string, mentions: MentionedCardRef[]) {
    setError(null)
    setLoading(true)

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: message,
    }
    setMessages((prev) => [...prev, userMsg])

    try {
      const isSimple = mentions.length === 0

      if (isSimple) {
        const res = await fetch('/api/assistant/rules/simple', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message }),
        })

        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'Request failed')
        }

        const data = await res.json()
        setConversationId(data.conversationId)

        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: data.answer,
          },
        ])
      } else {
        const res = await fetch('/api/assistant/rules/restatement', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message,
            mentions,
            conversationId,
          }),
        })

        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'Request failed')
        }

        const data: RestatementResponse = await res.json()
        setConversationId(data.conversationId)

        if (data.requiresConfirmation) {
          setPendingRestatement({
            conversationId: data.conversationId,
            restatementMessageId: data.messageId,
            restatement: data.restatement,
          })

          setMessages((prev) => [
            ...prev,
            {
              id: data.messageId,
              role: 'assistant',
              content: data.restatement,
              pendingConfirmation: true,
            },
          ])
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirm(userCorrection?: string) {
    if (!pendingRestatement) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/assistant/rules/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: pendingRestatement.conversationId,
          restatementMessageId: pendingRestatement.restatementMessageId,
          confirmedRestatement: pendingRestatement.restatement,
          userCorrection,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Request failed')
      }

      const data: AnswerResponse = await res.json()

      setPendingRestatement(null)

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: data.answer,
        },
      ])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  function handleCorrect(correction: string) {
    handleConfirm(correction)
  }

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-bg-dark border-l border-white/10 shadow-2xl sm:w-[420px]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h2 className="text-lg font-semibold text-white">GoblinAI</h2>
        <button
          onClick={onClose}
          className="rounded p-1 text-white/50 hover:text-white hover:bg-white/10"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-white/50 text-center mt-8">
            Chiedi una regola. Usa @ per citare ogni carta coinvolta.
          </p>
        )}

        {messages.map((msg) => (
          <GoblinAIMessage
            key={msg.id}
            role={msg.role}
            content={msg.content}
            pendingConfirmation={msg.pendingConfirmation}
            onConfirm={() => handleConfirm()}
            onCorrect={handleCorrect}
          />
        ))}

        {loading && (
          <p className="text-sm text-white/50 animate-pulse">GoblinAI pensa...</p>
        )}

        {error && (
          <div className="rounded bg-red-900/50 border border-red-700 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <GoblinAIComposer
        onSend={handleSend}
        disabled={loading || pendingRestatement !== null}
        placeholder={
          pendingRestatement
            ? 'Conferma o correggi lo scenario prima di continuare'
            : 'Chiedi una regola... (@ per citare carte)'
        }
      />
    </div>
  )
}
```

- [ ] **Step 3: Create GoblinAIMessage**

Create `src/components/goblinai/GoblinAIMessage.tsx`:

```tsx
'use client'

import { useState } from 'react'

interface GoblinAIMessageProps {
  role: 'user' | 'assistant'
  content: string
  pendingConfirmation?: boolean
  onConfirm?: () => void
  onCorrect?: (correction: string) => void
}

export function GoblinAIMessage({
  role,
  content,
  pendingConfirmation,
  onConfirm,
  onCorrect,
}: GoblinAIMessageProps) {
  const [correcting, setCorrecting] = useState(false)
  const [correction, setCorrection] = useState('')

  const isAssistant = role === 'assistant'

  return (
    <div className={`flex ${isAssistant ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
          isAssistant
            ? 'bg-white/5 text-white/90'
            : 'bg-primary-600/30 text-white'
        }`}
      >
        <p className="text-xs font-semibold mb-1 text-white/50">
          {isAssistant ? 'GoblinAI' : 'Tu'}
        </p>

        <div className="whitespace-pre-wrap">{content}</div>

        {pendingConfirmation && onConfirm && (
          <div className="mt-3 flex gap-2">
            <button
              onClick={onConfirm}
              className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700"
            >
              Conferma scenario
            </button>
            <button
              onClick={() => setCorrecting(true)}
              className="rounded bg-white/10 px-3 py-1 text-xs font-medium text-white/70 hover:bg-white/20"
            >
              Correggi
            </button>
          </div>
        )}

        {correcting && onCorrect && (
          <div className="mt-2 space-y-2">
            <textarea
              value={correction}
              onChange={(e) => setCorrection(e.target.value)}
              placeholder="Scrivi la correzione..."
              className="w-full rounded bg-white/10 border border-white/20 px-2 py-1 text-xs text-white placeholder:text-white/30"
              rows={3}
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  onCorrect(correction)
                  setCorrecting(false)
                }}
                className="rounded bg-primary-600 px-3 py-1 text-xs font-medium text-white hover:bg-primary-700"
              >
                Invia correzione
              </button>
              <button
                onClick={() => setCorrecting(false)}
                className="rounded bg-white/10 px-3 py-1 text-xs text-white/50 hover:bg-white/20"
              >
                Annulla
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create GoblinAIComposer**

Create `src/components/goblinai/GoblinAIComposer.tsx`:

```tsx
'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Send } from 'lucide-react'
import type { MentionedCardRef } from '@/lib/goblinai/types'

interface GoblinAIComposerProps {
  onSend: (message: string, mentions: MentionedCardRef[]) => void
  disabled?: boolean
  placeholder?: string
}

interface CardResult {
  id: number
  name: string
  type_line: string
}

export function GoblinAIComposer({ onSend, disabled, placeholder }: GoblinAIComposerProps) {
  const [text, setText] = useState('')
  const [mentions, setMentions] = useState<MentionedCardRef[]>([])
  const [mentionSearch, setMentionSearch] = useState('')
  const [mentionResults, setMentionResults] = useState<CardResult[]>([])
  const [showMentionDropdown, setShowMentionDropdown] = useState(false)
  const [mentionCursorIdx, setMentionCursorIdx] = useState(0)
  const [cursorPos, setCursorPos] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value
      const pos = e.target.selectionStart ?? value.length
      setText(value)
      setCursorPos(pos)

      const beforeCursor = value.slice(0, pos)
      const atMatch = beforeCursor.match(/@(\S*)$/)

      if (atMatch) {
        const search = atMatch[1]
        setMentionSearch(search)

        if (searchRef.current) clearTimeout(searchRef.current)
        searchRef.current = setTimeout(async () => {
          if (search.length < 2) {
            setMentionResults([])
            setShowMentionDropdown(false)
            return
          }
          try {
            const res = await fetch(`/api/cards/search?q=${encodeURIComponent(search)}&lang=en`)
            const data = await res.json()
            setMentionResults(data.cards?.slice(0, 5) ?? [])
            setShowMentionDropdown(true)
            setMentionCursorIdx(0)
          } catch {
            setMentionResults([])
          }
        }, 200)
      } else {
        setShowMentionDropdown(false)
        setMentionResults([])
      }
    },
    [],
  )

  function selectMention(card: CardResult) {
    const pos = cursorPos
    const beforeCursor = text.slice(0, pos)
    const afterCursor = text.slice(pos)
    const atMatch = beforeCursor.match(/@(\S*)$/)

    if (atMatch) {
      const atStart = pos - atMatch[0].length
      const newText = beforeCursor.slice(0, atStart) + `@${card.name} ` + afterCursor
      setText(newText)
      setMentions((prev) => [...prev, { id: card.id, name: card.name }])
    }
    setShowMentionDropdown(false)
    textareaRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!showMentionDropdown) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setMentionCursorIdx((prev) => (prev + 1) % mentionResults.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setMentionCursorIdx(
        (prev) => (prev - 1 + mentionResults.length) % mentionResults.length,
      )
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (mentionResults[mentionCursorIdx]) {
        selectMention(mentionResults[mentionCursorIdx])
      }
    } else if (e.key === 'Escape') {
      setShowMentionDropdown(false)
    }
  }

  function handleSubmit() {
    const trimmed = text.trim()
    if (!trimmed || disabled) return

    const unresolvedAt = /(?<!@\S*)@\w+/.test(trimmed)
    if (unresolvedAt && mentions.length === 0) {
      return
    }

    onSend(trimmed, mentions)
    setText('')
    setMentions([])
  }

  useEffect(() => {
    return () => {
      if (searchRef.current) clearTimeout(searchRef.current)
    }
  }, [])

  return (
    <div className="border-t border-white/10 p-3 relative">
      {showMentionDropdown && mentionResults.length > 0 && (
        <div className="absolute bottom-full left-3 right-3 mb-1 rounded border border-white/20 bg-bg-dark shadow-xl max-h-40 overflow-y-auto">
          {mentionResults.map((card, i) => (
            <button
              key={card.id}
              onClick={() => selectMention(card)}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-white/10 ${
                i === mentionCursorIdx ? 'bg-white/10' : ''
              }`}
            >
              <span className="text-white">{card.name}</span>
              <span className="text-white/40 ml-2">{card.type_line}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2 items-end">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder ?? 'Chiedi una regola... (@ per citare carte)'}
          disabled={disabled}
          rows={2}
          className="flex-1 resize-none rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-primary-500"
        />
        <button
          onClick={handleSubmit}
          disabled={disabled || text.trim().length === 0}
          className="rounded bg-primary-600 p-2 text-white hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Send"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Mount GoblinAIButton in app layout**

In `src/app/(app)/layout.tsx`, add import and mount:

```tsx
import { GoblinAIButton } from '@/components/goblinai/GoblinAIButton'
```

And add before closing `</SidebarProvider>`:

```tsx
<GoblinAIButton />
```

- [ ] **Step 6: Verify build**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/components/goblinai/GoblinAIButton.tsx src/components/goblinai/GoblinAIPanel.tsx src/components/goblinai/GoblinAIComposer.tsx src/components/goblinai/GoblinAIMessage.tsx src/app/\(app\)/layout.tsx
git commit -m "feat: add GoblinAI assistant UI"
```

---

### Task 11: Ingestion Scripts

**Files:**
- Create: `scripts/ingest-mtg-rules.mjs`
- Create: `scripts/ingest-scryfall-rulings.mjs`

- [ ] **Step 1: Create MTG rules ingestion script**

Create `scripts/ingest-mtg-rules.mjs`:

```js
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

const [, , filePath, version] = process.argv
if (!filePath || !version) {
  console.error('Usage: node scripts/ingest-mtg-rules.mjs <path-to-rules.txt> <version>')
  console.error('Example: node scripts/ingest-mtg-rules.mjs data/private/MagicCompRules.txt "2026-05"')
  process.exit(1)
}

const text = readFileSync(filePath, 'utf-8')

const RULE_LINE_RE = /^(\d{3}(?:\.\d+[a-z]?)?)\.\s+(.+)$/

function deriveRuleKeywords(ruleNumber, text) {
  const kws = new Set()
  const lower = text.toLowerCase()
  if (/triggered ability/i.test(lower)) kws.add('triggered_ability')
  if (/enters the battlefield/i.test(lower)) kws.add('etb_trigger')
  if (/replacement effect/i.test(lower)) kws.add('replacement_effect')
  if (/counter/i.test(lower)) kws.add('counter_placement')
  if (/token/i.test(lower)) kws.add('token_creation')
  if (/copy/i.test(lower)) kws.add('copy_effect')
  if (/target/i.test(lower)) kws.add('targeting')
  if (/zone/i.test(lower) || /exile/i.test(lower) || /graveyard/i.test(lower)) kws.add('zone_change')
  return Array.from(kws).sort()
}

let currentParent = null
let currentSection = null
const rules = []

for (const line of text.split('\n')) {
  const match = line.trim().match(RULE_LINE_RE)
  if (match) {
    const [, ruleNum, ruleText] = match
    const parent = ruleNum.substring(0, 3)

    if (!ruleNum.includes('.')) {
      currentSection = ruleText
      currentParent = ruleNum
    }

    rules.push({
      rule_number: ruleNum,
      parent_rule_number: parent === ruleNum ? null : parent,
      section_title: ruleNum.includes('.') ? currentSection : ruleText,
      text: ruleText,
      source_version: version,
      keywords: deriveRuleKeywords(ruleNum, ruleText),
    })
  }
}

console.log(`Parsed ${rules.length} rules from ${filePath}`)

const batchSize = 100
let inserted = 0
let updated = 0

for (let i = 0; i < rules.length; i += batchSize) {
  const batch = rules.slice(i, i + batchSize)
  const { data, error } = await supabase
    .from('mtg_rules')
    .upsert(batch, { onConflict: 'rule_number, source_version' })

  if (error) {
    console.error(`Batch ${i}-${i + batchSize} failed:`, error.message)
  } else {
    inserted += batch.length
  }

  if ((i / batchSize) % 10 === 0) {
    console.log(`Progress: ${i}/${rules.length}`)
  }
}

console.log(`Done. ${inserted} rules inserted/updated.`)
```

- [ ] **Step 2: Create Scryfall rulings ingestion script**

Create `scripts/ingest-scryfall-rulings.mjs`:

```js
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

const SCRYFALL_BULK = 'https://api.scryfall.com/bulk-data'

function deriveRulingKeywords(text) {
  const kws = new Set()
  const lower = text.toLowerCase()
  if (/triggered ability/i.test(lower)) kws.add('triggered_ability')
  if (/enters the battlefield/i.test(lower)) kws.add('etb_trigger')
  if (/counter/i.test(lower)) kws.add('counter_placement')
  if (/token/i.test(lower)) kws.add('token_creation')
  if (/target/i.test(lower)) kws.add('targeting')
  if (/zone|exile|graveyard/i.test(lower)) kws.add('zone_change')
  if (/replacement/i.test(lower)) kws.add('replacement_effect')
  if (/copy/i.test(lower)) kws.add('copy_effect')
  return Array.from(kws).sort()
}

async function main() {
  console.log('Fetching Scryfall bulk data index...')
  const indexRes = await fetch(SCRYFALL_BULK)
  const { data: entries } = await indexRes.json()

  const rulingsEntry = entries.find((e) => e.type === 'rulings')
  if (!rulingsEntry) {
    console.error('Rulings bulk not found in Scryfall index')
    process.exit(1)
  }

  console.log(`Downloading rulings from ${rulingsEntry.download_uri}`)
  const rulingsRes = await fetch(rulingsEntry.download_uri)
  const rulings = await rulingsRes.json()

  console.log(`Downloaded ${rulings.length} ruling records`)

  const { data: cards } = await supabase
    .from('cards')
    .select('id, scryfall_id')

  const cardIdByOracleId = new Map()
  for (const card of cards) {
    if (card.scryfall_id) {
      cardIdByOracleId.set(card.scryfall_id, card.id)
    }
  }

  let inserted = 0
  let skipped = 0

  const rows = []
  for (const ruling of rulings) {
    const cardId = cardIdByOracleId.get(ruling.oracle_id)
    if (!cardId) {
      skipped++
      continue
    }

    for (const entry of ruling.comments || []) {
      rows.push({
        card_id: cardId,
        scryfall_oracle_id: ruling.oracle_id,
        ruling_date: entry.date,
        text: entry.text,
        source: 'scryfall',
        keywords: deriveRulingKeywords(entry.text),
      })
    }
  }

  const batchSize = 100
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const { error } = await supabase
      .from('card_rulings')
      .upsert(batch, { onConflict: 'card_id, ruling_date, text' })

    if (!error) {
      inserted += batch.length
    }

    if ((i / batchSize) % 10 === 0) {
      console.log(`Progress: ${i}/${rows.length}`)
    }
  }

  console.log(`Done. ${inserted} rulings inserted. ${skipped} oracle_ids skipped (card not in DB).`)
}

main().catch(console.error)
```

- [ ] **Step 3: Commit**

```bash
git add scripts/ingest-mtg-rules.mjs scripts/ingest-scryfall-rulings.mjs
git commit -m "feat: add GoblinAI rules and rulings ingestion scripts"
```

---

### Task 12: Test Suite And Manual QA

**Files:**
- Create: `tests/goblinai/goblinai-ui.spec.ts`

- [ ] **Step 1: Create Playwright smoke test**

Create `tests/goblinai/goblinai-ui.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test.describe('GoblinAI UI', () => {
  test('shows floating button when authenticated', async ({ page }) => {
    // Requires authenticated session — manual run only
    test.skip()
  })

  test('opens panel on button click', async ({ page }) => {
    test.skip()
  })

  test('shows restatement for complex scenario', async ({ page }) => {
    test.skip()
  })

  test('shows direct answer for simple keyword question', async ({ page }) => {
    test.skip()
  })
})
```

Note: Playwright tests require authentication setup. Marked as skip for now — enable when auth harness is in place.

- [ ] **Step 2: Run all unit tests**

```bash
npm run test:goblinai
```

Expected: all GoblinAI helper tests pass (interaction-keywords, rule-router, scenario-gate, mention-contract).

- [ ] **Step 3: Run lint**

```bash
npm run lint
```

Expected: exit 0. Existing warnings acceptable only if pre-existing.

- [ ] **Step 4: Run build**

```bash
npm run build
```

Expected: compiled successfully.

- [ ] **Step 5: Commit**

```bash
git add tests/goblinai/goblinai-ui.spec.ts
git commit -m "test: add GoblinAI UI smoke test scaffold"
```

---

## Acceptance Criteria

- [ ] User can open GoblinAI from authenticated app shell via floating button
- [ ] User can select cards via `@mention` autocomplete (reuses `/api/cards/search`)
- [ ] Backend never auto-guesses unmentioned card names
- [ ] Backend loads mentioned card oracle text from local DB
- [ ] Complex multi-card scenario (>1 mention or complex keywords) returns restatement and waits for confirmation
- [ ] Final answer only generated after user confirms scenario
- [ ] Simple lifelink/double-strike style question (no mentions, no card-specific wording) can answer directly
- [ ] DeepSeek API key remains server-only (never in client bundle)
- [ ] Rate limiting applies to all assistant endpoints (20 req/min per user)
- [ ] `npm run test:goblinai`, `npm run lint`, and `npm run build` pass

## Risks

- **Rules source not ingested yet:** GoblinAI can still restate with oracle text. Answer marks `rulesAvailable: false` if `mtg_rules` table is empty. CR ingestion is post-deploy manual step.
- **`@ai-sdk/deepseek` model ID lag:** Direct `fetch` to DeepSeek OpenAI-compatible endpoint avoids provider dependency.
- **Rulings mapping incomplete:** V1 uses local oracle + CR first. `card_rulings` population is best-effort via ingestion script.
- **Prompt too long:** Context builder caps to mentioned cards, max 40 rules, max 20 rulings.
