# MCP-First Code Exploration

Khi cần tìm hiểu code trong project `codemap`, ưu tiên dùng MCP tools trước khi dùng `Read` hay `Bash grep`.

## Thứ tự ưu tiên

1. `search_codebase` — tìm symbol, function, file theo keyword
2. `get_file` — đọc nội dung file cụ thể (chỉ đọc phần cần thiết)
3. `get_project_map` — xem cấu trúc thư mục
4. `Read` / `Bash grep` — chỉ dùng khi MCP không đủ (ví dụ: cần đọc file chưa được index, hoặc cần regex phức tạp)

## Lý do

- `Read` load toàn bộ file vào context — tốn token ngay cả khi chỉ cần một đoạn nhỏ
- `search_codebase` trả về đúng symbol/location cần tìm, không load code thừa
- `get_file` cho phép đọc từng đoạn cụ thể thay vì cả file

## Không dùng Agent tool cho research

**Không spawn Agent/fork** cho các task có thể làm trực tiếp bằng MCP + Bash:
- Dead code scan → `find_usages` + `Bash grep`
- Symbol lookup → `search_codebase`
- File audit → `get_file` outline
- Impact analysis → `get_file` với `blast_radius`

Agent tiêu quota riêng của user và chạy song song không kiểm soát được. Chỉ spawn agent khi task thực sự cần chạy nền dài (>5 phút) hoặc user yêu cầu rõ ràng.

## Factory method pattern (TypeScript)

Parser giờ index methods bên trong factory return-objects (`createXxxService`, `createXxxController`...) thành symbol `kind=method` với `parentSymbolName` trỏ về factory. `find_usages` hoạt động trực tiếp — **không cần grep** cho pattern này.

```
// Đúng
find_usages("listProjects")   // trả về định nghĩa trong service.ts + controller.ts

// Sai — không cần thiết nữa
Bash grep -rn "listProjects" packages/api/src
```

Chỉ dùng grep khi cần tìm dynamic access (`obj["methodName"]`), string literal, hoặc pattern không phải symbol declaration.

## Ví dụ

**Không nên:**
```
Read(repo-parse-graph.ts)  // 1900 dòng, chỉ cần sửa 3 dòng
Agent("audit dead code")   // tốn quota, có thể làm trực tiếp bằng MCP
Bash grep -rn "createProject" packages/api  // factory method đã được index
```

**Nên:**
```
search_codebase("toTopLevelFolder")  // tìm location
get_file(path, startLine, endLine)   // đọc đúng đoạn cần
find_usages("createProject")         // factory method → trả về đúng định nghĩa + callers
find_usages("FunctionName")          // check dead code
```
