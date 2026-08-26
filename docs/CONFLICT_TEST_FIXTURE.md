# Conflict Test Fixture

Script `scripts/create-conflict-fixture.js` tạo một Git repository tạm đang ở trạng thái conflict thật để kiểm tra Git Workspace Pro.

## Text merge conflict

```bash
npm run qa:create-conflict -- merge
```

## Một file có năm conflict hunks và nhiều đoạn không conflict

```bash
npm run qa:create-conflict -- five-hunks
```

## Rebase conflict

```bash
npm run qa:create-conflict -- rebase
```

## Ba file conflict liên tiếp

```bash
npm run qa:create-conflict -- multi
```

## Modify/Delete conflict

```bash
npm run qa:create-conflict -- modify-delete
```

## Binary conflict

```bash
npm run qa:create-conflict -- binary
```

Sau khi chạy, terminal sẽ in đường dẫn repository, ví dụ:

```text
/tmp/gwp-merge-conflict-xxxxxx
```

Mở repository:

```bash
code "/tmp/gwp-merge-conflict-xxxxxx"
```

Sau đó:

1. Mở **Git Workspace Pro**.
2. Mở repository và nhóm **Conflicted**.
3. Chọn file rồi bấm **Resolve Conflict**.
4. Kiểm tra Current, Result, Incoming và Base.
5. Chọn một phương án hoặc chỉnh Result.
6. Bấm **Apply & Stage**.
7. Khi hết conflict, chọn **Continue**.
8. Chạy lại fixture khác để kiểm tra **Abort**, **Skip**, modify/delete và binary.

Mỗi lần chạy script sẽ tạo thư mục mới trong thư mục tạm của hệ điều hành, không xóa hoặc thay đổi repository đang phát triển.
