# Samsung Share Note

삼성물산 건설부문 반도체 생산설비(전기전자) 면접 준비를 위한 **공유 노트 + 작업 관리 웹사이트**입니다.

## 기능

- 대시보드: 전체 작업 / 진행 중 / 공유 노트 현황
- 공유 노트: 분류, 작성, 수정, 삭제, 내용 검색
- 작업 보드: 할 일 / 진행 중 / 완료, 담당자, 우선순위, 마감일
- 모바일 대응 레이아웃
- Firebase 연동 시 Google 로그인, 멤버 제한, Firestore 실시간 공유

> **현재 기본 상태는 체험 모드입니다.** `firebase-config.js`를 설정하기 전까지 모든 자료는 **각 사용자 브라우저의 localStorage에만** 저장됩니다. 브라우저/기기를 바꿔도 동기화되지 않습니다. 브라우저 데이터 삭제 시 사라질 수 있으므로 중요한 자료를 넣지 마세요.

## 배포 — GitHub Pages

1. GitHub 저장소의 **Settings → Pages**로 이동합니다.
2. **Build and deployment → Deploy from a branch**를 선택합니다.
3. **Branch: main / (root)**를 선택하고 Save 합니다.
4. 배포가 완료되면 `https://imhyeonwoo.github.io/Samsung-Share-Note/`로 접속합니다.

**주의:** GitHub Free에서는 일반적으로 Pages 게시를 위해 저장소를 **Public**으로 설정해야 합니다. 현재 저장소가 Private이라면 Settings → General → Danger Zone → Change repository visibility에서 변경하거나, Pages 지원 플랜을 이용하세요. Public 레포지토리에 올린 소스/설정값은 공개됩니다. 면접 내용이나 개인정보를 이 저장소의 파일로 커밋하지 말고 로그인 보호되는 Firestore에만 저장하세요.

## 팀 공동 작업 활성화 — Firebase

1. [Firebase Console](https://console.firebase.google.com/)에서 새 프로젝트를 만듭니다.
2. 프로젝트 설정 → **웹 앱 추가** → Firebase SDK 설정 객체(`firebaseConfig`)를 복사하여 저장소의 `firebase-config.js`를 수정합니다. Firebase의 웹 앱 설정은 공개용 식별자이지만 **서비스 계정 개인 키/관리자 토큰 등 비밀은 절대 업로드하지 마세요.**
3. **Authentication → Sign-in method → Google** 로그인 제공업체를 활성화합니다.
4. **Authentication → Settings → Authorized domains**에 `imhyeonwoo.github.io`를 추가합니다. 프로젝트 생성 환경에 따라 `localhost`도 추가해야 할 수 있습니다.
5. **Firestore Database → Create database**를 생성하고, **Rules** 탭에서 이 저장소의 `firestore.rules`를 그대로 붙여 넣어 **Publish**합니다. 테스트 모드의 전면 허용 규칙을 그대로 사용하지 마세요.
6. GitHub Pages 사이트를 열고 먼저 관리자 계정으로 로그인한 뒤 **워크스페이스 시작하기**를 누릅니다. 첫 생성자의 Google 계정이 관리자입니다. 다른 팀원은 아직 접근할 수 없습니다.
7. 로그인 후 **팀 설정**에서 함께 작업할 동료의 **Google 계정 이메일**을 추가합니다. 그 뒤 팀원은 자신의 Google 계정으로 로그인하여 공유 자료를 읽고 수정할 수 있습니다.

## 보안과 사용 범위

- Firestore의 **노트/작업 전체가 등록된 팀원 사이에서 공동 편집 가능**하며, 변경 기록/세밀한 권한 분리는 아직 구현되어 있지 않습니다.
- 최초 워크스페이스 생성자는 팀원 추가·삭제 가능, 일반 팀원은 자료 편집 가능.
- 팀원 이메일과 작업 내용은 Firebase 프로젝트에 저장되며, 이 앱에는 별도의 서버가 없습니다.
- Firestore 보안 규칙 배포와 초기 관리자 설정을 완료하기 전에는 팀 공유용으로 쓰지 마세요.
- 여러 브라우저에서 동시에 변경 시 마지막 저장 내용이 적용될 수 있습니다.
- `firebase-config.js`가 채워지면 기존 브라우저 체험 데이터는 자동으로 Firestore에 이관되지 않습니다.

## 파일 구조

```text
index.html           페이지 시작점
styles.css           반응형 화면 디자인
app.js               노트/작업 UI 및 데이터 처리
firebase-config.js   직접 입력할 Firebase 웹 앱 설정
firestore.rules      Firestore 접근 정책 (Firebase Console에 별도 적용)
```

## 개발

빌드 도구는 필요하지 않습니다. ES 모듈로 동작하므로 로컬에서는 `python -m http.server 8000` 실행 후 `http://localhost:8000`으로 확인하세요.

향후 기능 후보: 댓글/수정 이력, 파일 첨부, 마감일 알림, 프로젝트별 보드.
