# Kongi automation trigger

When the user says exactly or substantially **"콩이 자동 포스팅 실행"**, do not rebuild the automation and do not ask them to choose an idea, prompt, image, or caption.

Read `automation/README.md` and execute its runbook from start to finish. Use the Codex app's built-in image generation/editing capability with `automation/reference/kongi.png`; never use `OPENAI_API_KEY`, the OpenAI REST API, or an OpenAI SDK for image generation. Visually inspect every generated attempt and apply the score thresholds in the runbook. Stop only for a safety blocker such as a dirty Git worktree, missing credentials, insufficient API permissions, or three failed image attempts.

