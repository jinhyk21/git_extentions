# DEV AUTO-TOOL TEST REPORT

- **Chức năng:** Git Workspace Pro 0.2.1 — Pull, Merge, Rebase, Continue/Abort/Skip và IntelliJ-style Conflict Editor
- **Ngày test:** 26/08/2026
- **Môi trường test:** Local Linux x64
- **VS Code:** 1.125.1
- **Git:** Git CLI từ môi trường local
- **Code branch:** `rest`
- **Test data:** Temporary Git repositories được tạo cô lập trong `/tmp`

## 1. Kết quả Smoke / Crash Test

**PASS**

- TypeScript compile: PASS
- ESLint: PASS
- Mocha unit/integration/system: **124/124 PASS**
- Không có unhandled process error trong test run
- Đã chạy thật các luồng:
  - Pull fast-forward
  - Pull divergent bị từ chối với ff-only
  - Pull rebase
  - Pull merge
  - Merge conflict → resolve → continue
  - Merge abort
  - Rebase conflict → resolve → continue
  - Rebase skip
  - Rebase abort
  - Modify/delete conflict
  - Binary conflict

## 2. Kết quả UI/UX

**PASS**

- Static webview checks: **5/5 PASS**
- Desktop render 1440×900: PASS
- Narrow/mobile breakpoint: PASS
- Horizontal overflow: Không
- Missing/zero-size buttons: Không
- JavaScript `error`: Không
- `unhandledrejection`: Không
- CSP/nonce: PASS
- XSS payload escaping: PASS

Evidence:

- `qa-artifacts/conflict-editor-desktop-1440x900.png`
- `qa-artifacts/conflict-editor-mobile-390x844.png`
- `qa-artifacts/ui-report.json`

## 3. Kết quả Performance

**PASS**

| Hạng mục | Kết quả | Tiêu chuẩn |
|---|---:|---:|
| Git status p95 | 23.98 ms | < 300 ms |
| History p95 | 6.63 ms | < 500 ms |
| Scan 100 repositories | 22.37 ms | < 15,000 ms |
| Memory RSS | 55.48 MB | < 300 MB |

Không có database/API HTTP trong extension; tiêu chuẩn latency được áp dụng vào Git command, history và repository scan.

## 4. Build & Package

- VSIX: `git-workspace-pro-0.2.1.vsix`
- Archive integrity: PASS
- Isolated install: PASS
- Installed identifier: `jinhy.git-workspace-pro@0.2.1`
- Lỗi phát hiện trong QA: `qa-artifacts/` từng bị đóng gói nhầm vào VSIX.
- Xử lý: Đã thêm `qa-artifacts/` vào `.vscodeignore` và đóng gói lại.
- Edge case phát hiện: Double-click Save và hai Git operation đồng thời có thể chạy lặp.
- Xử lý: Đã thêm save lock, disable Save ngay sau click và repository operation lock.
- UI issue phát hiện: Toolbar/hunk actions bị chật ở narrow viewport.
- Xử lý: Đã chuyển toolbar và conflict actions sang responsive grid hai cột, bổ sung theme fallback.

## 5. Tổng kết

- Kết quả kiểm thử chức năng: **100% PASS**
- Kết quả UI/UX automation: **PASS**
- Kết quả hiệu năng: **PASS**
- Kết quả package/install: **PASS**
- Trạng thái: **ĐÃ CHẠY ĐỦ TOOL — READY FOR QA**

Lệnh tái hiện toàn bộ:

```bash
npm run qa:all
```
