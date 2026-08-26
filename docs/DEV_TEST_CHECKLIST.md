# Self-Test Checklist: Git Workspace Pro 0.2.1

> Ngày thực hiện: 26/08/2026  
> Môi trường: Local Linux x64, Node.js 20+, Git CLI, VS Code 1.125.1, Google Chrome Headless  
> Phạm vi: Repository explorer, pull, merge, rebase, operation control và conflict editor

## 1. Happy Path

- [x] **TC-HP-001 — Phát hiện repository đơn**
  - Input: Workspace chứa một thư mục `.git`.
  - Thực hiện: Chạy `RepositoryScanner.scan`.
  - Kỳ vọng: Trả đúng một repository và đúng root path.
  - Evidence: `RepositoryScanner` integration test.

- [x] **TC-HP-002 — Phát hiện nested repository**
  - Input: Repository cha chứa repository con.
  - Thực hiện: Scan workspace.
  - Kỳ vọng: Repository con có `isNested=true` và đúng `parentId`.

- [x] **TC-HP-003 — Stage, unstage và commit**
  - Input: File mới trong working tree.
  - Thực hiện: Stage, unstage, stage lại và commit.
  - Kỳ vọng: Trạng thái index và commit history cập nhật đúng.

- [x] **TC-HP-004 — Stash push/pop**
  - Input: File tracked có thay đổi.
  - Thực hiện: Stash push rồi stash pop.
  - Kỳ vọng: Working tree sạch sau push và thay đổi trở lại sau pop.

- [x] **TC-HP-005 — Pull fast-forward**
  - Input: Remote đi trước local, local không có commit riêng.
  - Thực hiện: Pull với `ff-only`.
  - Kỳ vọng: Local cập nhật đúng, không tạo merge commit.

- [x] **TC-HP-006 — Pull rebase**
  - Input: Local và remote đều có commit riêng, không conflict.
  - Thực hiện: Pull với strategy `rebase`.
  - Kỳ vọng: Giữ lịch sử tuyến tính và có đủ thay đổi hai phía.

- [x] **TC-HP-007 — Pull merge**
  - Input: Local và remote divergent, không conflict.
  - Thực hiện: Pull với strategy `merge`.
  - Kỳ vọng: Tạo merge commit hai parent.

- [x] **TC-HP-008 — Merge conflict và Continue**
  - Input: Hai branch sửa cùng dòng.
  - Thực hiện: Merge, resolve, stage, chạy Continue.
  - Kỳ vọng: Nhận diện operation `merge`, hết conflict và hoàn tất merge commit.

- [x] **TC-HP-009 — Merge Abort**
  - Input: Merge đang dừng vì conflict.
  - Thực hiện: Chạy Abort.
  - Kỳ vọng: Repository quay về trạng thái trước merge.

- [x] **TC-HP-010 — Rebase conflict và Continue**
  - Input: Commit đang rebase conflict với branch đích.
  - Thực hiện: Resolve, stage, chạy Continue.
  - Kỳ vọng: Rebase hoàn tất và operation state biến mất.

- [x] **TC-HP-011 — Rebase Skip**
  - Input: Rebase đang dừng tại commit conflict.
  - Thực hiện: Chạy Skip.
  - Kỳ vọng: Commit conflict không được áp dụng, rebase hoàn tất.

- [x] **TC-HP-012 — Rebase Abort**
  - Input: Rebase đang dừng vì conflict.
  - Thực hiện: Chạy Abort.
  - Kỳ vọng: Branch và nội dung HEAD quay về trước rebase.

- [x] **TC-HP-013 — Modify/Delete conflict**
  - Input: Một branch xóa file, branch còn lại sửa file.
  - Thực hiện: Chọn phía bị xóa rồi Continue.
  - Kỳ vọng: Git ghi nhận deletion, không tạo file rỗng.

- [x] **TC-HP-014 — Binary conflict**
  - Input: Hai branch sửa khác nhau một file binary.
  - Thực hiện: Chọn Incoming rồi Continue.
  - Kỳ vọng: Nội dung binary trong merge commit khớp Incoming.

