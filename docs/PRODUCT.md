# Product

## Product

A Recall-powered application that turns one customer interview into a concise,
source-linked discovery brief.

A product manager, founder, or researcher sends a Recall Meeting Bot to an
interview. After the meeting, the application organizes the conversation into
customer pain points, desired outcomes, product requests, follow-ups, and open
questions. Every factual item remains traceable to a timestamped transcript
excerpt and the original recording.

## Problem

Important customer signals are often buried in interview recordings and
manually reconstructed from notes. Summaries can save time, but they are hard to
trust when the reader cannot see what the customer actually said.

The product reduces synthesis work without treating generated interpretation as
authoritative research.

## Workflow

1. The user provides a supported meeting URL, optionally customizes the bot name
   and temporary camera card, and chooses which discovery-brief sections to
   include.
2. A Recall Meeting Bot joins with the selected appearance, notifies
   participants in chat, and records the interview.
3. Verified Recall webhooks communicate capture and processing state.
4. After the recording is ready, the application requests a Recall
   post-meeting transcript.
5. The transcript's word-level timestamps are deterministically grouped into
   short evidence excerpts and converted into the selected sections of a
   structured customer-discovery brief.
6. The user reviews each signal beside timestamped evidence and recording
   playback.
7. The user can copy the reviewed brief as Markdown.

## Discovery brief

The user can select any combination of:

- A concise interview summary
- Customer pain points
- Desired outcomes
- Explicit product requests
- Follow-up commitments, including owners and dates only when stated
- Missing information and open questions

Timestamped source evidence and recording playback remain available regardless
of the selected sections. Section selection controls synthesis and presentation;
it does not reduce what Recall records or transcribes.

## Product guardrails

- The result is a reviewable brief, not authoritative customer research.
- Do not invent customer needs, requests, commitments, owners, or dates.
- Identify missing information instead of silently filling gaps.
- Every summary, signal, follow-up, and open question must cite transcript
  evidence.
- The meeting host remains responsible for participant notice and consent.
- An uploaded camera card is passed to Recall for the current bot and is not
  retained as an application asset.

## Recall capabilities

The core experience uses:

- Meeting Bot capture
- Bot and recording lifecycle webhooks
- Mixed-video recording
- Post-meeting transcription
- Speaker-attributed transcript timestamps
- Recording playback
- Automatic chat notification when the bot joins
- Per-meeting bot naming and static camera output

Additional Recall capabilities should be added only if they materially improve
this workflow.

## Current scope

The product intentionally supports one active, in-memory interview. It does not
require:

- Real-time transcription or coaching
- Authentication, teams, or collaborative editing
- Durable storage or concurrent meetings
- Persistent bot-branding profiles or an image library
- Calendar integration
- Desktop SDK capture
- CRM, repository, or research-platform publishing
- Automated aggregation across multiple interviews

## Success

A user can record a short customer interview and receive a readable discovery
brief whose important claims can be checked against the transcript and
recording.
