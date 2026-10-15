# Git Workspace Pro

Git Workspace Pro là tiện ích mở rộng VS Code để quản lý nhiều kho lưu trữ Git trong một không gian làm việc với cây kho lưu trữ, các thao tác trên từng kho, quy trình làm việc với nhánh và hướng dẫn giải quyết xung đột.

## Tính năng

- **Sidebar dạng thẻ (mới)**: Mỗi kho là một thẻ có nhánh, ahead/behind, số thay đổi; nút một chạm Resolve/Pull/Push, hộp commit ngay trong thẻ, chọn nhiều tệp để stage/unstage, tìm kiếm, menu chuột phải, điều hướng bàn phím, hiệu ứng mượt. Muốn quay lại cây VS Code gốc: đặt `gitWorkspacePro.sidebar.mode` = `classic`
- **Cây kho lưu trữ tập trung**: Tự động quét và chỉ hiển thị các kho cần chú ý; kho sạch được ẩn (bật `gitWorkspacePro.sidebar.showCleanRepositories` để hiện), nhưng kho đang đồng bộ hoặc có operation vẫn được giữ
- **Thanh trạng thái & phím tắt**: Nhánh và đồng bộ của kho hiện tại; `Ctrl+Alt+G` thao tác nhanh, `Ctrl+Alt+G F` fetch tất cả, `Ctrl+Alt+Shift+G` tìm kiếm kho
- **Quản lý tệp**: Stage, unstage, discard, mở tệp, xem diff
- **Thao tác Git**: Fetch, Pull, Pull từ nhánh khác, Push (tự động set upstream), Commit, Stage All, Unstage All
- **Quản lý nhánh**: Checkout, Create, Merge, Rebase từ nhánh khác
- **Pull an toàn**: Chọn Fast-forward Only, Rebase hoặc Merge thay vì phụ thuộc cấu hình Git của máy
- **Operation control**: Continue, Skip và Abort cho merge/rebase/cherry-pick/revert đang thực hiện
- **Conflict editor 3-pane**: Current / Result / Incoming theo phong cách IntelliJ IDEA, có Base và xử lý từng conflict hunk
- **Conflict nâng cao**: Hỗ trợ diff3, modify/delete, file không có marker và binary conflict
- **Stash**: Push (kèm tùy chọn message), Pop
- **Chạy lệnh của bạn**: Ô nhập nhiều dòng (Ctrl+Enter để chạy) chạy ngay trong thư mục kho, xem output trực tiếp, dừng được, nhớ lịch sử lệnh — không cần mở terminal
- **Lịch sử & chi tiết commit**: Đồ thị commit, nút ⓘ mở nội dung đầy đủ, thống kê từng tệp, mở diff từng tệp
- **An toàn khi thao tác**: Cảnh báo thay đổi chưa commit trước Checkout/Merge/Rebase (có "Stash & Continue"), hỏi Stage All khi chưa stage gì, thông báo riêng khi Git hook từ chối, xóa nhánh chưa merge cần xác nhận "Force Delete"
- **Nhiều remote**: Push/Pull dùng remote upstream của nhánh, remote duy nhất, hoặc cho bạn chọn; Checkout được cả nhánh remote
- **Menu thao tác**: Nhấp chuột phải vào kho lưu trữ để truy cập tất cả thao tác Git
- **Biểu tượng tùy chỉnh**: Logo riêng cho activity bar và marketplace
- **Đa ngôn ngữ**: Tự động theo VS Code hoặc chọn riêng Tiếng Việt, English, 中文（简体） cho cây repo, menu Git, thông báo, History và Conflict Resolver

## Đổi ngôn ngữ

Mở Command Palette và chạy `Git Workspace Pro: Đổi ngôn ngữ hiển thị`, sau đó chọn:

- Tự động theo ngôn ngữ VS Code
- Tiếng Việt
- English
- 中文（简体）

Bạn cũng có thể đổi tại Settings bằng cấu hình `gitWorkspacePro.language`.

## Cài đặt cấu hình

