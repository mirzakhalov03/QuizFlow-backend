import hljs from 'highlight.js'
import puppeteer from 'puppeteer'

import type { QuestionType } from '../types/questionTypes'

type PdfOption = {
  text: string
  explanation: string | null
  isCorrect: boolean
}

type PdfQuestion = {
  text: string
  type: QuestionType
  position: number
  options: PdfOption[]
}

type PdfQuiz = {
  title: string
  difficulty?: string | null
  questions: PdfQuestion[]
}

const TYPE_LABEL: Record<QuestionType, string> = {
  multiple_choice: 'Multiple choice',
  multi_select: 'Multi-select',
  open_ended: 'Open-ended',
  true_false: 'True / false',
  mixed: 'Mixed',
}

/** Escape user-supplied text so it can't break or inject into the HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Highlight a fenced code block server-side using highlight.js.
 * Falls back to plain escaped text if the language is unknown.
 */
function highlightCode(code: string, language: string): string {
  const trimmed = code.trim()
  try {
    if (language && hljs.getLanguage(language)) {
      return hljs.highlight(trimmed, { language }).value
    }
    // Unknown or missing language — let hljs auto-detect.
    return hljs.highlightAuto(trimmed).value
  } catch {
    // Fallback: plain escaped text, no highlighting.
    return escapeHtml(trimmed)
  }
}

/**
 * Parses markdown-style code blocks and inline code.
 * Fenced blocks are syntax-highlighted server-side so Puppeteer needs no
 * external scripts or network requests.
 */
