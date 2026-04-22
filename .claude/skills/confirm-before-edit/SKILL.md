---
name: confirm-before-edit
description: Liệt kê danh sách file sẽ thay đổi và tóm tắt kế hoạch trước khi chỉnh sửa, dừng lại chờ user xác nhận 'OK' mới thực thi. PHẢI dùng skill này trước khi gọi Edit, Write, hoặc NotebookEdit bất kỳ file nào trong project codemap — kể cả sửa 1 dòng nhỏ. Trigger khi user yêu cầu bất kỳ thao tác sinh ra file changes trong project này — "sửa/tạo/xóa/rename file", "refactor", "implement X", "fix lỗi", "thêm feature", "update code", "cập nhật Y", cũng như các lời yêu cầu gián tiếp như "làm X đi", "hãy thêm", "đổi tên". Không trigger cho câu hỏi thuần tuý (explain, review, đọc file) không sinh ra file changes.
---

# Confirm Before Edit

Skill này là một bước check-in bắt buộc trước khi chỉnh sửa file trong project codemap. Mục đích: cho user cơ hội review kế hoạch và bắt lỗi trước khi thay đổi thực sự xảy ra.

## Phạm vi

Skill này chỉ áp dụng cho các file thuộc project `codemap` (root: `/sessions/ecstatic-wizardly-ritchie/mnt/codemap/`). Các file ngoài project (workspace tạm của Claude, file hệ thống) không yêu cầu confirm.

## Quy trình

Trước khi gọi bất kỳ `Edit`, `Write`, hoặc `NotebookEdit` nào trên file trong project, dừng lại và trả về một tin nhắn duy nhất chứa:

1. **Danh sách file sẽ thay đổi** — liệt kê path rõ ràng, đánh dấu loại thao tác: `(create)`, `(edit)`, `(delete)`, `(rename)`.
2. **Tóm tắt thay đổi** — với mỗi file, 1–3 gạch đầu dòng mô tả những gì sẽ thay đổi và tại sao.
3. **Câu hỏi xác nhận** — kết thúc bằng: `OK để tiếp tục?`

Sau khi gửi preview, **dừng hoàn toàn** — không gọi tool nào nữa. Đợi user trả lời.

## Khi nào được phép thực thi

Chỉ tiếp tục gọi tool chỉnh sửa khi user reply một câu mang nghĩa đồng ý rõ ràng: "OK", "ok", "okie", "đồng ý", "được", "go", "proceed", "yes", "ừ", hoặc tương đương.

Nếu user phản hồi bằng góp ý, chỉnh sửa yêu cầu, hoặc câu hỏi — quay lại bước preview với kế hoạch đã điều chỉnh, **không thực thi**.

## Ngoại lệ — bỏ qua bước confirm

- User đã yêu cầu một action đơn giản và dứt khoát, không có ambiguity. Ví dụ: "rename A thành B", "xóa dòng 42 trong file.ts".
- Viết file tạm vào workspace riêng của Claude (ngoài thư mục project codemap).
- User đã nói "cứ làm đi không cần hỏi" hoặc tương đương cho phiên làm việc này.

Trong các trường hợp này, vẫn nên có 1 dòng tóm tắt ngắn cuối cùng để user theo dõi.

## Định dạng preview

**Example 1 — edit đơn file:**

```
Mình sắp chỉnh sửa:

- `packages/web/features/projects/map/graph/components/graph-node.tsx` (edit)
  - Thêm import `useState` từ React
  - Chuyển sang client component bằng `"use client"`

OK để tiếp tục?
```

**Example 2 — multi-file refactor:**

```
Mình sắp chỉnh sửa 3 file:

- `packages/api/src/modules/user/service.ts` (edit): tách logic validate sang file mới
- `packages/api/src/modules/user/validation.ts` (create): chứa hàm validate đã tách
- `packages/api/src/modules/user/index.ts` (edit): export thêm từ validation

OK để tiếp tục?
```

## Tại sao skill này quan trọng

File changes khó revert nếu không có git stash/commit. Một bước xác nhận ngắn giúp:

- User bắt lỗi khi Claude hiểu sai intent trước khi thay đổi lan ra nhiều file.
- Tránh "surprise edits" khi Claude chạy tự động trên codebase của project.
- Duy trì trust — user luôn biết chuyện gì sắp xảy ra trong repo.

Round-trip xác nhận này rẻ hơn nhiều so với phải rollback sau đó.
