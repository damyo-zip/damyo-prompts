# 다묘집사 프롬프트 보관함

인스타그램 프로필 링크에서 사용하는 초간단 정적 웹사이트입니다.

## 가장 먼저 바꿀 부분

`prompts.js`를 열고 아래 주소를 실제 주소로 바꾸세요.

```js
const SITE_CONFIG = {
  storeUrl: "https://smartstore.naver.com/실제주소",
  instagramUrl: "https://instagram.com/실제아이디"
};
```

## 새 프롬프트 추가

1. `images` 폴더에 썸네일 이미지를 넣습니다.
   - 권장 형식: WebP
   - 권장 비율: 4:5
   - 권장 용량: 장당 500KB 이하
2. `prompts.js`에서 기존 항목 하나를 복사합니다.
3. `id`, `title`, `category`, `image`, `description`, `prompt`를 바꿉니다.
4. 파일을 GitHub에 업로드합니다.

## GitHub Pages 배포

1. GitHub에서 새 Public repository를 만듭니다.
2. 이 폴더 안의 파일을 전부 repository 최상단에 업로드합니다.
3. repository의 `Settings` → `Pages`로 이동합니다.
4. `Build and deployment`의 Source를 `Deploy from a branch`로 선택합니다.
5. Branch는 `main`, 폴더는 `/(root)`를 고르고 Save를 누릅니다.
6. 잠시 후 표시되는 사이트 주소를 인스타그램 프로필에 넣습니다.

## 파일 구성

- `index.html`: 페이지 구조
- `style.css`: 디자인
- `app.js`: 검색, 필터, 팝업, 복사 기능
- `prompts.js`: 실제 프롬프트 목록과 스토어 주소
- `images/`: 썸네일 이미지

## 주의

클립보드 복사 기능은 HTTPS에서 가장 안정적으로 작동합니다. GitHub Pages 주소는 HTTPS를 지원합니다.
