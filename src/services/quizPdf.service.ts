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

function renderQuestion(question: PdfQuestion, index: number): string {
  const typeLabel = TYPE_LABEL[question.type] ?? question.type

  if (question.type === 'open_ended') {
    const suggested = question.options.find((o) => o.explanation || o.text)
    const suggestedText = suggested?.explanation ?? suggested?.text ?? ''
    return `
      <article class="question">
        <div class="q-head">
          <span class="q-num">${index + 1}</span>
          <span class="q-text">${escapeHtml(question.text)}</span>
          <span class="q-type">${escapeHtml(typeLabel)}</span>
        </div>
        <div class="answer-lines"></div>
        ${
          suggestedText
            ? `<div class="suggested"><span class="suggested-label">Suggested answer</span>${escapeHtml(
                suggestedText,
              )}</div>`
            : ''
        }
      </article>`
  }

  const options = question.options
    .map((option) => {
      const correctClass = option.isCorrect ? ' option--correct' : ''
      const marker = option.isCorrect ? '✓' : ''
      const explanation = option.explanation
        ? `<div class="explanation">${escapeHtml(option.explanation)}</div>`
        : ''
      return `
        <li class="option${correctClass}">
          <span class="option-marker">${marker}</span>
          <div class="option-body">
            <span class="option-text">${escapeHtml(option.text)}</span>
            ${explanation}
          </div>
        </li>`
    })
    .join('')

  return `
    <article class="question">
      <div class="q-head">
        <span class="q-num">${index + 1}</span>
        <span class="q-text">${escapeHtml(question.text)}</span>
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
export function buildQuizHtml(quiz: PdfQuiz): string {
  const questions = quiz.questions.map((q, i) => renderQuestion(q, i)).join('')
  const meta = quiz.difficulty
    ? `<p class="meta">Difficulty: ${escapeHtml(quiz.difficulty)} · ${quiz.questions.length} questions</p>`
    : `<p class="meta">${quiz.questions.length} questions</p>`

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(quiz.title)}</title>
    <style>
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
      .q-text { flex: 1; font-weight: 600; }
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
      .option-body { flex: 1; }
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
export async function generateQuizPdf(quiz: PdfQuiz): Promise<Buffer> {
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    await page.setContent(buildQuizHtml(quiz), { waitUntil: 'domcontentloaded' })
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
