# Kongi automation trigger

When the user says exactly or substantially **"콩이 자동 포스팅 실행"**, do not rebuild the automation and do not ask them to choose an idea, prompt, image, or caption.

Read `automation/README.md` and execute its runbook from start to finish. Start with the read-only Instagram Insights update and use its performance summary as planning context under the sample-size and exploration rules in the runbook. Use the Codex app's built-in image generation/editing capability with `automation/reference/kongi.png`; never use `OPENAI_API_KEY`, the OpenAI REST API, or an OpenAI SDK for image generation. Visually inspect every generated attempt and apply the score thresholds in the runbook. Stop only for a safety blocker such as a dirty Git worktree, missing credentials, insufficient API permissions, or three failed image attempts.

When the user says exactly or substantially **"콩이 인스타 성과 업데이트"**, read the same runbook and run `node automation/kongi.mjs insights`. This command is read-only toward Instagram: it collects Media Insights and updates local JSON metadata without generating content, changing the site, committing, pushing, or publishing.
