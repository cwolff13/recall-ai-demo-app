# Customer Discovery Brief

A small Recall.ai demo that turns one customer interview into a source-linked
discovery brief.

Paste in a Google Meet URL, choose the sections you want, and send a Recall bot
to the meeting. After the call, the app organizes the conversation into a
summary, pain points, desired outcomes, product requests, follow-ups, and open
questions. Each result links back to the supporting transcript moment and
recording.

This workflow shows how a Recall customer could build a useful product on top
of meeting capture, transcription, webhooks, and recording playback.

## Run locally

You need Node.js 22+, a Recall API key and workspace verification secret, an
OpenRouter API key, and a public HTTPS URL that forwards to this server.

```bash
npm install
cp .env.example .env
```

Fill in the values in `.env`, then configure a Recall dashboard webhook at:

```text
https://your-public-url.example/api/webhooks/recall
```

Subscribe it to `bot.*`, `recording.done`, `recording.failed`,
`transcript.done`, and `transcript.failed`. For local development, a tunnel such
as `ngrok http 3000` can provide the public URL.

Start the app:

```bash
npm run dev
```

Open your `PUBLIC_API_BASE_URL`

## Try the demo

1. Start a Google Meet interview.
2. Paste the meeting URL into the app and choose the brief sections. Every
   section is selected by default.
3. Send the bot and admit **Discovery Notes Bot** if prompted.
4. Confirm participant consent, then hold the interview.
5. End the meeting and keep the app running while Recall processes it.
6. Review the generated brief and use its citations to revisit the source
   conversation.

The demo supports one in-memory meeting at a time. It intentionally omits
authentication, durable storage, and concurrent processing.

## Section selection

The selector controls which sections OpenRouter extracts and which headings
appear in the browser and copied Markdown. Recall still records and transcribes
the complete meeting, and source evidence remains available for review.

`POST /api/session` accepts an optional `sections` array containing any of:
`summary`, `pain_points`, `desired_outcomes`, `product_requests`, `follow_ups`,
and `open_questions`. Omitting the field selects every section. `GET
/api/session` returns the normalized selection locked to the current meeting.

## Check the code

```bash
npm run check
npm test
```

These checks cover webhook handling, transcript evidence, section validation,
selective generation, and Markdown with automated tests. A real meeting is still
required to verify the complete Recall workflow.
