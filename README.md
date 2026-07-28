# Customer Discovery Brief

This demo sends a Recall Meeting Bot to a Google Meet and turns the recorded
conversation into a custom report.

Before the meeting, the user chooses what the report should include, such as
pain points, desired outcomes, product requests, or a custom category. After the
meeting, the app shows:

- Who attended and how speaking time was shared
- A brief tailored to the selected categories
- Timestamped evidence for every generated claim
- The meeting recording beside the transcript evidence

[Product overview](./docs/PRODUCT.md) ·
[Recall.ai documentation](https://docs.recall.ai/)

## Prerequisites

Install or create the following before running the app:

1. [Git](https://git-scm.com/downloads)
2. [Node.js](https://nodejs.org/) 22 or newer
3. A [Recall.ai account](https://www.recall.ai/)
4. An [OpenRouter account](https://openrouter.ai/)
5. An [ngrok account and CLI](https://ngrok.com/docs/getting-started/)
6. A Google account that can host a Google Meet

You do not need Zoom credentials, a database, or a separate frontend server.

## 1. Clone and install

```bash
git clone https://github.com/cwolff13/recall-ai-demo-app.git
cd recall-ai-demo-app
npm install
```

## 2. Set up Recall.ai

Recall resources are tied to a region. Choose one region and use it for the API
key, verification secret, webhook, bots, recordings, and transcripts.

1. Open the Recall dashboard for your region.
2. Go to **Developers → API Keys & Secrets**.
3. Create an API key.
4. Create a workspace verification secret.
5. Save both values for the environment setup below.

Common dashboard links:

- [US West (`us-west-2`)](https://us-west-2.recall.ai/dashboard/developers/api-keys)
- [US East (`us-east-1`)](https://us-east-1.recall.ai/dashboard/developers/api-keys)
- [Europe (`eu-central-1`)](https://eu-central-1.recall.ai/dashboard/developers/api-keys)
- [Japan (`ap-northeast-1`)](https://ap-northeast-1.recall.ai/dashboard/developers/api-keys)

The app uses the workspace verification secret to reject webhook requests that
were not sent by Recall.

## 3. Create an OpenRouter API key

1. Sign in to [OpenRouter](https://openrouter.ai/).
2. Open [API Keys](https://openrouter.ai/settings/keys).
3. Create a key and save it for the environment setup.

OpenRouter generates the final structured brief after Recall produces the
meeting transcript.

## 4. Create a public HTTPS tunnel

Recall must be able to send webhooks to the local server. A stable ngrok domain
keeps the webhook URL the same between runs.

1. Sign in to the [ngrok dashboard](https://dashboard.ngrok.com/).
2. Install and authenticate the ngrok CLI.
3. Claim a free static domain from **Cloud Edge → Domains**.
4. Start a tunnel to the app's default port:

```bash
ngrok http --domain YOUR_STATIC_DOMAIN 3000
```

Keep this terminal open. Copy the HTTPS forwarding URL, without a trailing
slash. For example:

```text
https://your-static-domain.ngrok-free.app
```

See Recall's
[local webhook development guide](https://docs.recall.ai/docs/local-webhook-development)
for the full ngrok walkthrough.

## 5. Configure the environment

Create the local environment file:

```bash
cp .env.example .env
```

Fill in `.env`:

```env
RECALL_REGION=your_workspace_region
RECALL_API_KEY=your_recall_api_key
RECALL_WORKSPACE_VERIFICATION_SECRET=your_workspace_verification_secret

PUBLIC_API_BASE_URL=https://your-static-domain.ngrok-free.app

OPENROUTER_API_KEY=your_openrouter_api_key
OPENROUTER_MODEL=openai/gpt-5-mini

PORT=3000
```

Do not commit `.env`; it is already ignored by Git.

## 6. Configure the Recall webhook

In the same Recall region used above:

1. Open **Developers → Webhooks**.
2. Add a dashboard webhook endpoint.
3. Set the endpoint URL to:

```text
https://your-static-domain.ngrok-free.app/api/webhooks/recall
```

4. Subscribe it to:
   - All `bot.*` lifecycle events
   - `recording.done`
   - `recording.failed`
   - `transcript.done`
   - `transcript.failed`
5. Make sure the endpoint is active.

The webhook tells the app when the bot joins, the recording finishes, and the
post-meeting transcript is ready.

## 7. Run the app

In the project directory:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Keep both the app and ngrok terminals running until the report appears. Because
the demo stores one meeting in memory, changing server code during an active
meeting restarts the development server and clears that meeting. Send a new bot
after any restart.

## 8. Try the demo

1. Start a Google Meet.
2. Copy the meeting URL into the app.
3. Choose the sections to include in the brief.
4. Optionally define one custom section or change the bot's appearance.
5. Select **Send bot**.
6. Admit the bot to the meeting if Google Meet asks.
7. Confirm participant consent and hold the conversation.
8. End the meeting normally.
9. Keep the app open while Recall processes the recording and transcript.

When processing finishes, the page displays:

- A separate meeting-participation card
- The generated discovery brief
- Speaker-attributed transcript evidence
- Timestamp links that seek the recording
- A button to copy the brief as Markdown

To test participation analytics, join from a phone or second Google account and
alternate speakers before ending the meeting.

## Troubleshooting

### The app does not start

The server reports the name of any missing environment variable. Check `.env`
and confirm that every required value is present.

### The bot joins, but the page does not update

Confirm that:

- ngrok is still running
- `PUBLIC_API_BASE_URL` matches the active ngrok domain
- the Recall webhook uses `/api/webhooks/recall`
- the webhook is active and subscribed to the required events
- the API key, verification secret, and webhook are in the same Recall region

### The meeting ends, but no report appears

Keep the app and tunnel running through the entire meeting. If the development
server restarted, refresh the page and send a new bot before testing again.

## Run the checks

```bash
npm run check
npm test
```

Automated tests cover the application logic, but they do not replace a live
meeting test against Recall.

## Demo scope

The app supports one in-memory meeting at a time. It intentionally does not
include authentication, durable storage, concurrent meetings, calendar
integration, or real-time transcription.
