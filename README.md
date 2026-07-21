# 다묘집사 프롬프트 보관함

인스타그램 프로필 링크에서 사용하는 정적 웹사이트입니다.

이번 버전부터 다음 기능을 지원합니다.

- 게시글 한 개에 이미지 여러 장 등록
- 상세화면 이미지 캐러셀, 썸네일, 좌우 스와이프
- 이미지마다 서로 다른 장면별 프롬프트 등록
- 공통 프롬프트 + 장면별 프롬프트 자동 결합
- 현재 이미지 프롬프트 복사
- 시리즈 전체 프롬프트 한 번에 복사
- 로컬 게시글 등록기로 이미지 저장과 `prompts.js` 수정 자동화
- 기존 `image` 형식 게시글과 새 `images` 형식 게시글 동시 지원

## 가장 쉬운 게시글 등록 방법

Chrome 또는 Edge에서 사이트 폴더 안의 `post-maker.html`을 엽니다.

1. **사이트 폴더 선택**을 누릅니다.
2. `index.html`, `prompts.js`, `images` 폴더가 있는 최상위 폴더를 선택합니다.
3. 제목, 카테고리, 소개와 공통 프롬프트를 입력합니다.
4. 이미지 한 장 또는 여러 장을 추가합니다.
5. 각 이미지에 장면 제목, 설명, 장면별 프롬프트를 입력합니다.
6. 화살표 또는 드래그로 이미지 순서를 정합니다.
7. **게시글 저장**을 누릅니다.
8. GitHub Desktop에서 변경사항을 확인하고 Commit → Push 합니다.

게시글 번호는 기존 마지막 번호 다음으로 자동 생성됩니다. 예를 들어 현재 마지막 게시글이 `P-018`이면 새 게시글은 `P-019`가 됩니다.

이미지 파일명도 자동으로 다음처럼 정리됩니다.

```text
images/p019-01.jpg
images/p019-02.jpg
images/p019-03.jpg
```

## 직접 저장이 작동하지 않을 때

`post-maker.html`에서 **수동 저장 파일 받기**를 누릅니다.

- 내려받은 `prompts.js`는 사이트 최상위 폴더의 기존 파일에 덮어씁니다.
- 함께 내려받은 이미지들은 `images` 폴더에 넣습니다.
- 브라우저가 여러 파일 다운로드 허용 여부를 물으면 허용합니다.

## 새 캐러셀 데이터 형식

등록기가 자동으로 생성하므로 직접 작성할 필요는 없습니다.

```js
{
  id: "P-019",
  title: "여름휴가 고양이 시리즈",
  category: "계절",
  cover: "images/p019-01.jpg",
  description: "우리 고양이 사진을 넣어주세요.",
  prompt: "모든 이미지에 공통으로 적용할 프롬프트",
  images: [
    {
      src: "images/p019-01.jpg",
      title: "바닷가 피서",
      caption: "라탄 바구니에서 얼굴만 빼꼼 내민 고양이",
      prompt: "첫 번째 장면에만 적용할 프롬프트"
    },
    {
      src: "images/p019-02.jpg",
      title: "계곡 피서",
      caption: "차가운 계곡물에 앞발을 담근 고양이",
      prompt: "두 번째 장면에만 적용할 프롬프트"
    }
  ]
}
```

공통 프롬프트가 필요 없으면 비워둘 수 있습니다. 반대로 모든 이미지가 동일한 프롬프트를 사용한다면 장면별 프롬프트를 비우고 공통 프롬프트만 입력해도 됩니다.

## 기존 게시글 호환

기존 형식은 수정하지 않아도 그대로 작동합니다.

```js
{
  id: "P-018",
  title: "꽃화보냥이",
  category: "계절",
  image: "images/p018.jpg",
  description: "우리 고양이 사진을 넣어주세요.",
  prompt: "기존 프롬프트"
}
```

## 사이트 주소 설정

`prompts.js`의 아래 값을 실제 주소로 유지합니다.

```js
const SITE_CONFIG = {
  storeUrl: "https://smartstore.naver.com/실제주소",
  instagramUrl: "https://instagram.com/실제아이디"
};
```

등록기는 선택한 사이트 폴더의 `SITE_CONFIG`를 읽어서 그대로 보존합니다.

## GitHub Pages 배포

1. GitHub에서 Public repository를 준비합니다.
2. 이 폴더 안의 파일을 repository 최상단에 둡니다.
3. repository의 `Settings` → `Pages`로 이동합니다.
4. `Build and deployment`의 Source를 `Deploy from a branch`로 선택합니다.
5. Branch는 `main`, 폴더는 `/(root)`를 고르고 Save를 누릅니다.
6. GitHub Desktop에서 변경사항을 Push하면 사이트가 갱신됩니다.

## 파일 구성

- `index.html`: 공개 페이지 구조
- `style.css`: 공개 페이지 디자인과 캐러셀 스타일
- `app.js`: 검색, 필터, 캐러셀, 프롬프트 복사 기능
- `prompts.js`: 실제 게시글 데이터와 스토어 주소
- `post-maker.html`: 로컬 게시글 등록 화면
- `post-maker.css`: 등록기 디자인
- `post-maker.js`: 이미지 저장과 `prompts.js` 자동 갱신
- `images/`: 게시글 이미지

## 주의

- `post-maker.html`은 사이트 방문자를 위한 페이지가 아니라 운영자용 등록기입니다.
- 폴더 직접 저장 기능은 Chrome 또는 Edge에서 사용하는 것이 가장 안정적입니다.
- 클립보드 복사 기능은 HTTPS인 GitHub Pages에서 가장 안정적으로 작동합니다.
