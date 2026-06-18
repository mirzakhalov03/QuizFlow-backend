import {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  type Message,
} from '@aws-sdk/client-sqs'

const REGION = process.env.AWS_REGION
const QUEUE_URL = process.env.SQS_QUEUE_URL

// Mirrors the queue's redrive policy (maxReceiveCount). SQS moves a message to
// the DLQ on its own once it has been received this many times — we only use
// this number for logging and to know when a failure is terminal.
export const MAX_RECEIVE_COUNT = 3

// Long-poll: wait up to 20s for a message instead of returning empty
// immediately. Fewer empty receives = lower cost and less CPU spin.
const WAIT_TIME_SECONDS = 20

let client: SQSClient | null = null

const getClient = (): SQSClient => {
  if (!client) client = new SQSClient({ region: REGION })
  return client
}

const getQueueUrl = (): string => {
  if (!QUEUE_URL) throw new Error('SQS_QUEUE_URL is not set')
  return QUEUE_URL
}

/** Publish a job. Body is JSON-serialised. */
export const sendJob = async (body: Record<string, unknown>): Promise<void> => {
  await getClient().send(
    new SendMessageCommand({
      QueueUrl: getQueueUrl(),
      MessageBody: JSON.stringify(body),
    }),
  )
}

/**
 * Long-poll for a single job (one at a time, like RabbitMQ prefetch(1)).
 * Returns null when the poll window elapses with no message.
 */
export const receiveJob = async (): Promise<Message | null> => {
  const res = await getClient().send(
    new ReceiveMessageCommand({
      QueueUrl: getQueueUrl(),
      MaxNumberOfMessages: 1,
      WaitTimeSeconds: WAIT_TIME_SECONDS,
      MessageSystemAttributeNames: ['ApproximateReceiveCount'],
    }),
  )
  return res.Messages?.[0] ?? null
}

/** Acknowledge a job by deleting it so it isn't redelivered. */
export const deleteJob = async (receiptHandle: string): Promise<void> => {
  await getClient().send(
    new DeleteMessageCommand({
      QueueUrl: getQueueUrl(),
      ReceiptHandle: receiptHandle,
    }),
  )
}

/** How many times this message has been received (1 on first delivery). */
export const getReceiveCount = (msg: Message): number =>
  Number(msg.Attributes?.ApproximateReceiveCount ?? '1')
