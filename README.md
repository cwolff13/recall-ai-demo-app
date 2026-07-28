# Customer Discovery Brief

A minimal Recall.ai demo that turns one customer interview into a reviewable
brief. It identifies pain points, goals, product requests, and follow-ups, then
links every factual item to the timestamped transcript and recording.

The application is intentionally one Node process: Express serves the browser
interface, creates the Recall bot, receives verified webhooks, requests
post-meeting transcription, and calls OpenRouter for one structured result.

## Why this workflow

Customer interviews contain useful product signals, but generated summaries are
difficult to trust without source context. Recall supplies the meeting capture,
recording lifecycle, speaker-attributed transcript, and playback. The
application adds the customer-discovery organization and evidence review.

## Flow

```text
Meeting URL
  -> Recall Meeting Bot
  -> verified recording.done webhook
  -> Recall post-meeting transcript
  -> verified transcript.done webhook
  -> OpenRouter structured brief
  -> recording + timestamped evidence review
```

There is no realtime transcript, database, job system, client framework, or
Recall polling.

## Setup

Requirements:

- Node.js 22 or newer
- A Recall workspace and API key
- A Recall workspace verification secret
- An OpenRouter API key
- A stable public HTTPS URL forwarding to this server, such as a static ngrok
  domain

```bash
npm install
cp .env.example .env
npm run dev
```

Set these server-only values in `.env`:

| Variable | Purpose |
| --- | --- |
| `RECALL_REGION` | Region shared by all Recall resources |
| `RECALL_API_KEY` | Region-specific Recall API key |
| `RECALL_WORKSPACE_VERIFICATION_SECRET` | Verifies Recall webhook signatures |
| `PUBLIC_API_BASE_URL` | Stable HTTPS URL reaching this server |
| `OPENROUTER_API_KEY` | Generates the structured discovery brief |
| `OPENROUTER_MODEL` | Optional; defaults to `openai/gpt-5-mini` |

Never commit `.env`.

## Recall webhook

The app receives dashboard webhooks at:

```text
PUBLIC_API_BASE_URL/api/webhooks/recall
```

Subscribe the endpoint to:

- `bot.*`
- `recording.done`
- `recording.failed`
- `transcript.done`
- `transcript.failed`

The currently connected Recall workspace already has an active endpoint at this
path with these event subscriptions. If the public base URL changes, update the
dashboard endpoint to the new stable URL in the same Recall region.

For local development:

```bash
ngrok http 3000
```

Use a static ngrok domain and confirm it exactly matches
`PUBLIC_API_BASE_URL`. See Recall's
[local webhook guide](https://docs.recall.ai/docs/local-webhook-development).

## Demo

1. Start a Google Meet customer interview.
2. Paste the meeting URL into the app and send the bot.
3. Admit **Discovery Notes Bot** if it enters the waiting room.
4. Confirm participant consent. The bot also sends a chat notice when it joins.
5. Discuss a current workflow, a pain point, a desired outcome, a product
   request, and a follow-up.
6. End the meeting and keep the server running.
7. Review the generated brief. Select citations to seek the recording to the
   supporting moment.
8. Copy the reviewed brief as Markdown.

Google Meet is the initial live-verification target. Do not describe another
meeting platform as verified until it has been tested.

## Server interface

- `POST /api/session` sends the bot to one meeting.
- `GET /api/session` returns browser-safe application state.
- `POST /api/webhooks/recall` verifies and accepts Recall lifecycle events.
- `GET /api/recording` proxies fresh Recall recording media with byte-range
  support.

The browser polls only this application's session endpoint. Recall lifecycle
state always comes from webhooks.

## Verification

```bash
npm run check
npm test
```

The automated tests cover raw webhook signatures, rotated signatures,
deduplication, event correlation, Recall retry decisions, transcript
normalization, and evidence validation. They do not prove the live integration.

An end-to-end claim requires a real meeting where the expected verified
webhooks, Recall recording, Recall transcript, generated brief, and recording
playback are all observed.

## Deliberate limitations

- One active meeting and one in-memory result
- State and webhook deduplication reset when the process restarts
- No authentication or authorization
- No durable queue, database, or concurrent processing
- The transcript is sent to the configured OpenRouter model
- The app must not be exposed as a production service without access controls

A customer extension would normally add durable jobs and storage,
authentication around meeting artifacts, multi-interview research organization,
and a reviewed publishing destination.

## Current references

- [Recall Create Bot](https://docs.recall.ai/reference/bot_create)
- [Post-meeting transcription](https://docs.recall.ai/docs/async-transcription)
- [Verifying requests from Recall](https://docs.recall.ai/docs/authenticating-requests-from-recallai)
- [Recording playback](https://docs.recall.ai/docs/video-playback)
- [OpenRouter structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs)
