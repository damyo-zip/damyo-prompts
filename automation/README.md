# 콩이 Instagram 자동 포스팅 MVP

사용자의 운영 명령은 하나입니다.

```text
콩이 자동 포스팅 실행
```

이 명령을 받은 Codex는 아래 절차를 중간 승인 없이 끝까지 수행합니다. 이미지 생성에는 Codex 앱의 기본 이미지 생성/편집 기능만 사용합니다. `OPENAI_API_KEY`, OpenAI REST API, OpenAI SDK를 사용하거나 요구하지 않습니다.

## 최초 설정

1. `.env.example`을 `.env`로 복사합니다.
2. Instagram 전문 계정과 Meta 앱을 연결합니다.
3. Instagram Login 방식의 사용자 ID와 장기 액세스 토큰을 `.env`의 `INSTAGRAM_USER_ID`, `INSTAGRAM_ACCESS_TOKEN`에 넣습니다.
4. 앱/토큰에 `instagram_business_basic`, `instagram_business_content_publish` 권한이 있어야 합니다.
5. 첫 검증은 `DRY_RUN=true`로 수행하고, 실제 운영 때만 `DRY_RUN=false`로 바꿉니다.

비밀값은 `.env`에만 저장되며 `.gitignore`로 제외됩니다.

## Codex 실행 절차

### 1. 안전 점검과 실행 ID 생성

```powershell
node automation/kongi.mjs preflight
```

Git worktree가 깨끗하지 않으면 즉시 중단합니다. 성공 출력의 `run_id`, `post_id`, `run_dir`, 기존 강아지 게시물 요약을 사용합니다. 완료되지 않은 실행이 있으면 같은 run을 이어가므로 중복 게시하지 않습니다.

### 2. 콘텐츠 기획과 초안

Codex가 기존 강아지 게시물의 `title`, `category`, `description`, `prompt`를 비교하고 후보를 내부 평가한 뒤 하나를 자동 선정합니다. `automation/draft.example.json` 형식으로 `<run_dir>/draft.json`을 만듭니다.

공유용 `prompt`에는 “콩이”라는 이름을 넣지 않고 다음을 모두 포함합니다.

- 동일 개체와 털색·무늬·얼굴형·눈·코·입·귀 유지
- 구체적 장면, 카메라 구도, 조명, 배경, 분위기
- 반려동물이 주인공임을 명시
- 신체·눈·귀·발 왜곡 방지
- 글자, 워터마크, SNS UI 제외
- Instagram 세로 4:5

`generation_prompt`는 Codex 내부 생성용이므로 콩이의 이름과 기준 사진 특징을 포함해도 됩니다. `caption`은 짧은 훅, 콩이 장면 설명, 프로필 링크 안내, 관련 해시태그 소수로 작성합니다.

### 3. Codex 기본 이미지 생성과 시각 검수

`automation/reference/kongi.png`를 reference image로 사용하여 Codex 앱의 기본 이미지 생성 기능으로 세로 4:5 이미지를 생성합니다. 생성물을 `<run_dir>/attempt-1.*`에 복사한 뒤 직접 열어 봅니다.

각 시도마다 `automation/review.example.json` 형식의 `<run_dir>/review-N.json`을 기록합니다. 다음 중 하나면 문제를 생성 지침에 반영해 다시 생성합니다.

```text
identity_score < 75
visual_quality_score < 80
concept_score < 80
fatal_issue == true
```

최대 3회입니다. 모두 실패하면 다음 명령으로 실패를 기록하고 사이트·Git·Instagram을 건드리지 않습니다.

```powershell
node automation/kongi.mjs fail --run-id <run_id> --reason "세 번의 이미지 검수 실패"
```

통과 이미지는 다음 명령으로 1080×1350 JPEG를 준비합니다. 원본 비율이 4:5에서 2% 넘게 벗어나면 자동 크롭하지 않고 실패합니다.

```powershell
powershell -ExecutionPolicy Bypass -File automation/prepare-image.ps1 `
  -InputPath <run_dir>/attempt-N.png `
  -OutputPath <run_dir>/attempt-N-final.jpg
```

변환된 JPEG도 Codex가 다시 열어 얼굴, 귀, 발과 주요 소품이 프레임 안에 있는지 확인한 뒤 `complete`에 전달합니다.

### 4. 완료 파이프라인

```powershell
node automation/kongi.mjs complete --draft <run_dir>/draft.json --image <run_dir>/attempt-N-final.jpg --review <run_dir>/review-N.json
```

`DRY_RUN=true`에서는 가상 게시물과 모든 데이터 검증 결과만 `<run_dir>`에 저장합니다. `prompts.js`, Git, 공개 사이트, Instagram은 변경하지 않습니다.

`DRY_RUN=false`에서는 검수 통과 후에만 다음 순서로 진행합니다.

1. `prompts.js` 타임스탬프 백업
2. `images/pXXX-01.jpg` 복사 및 `PROMPTS` 맨 앞 추가
3. JavaScript 문법, 배열, ID, 이미지 경로, 기존 개수 검증
4. 자동 생성 파일만 `git add`, commit, push
5. GitHub Pages 또는 `PUBLIC_SITE_URL`에서 공개 이미지 HTTP 200 확인
6. Meta `/media` 컨테이너 생성, 상태 확인, `/media_publish` 게시
7. media ID와 commit을 `automation/state.json` 및 JSONL 로그에 저장

공개 배포가 확인되지 않거나 Meta 설정/권한이 없으면 Instagram 게시 전에 안전하게 멈춥니다. 이미 `instagram_published`인 같은 run은 다시 게시하지 않습니다.
Git commit 이후 네트워크 오류나 Meta 자격증명 누락으로 멈춘 같은 run을 다시 실행하면 저장된 단계부터 이어가며 사이트 게시물을 중복 생성하지 않습니다.


## 결정론적 검증

```powershell
npm run kongi:test
```

검증 항목은 `prompts.js` 파싱, 전체/동물별 개수, 다음 ID, 중복 ID, 이미지 경로, 공유 프롬프트 금칙어와 필수 지침, 이미지 검수 임계값, Git 변경 범위입니다.

## 런타임 파일

- `automation/reference/kongi.png`: 수정하지 않는 콩이 canonical reference
- `automation/runs/<run_id>/`: 초안, 생성 시도, 검수, 가상 게시 데이터
- `automation/backups/<timestamp>/`: 실제 수정 전 백업
- `automation/logs/YYYY-MM-DD.jsonl`: 단계별 실행 로그
- `automation/state.json`: 최신 run 단계, post ID, commit, Instagram media ID

런타임 파일과 `.env`는 Git에 포함되지 않습니다.
