# Git Workspace Pro

Git Workspace Pro là tiện ích mở rộng VS Code để quản lý nhiều kho lưu trữ Git trong một không gian làm việc với cây kho lưu trữ, các thao tác trên từng kho, quy trình làm việc với nhánh và hướng dẫn giải quyết xung đột.

## Tính năng

- **Cây kho lưu trữ**: Tự động quét và hiển thị tất cả các kho Git trong không gian làm việc
- **Quản lý tệp**: Stage, unstage, discard, mở tệp, xem diff
- **Thao tác Git**: Fetch, Pull, Pull từ nhánh khác, Push (tự động set upstream), Commit, Stage All, Unstage All
- **Quản lý nhánh**: Checkout, Create, Merge, Rebase từ nhánh khác
- **Stash**: Push (kèm tùy chọn message), Pop
- **Menu thao tác**: Nhấp chuột phải vào kho lưu trữ để truy cập tất cả thao tác Git
- **Biểu tượng tùy chỉnh**: Logo riêng cho activity bar và marketplace

## Yêu cầu

- [Visual Studio Code](https://code.visualstudio.com/) phiên bản 1.90.0 trở lên
- [Git](https://git-scm.com/) được cài đặt và có trong PATH
- [Node.js](https://nodejs.org/) (chỉ dành cho nhà phát triển)

## Cài đặt

### Cách 1: Cài từ file VSIX

1. Tải file `git-workspace-pro-0.0.1.vsix` từ [Releases](https://github.com/jinhyk21/git_extentions/releases)
2. Mở VS Code
3. Nhấn `Ctrl+Shift+P` (Windows/Linux) hoặc `Cmd+Shift+P` (macOS) để mở Command Palette
4. Gõ `Extensions: Install from VSIX...` và chọn
5. Chọn file `.vsix` đã tải
6. Khởi động lại VS Code

Hoặc cài bằng dòng lệnh:

```bash
code --install-extension git-workspace-pro-0.0.1.vsix
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
code --install-extension git-workspace-pro-0.0.1.vsix
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
| Stage (+) | Thêm tệp vào index (unstaged/untracked/conflicted) |
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
| **Stash Push** | Lưu thay đổi vào stash (kèm message tùy chọn) |
| **Stash Pop** | Áp dụng stash gần nhất và xóa nó |

### 5. Làm mới

Nhấp chuột phải vào kho và chọn **Refresh** hoặc dùng nút refresh trên thanh công cụ để quét lại.

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
npm test             # Kiểm tra (chạy compile)
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
