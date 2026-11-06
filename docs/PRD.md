# Mini YouTube Clone — Product Requirements Document

## 1. Overview

Mini YouTube Clone is a learning-oriented video platform where people upload videos, the platform processes them for smooth playback, and viewers watch, search, and get notified when new videos are ready.

The product is intentionally shaped like a real video-sharing service — upload, process, stream, search, notify — so that each stage of a video's journey can be built and understood in depth. The purpose is to learn how large-scale systems are designed by building a small but realistic one end to end.

Videos are publicly visible. Viewers can search for videos, watch them at a quality that adapts to their connection, and be notified when a creator they follow publishes something new.

## 2. Problem Statement

Learning system design from articles and diagrams rarely sticks. Concepts like adaptive streaming, asynchronous processing, event-driven search, caching, and autoscaling are easy to read about but hard to truly understand without building them.

There is no shortage of tutorials that build a toy app, but they usually stop at a single happy path and skip the parts that make a system real: what happens when work is slow, when a step fails, when load spikes, or when a new feature needs to react to things that already happened.

A learner needs a single, coherent product where each hard concept appears naturally and can be built, observed, broken, and fixed.

## 3. Goal / Vision

Learn how to design and operate a realistic distributed system by building a mini video platform one layer at a time, where every major system-design concept shows up as a concrete, working part of the product.

Success is understanding — being able to explain and reproduce how each part works, why it was built that way, and what happens when it is placed under stress or failure.

## 4. Target Users

- **Learner / Builder:** The person building the platform to understand system design in depth by implementing each layer and reasoning about its trade-offs.
- **Creator (in-product persona):** Uploads videos and expects them to become watchable and discoverable.
- **Viewer (in-product persona):** Browses, searches, and watches videos, and is notified about new content.

## 5. Key Features (MVP)

- Upload a video and have it processed into a smoothly playable form.
- Watch videos with playback quality that adapts to the viewer's connection.
- Browse publicly available videos.
- Search videos by title and description with relevant results.
- Receive a notification when a video a viewer is waiting for becomes ready.
- See video details such as title, description, and view count.

## 6. Out of Scope

- Payments, subscriptions, and monetization.
- Advertising.
- Recommendations and personalized feeds.
- Comments, likes, and social interactions beyond basic notifications.
- Live streaming.
- Content moderation and copyright enforcement.
- Mobile applications.

## 7. Success Metrics

Primary (learning outcomes):

- Each targeted system-design concept is implemented and can be observed working end to end.
- The system's behavior under load and failure can be reproduced and explained (for example, processing work backing up and the system scaling to catch up).
- A new feature that reacts to past events can be added and backfilled from history without changing the parts that produced those events.

Secondary (product-style signals that prove the concepts work):

- Uploaded videos reliably become watchable.
- Videos play back smoothly and adapt to changing connection quality.
- Searches return relevant videos quickly.
- Viewers are notified when a video becomes ready.

## 8. Risks and Assumptions

- **Risk:** Building every concept at once leads to an unfinished, hard-to-understand system. Mitigated by building in reviewable layers, one at a time.
- **Risk:** Processing videos is slow and resource-heavy, which can make the system feel stuck if not handled asynchronously.
- **Risk:** Keeping search results and counts in sync with the source of truth can drift or lag.
- **Assumption:** Videos are public; no private or access-controlled content is required for the learning goals.
- **Assumption:** Realistic open-source tools are an acceptable and preferable substitute for managed cloud services while learning.
- **Assumption:** A small but realistic data set is enough to demonstrate scale behavior through load testing, without needing real-world traffic.

## 9. Open Questions

- What information should a creator provide when uploading a video (title, description, tags, thumbnail)?
- Is sign-in required to upload, to watch, or to search?
- Which playback qualities should be supported, and should the lowest quality always be available first?
- How should a video be presented while it is still being processed and not yet watchable?
- How should search behave for videos that have just been uploaded but not yet processed?
- What should a viewer "follow" in order to be notified — a creator, a specific video, or both?
- How accurate do view counts need to be, and is a short delay acceptable?
- What is the largest video size and longest duration the platform should accept?
- How long should processed videos and their data be retained?
- What is the minimum set of concepts that must work for the learning goal to be considered met?