| Cấu hình | Mặc định | Mô tả |
|----------|----------|-------|
| `gitWorkspacePro.language` | `auto` | Ngôn ngữ giao diện |
| `gitWorkspacePro.sidebar.mode` | `modern` | `modern` (thẻ) hoặc `classic` (cây VS Code gốc) |
| `gitWorkspacePro.sidebar.showCleanRepositories` | `false` | Hiện cả kho sạch trong sidebar modern |
| `gitWorkspacePro.pullStrategy` | `ask` | Cách Pull xử lý nhánh phân kỳ: `ask`, `ff-only`, `rebase`, `merge` |
| `gitWorkspacePro.history.maxCount` | `300` | Số commit tối đa trong bảng Lịch sử |
| `gitWorkspacePro.scan.excludeDirectories` | `[]` | Tên thư mục bỏ qua thêm khi quét kho (ví dụ `vendor`, `.venv`, `target`) |
| `gitWorkspacePro.scan.maxDepth` | `0` | Độ sâu quét tối đa (0 = không giới hạn) |
| `gitWorkspacePro.customCommand.historySize` | `30` | Số lệnh gần đây được nhớ |
| `gitWorkspacePro.customCommand.shell` | rỗng | Shell chạy lệnh (rỗng = mặc định hệ thống; Windows luôn dùng `cmd.exe`) |
| `gitWorkspacePro.customCommand.autoRefresh` | `true` | Làm mới cây kho sau khi lệnh chạy xong |
| `gitWorkspacePro.customCommand.timeoutSeconds` | `0` | Tự dừng lệnh sau số giây này (0 = không giới hạn) |

## Chạy lệnh tùy chỉnh

Chọn **Run Command** trong menu `...` của kho (hoặc chuột phải vào kho, hoặc Command Palette → `Git Workspace Pro: Run Command`). Nhập lệnh (Enter xuống dòng, **Ctrl+Enter** để chạy), tùy chọn thư mục con, xem output trực tiếp và bấm **Stop** để dừng. Lệnh chạy với quyền của bạn như trong terminal.

Lưu ý: lệnh chạy không có terminal thật nên không nhập tương tác được (ví dụ `npm init`, hỏi mật khẩu).

## Yêu cầu

