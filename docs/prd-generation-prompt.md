# PRD Generation Prompt (Reusable)

Use this prompt to generate a Product Requirements Document for any project.
Replace the **Brainstorming summary** at the bottom with your own, then run it.

---

## Prompt

Act as an experienced product manager.

Below is the summary of a brainstorming session for a product called **<PRODUCT_NAME>**.
Write a Product Requirements Document (PRD) in Markdown with exactly these sections:

1. Overview
2. Problem Statement
3. Goal / Vision
4. Target Users
5. Key Features (MVP) - a short list, one line each
6. Out of Scope
7. Success Metrics
8. Risks and Assumptions
9. Open Questions

Rules:
- Do not include technical details, architecture, or tech stack.
- Do not write detailed requirements, user stories, or acceptance criteria yet.
- Do not invent features that are not in the summary. If something is unclear or missing, put it under Open Questions instead of guessing.
- Keep it concise: one or two pages at most. Plain language, no marketing fluff.
- Before writing, ask me any clarifying questions you have, one at a time. Once I answer, generate the full document.
- Save the result as `docs/PRD.md`.

## Brainstorming summary

**What we are going to build**
<One or two sentences describing the product.>

**Vision / goal**
<The core outcome the product should drive.>

**Problem**
<What is broken today and why existing options do not solve it.>

**Target users**
- <User type 1: who they are and what they want>
- <User type 2: who they are and what they want>

**MVP scope**
- <Feature 1>
- <Feature 2>
- <Feature 3>

**Out of scope for now**
<Things explicitly not being built yet.>

**Success signal**
<The single behavior that tells you it is working.>

---

## Worked Example — Mini YouTube Clone (learning-framed)

This is the exact summary used to generate this project's `docs/PRD.md`.

**What we are going to build**
A mini YouTube clone: upload videos, process them for smooth playback, watch with
adaptive quality, search videos, and get notified when a video is ready. It is shaped
like a real video platform so each stage can be built and understood in depth.

**Vision / goal**
Learn how to design and operate a realistic distributed system by building a mini video
platform one layer at a time, where every major system-design concept shows up as a
concrete, working part of the product.

**Problem**
Learning system design from articles rarely sticks. Tutorials stop at a single happy path
and skip the parts that make a system real: slow work, failures, load spikes, and features
that must react to things that already happened. A learner needs one coherent product
where each hard concept appears naturally and can be built, observed, broken, and fixed.

**Target users**
- Learner / Builder: builds each layer to understand system design and its trade-offs.
- Creator (in-product): uploads videos and expects them to become watchable and discoverable.
- Viewer (in-product): browses, searches, watches, and is notified about new content.

**MVP scope**
- Upload a video and have it processed into a smoothly playable form.
- Watch videos with quality that adapts to the connection.
- Browse public videos.
- Search videos by title and description.
- Get notified when a video becomes ready.

**Out of scope for now**
Payments, ads, recommendations, comments/likes, live streaming, moderation, mobile apps.

**Success signal**
Each targeted system-design concept is implemented and observable end to end, and its
behavior under load and failure can be reproduced and explained.

---

## Notes on framing

- **Product-framed PRD:** write it as a genuine product for end users. Keep the learning
  intent out of the PRD and in a separate learning/architecture doc.
- **Learning-framed PRD (this project):** the stated goal is learning, but the PRD still
  stays concept-level and free of tech-stack/architecture detail. Name capabilities
  (streaming, search, notifications), not tools (Kafka, NestJS, kind). The "how" lives in
  `docs/LEARNING-GOALS.md` and the architecture decision log.
