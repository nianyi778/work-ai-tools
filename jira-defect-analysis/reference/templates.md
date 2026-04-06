# 模板库

## Jira 详情解析脚本

```python
import json

def parse_jira_issue(filepath):
    with open(filepath) as f:
        d = json.load(f)
    fields = d['fields']

    def extract_text(node):
        if isinstance(node, dict):
            if node.get('type') == 'text':
                return node.get('text', '')
            return ' '.join(filter(None, [extract_text(c) for c in node.get('content', [])]))
        return ''

    print(f"=== {d['key']} | {fields['status']['name']} ===")
    print(f"Summary: {fields['summary']}")
    print(f"Assignee: {fields.get('assignee',{}).get('displayName','N/A')}")
    print(f"\n=== Description ===")
    for block in fields.get('description',{}).get('content',[]):
        t = extract_text(block).strip()
        if t: print(t)
    print(f"\n=== Attachments ({len(fields.get('attachment',[]))}) ===")
    for att in fields.get('attachment',[]):
        print(f"  {att['filename']} ({att['size']}b) {att['mimeType']}")
    print(f"\n=== Comments ({len(fields.get('comment',{}).get('comments',[]))}) ===")
    for c in fields.get('comment',{}).get('comments',[]):
        author = c['author']['displayName']
        created = c['created'][:10]
        body = extract_text(c['body']).strip()[:300]
        print(f"--- {author} ({created}) ---\n{body}\n")
```

## Excel 附件解析

```python
import openpyxl

wb = openpyxl.load_workbook('/tmp/xxx.xlsx', data_only=True)
ws = wb[wb.sheetnames[0]]
for row in ws.iter_rows(min_row=1, max_row=30, values_only=False):
    vals = [str(c.value)[:60] if c.value is not None else '' for c in row]
    non_empty = [v for v in vals if v]
    if non_empty:
        print(' | '.join(vals[:10]))
```

## AF 列内容模板

固定三行格式，**不可省略任何一行**：

```
詳細発生原因：[一句话根本原因。代码文件名+行号作为证据]
詳細対応方法：[一句话修复方式。当前状态(修正済み/IN PROGRESS/READY RELEASE)]
詳細影響範囲：[一句话影响范围]
```

示例：
```
詳細発生原因：TypeSpec定義でemail:string（無条件必須）と定義。実際はnotificationMethod=EMAIL時のみ必須。createCustomerRequest.ts L16で確認。
詳細対応方法：ランタイムのバリデーションは正しい。TypeSpec定義をemail?:stringに修正しAPIドキュメントを更新。
詳細影響範囲：顧客登録APIの仕様書/ドキュメント。実際のAPI動作には影響なし。
```

## Sheet 回填模板

```python
# 分类字段（N/O/P/Y/Z）
batchWrite(spreadsheetId=SHEET_ID, data=[
    {"range": f"{TAB}!N{row}", "values": [["発生原因の値"]]},
    {"range": f"{TAB}!O{row}", "values": [["解決方法の値"]]},
    {"range": f"{TAB}!P{row}", "values": [["処置区分の値"]]},
    {"range": f"{TAB}!Y{row}", "values": [["不具合区分の値"]]},
    {"range": f"{TAB}!Z{row}", "values": [["作り込み工程の値"]]},
])

# AF 列（分析结论）
writeSpreadsheet(spreadsheetId=SHEET_ID, range=f"{TAB}!AF{row}", values=[["AF内容"]])

# 背景色
formatCells(spreadsheetId=SHEET_ID, range=f"{TAB}!AF{row}", backgroundColor="#90EE90")
# ON HOLD 用黄色: backgroundColor="#FFFACD"

# 验证（必须）
readSpreadsheet(spreadsheetId=SHEET_ID, range=f"{TAB}!N{row}:P{row}")
readSpreadsheet(spreadsheetId=SHEET_ID, range=f"{TAB}!AF{row}")
```

## Jira 评论模板（ADF 格式）

```json
{
  "body": {
    "type": "doc",
    "version": 1,
    "content": [
      {"type": "paragraph", "content": [
        {"type": "text", "text": "【コード検証結果】", "marks": [{"type": "strong"}]}
      ]},
      {"type": "paragraph", "content": [
        {"type": "text", "text": "発生原因：[原因]。[代码文件名 Lxx 确认]。"}
      ]},
      {"type": "paragraph", "content": [
        {"type": "text", "text": "対応方法：[方法]。[修正状态]。"}
      ]},
      {"type": "paragraph", "content": [
        {"type": "text", "text": "影響範囲：[范围]"}
      ]},
      {"type": "paragraph", "content": [
        {"type": "mention", "attrs": {"id": "5b611abc1865dd73be10f688", "text": "@徐哲"}},
        {"type": "text", "text": " "},
        {"type": "mention", "attrs": {"id": "712020:bcb987db-eba2-4346-b70f-f593c6d658a9", "text": "@陳剣"}},
        {"type": "text", "text": " 上記コード検証結果をご確認ください。"}
      ]}
    ]
  }
}
```
