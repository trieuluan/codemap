# MCP-First Code Exploration

Khi cần tìm hiểu code trong project `codemap`, ưu tiên dùng MCP tools trước khi dùng `Read` hay `Bash grep`.

## Thứ tự ưu tiên

Chọn tool theo shape của câu hỏi, không dùng một thứ tự cứng cho mọi case:

1. `explore_task` — dùng trước cho task rộng như "fix bug X", "implement Y", "investigate Z". Tool này trả về context pack đầy đủ: likely files, entrypoints, symbols, risks, recommended reads, và suggested next tools. Nó thay cho việc gọi `search_codebase` riêng lẻ rồi tự follow-up.
2. `find_related_files` — dùng khi đã có anchor file/symbol, hoặc khi user hỏi "đọc file nào", "file nào liên quan", "scope quanh X". Nếu đã tìm được một file chính bằng `explore_task`/`search_codebase`, gọi `find_related_files(file_path=...)` trước khi chốt reading list.
3. `search_codebase` — dùng khi có keyword, filename, export, hoặc symbol cụ thể. Tool này nhanh hơn `explore_task` cho lookup hẹp.
4. `get_files` — survey outline nhiều file cùng lúc sau khi có shortlist. Dùng để xem imports/imported-by/exports/symbols, tối đa 7 file/lần.
5. `get_file` — đọc nội dung file cụ thể. Ưu tiên `include=["symbols"]` với `symbol_names` khi cần thân hàm/class; dùng `include=["outline"]` nếu chỉ cần map file; chỉ đọc full content/range khi thật sự cần.
6. `find_usages` / `find_callers` — dùng cho impact analysis quanh symbol. Nếu chỉ biết tên symbol thì dùng `find_usages`; nếu biết cả file path chứa symbol thì dùng `find_callers` cho nhanh và chính xác hơn.
7. `get_project_map` — xem cấu trúc thư mục/subtree khi chưa rõ module layout hoặc cần orient theo folder.
8. `get_working_diff` / `get_diff` — kiểm tra scope thay đổi local hoặc giữa hai commit/ref khi review/debug regression.
9. `run_tests` — verify bằng MCP khi phù hợp; nếu MCP không chạy đúng project command thì fallback sang command trong `commands.md`.
10. `Read` / `Bash grep` — chỉ dùng khi MCP không đủ, ví dụ file chưa được index, cần regex phức tạp, string literal/dynamic access, hoặc cần đọc file cấu hình ngoài index.

## Lý do

- `Read` load toàn bộ file vào context — tốn token ngay cả khi chỉ cần một đoạn nhỏ
- `explore_task` gom context pack cho task rộng, tránh tự phối nhiều tool rời rồi miss graph context
- `find_related_files` dùng import graph + symbol usage + same feature domain, hợp nhất cho câu hỏi "nên đọc file nào?"
- `search_codebase` trả về đúng symbol/location cần tìm, không load code thừa
- `get_files` giúp survey nhiều outline song song trước khi đọc content
- `get_file` cho phép đọc từng đoạn cụ thể thay vì cả file

## Decision guide nhanh

- User hỏi "sửa bug/implement feature/investigate issue" mà chưa rõ file → `explore_task`
- User hỏi "đọc file nào?", "file nào liên quan X?" → `find_related_files`, nếu chưa có anchor thì dùng `query`
- Đã biết file chính → `find_related_files(file_path=...)`, rồi `get_files` outline shortlist
- Đã biết symbol/function/class → `search_codebase` hoặc `find_usages`
- Đã biết file + symbol → `get_file(include=["symbols"], symbol_names=[...])`
- Cần xem ai gọi/import symbol cụ thể → `find_callers(path=..., symbol_name=...)`
- Cần xem local changes trước commit/reimport → `get_working_diff`
- Cần compare committed refs → `get_diff`

## Không dùng Agent tool cho research

**Không spawn Agent/fork** cho các task có thể làm trực tiếp bằng MCP + Bash:
- Broad bug/feature investigation → `explore_task`
- "Đọc file nào?" / related-file scan → `find_related_files`
- Dead code scan → `find_usages` + chỉ dùng `Bash grep` khi cần string/dynamic access
- Symbol lookup → `search_codebase`
- File audit → `get_files` outline hoặc `get_file` outline
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
explore_task("fix auth redirect bug")                  // task rộng
find_related_files(query="auth redirect bug")          // hỏi nên đọc file nào
find_related_files(file_path="packages/web/proxy.ts")  // đã có anchor file
get_files([...shortlist])                              // survey outline nhiều file
search_codebase("toTopLevelFolder")                    // lookup hẹp theo keyword/symbol
get_file(path, include=["symbols"], symbol_names=[...]) // đọc đúng symbol cần sửa
find_usages("createProject")                           // factory method → trả về định nghĩa + callers
find_callers(path, "createProject")                    // khi đã biết file chứa symbol
```