- [x] **TC-HP-015 — History**
  - Input: Repository có linear commit và merge commit.
  - Thực hiện: Đọc log và file diff.
  - Kỳ vọng: Đúng thứ tự, parent hashes, refs và danh sách file.

## 2. Validation & Business Rules

- [x] **TC-VL-001 — Repository chưa có commit**
  - Input: Unborn branch với file đã stage.
  - Thực hiện: Unstage file.
  - Kỳ vọng: Không lỗi `could not resolve HEAD`; file trở lại untracked.

- [x] **TC-VL-002 — Pull ff-only trên divergent history**
  - Input: Local và remote đều có commit riêng.
  - Thực hiện: Pull `ff-only`.
  - Kỳ vọng: Operation bị từ chối, không tự merge hoặc rewrite history.

- [x] **TC-VL-003 — Merge branch không tồn tại**
  - Input: Branch name không có trong repository.
  - Thực hiện: Merge.
  - Kỳ vọng: Trả `GitWorkspaceError`, extension không crash.

- [x] **TC-VL-004 — Repository không hợp lệ**
  - Input: Thư mục thường không có `.git`.
  - Thực hiện: Đọc status.
  - Kỳ vọng: Lỗi được phân loại `RepositoryNotFound`.

- [x] **TC-VL-005 — Repository chưa có commit history**
  - Input: Repository vừa init.
  - Thực hiện: Đọc log.
  - Kỳ vọng: Trả mảng rỗng, không coi là crash.

- [x] **TC-VL-006 — Filename có khoảng trắng**
  - Input: `a b.txt`.
  - Thực hiện: Parse porcelain `-z`.
  - Kỳ vọng: Path không còn dấu quote do Git thêm.

- [x] **TC-VL-007 — Filename chứa ` -> `**
  - Input: `arrow -> name.txt`.
  - Thực hiện: Parse status.
  - Kỳ vọng: Không bị nhận nhầm thành rename.

- [x] **TC-VL-008 — Rename có khoảng trắng**
  - Input: Rename `old name.txt` thành `new name.txt`.
  - Thực hiện: Parse NUL-delimited status.
  - Kỳ vọng: `originalPath` và `path` đúng.

- [x] **TC-VL-009 — Conflict marker không hoàn chỉnh**
  - Input: Chỉ có `<<<<<<<` nhưng thiếu separator/end marker.
  - Thực hiện: Parse conflict.
  - Kỳ vọng: Không coi là conflict block hợp lệ.

- [x] **TC-VL-010 — Diff3 marker**
  - Input: Conflict có `||||||| base`.
  - Thực hiện: Parse conflict.
  - Kỳ vọng: Tách đúng Current, Base và Incoming.

## 3. Edge Cases & Security

- [x] **TC-ES-001 — Double click Apply & Stage**
  - Thực hiện: Gửi Save liên tiếp.
  - Kỳ vọng: Client disable nút ngay; panel khóa `saving`, chỉ xử lý một lần.

- [x] **TC-ES-002 — Chạy hai Git operation đồng thời trên cùng repo**
  - Thực hiện: Kích hoạt operation thứ hai khi operation đầu chưa hoàn tất.
  - Kỳ vọng: Operation thứ hai bị chặn bằng repository lock.

- [x] **TC-ES-003 — Stage trực tiếp file conflicted**
  - Thực hiện: Gọi Stage với node conflicted.
  - Kỳ vọng: Bị chặn và yêu cầu dùng conflict editor.

- [x] **TC-ES-004 — Webview XSS qua filename/repository/content**
  - Input: Chuỗi `</script><script>alert(1)</script>`.
  - Thực hiện: Sinh conflict-editor HTML.
  - Kỳ vọng: Ký tự `<` được encode, payload không tạo script hoặc HTML element.

- [x] **TC-ES-005 — Content Security Policy**
  - Thực hiện: Kiểm tra HTML webview.
  - Kỳ vọng: `default-src 'none'`, script bắt buộc có nonce.

- [x] **TC-ES-006 — Inline event handlers**
  - Thực hiện: Quét HTML.
  - Kỳ vọng: Không có `onclick`, `onerror` hoặc handler attribute.

