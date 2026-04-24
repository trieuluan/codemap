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

## Ví dụ

**Không nên:**
```
Read(repo-parse-graph.ts)  // 1900 dòng, chỉ cần sửa 3 dòng
```

**Nên:**
```
search_codebase("toTopLevelFolder")  // tìm location
get_file(path, startLine, endLine)   // đọc đúng đoạn cần
```
