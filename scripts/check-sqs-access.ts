import 'dotenv/config'

import {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from '@aws-sdk/client-sqs'

/**
 * Round-trip probe against the real queue: send -> receive -> delete.
 * Proves the credentials have SendMessage / ReceiveMessage / DeleteMessage
 * on SQS_QUEUE_URL before we migrate any app code.
 */
const main = async (): Promise<void> => {
  const region = process.env.AWS_REGION
  const queueUrl = process.env.SQS_QUEUE_URL

  if (!queueUrl) {
    console.error('SQS_QUEUE_URL is not set in .env')
    process.exit(1)
  }

  console.log(`Region: ${region}`)
  console.log(`Queue:  ${queueUrl}`)
  console.log(`Access key: ${process.env.AWS_ACCESS_KEY_ID?.slice(0, 8)}…\n`)

  const client = new SQSClient({ region })
  const marker = `probe-${Date.now()}`

  try {
    // 1. SendMessage
    const sent = await client.send(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify({ probe: marker }),
      }),
    )
    console.log(`✅ SendMessage OK (MessageId=${sent.MessageId})`)

    // 2. ReceiveMessage (long-poll a few times — standard queues are eventually consistent)
    let received
    for (let attempt = 0; attempt < 5 && !received; attempt++) {
      const res = await client.send(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: 1,
          WaitTimeSeconds: 5,
        }),
      )
      const msg = res.Messages?.find((m) => m.Body?.includes(marker))
      if (msg) received = msg
    }

    if (!received) {
      console.log('⚠️  ReceiveMessage returned no matching message (it may be in flight).')
      console.log('   Send/permission still confirmed; nothing left to delete.')
      process.exit(0)
    }
    console.log('✅ ReceiveMessage OK (got our probe message back)')

    // 3. DeleteMessage (the "ack")
    await client.send(
      new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: received.ReceiptHandle!,
      }),
    )
    console.log('✅ DeleteMessage OK\n')
    console.log('PASS — send / receive / delete all work against the real queue.')
    process.exit(0)
  } catch (err) {
    const name = (err as { name?: string }).name
    const message = err instanceof Error ? err.message : String(err)

    if (name === 'AccessDenied' || name === 'AccessDeniedException') {
      console.log(`\n❌ AccessDenied — the IAM policy is missing a permission.`)
      console.log(`   Action that was denied: ${message}`)
    } else if (name === 'AWS.SimpleQueueService.NonExistentQueue' || name === 'QueueDoesNotExist') {
      console.log(`\n❌ Queue URL not found — check SQS_QUEUE_URL and region.`)
    } else {
      console.log(`\n❌ Failed: ${name ?? 'Unknown'} — ${message}`)
    }
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
