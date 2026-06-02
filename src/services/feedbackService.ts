import { eq, lt, isNull, or } from 'drizzle-orm'

import { chatJSON } from './openRouter'
import { DEFAULT_MODEL } from '../constants/models'
import { db } from '../database/database'
import { userProfiles } from '../database/schema'
import Question from '../models/question.model'
import QuestionOption from '../models/questionOption.model'
import Quiz from '../models/quiz.model'
import UserAnswer from '../models/userAnswer.model'
import UserApiKey from '../models/userApiKey.model'

const MIN_QUIZ_COUNT = 3
const FEEDBACK_COOLDOWN_DAYS = 7

type FeedbackOutput = {
  summary: string
  weakTopics: string[]
  recommendations: string[]
}

const feedbackSchema = {
  name: 'feedback',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['summary', 'weakTopics', 'recommendations'],
    properties: {
      summary: { type: 'string' },
      weakTopics: { type: 'array', items: { type: 'string' } },
      recommendations: { type: 'array', items: { type: 'string' } },
    },
  },
}

type WrongAnswerDetail = {
  question: string
  userAnswer: string
  correctAnswer: string
}

type QuizData = {
  title: string
  totalQuestions: number
  correctAnswers: number
  wrongAnswers: number
  wrongDetails: WrongAnswerDetail[]
}

const buildPrompt = (quizData: QuizData[]): string => {
  const lines: string[] = ["Here is the user's quiz history:\n"]

  for (const quiz of quizData) {
    lines.push(`Quiz: "${quiz.title}" — Score: ${quiz.correctAnswers}/${quiz.totalQuestions}`)

    if (quiz.wrongDetails.length > 0) {
      lines.push('Wrong answers:')
      for (const w of quiz.wrongDetails) {
        lines.push(`  Q: ${w.question}`)
        lines.push(`  User answered: ${w.userAnswer}`)
        lines.push(`  Correct answer: ${w.correctAnswer}`)
      }
    }

    lines.push('')
  }

  return lines.join('\n')
}

