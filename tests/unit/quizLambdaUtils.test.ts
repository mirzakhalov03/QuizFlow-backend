import { describe, it, expect } from 'vitest'

import { normalizeQuestionType } from '../../src/helpers/utils/quizLambdaUtils'

describe('normalizeQuestionType', () => {
  it('should pass through canonical types', () => {
    expect(normalizeQuestionType('multiple_choice')).toBe('multiple_choice')
    expect(normalizeQuestionType('multi_select')).toBe('multi_select')
    expect(normalizeQuestionType('true_false')).toBe('true_false')
    expect(normalizeQuestionType('open_ended')).toBe('open_ended')
  })

  it('should lowercase and convert whitespace to underscores', () => {
    expect(normalizeQuestionType('Multiple Choice')).toBe('multiple_choice')
    expect(normalizeQuestionType('  MULTIPLE   CHOICE ')).toBe('multiple_choice')
    expect(normalizeQuestionType('Multi Select')).toBe('multi_select')
  })

  it('should accept the slash form of true/false', () => {
    expect(normalizeQuestionType('true/false')).toBe('true_false')
    expect(normalizeQuestionType('True/False')).toBe('true_false')
  })

  it('should default to open_ended for undefined input', () => {
    expect(normalizeQuestionType(undefined)).toBe('open_ended')
  })

  it('should default to open_ended for unrecognized values', () => {
    expect(normalizeQuestionType('essay')).toBe('open_ended')
    expect(normalizeQuestionType('')).toBe('open_ended')
  })
})