- [Visual Studio Code](https://code.visualstudio.com/) phiên bản 1.90.0 trở lên
- [Git](https://git-scm.com/) **2.23 trở lên** (dùng `git switch` / `git restore`) được cài đặt và có trong PATH
- Workspace phải được tin cậy (Workspace Trust) vì extension chạy các lệnh Git làm thay đổi kho
- [Node.js](https://nodejs.org/) (chỉ dành cho nhà phát triển)

## Cài đặt

### Cách 1: Cài từ file VSIX

1. Tải file `git-workspace-pro-0.5.3.vsix` từ [Releases](https://github.com/jinhyk21/git_extentions/releases)
2. Mở VS Code
3. Nhấn `Ctrl+Shift+P` (Windows/Linux) hoặc `Cmd+Shift+P` (macOS) để mở Command Palette
4. Gõ `Extensions: Install from VSIX...` và chọn
5. Chọn file `.vsix` đã tải
6. Khởi động lại VS Code

Hoặc cài bằng dòng lệnh:

```bash
code --install-extension git-workspace-pro-0.5.3.vsix
```

### Cách 2: Build từ mã nguồn

1. Clone repository:

```bash
git clone https://github.com/jinhyk21/git_extentions.git
cd git_extentions
```

2. Cài dependencies:

```bash
npm install
```

3. Biên dịch:

```bash
npm run compile
```

4. Đóng gói thành VSIX (cần `vsce`):

```bash
npm install -g @vscode/vsce
vsce package --allow-missing-repository
```

5. Cài file VSIX:

```bash
code --install-extension git-workspace-pro-0.5.3.vsix
```

## Cách sử dụng

### 1. Mở Activity Bar

Sau khi cài đặt, biểu tượng **Git Workspace Pro** sẽ xuất hiện trong Activity Bar (thanh bên trái). Nhấp vào để mở cửa sổ **Repositories**.

### 2. Cây kho lưu trữ

Cửa sổ Repositories hiển thị tất cả các kho Git trong không gian làm việc:

- Tên kho + trạng thái thay đổi (`+staged`, `~unstaged`, `?untracked`, `!conflicted`)
- Tên nhánh hiện tại
- Các nhóm tệp: **Conflicted**, **Staged**, **Unstaged**, **Untracked**

### 3. Thao tác với tệp

Mở rộng một kho để xem các tệp đã thay đổi. Mỗi tệp có các nút inline:

| Nút | Chức năng |
|-----|-----------|
| Mở tệp | Mở tệp để chỉnh sửa |
| Diff | So sánh với HEAD |
| Stage (+) | Thêm tệp unstaged/untracked vào index; file conflicted bắt buộc đi qua conflict editor |
| Unstage (-) | Bỏ tệp khỏi index (staged) |
| Discard | Hủy thay đổi (unstaged/untracked) |

### 4. Thao tác Git (Repository Actions)

**Nhấp chuột phải** vào một kho lưu trữ và chọn **Repository Actions** để mở menu thao tác:

| Thao tác | Mô tả |
|----------|-------|
| **Stage All** | Thêm tất cả tệp đã thay đổi vào index |
| **Unstage All** | Bỏ tất cả tệp khỏi index |
| **Commit** | Tạo commit với message |
| **Fetch** | Fetch tất cả remotes và prune |
| **Pull** | Pull nhánh hiện tại |
| **Pull From Branch** | Pull từ nhánh khác về nhánh hiện tại |
| **Push** | Push nhánh hiện tại (tự động set upstream nếu chưa có) |
| **Checkout Branch** | Chuyển nhánh |
| **Create Branch** | Tạo và chuyển sang nhánh mới |
| **Merge Branch** | Merge nhánh đã chọn vào nhánh hiện tại |
| **Rebase Onto Branch** | Rebase nhánh hiện tại lên nhánh đã chọn |
| **Continue Operation** | Tiếp tục merge/rebase/cherry-pick/revert sau khi resolve |
| **Skip Operation Step** | Bỏ qua commit hiện tại của rebase/cherry-pick/revert |
| **Abort Operation** | Hủy operation và quay lại trạng thái trước đó |
| **Stash Push** | Lưu thay đổi vào stash (kèm message tùy chọn) |
| **Stash Pop** | Áp dụng stash gần nhất và xóa nó |

### 5. Làm mới

Nhấp chuột phải vào kho và chọn **Refresh** hoặc dùng nút refresh trên thanh công cụ để quét lại.

### 6. Resolve conflict

Khi pull, merge hoặc rebase dừng vì conflict:

1. Chọn **Resolve First Conflict** hoặc mở nhóm **Conflicted** trong repository.
2. Conflict editor hiển thị ba cột **Current**, **Result** và **Incoming**; phiên bản **Base** có thể mở ở phía dưới.
3. Chọn **Accept Current**, **Accept Incoming**, **Accept Both** hoặc sửa trực tiếp cột Result.
4. Chọn **Apply & Stage**. Extension tự mở conflict tiếp theo nếu vẫn còn.
5. Khi file cuối cùng được resolve, chọn **Continue** để chạy `merge --continue` hoặc `rebase --continue`.
6. Có thể chọn **Abort** từ dòng operation trong repository nếu muốn quay lại trạng thái ban đầu.

## Phát triển

### Cấu trúc dự án

```
git_extentions/
├── src/
│   ├── core/
│   │   ├── errors/          # Lỗi tùy chỉnh
│   │   ├── eventbus/        # Event bus
│   │   ├── git/             # GitAdapter, GitProcessRunner
│   │   └── repository/      # RepositoryManager, RepositoryScanner
│   ├── extension/
│   │   ├── activate.ts      # Entry point + TreeProvider
│   │   ├── deactivate.ts
│   │   └── commands/        # Đăng ký command
│   └── shared/
│       ├── constants/       # Error codes
│       └── types/            # TypeScript types
├── media/                   # Logo và icon
│   ├── activitybar.svg
│   ├── logo.png
│   └── logo.svg
├── docs/                    # Tài liệu thiết kế
├── package.json
└── tsconfig.json
```

### Lệnh

```bash
npm install          # Cài dependencies
npm run compile      # Biên dịch TypeScript
npm run watch        # Biên dịch tự động
npm run lint         # Chạy ESLint
npm test             # compile + lint + unit/integration/system tests
npm run test:vscode  # Smoke test trong VS Code thật (tải VS Code lần đầu; Linux không màn hình dùng xvfb-run)
npm run qa:all       # Bộ QA đầy đủ
```

### Chạy ở chế độ phát triển

1. Mở thư mục trong VS Code
2. Nhấn `F5` để mở Extension Development Host
3. Mở một workspace có nhiều Git repo để test

### Đóng gói

```bash
npm install -g @vscode/vsce
vsce package --allow-missing-repository
```

File `.vsix` sẽ được tạo trong thư mục gốc.

## License

MIT

## Known issues

- Lệnh trong **Run Command** không tương tác được (không có TTY).
- Danh sách nhánh của Delete và Pull From Branch chỉ gồm nhánh cục bộ.
- Nhận diện lỗi Git hook dựa trên nội dung thông báo nên hook tự đặt thông điệp lạ sẽ hiện như lỗi Git thông thường.
- Chưa hỗ trợ amend, tag, cherry-pick khởi tạo từ giao diện và xem danh sách stash.
