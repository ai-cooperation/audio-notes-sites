# 開源準備紀錄 — 2026-09-15

版本：0.1.0 候選快照。公開 GitHub 儲存庫尚未建立；SmallGreen 候選提交與正式上架尚未成功。此紀錄不代表 Ready 認證。

## 已完成

- 由現行程式匯出獨立快照，全新 Git 歷史，MIT 授權及第三方聲明。
- 移除營運文件、私人案例、詞庫與部署識別；未匯出資料庫、R2 音檔、API Key、正式環境設定或原始 Git 歷史。
- 補齊 Work 操作契約、Sites 資源與部署設定、Groq Key 後台、API、資料流、版本校正與標準回應、續作與失敗處理文件。
- 開源快照只用 Groq，移除 Workers AI 回退；工具指引統一限制 Sites 資源，不要求外部排程。
- 保留現行介面的未登入本機預覽截圖；圖片未載入私人會議或 Key。不是正式部署或登入成功的證據。
- 正式依賴掃描發現的項目已透過鎖檔修補。正式站本回合未更新，修補只在候選快照。

## 本回合驗證

| 檢查 | 結果與範圍 |
|---|---|
| Sites 安裝 helper | 成功；保留鎖檔及供應鏈政策，使用專案要求的 pnpm 11.25.0 |
| TypeScript | tsc --noEmit 成功 |
| Sites 建置 helper | 成功；本機編譯，不代表新帳戶部署 |
| Python 測試 | 8 項成功；格式偵測、解碼切片、續作、授權傳輸邊界及 schema |
| Workflow 測試 | 成功；owner／詞庫隔離、校正版本確認與過期拒絕、交辦回執 |
| Queue 測試 | 成功；D1 遷移、WAV／雜湊驗證、額度等待、續作及讀回；Groq 為模擬回應 |
| MCP 協定測試 | 成功；初始化、工具清單、拒絕未授權與錯誤 Origin；未測第三方 OAuth |
| pnpm audit --prod | 0 個已回報漏洞；僅代表執行時的依賴資料庫結果，非完整安全保證 |
| 第三方 metadata 盤點 | 634 個已安裝套件，0 個缺少 license 欄位；非完整法律審核，未包含未安裝平台變體 |

修補鎖定 @babel/core 7.29.6、browserslist 4.28.7、baseline-browser-mapping 2.11.0。初次解析使用 PATH pnpm 11.19.0，最後由 Sites helper 以專案 11.25.0 frozen install 驗證成功。執行環境 Node 24.19.0。完整本機結果見本目錄 JSON；敏感資料檢視另見 security-review.json。

## 帳號與實際提交結果

| 用途 | 確認／預定位置 | 本回合結果 |
|---|---|---|
| GitHub 操作者 | 已連接 AlanChen75 | 身分查詢成功，不等於具有組織寫入權 |
| 公開原碼 | ai-cooperation/audio-notes-sites | 預定名稱；可用工具沒有建立 repository 操作，未建立 |
| SmallGreen 候選 | smallgreen-cloud/registry/candidates/audio-notes-sites.md | 實際 create_file 回傳 HTTP 403 Resource not accessible by integration；未新增 |
| SmallGreen 網站 | smallgreen-cloud/site | 尚未進入正式發布 gate，未變更 |

原碼歸屬依既有 ai-cooperation 開源範本慣例；未改發到個人帳號。GitHub 403 是整合權限拒絕，不是使用者再次授權聊天就能解除。

## 接續需要的外部動作

由具備組織權限的帳號，在 ai-cooperation 建立空白公開儲存庫 audio-notes-sites；不要自動加入另一份 README 或 LICENSE。讓目前 GitHub 整合可存取新 repo 及 smallgreen-cloud/registry；正式網站發布階段還需對應的 site 權限與維護流程。

權限具備後可匯入此乾淨快照，讀回實際公開 commit，再依 docs/SMALLGREEN_CANDIDATE.md 提交候選。後續仍須相容 profile、全新私人 Site 的附件 E2E、資源基線／teardown、證據包、registry gate、雙語網站與 review。不能因取得寫入權就直接宣稱 SmallGreen Ready。

## 尚未驗證或實作

- 新帳戶貼連結後完成建站、登入、合法附件上傳到 Groq 轉錄及 D1 校正摘要讀回。
- ChatGPT／Claude 可新增並授權的遠端 MCP OAuth。
- 對話結束後隔天自主喚醒、完整備份／還原／資源刪除驗收。
- 所有舊版短檔路徑與 prepared 額度統一、超過單工作容量時自動分成多工作。
- 224-token prompt 精確計數；目前200字元限制不能替代 token 上限。
