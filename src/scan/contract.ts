// PLAN.md §5 — the extraction contract. Pure constants: imported by the browser
// Gemini client AND by api/scan.ts (keep this file dependency-free).

export const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    merchant: { type: 'STRING', nullable: true },
    date: { type: 'STRING', nullable: true },
    currency: { type: 'STRING' },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          qty: { type: 'INTEGER' },
          unit_price: { type: 'INTEGER', nullable: true },
          line_total: { type: 'INTEGER' },
          category: { type: 'STRING', enum: ['food', 'alcohol', 'other'] },
          confidence: { type: 'STRING', enum: ['high', 'low'] },
        },
        required: ['name', 'line_total', 'category', 'confidence'],
      },
    },
    charges: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          label: { type: 'STRING' },
          amount: { type: 'INTEGER' },
          rate: { type: 'NUMBER', nullable: true },
          kind: {
            type: 'STRING',
            enum: ['gst', 'vat', 'service', 'tip', 'packaging', 'delivery', 'discount', 'rounding', 'other'],
          },
          applies_to: { type: 'STRING', enum: ['food', 'alcohol', 'all'] },
        },
        required: ['label', 'amount', 'kind', 'applies_to'],
      },
    },
    subtotal: { type: 'INTEGER', nullable: true },
    total: { type: 'INTEGER', nullable: true },
  },
  required: ['items', 'charges'],
} as const

// §5 prompt notes — one call, no multi-turn refinement.
export const PROMPT = `Extract this restaurant bill into structured data.
Rules:
- ALL money values are integer paise (₹280.00 → 28000). Never decimals.
- qty defaults to 1 when not printed.
- category is "alcohol" for beer/wine/spirits/cocktails, "food" otherwise, "other" for non-food lines.
- For each tax/charge line, infer applies_to from the rate and the bill's own sectioning. Indian bills commonly carry 5% GST on food and a separate ~20–25% VAT on alcohol.
- Discounts are negative amount.
- Mark confidence "low" for any line you are unsure you read correctly.
- Never invent a line that isn't visible. Omit rather than guess.`

export interface RawExtraction {
  merchant?: string | null
  date?: string | null
  currency?: string
  items?: {
    name: string
    qty?: number
    unit_price?: number | null
    line_total: number
    category: 'food' | 'alcohol' | 'other'
    confidence: 'high' | 'low'
  }[]
  charges?: {
    label: string
    amount: number
    rate?: number | null
    kind: string
    applies_to: 'food' | 'alcohol' | 'all'
  }[]
  subtotal?: number | null
  total?: number | null
}

export function geminiRequestBody(base64Jpeg: string) {
  return {
    contents: [
      {
        parts: [
          { text: PROMPT },
          { inline_data: { mime_type: 'image/jpeg', data: base64Jpeg } },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0,
    },
  }
}

export function parseGeminiResponse(json: unknown): RawExtraction {
  // Thinking-capable models (Gemini 2.5+/3.x) may return several parts; the
  // JSON payload isn't guaranteed to be parts[0]. Join all non-thought text.
  const candidate = (
    json as {
      candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[]
    }
  )?.candidates?.[0]
  const text = (candidate?.content?.parts ?? [])
    .filter((p) => !p.thought && typeof p.text === 'string')
    .map((p) => p.text)
    .join('')
  if (!text) throw new Error(`empty response (finishReason: ${candidate?.finishReason ?? 'none'})`)
  return JSON.parse(text) as RawExtraction
}
