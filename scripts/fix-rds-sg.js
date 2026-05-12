// @ts-check
// One-off script: finds the RDS security group in the VPC by looking for a group
// that has an inbound rule on port 5432, then opens that port from 0.0.0.0/0.

require('dotenv').config()

const {
  EC2Client,
  DescribeSecurityGroupsCommand,
  AuthorizeSecurityGroupIngressCommand,
} = require('@aws-sdk/client-ec2')

const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
}
const region = process.env.AWS_REGION
const VPC_ID = 'vpc-081ba92c8c2887fdd' // from remove-lambda-vpc.js output

const ec2 = new EC2Client({ region, credentials })

async function run() {
  console.log('Listing all security groups in VPC', VPC_ID)

  const { SecurityGroups } = await ec2.send(
    new DescribeSecurityGroupsCommand({
      Filters: [{ Name: 'vpc-id', Values: [VPC_ID] }],
    }),
  )

  console.log(`Found ${SecurityGroups.length} security groups:`)
  SecurityGroups.forEach((sg) =>
    console.log(`  ${sg.GroupId}  ${sg.GroupName}  — ${sg.Description}`),
  )

  // Find groups that already allow port 5432 inbound (these are RDS groups)
  const rdsGroups = SecurityGroups.filter((sg) =>
    sg.IpPermissions?.some((p) => p.FromPort <= 5432 && p.ToPort >= 5432),
  )

  if (!rdsGroups.length) {
    console.log(
      '\nNo security group with port 5432 inbound found. Listing all SG names so you can pick manually.',
    )
    return
  }

  console.log(
    `\nSecurity groups with port 5432 inbound (RDS candidates): ${rdsGroups.map((g) => g.GroupId).join(', ')}`,
  )

  for (const sg of rdsGroups) {
    const alreadyOpen = sg.IpPermissions?.some(
      (p) =>
        p.FromPort <= 5432 && p.ToPort >= 5432 && p.IpRanges?.some((r) => r.CidrIp === '0.0.0.0/0'),
    )

    if (alreadyOpen) {
      console.log(`${sg.GroupId}: port 5432 already open from 0.0.0.0/0. Skipping.`)
      continue
    }

    console.log(`Opening port 5432 from 0.0.0.0/0 on ${sg.GroupId} (${sg.GroupName})...`)

    await ec2.send(
      new AuthorizeSecurityGroupIngressCommand({
        GroupId: sg.GroupId,
        IpPermissions: [
          {
            IpProtocol: 'tcp',
            FromPort: 5432,
            ToPort: 5432,
            IpRanges: [{ CidrIp: '0.0.0.0/0', Description: 'Lambda public access' }],
          },
        ],
      }),
    )

    console.log(`Done — port 5432 now open from anywhere on ${sg.GroupId}`)
  }
}

run().catch((err) => {
  console.error('Error:', err.message ?? err)
  process.exit(1)
})