export const generateFeedbackForUser = async (userId: string): Promise<void> => {
  // 1. Get all user answers
  const answers = await UserAnswer.findByUserId(userId)
  if (answers.length === 0) return

  // 2. Get all questions for those answers
  const questionIds = [...new Set(answers.map((a) => a.questionId))]
  const allQuestions = await Question.findByIds(questionIds)

  // Filter out open_ended — not gradable
  const gradableQuestions = allQuestions.filter((q) => q.type !== 'open_ended')
  const gradableQuestionIds = new Set(gradableQuestions.map((q) => q.id))

  // 3. Get distinct quiz IDs and check eligibility
  const quizIds = [...new Set(gradableQuestions.map((q) => q.quizId))]
  if (quizIds.length < MIN_QUIZ_COUNT) return

  // 4. Get quiz titles
  const quizList = await Quiz.findByIds(quizIds)
  const quizById = new Map(quizList.map((q) => [q.id, q]))

  // 5. Get all selected options to determine correctness
  const selectedOptionIds = answers
    .filter((a) => a.selectedOptionId !== null)
    .map((a) => a.selectedOptionId as string)
  const selectedOptions = await QuestionOption.findByIds(selectedOptionIds)
  const optionById = new Map(selectedOptions.map((o) => [o.id, o]))

  // 6. Get correct options for wrong questions (for feedback details)
  const wrongQuestionIds = answers
    .filter((a) => {
      if (!a.selectedOptionId || !gradableQuestionIds.has(a.questionId)) return false
      const opt = optionById.get(a.selectedOptionId)
      return opt && !opt.isCorrect
    })
    .map((a) => a.questionId)

  const correctOptions = await QuestionOption.findCorrectByQuestionIds([
    ...new Set(wrongQuestionIds),
  ])
  const correctOptionByQuestionId = new Map(correctOptions.map((o) => [o.questionId, o]))

  // 7. Group answers by quiz and build QuizData
  const questionById = new Map(allQuestions.map((q) => [q.id, q]))

  const quizDataMap = new Map<string, QuizData>()

  for (const quizId of quizIds) {
    const quiz = quizById.get(quizId)
    if (!quiz) continue
    quizDataMap.set(quizId, {
      title: quiz.title,
      totalQuestions: gradableQuestions.filter((q) => q.quizId === quizId).length,
      correctAnswers: 0,
      wrongAnswers: 0,
      wrongDetails: [],
    })
  }

  for (const answer of answers) {
    if (!answer.selectedOptionId || !gradableQuestionIds.has(answer.questionId)) continue

    const question = questionById.get(answer.questionId)
    if (!question) continue

    const quizData = quizDataMap.get(question.quizId)
    if (!quizData) continue

    const opt = optionById.get(answer.selectedOptionId)
    if (!opt) continue

    if (opt.isCorrect) {
      quizData.correctAnswers++
    } else {
      quizData.wrongAnswers++
      const correctOpt = correctOptionByQuestionId.get(answer.questionId)
      if (correctOpt) {
        quizData.wrongDetails.push({
          question: question.text,
          userAnswer: opt.text,
          correctAnswer: correctOpt.text,
        })
      }
    }
  }

  // 8. Resolve API key — use user's own key if available, fall back to default
  const userApiKey = await UserApiKey.findLatestByUserId(userId)
  const apiKey = userApiKey ? userApiKey.decrypted() : undefined

  // 9. Call AI
  const feedback = await chatJSON<FeedbackOutput>({
    model: DEFAULT_MODEL,
    apiKey,
    schema: feedbackSchema,
    temperature: 0.4,
    messages: [
      {
        role: 'system',
        content: [
          "You are an expert learning coach analyzing a student's quiz performance to help them improve.",
          '',
          '## Your task',
          'Based on the quiz history provided, generate structured feedback with three parts:',
          "1. summary — A 3-4 sentence paragraph overview of the student's overall performance. Mention their strongest areas and most critical weaknesses. Be honest but encouraging.",
          '2. weakTopics — A list of 3-5 specific topics or concepts the student consistently struggles with, derived directly from their wrong answers. Each item should be a short noun phrase (e.g. "SQL JOIN operations", "React component lifecycle"). Do NOT list vague topics like "general knowledge".',
          '3. recommendations — A list of 3-5 concrete, actionable study steps the student should take. Each recommendation must be specific and tied to their actual mistakes (e.g. "Review how INNER JOIN differs from LEFT JOIN using the quizzes where you confused them"). Do NOT write generic advice like "study more" or "practice regularly".',
          '',
          '## Length rules',
          '- summary: minimum 3 sentences, maximum 5 sentences. Never a single sentence.',
          '- weakTopics: minimum 3 items, maximum 5 items. Each item 2-6 words.',
          '- recommendations: minimum 3 items, maximum 5 items. Each item 1-2 sentences, specific and actionable.',
          '',
          '## Bad response example (DO NOT do this)',
          '{ "summary": "You did okay.", "weakTopics": ["math", "science"], "recommendations": ["Study more", "Practice"] }',
          '',
          '## Good response example',
          '{ "summary": "You demonstrated solid understanding of basic HTML structure, scoring well on tag-related questions. However, you consistently struggled with CSS specificity rules and flexbox alignment, missing 4 out of 5 questions in those areas. Your performance on JavaScript async concepts was mixed — you understand callbacks but confused Promises with async/await syntax. Focus your next study session on CSS layout and JS async patterns.", "weakTopics": ["CSS specificity and selector priority", "Flexbox and grid alignment", "JavaScript Promise chaining", "Async/await error handling"], "recommendations": ["Re-read the MDN CSS specificity guide and practice the 3 quizzes where you missed selector priority questions", "Build a small flexbox layout from scratch to solidify row vs column axis confusion seen in quiz 2", "Write 5 Promise chains manually before converting them to async/await to understand the relationship"] }',
          '',
          '## Important',
          '- Only reference topics that actually appear in the quiz data provided.',
          '- Do not invent mistakes the student did not make.',
          '- Do not repeat the same point across weakTopics and recommendations.',
        ].join('\n'),
      },
      {
        role: 'user',
        content: buildPrompt([...quizDataMap.values()]),
      },
    ],
  })

  // 10. Store result in user_profiles
  await db
    .update(userProfiles)
    .set({
      aiFeedback: feedback,
      aiFeedbackGeneratedAt: new Date(),
    })
    .where(eq(userProfiles.userId, userId))
}

export const getEligibleUserIds = async (): Promise<string[]> => {
  const cooldownDate = new Date()
  cooldownDate.setDate(cooldownDate.getDate() - FEEDBACK_COOLDOWN_DAYS)

  const profiles = await db
    .select({ userId: userProfiles.userId })
    .from(userProfiles)
    .where(
      or(
        isNull(userProfiles.aiFeedbackGeneratedAt),
        lt(userProfiles.aiFeedbackGeneratedAt, cooldownDate),
      ),
    )

  const eligible: string[] = []

  for (const { userId } of profiles) {
    const answers = await UserAnswer.findByUserId(userId)
    const questionIds = [...new Set(answers.map((a) => a.questionId))]
    const questions = await Question.findByIds(questionIds)
    const quizCount = new Set(questions.filter((q) => q.type !== 'open_ended').map((q) => q.quizId))
      .size
    if (quizCount >= MIN_QUIZ_COUNT) eligible.push(userId)
  }

  return eligible
}
