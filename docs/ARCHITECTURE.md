# Architecture

## Context

This repository is a 24-hour developer-experience exercise: build one useful,
complete Recall workflow that a customer could understand and extend. It is not
intended to be a production meeting platform.

The architecture therefore optimizes for:

- One live-verifiable workflow from meeting URL to reviewable output
- Clear boundaries around Recall, brief generation, server coordination, and UI
- Secure handling of credentials, webhooks, and recording URLs
- Enough test seams to exercise core behavior without a live meeting
- A codebase that can be explained during a short demo and code walkthrough

It intentionally does not optimize for multiple users, concurrent meetings,
durable jobs, or long-term meeting storage. Those concerns are described as
extension points instead of being partially implemented.

## System flow

```text
Browser UI
  |
  | POST /api/session with meeting URL and brief settings
  v
Express server
  |
  | Create bot with recording configuration
  v
Recall.ai
  |
  | Verified lifecycle webhooks
  |   recording.done
  |      -> create post-meeting transcript
  |      -> read participation artifacts
  |
  |   transcript.done
  v
Express event processor
  |
  | Download and segment the speaker-attributed transcript
  | Generate a schema-constrained brief with source IDs
  v
OpenRouter
  |
  | Structured discovery brief
  v
Express server
  |
  | GET /api/session and /api/recording
  v
Browser UI: brief, evidence, participation, and proxied playback
```

The browser polls only `GET /api/session`, an endpoint in this application.
Recall state itself is event-driven through dashboard lifecycle webhooks.

## Module boundaries

### Browser

- `public/index.html` defines the page structure and form controls.
- `public/app.js` owns browser state, HTTP requests, status refreshes, and
  coordination between the form and result views.
- `public/components.js` contains focused DOM constructors. Keeping rendering
  separate makes the larger orchestration file easier to scan without
  introducing a frontend framework or build pipeline.
- `public/styles.css` owns responsive layout and presentation.

### Server

- `src/server.js` is the composition root. It reads configuration, owns the
  single-session store, exposes HTTP routes, acknowledges verified webhooks,
  and coordinates the Recall and brief services.
- `src/recall.js` is the Recall boundary. It owns authenticated requests,
  retry behavior, webhook verification, bot and transcript operations,
  recording proxy responses, and participation-artifact normalization.
- `src/brief.js` is the synthesis boundary. It converts word-level transcript
  data into stable evidence segments, requests structured output from
  OpenRouter, validates every returned source reference, and creates Markdown.
- `shared/domain.js` contains definitions and formatting rules used by both
  server and browser code.

### Tests and product documentation

- `test/core.test.js` exercises domain logic and the coordinated workflow with
  controlled service doubles.
- `test/helpers.js` keeps fixtures and signed-webhook request construction out
  of the test cases.
- `docs/PRODUCT.md` defines what the product does and deliberately omits.
- `docs/DXE-technical-interview.md` preserves the assessment contract that
  shaped the implementation.

## Design decisions

### Browser-native JavaScript instead of a frontend framework

The interface is one form, one lifecycle status, and one result view. Native
ES modules and small rendering functions provide enough separation for that
surface without adding a bundler, framework conventions, or a second
development process. React would become valuable if the UI gained multiple
routes, independently changing interactive regions, or shared state across a
larger component tree.

### One Express process

Express serves the static UI and the application API from the same process.
This keeps credentials server-only, avoids cross-origin configuration, and
makes the complete workflow runnable with one command.

### Webhook-driven Recall lifecycle

The server creates a bot once and then relies on verified Recall lifecycle
events. It does not repeatedly query Recall for state. The browser's session
refresh is a local presentation concern and does not change that integration
model.

### Verify, acknowledge, then process

The webhook route receives the raw request body, verifies its signature before
parsing, rejects unverified requests, deduplicates accepted webhook IDs, and
acknowledges promptly. Substantial processing is deferred outside the webhook
response path with `setImmediate`.

