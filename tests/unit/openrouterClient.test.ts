/**
 * Tests for extractJsonString (pure function — no mocks needed).
 */
import { describe, it, expect } from 'vitest'

import { extractJsonString } from '../../src/services/clients/openrouter.client'

const validJson = '{"title":"Test","questions":[]}'

describe('extractJsonString', () => {
  describe('Strategy 1 — whole-response code fence', () => {
    it('strips a ```json fence wrapping the entire response', () => {
      expect(extractJsonString('```json\n' + validJson + '\n```')).toBe(validJson)
    })

    it('strips a plain ``` fence wrapping the entire response', () => {
      expect(extractJsonString('```\n' + validJson + '\n```')).toBe(validJson)
    })

    it('handles fences with no newline after the opening backticks', () => {
      expect(extractJsonString('```json' + validJson + '```')).toBe(validJson)
    })

    it('extracts the full JSON even when it contains inner ```javascript code blocks', () => {
      // This is the critical case: Anthropic wraps the whole response in ```json,
      // and the JSON itself contains ```javascript blocks inside question text strings.
      const jsonWithCode =
        '{"title":"JS Quiz","questions":[{"text":"What does this output?\\n```javascript\\nconsole.log(1+1)\\n```","type":"multiple_choice","options":[{"text":"Use `typeof` here","isCorrect":false,"explanation":"wrong"}]}]}'
      const input = '```json\n' + jsonWithCode + '\n```'
      expect(extractJsonString(input)).toBe(jsonWithCode)
    })
  })

  describe('Strategy 2 — ```json block embedded in prose', () => {
    it('extracts JSON from a ```json fence that has text before it', () => {
      const input = `Sure, here is the quiz:\n\`\`\`json\n${validJson}\n\`\`\``
      expect(extractJsonString(input)).toBe(validJson)
    })

    it('extracts JSON from a ```json fence that has text after it', () => {
      const input = `\`\`\`json\n${validJson}\n\`\`\`\nLet me know if you need changes.`
      expect(extractJsonString(input)).toBe(validJson)
    })

    it('extracts JSON from a ```json fence surrounded by prose on both sides', () => {
      const input = `Here you go:\n\`\`\`json\n${validJson}\n\`\`\`\nHope that helps!`
      expect(extractJsonString(input)).toBe(validJson)
    })

    it('does NOT extract from a plain ``` fence embedded in prose (falls through to strategy 3)', () => {
      // Plain ``` fences are used for code blocks inside quiz content, not JSON wrappers.
      // Strategy 2 deliberately ignores them; strategy 3 (brace-walking) handles the JSON.
      const input = `Here:\n\`\`\`\n${validJson}\n\`\`\`\nDone.`
      // Strategy 2 skips it; strategy 3 brace-walks and still finds the JSON.
      expect(extractJsonString(input)).toBe(validJson)
    })

    it('does NOT confuse a ```javascript block inside JSON with the outer ```json fence', () => {
      // Prose + ```json wrapper + JSON content containing ```javascript blocks.
      // Strategy 2 should only match ```json, never ```javascript.
      const jsonWithCode =
        '{"title":"Quiz","questions":[{"text":"Explain:\\n```javascript\\n{x:1}\\n```","type":"open_ended","options":[]}]}'
      const input = `Here you go:\n\`\`\`json\n${jsonWithCode}\n\`\`\``
      expect(extractJsonString(input)).toBe(jsonWithCode)
    })
  })

  describe('Strategy 3 — brace-walking (no fence at all)', () => {
    it('extracts JSON when there is only leading prose', () => {
      const input = `I've generated the quiz for you. ${validJson}`
      expect(extractJsonString(input)).toBe(validJson)
    })

    it('extracts JSON when there is trailing prose', () => {
      const input = `${validJson} Please review.`
      expect(extractJsonString(input)).toBe(validJson)
    })

    it('extracts JSON when surrounded by prose', () => {
      const input = `Here is the output: ${validJson} Let me know!`
      expect(extractJsonString(input)).toBe(validJson)
    })

    it('correctly handles nested objects', () => {
      const nested = '{"a":{"b":{"c":1}}}'
      const input = `Output: ${nested} done.`
      expect(extractJsonString(input)).toBe(nested)
    })

    it('correctly handles strings containing braces', () => {
      const tricky = '{"text":"use {braces} here","val":1}'
      const input = `Result: ${tricky}`
      expect(extractJsonString(input)).toBe(tricky)
    })

    it('correctly handles escaped quotes inside strings', () => {
      const escaped = '{"text":"He said \\"hello\\""}'
      const input = `Output: ${escaped}`
      expect(extractJsonString(input)).toBe(escaped)
    })

    it('correctly handles backtick code blocks inside JSON string values', () => {
      // Backticks are not JSON special characters and don't affect the brace walker.
      const withCode =
        '{"text":"What does this do?\\n```javascript\\nconsole.log(`hello`)\\n```","type":"mc"}'
      const input = `Output: ${withCode} Done.`
      expect(extractJsonString(input)).toBe(withCode)
    })

    it('correctly handles inline backticks inside JSON string values', () => {
      const withInline = '{"text":"Use `typeof x` to check the type","isCorrect":true}'
      const input = `Result: ${withInline}`
      expect(extractJsonString(input)).toBe(withInline)
    })
  })

  describe('fallback — returns trimmed original when nothing parseable found', () => {
    it('returns trimmed input when there is no JSON object', () => {
      const input = '  Just some plain text.  '
      expect(extractJsonString(input)).toBe('Just some plain text.')
    })
  })
})
