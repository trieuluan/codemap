# Task Lifecycle

Workflow chuẩn khi agent làm việc trong project `codemap`.

## 1. Orient bằng MCP

- Task rộng như "fix bug", "implement feature", "investigate issue" → bắt đầu bằng `explore_task`.
- Câu hỏi "đọc file nào", "file nào liên quan", "scope quanh X" → dùng `find_related_files`.
- Lookup hẹp theo tên file/symbol/export/keyword → dùng `search_codebase`.
- Có shortlist nhiều file → dùng `get_files` để survey outline trước khi đọc content.
- Đọc chi tiết → dùng `get_file`, ưu tiên `include=["symbols"]` nếu chỉ cần thân symbol.

Theo sát `.claude/rules/mcp-first.md` khi chọn tool.

## 2. Confirm trước khi edit

Trước khi sửa file trong repo, áp dụng skill `.claude/skills/confirm-before-edit/SKILL.md`:

- Liệt kê file sẽ thay đổi và loại thao tác: create/edit/delete/rename.
- Tóm tắt ngắn thay đổi dự kiến cho từng file.
- Hỏi `OK để tiếp tục?`.
- Chỉ edit sau khi user đồng ý rõ ràng.

Ngoại lệ chỉ áp dụng khi user đã yêu cầu hành động đơn giản/dứt khoát hoặc nói rõ không cần hỏi.

## 3. Implement có scope

- Bám pattern hiện có của repo, không refactor lan rộng nếu không cần.
- Backend: route handler mỏng, business logic trong service, input qua Zod schema.
- Frontend: default Server Component; chỉ thêm `"use client"` khi cần hooks/browser APIs.
- Database: schema-first theo `.claude/rules/database-schema.md`, không hand-write migration SQL trừ khi user yêu cầu.

## 4. Verify

Chọn mức verify theo blast radius:

- Shared type/schema đổi → `npm run build:shared`.
- Backend/API đổi → `npm run build:api`.
- Web/UI/client đổi → `npm run build:web`.
- Logic có test sẵn hoặc rủi ro cao → chạy test phù hợp (`npm run test:api` hoặc MCP `run_tests` nếu hợp).
- Nếu web build fail do Next/Google Fonts trong sandbox network, request escalation rồi chạy lại.

Theo `.claude/rules/commands.md`: `shared` phải build trước `api` hoặc `web`.

## 5. Inspect diff

Sau khi edit/verify:

- Dùng `get_working_diff(include_patch=false)` để xem scope.
- Nếu cần review kỹ, dùng `git diff -- <files>` hoặc `get_working_diff(include_patch=true)`.
- Không revert thay đổi không do mình tạo. Nếu thấy unrelated dirty files, báo rõ trong final summary.

## 6. Reimport khi cần

Sau thay đổi đáng kể ảnh hưởng code index, MCP docs, hoặc user yêu cầu `reimport`:

- Gọi `trigger_reimport`.
- Poll bằng `wait_for_import` đến khi completed hoặc failed.
- Nếu timed out nhưng import vẫn chạy, gọi `wait_for_import` tiếp.

## 7. Final response

Final nên ngắn, bằng tiếng Việt thân thiện:

- Nêu đã làm gì và file/module chính đã đổi.
- Nêu verification đã chạy và kết quả.
- Nêu nếu có blocker, test chưa chạy được, hoặc unrelated dirty files.
- Không spam full diff trừ khi user yêu cầu.

## Dogfood scenarios

Dùng các scenario này để kiểm tra workflow/tool ranking khi cần cập nhật rule:

- "sửa bug auth redirect thì đọc file nào?" → `find_related_files(query=...)`, sau đó anchor `packages/web/proxy.ts` nếu cần.
- "component graph canvas liên quan file nào?" → `find_related_files(file_path="packages/web/features/projects/map/graph/components/graph-canvas.tsx")`.
- "làm pagination cho Import History trong admin project detail" → `explore_task`, đọc `AdminImportHistory`, admin API/shared schema/backend service, confirm, implement, build shared/api/web, reimport.