function formatMarkdown(text: string | null | undefined): string {
  if (!text) return ''

  const parts = text.split(/(```[\s\S]*?```)/g)

  return parts
    .map((part) => {
      if (part.startsWith('```')) {
        const match = part.match(/```(\w*)\n?([\s\S]*?)```/)
        if (match) {
          const language = match[1] || ''
          const highlighted = highlightCode(match[2], language)
          const langAttr = language ? ` class="language-${escapeHtml(language)}"` : ''
          return `<pre><code${langAttr}>${highlighted}</code></pre>`
        }
      }

      const inlineParts = part.split(/(`[^`]+`)/g)
      return inlineParts
        .map((inlinePart) => {
          if (inlinePart.startsWith('`') && inlinePart.endsWith('`')) {
            const code = inlinePart.slice(1, -1)
            return `<code class="inline-code">${escapeHtml(code)}</code>`
          }
          return escapeHtml(inlinePart)
        })
        .join('')
    })
    .join('')
}

function renderQuestion(question: PdfQuestion, index: number, withAnswers = true): string {
  const typeLabel = TYPE_LABEL[question.type] ?? question.type

  if (question.type === 'open_ended') {
    const suggested = question.options.find((o) => o.explanation || o.text)
    const suggestedText = suggested?.explanation ?? suggested?.text ?? ''
    return `
      <article class="question">
        <div class="q-head">
          <span class="q-num">${index + 1}</span>
          <span class="q-text">${formatMarkdown(question.text)}</span>
          <span class="q-type">${escapeHtml(typeLabel)}</span>
        </div>
        <div class="answer-lines"></div>
        ${
          withAnswers && suggestedText
            ? `<div class="suggested"><span class="suggested-label">Suggested answer</span>${formatMarkdown(
                suggestedText,
              )}</div>`
            : ''
        }
      </article>`
  }

  const options = question.options
    .map((option) => {
      const correctClass = withAnswers && option.isCorrect ? ' option--correct' : ''
      const marker = withAnswers && option.isCorrect ? '✓' : ''
      const explanation =
        withAnswers && option.explanation
          ? `<div class="explanation">${formatMarkdown(option.explanation)}</div>`
          : ''
      return `
        <li class="option${correctClass}">
          <span class="option-marker">${marker}</span>
          <div class="option-body">
            <span class="option-text">${formatMarkdown(option.text)}</span>
            ${explanation}
          </div>
        </li>`
    })
    .join('')

  return `
    <article class="question">
      <div class="q-head">
        <span class="q-num">${index + 1}</span>
        <span class="q-text">${formatMarkdown(question.text)}</span>
        <span class="q-type">${escapeHtml(typeLabel)}</span>
      </div>
      <ul class="options">${options}</ul>
    </article>`
}

/**
 * Build a self-contained HTML document for the quiz. All styling is inlined
 * so Puppeteer can render it without loading external assets. The PDF is an
 * answer key: correct options are marked and explanations are included.
 */
export function buildQuizHtml(quiz: PdfQuiz, withAnswers = true): string {
  const questions = quiz.questions.map((q, i) => renderQuestion(q, i, withAnswers)).join('')
  const meta = quiz.difficulty
    ? `<p class="meta">Difficulty: ${escapeHtml(quiz.difficulty)} · ${quiz.questions.length} questions</p>`
    : `<p class="meta">${quiz.questions.length} questions</p>`

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(quiz.title)}</title>
    <style>
      /* ── highlight.js github theme (inlined from node_modules) ─────────── */
      pre code.hljs{display:block;overflow-x:auto;padding:1em}code.hljs{padding:3px 5px}
      .hljs{color:#24292e;background:#fff}.hljs-doctag,.hljs-keyword,.hljs-meta .hljs-keyword,.hljs-template-tag,.hljs-template-variable,.hljs-type,.hljs-variable.language_{color:#d73a49}.hljs-title,.hljs-title.class_,.hljs-title.class_.inherited__,.hljs-title.function_{color:#6f42c1}.hljs-attr,.hljs-attribute,.hljs-literal,.hljs-meta,.hljs-number,.hljs-operator,.hljs-selector-attr,.hljs-selector-class,.hljs-selector-id,.hljs-variable{color:#005cc5}.hljs-meta .hljs-string,.hljs-regexp,.hljs-string{color:#032f62}.hljs-built_in,.hljs-symbol{color:#e36209}.hljs-code,.hljs-comment,.hljs-formula{color:#6a737d}.hljs-name,.hljs-quote,.hljs-selector-pseudo,.hljs-selector-tag{color:#22863a}.hljs-subst{color:#24292e}.hljs-section{color:#005cc5;font-weight:700}.hljs-bullet{color:#735c0f}.hljs-emphasis{color:#24292e;font-style:italic}.hljs-strong{color:#24292e;font-weight:700}.hljs-addition{color:#22863a;background-color:#f0fff4}.hljs-deletion{color:#b31d28;background-color:#ffeef0}

      /* ── document styles ─────────────────────────────────────────────────── */
      * { box-sizing: border-box; }
      body {
        font-family: 'Helvetica Neue', Arial, sans-serif;
        color: #1f2933;
        font-size: 12px;
        line-height: 1.5;
        margin: 0;
      }
      h1 { font-size: 22px; margin: 0 0 4px; }
      .meta { color: #6b7280; font-size: 11px; margin: 0 0 20px; }
      .question { page-break-inside: avoid; margin-bottom: 18px; }
      .q-head { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 8px; }
      .q-num {
        flex: 0 0 auto; width: 20px; height: 20px; border-radius: 50%;
        background: #eef2ff; color: #4338ca; font-weight: 700;
        display: inline-flex; align-items: center; justify-content: center; font-size: 11px;
      }
      .q-text { flex: 1; font-weight: 600; min-width: 0; }
      .q-type {
        flex: 0 0 auto; color: #6b7280; font-size: 10px; text-transform: uppercase;
        letter-spacing: 0.04em; padding-top: 2px;
      }
      .options { list-style: none; margin: 0; padding: 0 0 0 28px; }
      .option {
        display: flex; gap: 8px; border: 1px solid #e5e7eb; border-radius: 6px;
        padding: 8px 10px; margin-bottom: 6px;
      }
      .option--correct { border-color: #10b981; background: #ecfdf5; }
      .option-marker { flex: 0 0 14px; color: #059669; font-weight: 700; }
      .option-body { flex: 1; min-width: 0; }
      .explanation { color: #6b7280; font-size: 11px; margin-top: 4px; }
      .answer-lines {
        margin: 4px 0 0 28px; height: 70px;
        background-image: repeating-linear-gradient(
          transparent, transparent 22px, #d1d5db 22px, #d1d5db 23px
        );
      }
      .suggested {
        margin: 8px 0 0 28px; padding: 8px 10px; border: 1px solid #c7d2fe;
        background: #eef2ff; border-radius: 6px; font-size: 11px;
      }
      .suggested-label {
        display: block; color: #4338ca; font-weight: 700; text-transform: uppercase;
        font-size: 10px; letter-spacing: 0.04em; margin-bottom: 2px;
      }
      pre {
        margin: 8px 0;
        padding: 10px;
        background: #f8f9fa;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        overflow-x: auto;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 10px;
      }
      pre code {
        background: transparent !important;
        padding: 0 !important;
        font-size: 10px;
      }
      code {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 10px;
      }
      .inline-code {
        background: #f3f4f6;
        color: #1f2933;
        border: 1px solid #e5e7eb;
        border-radius: 4px;
        padding: 2px 4px;
        font-size: 9.5px;
      }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(quiz.title)}</h1>
    ${meta}
    ${questions}
  </body>
</html>`
}

let browserInstance: Awaited<ReturnType<typeof puppeteer.launch>> | null = null

async function getBrowser() {
  if (!browserInstance || !browserInstance.connected) {
    browserInstance = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })
  }
  return browserInstance
}

/** Render the quiz HTML to a PDF buffer using headless Chromium. */
export async function generateQuizPdf(quiz: PdfQuiz, withAnswers = true): Promise<Buffer> {
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    // HTML is fully self-contained (no external assets), so domcontentloaded
    // is sufficient — no selector wait needed.
    await page.setContent(buildQuizHtml(quiz, withAnswers), { waitUntil: 'domcontentloaded' })
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' },
    })
    return Buffer.from(pdf)
  } finally {
    await page.close()
  }
}
