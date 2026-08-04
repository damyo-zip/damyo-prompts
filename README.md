# 반려동물 프롬프트 통합 보관함

고양이·강아지·햄스터 인스타그램 계정에서 함께 사용하는 정적 웹사이트입니다. 사이트와 게시글 등록기는 하나만 관리하고, 주소의 `animal` 값에 따라 해당 동물 프롬프트만 보여줍니다.

## 동물별 전용 주소

같은 사이트 주소 뒤에 다음 값을 붙여 각 인스타그램 프로필에 연결하세요.

```text
고양이: index.html?animal=cat
강아지: index.html?animal=dog
햄스터: index.html?animal=hamster
```

GitHub Pages 실제 주소가 `https://example.github.io/prompts/`라면 다음처럼 사용합니다.

```text
https://example.github.io/prompts/?animal=cat
https://example.github.io/prompts/?animal=dog
https://example.github.io/prompts/?animal=hamster
```

동물별 전용 주소로 들어온 방문자에게는 해당 동물의 게시물만 보이며, 다른 동물 탭은 표시되지 않습니다. 파라미터가 없는 기본 주소로 접속했을 때만 운영 확인용으로 세 동물 탭이 모두 표시됩니다.

## 주요 기능

- 기존 고양이 게시글 21개 보존
- 동물별 인스타 전용 링크에서는 다른 동물 탭 자동 숨김
- 파라미터 없는 기본 주소에서는 세 동물 탭 통합 확인
- 동물별 카테고리와 검색 결과 분리
- 동물별 전용 주소 지원
- 동물별 제목·소개·사용법·푸터 문구 자동 변경
- 동물별 선택적 제휴 상품 링크 설정
- 게시글 상단 고정 기능
- 단일 이미지와 캐러셀 게시글 지원
- 이미지별 장면 프롬프트 및 공통 프롬프트 지원
- 로컬 등록기에서 동물 종류를 선택해 바로 저장

## 게시글 등록 방법

Chrome 또는 Edge에서 사이트 폴더 안의 `post-maker.html`을 엽니다.

1. **사이트 폴더 선택**을 누릅니다.
2. `index.html`, `prompts.js`, `images` 폴더가 있는 최상위 폴더를 선택합니다.
3. 고양이·강아지·햄스터 중 하나를 선택합니다.
4. 제목, 카테고리, 소개와 프롬프트를 입력합니다.
5. 이미지 한 장 또는 여러 장을 추가합니다.
6. 필요한 경우 **이 동물 탭의 맨 위에 고정**을 체크합니다.
7. **게시글 저장**을 누릅니다.
8. GitHub Desktop에서 변경사항을 확인하고 Commit → Push 합니다.

동물을 바꾸면 해당 동물에서 사용한 카테고리만 자동완성 목록에 표시됩니다. 게시글 번호는 세 계정 전체에서 공통으로 증가하므로 이미지 파일명이 겹치지 않습니다.

```text
P-025 → images/p025-01.jpg
P-026 → images/p026-01.jpg
```

## 게시글 데이터 형식

등록기가 자동 생성하므로 직접 작성할 필요는 없습니다.

```js
{
  id: "P-025",
  animal: "dog",
  pinned: false,
  title: "손가락 끝 요정견",
  category: "귀여운 이미지",
  cover: "images/p025-01.jpg",
  description: "만들 때마다 다른 코스튬",
  prompt: "모든 이미지에 공통으로 적용할 프롬프트",
  images: [
    {
      src: "images/p025-01.jpg",
      title: "벌 코스튬",
      caption: "손가락 끝에 앉은 작은 강아지",
      prompt: "이 장면에만 적용할 프롬프트"
    }
  ]
}
```

`animal` 값은 다음 셋 중 하나입니다.

```text
cat   고양이
dog   강아지
small 햄스터
```

기존 단일 이미지 형식도 계속 지원합니다.

## 동물별 문구와 링크 설정

`prompts.js` 맨 위의 `SITE_CONFIG.animals`에서 수정합니다.

```js
const SITE_CONFIG = {
  defaultAnimal: "cat",
  animals: {
    cat: {
      label: "고양이",
      title: "고양이 무료 프롬프트",
      instagramUrl: "https://instagram.com/고양이계정",
      chatgptUrl: "https://chatgpt.com/download/",
      affiliateUrl: "제휴 상품 링크",
      affiliateLabel: "고양이 굿즈 보러가기"
    },
    dog: {
      label: "강아지",
      instagramUrl: "https://instagram.com/강아지계정",
      chatgptUrl: "https://chatgpt.com/download/",
      affiliateUrl: "강아지용 제휴 상품 링크",
      affiliateLabel: "강아지 굿즈 보러가기"
    },
    small: {
      label: "햄스터",
      instagramUrl: "https://instagram.com/햄스터계정",
      chatgptUrl: "https://chatgpt.com/download/",
      affiliateUrl: "햄스터용 제휴 상품 링크",
      affiliateLabel: "햄스터 굿즈 보러가기"
    }
  }
};
```

`affiliateUrl`이 비어 있으면 공개 상세화면에서 제휴 버튼은 자동으로 숨겨집니다.

## 직접 저장이 작동하지 않을 때

`post-maker.html`에서 **수동 저장 파일 받기**를 누릅니다.

- 내려받은 `prompts.js`는 사이트 최상위 폴더의 기존 파일에 덮어씁니다.
- 함께 내려받은 이미지들은 `images` 폴더에 넣습니다.
- 브라우저가 여러 파일 다운로드 허용 여부를 물으면 허용합니다.

## GitHub Pages 배포

1. 수정된 파일을 현재 저장소에 덮어씁니다.
2. GitHub Desktop에서 변경사항을 확인합니다.
3. Commit 후 Push합니다.
4. 각 인스타 프로필에는 위의 동물별 전용 주소를 입력합니다.

## 파일 구성

- `index.html`: 공개 페이지 구조
- `style.css`: 공개 페이지 디자인
- `app.js`: 동물/카테고리 필터, 캐러셀, 복사 기능
- `prompts.js`: 사이트 설정과 모든 동물 게시글 데이터
- `post-maker.html`: 통합 게시글 등록 화면
- `post-maker.css`: 등록기 디자인
- `post-maker.js`: 이미지 저장과 `prompts.js` 자동 갱신
- `images/`: 모든 동물 게시글 이미지

## 주의

- `post-maker.html`은 방문자용이 아니라 운영자용입니다.
- 폴더 직접 저장 기능은 Chrome 또는 Edge에서 가장 안정적입니다.
- 공개 사이트의 클립보드 복사는 HTTPS인 GitHub Pages에서 가장 안정적으로 작동합니다.
- 강아지와 햄스터 탭은 등록기에서 게시물을 추가하면 바로 표시됩니다.
