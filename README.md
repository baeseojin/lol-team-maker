# LoL 내전 팀 메이커 - GitHub Pages 버전

Riot API 없이 동작하는 정적 사이트 버전입니다.  
GitHub Pages에 그대로 올리면 누구나 접속할 수 있습니다.

## 기능

- 유저 직접 추가
- 티어/점수/라인/승패 직접 수정
- 입력값 자동 저장(localStorage)
- 사이트를 껐다 켜도 같은 브라우저에서 데이터 유지
- 라인 기반 밸런스 팀짜기
- 랜덤 / 밸런스 / 라인 우선 / 팀장 모드
- 즐겨찾기, 제외 기능, 중복 닉네임 방지
- 승률 기반 보정 점수
- 드래그 앤 드롭 팀 이동
- 팀 저장 / 불러오기
- 디스코드 복사용 결과 생성
- 깔끔한 다크 UI

## GitHub Pages 배포 방법

1. 이 ZIP 파일 압축 해제
2. `index.html`, `style.css`, `app.js`, `.nojekyll`, `README.md`를 GitHub 레포지토리에 업로드
3. GitHub 레포지토리에서 `Settings` → `Pages`
4. `Deploy from a branch` 선택
5. Branch를 `main`, 폴더를 `/root`로 선택
6. 저장 후 생성된 주소로 접속

## 저장 방식

서버가 없는 GitHub Pages용이므로 데이터는 브라우저 localStorage에 저장됩니다.

주의:
- 같은 PC/같은 브라우저에서는 유지됩니다.
- 다른 브라우저나 다른 PC에서는 데이터가 공유되지 않습니다.
- 브라우저 데이터 삭제 시 저장값도 삭제될 수 있습니다.
