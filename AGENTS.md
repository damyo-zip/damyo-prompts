# Multi-account pet automation triggers

When the user says exactly or substantially **"콩이 자동 포스팅 실행"**, do not rebuild the automation and do not ask them to choose an idea, prompt, image, or caption.

Read `automation/README.md` and execute the `kongi` account runbook from start to finish. Validate Kongi's fixed Instagram CTA before any site mutation. Start with the read-only Instagram Insights update and use only Kongi's performance summary as planning context. Use the Codex app's built-in image generation/editing capability with `automation/reference/kongi.png`; never use `OPENAI_API_KEY`, the OpenAI REST API, or an OpenAI SDK for image generation. Visually inspect every generated attempt and apply the score thresholds in the runbook. Stop only for a safety blocker such as a dirty Git worktree, missing or invalid account CTA, missing credentials, insufficient API permissions, or three failed image attempts.

When the user says exactly or substantially **"콩이 인스타 성과 업데이트"**, read the same runbook and run `node automation/run.mjs insights kongi`. This command is read-only toward Instagram: it collects Kongi Media Insights and updates only Kongi's local JSON metadata without generating content, changing the site, committing, pushing, or publishing.

When the user says exactly or substantially **"햄님이 자동 포스팅 실행"**, read `automation/README.md` and execute the `hamnimi` account runbook from start to finish. Validate Hamnimi's fixed Instagram CTA before any site mutation. Use only Hamnimi's content history, reference image at `automation/reference/hamnimi.png`, credentials, state, and Insights. Favor miniature scenes, scale contrast, human-like situations, and candid realistic photos under the exploration rules. Use the Codex app's built-in image generation/editing capability and the same visual review thresholds. Do not post with Kongi credentials or CTA and do not ask the user to choose an idea.

When the user says exactly or substantially **"햄님이 인스타 성과 업데이트"**, run `node automation/run.mjs insights hamnimi`. Do not generate content or publish, and never fall back to Kongi credentials.
