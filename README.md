# Customer Discovery Brief

A small Recall.ai demo that shows who participated in a customer interview and
turns the conversation into a source-linked discovery brief.

Paste in a Google Meet URL, optionally customize the bot's name and camera card,
choose the sections you want, optionally define one custom section, and send a
Recall bot to the meeting. After the call, the app shows attendance and speaking
activity, then organizes the conversation into a source-linked brief tailored
to those choices. Each brief item links back to the supporting transcript
moment and recording.

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
2. Paste the meeting URL into the app. Optionally customize the bot name and
   upload a JPEG camera card, then choose the brief sections and optionally
   define one custom section. Every standard section is selected by default.
3. Send the bot and admit it if prompted.
4. Confirm participant consent, then hold the interview.
5. End the meeting and keep the app running while Recall processes it.
6. Review the separate meeting participation card, then use the brief's
   citations to revisit the source conversation.

The demo supports one in-memory meeting at a time. It intentionally omits
authentication, durable storage, and concurrent processing.

## Bot appearance

The optional bot name is sent through Recall's `bot_name` field. The optional
JPEG is sent as `automatic_video_output` for both the pre-recording and recording
states, so it appears as the bot's 16:9 camera tile rather than its participant
profile picture.

The browser previews the image before submission. The server accepts JPEGs up to
1.3 MB, verifies the decoded file signature, passes the image to Recall, and
does not retain it in session state.

## Section selection

The selector controls which sections OpenRouter extracts and which headings
appear in the browser and copied Markdown. Recall still records and transcribes
the complete meeting, and source evidence remains available for review.

`POST /api/session` accepts an optional `sections` array containing any of:
`summary`, `pain_points`, `desired_outcomes`, `product_requests`, `follow_ups`,
and `open_questions`. It also accepts an optional `customSection` object with a
`name` of up to 60 characters and extraction `guidance` of up to 500 characters.
Omitting `sections` selects every standard section; an empty array is accepted
only with a valid custom section. `GET /api/session` returns the normalized
standard and custom selection locked to the current meeting.

## Check the code

```bash
npm run check
npm test
```

These checks cover webhook handling, participant analytics, transcript
evidence, brief selection, and Markdown. A real meeting is still required to
verify the complete Recall workflow.
