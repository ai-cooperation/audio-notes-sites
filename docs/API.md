# API 操作契約

Base：自己的私人 Sites `/api/audio`。所有資料操作需 owner 驗證；寫入若帶 Origin 必須同源。不要用公開 GitHub URL 當 API。

## Groq 後台

`GET /settings/groq` 只回 configured、updated、storageReady；同源且已登入的網頁用 `POST /settings/groq` 傳 `{key}`，`DELETE /settings/groq` 移除自己的設定。皆回 Cache-Control: no-store。維護用服務憑證不涵蓋此設定入口。不得由Agent讀取明文或把Key放入範例。

## 附件與持久化佇列

| 方法／路徑 | 功能 |
|---|---|
| GET /workflow | 完整處理指引，標示無自主排程 |
| GET /jobs/preparation | 真實格式、時長、大小、重疊與配額規則 |
| POST /jobs/prepared | 建立不可變 manifest 的 prepared 工作 |
| PUT /jobs/{id}/prepared/{ordinal} | 上傳單一 WAV binary，檢查結構、時長、SHA-256 |
| POST /jobs/{id}/prepared/finalize | 全片上傳完才入隊 |
| GET /jobs/{id}/prepared | 進度、已完成片段、nextAttemptAt、nextAction |
| POST /jobs/{id}/prepared/step | 執行最多一片；等待中不呼叫模型 |
| POST /jobs/{id}/prepared/retry | 修好原因後重試 failed 工作 |
| POST /jobs/{id}/prepared/cancel | 取消尚未完成工作 |
| GET /jobs/queue | 本人的佇列 |

manifest 欄位為 `version:audio-preparation-v1`、name、可選 prompt、segments。每片含 ordinal（0開始）、offsetMs、durationMs、bytes、sha256（64字元小寫hex）、format:wav。以 tools/prepare_audio.py 實際生成，不手算雜湊。先讀該工具 --help；tools/mcp_stdio.py 提供本地工具包裝，不是遠端附件連線。

原音保存走 POST /jobs（name、size）→依回傳 partSize 分塊 PUT /jobs/{id}/parts/{n}→POST /jobs/{id}/complete。這些 byte chunks 只用於儲存，不是可供模型辨識的音訊切片。GET /jobs/{id}/original 只對確有原音的工作成立。prepared 的 parts=0。

網頁短檔 POST /jobs/{id}/transcribe 是舊路徑，未完整接入 prepared 額度帳本。tools/audio_client.py 的直接 CLI 亦為舊路徑；其 request() 只是新版共用HTTP傳輸。免費額度控制以 prepared 為建議入口，不宣稱所有路徑已統一計帳。

## 文件、詞庫與完成回應

| 方法／路徑 | 格式 |
|---|---|
| GET /jobs/{id}/documents/{kind} | `{text,version}`；kind 為 raw/reviewed/corrections/summary |
| POST 同上 | `{text}`；建立新版本，不代替 Agent 校正 |
| GET /glossary | 詞庫陣列；aliases 為 JSON 字串 |
| POST /glossary | 單詞 `{term,aliases:[...],reference,confirmed:true}` |
| POST /glossary | 批次 `{terms:[單詞...]}`；最多200筆，重複term拒絕，已有詞保留 |
| GET /glossary/context?topic=... | 有上限的轉錄提示、選中詞及省略詞數 |
| POST /jobs/{id}/completion | 下面的完成確認物件 |
| GET /jobs/{id}/completion | 四文件、stages、verified、meeting_url、responseText |

```json
{
  "versions": {"raw":"實際版本", "reviewed":"實際版本", "corrections":"實際版本", "summary":"實際版本"},
  "sources": [{"type":"glossary", "reference":"實際採用詞條來源"}],
  "sbCompared": false,
  "uncertainties": ["尚待回聽或本人確認的內容"]
}
```

sources.type 為 glossary/sb/user/other；sbCompared=true 必須附 sb 來源。完成確認拒絕缺稿、空稿或過期版本。新對話必須重新取得合法連線，讀此契約與 D1，不靠上一個對話的記憶。

## 交辦

GET/POST /jobs/{id}/actions。物件含 UUID id、target（sb/todo/calendar/gmail）、title、body、assignee（可null）、dueAt（含offset的ISO時間或null）、sourceVersion、sourceLocation、status（draft/sent/done）、externalId、authorization。

sent/done 必須有外部回執與授權依據。已執行回執不可覆寫，來源版本須屬本會議。回應 `dispatched:false`，表示此 API 只保存紀錄，不執行外部發送。