This is sufficient for the single-process demo. A production service would put
accepted events onto a durable queue rather than relying on the current process
to remain alive.

### One in-memory session

The demo stores one active meeting and its accepted webhook IDs in memory. That
keeps the state transition visible in one file and avoids a database whose only
purpose would be to imitate production infrastructure. Restarting the server
clears the meeting.

Recall resources carry the application's session ID in metadata so the same
correlation strategy can be retained if the in-memory store is later replaced.

### Evidence before interpretation

Transcript words are deterministically grouped into short, timestamped segments
with stable source IDs such as `S1`. OpenRouter receives those segments and a
strict output schema. The server rejects generated claims that cite unknown
source IDs or populate sections the user did not request.

This makes the generated brief reviewable rather than treating it as an
authoritative account of the interview.

### OpenRouter is a replaceable synthesis boundary

Recall owns meeting capture, recording, transcription, and participation data.
OpenRouter is called only after the `transcript.done` webhook, when the
speaker-attributed transcript is ready to synthesize.

The request contains the normalized transcript segments and their source IDs,
the user's selected brief sections, and optional custom-section definition. It
asks for a strict JSON schema rather than free-form prose. Before storing the
result, the server validates its shape, confirms that unselected sections remain
empty, and rejects citations to unknown source IDs.

OpenRouter does not transcribe the meeting or calculate participation metrics.
Those results remain deterministic Recall-derived data. Another structured
generation provider could replace OpenRouter inside `src/brief.js` without
changing the meeting-capture or webhook workflow.

### Participation is useful but non-blocking

Participant lists, join and leave events, and speaker timelines add meeting
context, but they are not required to generate the brief. If those artifacts
are unavailable, the transcript and brief workflow continues and the UI
reports that participation context is unavailable.

### Recording playback stays behind the server

The browser requests `/api/recording`. The server obtains the current Recall
recording response and proxies its supported range and content headers. Recall
credentials and signed artifact URLs are not exposed to client code.

## Meeting-platform scope

The application submits the user's URL through Recall's generic `meeting_url`
field. Recall recognizes multiple meeting platforms, including Zoom and Google
Meet, so the core workflow does not branch on a hard-coded provider.

The README walkthrough uses Google Meet as a concrete first example, and the
same input accepts Zoom meeting links. This does not imply that every Recall
feature behaves identically on every platform. For example, Recall documents
platform-specific setup and differences in chat recipients, bot identity, and
other bot behavior.

See Recall's current documentation for:

- [Meeting platforms](https://docs.recall.ai/docs/meeting-platforms)
- [Meeting URLs](https://docs.recall.ai/docs/meeting-urls)
- [Create Bot](https://docs.recall.ai/reference/bot_create)
- [Sending chat messages](https://docs.recall.ai/docs/sending-chat-messages)

Live-verification notes should always name the meeting platform that was
actually exercised rather than treating general Recall support as proof of a
test in this repository.

## Extension path

The current boundaries provide direct replacement points if the demonstration
were developed into a production application:

| Production need | Replace or extend |
| --- | --- |
| Durable meetings and results | Replace the in-memory store with persistent session and artifact records |
| Concurrent users | Key sessions by authenticated user and application session ID |
| Reliable asynchronous processing | Enqueue verified webhook events and persist idempotency records |
| Hosted delivery | Replace the local tunnel with a stable HTTPS deployment |
| Long-term meeting data | Define retention, access control, deletion, and audit policies |
| Additional Recall workflows | Add only the APIs needed by a newly accepted product use case |

These are extension points, not incomplete features required by the current
demo.

## Verification model

The repository distinguishes three kinds of evidence:

1. `npm run check` verifies JavaScript syntax.
2. `npm test` verifies application behavior with controlled inputs and service
   doubles.
3. A live meeting verifies the real Recall request, webhook deliveries,
   recording, transcript, participation artifacts, and generated result.

Passing automated checks does not by itself prove that the live Recall workflow
or a specific meeting platform has been exercised successfully.