- [x] **TC-ES-007 — Remote assets**
  - Thực hiện: Quét `src`/`href`.
  - Kỳ vọng: Không tải asset HTTP bên ngoài.

- [x] **TC-ES-008 — Command manifest parity**
  - Thực hiện: So sánh commands trong `package.json` với `registerCommand`.
  - Kỳ vọng: Không có command thiếu handler.

- [x] **TC-ES-009 — Shell injection**
  - Thực hiện: Review Git runner và các adapter calls.
  - Kỳ vọng: Dùng `spawn("git", args)`, `shell:false`, path đứng sau `--`.

- [x] **TC-ES-010 — Workspace trust**
  - Thực hiện: Kiểm tra manifest.
  - Kỳ vọng: Extension không chạy thao tác thay đổi Git trong untrusted workspace.

## 4. UI/UX & Console

- [x] **TC-UI-001 — Bố cục desktop**
  - Viewport: 1440×900.
  - Kỳ vọng: Ba pane Current/Result/Incoming, không horizontal overflow.
  - Evidence: `qa-artifacts/conflict-editor-desktop-1440x900.png`.

- [x] **TC-UI-002 — Bố cục mobile/narrow**
  - Viewport yêu cầu: 390×844; Chrome headless dùng effective viewport 500 px.
  - Kỳ vọng: Chuyển thành một cột, không horizontal overflow.
  - Evidence: `qa-artifacts/conflict-editor-mobile-390x844.png`.

- [x] **TC-UI-003 — Nút thao tác**
  - Kỳ vọng: Không có button chiều rộng/cao bằng 0.

- [x] **TC-UI-004 — Duplicate element ID**
  - Kỳ vọng: Không có ID trùng.

- [x] **TC-UI-005 — Client script syntax**
  - Kỳ vọng: Script compile được bằng JavaScript parser.

- [x] **TC-UI-006 — Console runtime**
  - Kỳ vọng: Không có `error` hoặc `unhandledrejection` khi render.

- [x] **TC-UI-007 — Base/Current/Incoming/Result**
  - Kỳ vọng: Đủ bốn vùng thông tin và các action Current/Incoming/Both/Base.

- [x] **TC-UI-008 — Responsive breakpoint**
  - Kỳ vọng: Desktop có ba grid columns; narrow viewport có một grid column.

## 5. Performance

- [x] **TC-PF-001 — Git status latency**
  - Kết quả: p50 `16.23 ms`, p95 `23.98 ms`, max `24.12 ms`.
  - Điều kiện đạt: p95 `< 300 ms`.

- [x] **TC-PF-002 — History latency**
  - Kết quả: p50 `5.49 ms`, p95 `6.63 ms`.
  - Điều kiện đạt: p95 `< 500 ms`.

- [x] **TC-PF-003 — Scan 100 repositories**
  - Kết quả: `22.37 ms`, tìm đủ `100/100`.
  - Điều kiện đạt: `< 15,000 ms`.

- [x] **TC-PF-004 — Memory**
  - Kết quả: `55.48 MB`.
  - Điều kiện đạt: `< 300 MB`.

## 6. Build, Package & Installation

- [x] **TC-PK-001 — TypeScript compile**
  - Kỳ vọng: Không có compile error.

- [x] **TC-PK-002 — ESLint**
  - Kỳ vọng: Không có lint error.

- [x] **TC-PK-003 — VSIX integrity**
  - Kỳ vọng: `unzip -t` không phát hiện lỗi.

- [x] **TC-PK-004 — Isolated installation**
  - Thực hiện: Cài VSIX vào `/tmp/gwp-qa-extensions`.
  - Kỳ vọng: VS Code liệt kê `jinhy.git-workspace-pro@0.2.1`.

## 7. Kết quả

- Functional/unit/integration/system tests: **124/124 PASS**
- UI static checks: **5/5 PASS** (nằm trong 124 tests)
- Headless rendered viewports: **2/2 PASS**
- Performance criteria: **4/4 PASS**
- Build/package/install gates: **4/4 PASS**
- Tổng trạng thái: **READY FOR QA**
