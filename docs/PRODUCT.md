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
   and temporary camera card, chooses which standard discovery-brief sections
   to include, and can define one custom section for that meeting.
2. A Recall Meeting Bot joins with the selected appearance, notifies
   participants in chat, and records the interview.
3. Verified Recall webhooks communicate capture and processing state.
4. After the recording is ready, the application requests a Recall
   post-meeting transcript and reads Recall's meeting-participation artifacts.
5. The application presents meeting duration, attendees, attendance windows,
   and speaking activity as meeting context outside the generated brief.
6. The transcript's word-level timestamps are deterministically grouped into
   short evidence excerpts and converted into the selected sections of a
   structured customer-discovery brief.
7. The user reviews each signal beside timestamped evidence and recording
   playback.
8. The user can copy the reviewed brief as Markdown.

## Meeting participation

The result includes a separate, non-generated meeting context card. It shows:

- Recorded duration and attendee count
- Participant names and the meeting host when Recall identifies one
- Total attendance time and separate attendance windows after a leave/rejoin
- Speaking time and each participant's share of captured speaking activity

This information comes from Recall's participant list, participant events, and
speaker timeline. It is not included in the discovery brief or copied Markdown.
If attendance events are incomplete, the application says that timing is
unavailable instead of estimating it. If the participation artifact is
unavailable, brief generation continues.

## Discovery brief

The user can select any combination of:

- A concise interview summary
- Customer pain points
- Desired outcomes
- Explicit product requests
- Follow-up commitments, including owners and dates only when stated
- Missing information and open questions

The user can also add one custom section with a name and extraction guidance.
Custom output uses the same source-linked bullet format as the standard signal
sections. A brief can contain only the custom section, but arbitrary schemas,
tables, field types, and multiple custom sections are outside the current scope.

Timestamped source evidence and recording playback remain available regardless
of the selected sections. Section selection controls synthesis and presentation;
it does not reduce what Recall records or transcribes.

## Product guardrails

- The result is a reviewable brief, not authoritative customer research.
- Do not invent customer needs, requests, commitments, owners, or dates.
- Identify missing information instead of silently filling gaps.
- Every summary, signal, follow-up, and open question must cite transcript
  evidence.
- Every custom-section item must cite transcript evidence, and the custom
  definition cannot override the brief's evidence or output rules.
- The meeting host remains responsible for participant notice and consent.
- An uploaded camera card is passed to Recall for the current bot and is not
  retained as an application asset.
- Participation analytics describe captured meeting activity; they do not
  measure engagement, influence, or performance.

## Recall capabilities

The core experience uses:

- Meeting Bot capture
- Bot and recording lifecycle webhooks
- Mixed-video recording
- Post-meeting transcription
- Speaker-attributed transcript timestamps
- Participant list, join/leave events, and speaker timeline
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

A user can record a short customer interview, understand who participated, and
receive a readable discovery brief whose important claims can be checked
against the transcript and recording.
